"""Rotas REST do módulo TeamOps."""
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from app.core.dependencies import ModuleContext, require_module, require_permission
from app.modules.teamops.models import AbsenceStatus, PersonStatus
from app.modules.teamops.schemas import (
    AbsenceCalendarResponse,
    AbsenceCreate,
    AbsenceDecision,
    AbsenceResponse,
    AbsenceTypeCreate,
    AbsenceTypeResponse,
    AbsenceTypeUpdate,
    AbsenceUpdate,
    AlertsResponse,
    AreaCreate,
    AreaResponse,
    AreaUpdate,
    CompetencyMapResponse,
    DashboardKpis,
    HolidayCreate,
    HolidayResponse,
    OrgTreeResponse,
    PersonCreate,
    PersonResponse,
    PersonStackCreate,
    PersonStackResponse,
    PersonStackUpdate,
    PersonUpdate,
    TeamMemberResponse,
    CatalogPermission,
    PositionPermissionsUpdate,
    PositionCreate,
    PositionResponse,
    PositionUpdate,
    StackCategoryCreate,
    StackCategoryResponse,
    StackCategoryUpdate,
    StackCreate,
    StackResponse,
    StackUpdate,
    WorkCalendarResponse,
    WorkCalendarUpdate,
)
from app.modules.teamops.service import (
    AbsenceService,
    AbsenceTypeService,
    AlertsService,
    AreaService,
    CompetencyMapService,
    DashboardService,
    OrgService,
    PersonService,
    PersonStackService,
    PositionService,
    StackCategoryService,
    StackService,
    WorkCalendarService,
)
from app.modules.teamops.models import Person
from app.modules.super_admin.models import UserRole

router = APIRouter(prefix="/teamops", tags=["TeamOps"])
_ctx = require_module("teamops")

_can_org_manage = require_permission("teamops.org.manage")
_can_person_manage = require_permission("teamops.person.manage")
_can_stack_manage = require_permission("teamops.stack.manage")
_can_person_stack_manage = require_permission("teamops.person_stack.manage")
_can_absence_approve = require_permission("teamops.absence.approve")
_can_absence_manage = require_permission("teamops.absence.manage")
_can_config_manage = require_permission("teamops.config.manage")


async def _current_person_id(ctx: ModuleContext) -> Optional[uuid.UUID]:
    """Resolve o Person.id do usuário autenticado (se vinculado)."""
    if not ctx.user.id:
        return None
    result = await ctx.db.execute(select(Person.id).where(Person.user_id == ctx.user.id))
    return result.scalar_one_or_none()


# ─────────────────────────────────────────────
# Dashboard / Alerts / Org / Competency
# ─────────────────────────────────────────────


@router.get("/dashboard", response_model=DashboardKpis)
async def get_dashboard(ctx: ModuleContext = Depends(_ctx)):
    return await DashboardService.kpis(ctx.db)


@router.get("/alerts", response_model=AlertsResponse)
async def get_alerts(ctx: ModuleContext = Depends(_ctx)):
    return await AlertsService.build(ctx.db)


@router.get("/org/tree", response_model=OrgTreeResponse)
async def get_org_tree(ctx: ModuleContext = Depends(_ctx)):
    return await OrgService.area_tree(ctx.db)


@router.get("/competency-map", response_model=CompetencyMapResponse)
async def get_competency_map(ctx: ModuleContext = Depends(_ctx)):
    return await CompetencyMapService.build(ctx.db)


# ─────────────────────────────────────────────
# Areas
# ─────────────────────────────────────────────


@router.get("/areas", response_model=list[AreaResponse])
async def list_areas(active_only: bool = Query(False), ctx: ModuleContext = Depends(_ctx)):
    return await AreaService.list(ctx.db, active_only=active_only)


@router.post("/areas", response_model=AreaResponse, status_code=201)
async def create_area(
    data: AreaCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_org_manage),
):
    return await AreaService.create(ctx.db, data)


@router.get("/areas/{area_id}", response_model=AreaResponse)
async def get_area(area_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await AreaService.get(ctx.db, area_id)


@router.patch("/areas/{area_id}", response_model=AreaResponse)
async def update_area(
    area_id: uuid.UUID,
    data: AreaUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_org_manage),
):
    return await AreaService.update(ctx.db, area_id, data)


