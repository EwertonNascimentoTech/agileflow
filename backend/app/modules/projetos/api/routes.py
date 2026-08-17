import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select

from app.core import storage
from app.core.config import settings
from app.core.dependencies import (
    ModuleContext,
    has_permission_cached,
    require_module,
    require_permission,
)
from app.modules.projetos.schemas import (
    CriticalPathItem,
    ProjectCardAvailableField,
    ProjectCardFieldResponse,
    ProjectCardFieldsUpdate,
    PriorityCriteriaUpsert,
    PriorityCriterionResponse,
    PriorityConfidenceResponse,
    PriorityConfidenceUpsert,
    PriorityComputeResult,
    PriorityMatrixItem,
    PriorityScoreHistoryItem,
    PriorityPillarResponse,
    PriorityPillarsUpsert,
    PriorityQuadrantResponse,
    PriorityQuadrantsUpsert,
    PriorityScoreInput,
    PriorityScoreResponse,
    PrioritySettingsResponse,
    PrioritySettingsUpdate,
    ProjectAutomationRuleCreate,
    ProjectAutomationRuleResponse,
    ProjectAutomationRuleUpdate,
    ProjectCreate,
    ProjectDemandFormFieldCreate,
    ProjectDemandFormFieldReorder,
    ProjectDemandFormFieldResponse,
    ProjectDemandFormFieldUpdate,
    ProjectDemandFormSectionCreate,
    ProjectDemandFormSectionReorder,
    ProjectDemandFormSectionResponse,
    ProjectDemandFormSectionUpdate,
    ProjectDefaultFormFieldResponse,
    ProjectDefaultFormFieldsUpdate,
    ProjectDemandFormSubmissionResponse,
    ProjectDemandFormSubmissionUpsert,
    ProjectDemandTypeCreate,
    ProjectDemandTypeReorder,
    ProjectDemandTypeResponse,
    ProjectDemandTypeUpdate,
    ProjectFunnelCreate,
    ProjectFunnelReorder,
    ProjectFunnelResponse,
    ProjectFunnelUpdate,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectReportsResponse,
    UsDeliveryReportResponse,
    TeamPerformanceResponse,
    ProjectResponse,
    ProjectScheduleBindingResponse,
    ProjectScheduleBindingsUpsert,
    ProjectStageAgentBindingCreate,
    ProjectStageAgentBindingResponse,
    ProjectStageAgentBindingUpdate,
    ProjectAgentExecutionResponse,
    ProjectAgentExecutionLogPage,
    ProjectStatusCreate,
    ProjectStatusReorder,
    ProjectStatusResponse,
    ProjectStatusDefaultFormLinkCreate,
    ProjectStatusDefaultFormLinkResponse,
    ProjectStatusSectionLinkCreate,
    ProjectStatusSectionLinkResponse,
    ProjectStatusUpdate,
    ProjectTaskCommentCreate,
    ProjectTaskCommentResponse,
    UsCommitEvidenceState,
    UsCommitItem,
    UsCommitLinkIn,
    ProjectTaskStatusHistoryResponse,
    ProjectTaskCreate,
    ScheduleBaselineCreateIn,
    ScheduleBaselineResponse,
    ScheduleLockState,
    ScheduleRevisionCloseIn,
    ScheduleStageCreate,
    TaskImportResult,
    ProjectRefMini,
    ProjectProgramCreate,
    ProjectProgramUpdate,
    ProjectProgramResponse,
    ProjectTaskCardResponse,
    ProjectTaskResponse,
    ProjectTaskUpdate,
    PlanningClassificationUpdate,
    ProjectTaskReorder,
    ProjectTaskWithContextResponse,
    ProjectMyRequestResponse,
    ProjectUpdate,
    ProjectUploadResponse,
    ProjectUploadUrlResponse,
    TaskDependencyCreate,
    TaskDependencyResponse,
    WorkloadResponse,
    CapacityHeatmapResponse,
    CapacityDayDetailResponse,
    CapacityByProjectResponse,
    CapacityGapsResponse,
    FreePeopleResponse,
    PersonCapacityWindowResponse,
    ScheduleScenarioRequest,
    ScheduleScenarioResponse,
    ScheduleOverloadResponse,
    SimTasksResponse,
    ScenarioRequest,
    ScenarioResult,
    ScenarioSuggestionsResponse,
    CrossTeamResponse,
    AssigneeAbsenceItem,
    AssigneeAbsencesResponse,
    PoPortfolioResponse,
    PoOption,
    PoOverviewResponse,
    StatusReportPreviewIn,
    StatusReportCreateIn,
    StatusReportListItem,
    StatusReportResponse,
)
from app.modules.projetos.service import (
    PoPortfolioService,
    PoSyncService,
    ScheduleBaselineService,
    PriorityConfigService,
    PriorityScoreService,
    ProjectAutomationService,
    ProjectCardFieldService,
    ProjectDefaultFormService,
    ProjectDemandFormFieldService,
    ProjectDemandFormSectionService,
    ProjectDemandFormSubmissionService,
    ProjectDemandTypeService,
    ProjectFunnelService,
    ProjectImportService,
    ProjectMemberService,
    ProjectReportsService,
    UsDeliveryReportService,
    TeamPerformanceService,
    ProjectScheduleBindingService,
    ProjectStageAgentService,
    ProjectService,
    ProjectProgramService,
    ProjectStatusService,
    ProjectTaskCommentService,
    UsCommitEvidenceService,
    ProjectTaskStatusHistoryService,
    ProjectTaskService,
    ProjectStatusDefaultFormLinkService,
    ProjectStatusSectionLinkService,
    StatusReportService,
    TaskDependencyService,
    CapacityService,
)
from app.modules.super_admin.models import Role, RolePermission, UserRole

router = APIRouter(prefix="/projetos", tags=["Projetos"])
_ctx = require_module("projetos")

_can_project_manage = require_permission("projetos.project.manage")
_can_status_manage = require_permission("projetos.status.manage")
_can_comment_manage = require_permission("projetos.comment.manage")
_can_demand_type_manage = require_permission("projetos.demand_type.manage")
_can_form_manage = require_permission("projetos.form.manage")
_can_automation_manage = require_permission("projetos.automation.manage")
_can_priority_manage = require_permission("projetos.priority.manage")
_can_priority_score = require_permission("projetos.priority.score")
_can_view_performance = require_permission("projetos.performance.view")


async def _has_permission(ctx: ModuleContext, code: str) -> bool:
    # Delega ao helper cacheado (auth:perm:*). O board consulta permissão 2-3 vezes
    # por request; sem cache cada consulta era um round-trip ao banco.
    return await has_permission_cached(ctx.user, code)


async def _is_basic_user(ctx: ModuleContext) -> bool:
    if ctx.user.role != UserRole.COMPANY_USER:
        return False
    if not ctx.user.role_id:
        return True
    result = await ctx.db.execute(select(Role).where(Role.id == ctx.user.role_id))
    role = result.scalar_one_or_none()
    role_name = (role.name if role else "").strip().lower()
    return role_name in ("", "basic")


def _ensure_uuid(value: Optional[uuid.UUID]) -> Optional[uuid.UUID]:
    return value if value else None


_NOBODY = uuid.UUID(int=0)  # sentinela: não casa com nenhum person_id real


async def _cached_person_lookup(key: str, resolve) -> Optional[uuid.UUID]:
    """Memoiza um lookup de person_id que devolve Optional[UUID].

    O valor é embrulhado num dict porque `cache_get` devolve None tanto em miss
    quanto em valor nulo — sem o envelope não dava para distinguir "não sei" de
    "sei que é None", e o caso None (a maioria dos usuários) nunca seria cacheado.
    """
    from app.core.cache import cache_get, cache_set

    if settings.AUTH_CACHE_TTL <= 0:
        return await resolve()

    cached = await cache_get(key)
    if isinstance(cached, dict):
        raw = cached.get("pid")
        return uuid.UUID(raw) if raw else None

    person_id = await resolve()
    await cache_set(key, {"pid": str(person_id) if person_id else None},
                    settings.AUTH_CACHE_TTL)
    return person_id


async def _person_id_for_user(ctx: ModuleContext) -> Optional[uuid.UUID]:
    """person_id (teamops) do usuário logado — o responsável da tarefa agora é uma Pessoa."""
    from app.core.cache import person_key
    from app.modules.teamops.models import Person

    async def _resolve() -> Optional[uuid.UUID]:
        res = await ctx.db.execute(select(Person.id).where(Person.user_id == ctx.user.id))
        return res.scalar_one_or_none()

    return await _cached_person_lookup(person_key(ctx.user.id), _resolve)


