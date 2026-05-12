"""
dependencies.py — Dependências de contexto de tenant.

Uso nas rotas:
    @router.get("/clients")
    async def list_clients(ctx: ModuleContext = Depends(require_module("atendimento"))):
        return await ClientService.list(ctx.db)
"""
from dataclasses import dataclass
from datetime import datetime
from typing import AsyncGenerator

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.core.database import AsyncSessionLocal
from app.core.security import require_authenticated
from app.modules.super_admin.models import User, Tenant, TenantModule, Module, UserRole, RolePermission
from sqlalchemy import select as _select


@dataclass
class ModuleContext:
    db: AsyncSession
    user: User
    schema: str


def require_permission(code: str):
    """
    Dependency: garante que o usuário tem a permission `code`.
    - super_admin → sempre passa
    - company_admin → sempre passa (dentro do escopo do tenant)
    - company_user → precisa de role com a permission

    Use em conjunto com require_module quando a rota é de um módulo específico.
    """
    async def dependency(
        current_user: User = Depends(require_authenticated),
    ) -> User:
        if current_user.role in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN):
            return current_user
        if not current_user.role_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuário sem função atribuída.",
            )
        async with AsyncSessionLocal() as db:
            await db.execute(text("SET search_path TO public"))
            result = await db.execute(
                _select(RolePermission).where(
                    RolePermission.role_id == current_user.role_id,
                    RolePermission.permission_code == code,
                )
            )
            if not result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Sua função não tem a permissão '{code}'.",
                )
        return current_user

    return dependency


def require_module(module_slug: str):
    """
    Factory que retorna uma dependency FastAPI.
    Valida que:
      - o slug está cadastrado e ativo na tabela `modules` (registry global);
      - o usuário pertence a um tenant ativo;
      - o módulo está habilitado para esse tenant.
    Retorna um ModuleContext com sessão já apontando para o schema do tenant.
    """
    async def dependency(
        current_user: User = Depends(require_authenticated),
    ) -> AsyncGenerator[ModuleContext, None]:
        if not current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuário não pertence a nenhum tenant.",
            )

        async with AsyncSessionLocal() as db:
            await db.execute(text("SET search_path TO public"))

            # Valida módulo registrado e ativo no registry global
            registry_result = await db.execute(
                select(Module).where(
                    Module.slug == module_slug,
                    Module.is_active == True,
                )
            )
            if not registry_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Módulo '{module_slug}' não está cadastrado na plataforma.",
                )

            # Valida tenant ativo
            tenant_result = await db.execute(
                select(Tenant).where(
                    Tenant.id == current_user.tenant_id,
                    Tenant.is_active == True,
                )
            )
            tenant = tenant_result.scalar_one_or_none()
            if not tenant:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Tenant inativo ou não encontrado.",
                )

            # Verifica expiração do plano
            if tenant.plan_expires_at and tenant.plan_expires_at < datetime.utcnow():
                raise HTTPException(
                    status_code=402,
                    detail="Plano expirado. Renove sua assinatura.",
                )

            # Valida módulo ativo no tenant
            module_result = await db.execute(
                select(TenantModule).where(
                    TenantModule.tenant_id == tenant.id,
                    TenantModule.module_slug == module_slug,
                    TenantModule.is_active == True,
                )
            )
            if not module_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Módulo '{module_slug}' não está ativo para este tenant.",
                )

            # Aponta sessão para o schema do tenant
            await db.execute(text(f"SET search_path TO {tenant.schema_name}, public"))
            try:
                yield ModuleContext(db=db, user=current_user, schema=tenant.schema_name)
            except Exception:
                # Garante rollback em caso de erro — evita "aborted transaction" na pool
                await db.rollback()
                raise
            finally:
                try:
                    await db.execute(text("SET search_path TO public"))
                except Exception:  # noqa: BLE001
                    pass

    return dependency
