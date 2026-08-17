"""
Rotas do Company Admin — escopos da empresa logada.
A maioria exige company_admin; leituras de diretório (ex.: lista de usuários do tenant)
também servem para company_user autenticado no mesmo tenant.
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, update, func

from app.core.database import get_db, get_tenant_db
from app.core.security import require_company_admin, get_current_user, require_authenticated
from app.modules.super_admin.models import User, UserRole, Tenant, TenantModule, Module
from app.modules.super_admin.schemas import (
    UserResponse, UserCreate, UserUpdate,
    RoleCreate, RoleUpdate, RoleResponse,
    ModulePermissionResponse,
)
from app.modules.super_admin.service import UserService, RoleService, PermissionService

router = APIRouter(prefix="/company/admin", tags=["Company Admin"])


# ─────────────────────────────────────────────
# PERFIL DA EMPRESA
# ─────────────────────────────────────────────

@router.get("/me/tenant")
async def get_my_tenant(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna dados do tenant do usuário logado."""
    if not current_user.tenant_id:
        return None
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        return None
    # Módulos ativos no tenant + cruzados com o registry global de módulos.
    # Só retorna módulos que estão ativos em AMBOS (tenant ativo AND registry ativo).
    tm_result = await db.execute(
        select(TenantModule).where(
            TenantModule.tenant_id == tenant.id,
            TenantModule.is_active == True,
        )
    )
    tenant_active_slugs = [m.module_slug for m in tm_result.scalars().all()]

    active_modules: list[dict] = []
    if tenant_active_slugs:
        reg_result = await db.execute(
            select(Module).where(
                Module.slug.in_(tenant_active_slugs),
                Module.is_active == True,
            )
        )
        for m in reg_result.scalars().all():
            active_modules.append({
                "slug": m.slug,
                "name": m.name,
                "description": m.description,
                "icon": m.icon,
                "color": m.color,
            })

    # Documentação é módulo de plataforma: sempre disponível a todos os tenants
    # autenticados (não depende de ativação no plano / tenant_modules).
    if not any(m["slug"] == "documentacao" for m in active_modules):
        doc_row = (
            await db.execute(
                select(Module).where(
                    Module.slug == "documentacao",
                    Module.is_active == True,
                )
            )
        ).scalar_one_or_none()
        if doc_row is not None:
            active_modules.append({
                "slug": doc_row.slug,
                "name": doc_row.name,
                "description": doc_row.description,
                "icon": doc_row.icon,
                "color": doc_row.color,
            })

    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "slug": tenant.slug,
        "is_active": tenant.is_active,
        "plan_expires_at": tenant.plan_expires_at,
        "active_modules": active_modules,
    }


# ─────────────────────────────────────────────
# USUÁRIOS DA EMPRESA
# ─────────────────────────────────────────────

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    search: Optional[str] = Query(None),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    """Lista usuários do mesmo tenant (para atribuição, filtros, etc.). Admin e usuário operacional."""
    if not current_user.tenant_id:
        if current_user.role == UserRole.SUPER_ADMIN:
            return []
        raise HTTPException(status_code=403, detail="Usuário sem empresa vinculada.")
    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER):
        raise HTTPException(status_code=403, detail="Acesso negado.")
    q = select(User).where(User.tenant_id == current_user.tenant_id)
    if active_only:
        q = q.where(User.is_active == True)
    if search:
        q = q.where(
            User.full_name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%")
        )
    result = await db.execute(q.order_by(User.full_name))
    return list(result.scalars().all())


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_company_admin),
):
    """Cria um usuário no tenant do admin logado. Respeita o limite max_users do plano."""
    from fastapi import HTTPException
    from sqlalchemy import func
    from app.modules.super_admin.models import Plan

    # Verifica limite de usuários do plano
    if current_user.tenant_id:
        tenant_result = await db.execute(
            select(Tenant).where(Tenant.id == current_user.tenant_id)
        )
        tenant = tenant_result.scalar_one_or_none()
        if tenant and tenant.plan_id:
            plan_result = await db.execute(
                select(Plan).where(Plan.id == tenant.plan_id)
            )
            plan = plan_result.scalar_one_or_none()
            if plan and plan.max_users > 0:
                count_result = await db.execute(
                    select(func.count(User.id)).where(
                        User.tenant_id == current_user.tenant_id,
                        User.is_active == True,
                    )
                )
                current_count = count_result.scalar() or 0
                if current_count >= plan.max_users:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Limite de {plan.max_users} usuários do plano atingido.",
                    )

    return await UserService.create_company_user(db, data, current_user.tenant_id)


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_company_admin),
):
    user = await UserService.get_user(db, user_id)
    if user.tenant_id != current_user.tenant_id:
        from fastapi import HTTPException
        raise HTTPException(403, "Acesso negado.")
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_company_admin),
):
    user = await UserService.get_user(db, user_id)
    if user.tenant_id != current_user.tenant_id:
        from fastapi import HTTPException
        raise HTTPException(403, "Acesso negado.")
    return await UserService.update_user(db, user_id, data)


# ─────────────────────────────────────────────
# PERMISSIONS / ROLES
# ─────────────────────────────────────────────

