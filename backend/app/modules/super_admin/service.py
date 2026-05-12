import uuid
import re
from datetime import datetime
from typing import Optional, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.core.database import create_tenant_schema, create_tenant_tables
from app.core.security import get_password_hash, verify_password
from app.modules.super_admin.models import (
    Plan, PlanModule, Tenant, TenantModule, User, Module,
    ModulePermission, Role, RolePermission,
    UserRole, AuditLog,
)
from app.modules.super_admin.schemas import (
    PlanCreate, PlanUpdate,
    TenantCreate, TenantUpdate,
    UserCreate, UserUpdate,
    ModuleActivate,
    ModuleCreate, ModuleUpdate,
    RoleCreate, RoleUpdate,
)


# ══════════════════════════════════════════════
# MODULE REGISTRY SERVICE
# ══════════════════════════════════════════════

class ModuleService:

    @staticmethod
    async def list_modules(db: AsyncSession, active_only: bool = False) -> List[Module]:
        q = select(Module).order_by(Module.name)
        if active_only:
            q = q.where(Module.is_active == True)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_module(db: AsyncSession, module_id: uuid.UUID) -> Module:
        result = await db.execute(select(Module).where(Module.id == module_id))
        m = result.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="Módulo não encontrado.")
        return m

    @staticmethod
    async def get_by_slug(db: AsyncSession, slug: str) -> Optional[Module]:
        result = await db.execute(select(Module).where(Module.slug == slug))
        return result.scalar_one_or_none()

    @staticmethod
    async def create_module(db: AsyncSession, data: ModuleCreate) -> Module:
        if await ModuleService.get_by_slug(db, data.slug):
            raise HTTPException(status_code=400, detail="Slug de módulo já cadastrado.")
        m = Module(**data.model_dump())
        db.add(m)
        await db.commit()
        await db.refresh(m)
        return m

    @staticmethod
    async def update_module(db: AsyncSession, module_id: uuid.UUID, data: ModuleUpdate) -> Module:
        m = await ModuleService.get_module(db, module_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(m, field, value)
        m.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(m)
        return m

    @staticmethod
    async def delete_module(db: AsyncSession, module_id: uuid.UUID) -> None:
        m = await ModuleService.get_module(db, module_id)
        # Bloqueia delete se está em uso
        plan_use = await db.execute(
            select(PlanModule).where(PlanModule.module_slug == m.slug).limit(1)
        )
        if plan_use.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Módulo está vinculado a um ou mais planos. Remova primeiro."
            )
        tenant_use = await db.execute(
            select(TenantModule).where(TenantModule.module_slug == m.slug).limit(1)
        )
        if tenant_use.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Módulo está ativo em um ou mais tenants. Desative primeiro."
            )
        await db.delete(m)
        await db.commit()

    @staticmethod
    async def validate_slugs(db: AsyncSession, slugs: List[str]) -> None:
        """Garante que todos os slugs existem em `modules` e estão ativos."""
        if not slugs:
            return
        result = await db.execute(
            select(Module.slug).where(Module.slug.in_(slugs), Module.is_active == True)
        )
        found = {row[0] for row in result.all()}
        invalid = [s for s in slugs if s not in found]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Módulos não cadastrados ou inativos: {', '.join(invalid)}"
            )


# ══════════════════════════════════════════════
# PLAN SERVICE
# ══════════════════════════════════════════════

class PlanService:

    @staticmethod
    async def list_plans(db: AsyncSession, active_only: bool = True) -> List[Plan]:
        q = select(Plan).options(selectinload(Plan.allowed_modules))
        if active_only:
            q = q.where(Plan.is_active == True)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_plan(db: AsyncSession, plan_id: uuid.UUID) -> Plan:
        result = await db.execute(
            select(Plan)
            .options(selectinload(Plan.allowed_modules))
            .where(Plan.id == plan_id)
        )
        plan = result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=404, detail="Plano não encontrado.")
        return plan

    @staticmethod
    async def create_plan(db: AsyncSession, data: PlanCreate) -> Plan:
        existing = await db.execute(select(Plan).where(Plan.name == data.name))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Já existe um plano com este nome.")

        await ModuleService.validate_slugs(db, data.modules)

        plan = Plan(
            name=data.name,
            description=data.description,
            price=data.price,
            max_users=data.max_users,
        )
        db.add(plan)
        await db.flush()

        for slug in data.modules:
            db.add(PlanModule(plan_id=plan.id, module_slug=slug))

        await db.commit()
        await db.refresh(plan)
        return plan

    @staticmethod
    async def update_plan(db: AsyncSession, plan_id: uuid.UUID, data: PlanUpdate) -> Plan:
        plan = await PlanService.get_plan(db, plan_id)

        for field, value in data.model_dump(exclude_unset=True, exclude={"modules"}).items():
            setattr(plan, field, value)

        if data.modules is not None:
            await ModuleService.validate_slugs(db, data.modules)
            await db.execute(delete(PlanModule).where(PlanModule.plan_id == plan.id))
            for slug in data.modules:
                db.add(PlanModule(plan_id=plan.id, module_slug=slug))

        plan.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(plan)
        return plan


