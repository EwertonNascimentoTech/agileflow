"""Lógica de negócio do módulo TeamOps."""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import and_, delete as sa_delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_password_hash, validate_password_strength
from app.modules.super_admin.models import (
    ModulePermission,
    Plan,
    Role,
    RolePermission,
    Tenant,
    TenantModule,
    User,
    UserRole,
)

# Registry slug -> slugs usados nos códigos de permissão (CRM agrupa 2 módulos de permissão).
MODULE_PERM_SLUGS: dict[str, set[str]] = {
    "crm": {"atendimento", "propostas_contratos"},
}
from app.modules.teamops.models import (
    Absence,
    AbsenceStatus,
    AbsenceType,
    Area,
    AreaStatus,
    Person,
    PersonStack,
    PersonStatus,
    Position,
    Stack,
    StackCategory,
    StackLevel,
)

# Permissões da role de sistema "Executor" (acesso operacional para quem executa tarefas).
EXECUTOR_PERMISSIONS = [
    "projetos.project.view",
    "projetos.task.view",
    "projetos.task.manage",
    "projetos.comment.manage",
    "teamops.view",
    "teamops.org.view",
    "teamops.person.view",
    "teamops.stack.view",
    "teamops.absence.view_own",
    "teamops.absence.request",
]
from app.modules.teamops.schemas import (
    AbsenceCalendarDay,
    AbsenceCalendarResponse,
    AbsenceCreate,
    AbsenceDecision,
    AbsenceTypeCreate,
    AbsenceTypeUpdate,
    AbsenceUpdate,
    AlertItem,
    AlertsResponse,
    AreaCreate,
    AreaUpdate,
    CompetencyMapEntry,
    CompetencyMapPerson,
    CompetencyMapResponse,
    DashboardKpis,
    OrgNode,
    OrgTreeResponse,
    PersonCreate,
    PersonStackCreate,
    PersonStackUpdate,
    PersonUpdate,
    TeamMemberResponse,
    PositionCreate,
    PositionUpdate,
    StackCategoryCreate,
    StackCategoryUpdate,
    StackCreate,
    StackUpdate,
)


def _slugify(value: str) -> str:
    s = value.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


# ─────────────────────────────────────────────
# Position (cargo)
# ─────────────────────────────────────────────


class PositionService:
    @staticmethod
    async def list(db: AsyncSession, active_only: bool = False) -> list[Position]:
        q = select(Position).order_by(Position.sort_order.asc(), Position.name.asc())
        if active_only:
            q = q.where(Position.is_active == True)  # noqa: E712
        result = await db.execute(q)
        positions = list(result.scalars().all())
        counts = await db.execute(
            select(Person.position_id, func.count(Person.id))
            .group_by(Person.position_id)
        )
        count_map = {row[0]: row[1] for row in counts.all()}
        for p in positions:
            setattr(p, "person_count", count_map.get(p.id, 0))
        return positions

    @staticmethod
    async def get(db: AsyncSession, position_id: uuid.UUID) -> Position:
        result = await db.execute(select(Position).where(Position.id == position_id))
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Cargo não encontrado.")
        count_q = await db.execute(
            select(func.count(Person.id)).where(Person.position_id == position_id)
        )
        setattr(item, "person_count", count_q.scalar() or 0)
        return item

    @staticmethod
    async def create(db: AsyncSession, data: PositionCreate) -> Position:
        payload = data.model_dump()
        payload["slug"] = _slugify(payload["slug"] or payload["name"])
        item = Position(**payload, is_system=False)
        db.add(item)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Já existe um cargo com este slug.")
        return await PositionService.get(db, item.id)

    @staticmethod
    async def update(db: AsyncSession, position_id: uuid.UUID, data: PositionUpdate) -> Position:
        item = await PositionService.get(db, position_id)
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        await db.commit()
        return await PositionService.get(db, item.id)

    @staticmethod
    async def delete(db: AsyncSession, position_id: uuid.UUID) -> None:
        item = await PositionService.get(db, position_id)
        if item.is_system:
            raise HTTPException(
                status_code=400,
                detail="Cargos do sistema não podem ser excluídos. Você pode renomeá-los ou desativá-los.",
            )
        in_use = await db.execute(
            select(func.count(Person.id)).where(Person.position_id == position_id)
        )
        if (in_use.scalar() or 0) > 0:
            raise HTTPException(
                status_code=400,
                detail="Cargo está vinculado a pessoas. Mova-as para outro cargo antes de excluir.",
            )
        await db.delete(item)
        await db.commit()

    # ── Acesso por cargo: matriz de permissões (role do cargo) ──────────────
    @staticmethod
    async def _get_or_create_role(db: AsyncSession, position: Position, tenant_id: uuid.UUID) -> Role:
        """Role (public.roles) que guarda as permissões do cargo. Cria com um conjunto
        padrão sensato (EXECUTOR_PERMISSIONS) na primeira vez."""
        if position.role_id:
            role = (await db.execute(select(Role).where(Role.id == position.role_id))).scalar_one_or_none()
            if role:
                return role
        role = Role(
            tenant_id=tenant_id,
            name=f"Cargo · {position.name}",
            description=f"Permissões do cargo {position.name} (gerenciadas no TeamOps).",
            is_system=True,
        )
        db.add(role)
        await db.flush()
        for code in EXECUTOR_PERMISSIONS:
            db.add(RolePermission(role_id=role.id, permission_code=code))
        position.role_id = role.id
        await db.flush()
        return role

    @staticmethod
    async def get_permissions(db: AsyncSession, position_id: uuid.UUID) -> list[str]:
        pos = await PositionService.get(db, position_id)
        if not pos.role_id:
            return []
        rows = await db.execute(
            select(RolePermission.permission_code).where(RolePermission.role_id == pos.role_id)
        )
        return sorted(r[0] for r in rows.all())

    @staticmethod
    async def set_permissions(
        db: AsyncSession, position_id: uuid.UUID, codes: list[str], tenant_id: uuid.UUID
    ) -> list[str]:
        pos = await PositionService.get(db, position_id)
        role = await PositionService._get_or_create_role(db, pos, tenant_id)
        valid = {c for (c,) in (await db.execute(select(ModulePermission.code))).all()}
        clean = [c for c in dict.fromkeys(codes) if c in valid]
        await db.execute(sa_delete(RolePermission).where(RolePermission.role_id == role.id))
        for c in clean:
            db.add(RolePermission(role_id=role.id, permission_code=c))
        pos.updated_at = datetime.utcnow()
        await db.commit()
        return await PositionService.get_permissions(db, position_id)

    @staticmethod
    async def permissions_catalog(db: AsyncSession, tenant_id: Optional[uuid.UUID]) -> list[ModulePermission]:
        """Catálogo de permissões filtrado aos módulos ATIVOS do tenant."""
        allowed: set[str] = set()
        if tenant_id:
            active = (await db.execute(
                select(TenantModule.module_slug).where(
                    TenantModule.tenant_id == tenant_id,
                    TenantModule.is_active == True,  # noqa: E712
                )
            )).all()
            for (slug,) in active:
                allowed |= MODULE_PERM_SLUGS.get(slug, {slug})
        rows = await db.execute(
            select(ModulePermission).order_by(ModulePermission.module_slug, ModulePermission.code)
        )
        perms = list(rows.scalars().all())
        if allowed:
            perms = [p for p in perms if p.module_slug in allowed]
        return perms