async def _po_external_person_id(ctx: ModuleContext) -> Optional[uuid.UUID]:
    """person_id do usuário quando ele é um Product Owner (Externo); None caso contrário.

    Admins (super/company) nunca entram no recorte. Um PO Externo sem Pessoa vinculada
    cai no sentinela _NOBODY, então não enxerga nada — nunca o portfólio inteiro.

    Cacheado: `_assert_task_in_scope` chama isto em TODA rota per-card (comentários,
    histórico, prioridade, filhos...), então abrir um card fazia o lookup ~10 vezes.
    Invalidação via `invalidate_po_external` ao trocar o Cargo de uma Pessoa."""
    from app.core.cache import po_external_person_key

    if ctx.user.role in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN):
        return None

    return await _cached_person_lookup(
        po_external_person_key(ctx.user.id), lambda: _po_external_person_id_uncached(ctx)
    )


async def _po_external_person_id_uncached(ctx: ModuleContext) -> Optional[uuid.UUID]:
    from app.modules.teamops.models import Person, Position
    from app.modules.teamops.service import PO_EXTERNAL_POSITION_SLUGS

    ext_slugs = sorted(PO_EXTERNAL_POSITION_SLUGS)
    res = await ctx.db.execute(
        select(Person.id)
        .join(Position, Position.id == Person.position_id)
        .where(Person.user_id == ctx.user.id, Position.slug.in_(ext_slugs))
    )
    person_id = res.scalar_one_or_none()
    if person_id is not None:
        return person_id

    # Login sem Pessoa vinculada: o cargo ainda aparece na role do usuário
    # ("Cargo · {nome}", criada por PositionService). Sem Pessoa não há projeto sob a
    # responsabilidade dele — escopo vazio, jamais o portfólio inteiro.
    if not ctx.user.role_id:
        return None
    role_name = (await ctx.db.execute(
        select(Role.name).where(Role.id == ctx.user.role_id)
    )).scalar_one_or_none()
    if not role_name:
        return None
    ext_names = (await ctx.db.execute(
        select(Position.name).where(Position.slug.in_(ext_slugs))
    )).scalars().all()
    if role_name.strip() in {f"Cargo · {n}" for n in ext_names}:
        return _NOBODY
    return None


async def _po_external_scope(ctx: ModuleContext) -> Optional[set[uuid.UUID]]:
    """Conjunto de cards visíveis se o usuário for PO Externo; None = sem recorte."""
    person_id = await _po_external_person_id(ctx)
    if person_id is None:
        return None
    return await ProjectTaskService.po_external_scope_task_ids(
        ctx.db, person_id, user_id=ctx.user.id
    )


async def _deny_po_external(ctx: ModuleContext = Depends(_ctx)) -> None:
    """Dependency das visões consolidadas do portfólio (PMO, PO Sync, Capacidade,
    Status Reports, Relatórios). O Product Owner (Externo) enxerga só os projetos que
    lidera, então esses agregados ficam fora do alcance dele — inclusive por URL direta,
    já que esconder o item de menu não protege a API."""
    if await _po_external_person_id(ctx) is not None:
        raise HTTPException(
            status_code=403,
            detail="Visão consolidada do portfólio indisponível para Product Owner (Externo).",
        )


async def _assert_task_in_scope(ctx: ModuleContext, task_id: uuid.UUID) -> None:
    """Barra o PO Externo em qualquer card fora dos projetos que ele lidera.
    Responde 404 (e não 403) para não revelar a existência do card."""
    scope = await _po_external_scope(ctx)
    if scope is None:
        return
    if task_id not in scope:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")


@router.get("/projects", response_model=list[ProjectResponse])
async def list_projects(
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectService.list(ctx.db, active_only=active_only)


@router.post("/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
    data: ProjectCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_project_manage),
):
    return await ProjectService.create(ctx.db, data)


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await ProjectService.get(ctx.db, project_id)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_project_manage),
):
    return await ProjectService.update(ctx.db, project_id, data)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_project_manage),
):
    await ProjectService.delete(ctx.db, project_id)


@router.get("/config/demand-types", response_model=list[ProjectDemandTypeResponse])
async def list_demand_types(
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    types = await ProjectDemandTypeService.list(ctx.db, active_only=active_only)
    # Usuário basic só enxerga (e só pode solicitar) tipos disponíveis para basic.
    if await _is_basic_user(ctx):
        types = [t for t in types if t.available_for_basic]
    return types


@router.post("/config/demand-types", response_model=ProjectDemandTypeResponse, status_code=201)
async def create_demand_type(
    data: ProjectDemandTypeCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_demand_type_manage),
):
    return await ProjectDemandTypeService.create(ctx.db, data)


@router.patch("/config/demand-types/reorder", response_model=list[ProjectDemandTypeResponse])
async def reorder_demand_types(
    data: ProjectDemandTypeReorder,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_demand_type_manage),
):
    return await ProjectDemandTypeService.reorder(ctx.db, data.items)


@router.patch("/config/demand-types/{demand_type_id}", response_model=ProjectDemandTypeResponse)
async def update_demand_type(
    demand_type_id: uuid.UUID,
    data: ProjectDemandTypeUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_demand_type_manage),
):
    return await ProjectDemandTypeService.update(ctx.db, demand_type_id, data)


@router.delete("/config/demand-types/{demand_type_id}", status_code=204)
async def delete_demand_type(
    demand_type_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_demand_type_manage),
):
    await ProjectDemandTypeService.delete(ctx.db, demand_type_id)


