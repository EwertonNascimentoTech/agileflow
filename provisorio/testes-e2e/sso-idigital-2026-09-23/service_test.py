"""Testes da troca SSO (id_token IDigital → sessão AgileFlow) com IdP falso, dentro do saas_api.
Tudo numa transação desfeita no fim (commit vira flush); chaves de reuso no Redis são apagadas."""
import asyncio
import time
import uuid

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from jose import jwk, jwt
from sqlalchemy import select, text

from app.core.cache import get_redis
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.super_admin import sso as sso_mod
from app.core.dependencies import is_client_only
from app.modules.super_admin.models import AuditLog, Tenant, User, UserRole, UserSsoIdentity
from app.modules.super_admin.sso import SsoService
from app.modules.teamops.models import Person, PersonStatus

ISS = "https://idp.e2e.invalid"
CLIENT = "agileflow-e2e"
KID = "e2e-kid"
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(f"[{'OK' if cond else 'FALHA'}] {name}" + (f" — {detail}" if detail and not cond else ""))


def pem(key):
    return key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()


KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PUB = jwk.construct(pem(KEY), "RS256").public_key().to_dict()
PUB["kid"] = KID


def token(sub, email="e2e.sso@e2e-agileflow.com.br", aud=CLIENT, iss=ISS, iat=None, exp=None, key=KEY,
          alg="RS256", at="at-" + uuid.uuid4().hex, kid=KID, **extra):
    now = int(time.time())
    claims = {"iss": iss, "aud": aud, "sub": sub, "iat": iat if iat is not None else now,
              "exp": exp if exp is not None else now + 3600, "nonce": uuid.uuid4().hex, **extra}
    if email is not None:
        claims["email"] = email
    k = pem(key) if alg == "RS256" else "segredo-hs256"
    return jwt.encode(claims, k, algorithm=alg, headers={"kid": kid}, access_token=at), at


async def expect(coro, status, contains=""):
    try:
        await coro
    except HTTPException as e:
        return e.status_code == status and contains in str(e.detail), f"{e.status_code} {e.detail}"
    return False, "não recusou"