# ─────────────────────────────────────────────
# Stack Category
# ─────────────────────────────────────────────


class StackCategoryService:
    @staticmethod
    async def list(db: AsyncSession, active_only: bool = False) -> list[StackCategory]:
        q = select(StackCategory).order_by(StackCategory.order.asc(), StackCategory.name.asc())
        if active_only:
            q = q.where(StackCategory.is_active == True)  # noqa: E712
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get(db: AsyncSession, category_id: uuid.UUID) -> StackCategory:
        result = await db.execute(select(StackCategory).where(StackCategory.id == category_id))
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Categoria não encontrada.")
        return item

    @staticmethod
    async def create(db: AsyncSession, data: StackCategoryCreate) -> StackCategory:
        item = StackCategory(**data.model_dump())
        db.add(item)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Já existe uma categoria com este nome.")
        await db.refresh(item)
        return item

    @staticmethod
    async def update(db: AsyncSession, category_id: uuid.UUID, data: StackCategoryUpdate) -> StackCategory:
        item = await StackCategoryService.get(db, category_id)
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def delete(db: AsyncSession, category_id: uuid.UUID) -> None:
        item = await StackCategoryService.get(db, category_id)
        await db.delete(item)
        await db.commit()


# ─────────────────────────────────────────────
# Stack
# ─────────────────────────────────────────────


