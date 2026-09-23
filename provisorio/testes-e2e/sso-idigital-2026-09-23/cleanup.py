"""Remove o que os testes do SSO criam (usuário [E2E] de tela, vínculos, auditoria)."""
import asyncio, json
from sqlalchemy import text
from app.core.database import AsyncSessionLocal


async def main():
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        ids = [r[0] for r in (await db.execute(text("SELECT id FROM users WHERE email LIKE 'e2e.sso%@e2e-agileflow.com.br'"))).all()]
        out = {"users": len(ids)}
        if ids:
            out["audit"] = (await db.execute(text("DELETE FROM audit_logs WHERE user_id = ANY(:ids)"), {"ids": ids})).rowcount
            out["identities"] = (await db.execute(text("DELETE FROM user_sso_identities WHERE user_id = ANY(:ids)"), {"ids": ids})).rowcount
            await db.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": ids})
        out["audit_denied"] = (await db.execute(text(
            "DELETE FROM audit_logs WHERE action = 'sso_login_denied' AND details->>'email' LIKE '%@e2e-agileflow.com.br'"))).rowcount
        await db.commit()
        print(json.dumps(out))

asyncio.run(main())