@router.get("/config/demand-types/{demand_type_id}/sections", response_model=list[ProjectDemandFormSectionResponse])
async def list_demand_sections(
    demand_type_id: uuid.UUID,
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectDemandFormSectionService.list(ctx.db, demand_type_id, active_only=active_only)


@router.post("/config/demand-types/{demand_type_id}/sections", response_model=ProjectDemandFormSectionResponse, status_code=201)
async def create_demand_section(
    demand_type_id: uuid.UUID,
    data: ProjectDemandFormSectionCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    return await ProjectDemandFormSectionService.create(ctx.db, demand_type_id, data)


@router.patch("/config/demand-types/{demand_type_id}/sections/reorder", response_model=list[ProjectDemandFormSectionResponse])
async def reorder_demand_sections(
    demand_type_id: uuid.UUID,
    data: ProjectDemandFormSectionReorder,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    return await ProjectDemandFormSectionService.reorder(ctx.db, demand_type_id, data.items)


@router.patch("/config/demand-types/{demand_type_id}/sections/{section_id}", response_model=ProjectDemandFormSectionResponse)
async def update_demand_section(
    demand_type_id: uuid.UUID,
    section_id: uuid.UUID,
    data: ProjectDemandFormSectionUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    return await ProjectDemandFormSectionService.update(ctx.db, demand_type_id, section_id, data)


@router.delete("/config/demand-types/{demand_type_id}/sections/{section_id}", status_code=204)
async def delete_demand_section(
    demand_type_id: uuid.UUID,
    section_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    await ProjectDemandFormSectionService.delete(ctx.db, demand_type_id, section_id)


@router.get("/config/demand-types/{demand_type_id}/sections/{section_id}/fields", response_model=list[ProjectDemandFormFieldResponse])
async def list_demand_fields(
    demand_type_id: uuid.UUID,
    section_id: uuid.UUID,
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectDemandFormFieldService.list(ctx.db, demand_type_id, section_id, active_only=active_only)


@router.post("/config/demand-types/{demand_type_id}/sections/{section_id}/fields", response_model=ProjectDemandFormFieldResponse, status_code=201)
async def create_demand_field(
    demand_type_id: uuid.UUID,
    section_id: uuid.UUID,
    data: ProjectDemandFormFieldCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    return await ProjectDemandFormFieldService.create(ctx.db, demand_type_id, section_id, data)


@router.patch("/config/demand-types/{demand_type_id}/sections/{section_id}/fields/reorder", response_model=list[ProjectDemandFormFieldResponse])
async def reorder_demand_fields(
    demand_type_id: uuid.UUID,
    section_id: uuid.UUID,
    data: ProjectDemandFormFieldReorder,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    return await ProjectDemandFormFieldService.reorder(ctx.db, demand_type_id, section_id, data.items)


@router.patch("/config/demand-types/{demand_type_id}/sections/{section_id}/fields/{field_id}", response_model=ProjectDemandFormFieldResponse)
async def update_demand_field(
    demand_type_id: uuid.UUID,
    section_id: uuid.UUID,
    field_id: uuid.UUID,
    data: ProjectDemandFormFieldUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    return await ProjectDemandFormFieldService.update(ctx.db, demand_type_id, section_id, field_id, data)


@router.delete("/config/demand-types/{demand_type_id}/sections/{section_id}/fields/{field_id}", status_code=204)
async def delete_demand_field(
    demand_type_id: uuid.UUID,
    section_id: uuid.UUID,
    field_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    await ProjectDemandFormFieldService.delete(ctx.db, demand_type_id, section_id, field_id)


@router.get("/projects/{project_id}/members", response_model=list[ProjectMemberResponse])
async def list_project_members(project_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await ProjectMemberService.list(ctx.db, project_id)


@router.post("/projects/{project_id}/members", response_model=ProjectMemberResponse, status_code=201)
async def add_project_member(
    project_id: uuid.UUID,
    data: ProjectMemberCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_project_manage),
):
    return await ProjectMemberService.add(ctx.db, project_id, data)


@router.delete("/projects/{project_id}/members/{member_id}", status_code=204)
async def remove_project_member(
    project_id: uuid.UUID,
    member_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_project_manage),
):
    await ProjectMemberService.remove(ctx.db, project_id, member_id)


@router.get("/projects/{project_id}/statuses", response_model=list[ProjectStatusResponse])
async def list_statuses(
    project_id: uuid.UUID,
    funnel_id: Optional[uuid.UUID] = Query(None),
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectStatusService.list(ctx.db, project_id, funnel_id=funnel_id, active_only=active_only)


@router.post("/projects/{project_id}/statuses", response_model=ProjectStatusResponse, status_code=201)
async def create_status(
    project_id: uuid.UUID,
    data: ProjectStatusCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_status_manage),
):
    return await ProjectStatusService.create(ctx.db, project_id, data)


@router.patch("/projects/{project_id}/funnels/{funnel_id}/statuses/reorder", response_model=list[ProjectStatusResponse])
async def reorder_statuses(
    project_id: uuid.UUID,
    funnel_id: uuid.UUID,
    data: ProjectStatusReorder,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_status_manage),
):
    return await ProjectStatusService.reorder(ctx.db, project_id, funnel_id, data.items)


@router.patch("/projects/{project_id}/funnels/{funnel_id}/statuses/{status_id}", response_model=ProjectStatusResponse)
async def update_status(
    project_id: uuid.UUID,
    funnel_id: uuid.UUID,
    status_id: uuid.UUID,
    data: ProjectStatusUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_status_manage),
):
    return await ProjectStatusService.update(ctx.db, project_id, funnel_id, status_id, data)


@router.delete("/projects/{project_id}/funnels/{funnel_id}/statuses/{status_id}", status_code=204)
async def delete_status(
    project_id: uuid.UUID,
    funnel_id: uuid.UUID,
    status_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_status_manage),
):
    await ProjectStatusService.delete(ctx.db, project_id, funnel_id, status_id)


@router.get("/projects/{project_id}/statuses/{status_id}/section-links", response_model=list[ProjectStatusSectionLinkResponse])
async def list_status_section_links(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectStatusSectionLinkService.list(ctx.db, project_id, status_id)


@router.post("/projects/{project_id}/statuses/{status_id}/section-links", response_model=ProjectStatusSectionLinkResponse, status_code=201)
async def upsert_status_section_link(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    data: ProjectStatusSectionLinkCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    return await ProjectStatusSectionLinkService.upsert(
        ctx.db,
        project_id=project_id,
        status_id=status_id,
        section_id=data.section_id,
        mode=data.mode,
    )


@router.delete("/projects/{project_id}/statuses/{status_id}/section-links/{link_id}", status_code=204)
async def delete_status_section_link(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    link_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    await ProjectStatusSectionLinkService.delete(ctx.db, project_id, status_id, link_id)


@router.get(
    "/projects/{project_id}/statuses/{status_id}/default-form-links",
    response_model=list[ProjectStatusDefaultFormLinkResponse],
)
async def list_status_default_form_links(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectStatusDefaultFormLinkService.list(ctx.db, project_id, status_id)


@router.post(
    "/projects/{project_id}/statuses/{status_id}/default-form-links",
    response_model=ProjectStatusDefaultFormLinkResponse,
    status_code=201,
)
async def upsert_status_default_form_link(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    data: ProjectStatusDefaultFormLinkCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    return await ProjectStatusDefaultFormLinkService.upsert(
        ctx.db,
        project_id=project_id,
        status_id=status_id,
        field_key=data.field_key,
        mode=data.mode,
    )


@router.delete(
    "/projects/{project_id}/statuses/{status_id}/default-form-links/{link_id}",
    status_code=204,
)
async def delete_status_default_form_link(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    link_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    await ProjectStatusDefaultFormLinkService.delete(ctx.db, project_id, status_id, link_id)


@router.get("/projects/{project_id}/funnels", response_model=list[ProjectFunnelResponse])
async def list_funnels(
    project_id: uuid.UUID,
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    # Bootstrap idempotente do kanban Contratar (aparece em "Kanbans ativos").
    # Este GET é carregado a cada mount do board e a cada abertura de card, e o
    # `ensure` custa ~25-40 queries + um commit. O marcador o reduz a uma execução
    # por TTL; `POST /ensure-procurement` continua forçando quando necessário.
    from app.core.cache import bootstrap_key, cache_get, cache_set

    marker = bootstrap_key(ctx.schema, "procurement", project_id)
    if not await cache_get(marker):
        try:
            from app.modules.projetos.procurement import ProcurementFlowService
            await ProcurementFlowService.ensure(ctx.db, project_id)
            await ctx.db.commit()
            await cache_set(marker, True, settings.BOOTSTRAP_CACHE_TTL)
        except Exception:
            await ctx.db.rollback()
    return await ProjectFunnelService.list(ctx.db, project_id, active_only=active_only, current_user=ctx.user)


@router.post("/projects/{project_id}/ensure-procurement")
async def ensure_procurement_flow(
    project_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    """Bootstrap idempotente do funil Contratar + raias Contratação/Cancelado."""
    if not await _has_permission(ctx, "projetos.task.manage"):
        raise HTTPException(status_code=403, detail="Sem permissão para configurar contratação.")
    from app.core.cache import bootstrap_key, cache_set
    from app.modules.projetos.procurement import ProcurementFlowService
    result = await ProcurementFlowService.ensure(ctx.db, project_id)
    await ctx.db.commit()
    # Acabou de rodar: revalida o marcador que o GET de funnels consulta.
    await cache_set(bootstrap_key(ctx.schema, "procurement", project_id), True,
                    settings.BOOTSTRAP_CACHE_TTL)
    return result


@router.get("/projects/{project_id}/funnels/{funnel_id}/unclassified-count")
async def unclassified_past_backlog_count(
    project_id: uuid.UUID,
    funnel_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    """Quantos cards já saíram do backlog neste funil e ainda não têm classificação."""
    count = await ProjectTaskService.count_unclassified_past_backlog(ctx.db, project_id, funnel_id)
    return {"count": count}


@router.post("/projects/{project_id}/funnels", response_model=ProjectFunnelResponse, status_code=201)
async def create_funnel(
    project_id: uuid.UUID,
    data: ProjectFunnelCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_status_manage),
):
    return await ProjectFunnelService.create(ctx.db, project_id, data)


@router.patch("/projects/{project_id}/funnels/reorder", response_model=list[ProjectFunnelResponse])
async def reorder_funnels(
    project_id: uuid.UUID,
    data: ProjectFunnelReorder,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_status_manage),
):
    return await ProjectFunnelService.reorder(ctx.db, project_id, data.items)


@router.patch("/projects/{project_id}/funnels/{funnel_id}", response_model=ProjectFunnelResponse)
async def update_funnel(
    project_id: uuid.UUID,
    funnel_id: uuid.UUID,
    data: ProjectFunnelUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_status_manage),
):
    return await ProjectFunnelService.update(ctx.db, project_id, funnel_id, data)


@router.delete("/projects/{project_id}/funnels/{funnel_id}", status_code=204)
async def delete_funnel(
    project_id: uuid.UUID,
    funnel_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_status_manage),
):
    await ProjectFunnelService.delete(ctx.db, project_id, funnel_id)


@router.get("/me/requests", response_model=list[ProjectMyRequestResponse])
async def list_my_requests(ctx: ModuleContext = Depends(_ctx)):
    basic = await _is_basic_user(ctx)
    return await ProjectTaskService.list_my_requests(
        ctx.db, _ensure_uuid(ctx.user.id), basic_only_available=basic
    )


@router.get("/tasks", response_model=list[ProjectTaskWithContextResponse])
async def list_all_tasks(
    project_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    """Lista todas as demandas/cards do tenant para gestão administrativa
    (editar/excluir num só lugar). Exige permissão de visualização ampla."""
    can_view_all = (
        await _has_permission(ctx, "projetos.task.view")
        or await _has_permission(ctx, "projetos.task.manage")
    )
    if not can_view_all:
        raise HTTPException(status_code=403, detail="Sem permissão para visualizar todas as demandas.")
    return await ProjectTaskService.list_all(
        ctx.db, project_id=project_id, only_task_ids=await _po_external_scope(ctx)
    )


_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post("/uploads", response_model=ProjectUploadResponse)
async def upload_attachment(
    file: UploadFile = File(...),
    ctx: ModuleContext = Depends(_ctx),
):
    """Upload de anexo (campo de formulário do tipo anexo). Guarda no MinIO e
    devolve os metadados que ficam salvos no `values` da submissão."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo excede o limite de 20 MB.")
    object_name = storage.upload_file(
        data=data,
        content_type=file.content_type or "application/octet-stream",
        folder=f"projetos/{ctx.schema}",
    )
    return ProjectUploadResponse(
        object_name=object_name,
        filename=file.filename or "arquivo",
        content_type=file.content_type or "application/octet-stream",
        size=len(data),
    )


@router.get("/uploads/url", response_model=ProjectUploadUrlResponse)
async def get_attachment_url(
    object_name: str = Query(...),
    ctx: ModuleContext = Depends(_ctx),
):
    """URL temporária (presigned) para baixar/visualizar um anexo. Restringe ao
    prefixo do tenant para evitar acesso cruzado entre schemas."""
    if not object_name.startswith(f"projetos/{ctx.schema}/"):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    url = storage.get_presigned_url(object_name)
    if not url:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    return ProjectUploadUrlResponse(url=url)


@router.get("/reports", response_model=ProjectReportsResponse)
async def get_reports(
    po: Optional[uuid.UUID] = Query(None, description="Filtra cards pelo responsável (PO/Pessoa)."),
    diretoria: Optional[str] = Query(None, description="Filtra cards pela diretoria."),
    area: Optional[str] = Query(None, description="Filtra cards pela área."),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    return await ProjectReportsService.build(ctx.db, po=po, diretoria=diretoria, area=area)


@router.get("/reports/us-delivery", response_model=UsDeliveryReportResponse)
async def get_us_delivery_report(
    period: str = Query(
        "today",
        description="today|tomorrow|this_week|next_week|last_month|this_month|next_month",
    ),
    assignee: Optional[uuid.UUID] = Query(None, description="Filtra pelo responsável (Person.id)."),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Entregas de User Story por responsável no período + lista de atrasadas."""
    return await UsDeliveryReportService.build(ctx.db, period=period, assignee=assignee)


@router.get("/reports/team-performance", response_model=TeamPerformanceResponse)
async def get_team_performance(
    date_from: str = Query(..., alias="from", description="Início da janela (ISO date)."),
    date_to: str = Query(..., alias="to", description="Fim da janela, inclusivo (ISO date)."),
    area: Optional[str] = Query(None, description="Recorta pela área (string do card)."),
    diretoria: Optional[str] = Query(None, description="Recorta pela diretoria (string do card)."),
    positions: Optional[str] = Query(
        None,
        description="Slugs de cargo separados por vírgula (multi-seleção). Ex.: dev_backend,qa",
    ),
    teams: Optional[str] = Query(
        None,
        description="UUIDs de time (área folha TeamOps), vírgula-separados.",
    ),
    position: Optional[str] = Query(
        None,
        description="(legado) um único slug de cargo; preferir `positions`.",
    ),
    ctx: ModuleContext = Depends(_ctx),
    _perf=Depends(_can_view_performance),
    _po_ext=Depends(_deny_po_external),
):
    """Painel de desempenho do time: linhas por Dev e por PO, KPIs de fluxo, séries de
    tendência e raias de WIP/aging. Restrito à gestão (`projetos.performance.view`)."""
    from datetime import date as _date

    pos_list: list[str] = []
    if positions:
        pos_list.extend(p.strip() for p in positions.split(",") if p.strip())
    if position and position.strip() and position.strip() not in pos_list:
        pos_list.append(position.strip())

    team_list: list[str] = []
    if teams:
        team_list.extend(t.strip() for t in teams.split(",") if t.strip())

    return await TeamPerformanceService.build(
        ctx.db,
        _date.fromisoformat(date_from),
        _date.fromisoformat(date_to),
        area=area,
        diretoria=diretoria,
        positions=pos_list or None,
        team_area_ids=team_list or None,
    )


@router.get("/pos", response_model=list[PoOption])
async def list_pos(ctx: ModuleContext = Depends(_ctx)):
    """POs do tenant (com/sem login) para o seletor do painel."""
    return await PoPortfolioService.list_pos(ctx.db)


@router.get("/po-portfolio/overview", response_model=PoOverviewResponse)
async def get_po_portfolio_overview(
    diretoria: Optional[str] = Query(None, description="Filtra projetos/programas pela diretoria."),
    area: Optional[str] = Query(None, description="Filtra projetos/programas pela área."),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Modo gestão: agregados do portfólio de cada PO, lado a lado."""
    return await PoPortfolioService.build_overview(ctx.db, diretoria=diretoria, area=area)


@router.get("/po-portfolio", response_model=PoPortfolioResponse)
async def get_po_portfolio(
    po_id: Optional[uuid.UUID] = Query(None),
    diretoria: Optional[str] = Query(None, description="Filtra projetos/programas pela diretoria."),
    area: Optional[str] = Query(None, description="Filtra projetos/programas pela área."),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Portfólio do PO: projetos/programas que ele possui (assigned_to), com prioridade,
    progresso, riscos, gargalos, previsibilidade e saúde sintetizada. Gated só pelo módulo.
    Sem `po_id` → agrega o portfólio de todos os POs."""
    return await PoPortfolioService.build(ctx.db, po_id, diretoria=diretoria, area=area)


@router.get("/po-sync")
async def get_po_sync(
    diretoria: Optional[str] = Query(None, description="Recorta a análise pela diretoria."),
    area: Optional[str] = Query(None, description="Recorta a análise pela área."),
    mes: Optional[int] = Query(None, ge=1, le=12, description="Mês de referência (entregas concluídas). Próximo ciclo = mês seguinte."),
    ano: Optional[int] = Query(None, ge=2000, le=2100, description="Ano de referência."),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Análise de portfólio para a cerimônia **PO Sync**: lidera por PO e aplica as regras da
    metodologia (fase pela situação real, % execução descontando "Não realizado", saúde de
    prazo com média/mediana/outliers e lacunas de baseline). Read-only. Retorna dict rico
    (sem response_model, como o preview do Status Report) para não filtrar campos aninhados."""
    return await PoSyncService.build(ctx.db, diretoria=diretoria, area=area, mes=mes, ano=ano)


@router.post("/status-reports/preview")
async def preview_status_report(
    data: StatusReportPreviewIn,
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Monta o Status Report do estado atual para o recorte (diretoria/área). NÃO persiste —
    serve de rascunho para o editor preencher a narrativa antes de salvar."""
    return await StatusReportService.build_preview(ctx.db, diretoria=data.diretoria, area=data.area)


@router.post("/status-reports", response_model=StatusReportResponse, status_code=201)
async def create_status_report(
    data: StatusReportCreateIn,
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Persiste um snapshot imutável (dados do estado atual + narrativa). Vira um ponto na
    série histórica do recorte."""
    return await StatusReportService.create(ctx.db, data, ctx.user.id)


@router.get("/status-reports", response_model=list[StatusReportListItem])
async def list_status_reports(
    diretoria: Optional[str] = Query(None, description="Filtra a série histórica pela diretoria."),
    area: Optional[str] = Query(None, description="Filtra a série histórica pela área."),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Série histórica de Status Reports (mais recente primeiro), filtrável por recorte."""
    return await StatusReportService.list(ctx.db, diretoria=diretoria, area=area)


@router.get("/status-reports/{report_id}", response_model=StatusReportResponse)
async def get_status_report(
    report_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Snapshot completo de um Status Report para visualização/impressão."""
    return await StatusReportService.get(ctx.db, report_id)


@router.get(
    "/projects/{project_id}/tasks",
    # response_model=None de propósito: o FastAPI revalidaria o card enxuto de volta
    # em ProjectTaskResponse e leria os atributos excluídos direto do ORM, desfazendo
    # a economia. Cada ramo constrói explicitamente o modelo que vai serializar.
    response_model=None,
    responses={200: {"model": list[ProjectTaskResponse]}},
)
async def list_tasks(
    project_id: uuid.UUID,
    response: Response,
    status_id: Optional[uuid.UUID] = Query(None),
    assigned_to: Optional[uuid.UUID] = Query(None),
    slim: bool = Query(
        False,
        description="Omite description/anexos/procurement_meta (~1/3 do payload). O kanban "
                    "não desenha esses campos; o drawer e o Gantt precisam, então não usam slim.",
    ),
    done_limit: Optional[int] = Query(
        None, ge=0,
        description="Traz só os N card-raiz concluídos mais recentes (com suas árvores). "
                    "O total vai no header X-Done-Total para a coluna mostrar quanto falta.",
    ),
    ctx: ModuleContext = Depends(_ctx),
):
    if await _is_basic_user(ctx):
        assigned_to = await _person_id_for_user(ctx) or _NOBODY
        tasks = await ProjectTaskService.list(
            ctx.db,
            project_id=project_id,
            status_id=status_id,
            assigned_to=assigned_to,
        )
    else:
        can_view_all = await _has_permission(ctx, "projetos.task.view") or await _has_permission(ctx, "projetos.task.manage")
        if not can_view_all:
            own_view = await _has_permission(ctx, "projetos.task.view_own")
            if own_view:
                assigned_to = await _person_id_for_user(ctx) or _NOBODY
            else:
                raise HTTPException(status_code=403, detail="Sem permissão para visualizar tarefas.")
        tasks = await ProjectTaskService.list(
            ctx.db,
            project_id=project_id,
            status_id=status_id,
            assigned_to=assigned_to,
            only_task_ids=await _po_external_scope(ctx),
        )

    if done_limit is not None:
        tasks, done_total = await ProjectTaskService.trim_done_column(
            ctx.db, project_id, tasks, done_limit
        )
        response.headers["X-Done-Total"] = str(done_total)
        response.headers["Access-Control-Expose-Headers"] = "X-Done-Total"

    model = ProjectTaskCardResponse if slim else ProjectTaskResponse
    return [model.model_validate(t) for t in tasks]


@router.get("/projects/{project_id}/programs", response_model=list[ProjectRefMini])
async def list_programs(project_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    """Programas do cadastro (para vincular na conversão)."""
    return await ProjectTaskService.list_programs(ctx.db, project_id)


# ── Cadastro próprio de Programas (catálogo do tenant) ──
@router.get("/programs", response_model=list[ProjectProgramResponse])
async def list_program_catalog(active_only: bool = Query(False), ctx: ModuleContext = Depends(_ctx)):
    return await ProjectProgramService.list(ctx.db, active_only=active_only)


@router.post("/programs", response_model=ProjectProgramResponse, status_code=201)
async def create_program(data: ProjectProgramCreate, ctx: ModuleContext = Depends(_ctx)):
    return await ProjectProgramService.create(ctx.db, data, user_id=ctx.user.id)


@router.patch("/programs/{program_id}", response_model=ProjectProgramResponse)
async def update_program(program_id: uuid.UUID, data: ProjectProgramUpdate, ctx: ModuleContext = Depends(_ctx)):
    return await ProjectProgramService.update(ctx.db, program_id, data, user_id=ctx.user.id)


@router.delete("/programs/{program_id}", status_code=204)
async def delete_program(program_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    await ProjectProgramService.delete(ctx.db, program_id)


@router.post("/projects/{project_id}/tasks", response_model=ProjectTaskResponse, status_code=201)
async def create_task(
    project_id: uuid.UUID,
    data: ProjectTaskCreate,
    ctx: ModuleContext = Depends(_ctx),
):
    can_manage = await _has_permission(ctx, "projetos.task.manage")
    is_company_user = ctx.user.role == UserRole.COMPANY_USER
    if not can_manage and not is_company_user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para criar tarefas.")
    # Usuário basic só pode abrir solicitações de tipos disponíveis para basic.
    if data.demand_type_id and await _is_basic_user(ctx):
        dt = await ProjectDemandTypeService.get(ctx.db, data.demand_type_id)
        if not dt.available_for_basic:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Este tipo de solicitação não está disponível para você.",
            )
    payload = data
    if not can_manage:
        payload = ProjectTaskCreate(**{**data.model_dump(), "assigned_to": await _person_id_for_user(ctx)})
    # Abrir solicitação é funcionalidade básica de TODO usuário e NÃO depende do acesso do
    # Cargo ao funil (o access_control do funil governa só a gestão do board — mover/editar —
    # e o botão "Nova demanda" do board já é escondido no frontend para quem só visualiza).
    # Por isso a criação nunca aplica o gate de funil.
    return await ProjectTaskService.create(
        ctx.db,
        project_id,
        payload,
        current_user_id=ctx.user.id,
        current_user=ctx.user,
        enforce_funnel_access=False,
    )


@router.get("/projects/{project_id}/import-template")
async def import_template(project_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    """Modelo .xlsx para importação de Features/US."""
    data = ProjectImportService.build_template()
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="modelo-importacao-features-us.xlsx"'},
    )


@router.get("/projects/{project_id}/planning-nodes", response_model=list[ProjectTaskResponse])
async def list_planning_nodes(project_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    """Nós de planejamento (Projetos/Programas) do projeto — destino da importação."""
    return await ProjectTaskService.list_planning_nodes(ctx.db, project_id)


@router.post("/projects/{project_id}/import-tasks", response_model=TaskImportResult)
async def import_tasks(
    project_id: uuid.UUID,
    target_status_id: uuid.UUID = Form(...),
    us_status_id: Optional[uuid.UUID] = Form(None),
    parent_task_id: Optional[uuid.UUID] = Form(None),
    file: UploadFile = File(...),
    ctx: ModuleContext = Depends(_ctx),
):
    """Importa Features + User Stories de uma planilha .xlsx para o projeto.
    `target_status_id` é a etapa das Features; `us_status_id` a etapa das US
    (se omitido, as US herdam a etapa das Features)."""
    if not await _has_permission(ctx, "projetos.task.manage"):
        raise HTTPException(status_code=403, detail="Sem permissão para importar tarefas.")
    fname = (file.filename or "").lower()
    if not fname.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Envie um arquivo .xlsx.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Arquivo excede o limite de 10 MB.")
    return await ProjectImportService.import_xlsx(
        ctx.db, project_id, data, target_status_id, ctx.user,
        parent_task_id=parent_task_id, us_status_id=us_status_id,
    )


@router.patch("/projects/{project_id}/tasks/reorder", response_model=list[ProjectTaskResponse])
async def reorder_tasks(
    project_id: uuid.UUID,
    data: ProjectTaskReorder,
    ctx: ModuleContext = Depends(_ctx),
):
    if not await _has_permission(ctx, "projetos.task.manage"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para reordenar o cronograma.")
    return await ProjectTaskService.reorder(ctx.db, project_id, data.items)


@router.patch("/projects/{project_id}/tasks/{task_id}", response_model=ProjectTaskResponse)
async def update_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    data: ProjectTaskUpdate,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    task = await ProjectTaskService.get(ctx.db, project_id, task_id)
    can_manage = await _has_permission(ctx, "projetos.task.manage")
    is_company_user = ctx.user.role == UserRole.COMPANY_USER
    if not can_manage:
        if not is_company_user:
            raise HTTPException(status_code=403, detail="Sem permissão para atualizar tarefas.")
        if task.assigned_to != (await _person_id_for_user(ctx) or _NOBODY):
            raise HTTPException(status_code=403, detail="Você só pode atualizar suas próprias tarefas.")
        payload = data.model_dump(exclude_unset=True)
        payload.pop("assigned_to", None)
        data = ProjectTaskUpdate(**payload)

    return await ProjectTaskService.update(ctx.db, project_id, task_id, data, current_user=ctx.user)


@router.patch(
    "/projects/{project_id}/tasks/{task_id}/planning-classification",
    response_model=ProjectTaskResponse,
)
async def set_planning_classification(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    data: PlanningClassificationUpdate,
    ctx: ModuleContext = Depends(_ctx),
):
    """Edita Projeto/Programa a partir do card (ex.: "Concluído" da prospecção) e
    propaga ao card de planejamento convertido nos demais kanbans."""
    await _assert_task_in_scope(ctx, task_id)
    if not await _has_permission(ctx, "projetos.task.manage"):
        raise HTTPException(status_code=403, detail="Sem permissão para classificar Projeto/Programa.")
    return await ProjectTaskService.set_planning_classification(
        ctx.db,
        project_id,
        task_id,
        kind=data.kind,
        program_id=data.program_id,
        new_program_name=data.new_program_name,
        new_program_desc=data.new_program_desc,
        current_user_id=ctx.user.id,
    )


@router.delete("/projects/{project_id}/tasks/{task_id}", status_code=204)
async def delete_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    can_manage = await _has_permission(ctx, "projetos.task.manage")
    task = await ProjectTaskService.get(ctx.db, project_id, task_id)
    if not can_manage:
        if ctx.user.role != UserRole.COMPANY_USER or task.assigned_to != (await _person_id_for_user(ctx) or _NOBODY):
            raise HTTPException(status_code=403, detail="Sem permissão para remover esta tarefa.")
    await ProjectTaskService.delete(ctx.db, project_id, task_id, current_user=ctx.user)


@router.get("/projects/{project_id}/tasks/{task_id}/children", response_model=list[ProjectTaskResponse])
async def list_task_children(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    return await ProjectTaskService.list_children(ctx.db, project_id, task_id)


@router.post("/projects/{project_id}/tasks/{task_id}/schedule-stages", response_model=ProjectTaskResponse, status_code=201)
async def create_schedule_stage(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    data: ScheduleStageCreate,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    if not await _has_permission(ctx, "projetos.task.manage"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para editar o cronograma.")
    return await ProjectTaskService.create_schedule_stage(ctx.db, project_id, task_id, data, current_user_id=ctx.user.id)


# ─────────────────────────────────────────────
# Cronograma: dependências entre tarefas e análise de carga (workload)
# ─────────────────────────────────────────────


@router.get("/projects/{project_id}/dependencies", response_model=list[TaskDependencyResponse])
async def list_dependencies(
    project_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await TaskDependencyService.list(ctx.db, project_id)


@router.post("/projects/{project_id}/dependencies", response_model=TaskDependencyResponse, status_code=201)
async def create_dependency(
    project_id: uuid.UUID,
    data: TaskDependencyCreate,
    ctx: ModuleContext = Depends(_ctx),
):
    if not await _has_permission(ctx, "projetos.task.manage"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para editar o cronograma.")
    return await TaskDependencyService.create(ctx.db, project_id, data)


@router.delete("/projects/{project_id}/dependencies/{dep_id}", status_code=204)
async def delete_dependency(
    project_id: uuid.UUID,
    dep_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    if not await _has_permission(ctx, "projetos.task.manage"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para editar o cronograma.")
    await TaskDependencyService.delete(ctx.db, project_id, dep_id)


@router.get("/projects/{project_id}/workload", response_model=WorkloadResponse)
async def get_workload(
    project_id: uuid.UUID,
    unit: str = Query("day"),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    root: Optional[uuid.UUID] = Query(None, description="Restringe ao card-raiz de planejamento"),
    ctx: ModuleContext = Depends(_ctx),
):
    from datetime import date as _date

    df = _date.fromisoformat(date_from) if date_from else None
    dt = _date.fromisoformat(date_to) if date_to else None
    cells = await TaskDependencyService.compute_workload(
        ctx.db, project_id, df, dt, unit=unit, root_task_id=root,
    )
    return WorkloadResponse(unit="day", cells=cells)


@router.get("/projects/{project_id}/assignee-absences", response_model=AssigneeAbsencesResponse)
async def get_assignee_absences(
    project_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    """Ausências aprovadas dos responsáveis das tarefas, para sinalizar risco no
    cronograma. Gated só pelo acesso ao módulo projetos (planner sem permissão de
    teamops também recebe — é informação do próprio cronograma)."""
    mapping = await TaskDependencyService.assignee_absences(ctx.db, project_id)
    return AssigneeAbsencesResponse(by_user={
        str(uid): [
            AssigneeAbsenceItem(start_date=s, end_date=e, type_name=tn, status=st, partial_hours=ph)
            for (s, e, tn, ph, st) in items
        ]
        for uid, items in mapping.items()
    })


@router.get("/projects/{project_id}/schedule-overload", response_model=ScheduleOverloadResponse)
async def get_schedule_overload(
    project_id: uuid.UUID,
    root: Optional[uuid.UUID] = Query(None, description="Restringe à subárvore deste card-raiz"),
    ctx: ModuleContext = Depends(_ctx),
):
    """Tarefas do cronograma cujo responsável está superlotado no período — alimenta o
    marcador de sobrecarga no avatar do Gantt. Mesmo gating de /assignee-absences."""
    return await CapacityService.compute_schedule_overload(ctx.db, project_id, root)


# ─────────────────────────────────────────────
# Cockpit de planejamento de capacidade (cross-project)
# ─────────────────────────────────────────────


@router.get("/capacity/heatmap", response_model=CapacityHeatmapResponse)
async def get_capacity_heatmap(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    unit: str = Query("week"),
    area: Optional[uuid.UUID] = Query(None, description="Filtra pelas pessoas desta área"),
    position: Optional[str] = Query(None, description="Filtra pelo slug do cargo (ex.: dev_backend)"),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Lente por pessoa: heatmap de sobrecarga pessoa×dia cruzando TODO o portfólio.
    Gated pelo acesso ao módulo projetos (mesmo padrão de /po-sync)."""
    from datetime import date as _date

    return await CapacityService.compute_capacity_heatmap(
        ctx.db,
        _date.fromisoformat(date_from),
        _date.fromisoformat(date_to),
        unit=unit,
        area_id=area,
        position_slug=position,
    )


@router.get("/capacity/day-detail", response_model=CapacityDayDetailResponse)
async def get_capacity_day_detail(
    person: uuid.UUID = Query(..., description="Pessoa (responsável efetivo) da célula"),
    day: str = Query(..., alias="date", description="Dia clicado no heatmap (ISO)"),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Detalhe de uma célula do heatmap: US do dia (com etapa e horas) + atrasadas da
    pessoa. Mesmo gating de /capacity/heatmap."""
    from datetime import date as _date

    return await CapacityService.compute_day_detail(
        ctx.db, person, _date.fromisoformat(day),
    )


@router.get("/capacity/by-project", response_model=CapacityByProjectResponse)
async def get_capacity_by_project(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    area: Optional[uuid.UUID] = Query(None, description="Filtra pelas pessoas desta área"),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Lente por projeto (viabilidade): demanda × capacidade das pessoas alocadas."""
    from datetime import date as _date

    return await CapacityService.compute_capacity_by_project(
        ctx.db,
        _date.fromisoformat(date_from),
        _date.fromisoformat(date_to),
        area_id=area,
    )


@router.get("/capacity/gaps", response_model=CapacityGapsResponse)
async def get_capacity_gaps(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    group_by: str = Query("position", pattern="^(position|area)$"),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Gargalos por cargo/área e reforço (headcount) sugerido para cobrir o pico de déficit."""
    from datetime import date as _date

    return await CapacityService.detect_bottlenecks(
        ctx.db,
        _date.fromisoformat(date_from),
        _date.fromisoformat(date_to),
        group_by=group_by,
    )


@router.get("/capacity/available-people", response_model=FreePeopleResponse)
async def get_available_people(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    position: Optional[str] = Query(None, description="Slug do cargo"),
    area: Optional[uuid.UUID] = Query(None),
    stack: Optional[uuid.UUID] = Query(None, description="ID da competência (skill)"),
    min_level: Optional[str] = Query(None, description="Nível mínimo na skill (basico..referencia)"),
    min_free_hours: float = Query(0.0, description="Folga total mínima no período (h)"),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Pessoas com folga de capacidade no período (finder cross-team por skill/cargo)."""
    from datetime import date as _date
    from app.modules.teamops.models import StackLevel

    level = StackLevel(min_level) if min_level else None
    return await CapacityService.find_available_people(
        ctx.db,
        _date.fromisoformat(date_from),
        _date.fromisoformat(date_to),
        position_slug=position,
        area_id=area,
        stack_id=stack,
        min_level=level,
        min_free_hours=min_free_hours,
    )


@router.get("/capacity/person-window", response_model=PersonCapacityWindowResponse)
async def get_person_capacity_window(
    person: uuid.UUID = Query(..., description="Pessoa (assigned_to) a analisar"),
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    exclude_task: Optional[uuid.UUID] = Query(
        None, description="Tarefa em edição — sai do 'já alocado' para não contar em dobro"
    ),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Carga × capacidade de um responsável na janela de uma tarefa — alimenta o painel
    de capacidade do cronograma. Mesmo gating das demais lentes (acesso ao módulo)."""
    from datetime import date as _date

    return await CapacityService.compute_person_window(
        ctx.db,
        person,
        _date.fromisoformat(date_from),
        _date.fromisoformat(date_to),
        exclude_task_id=exclude_task,
    )


@router.get("/capacity/tasks", response_model=SimTasksResponse)
async def get_capacity_tasks(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Tarefas agendadas na janela — alimenta o construtor de mutações do simulador."""
    from datetime import date as _date

    return await CapacityService.list_simulatable_tasks(
        ctx.db, _date.fromisoformat(date_from), _date.fromisoformat(date_to)
    )


@router.post("/capacity/simulate", response_model=ScenarioResult)
async def post_capacity_simulate(
    payload: ScenarioRequest,
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Simulador what-if efêmero: aplica mutações em memória e devolve o antes/depois. Nada é persistido."""
    return await CapacityService.simulate(
        ctx.db, payload.date_from, payload.date_to, payload.mutations
    )


@router.get("/capacity/suggest-scenarios", response_model=ScenarioSuggestionsResponse)
async def get_capacity_suggestions(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Cenários prontos para resolver a sobrecarga (realocar/freela/adiar), com impacto já medido."""
    from datetime import date as _date

    return await CapacityService.suggest_scenarios(
        ctx.db, _date.fromisoformat(date_from), _date.fromisoformat(date_to)
    )


@router.get("/capacity/cross-team", response_model=CrossTeamResponse)
async def get_capacity_cross_team(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Vazamento entre times: por pessoa, horas no próprio time vs em projetos de outros times
    (time dono = área do PO do card-raiz). Risco quando away > home."""
    from datetime import date as _date

    return await CapacityService.analyze_cross_team(
        ctx.db, _date.fromisoformat(date_from), _date.fromisoformat(date_to)
    )


@router.post(
    "/projects/{project_id}/schedule/scenario",
    response_model=ScheduleScenarioResponse,
)
async def post_schedule_scenario(
    project_id: uuid.UUID,
    data: ScheduleScenarioRequest,
    ctx: ModuleContext = Depends(_ctx),
    _po_ext=Depends(_deny_po_external),
):
    """Cenário hipotético de fim do projeto: início + time → data projetada pela
    capacidade livre agregada (desconta outros projetos, sáb/dom e ausências).
    Não persiste nada."""
    await _assert_task_in_scope(ctx, data.root_task_id)
    return await CapacityService.simulate_project_end_scenario(
        ctx.db,
        project_id,
        data.root_task_id,
        data.start_date,
        list(data.person_ids or []),
    )


@router.post(
    "/projects/{project_id}/tasks/{task_id}/reschedule",
    response_model=list[ProjectTaskResponse],
)
async def reschedule_schedule(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    """Recálculo automático SOB DEMANDA da subárvore do card de planejamento.

    O cronograma é manual: nenhuma edição reagenda tarefas. Este endpoint é a única
    porta para o motor (sequência por responsável + dependências + calendário) e
    SOBRESCREVE as datas manuais da subárvore. Exige o baseline aberto.
    """
    if not await _has_permission(ctx, "projetos.task.manage"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para recalcular o cronograma.",
        )
    await _assert_task_in_scope(ctx, task_id)
    await ProjectTaskService.reschedule_on_demand(ctx.db, project_id, task_id)
    return await ProjectTaskService.list(
        ctx.db, project_id=project_id, only_task_ids=await _po_external_scope(ctx)
    )


@router.get("/projects/{project_id}/critical-path", response_model=list[CriticalPathItem])
async def get_critical_path(
    project_id: uuid.UUID,
    root: uuid.UUID = Query(..., description="Card de planejamento (raiz do cronograma)"),
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, root)
    return await ProjectTaskService.critical_path(ctx.db, project_id, root)


# ─────────────────────────────────────────────
# Baseline / travamento do cronograma
# ─────────────────────────────────────────────


@router.get("/projects/{project_id}/schedule-lock", response_model=ScheduleLockState)
async def get_schedule_lock(
    project_id: uuid.UUID,
    root: uuid.UUID = Query(..., description="Card de planejamento (raiz do cronograma)"),
    ctx: ModuleContext = Depends(_ctx),
):
    """Estado do controle de baseline do projeto: open | locked | revision."""
    return await ScheduleBaselineService.lock_state(ctx.db, project_id, root)


@router.get("/projects/{project_id}/schedule-locks", response_model=list[ScheduleLockState])
async def list_schedule_locks(
    project_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    """Estado da trava de TODAS as raízes de planejamento do projeto (visão completa do cronograma)."""
    return await ScheduleBaselineService.lock_states(ctx.db, project_id)


@router.get("/projects/{project_id}/schedule-lock-for-task", response_model=ScheduleLockState)
async def get_schedule_lock_for_task(
    project_id: uuid.UUID,
    task: uuid.UUID = Query(..., description="Tarefa cujo cronograma (raiz) se quer consultar"),
    ctx: ModuleContext = Depends(_ctx),
):
    """Estado da trava da raiz de planejamento à qual a tarefa pertence (resolve o root)."""
    return await ScheduleBaselineService.lock_state_for_task(ctx.db, project_id, task)


@router.get("/projects/{project_id}/schedule-readiness")
async def get_schedule_readiness(
    project_id: uuid.UUID,
    task: uuid.UUID = Query(..., description="Card cuja árvore de planejamento se quer avaliar"),
    ctx: ModuleContext = Depends(_ctx),
):
    """Se o cronograma do projeto está pronto para Feature/US avançarem, e o que falta.

    Read-only. O board consulta para explicar o bloqueio antes de tentar mover; quem
    decide de fato é o guard em `ProjectTaskService.update` (423)."""
    return await ProjectTaskService.schedule_readiness(ctx.db, project_id, task)


@router.get("/projects/{project_id}/baselines", response_model=list[ScheduleBaselineResponse])
async def list_baselines(
    project_id: uuid.UUID,
    root: uuid.UUID = Query(..., description="Card de planejamento (raiz do cronograma)"),
    ctx: ModuleContext = Depends(_ctx),
):
    """Histórico de baselines (snapshots versionados + justificativa), mais recente primeiro."""
    return await ScheduleBaselineService.list_baselines(ctx.db, project_id, root)


@router.post("/projects/{project_id}/baselines", response_model=ScheduleBaselineResponse, status_code=201)
async def save_baseline(
    project_id: uuid.UUID,
    data: ScheduleBaselineCreateIn,
    ctx: ModuleContext = Depends(_ctx),
):
    """Salva o baseline (snapshot atual + justificativa) e ABRE a janela de revisão,
    liberando a edição do cronograma travado."""
    if not await _has_permission(ctx, "projetos.task.manage"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para editar o cronograma.")
    return await ScheduleBaselineService.save_baseline(
        ctx.db, project_id, data.root_task_id, data.justification, ctx.user.id
    )


@router.post("/projects/{project_id}/baselines/close-revision", response_model=ScheduleLockState)
async def close_schedule_revision(
    project_id: uuid.UUID,
    data: ScheduleRevisionCloseIn,
    ctx: ModuleContext = Depends(_ctx),
):
    """Conclui a revisão e RE-TRAVA o cronograma. Próxima alteração exige novo baseline."""
    if not await _has_permission(ctx, "projetos.task.manage"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para editar o cronograma.")
    await ScheduleBaselineService.close_revision(ctx.db, project_id, data.root_task_id)
    return await ScheduleBaselineService.lock_state(ctx.db, project_id, data.root_task_id)


# ─────────────────────────────────────────────
# Automações por etapa
# ─────────────────────────────────────────────


@router.get("/projects/{project_id}/statuses/{status_id}/automations", response_model=list[ProjectAutomationRuleResponse])
async def list_status_automations(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectAutomationService.list(ctx.db, project_id, status_id)


@router.post("/projects/{project_id}/statuses/{status_id}/automations", response_model=ProjectAutomationRuleResponse, status_code=201)
async def create_status_automation(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    data: ProjectAutomationRuleCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_automation_manage),
):
    return await ProjectAutomationService.create(ctx.db, project_id, status_id, data)


@router.patch("/projects/{project_id}/automations/{rule_id}", response_model=ProjectAutomationRuleResponse)
async def update_automation(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    data: ProjectAutomationRuleUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_automation_manage),
):
    return await ProjectAutomationService.update(ctx.db, project_id, rule_id, data)


@router.delete("/projects/{project_id}/automations/{rule_id}", status_code=204)
async def delete_automation(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_automation_manage),
):
    await ProjectAutomationService.delete(ctx.db, project_id, rule_id)


@router.get("/projects/{project_id}/form-values", response_model=dict[str, dict])
async def list_project_form_values(
    project_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    """Mapa { task_id: values } das submissões do projeto — usado pelo quadro para
    renderizar campos personalizados nos cards."""
    return await ProjectDemandFormSubmissionService.values_map_by_project(ctx.db, project_id)


@router.get("/projects/{project_id}/tasks/{task_id}/form-submission", response_model=ProjectDemandFormSubmissionResponse | None)
async def get_task_form_submission(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    return await ProjectDemandFormSubmissionService.get_by_task(ctx.db, project_id, task_id)


@router.put("/projects/{project_id}/tasks/{task_id}/form-submission", response_model=ProjectDemandFormSubmissionResponse)
async def upsert_task_form_submission(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    data: ProjectDemandFormSubmissionUpsert,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    return await ProjectDemandFormSubmissionService.upsert(
        ctx.db,
        project_id=project_id,
        task_id=task_id,
        data=data,
        updated_by=ctx.user.id,
    )


# ── Evidência de commit da User Story ──
@router.get("/projects/{project_id}/tasks/{task_id}/commits", response_model=list[UsCommitItem])
async def list_us_commits(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    """Commits já vinculados à User Story."""
    await _assert_task_in_scope(ctx, task_id)
    return await UsCommitEvidenceService.list_linked(ctx.db, project_id, task_id)


@router.get("/projects/{project_id}/tasks/{task_id}/commits/available", response_model=list[UsCommitItem])
async def list_us_commits_available(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    search: Optional[str] = Query(None, description="Busca em mensagem, autor ou hash."),
    limit: int = Query(50, ge=1, le=200),
    ctx: ModuleContext = Depends(_ctx),
):
    """Commits elegíveis: os dos repositórios do produto vinculado ao projeto."""
    await _assert_task_in_scope(ctx, task_id)
    return await UsCommitEvidenceService.available_commits(
        ctx.db, project_id, task_id, search=search, limit=limit
    )


@router.get("/projects/{project_id}/tasks/{task_id}/commits/state", response_model=UsCommitEvidenceState)
async def us_commit_evidence_state(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    """O que a US tem de evidência e se já pode ser concluída."""
    await _assert_task_in_scope(ctx, task_id)
    return await UsCommitEvidenceService.evidence_state(ctx.db, project_id, task_id)


@router.post("/projects/{project_id}/tasks/{task_id}/commits", response_model=list[UsCommitItem], status_code=201)
async def link_us_commits(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    data: UsCommitLinkIn,
    ctx: ModuleContext = Depends(_ctx),
):
    """Vincula commits do produto do projeto como evidência da User Story."""
    await _assert_task_in_scope(ctx, task_id)
    return await UsCommitEvidenceService.link(
        ctx.db, project_id, task_id, data.commit_ids, user_id=ctx.user.id
    )


@router.delete("/projects/{project_id}/tasks/{task_id}/commits/{commit_id}", status_code=204)
async def unlink_us_commit(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    commit_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    await UsCommitEvidenceService.unlink(ctx.db, project_id, task_id, commit_id)


@router.get("/projects/{project_id}/tasks/{task_id}/comments", response_model=list[ProjectTaskCommentResponse])
async def list_task_comments(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    return await ProjectTaskCommentService.list(ctx.db, project_id, task_id)


@router.get(
    "/projects/{project_id}/tasks/{task_id}/status-history",
    response_model=list[ProjectTaskStatusHistoryResponse],
)
async def list_task_status_history(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    """Timeline de movimentação entre raias: entrada/saída, data/hora e quem arrastou."""
    await _assert_task_in_scope(ctx, task_id)
    return await ProjectTaskStatusHistoryService.list(ctx.db, project_id, task_id)


@router.post("/projects/{project_id}/tasks/{task_id}/comments", response_model=ProjectTaskCommentResponse, status_code=201)
async def create_task_comment(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    data: ProjectTaskCommentCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_comment_manage),
):
    await _assert_task_in_scope(ctx, task_id)
    return await ProjectTaskCommentService.create(
        ctx.db,
        project_id,
        task_id,
        data,
        author_id=ctx.user.id,
    )


# ─────────────────────────────────────────────
# Formulário padrão de demandas
# ─────────────────────────────────────────────

@router.get("/config/default-form", response_model=list[ProjectDefaultFormFieldResponse])
async def list_default_form_fields(ctx: ModuleContext = Depends(_ctx)):
    return await ProjectDefaultFormService.list(ctx.db)


@router.put("/config/default-form", response_model=list[ProjectDefaultFormFieldResponse])
async def update_default_form_fields(
    data: ProjectDefaultFormFieldsUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_form_manage),
):
    return await ProjectDefaultFormService.replace_all(ctx.db, data)


# ─────────────────────────────────────────────
# Cronograma: vínculos fluxo + etapa
# ─────────────────────────────────────────────

@router.get("/config/schedule-bindings", response_model=list[ProjectScheduleBindingResponse])
async def list_schedule_bindings(ctx: ModuleContext = Depends(_ctx)):
    return await ProjectScheduleBindingService.list(ctx.db)


@router.put("/config/schedule-bindings", response_model=list[ProjectScheduleBindingResponse])
async def save_schedule_bindings(
    data: ProjectScheduleBindingsUpsert,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_status_manage),
):
    return await ProjectScheduleBindingService.save(ctx.db, data.bindings)


@router.delete("/config/schedule-bindings/{status_id}", status_code=204)
async def delete_schedule_binding(
    status_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_status_manage),
):
    await ProjectScheduleBindingService.delete(ctx.db, status_id)


# ─────────────────────────────────────────────
# Agentes IDCortex por etapa
# ─────────────────────────────────────────────

@router.get("/config/stage-agents", response_model=list[ProjectStageAgentBindingResponse])
async def list_stage_agents(
    project_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectStageAgentService.list(ctx.db, project_id)


@router.post("/config/stage-agents", response_model=ProjectStageAgentBindingResponse, status_code=201)
async def create_stage_agent(
    data: ProjectStageAgentBindingCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_automation_manage),
):
    return await ProjectStageAgentService.create(ctx.db, data)


@router.patch("/config/stage-agents/{binding_id}", response_model=ProjectStageAgentBindingResponse)
async def update_stage_agent(
    binding_id: uuid.UUID,
    data: ProjectStageAgentBindingUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_automation_manage),
):
    return await ProjectStageAgentService.update(ctx.db, binding_id, data)


@router.delete("/config/stage-agents/{binding_id}", status_code=204)
async def delete_stage_agent(
    binding_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_automation_manage),
):
    await ProjectStageAgentService.delete(ctx.db, binding_id)


@router.get("/tasks/{task_id}/agent-executions", response_model=list[ProjectAgentExecutionResponse])
async def list_task_agent_executions(
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    return await ProjectStageAgentService.list_executions(ctx.db, task_id)


@router.get("/config/agent-executions", response_model=ProjectAgentExecutionLogPage)
async def list_agent_execution_logs(
    status: Optional[str] = Query(None, pattern=r"^(pending|success|failed)$"),
    binding_id: Optional[uuid.UUID] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_automation_manage),
):
    return await ProjectStageAgentService.list_execution_logs(
        ctx.db,
        status=status,
        binding_id=binding_id,
        limit=limit,
        offset=offset,
    )


# ─────────────────────────────────────────────
# Layout do card (quadro)
# ─────────────────────────────────────────────

@router.get("/config/card-fields", response_model=list[ProjectCardFieldResponse])
async def list_card_fields(funnel_id: uuid.UUID = Query(...), ctx: ModuleContext = Depends(_ctx)):
    return await ProjectCardFieldService.list(ctx.db, funnel_id)


@router.get("/config/card-fields/available", response_model=list[ProjectCardAvailableField])
async def list_available_card_fields(funnel_id: uuid.UUID = Query(...), ctx: ModuleContext = Depends(_ctx)):
    """Campos personalizados do formulário disponíveis para incluir no layout do card."""
    return await ProjectCardFieldService.list_available_custom(ctx.db, funnel_id)


@router.put("/config/card-fields", response_model=list[ProjectCardFieldResponse])
async def save_card_fields(
    data: ProjectCardFieldsUpdate,
    funnel_id: uuid.UUID = Query(...),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_status_manage),
):
    return await ProjectCardFieldService.replace_all(ctx.db, funnel_id, data)


# ─────────────────────────────────────────────
# Priorização: Matriz de Impacto × Esforço
# ─────────────────────────────────────────────

@router.get("/config/priority/settings", response_model=PrioritySettingsResponse)
async def get_priority_settings(ctx: ModuleContext = Depends(_ctx)):
    return await PriorityConfigService.get_settings(ctx.db)


@router.put("/config/priority/settings", response_model=PrioritySettingsResponse)
async def update_priority_settings(
    data: PrioritySettingsUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_priority_manage),
):
    return await PriorityConfigService.update_settings(ctx.db, data)


@router.get("/config/priority/criteria", response_model=list[PriorityCriterionResponse])
async def list_priority_criteria(ctx: ModuleContext = Depends(_ctx)):
    return await PriorityConfigService.list_criteria(ctx.db)


@router.put("/config/priority/criteria", response_model=list[PriorityCriterionResponse])
async def save_priority_criteria(
    data: PriorityCriteriaUpsert,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_priority_manage),
):
    return await PriorityConfigService.save_criteria(ctx.db, data)


@router.get("/config/priority/pillars", response_model=list[PriorityPillarResponse])
async def list_priority_pillars(ctx: ModuleContext = Depends(_ctx)):
    return await PriorityConfigService.list_pillars(ctx.db)


@router.put("/config/priority/pillars", response_model=list[PriorityPillarResponse])
async def save_priority_pillars(
    data: PriorityPillarsUpsert,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_priority_manage),
):
    return await PriorityConfigService.save_pillars(ctx.db, data)


@router.get("/config/priority/confidence-levels", response_model=list[PriorityConfidenceResponse])
async def list_priority_confidence(ctx: ModuleContext = Depends(_ctx)):
    return await PriorityConfigService.list_confidence(ctx.db)


@router.put("/config/priority/confidence-levels", response_model=list[PriorityConfidenceResponse])
async def save_priority_confidence(
    data: PriorityConfidenceUpsert,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_priority_manage),
):
    return await PriorityConfigService.save_confidence(ctx.db, data)


@router.get("/config/priority/quadrants", response_model=list[PriorityQuadrantResponse])
async def list_priority_quadrants(ctx: ModuleContext = Depends(_ctx)):
    return await PriorityConfigService.list_quadrants(ctx.db)


@router.put("/config/priority/quadrants", response_model=list[PriorityQuadrantResponse])
async def save_priority_quadrants(
    data: PriorityQuadrantsUpsert,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_priority_manage),
):
    return await PriorityConfigService.save_quadrants(ctx.db, data)


@router.get("/priority/matrix", response_model=list[PriorityMatrixItem])
async def priority_matrix(
    funnel_id: Optional[uuid.UUID] = Query(None),
    quadrant: Optional[str] = Query(None),
    pillar_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await PriorityScoreService.matrix(ctx.db, funnel_id=funnel_id, quadrant=quadrant, pillar_id=pillar_id)


@router.post("/tasks/{task_id}/priority/preview", response_model=PriorityComputeResult)
async def preview_task_priority(
    task_id: uuid.UUID,
    data: PriorityScoreInput,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_priority_score),
):
    return await PriorityScoreService.preview(ctx.db, data)


@router.get("/tasks/{task_id}/priority", response_model=Optional[PriorityScoreResponse])
async def get_task_priority(
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    return await PriorityScoreService.get_for_task(ctx.db, task_id)


@router.get("/tasks/{task_id}/priority/history", response_model=list[PriorityScoreHistoryItem])
async def get_task_priority_history(
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    return await PriorityScoreService.history(ctx.db, task_id)


@router.put("/tasks/{task_id}/priority", response_model=PriorityScoreResponse)
async def save_task_priority(
    task_id: uuid.UUID,
    data: PriorityScoreInput,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_priority_score),
):
    await _assert_task_in_scope(ctx, task_id)
    return await PriorityScoreService.score_task(ctx.db, task_id, data, ctx.user.id)


@router.delete("/tasks/{task_id}/priority", status_code=204)
async def delete_task_priority(
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_priority_score),
):
    await _assert_task_in_scope(ctx, task_id)
    await PriorityScoreService.delete(ctx.db, task_id)