class StackService:
    @staticmethod
    async def list(
        db: AsyncSession,
        category_id: Optional[uuid.UUID] = None,
        active_only: bool = False,
    ) -> list[Stack]:
        q = select(Stack).options(selectinload(Stack.category))
        filters = []
        if category_id:
            filters.append(Stack.category_id == category_id)
        if active_only:
            filters.append(Stack.is_active == True)  # noqa: E712
        if filters:
            q = q.where(and_(*filters))
        q = q.order_by(Stack.name.asc())
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get(db: AsyncSession, stack_id: uuid.UUID) -> Stack:
        result = await db.execute(
            select(Stack).options(selectinload(Stack.category)).where(Stack.id == stack_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Stack não encontrada.")
        return item

    @staticmethod
    async def create(db: AsyncSession, data: StackCreate) -> Stack:
        await StackCategoryService.get(db, data.category_id)
        payload = data.model_dump()
        payload["slug"] = _slugify(payload["slug"] or payload["name"])
        item = Stack(**payload)
        db.add(item)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Já existe uma stack com este slug.")
        return await StackService.get(db, item.id)

    @staticmethod
    async def update(db: AsyncSession, stack_id: uuid.UUID, data: StackUpdate) -> Stack:
        item = await StackService.get(db, stack_id)
        payload = data.model_dump(exclude_unset=True)
        if payload.get("category_id"):
            await StackCategoryService.get(db, payload["category_id"])
        if payload.get("slug"):
            payload["slug"] = _slugify(payload["slug"])
        for key, value in payload.items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Já existe uma stack com este slug.")
        return await StackService.get(db, item.id)

    @staticmethod
    async def delete(db: AsyncSession, stack_id: uuid.UUID) -> None:
        item = await StackService.get(db, stack_id)
        await db.delete(item)
        await db.commit()


# ─────────────────────────────────────────────
# Absence Type
# ─────────────────────────────────────────────


class AbsenceTypeService:
    @staticmethod
    async def list(db: AsyncSession, active_only: bool = False) -> list[AbsenceType]:
        q = select(AbsenceType).order_by(AbsenceType.name.asc())
        if active_only:
            q = q.where(AbsenceType.is_active == True)  # noqa: E712
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get(db: AsyncSession, type_id: uuid.UUID) -> AbsenceType:
        result = await db.execute(select(AbsenceType).where(AbsenceType.id == type_id))
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Tipo de ausência não encontrado.")
        return item

    @staticmethod
    async def create(db: AsyncSession, data: AbsenceTypeCreate) -> AbsenceType:
        payload = data.model_dump()
        payload["slug"] = _slugify(payload["slug"] or payload["name"])
        item = AbsenceType(**payload)
        db.add(item)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Já existe um tipo com este slug.")
        await db.refresh(item)
        return item

    @staticmethod
    async def update(db: AsyncSession, type_id: uuid.UUID, data: AbsenceTypeUpdate) -> AbsenceType:
        item = await AbsenceTypeService.get(db, type_id)
        payload = data.model_dump(exclude_unset=True)
        if payload.get("slug"):
            payload["slug"] = _slugify(payload["slug"])
        for key, value in payload.items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Já existe um tipo com este slug.")
        await db.refresh(item)
        return item

    @staticmethod
    async def delete(db: AsyncSession, type_id: uuid.UUID) -> None:
        item = await AbsenceTypeService.get(db, type_id)
        await db.delete(item)
        await db.commit()


# ─────────────────────────────────────────────
# Area
# ─────────────────────────────────────────────


class AreaService:
    @staticmethod
    def _eager_options():
        return (
            selectinload(Area.parent_area),
            selectinload(Area.po_person),
            selectinload(Area.tech_reference_person),
            selectinload(Area.coordinator_person),
            selectinload(Area.manager_person),
        )

    @staticmethod
    async def _enrich_counts(db: AsyncSession, areas: list[Area]) -> None:
        """Anexa person_count e subarea_count em cada área."""
        if not areas:
            return
        person_counts = await db.execute(
            select(Person.area_id, func.count(Person.id))
            .where(Person.area_id.isnot(None))
            .group_by(Person.area_id)
        )
        p_map = {row[0]: row[1] for row in person_counts.all()}
        subarea_counts = await db.execute(
            select(Area.parent_area_id, func.count(Area.id))
            .where(Area.parent_area_id.isnot(None))
            .group_by(Area.parent_area_id)
        )
        s_map = {row[0]: row[1] for row in subarea_counts.all()}
        for area in areas:
            setattr(area, "person_count", p_map.get(area.id, 0))
            setattr(area, "subarea_count", s_map.get(area.id, 0))

    @staticmethod
    async def list(db: AsyncSession, active_only: bool = False) -> list[Area]:
        q = select(Area).options(*AreaService._eager_options())
        if active_only:
            q = q.where(Area.is_active == True)  # noqa: E712
        q = q.order_by(Area.name.asc())
        result = await db.execute(q)
        areas = list(result.scalars().all())
        await AreaService._enrich_counts(db, areas)
        return areas

    @staticmethod
    async def get(db: AsyncSession, area_id: uuid.UUID) -> Area:
        result = await db.execute(
            select(Area).options(*AreaService._eager_options()).where(Area.id == area_id)
        )
        area = result.scalar_one_or_none()
        if not area:
            raise HTTPException(status_code=404, detail="Área não encontrada.")
        await AreaService._enrich_counts(db, [area])
        return area

    @staticmethod
    async def _validate_parent(
        db: AsyncSession,
        parent_id: Optional[uuid.UUID],
        self_id: Optional[uuid.UUID],
    ) -> None:
        """Garante que parent existe e que não cria ciclo (parent não pode ser descendente)."""
        if parent_id is None:
            return
        if self_id is not None and parent_id == self_id:
            raise HTTPException(status_code=400, detail="Uma área não pode ser sua própria área pai.")
        # Verifica que parent existe
        exists = await db.execute(select(Area.id).where(Area.id == parent_id))
        if exists.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Área pai informada não existe.")
        # Verifica ciclo: parent não pode ser descendente de self
        if self_id is not None:
            cursor: Optional[uuid.UUID] = parent_id
            visited: set[uuid.UUID] = set()
            while cursor is not None:
                if cursor in visited:
                    break
                visited.add(cursor)
                if cursor == self_id:
                    raise HTTPException(
                        status_code=400,
                        detail="Hierarquia inválida: a área pai escolhida é descendente desta área.",
                    )
                next_q = await db.execute(
                    select(Area.parent_area_id).where(Area.id == cursor)
                )
                cursor = next_q.scalar_one_or_none()

    @staticmethod
    async def create(db: AsyncSession, data: AreaCreate) -> Area:
        await AreaService._validate_parent(db, data.parent_area_id, self_id=None)
        item = Area(**data.model_dump())
        db.add(item)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Já existe uma área com este nome.")
        return await AreaService.get(db, item.id)

    @staticmethod
    async def update(db: AsyncSession, area_id: uuid.UUID, data: AreaUpdate) -> Area:
        item = await AreaService.get(db, area_id)
        payload = data.model_dump(exclude_unset=True)
        if "parent_area_id" in payload:
            await AreaService._validate_parent(db, payload["parent_area_id"], self_id=area_id)
        for key, value in payload.items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Já existe uma área com este nome.")
        return await AreaService.get(db, item.id)

    @staticmethod
    async def delete(db: AsyncSession, area_id: uuid.UUID) -> None:
        item = await AreaService.get(db, area_id)
        await db.delete(item)
        await db.commit()


# ─────────────────────────────────────────────
# Person
# ─────────────────────────────────────────────


class PersonService:
    @staticmethod
    async def list(
        db: AsyncSession,
        area_id: Optional[uuid.UUID] = None,
        position_id: Optional[uuid.UUID] = None,
        status: Optional[PersonStatus] = None,
        search: Optional[str] = None,
    ) -> list[Person]:
        q = select(Person).options(
            selectinload(Person.position),
            selectinload(Person.area),
            selectinload(Person.po_person).selectinload(Person.position),
            selectinload(Person.tech_reference_person).selectinload(Person.position),
            selectinload(Person.manager_person).selectinload(Person.position),
        )
        filters = []
        if area_id:
            filters.append(Person.area_id == area_id)
        if position_id:
            filters.append(Person.position_id == position_id)
        if status:
            filters.append(Person.status == status)
        if search:
            like = f"%{search.lower()}%"
            filters.append(or_(func.lower(Person.full_name).like(like), func.lower(Person.email).like(like)))
        if filters:
            q = q.where(and_(*filters))
        q = q.order_by(Person.full_name.asc())
        result = await db.execute(q)
        items = list(result.scalars().all())
        await PersonService._enrich_access(db, items)
        return items

    @staticmethod
    async def get(db: AsyncSession, person_id: uuid.UUID) -> Person:
        result = await db.execute(
            select(Person)
            .options(
                selectinload(Person.position),
                selectinload(Person.area),
                selectinload(Person.po_person).selectinload(Person.position),
                selectinload(Person.tech_reference_person).selectinload(Person.position),
                selectinload(Person.manager_person).selectinload(Person.position),
            )
            .where(Person.id == person_id)
        )
        person = result.scalar_one_or_none()
        if not person:
            raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
        await PersonService._enrich_access(db, [person])
        return person

    @staticmethod
    async def _validate_refs(db: AsyncSession, payload: dict) -> None:
        if payload.get("area_id"):
            await AreaService.get(db, payload["area_id"])
        if payload.get("position_id"):
            await PositionService.get(db, payload["position_id"])
        for fld in ("po_person_id", "tech_reference_person_id", "manager_person_id"):
            if payload.get(fld):
                exists = await db.execute(select(Person).where(Person.id == payload[fld]))
                if exists.scalar_one_or_none() is None:
                    raise HTTPException(status_code=400, detail=f"Referência inválida em {fld}.")

    @staticmethod
    async def create(db: AsyncSession, data: PersonCreate, tenant_id: Optional[uuid.UUID] = None) -> Person:
        payload = data.model_dump()
        access_level = payload.pop("access_level", "none")
        password = payload.pop("password", None)
        payload.pop("reset_password", None)
        payload["email"] = payload["email"].lower()
        await PersonService._validate_refs(db, payload)
        item = Person(**payload)
        db.add(item)
        try:
            await db.flush()  # garante item.id e dispara unique de e-mail da pessoa
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Já existe uma pessoa com este e-mail.")
        if access_level and access_level != "none":
            await PersonService._provision_user(db, item, access_level, password, None, tenant_id)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Não foi possível salvar (e-mail já em uso).")
        return await PersonService.get(db, item.id)

    @staticmethod
    async def update(db: AsyncSession, person_id: uuid.UUID, data: PersonUpdate, tenant_id: Optional[uuid.UUID] = None) -> Person:
        item = await PersonService.get(db, person_id)
        payload = data.model_dump(exclude_unset=True)
        access_level = payload.pop("access_level", None)
        password = payload.pop("password", None)
        reset_password = payload.pop("reset_password", None)
        if "email" in payload and payload["email"]:
            payload["email"] = payload["email"].lower()
        await PersonService._validate_refs(db, payload)
        # impede auto-referência
        for fld in ("po_person_id", "tech_reference_person_id", "manager_person_id"):
            if payload.get(fld) and payload[fld] == person_id:
                raise HTTPException(status_code=400, detail="Pessoa não pode referenciar a si mesma.")
        for key, value in payload.items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        if access_level is not None or reset_password:
            await PersonService._provision_user(db, item, access_level, password, reset_password, tenant_id)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=400, detail="Não foi possível salvar (e-mail já em uso).")
        return await PersonService.get(db, item.id)

    # ── Acesso ao sistema: provisionamento Pessoa ↔ Usuário ──────────────────
    @staticmethod
    def _hash_validated(pw: str) -> str:
        try:
            validate_password_strength(pw)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return get_password_hash(pw)

    @staticmethod
    async def _assert_plan_limit(db: AsyncSession, tenant_id: Optional[uuid.UUID]) -> None:
        if not tenant_id:
            return
        t = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
        if not t or not t.plan_id:
            return
        p = (await db.execute(select(Plan).where(Plan.id == t.plan_id))).scalar_one_or_none()
        if not p or p.max_users <= 0:
            return
        count = (await db.execute(
            select(func.count(User.id)).where(User.tenant_id == tenant_id, User.is_active == True)  # noqa: E712
        )).scalar() or 0
        if count >= p.max_users:
            raise HTTPException(status_code=403, detail=f"Limite de {p.max_users} usuários do plano atingido.")

    @staticmethod
    async def _get_executor_role_id(db: AsyncSession, tenant_id: Optional[uuid.UUID]) -> uuid.UUID:
        if not tenant_id:
            raise HTTPException(status_code=400, detail="Tenant não identificado para criar o acesso.")
        res = await db.execute(select(Role).where(Role.tenant_id == tenant_id, Role.name == "Executor"))
        role = res.scalar_one_or_none()
        if role:
            return role.id
        role = Role(
            tenant_id=tenant_id,
            name="Executor",
            description="Acesso operacional a Projetos (provisionado pelo TeamOps).",
            is_system=True,
        )
        db.add(role)
        await db.flush()
        for code in EXECUTOR_PERMISSIONS:
            db.add(RolePermission(role_id=role.id, permission_code=code))
        await db.flush()
        return role.id

    @staticmethod
    async def _provision_user(
        db: AsyncSession,
        person: Person,
        access_level: Optional[str],
        password: Optional[str],
        reset_password: Optional[str],
        tenant_id: Optional[uuid.UUID],
    ) -> None:
        """Cria/vincula/ajusta o login (public.users) conforme o nível de acesso.
        - none: desativa e desvincula o login (não apaga o User, preserva históricos).
        - com acesso (com_acesso/executor/gestor): company_user com a role do CARGO
          (matriz de permissões por cargo). Ninguém vira company_admin por aqui.
        access_level None = não muda o acesso (usado só para reset de senha)."""
        user: Optional[User] = None
        if person.user_id:
            user = (await db.execute(select(User).where(User.id == person.user_id))).scalar_one_or_none()

        if reset_password and user:
            PersonService._hash_validated(reset_password)
            user.hashed_password = get_password_hash(reset_password)
            user.updated_at = datetime.utcnow()

        if access_level is None:
            return

        if access_level == "none":
            if user:
                user.is_active = False
                user.updated_at = datetime.utcnow()
            person.user_id = None
            return

        # Acesso = company_user com a role do CARGO (matriz de permissões por cargo).
        target_role = UserRole.COMPANY_USER
        position = (await db.execute(
            select(Position).where(Position.id == person.position_id)
        )).scalar_one_or_none()
        if position is None:
            raise HTTPException(status_code=400, detail="Cargo da pessoa não encontrado para definir o acesso.")
        target_role_id = (await PositionService._get_or_create_role(db, position, tenant_id)).id

        if user is None:
            existing = (await db.execute(
                select(User).where(func.lower(User.email) == person.email.lower())
            )).scalar_one_or_none()
            if existing is None:
                if not password:
                    raise HTTPException(status_code=400, detail="Defina uma senha para criar o acesso.")
                await PersonService._assert_plan_limit(db, tenant_id)
                user = User(
                    email=person.email.lower(),
                    full_name=person.full_name,
                    hashed_password=PersonService._hash_validated(password),
                    role=target_role,
                    role_id=target_role_id,
                    tenant_id=tenant_id,
                    is_active=True,
                )
                db.add(user)
                await db.flush()
                person.user_id = user.id
                return
            if existing.tenant_id != tenant_id:
                raise HTTPException(status_code=400, detail="E-mail já usado por outro usuário.")
            user = existing  # revincula um usuário do mesmo tenant

        # usuário já vinculado (ou revinculado): ativa + ajusta nível
        if not user.is_active:
            await PersonService._assert_plan_limit(db, tenant_id)
        user.is_active = True
        user.role = target_role
        user.role_id = target_role_id
        user.full_name = person.full_name
        if password:
            user.hashed_password = PersonService._hash_validated(password)
        user.updated_at = datetime.utcnow()
        person.user_id = user.id

    @staticmethod
    async def _enrich_access(db: AsyncSession, persons: list[Person]) -> None:
        """Deriva access_level/user_active/user_email a partir do usuário vinculado."""
        user_ids = [p.user_id for p in persons if p.user_id]
        users_by_id: dict[uuid.UUID, User] = {}
        if user_ids:
            rows = await db.execute(select(User).where(User.id.in_(user_ids)))
            users_by_id = {u.id: u for u in rows.scalars().all()}
        for p in persons:
            u = users_by_id.get(p.user_id) if p.user_id else None
            if u is None:
                p.access_level = "none"
                p.user_active = None
                p.user_email = None
            else:
                # Acesso é regido pela role do cargo; "gestor" legado (company_admin) também conta.
                p.access_level = "gestor" if u.role == UserRole.COMPANY_ADMIN else "com_acesso"
                p.user_active = u.is_active
                p.user_email = u.email

    @staticmethod
    async def list_members(db: AsyncSession) -> list[TeamMemberResponse]:
        """Membros do time = Pessoas ativas com login ativo vinculado (para atribuição no kanban)."""
        rows = await db.execute(
            select(Person)
            .options(selectinload(Person.position))
            .where(Person.user_id.isnot(None), Person.status == PersonStatus.ATIVO)
            .order_by(Person.full_name.asc())
        )
        persons = list(rows.scalars().all())
        user_ids = [p.user_id for p in persons if p.user_id]
        users_by_id: dict[uuid.UUID, User] = {}
        if user_ids:
            urows = await db.execute(
                select(User).where(User.id.in_(user_ids), User.is_active == True)  # noqa: E712
            )
            users_by_id = {u.id: u for u in urows.scalars().all()}
        members: list[TeamMemberResponse] = []
        for p in persons:
            u = users_by_id.get(p.user_id)
            if u is None:
                continue
            members.append(TeamMemberResponse(
                id=u.id,
                person_id=p.id,
                full_name=p.full_name,
                email=u.email,
                position_name=p.position.name if p.position else None,
                access_level="gestor" if u.role == UserRole.COMPANY_ADMIN else "com_acesso",
            ))
        return members

    @staticmethod
    async def delete(db: AsyncSession, person_id: uuid.UUID) -> None:
        """
        Hard delete da pessoa. Stacks e ausências vinculadas vão junto via ON DELETE CASCADE.
        Referências em outras pessoas (PO, ref. técnica, superior) e em áreas (PO, coordenador,
        gerente, ref. técnica) e na coluna approver_person_id de ausências passam para NULL
        via ON DELETE SET NULL — comportamento esperado para remover alguém do organograma.
        Para apenas marcar como desligado, edite o status da pessoa.
        """
        item = await PersonService.get(db, person_id)
        await db.delete(item)
        await db.commit()


# ─────────────────────────────────────────────
# PersonStack
# ─────────────────────────────────────────────


class PersonStackService:
    @staticmethod
    async def list_for_person(db: AsyncSession, person_id: uuid.UUID) -> list[PersonStack]:
        await PersonService.get(db, person_id)
        result = await db.execute(
            select(PersonStack)
            .options(selectinload(PersonStack.stack))
            .where(PersonStack.person_id == person_id)
            .order_by(PersonStack.created_at.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def add(db: AsyncSession, person_id: uuid.UUID, data: PersonStackCreate) -> PersonStack:
        await PersonService.get(db, person_id)
        await StackService.get(db, data.stack_id)
        existing = await db.execute(
            select(PersonStack).where(
                PersonStack.person_id == person_id,
                PersonStack.stack_id == data.stack_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Esta stack já está vinculada à pessoa.")
        item = PersonStack(person_id=person_id, **data.model_dump())
        db.add(item)
        await db.commit()
        result = await db.execute(
            select(PersonStack)
            .options(selectinload(PersonStack.stack))
            .where(PersonStack.id == item.id)
        )
        return result.scalar_one()

    @staticmethod
    async def update(
        db: AsyncSession,
        person_id: uuid.UUID,
        person_stack_id: uuid.UUID,
        data: PersonStackUpdate,
    ) -> PersonStack:
        result = await db.execute(
            select(PersonStack)
            .options(selectinload(PersonStack.stack))
            .where(PersonStack.id == person_stack_id, PersonStack.person_id == person_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Vínculo de stack não encontrado.")
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(item)
        return item

    @staticmethod
    async def delete(db: AsyncSession, person_id: uuid.UUID, person_stack_id: uuid.UUID) -> None:
        result = await db.execute(
            select(PersonStack).where(
                PersonStack.id == person_stack_id,
                PersonStack.person_id == person_id,
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Vínculo de stack não encontrado.")
        await db.delete(item)
        await db.commit()


# ─────────────────────────────────────────────
# Absence
# ─────────────────────────────────────────────


class AbsenceService:
    @staticmethod
    async def list(
        db: AsyncSession,
        person_id: Optional[uuid.UUID] = None,
        status: Optional[AbsenceStatus] = None,
        start_from: Optional[date] = None,
        end_to: Optional[date] = None,
        area_id: Optional[uuid.UUID] = None,
    ) -> list[Absence]:
        q = select(Absence).options(
            selectinload(Absence.person),
            selectinload(Absence.absence_type),
            selectinload(Absence.approver_person),
        )
        filters = []
        if person_id:
            filters.append(Absence.person_id == person_id)
        if status:
            filters.append(Absence.status == status)
        if start_from:
            filters.append(Absence.end_date >= start_from)
        if end_to:
            filters.append(Absence.start_date <= end_to)
        if area_id:
            person_q = select(Person.id).where(Person.area_id == area_id)
            filters.append(Absence.person_id.in_(person_q))
        if filters:
            q = q.where(and_(*filters))
        q = q.order_by(Absence.start_date.desc())
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get(db: AsyncSession, absence_id: uuid.UUID) -> Absence:
        result = await db.execute(
            select(Absence)
            .options(
                selectinload(Absence.person),
                selectinload(Absence.absence_type),
                selectinload(Absence.approver_person),
            )
            .where(Absence.id == absence_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Ausência não encontrada.")
        return item

    @staticmethod
    async def create(db: AsyncSession, data: AbsenceCreate, requested_by: Optional[uuid.UUID]) -> Absence:
        await PersonService.get(db, data.person_id)
        absence_type = await AbsenceTypeService.get(db, data.absence_type_id)
        if data.end_date < data.start_date:
            raise HTTPException(status_code=400, detail="Data fim deve ser igual ou posterior à data início.")
        initial_status = (
            AbsenceStatus.PENDENTE if absence_type.requires_approval else AbsenceStatus.APROVADA
        )
        item = Absence(
            **data.model_dump(),
            status=initial_status,
            requested_by=requested_by,
            approved_at=datetime.utcnow() if initial_status == AbsenceStatus.APROVADA else None,
        )
        db.add(item)
        await db.commit()
        return await AbsenceService.get(db, item.id)

    @staticmethod
    async def update(db: AsyncSession, absence_id: uuid.UUID, data: AbsenceUpdate) -> Absence:
        item = await AbsenceService.get(db, absence_id)
        if item.status in (AbsenceStatus.APROVADA, AbsenceStatus.RECUSADA):
            raise HTTPException(status_code=400, detail="Não é possível editar uma ausência já decidida.")
        payload = data.model_dump(exclude_unset=True)
        if payload.get("absence_type_id"):
            await AbsenceTypeService.get(db, payload["absence_type_id"])
        new_start = payload.get("start_date", item.start_date)
        new_end = payload.get("end_date", item.end_date)
        if new_end < new_start:
            raise HTTPException(status_code=400, detail="Data fim deve ser igual ou posterior à data início.")
        for key, value in payload.items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        await db.commit()
        return await AbsenceService.get(db, item.id)

    @staticmethod
    async def delete(db: AsyncSession, absence_id: uuid.UUID) -> None:
        item = await AbsenceService.get(db, absence_id)
        await db.delete(item)
        await db.commit()

    @staticmethod
    async def decide(
        db: AsyncSession,
        absence_id: uuid.UUID,
        approve: bool,
        data: AbsenceDecision,
        approver_person_id: Optional[uuid.UUID],
    ) -> Absence:
        item = await AbsenceService.get(db, absence_id)
        if item.status != AbsenceStatus.PENDENTE:
            raise HTTPException(status_code=400, detail="Apenas ausências pendentes podem ser decididas.")
        item.status = AbsenceStatus.APROVADA if approve else AbsenceStatus.RECUSADA
        item.approver_person_id = approver_person_id
        item.approved_at = datetime.utcnow()
        item.decision_notes = data.decision_notes
        item.updated_at = datetime.utcnow()
        await db.commit()
        return await AbsenceService.get(db, item.id)

    @staticmethod
    async def calendar(db: AsyncSession, month: str) -> AbsenceCalendarResponse:
        try:
            year, m = month.split("-")
            year_i, month_i = int(year), int(m)
            first = date(year_i, month_i, 1)
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Formato de mês inválido. Use YYYY-MM.")
        if month_i == 12:
            last = date(year_i + 1, 1, 1) - timedelta(days=1)
        else:
            last = date(year_i, month_i + 1, 1) - timedelta(days=1)

        absences = await AbsenceService.list(db, start_from=first, end_to=last)
        days: list[AbsenceCalendarDay] = []
        cur = first
        while cur <= last:
            day_absences = [a for a in absences if a.start_date <= cur <= a.end_date]
            conflicts: list[str] = []
            # conflito: duas ou mais pessoas críticas no mesmo dia
            if len(day_absences) >= 2:
                approved = [a for a in day_absences if a.status == AbsenceStatus.APROVADA]
                if len(approved) >= 2:
                    conflicts.append(f"{len(approved)} pessoas ausentes no mesmo dia")
            days.append(AbsenceCalendarDay(day=cur, absences=day_absences, conflict_flags=conflicts))
            cur += timedelta(days=1)
        return AbsenceCalendarResponse(month=month, days=days)


# ─────────────────────────────────────────────
# Org Tree
# ─────────────────────────────────────────────


class OrgService:
    @staticmethod
    async def tree(db: AsyncSession) -> OrgTreeResponse:
        result = await db.execute(
            select(Person)
            .options(
                selectinload(Person.area),
                selectinload(Person.position),
            )
            .where(Person.status != PersonStatus.DESLIGADO)
            .order_by(Person.full_name.asc())
        )
        persons = list(result.scalars().all())

        nodes: dict[uuid.UUID, OrgNode] = {}
        for p in persons:
            position_mini = None
            if p.position:
                position_mini = {
                    "id": p.position.id,
                    "slug": p.position.slug,
                    "name": p.position.name,
                    "is_system": p.position.is_system,
                }
            nodes[p.id] = OrgNode(
                person={"id": p.id, "full_name": p.full_name, "position": position_mini},
                area_id=p.area_id,
                area_name=p.area.name if p.area else None,
                children=[],
            )

        roots: list[OrgNode] = []
        orphans: list[OrgNode] = []
        for p in persons:
            node = nodes[p.id]
            parent_id = p.manager_person_id or p.po_person_id
            if parent_id and parent_id in nodes:
                nodes[parent_id].children.append(node)
            else:
                slug = p.position.slug if p.position else ""
                if slug in ("gerente", "coordenador"):
                    roots.append(node)
                else:
                    orphans.append(node)
        return OrgTreeResponse(roots=roots, orphans=orphans)


# ─────────────────────────────────────────────
# Competency Map
# ─────────────────────────────────────────────


class CompetencyMapService:
    @staticmethod
    async def build(db: AsyncSession) -> CompetencyMapResponse:
        stacks_q = await db.execute(
            select(Stack).options(selectinload(Stack.category)).order_by(Stack.name.asc())
        )
        stacks = list(stacks_q.scalars().all())

        links_q = await db.execute(
            select(PersonStack)
            .options(selectinload(PersonStack.person), selectinload(PersonStack.stack))
        )
        links = list(links_q.scalars().all())

        by_stack: dict[uuid.UUID, list[PersonStack]] = {}
        for link in links:
            by_stack.setdefault(link.stack_id, []).append(link)

        entries: list[CompetencyMapEntry] = []
        for st in stacks:
            persons_links = by_stack.get(st.id, [])
            count = len(persons_links)
            has_ref = any(l.is_reference for l in persons_links)
            if st.is_critical and count <= 1:
                risk = "high"
            elif st.is_critical and count <= 2:
                risk = "medium"
            elif count == 0:
                risk = "medium"
            else:
                risk = "low"
            entries.append(
                CompetencyMapEntry(
                    stack={"id": st.id, "name": st.name, "slug": st.slug, "is_critical": st.is_critical},
                    category_id=st.category_id,
                    category_name=st.category.name if st.category else "",
                    person_count=count,
                    has_reference=has_ref,
                    risk_level=risk,
                    persons=[
                        CompetencyMapPerson(
                            person={
                                "id": l.person.id,
                                "full_name": l.person.full_name,
                                "team_role": l.person.team_role,
                            },
                            level=l.level,
                            years_experience=l.years_experience,
                            is_reference=l.is_reference,
                        )
                        for l in persons_links
                    ],
                )
            )
        return CompetencyMapResponse(entries=entries)


# ─────────────────────────────────────────────
# Alerts & Dashboard
# ─────────────────────────────────────────────


class AlertsService:
    @staticmethod
    async def build(db: AsyncSession) -> AlertsResponse:
        items: list[AlertItem] = []
        today = date.today()
        horizon_end = today + timedelta(days=60)

        # 1) Áreas sem PO
        areas_q = await db.execute(
            select(Area).where(Area.status == AreaStatus.ATIVA, Area.po_person_id.is_(None))
        )
        for area in areas_q.scalars().all():
            items.append(
                AlertItem(
                    code="area_without_po",
                    severity="medium",
                    title=f"Área '{area.name}' sem PO titular",
                    description="Defina um PO responsável para garantir o fluxo de priorização.",
                    related_area_ids=[area.id],
                )
            )

        # 2) Stacks críticas com 0 ou 1 pessoa
        comp_for_dashboard = await CompetencyMapService.build(db)
        for entry in comp_for_dashboard.entries:
            if entry.stack.is_critical and entry.person_count <= 1:
                items.append(
                    AlertItem(
                        code="critical_stack_no_backup",
                        severity="high",
                        title=f"Stack crítica '{entry.stack.name}' sem backup",
                        description=(
                            f"Existem {entry.person_count} pessoa(s) habilitada(s). "
                            "Capacite ao menos 2 para reduzir o risco operacional."
                        ),
                        related_stack_ids=[entry.stack.id],
                        related_person_ids=[p.person.id for p in entry.persons],
                    )
                )

        # 3) PO + ref técnica da mesma área ausentes no mesmo período (próximos 60 dias)
        approved_absences = await db.execute(
            select(Absence).where(
                Absence.status == AbsenceStatus.APROVADA,
                Absence.end_date >= today,
                Absence.start_date <= horizon_end,
            )
        )
        approved_list = list(approved_absences.scalars().all())
        by_person: dict[uuid.UUID, list[Absence]] = {}
        for a in approved_list:
            by_person.setdefault(a.person_id, []).append(a)

        areas_active = await db.execute(
            select(Area).where(Area.status == AreaStatus.ATIVA)
        )
        for area in areas_active.scalars().all():
            if not area.po_person_id or not area.tech_reference_person_id:
                continue
            po_abs = by_person.get(area.po_person_id, [])
            tech_abs = by_person.get(area.tech_reference_person_id, [])
            for pa in po_abs:
                for ta in tech_abs:
                    overlap_start = max(pa.start_date, ta.start_date)
                    overlap_end = min(pa.end_date, ta.end_date)
                    if overlap_start <= overlap_end:
                        items.append(
                            AlertItem(
                                code="po_and_tech_ref_absent",
                                severity="high",
                                title=f"Área '{area.name}': PO e Referência Técnica ausentes simultaneamente",
                                description=(
                                    f"Sobreposição de {overlap_start.isoformat()} a {overlap_end.isoformat()}."
                                ),
                                related_area_ids=[area.id],
                                related_person_ids=[area.po_person_id, area.tech_reference_person_id],
                            )
                        )

        # 4) Mesma stack crítica: 2+ ausências sobrepostas
        ps_q = await db.execute(
            select(PersonStack).options(selectinload(PersonStack.stack))
        )
        ps_list = list(ps_q.scalars().all())
        stack_to_persons: dict[uuid.UUID, list[uuid.UUID]] = {}
        critical_stacks: dict[uuid.UUID, Stack] = {}
        for ps in ps_list:
            if ps.stack and ps.stack.is_critical:
                stack_to_persons.setdefault(ps.stack_id, []).append(ps.person_id)
                critical_stacks[ps.stack_id] = ps.stack

        for stack_id, person_ids in stack_to_persons.items():
            absences_in_stack: list[Absence] = []
            for pid in person_ids:
                absences_in_stack.extend(by_person.get(pid, []))
            for i in range(len(absences_in_stack)):
                for j in range(i + 1, len(absences_in_stack)):
                    a, b = absences_in_stack[i], absences_in_stack[j]
                    if a.person_id == b.person_id:
                        continue
                    overlap_start = max(a.start_date, b.start_date)
                    overlap_end = min(a.end_date, b.end_date)
                    if overlap_start <= overlap_end:
                        stack = critical_stacks[stack_id]
                        items.append(
                            AlertItem(
                                code="critical_stack_overlap",
                                severity="high",
                                title=f"Stack crítica '{stack.name}': múltiplas ausências sobrepostas",
                                description=(
                                    f"De {overlap_start.isoformat()} a {overlap_end.isoformat()} — "
                                    "considere replanejar as entregas dependentes."
                                ),
                                related_stack_ids=[stack_id],
                                related_person_ids=[a.person_id, b.person_id],
                            )
                        )
        return AlertsResponse(items=items)


class DashboardService:
    @staticmethod
    async def kpis(db: AsyncSession) -> DashboardKpis:
        today = date.today()

        active = await db.execute(
            select(func.count(Person.id)).where(Person.status == PersonStatus.ATIVO)
        )

        on_vac = await db.execute(
            select(func.count(func.distinct(Absence.person_id))).where(
                Absence.status == AbsenceStatus.APROVADA,
                Absence.start_date <= today,
                Absence.end_date >= today,
            )
        )

        pending = await db.execute(
            select(func.count(Absence.id)).where(Absence.status == AbsenceStatus.PENDENTE)
        )

        comp = await CompetencyMapService.build(db)
        critical_without_backup = sum(
            1 for e in comp.entries if e.stack.is_critical and e.person_count <= 1
        )

        areas_no_po = await db.execute(
            select(func.count(Area.id)).where(
                Area.status == AreaStatus.ATIVA, Area.po_person_id.is_(None)
            )
        )

        by_area = await db.execute(
            select(Area.name, func.count(Person.id))
            .join(Person, Person.area_id == Area.id, isouter=True)
            .group_by(Area.name)
            .order_by(Area.name.asc())
        )
        by_area_list = [{"area": row[0], "count": row[1]} for row in by_area.all()]

        # "Por cargo" — agrupa pelo Position (team_role foi removido na unificação de usuários)
        by_role = await db.execute(
            select(Position.name, func.count(Person.id))
            .select_from(Person)
            .join(Position, Person.position_id == Position.id, isouter=True)
            .group_by(Position.name)
            .order_by(func.count(Person.id).desc())
        )
        by_role_list = [{"role": row[0] or "Sem cargo", "count": row[1]} for row in by_role.all()]

        return DashboardKpis(
            active_persons=active.scalar() or 0,
            on_vacation_today=on_vac.scalar() or 0,
            pending_approvals=pending.scalar() or 0,
            critical_stacks_without_backup=critical_without_backup,
            areas_without_po=areas_no_po.scalar() or 0,
            persons_by_area=by_area_list,
            persons_by_role=by_role_list,
        )
