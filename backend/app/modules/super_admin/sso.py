"""SSO IDigital (OIDC): valida o id_token que o navegador obteve no IdP e acha/vincula o usuário.

O IdP só aceita client público (PKCE, sem client_secret) e não emite refresh_token, então o
token do IDigital serve uma vez, como prova de identidade: daqui sai a sessão AgileFlow de
sempre (mesmos tokens do login por senha).

1º login SSO de quem ainda não tem login no AgileFlow:
- está em Pessoas (TeamOps) → ganha o login de colaborador com a role do cargo (como no 1º acesso);
- não está → vira cliente do Portal (Operação Assistida) sem projetos; o PO vincula depois.
Do IDigital só vêm nome e e-mail (o IdP não tem telefone/organização); o CPF (`document`) não é pedido.
"""
import hashlib
import logging
import secrets
import time
import uuid
from datetime import datetime
from typing import Any, Optional

import httpx
from fastapi import HTTPException
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError, JWTError
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_redis
from app.core.config import settings
from app.core.security import get_password_hash
from app.modules.super_admin.models import Tenant, User, UserRole, UserSsoIdentity
from app.modules.super_admin.service import AuditService, UserService

logger = logging.getLogger(__name__)

PROVIDER = "idigital"
_METADATA_TTL = 3600  # discovery e JWKS: 1h (chave nova força a recarga antes)
_JWKS_MIN_REFRESH = 60  # kid desconhecido recarrega o JWKS no máximo 1x/min

# Cache por processo (cada worker uvicorn tem o seu).
_metadata: dict[str, Any] = {}
_jwks: dict[str, Any] = {}


def _invalid(detail: str = "Não foi possível validar o login do IDigital. Entre de novo.") -> HTTPException:
    return HTTPException(status_code=401, detail=detail)


def _random_password() -> str:
    """Senha que ninguém conhece (quem nasce pelo SSO entra pelo IDigital); passa na regra de força."""
    return secrets.token_urlsafe(24) + "Aa1!"


def _display_name(claims: dict, email: str) -> str:
    """Nome do IDigital: name → displayName → nome + sobrenome → apelido → parte local do e-mail."""
    def val(key: str) -> str:
        return str(claims.get(key) or "").strip()

    for key in ("name", "displayName"):
        if val(key):
            return val(key)[:200]
    for first, last in (("given_name", "family_name"), ("firstName", "lastName")):
        full = " ".join(v for v in (val(first), val(last)) if v)
        if full:
            return full[:200]
    for key in ("preferred_username", "nickname"):
        if val(key) and "@" not in val(key):
            return val(key)[:200]
    return email.split("@")[0][:200]