@router.delete("/areas/{area_id}", status_code=204)
async def delete_area(
    area_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_org_manage),
):
    await AreaService.delete(ctx.db, area_id)


# ─────────────────────────────────────────────
# Positions (cargos)
# ─────────────────────────────────────────────


@router.get("/positions", response_model=list[PositionResponse])
async def list_positions(active_only: bool = Query(False), ctx: ModuleContext = Depends(_ctx)):
    return await PositionService.list(ctx.db, active_only=active_only)


@router.post("/positions", response_model=PositionResponse, status_code=201)
async def create_position(
    data: PositionCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config_manage),
):
    return await PositionService.create(ctx.db, data)


@router.patch("/positions/{position_id}", response_model=PositionResponse)
async def update_position(
    position_id: uuid.UUID,
    data: PositionUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config_manage),
):
    return await PositionService.update(ctx.db, position_id, data)


@router.delete("/positions/{position_id}", status_code=204)
async def delete_position(
    position_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config_manage),
):
    await PositionService.delete(ctx.db, position_id)


@router.get("/permissions-catalog", response_model=list[CatalogPermission])
async def permissions_catalog(ctx: ModuleContext = Depends(_ctx), _=Depends(_can_config_manage)):
    """Catálogo de permissões dos módulos ATIVOS do tenant (para a matriz de acesso por cargo)."""
    return await PositionService.permissions_catalog(ctx.db, ctx.user.tenant_id)


@router.get("/positions/{position_id}/permissions", response_model=list[str])
async def get_position_permissions(
    position_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config_manage),
):
    return await PositionService.get_permissions(ctx.db, position_id)


@router.put("/positions/{position_id}/permissions", response_model=list[str])
async def set_position_permissions(
    position_id: uuid.UUID,
    data: PositionPermissionsUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config_manage),
):
    return await PositionService.set_permissions(ctx.db, position_id, data.codes, ctx.user.tenant_id)


@router.post("/positions/{position_id}/access-role")
async def ensure_position_access_role(
    position_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config_manage),
):
    """Garante o role do cargo e devolve seu id — chave usada no access_control dos kanbans."""
    role_id = await PositionService.ensure_role(ctx.db, position_id, ctx.user.tenant_id)
    return {"role_id": str(role_id)}


# ─────────────────────────────────────────────
# Stack Categories
# ─────────────────────────────────────────────


@router.get("/stack-categories", response_model=list[StackCategoryResponse])
async def list_stack_categories(active_only: bool = Query(False), ctx: ModuleContext = Depends(_ctx)):
    return await StackCategoryService.list(ctx.db, active_only=active_only)


@router.post("/stack-categories", response_model=StackCategoryResponse, status_code=201)
async def create_stack_category(
    data: StackCategoryCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_stack_manage),
):
    return await StackCategoryService.create(ctx.db, data)


@router.patch("/stack-categories/{category_id}", response_model=StackCategoryResponse)
async def update_stack_category(
    category_id: uuid.UUID,
    data: StackCategoryUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_stack_manage),
):
    return await StackCategoryService.update(ctx.db, category_id, data)


@router.delete("/stack-categories/{category_id}", status_code=204)
async def delete_stack_category(
    category_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_stack_manage),
):
    await StackCategoryService.delete(ctx.db, category_id)


# ─────────────────────────────────────────────
# Stacks
# ─────────────────────────────────────────────


@router.get("/stacks", response_model=list[StackResponse])
async def list_stacks(
    category_id: Optional[uuid.UUID] = Query(None),
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    return await StackService.list(ctx.db, category_id=category_id, active_only=active_only)


@router.post("/stacks", response_model=StackResponse, status_code=201)
async def create_stack(
    data: StackCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_stack_manage),
):
    return await StackService.create(ctx.db, data)


@router.patch("/stacks/{stack_id}", response_model=StackResponse)
async def update_stack(
    stack_id: uuid.UUID,
    data: StackUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_stack_manage),
):
    return await StackService.update(ctx.db, stack_id, data)


@router.delete("/stacks/{stack_id}", status_code=204)
async def delete_stack(
    stack_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_stack_manage),
):
    await StackService.delete(ctx.db, stack_id)


