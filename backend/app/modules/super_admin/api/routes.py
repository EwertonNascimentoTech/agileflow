import uuid
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_super_admin, get_current_user
from app.modules.super_admin.schemas import (
    PlanCreate, PlanUpdate, PlanResponse,
    TenantCreate, TenantUpdate, TenantResponse, TenantSummary,
    TenantModuleResponse, ModuleActivate,
    UserCreate, UserUpdate, UserResponse,
    LoginRequest, TokenResponse,
    ModuleCreate, ModuleUpdate, ModuleResponse,
)
from app.modules.super_admin.service import (
    PlanService, TenantService, UserService, ModuleService,
)
from app.core.security import (
    create_tokens, create_refresh_token,
    decode_refresh_token, create_password_reset_token, decode_password_reset_token,
    validate_password_strength,
)
from pydantic import BaseModel as _BaseModel, field_validator
from fastapi import Request
from app.core.limiter import limiter

router = APIRouter(prefix="/super-admin", tags=["Super Admin"])
auth_router = APIRouter(prefix="/auth", tags=["Auth"])


# ─────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────

@auth_router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await UserService.authenticate(db, data.email, data.password)
    access_token, refresh_token = create_tokens(user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user,
    )


@auth_router.get("/me", response_model=UserResponse)
async def me(current_user=Depends(get_current_user)):
    return current_user


class _RefreshRequest(_BaseModel):
    refresh_token: str


class _ForgotPasswordRequest(_BaseModel):
    email: str