class SsoService:

    @staticmethod
    def enabled() -> bool:
        return bool(settings.SSO_ENABLED and settings.SSO_CLIENT_ID and settings.SSO_AUTHORITY)

    @staticmethod
    def public_config() -> dict:
        """O que a tela de login precisa para iniciar o fluxo (nada secreto: o client é público)."""
        if not SsoService.enabled():
            return {"enabled": False}
        return {
            "enabled": True,
            "provider": PROVIDER,
            "authority": settings.SSO_AUTHORITY.rstrip("/"),
            "client_id": settings.SSO_CLIENT_ID,
            "resource": settings.SSO_RESOURCE or None,
            "scope": settings.SSO_SCOPE,
        }

    # ── IdP: discovery e chaves ──────────────────────────────────────────────
    @staticmethod
    async def _get_json(url: str, headers: Optional[dict] = None) -> dict:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    async def metadata() -> dict:
        now = time.time()
        if _metadata.get("data") and now - _metadata["at"] < _METADATA_TTL:
            return _metadata["data"]
        url = settings.SSO_AUTHORITY.rstrip("/") + "/.well-known/openid-configuration"
        try:
            data = await SsoService._get_json(url)
        except Exception as exc:  # noqa: BLE001
            logger.warning("SSO: discovery indisponível (%s)", exc)
            if _metadata.get("data"):
                return _metadata["data"]
            raise HTTPException(status_code=503, detail="Não foi possível falar com o IDigital. Tente de novo em instantes.")
        if not data.get("issuer") or not data.get("jwks_uri"):
            raise HTTPException(status_code=503, detail="Configuração do IDigital incompleta (issuer/jwks).")
        _metadata.update(data=data, at=now)
        return data

    @staticmethod
    async def signing_key(kid: Optional[str]) -> dict:
        now = time.time()
        keys: dict[str, dict] = _jwks.get("keys") or {}
        fetched_at = _jwks.get("at", 0)
        missing = (kid not in keys) if kid else not keys
        if (missing and now - fetched_at > _JWKS_MIN_REFRESH) or now - fetched_at > _METADATA_TTL:
            meta = await SsoService.metadata()
            try:
                data = await SsoService._get_json(meta["jwks_uri"])
                keys = {k.get("kid") or f"_{i}": k for i, k in enumerate(data.get("keys", [])) if k.get("kty") == "RSA"}
                _jwks.update(keys=keys, at=now)
            except Exception as exc:  # noqa: BLE001
                logger.warning("SSO: JWKS indisponível (%s)", exc)
                if not keys:
                    raise HTTPException(status_code=503, detail="Não foi possível falar com o IDigital. Tente de novo em instantes.")
        if kid:
            key = keys.get(kid)
        else:
            key = next(iter(keys.values())) if len(keys) == 1 else None
        if key is None:
            raise _invalid()
        return key

    # ── Validação do token ───────────────────────────────────────────────────
    @staticmethod
    async def verify_id_token(id_token: str, access_token: Optional[str]) -> dict:
        try:
            header = jwt.get_unverified_header(id_token)
        except JWTError:
            raise _invalid()
        if header.get("alg") != "RS256":
            raise _invalid()
        meta = await SsoService.metadata()
        key = await SsoService.signing_key(header.get("kid"))
        try:
            # access_token: confere o at_hash (amarra os dois tokens da mesma resposta do IdP).
            claims = jwt.decode(
                id_token,
                key,
                algorithms=["RS256"],
                audience=settings.SSO_CLIENT_ID,
                issuer=meta["issuer"],
                access_token=access_token or None,
                options={"leeway": 60},
            )
        except ExpiredSignatureError:
            raise _invalid("O login do IDigital expirou. Entre de novo.")
        except (JWTClaimsError, JWTError) as exc:
            logger.info("SSO: id_token recusado (%s)", exc)
            raise _invalid()
        if not claims.get("sub"):
            raise _invalid()
        iat = claims.get("iat")
        if not isinstance(iat, (int, float)) or time.time() - iat > settings.SSO_MAX_TOKEN_AGE:
            raise _invalid("O login do IDigital expirou. Entre de novo.")
        return claims

    @staticmethod
    async def _mark_used(id_token: str, exp: Any) -> None:
        """Cada id_token vale uma troca (evita reaproveitar um token vazado). Redis fora: segue (fail-open)."""
        key = "sso:idtoken:" + hashlib.sha256(id_token.encode()).hexdigest()
        ttl = max(60, int(float(exp) - time.time()) + 120) if isinstance(exp, (int, float)) else 3600
        try:
            fresh = await get_redis().set(key, "1", nx=True, ex=ttl)
        except Exception as exc:  # noqa: BLE001
            logger.warning("SSO: Redis indisponível para o controle de reuso (%s)", exc)
            return
        if not fresh:
            raise _invalid("Este login do IDigital já foi usado. Entre de novo.")

    @staticmethod
    async def _email(claims: dict, access_token: Optional[str]) -> str:
        email = str(claims.get("email") or "").strip()
        if not email and access_token:
            # Alguns IdPs só põem o e-mail no userinfo.
            meta = await SsoService.metadata()
            if meta.get("userinfo_endpoint"):
                try:
                    info = await SsoService._get_json(meta["userinfo_endpoint"], {"Authorization": f"Bearer {access_token}"})
                    if str(info.get("sub")) == str(claims["sub"]):
                        email = str(info.get("email") or "").strip()
                except Exception as exc:  # noqa: BLE001
                    logger.info("SSO: userinfo sem e-mail (%s)", exc)
        if not email or "@" not in email:
            raise _invalid("O IDigital não informou o seu e-mail. Fale com o administrador.")
        return email.lower()

    # ── Troca: token do IDigital → usuário do AgileFlow ──────────────────────
    @staticmethod
    async def exchange(
        db: AsyncSession, id_token: str, access_token: Optional[str], ip: Optional[str] = None
    ) -> User:
        if not SsoService.enabled():
            raise HTTPException(status_code=404, detail="Login pelo IDigital não está habilitado.")
        claims = await SsoService.verify_id_token(id_token, access_token)
        await SsoService._mark_used(id_token, claims.get("exp"))
        email = await SsoService._email(claims, access_token)
        sub = str(claims["sub"])

        ident = (await db.execute(
            select(UserSsoIdentity).where(UserSsoIdentity.provider == PROVIDER, UserSsoIdentity.subject == sub)
        )).scalar_one_or_none()
        linked_now = False
        provisioned: Optional[str] = None
        if ident is not None:
            user = await db.get(User, ident.user_id)
        else:
            # 1º login: vincula pelo e-mail; sem login ainda, nasce colaborador (Pessoas) ou cliente.
            user = (await db.execute(select(User).where(func.lower(User.email) == email))).scalar_one_or_none()
            if user is None:
                user, provisioned = await SsoService._provision(db, email, claims, ip)
            other = (await db.execute(
                select(UserSsoIdentity).where(UserSsoIdentity.user_id == user.id, UserSsoIdentity.provider == PROVIDER)
            )).scalar_one_or_none()
            if other is not None:
                raise HTTPException(
                    status_code=409,
                    detail="Este usuário já está vinculado a outra conta IDigital. Fale com o administrador.",
                )
        if user is None or not user.is_active:
            raise HTTPException(status_code=403, detail="Usuário inativo.")
        if ident is None:
            ident = UserSsoIdentity(user_id=user.id, provider=PROVIDER, subject=sub)
            db.add(ident)
            linked_now = True

        now = datetime.utcnow()
        ident.email = email
        ident.last_login_at = now
        user.last_login = now
        await db.commit()
        await AuditService.log(
            db, "sso_login", "user", user_id=user.id, tenant_id=user.tenant_id, entity_id=user.id,
            details={"provider": PROVIDER, "linked_now": linked_now, "provisioned": provisioned}, ip=ip,
        )
        return user

    # ── 1º login sem cadastro: colaborador (Pessoas) ou cliente (Portal) ─────
    @staticmethod
    async def _provision(db: AsyncSession, email: str, claims: dict, ip: Optional[str]) -> tuple[User, str]:
        match = await UserService._find_person_by_email(db, email)
        if match is not None:
            tenant, person = match
            if person.get("status") != "ativo":
                raise HTTPException(
                    status_code=403,
                    detail="Seu cadastro em Pessoas não está ativo. Fale com o administrador da sua empresa.",
                )
            if person.get("user_id"):
                linked = await db.get(User, uuid.UUID(str(person["user_id"])))
                if linked is not None:
                    return linked, "colaborador"
            return await SsoService._provision_collaborator(db, tenant, uuid.UUID(str(person["id"]))), "colaborador"

        tenant = (await db.execute(
            select(Tenant).where(Tenant.slug == settings.SSO_CLIENT_TENANT, Tenant.is_active.is_(True))
        )).scalar_one_or_none()
        if tenant is None:
            await AuditService.log(
                db, "sso_login_denied", "user", details={"provider": PROVIDER, "reason": "sem_tenant_cliente", "email": email}, ip=ip,
            )
            raise HTTPException(
                status_code=403,
                detail=f"O e-mail {email} não tem acesso ao AgileFlow. Peça ao administrador para cadastrá-lo.",
            )
        return await SsoService._provision_client(db, tenant, email, claims), "cliente"

    @staticmethod
    async def _provision_collaborator(db: AsyncSession, tenant: Tenant, person_id: uuid.UUID) -> User:
        """Login de colaborador para quem está em Pessoas e nunca entrou (mesma regra do 1º acesso: role do cargo)."""
        from app.modules.teamops.models import Person
        from app.modules.teamops.service import PersonService

        await db.execute(text(f'SET search_path TO "{tenant.schema_name}", public'))
        try:
            person = await db.get(Person, person_id)
            if person is None:
                raise _invalid()
            await PersonService._provision_user(db, person, "com_acesso", _random_password(), None, tenant.id)
            await db.flush()  # grava team_persons.user_id antes de voltar ao search_path public
            user = await db.get(User, person.user_id)
        finally:
            await db.execute(text("SET search_path TO public"))
        if user is None:
            raise HTTPException(status_code=500, detail="Não foi possível criar o acesso.")
        return user

    @staticmethod
    async def _provision_client(db: AsyncSession, tenant: Tenant, email: str, claims: dict) -> User:
        """Cliente do Portal (Operação Assistida) sem projetos: o PO vincula na tela Clientes.
        Do IDigital vêm só nome e e-mail; telefone, organização e departamento o PO completa."""
        from app.modules.projetos.clients import ProjectClientService
        from app.modules.projetos.models import ProjectClient

        name = _display_name(claims, email)
        await db.execute(text(f'SET search_path TO "{tenant.schema_name}", public'))
        try:
            role = await ProjectClientService._get_or_create_client_role(db, tenant.id)
            user = User(
                email=email,
                full_name=name,
                hashed_password=get_password_hash(_random_password()),
                role=UserRole.COMPANY_USER,
                role_id=role.id,
                tenant_id=tenant.id,
                is_active=True,
            )
            db.add(user)
            await db.flush()
            client = (await db.execute(
                select(ProjectClient).where(func.lower(ProjectClient.email) == email)
            )).scalar_one_or_none()
            if client is None:
                db.add(ProjectClient(
                    user_id=user.id,
                    full_name=name,
                    email=email,
                    notes=(
                        f"Cadastro criado no 1º login pelo IDigital em {datetime.utcnow():%d/%m/%Y}. "
                        "Vincule os projetos em Clientes."
                    ),
                ))
            else:
                client.user_id = user.id
            await db.flush()  # grava project_clients antes de voltar ao search_path public
        finally:
            await db.execute(text("SET search_path TO public"))
        return user