# ─────────────────────────────────────────────
# Absence Types
# ─────────────────────────────────────────────


@router.get("/absence-types", response_model=list[AbsenceTypeResponse])
async def list_absence_types(active_only: bool = Query(False), ctx: ModuleContext = Depends(_ctx)):
    return await AbsenceTypeService.list(ctx.db, active_only=active_only)


@router.post("/absence-types", response_model=AbsenceTypeResponse, status_code=201)
async def create_absence_type(
    data: AbsenceTypeCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config_manage),
):
    return await AbsenceTypeService.create(ctx.db, data)


@router.patch("/absence-types/{type_id}", response_model=AbsenceTypeResponse)
async def update_absence_type(
    type_id: uuid.UUID,
    data: AbsenceTypeUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config_manage),
):
    return await AbsenceTypeService.update(ctx.db, type_id, data)


@router.delete("/absence-types/{type_id}", status_code=204)
async def delete_absence_type(
    type_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config_manage),
):
    await AbsenceTypeService.delete(ctx.db, type_id)


# ─────────────────────────────────────────────
# Persons
# ─────────────────────────────────────────────


@router.get("/persons", response_model=list[PersonResponse])
async def list_persons(
    area_id: Optional[uuid.UUID] = Query(None),
    position_id: Optional[uuid.UUID] = Query(None),
    status: Optional[PersonStatus] = Query(None),
    search: Optional[str] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await PersonService.list(
        ctx.db, area_id=area_id, position_id=position_id, status=status, search=search,
    )


@router.get("/members", response_model=list[TeamMemberResponse])
async def list_members(ctx: ModuleContext = Depends(_ctx)):
    """Membros do time (pessoas com login ativo) — usado no seletor de responsável do kanban."""
    return await PersonService.list_members(ctx.db)


@router.post("/persons", response_model=PersonResponse, status_code=201)
async def create_person(
    data: PersonCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_person_manage),
):
    return await PersonService.create(ctx.db, data, tenant_id=ctx.user.tenant_id)


@router.get("/persons/{person_id}", response_model=PersonResponse)
async def get_person(person_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await PersonService.get(ctx.db, person_id)


@router.patch("/persons/{person_id}", response_model=PersonResponse)
async def update_person(
    person_id: uuid.UUID,
    data: PersonUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_person_manage),
):
    return await PersonService.update(ctx.db, person_id, data, tenant_id=ctx.user.tenant_id)


@router.delete("/persons/{person_id}", status_code=204)
async def delete_person(
    person_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_person_manage),
):
    await PersonService.delete(ctx.db, person_id)


# ─────────────────────────────────────────────
# PersonStacks
# ─────────────────────────────────────────────


@router.get("/persons/{person_id}/stacks", response_model=list[PersonStackResponse])
async def list_person_stacks(person_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await PersonStackService.list_for_person(ctx.db, person_id)


@router.post("/persons/{person_id}/stacks", response_model=PersonStackResponse, status_code=201)
async def add_person_stack(
    person_id: uuid.UUID,
    data: PersonStackCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_person_stack_manage),
):
    return await PersonStackService.add(ctx.db, person_id, data)


@router.patch("/persons/{person_id}/stacks/{person_stack_id}", response_model=PersonStackResponse)
async def update_person_stack(
    person_id: uuid.UUID,
    person_stack_id: uuid.UUID,
    data: PersonStackUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_person_stack_manage),
):
    return await PersonStackService.update(ctx.db, person_id, person_stack_id, data)


@router.delete("/persons/{person_id}/stacks/{person_stack_id}", status_code=204)
async def delete_person_stack(
    person_id: uuid.UUID,
    person_stack_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_person_stack_manage),
):
    await PersonStackService.delete(ctx.db, person_id, person_stack_id)


# ─────────────────────────────────────────────
# Absences
# ─────────────────────────────────────────────