# ══════════════════════════════════════════════
# TENANT SERVICE
# ══════════════════════════════════════════════

class TenantService:

    @staticmethod
    def _build_schema_name(slug: str) -> str:
        safe = re.sub(r"[^a-z0-9_]", "_", slug.lower())
        return f"tenant_{safe}"

    @staticmethod
    async def list_tenants(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 50,
        active_only: bool = False
    ) -> List[Tenant]:
        q = select(Tenant).options(
            selectinload(Tenant.active_modules),
            selectinload(Tenant.plan)
        ).offset(skip).limit(limit)

        if active_only:
            q = q.where(Tenant.is_active == True)

        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
        result = await db.execute(
            select(Tenant)
            .options(
                selectinload(Tenant.active_modules),
                selectinload(Tenant.plan).selectinload(Plan.allowed_modules)
            )
            .where(Tenant.id == tenant_id)
        )
        tenant = result.scalar_one_or_none()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant não encontrado.")
        return tenant

    @staticmethod
    async def get_tenant_by_slug(db: AsyncSession, slug: str) -> Tenant:
        result = await db.execute(
            select(Tenant)
            .options(selectinload(Tenant.active_modules))
            .where(Tenant.slug == slug)
        )
        tenant = result.scalar_one_or_none()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant não encontrado.")
        return tenant

    @staticmethod
    async def create_tenant(db: AsyncSession, data: TenantCreate) -> Tenant:
        existing = await db.execute(select(Tenant).where(Tenant.slug == data.slug))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Slug já está em uso.")

        if data.plan_id:
            plan_result = await db.execute(select(Plan).where(Plan.id == data.plan_id))
            if not plan_result.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Plano não encontrado.")

        schema_name = TenantService._build_schema_name(data.slug)

        tenant = Tenant(
            name=data.name,
            slug=data.slug,
            schema_name=schema_name,
            plan_id=data.plan_id,
            plan_expires_at=data.plan_expires_at,
        )
        db.add(tenant)
        await db.commit()

        await create_tenant_schema(schema_name)
        await create_tenant_tables(schema_name)

        if data.plan_id:
            await TenantService._activate_plan_modules(db, tenant)

        await db.refresh(tenant)
        return tenant

    @staticmethod
    async def _activate_plan_modules(db: AsyncSession, tenant: Tenant) -> None:
        plan_result = await db.execute(
            select(Plan)
            .options(selectinload(Plan.allowed_modules))
            .where(Plan.id == tenant.plan_id)
        )
        plan = plan_result.scalar_one_or_none()
        if not plan:
            return

        await db.execute(
            delete(TenantModule).where(TenantModule.tenant_id == tenant.id)
        )
        for pm in plan.allowed_modules:
            db.add(TenantModule(tenant_id=tenant.id, module_slug=pm.module_slug))

        await db.commit()

    @staticmethod
    async def update_tenant(
        db: AsyncSession, tenant_id: uuid.UUID, data: TenantUpdate
    ) -> Tenant:
        tenant = await TenantService.get_tenant(db, tenant_id)
        old_plan_id = tenant.plan_id

        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(tenant, field, value)

        tenant.updated_at = datetime.utcnow()
        await db.commit()

        if data.plan_id and data.plan_id != old_plan_id:
            await TenantService._activate_plan_modules(db, tenant)

        await db.refresh(tenant)
        return tenant

    @staticmethod
    async def activate_module(
        db: AsyncSession, tenant_id: uuid.UUID, data: ModuleActivate
    ) -> TenantModule:
        await TenantService.get_tenant(db, tenant_id)
        await ModuleService.validate_slugs(db, [data.module_slug])

        existing = await db.execute(
            select(TenantModule).where(
                TenantModule.tenant_id == tenant_id,
                TenantModule.module_slug == data.module_slug
            )
        )
        module = existing.scalar_one_or_none()

        if module:
            module.is_active = True
        else:
            module = TenantModule(
                tenant_id=tenant_id,
                module_slug=data.module_slug,
                is_active=True,
            )
            db.add(module)

        await db.commit()
        await db.refresh(module)
        return module

    @staticmethod
    async def deactivate_module(
        db: AsyncSession, tenant_id: uuid.UUID, module_slug: str
    ) -> TenantModule:
        existing = await db.execute(
            select(TenantModule).where(
                TenantModule.tenant_id == tenant_id,
                TenantModule.module_slug == module_slug
            )
        )
        module = existing.scalar_one_or_none()
        if not module:
            raise HTTPException(status_code=404, detail="Módulo não está ativo para este tenant.")

        module.is_active = False
        await db.commit()
        await db.refresh(module)
        return module


