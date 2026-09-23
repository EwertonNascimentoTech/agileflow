"""Cria o usuário [E2E] usado pelo teste de tela (senha forte aleatória) e imprime JSON."""
import asyncio, json, secrets
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.modules.super_admin.models import Tenant, User, UserRole

EMAIL = "e2e.sso.ui@e2e-agileflow.com.br"


async def main():
    pwd = "E2e!" + secrets.token_urlsafe(12) + "9a"
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        tenant = (await db.execute(select(Tenant).where(Tenant.schema_name == "tenant_ss"))).scalar_one()
        u = User(tenant_id=tenant.id, email=EMAIL, hashed_password=get_password_hash(pwd), full_name="[E2E] SSO Tela",
                 role=UserRole.COMPANY_USER, is_active=True)
        db.add(u)
        await db.commit()
        print(json.dumps({"id": str(u.id), "email": EMAIL, "password": pwd}))

asyncio.run(main())