@router.get("/absences", response_model=list[AbsenceResponse])
async def list_absences(
    person_id: Optional[uuid.UUID] = Query(None),
    status: Optional[AbsenceStatus] = Query(None),
    start_from: Optional[date] = Query(None),
    end_to: Optional[date] = Query(None),
    area_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    # Usuário comum (sem manage/approve) só vê as próprias
    if ctx.user.role == UserRole.COMPANY_USER:
        my_pid = await _current_person_id(ctx)
        if my_pid:
            person_id = my_pid
    return await AbsenceService.list(
        ctx.db,
        person_id=person_id,
        status=status,
        start_from=start_from,
        end_to=end_to,
        area_id=area_id,
    )


@router.get("/absences/calendar", response_model=AbsenceCalendarResponse)
async def absences_calendar(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"), ctx: ModuleContext = Depends(_ctx)):
    return await AbsenceService.calendar(ctx.db, month)


@router.post("/absences", response_model=AbsenceResponse, status_code=201)
async def create_absence(
    data: AbsenceCreate,
    ctx: ModuleContext = Depends(_ctx),
):
    # company_user só pode criar pra si mesmo (precisa ter Person vinculada)
    if ctx.user.role == UserRole.COMPANY_USER:
        my_pid = await _current_person_id(ctx)
        if not my_pid or data.person_id != my_pid:
            raise HTTPException(status_code=403, detail="Você só pode solicitar ausências para si mesmo.")
    return await AbsenceService.create(ctx.db, data, requested_by=ctx.user.id)


@router.patch("/absences/{absence_id}", response_model=AbsenceResponse)
async def update_absence(
    absence_id: uuid.UUID,
    data: AbsenceUpdate,
    ctx: ModuleContext = Depends(_ctx),
):
    absence = await AbsenceService.get(ctx.db, absence_id)
    if ctx.user.role == UserRole.COMPANY_USER:
        my_pid = await _current_person_id(ctx)
        if not my_pid or absence.person_id != my_pid:
            raise HTTPException(status_code=403, detail="Você só pode editar suas próprias ausências.")
    return await AbsenceService.update(ctx.db, absence_id, data)


@router.delete("/absences/{absence_id}", status_code=204)
async def delete_absence(
    absence_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    absence = await AbsenceService.get(ctx.db, absence_id)
    if ctx.user.role == UserRole.COMPANY_USER:
        my_pid = await _current_person_id(ctx)
        if not my_pid or absence.person_id != my_pid:
            raise HTTPException(status_code=403, detail="Você só pode remover suas próprias ausências.")
    await AbsenceService.delete(ctx.db, absence_id)


@router.post("/absences/{absence_id}/approve", response_model=AbsenceResponse)
async def approve_absence(
    absence_id: uuid.UUID,
    data: AbsenceDecision = AbsenceDecision(),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_absence_approve),
):
    approver_pid = await _current_person_id(ctx)
    return await AbsenceService.decide(ctx.db, absence_id, approve=True, data=data, approver_person_id=approver_pid)


@router.post("/absences/{absence_id}/reject", response_model=AbsenceResponse)
async def reject_absence(
    absence_id: uuid.UUID,
    data: AbsenceDecision = AbsenceDecision(),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_absence_approve),
):
    approver_pid = await _current_person_id(ctx)
    return await AbsenceService.decide(ctx.db, absence_id, approve=False, data=data, approver_person_id=approver_pid)


# ─────────────────────────────────────────────
# Calendário de trabalho + feriados (base do cronograma)
# ─────────────────────────────────────────────


@router.get("/work-calendar", response_model=WorkCalendarResponse)
async def get_work_calendar(ctx: ModuleContext = Depends(_ctx)):
    return await WorkCalendarService.get(ctx.db)


@router.put("/work-calendar", response_model=WorkCalendarResponse)
async def update_work_calendar(
    data: WorkCalendarUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config_manage),
):
    return await WorkCalendarService.update(ctx.db, data)


@router.get("/holidays", response_model=list[HolidayResponse])
async def list_holidays(ctx: ModuleContext = Depends(_ctx)):
    return await WorkCalendarService.list_holidays(ctx.db)


@router.post("/holidays", response_model=HolidayResponse, status_code=201)
async def create_holiday(
    data: HolidayCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config_manage),
):
    return await WorkCalendarService.create_holiday(ctx.db, data)


@router.delete("/holidays/{holiday_id}", status_code=204)
async def delete_holiday(
    holiday_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config_manage),
):
    await WorkCalendarService.delete_holiday(ctx.db, holiday_id)