# ══════════════════════════════════════════════
# USER SERVICE
# ══════════════════════════════════════════════

class UserService:

    @staticmethod
    async def get_by_email(db: AsyncSession, email: str) -> Optional[User]:
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user(db: AsyncSession, user_id: uuid.UUID) -> User:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        return user

    @staticmethod
    async def create_super_admin(db: AsyncSession, data: UserCreate) -> User:
        if await UserService.get_by_email(db, data.email):
            raise HTTPException(status_code=400, detail="E-mail já cadastrado.")

        user = User(
            email=data.email,
            full_name=data.full_name,
            hashed_password=get_password_hash(data.password),
            role=UserRole.SUPER_ADMIN,
            tenant_id=None,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def create_company_admin(
        db: AsyncSession, data: UserCreate, tenant_id: uuid.UUID
    ) -> User:
        if await UserService.get_by_email(db, data.email):
            raise HTTPException(status_code=400, detail="E-mail já cadastrado.")

        user = User(
            email=data.email,
            full_name=data.full_name,
            hashed_password=get_password_hash(data.password),
            role=UserRole.COMPANY_ADMIN,
            tenant_id=tenant_id,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def update_user(
        db: AsyncSession, user_id: uuid.UUID, data: UserUpdate
    ) -> User:
        user = await UserService.get_user(db, user_id)

        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(user, field, value)

        user.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def create_company_user(
        db: AsyncSession, data: UserCreate, tenant_id: uuid.UUID
    ) -> User:
        """Cria um usuário comum dentro de um tenant."""
        if await UserService.get_by_email(db, data.email):
            raise HTTPException(status_code=400, detail="E-mail já cadastrado.")

        user = User(
            email=data.email,
            full_name=data.full_name,
            hashed_password=get_password_hash(data.password),
            role=UserRole.COMPANY_USER,
            tenant_id=tenant_id,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def authenticate(db: AsyncSession, email: str, password: str) -> User:
        user = await UserService.get_by_email(db, email)
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciais inválidas."
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuário inativo."
            )
        user.last_login = datetime.utcnow()
        await db.commit()
        return user


# ══════════════════════════════════════════════
# PERMISSION SERVICE
# ══════════════════════════════════════════════

class PermissionService:

    @staticmethod
    async def list_all(db: AsyncSession) -> List[ModulePermission]:
        """Lista todas as permissions disponíveis (apenas dos módulos cadastrados e ativos)."""
        result = await db.execute(
            select(ModulePermission)
            .join(Module, Module.slug == ModulePermission.module_slug)
            .where(Module.is_active == True)
            .order_by(ModulePermission.module_slug, ModulePermission.name)
        )
        return list(result.scalars().all())

    @staticmethod
    async def list_codes(db: AsyncSession) -> set[str]:
        result = await db.execute(select(ModulePermission.code))
        return {row[0] for row in result.all()}


# ══════════════════════════════════════════════
# ROLE SERVICE
# ══════════════════════════════════════════════

class RoleService:

    @staticmethod
    def _to_response(role: Role, user_count: int = 0) -> dict:
        return {
            "id": role.id,
            "tenant_id": role.tenant_id,
            "name": role.name,
            "description": role.description,
            "is_system": role.is_system,
            "permissions": [rp.permission_code for rp in role.permissions],
            "user_count": user_count,
            "created_at": role.created_at,
        }

    @staticmethod
    async def list_roles(db: AsyncSession, tenant_id: uuid.UUID) -> List[dict]:
        result = await db.execute(
            select(Role)
            .options(selectinload(Role.permissions), selectinload(Role.users))
            .where(Role.tenant_id == tenant_id)
            .order_by(Role.name)
        )
        roles = list(result.scalars().all())
        return [RoleService._to_response(r, len(r.users)) for r in roles]

    @staticmethod
    async def get_role(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> dict:
        role = await RoleService._get_or_404(db, tenant_id, role_id)
        users_count = len([u for u in role.users])
        return RoleService._to_response(role, users_count)

    @staticmethod
    async def _get_or_404(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> Role:
        result = await db.execute(
            select(Role)
            .options(selectinload(Role.permissions), selectinload(Role.users))
            .where(Role.id == role_id, Role.tenant_id == tenant_id)
        )
        role = result.scalar_one_or_none()
        if not role:
            raise HTTPException(status_code=404, detail="Função não encontrada.")
        return role

    @staticmethod
    async def _validate_codes(db: AsyncSession, codes: List[str]) -> None:
        if not codes:
            return
        valid = await PermissionService.list_codes(db)
        invalid = [c for c in codes if c not in valid]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Permissões inválidas: {', '.join(invalid)}"
            )

    @staticmethod
    async def create_role(
        db: AsyncSession, tenant_id: uuid.UUID, data: RoleCreate
    ) -> dict:
        existing = await db.execute(
            select(Role).where(Role.tenant_id == tenant_id, Role.name == data.name)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Já existe uma função com este nome.")

        await RoleService._validate_codes(db, data.permissions)

        role = Role(
            tenant_id=tenant_id,
            name=data.name,
            description=data.description,
            is_system=False,
        )
        db.add(role)
        await db.flush()

        for code in data.permissions:
            db.add(RolePermission(role_id=role.id, permission_code=code))

        await db.commit()
        await db.refresh(role, ["permissions", "users"])
        return RoleService._to_response(role, 0)

    @staticmethod
    async def update_role(
        db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID, data: RoleUpdate
    ) -> dict:
        role = await RoleService._get_or_404(db, tenant_id, role_id)
        if role.is_system and (data.name is not None or data.permissions is not None):
            raise HTTPException(
                status_code=400, detail="Roles do sistema não podem ser alteradas."
            )

        if data.name is not None and data.name != role.name:
            dup = await db.execute(
                select(Role).where(
                    Role.tenant_id == tenant_id,
                    Role.name == data.name,
                    Role.id != role.id,
                )
            )
            if dup.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Já existe uma função com este nome.")
            role.name = data.name

        if data.description is not None:
            role.description = data.description

        if data.permissions is not None:
            await RoleService._validate_codes(db, data.permissions)
            await db.execute(
                delete(RolePermission).where(RolePermission.role_id == role.id)
            )
            for code in data.permissions:
                db.add(RolePermission(role_id=role.id, permission_code=code))

        role.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(role, ["permissions", "users"])
        return RoleService._to_response(role, len(role.users))

    @staticmethod
    async def delete_role(
        db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID
    ) -> None:
        role = await RoleService._get_or_404(db, tenant_id, role_id)
        if role.is_system:
            raise HTTPException(status_code=400, detail="Roles do sistema não podem ser excluídas.")
        if role.users:
            raise HTTPException(
                status_code=400,
                detail=f"Esta função está atribuída a {len(role.users)} usuário(s). Reatribua-os antes de excluir."
            )
        await db.delete(role)
        await db.commit()

    @staticmethod
    async def user_has_permission(
        db: AsyncSession, user: User, code: str
    ) -> bool:
        """
        Resolve permissão de um usuário:
        - super_admin → sempre True
        - company_admin → sempre True (dentro do seu tenant)
        - company_user → precisa ter role e a permission ligada
        """
        if user.role == UserRole.SUPER_ADMIN:
            return True
        if user.role == UserRole.COMPANY_ADMIN:
            return True
        if not user.role_id:
            return False
        result = await db.execute(
            select(RolePermission).where(
                RolePermission.role_id == user.role_id,
                RolePermission.permission_code == code,
            )
        )
        return result.scalar_one_or_none() is not None


# ══════════════════════════════════════════════
# AUDIT SERVICE
# ══════════════════════════════════════════════

class AuditService:

    @staticmethod
    async def log(
        db: AsyncSession,
        action: str,
        entity_type: str,
        user_id: Optional[uuid.UUID] = None,
        tenant_id: Optional[uuid.UUID] = None,
        entity_id: Optional[uuid.UUID] = None,
        details: Optional[dict] = None,
        ip: Optional[str] = None,
    ) -> AuditLog:
        entry = AuditLog(
            user_id=user_id,
            tenant_id=tenant_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
            ip_address=ip,
        )
        db.add(entry)
        await db.commit()
        await db.refresh(entry)
        return entry