class _ResetPasswordRequest(_BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password_strong(cls, v: str) -> str:
        return validate_password_strength(v)


@auth_router.post("/refresh", response_model=TokenResponse)
async def refresh_token(data: _RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Troca refresh token por novos access + refresh tokens."""
    payload = decode_refresh_token(data.refresh_token)
    user_id = payload.get("sub")
    if not user_id:
        from fastapi import HTTPException
        raise HTTPException(401, "Token sem identificação.")
    user = await UserService.get_user(db, uuid.UUID(user_id))
    if not user.is_active:
        from fastapi import HTTPException
        raise HTTPException(401, "Usuário inativo.")
    access_token, new_refresh_token = create_tokens(user)
    return TokenResponse(access_token=access_token, refresh_token=new_refresh_token, user=user)


@auth_router.post("/forgot-password")
@limiter.limit("10/minute")
async def forgot_password(request: Request, data: _ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    Gera token de reset de senha.
    Em produção, enviaria o token por e-mail. Aqui retorna o token diretamente para testes.
    """
    from sqlalchemy import select as _select
    from app.modules.super_admin.models import User as _User
    result = await db.execute(_select(_User).where(_User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        # Não revela se o e-mail existe
        return {"message": "Se o e-mail existir, um link de reset será enviado."}
    reset_token = create_password_reset_token(user.id)
    # TODO: em produção, enviar por e-mail em vez de retornar
    return {"reset_token": reset_token, "message": "Token gerado (apenas para testes)."}


@auth_router.post("/reset-password")
async def reset_password(data: _ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Valida token de reset e atualiza a senha do usuário."""
    from app.core.security import get_password_hash
    payload = decode_password_reset_token(data.token)
    user_id = payload.get("sub")
    if not user_id:
        from fastapi import HTTPException
        raise HTTPException(400, "Token inválido.")
    user = await UserService.get_user(db, uuid.UUID(user_id))
    user.hashed_password = get_password_hash(data.new_password)
    user.updated_at = __import__("datetime").datetime.utcnow()
    await db.commit()
    return {"message": "Senha atualizada com sucesso."}


# ─────────────────────────────────────────────
# MODULE REGISTRY (developed modules)
# ─────────────────────────────────────────────

@router.get("/modules", response_model=List[ModuleResponse])
async def list_modules(
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await ModuleService.list_modules(db, active_only=active_only)


@router.post("/modules", response_model=ModuleResponse, status_code=201)
async def create_module(
    data: ModuleCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await ModuleService.create_module(db, data)


@router.get("/modules/{module_id}", response_model=ModuleResponse)
async def get_module(
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await ModuleService.get_module(db, module_id)


@router.patch("/modules/{module_id}", response_model=ModuleResponse)
async def update_module(
    module_id: uuid.UUID,
    data: ModuleUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await ModuleService.update_module(db, module_id, data)


@router.delete("/modules/{module_id}", status_code=204)
async def delete_module(
    module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    await ModuleService.delete_module(db, module_id)


# ─────────────────────────────────────────────
# PLANS
# ─────────────────────────────────────────────

@router.get("/plans", response_model=List[PlanResponse])
async def list_plans(
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    plans = await PlanService.list_plans(db, active_only=active_only)
    return [
        PlanResponse(
            **{k: v for k, v in plan.__dict__.items() if k != "allowed_modules"},
            modules=[pm.module_slug for pm in plan.allowed_modules],
        )
        for plan in plans
    ]


@router.post("/plans", response_model=PlanResponse, status_code=201)
async def create_plan(
    data: PlanCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    plan = await PlanService.create_plan(db, data)
    return PlanResponse(
        **{k: v for k, v in plan.__dict__.items() if k != "allowed_modules"},
        modules=[pm.module_slug for pm in plan.allowed_modules],
    )


@router.get("/plans/{plan_id}", response_model=PlanResponse)
async def get_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    plan = await PlanService.get_plan(db, plan_id)
    return PlanResponse(
        **{k: v for k, v in plan.__dict__.items() if k != "allowed_modules"},
        modules=[pm.module_slug for pm in plan.allowed_modules],
    )


@router.patch("/plans/{plan_id}", response_model=PlanResponse)
async def update_plan(
    plan_id: uuid.UUID,
    data: PlanUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    plan = await PlanService.update_plan(db, plan_id, data)
    return PlanResponse(
        **{k: v for k, v in plan.__dict__.items() if k != "allowed_modules"},
        modules=[pm.module_slug for pm in plan.allowed_modules],
    )


# ─────────────────────────────────────────────
# TENANTS
# ─────────────────────────────────────────────

@router.get("/tenants", response_model=List[TenantSummary])
async def list_tenants(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await TenantService.list_tenants(db, skip=skip, limit=limit, active_only=active_only)


@router.post("/tenants", response_model=TenantResponse, status_code=201)
async def create_tenant(
    data: TenantCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await TenantService.create_tenant(db, data)


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await TenantService.get_tenant(db, tenant_id)


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: uuid.UUID,
    data: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await TenantService.update_tenant(db, tenant_id, data)


# ─────────────────────────────────────────────
# MÓDULOS DO TENANT
# ─────────────────────────────────────────────

@router.post(
    "/tenants/{tenant_id}/modules",
    response_model=TenantModuleResponse,
    status_code=201,
)
async def activate_module(
    tenant_id: uuid.UUID,
    data: ModuleActivate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await TenantService.activate_module(db, tenant_id, data)


@router.delete(
    "/tenants/{tenant_id}/modules/{module_slug}",
    response_model=TenantModuleResponse,
)
async def deactivate_module(
    tenant_id: uuid.UUID,
    module_slug: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await TenantService.deactivate_module(db, tenant_id, module_slug)


# ─────────────────────────────────────────────
# ADMIN DA EMPRESA
# ─────────────────────────────────────────────

@router.get(
    "/tenants/{tenant_id}/users",
    response_model=List[UserResponse],
)
async def list_tenant_users(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    from sqlalchemy import select
    from app.modules.super_admin.models import User as _User
    result = await db.execute(
        select(_User).where(_User.tenant_id == tenant_id).order_by(_User.role, _User.full_name)
    )
    return list(result.scalars().all())


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await UserService.update_user(db, user_id, data)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin),
):
    from sqlalchemy import select
    from app.modules.super_admin.models import User as _User
    from fastapi import HTTPException

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Você não pode excluir o próprio usuário.")

    result = await db.execute(select(_User).where(_User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    await db.delete(user)
    await db.commit()


@router.post(
    "/tenants/{tenant_id}/admin",
    response_model=UserResponse,
    status_code=201,
)
async def create_company_admin(
    tenant_id: uuid.UUID,
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await UserService.create_company_admin(db, data, tenant_id)


# ─────────────────────────────────────────────
# SUPER ADMINS
# ─────────────────────────────────────────────

@router.post("/admins", response_model=UserResponse, status_code=201)
async def create_super_admin(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    return await UserService.create_super_admin(db, data)


# ─────────────────────────────────────────────
# DASHBOARD STATS
# ─────────────────────────────────────────────

@router.get("/stats")
async def get_platform_stats(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_super_admin),
):
    from sqlalchemy import select, func
    from app.modules.super_admin.models import Tenant, Plan, TenantModule, Module
    from datetime import datetime, timedelta

    # Tenant counts
    total_tenants = (await db.execute(select(func.count(Tenant.id)))).scalar() or 0
    active_tenants = (await db.execute(
        select(func.count(Tenant.id)).where(Tenant.is_active == True)
    )).scalar() or 0

    # MRR: sum of plan prices for active tenants with a plan
    mrr_result = await db.execute(
        select(func.sum(Plan.price))
        .join(Tenant, Tenant.plan_id == Plan.id)
        .where(Tenant.is_active == True)
    )
    mrr = float(mrr_result.scalar() or 0)

    # Expiring soon (next 30 days)
    now = datetime.utcnow()
    expiring_soon = (await db.execute(
        select(func.count(Tenant.id)).where(
            Tenant.is_active == True,
            Tenant.plan_expires_at != None,
            Tenant.plan_expires_at <= now + timedelta(days=30),
            Tenant.plan_expires_at >= now,
        )
    )).scalar() or 0

    # Top modules by active tenant count
    top_modules_result = await db.execute(
        select(TenantModule.module_slug, func.count(TenantModule.tenant_id).label("cnt"))
        .where(TenantModule.is_active == True)
        .group_by(TenantModule.module_slug)
        .order_by(func.count(TenantModule.tenant_id).desc())
        .limit(5)
    )
    module_rows = top_modules_result.all()
    # Enrich with module names
    slugs = [r[0] for r in module_rows]
    names_map: dict = {}
    if slugs:
        names_result = await db.execute(select(Module.slug, Module.name).where(Module.slug.in_(slugs)))
        names_map = {r[0]: r[1] for r in names_result.all()}

    top_modules = [
        {"slug": r[0], "name": names_map.get(r[0], r[0]), "tenant_count": r[1]}
        for r in module_rows
    ]

    # Recent tenants (last 5)
    recent_result = await db.execute(
        select(Tenant).order_by(Tenant.created_at.desc()).limit(5)
    )
    recent_tenants = [
        {"id": str(t.id), "name": t.name, "slug": t.slug, "is_active": t.is_active, "created_at": t.created_at.isoformat()}
        for t in recent_result.scalars().all()
    ]

    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "inactive_tenants": total_tenants - active_tenants,
        "mrr": mrr,
        "expiring_soon": expiring_soon,
        "top_modules": top_modules,
        "recent_tenants": recent_tenants,
    }
