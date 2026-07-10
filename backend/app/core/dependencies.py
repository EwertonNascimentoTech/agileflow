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

        from app.core.cache import cache_get, cache_set, perm_key
        from app.core.config import settings

        allowed = None
        if settings.AUTH_CACHE_TTL > 0:
            allowed = await cache_get(perm_key(current_user.role_id, code))

        if allowed is None:
            async with AsyncSessionLocal() as db:
                await db.execute(text("SET search_path TO public"))
                result = await db.execute(
                    _select(RolePermission).where(
                        RolePermission.role_id == current_user.role_id,
                        RolePermission.permission_code == code,
                    )
                )
                allowed = result.scalar_one_or_none() is not None
            if settings.AUTH_CACHE_TTL > 0:
                await cache_set(perm_key(current_user.role_id, code), allowed, settings.AUTH_CACHE_TTL)

        if not allowed:
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

        from app.core.cache import cache_get, cache_set, modctx_key
        from app.core.config import settings

        # Fatos de validação (near-static) — cacheados por (tenant, módulo).
        # Em cache-hit, os 3 SELECTs abaixo viram 0 round-trips ao Postgres.
        facts = None
        if settings.AUTH_CACHE_TTL > 0:
            facts = await cache_get(modctx_key(current_user.tenant_id, module_slug))

        if facts is None:
            async with AsyncSessionLocal() as probe:
                await probe.execute(text("SET search_path TO public"))
                registry_row = (await probe.execute(
                    select(Module.id).where(
                        Module.slug == module_slug,
                        Module.is_active == True,
                    )
                )).first()
                tenant_row = (await probe.execute(
                    select(Tenant.schema_name, Tenant.plan_expires_at, Tenant.is_active).where(
                        Tenant.id == current_user.tenant_id,
                    )
                )).first()
                tmod_row = (await probe.execute(
                    select(TenantModule.id).where(
                        TenantModule.tenant_id == current_user.tenant_id,
                        TenantModule.module_slug == module_slug,
                        TenantModule.is_active == True,
                    )
                )).first()
            facts = {
                "registry_active": registry_row is not None,
                "tenant_active": bool(tenant_row and tenant_row.is_active),
                "schema_name": tenant_row.schema_name if tenant_row else None,
                "plan_expires_at": (
                    tenant_row.plan_expires_at.isoformat()
                    if tenant_row and tenant_row.plan_expires_at else None
                ),
                "tmod_active": tmod_row is not None,
            }
            if settings.AUTH_CACHE_TTL > 0:
                await cache_set(modctx_key(current_user.tenant_id, module_slug), facts, settings.AUTH_CACHE_TTL)

        # Avaliação dos fatos (mesma ordem/mensagens do comportamento original)
        if not facts["registry_active"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Módulo '{module_slug}' não está cadastrado na plataforma.",
            )
        if not facts["tenant_active"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant inativo ou não encontrado.",
            )
        if facts["plan_expires_at"] and datetime.fromisoformat(facts["plan_expires_at"]) < datetime.utcnow():
            raise HTTPException(
                status_code=402,
                detail="Plano expirado. Renove sua assinatura.",
            )
        if not facts["tmod_active"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Módulo '{module_slug}' não está ativo para este tenant.",
            )

        schema_name = facts["schema_name"]

        # Abre a sessão da request e aponta para o schema do tenant
        async with AsyncSessionLocal() as db:
            schema_path = f"{schema_name}, public"
            await db.execute(text(f"SET search_path TO {schema_path}"))

            # Hook: re-aplica search_path no começo de toda nova transação dentro
            # dessa sessão. Necessário porque asyncpg + statement_cache_size=0
            # perde o SET entre COMMIT e o próximo BEGIN implícito (ex: db.refresh
            # após db.commit), resultando em "relation does not exist".
            from sqlalchemy import event as _sa_event

            sync_session = db.sync_session

            def _reapply_search_path(session, transaction, connection):
                connection.exec_driver_sql(f"SET search_path TO {schema_path}")

            _sa_event.listen(sync_session, "after_begin", _reapply_search_path)
            try:
                yield ModuleContext(db=db, user=current_user, schema=schema_name)
            except Exception:
                # Garante rollback em caso de erro — evita "aborted transaction" na pool
                await db.rollback()
                raise
            finally:
                try:
                    _sa_event.remove(sync_session, "after_begin", _reapply_search_path)
                except Exception:  # noqa: BLE001
                    pass
                try:
                    await db.execute(text("SET search_path TO public"))
                except Exception:  # noqa: BLE001
                    pass

    return dependency