@router.get("/permissions", response_model=List[ModulePermissionResponse])
async def list_available_permissions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_company_admin),
):
    """Lista todas as permissions declaradas pelos módulos cadastrados."""
    return await PermissionService.list_all(db)


@router.get("/roles", response_model=List[RoleResponse])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_company_admin),
):
    return await RoleService.list_roles(db, current_user.tenant_id)


@router.post("/roles", response_model=RoleResponse, status_code=201)
async def create_role(
    data: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_company_admin),
):
    return await RoleService.create_role(db, current_user.tenant_id, data)


@router.get("/roles/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_company_admin),
):
    return await RoleService.get_role(db, current_user.tenant_id, role_id)


@router.patch("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: uuid.UUID,
    data: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_company_admin),
):
    return await RoleService.update_role(db, current_user.tenant_id, role_id, data)


@router.delete("/roles/{role_id}", status_code=204)
async def delete_role(
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_company_admin),
):
    await RoleService.delete_role(db, current_user.tenant_id, role_id)


# ─────────────────────────────────────────────
# NOTIFICAÇÕES IN-APP
# ─────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    body: Optional[str]
    entity_type: Optional[str]
    entity_id: Optional[uuid.UUID]
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


async def _get_tenant_schema(user: User) -> str:
    from app.modules.super_admin.models import Tenant
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as s:
        await s.execute(text("SET search_path TO public"))
        result = await s.execute(select(Tenant.schema_name).where(Tenant.id == user.tenant_id))
        schema = result.scalar_one_or_none()
    if not schema:
        raise Exception("Tenant schema not found")
    return schema


@router.get("/notifications", response_model=List[NotificationOut])
async def list_notifications(
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    current_user: User = Depends(require_authenticated),
):
    schema = await _get_tenant_schema(current_user)
    async with _tenant_session(schema) as tdb:
        q = text("""
            SELECT id, user_id, title, body, entity_type, entity_id, is_read, created_at
            FROM notifications
            WHERE user_id = :uid
            {unread_filter}
            ORDER BY created_at DESC
            LIMIT :lim
        """.format(unread_filter="AND is_read = FALSE" if unread_only else ""))
        result = await tdb.execute(q, {"uid": current_user.id, "lim": limit})
        rows = result.fetchall()
    return [
        NotificationOut(
            id=row[0], user_id=row[1], title=row[2], body=row[3],
            entity_type=row[4], entity_id=row[5], is_read=row[6], created_at=row[7],
        )
        for row in rows
    ]


@router.get("/notifications/unread-count")
async def unread_count(current_user: User = Depends(require_authenticated)):
    schema = await _get_tenant_schema(current_user)
    async with _tenant_session(schema) as tdb:
        result = await tdb.execute(
            text("SELECT COUNT(*) FROM notifications WHERE user_id = :uid AND is_read = FALSE"),
            {"uid": current_user.id},
        )
        count = result.scalar() or 0
    return {"count": count}


@router.post("/notifications/{notification_id}/read", status_code=204)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(require_authenticated),
):
    schema = await _get_tenant_schema(current_user)
    async with _tenant_session(schema) as tdb:
        await tdb.execute(
            text("UPDATE notifications SET is_read = TRUE WHERE id = :nid AND user_id = :uid"),
            {"nid": notification_id, "uid": current_user.id},
        )
        await tdb.commit()


@router.post("/notifications/read-all", status_code=204)
async def mark_all_read(current_user: User = Depends(require_authenticated)):
    schema = await _get_tenant_schema(current_user)
    async with _tenant_session(schema) as tdb:
        await tdb.execute(
            text("UPDATE notifications SET is_read = TRUE WHERE user_id = :uid AND is_read = FALSE"),
            {"uid": current_user.id},
        )
        await tdb.commit()


from contextlib import asynccontextmanager

@asynccontextmanager
async def _tenant_session(schema: str):
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as s:
        await s.execute(text(f"SET search_path TO {schema}, public"))
        yield s


# ─────────────────────────────────────────────
# BRANDING
# ─────────────────────────────────────────────

class BrandingResponse(BaseModel):
    name: str
    logo_url: Optional[str]
    primary_color: Optional[str]


class BrandingUpdate(BaseModel):
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None


@router.get("/branding", response_model=BrandingResponse)
async def get_branding(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    """Retorna dados de branding do tenant do usuário logado."""
    if not current_user.tenant_id:
        from fastapi import HTTPException
        raise HTTPException(404, "Usuário sem tenant.")
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        from fastapi import HTTPException
        raise HTTPException(404, "Tenant não encontrado.")
    return BrandingResponse(
        name=tenant.name,
        logo_url=tenant.logo_url,
        primary_color=tenant.primary_color,
    )


@router.patch("/branding", response_model=BrandingResponse)
async def update_branding(
    data: BrandingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_company_admin),
):
    """Atualiza branding do tenant. Requer company_admin."""
    if not current_user.tenant_id:
        from fastapi import HTTPException
        raise HTTPException(404, "Usuário sem tenant.")
    result = await db.execute(
        select(Tenant).where(Tenant.id == current_user.tenant_id)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        from fastapi import HTTPException
        raise HTTPException(404, "Tenant não encontrado.")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    tenant.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(tenant)
    return BrandingResponse(
        name=tenant.name,
        logo_url=tenant.logo_url,
        primary_color=tenant.primary_color,
    )