async def main():
    settings.SSO_ENABLED = True
    settings.SSO_CLIENT_ID = CLIENT
    sso_mod._metadata.update(data={"issuer": ISS, "jwks_uri": ISS + "/jwks"}, at=time.time())
    sso_mod._jwks.update(keys={KID: PUB}, at=time.time())
    used = []
    orig_mark = SsoService._mark_used

    async def mark(id_token, exp):
        used.append(id_token)
        await orig_mark(id_token, exp)
    SsoService._mark_used = staticmethod(mark)

    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        db.commit = db.flush  # nada persiste
        tenant = (await db.execute(select(Tenant).where(Tenant.schema_name == "tenant_ss"))).scalar_one()
        u1 = User(tenant_id=tenant.id, email="e2e.sso@e2e-agileflow.com.br", hashed_password="x",
                  full_name="[E2E] SSO", role=UserRole.COMPANY_USER, is_active=True)
        u2 = User(tenant_id=tenant.id, email="e2e.sso.inativo@e2e-agileflow.com.br", hashed_password="x",
                  full_name="[E2E] SSO inativo", role=UserRole.COMPANY_USER, is_active=False)
        db.add_all([u1, u2])
        await db.flush()
        try:
            sub1 = "sub-" + uuid.uuid4().hex
            t, at = token(sub1, email="E2E.SSO@e2e-agileflow.com.br")
            user = await SsoService.exchange(db, t, at, ip="127.0.0.1")
            ident = (await db.execute(select(UserSsoIdentity).where(UserSsoIdentity.subject == sub1))).scalar_one_or_none()
            check("1º login vincula pelo e-mail (sem diferenciar maiúsculas)", user.id == u1.id and ident is not None and ident.user_id == u1.id)
            check("último acesso registrado no usuário e no vínculo", user.last_login is not None and ident.last_login_at is not None)
            aud = (await db.execute(select(AuditLog).where(AuditLog.user_id == u1.id, AuditLog.action == "sso_login"))).scalars().all()
            check("login SSO vai para a auditoria (linked_now)", len(aud) == 1 and aud[0].details.get("linked_now") is True)

            ok, d = await expect(SsoService.exchange(db, t, at), 401, "já foi usado")
            check("o mesmo id_token não serve duas vezes", ok, d)

            t2, at2 = token(sub1, email="outro.email@fiea.invalid")
            user = await SsoService.exchange(db, t2, at2)
            check("logins seguintes casam pelo sub (e-mail no IdP pode mudar)", user.id == u1.id and ident.email == "outro.email@fiea.invalid")

            # Sem login e sem Pessoa: vira cliente do Portal (sem projetos), nome vindo do IDigital.
            subc = "sub-" + uuid.uuid4().hex
            t, at = token(subc, email="e2e.sso.cliente@e2e-agileflow.com.br", given_name="Maria", family_name="Cliente E2E")
            cu = await SsoService.exchange(db, t, at)
            await db.execute(text("SET search_path TO tenant_ss, public"))
            crow = (await db.execute(text(
                "SELECT id, user_id, full_name, notes, (SELECT count(*) FROM project_client_access a WHERE a.client_id = c.id) AS n "
                "FROM project_clients c WHERE lower(email) = 'e2e.sso.cliente@e2e-agileflow.com.br'"))).mappings().first()
            await db.execute(text("SET search_path TO public"))
            check("sem cadastro em Pessoas: vira cliente (project_clients + login do Portal)",
                  crow is not None and crow["user_id"] == cu.id and await is_client_only(cu), f"{crow}")
            check("cliente nasce com nome do IDigital (nome + sobrenome) e sem projetos",
                  crow is not None and crow["full_name"] == "Maria Cliente E2E" and cu.full_name == "Maria Cliente E2E" and crow["n"] == 0, f"{crow}")
            check("cadastro do cliente diz que veio do IDigital", crow is not None and "IDigital" in (crow["notes"] or ""))
            aud = (await db.execute(select(AuditLog).where(AuditLog.user_id == cu.id, AuditLog.action == "sso_login"))).scalars().all()
            check("auditoria registra provisioned=cliente", len(aud) == 1 and aud[0].details.get("provisioned") == "cliente", f"{[a.details for a in aud]}")
            t, at = token(subc, email="e2e.sso.cliente@e2e-agileflow.com.br")
            again = await SsoService.exchange(db, t, at)
            n_users = (await db.execute(text("SELECT count(*) FROM public.users WHERE lower(email) = 'e2e.sso.cliente@e2e-agileflow.com.br'"))).scalar()
            check("2º login do cliente casa pelo sub (não duplica)", again.id == cu.id and n_users == 1)

            # Está em Pessoas e nunca entrou: vira colaborador com a role do cargo (não cliente).
            await db.execute(text("SET search_path TO tenant_ss, public"))
            pos_id = (await db.execute(text("SELECT id FROM team_positions ORDER BY name LIMIT 1"))).scalar()
            pessoa = Person(full_name="[E2E] Pessoa SSO", email="e2e.sso.pessoa@e2e-agileflow.com.br", position_id=pos_id)
            desligada = Person(full_name="[E2E] Pessoa desligada", email="e2e.sso.desligada@e2e-agileflow.com.br",
                               position_id=pos_id, status=PersonStatus.DESLIGADO)
            db.add_all([pessoa, desligada])
            await db.flush()
            await db.execute(text("SET search_path TO public"))
            t, at = token("sub-" + uuid.uuid4().hex, email="e2e.sso.pessoa@e2e-agileflow.com.br", name="Pessoa do IDigital")
            pu = await SsoService.exchange(db, t, at)
            await db.execute(text("SET search_path TO tenant_ss, public"))
            prow = (await db.execute(text("SELECT user_id FROM team_persons WHERE id = :i"), {"i": pessoa.id})).scalar()
            role_pos = (await db.execute(text("SELECT role_id FROM team_positions WHERE id = :i"), {"i": pos_id})).scalar()
            ncli = (await db.execute(text("SELECT count(*) FROM project_clients WHERE lower(email) = 'e2e.sso.pessoa@e2e-agileflow.com.br'"))).scalar()
            await db.execute(text("SET search_path TO public"))
            check("está em Pessoas: vira colaborador ligado à Pessoa (não cliente)",
                  prow == pu.id and not await is_client_only(pu) and ncli == 0, f"{prow} {pu.id} {ncli}")
            check("colaborador ganha a role do cargo e o nome de Pessoas", pu.role_id is not None and pu.role_id == role_pos and pu.full_name == "[E2E] Pessoa SSO", f"{pu.role_id} {role_pos} {pu.full_name}")
            aud = (await db.execute(select(AuditLog).where(AuditLog.user_id == pu.id, AuditLog.action == "sso_login"))).scalars().all()
            check("auditoria registra provisioned=colaborador", len(aud) == 1 and aud[0].details.get("provisioned") == "colaborador")

            t, at = token("sub-" + uuid.uuid4().hex, email="e2e.sso.desligada@e2e-agileflow.com.br")
            ok, d = await expect(SsoService.exchange(db, t, at), 403, "Pessoas não está ativo")
            nu = (await db.execute(text("SELECT count(*) FROM public.users WHERE lower(email) = 'e2e.sso.desligada@e2e-agileflow.com.br'"))).scalar()
            await db.execute(text("SET search_path TO tenant_ss, public"))
            nc = (await db.execute(text("SELECT count(*) FROM project_clients WHERE lower(email) = 'e2e.sso.desligada@e2e-agileflow.com.br'"))).scalar()
            await db.execute(text("SET search_path TO public"))
            check("Pessoa desligada: recusada e não vira cliente", ok and nu == 0 and nc == 0, f"{d} {nu} {nc}")

            settings.SSO_CLIENT_TENANT = "tenant-que-nao-existe"
            t, at = token("sub-" + uuid.uuid4().hex, email="ninguem@e2e-agileflow.com.br")
            ok, d = await expect(SsoService.exchange(db, t, at), 403, "não tem acesso ao AgileFlow")
            settings.SSO_CLIENT_TENANT = "ss"
            den = (await db.execute(select(AuditLog).where(AuditLog.action == "sso_login_denied"))).scalars().all()
            check("sem tenant de clientes configurado: recusa auditada", ok and any(a.details.get("email") == "ninguem@e2e-agileflow.com.br" for a in den), d)

            t, at = token("sub-" + uuid.uuid4().hex, email="e2e.sso@e2e-agileflow.com.br")
            ok, d = await expect(SsoService.exchange(db, t, at), 409, "outra conta IDigital")
            check("usuário já vinculado a outra conta IDigital: 409", ok, d)

            t, at = token("sub-" + uuid.uuid4().hex, email="e2e.sso.inativo@e2e-agileflow.com.br")
            ok, d = await expect(SsoService.exchange(db, t, at), 403, "inativo")
            check("usuário inativo não entra", ok, d)
            n = (await db.execute(select(UserSsoIdentity).where(UserSsoIdentity.user_id == u2.id))).scalars().all()
            check("usuário inativo não ganha vínculo", len(n) == 0)

            cases = [
                ("audience de outro client", dict(aud="outro-client"), 401, ""),
                ("issuer diferente", dict(iss="https://idp.falso.invalid"), 401, ""),
                ("assinatura com outra chave", dict(key=OTHER), 401, ""),
                ("algoritmo HS256", dict(alg="HS256"), 401, ""),
                ("token expirado", dict(iat=int(time.time()) - 7200, exp=int(time.time()) - 3600), 401, "expirou"),
                ("id_token emitido há mais de 10 min", dict(iat=int(time.time()) - 900), 401, "expirou"),
                ("kid desconhecido", dict(kid="kid-que-nao-existe"), 401, ""),
                ("sem e-mail no token (e sem userinfo)", dict(email=None), 401, "e-mail"),
            ]
            for nome, kw, st, txt in cases:
                t, at = token("sub-" + uuid.uuid4().hex, **kw)
                ok, d = await expect(SsoService.exchange(db, t, at), st, txt)
                check(f"recusa: {nome}", ok, d)

            t, at = token("sub-" + uuid.uuid4().hex)
            ok, d = await expect(SsoService.exchange(db, t, "outro-access-token"), 401)
            check("recusa: access_token que não bate com o at_hash", ok, d)
            t, at = token("sub-" + uuid.uuid4().hex)
            ok, d = await expect(SsoService.exchange(db, t, None), 401)
            check("recusa: at_hash sem o access_token", ok, d)

            ok, d = await expect(SsoService.exchange(db, "abc.def.ghi-nao-e-jwt", None), 401)
            check("recusa: lixo no lugar do token", ok, d)

            settings.SSO_ENABLED = False
            t, at = token(sub1)
            ok, d = await expect(SsoService.exchange(db, t, at), 404)
            check("SSO desligado: troca responde 404", ok, d)
            check("SSO desligado: config pública diz enabled=false", SsoService.public_config() == {"enabled": False})
            settings.SSO_ENABLED = True
            cfg = SsoService.public_config()
            check("SSO ligado: config pública só com dados do client público", cfg.get("enabled") and cfg.get("client_id") == CLIENT and "secret" not in str(cfg).lower())

            # Rota HTTP + sessão AgileFlow: /auth/sso/exchange → /auth/me com o token emitido.
            import httpx
            from app.core.database import get_db
            from app.main import app

            async def _db():
                yield db
            app.dependency_overrides[get_db] = _db
            try:
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
                    t, at = token(sub1)
                    r = await c.post("/api/v1/auth/sso/exchange", json={"id_token": t, "access_token": at})
                    body = r.json()
                    check("rota /auth/sso/exchange devolve a sessão AgileFlow (mesmo formato do /login)",
                          r.status_code == 200 and body.get("access_token") and body.get("refresh_token") and body["user"]["email"] == u1.email,
                          f"{r.status_code} {body}")
                    if r.status_code == 200:
                        # /auth/me abre sessão própria e não enxerga o usuário da transação de teste:
                        # confere o próprio token (emitido pelo mesmo create_tokens do /login).
                        from app.core.security import decode_token
                        p = decode_token(body["access_token"])
                        check("token emitido é do próprio usuário (sub, role, tenant)",
                              p.get("sub") == str(u1.id) and p.get("role") == "company_user" and p.get("tenant_id") == str(tenant.id), f"{p}")
                    r = await c.get("/api/v1/auth/sso/config")
                    check("rota /auth/sso/config é pública", r.status_code == 200 and r.json().get("enabled") is True)
                    r = await c.post("/api/v1/auth/sso/exchange", json={"id_token": t, "access_token": at})
                    check("rota recusa reuso com 401 e mensagem", r.status_code == 401 and "já foi usado" in r.json().get("detail", ""), f"{r.status_code}")
            finally:
                app.dependency_overrides.pop(get_db, None)
        finally:
            await db.rollback()
            r = get_redis()
            import hashlib
            for tkn in used:
                try:
                    await r.delete("sso:idtoken:" + hashlib.sha256(tkn.encode()).hexdigest())
                except Exception:
                    pass

    async with AsyncSessionLocal() as db:
        left = (await db.execute(text("SELECT count(*) FROM public.users WHERE email LIKE 'e2e.sso%'"))).scalar()
        # Só os vínculos de teste (com o SSO ligado, a tabela tem os vínculos reais dos colaboradores).
        left2 = (await db.execute(text(
            "SELECT count(*) FROM public.user_sso_identities WHERE email LIKE '%@e2e-agileflow.com.br' "
            "OR email = 'outro.email@fiea.invalid' OR subject LIKE 'sub-%'"))).scalar()
        check("nada ficou no banco (usuários e vínculos de teste)", left == 0 and left2 == 0, f"{left} {left2}")
    print(f"\n=== SSO backend: {sum(ok for _, ok in results)}/{len(results)} OK")


asyncio.run(main())
