import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select

from app.core import storage
from app.core.dependencies import ModuleContext, require_module, require_permission
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
    ProjectResponse,
    ProjectScheduleBindingResponse,
    ProjectScheduleBindingsUpsert,
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
    ProjectTaskCreate,
    ScheduleStageCreate,
    TaskImportResult,
    ProjectTaskResponse,
    ProjectTaskUpdate,
    ProjectTaskReorder,
    ProjectTaskWithContextResponse,
    ProjectUpdate,
    ProjectUploadResponse,
    ProjectUploadUrlResponse,
    TaskDependencyCreate,
    TaskDependencyResponse,
    WorkloadResponse,
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
    ProjectScheduleBindingService,
    ProjectService,
    ProjectStatusService,
    ProjectTaskCommentService,
    ProjectTaskService,
    ProjectStatusDefaultFormLinkService,
    ProjectStatusSectionLinkService,
    StatusReportService,
    TaskDependencyService,
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


async def _has_permission(ctx: ModuleContext, code: str) -> bool:
    if ctx.user.role in (UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN):
        return True
    if not ctx.user.role_id:
        return False
    result = await ctx.db.execute(
        select(RolePermission).where(
            RolePermission.role_id == ctx.user.role_id,
            RolePermission.permission_code == code,
        )
    )
    return result.scalar_one_or_none() is not None


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


async def _person_id_for_user(ctx: ModuleContext) -> Optional[uuid.UUID]:
    """person_id (teamops) do usuário logado — o responsável da tarefa agora é uma Pessoa."""
    from app.modules.teamops.models import Person
    res = await ctx.db.execute(select(Person.id).where(Person.user_id == ctx.user.id))
    return res.scalar_one_or_none()


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
    return await ProjectFunnelService.list(ctx.db, project_id, active_only=active_only, current_user=ctx.user)


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


@router.get("/me/requests", response_model=list[ProjectTaskWithContextResponse])
async def list_my_requests(ctx: ModuleContext = Depends(_ctx)):
    basic = await _is_basic_user(ctx)
    return await ProjectTaskService.list_for_user(
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
    return await ProjectTaskService.list_all(ctx.db, project_id=project_id)


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
):
    return await ProjectReportsService.build(ctx.db, po=po, diretoria=diretoria, area=area)


@router.get("/pos", response_model=list[PoOption])
async def list_pos(ctx: ModuleContext = Depends(_ctx)):
    """POs do tenant (com/sem login) para o seletor do painel."""
    return await PoPortfolioService.list_pos(ctx.db)


@router.get("/po-portfolio/overview", response_model=PoOverviewResponse)
async def get_po_portfolio_overview(
    diretoria: Optional[str] = Query(None, description="Filtra projetos/programas pela diretoria."),
    area: Optional[str] = Query(None, description="Filtra projetos/programas pela área."),
    ctx: ModuleContext = Depends(_ctx),
):
    """Modo gestão: agregados do portfólio de cada PO, lado a lado."""
    return await PoPortfolioService.build_overview(ctx.db, diretoria=diretoria, area=area)


@router.get("/po-portfolio", response_model=PoPortfolioResponse)
async def get_po_portfolio(
    po_id: Optional[uuid.UUID] = Query(None),
    diretoria: Optional[str] = Query(None, description="Filtra projetos/programas pela diretoria."),
    area: Optional[str] = Query(None, description="Filtra projetos/programas pela área."),
    ctx: ModuleContext = Depends(_ctx),
):
    """Portfólio do PO: projetos/programas que ele possui (assigned_to), com prioridade,
    progresso, riscos, gargalos, previsibilidade e saúde sintetizada. Gated só pelo módulo.
    Sem `po_id` → agrega o portfólio de todos os POs."""
    return await PoPortfolioService.build(ctx.db, po_id, diretoria=diretoria, area=area)


@router.post("/status-reports/preview")
async def preview_status_report(
    data: StatusReportPreviewIn,
    ctx: ModuleContext = Depends(_ctx),
):
    """Monta o Status Report do estado atual para o recorte (diretoria/área). NÃO persiste —
    serve de rascunho para o editor preencher a narrativa antes de salvar."""
    return await StatusReportService.build_preview(ctx.db, diretoria=data.diretoria, area=data.area)


@router.post("/status-reports", response_model=StatusReportResponse, status_code=201)
async def create_status_report(
    data: StatusReportCreateIn,
    ctx: ModuleContext = Depends(_ctx),
):
    """Persiste um snapshot imutável (dados do estado atual + narrativa). Vira um ponto na
    série histórica do recorte."""
    return await StatusReportService.create(ctx.db, data, ctx.user.id)


@router.get("/status-reports", response_model=list[StatusReportListItem])
async def list_status_reports(
    diretoria: Optional[str] = Query(None, description="Filtra a série histórica pela diretoria."),
    area: Optional[str] = Query(None, description="Filtra a série histórica pela área."),
    ctx: ModuleContext = Depends(_ctx),
):
    """Série histórica de Status Reports (mais recente primeiro), filtrável por recorte."""
    return await StatusReportService.list(ctx.db, diretoria=diretoria, area=area)


@router.get("/status-reports/{report_id}", response_model=StatusReportResponse)
async def get_status_report(
    report_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    """Snapshot completo de um Status Report para visualização/impressão."""
    return await StatusReportService.get(ctx.db, report_id)


@router.get("/projects/{project_id}/tasks", response_model=list[ProjectTaskResponse])
async def list_tasks(
    project_id: uuid.UUID,
    status_id: Optional[uuid.UUID] = Query(None),
    assigned_to: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    if await _is_basic_user(ctx):
        assigned_to = await _person_id_for_user(ctx) or _NOBODY
        return await ProjectTaskService.list(
            ctx.db,
            project_id=project_id,
            status_id=status_id,
            assigned_to=assigned_to,
        )

    can_view_all = await _has_permission(ctx, "projetos.task.view") or await _has_permission(ctx, "projetos.task.manage")
    if not can_view_all:
        own_view = await _has_permission(ctx, "projetos.task.view_own")
        if own_view:
            assigned_to = await _person_id_for_user(ctx) or _NOBODY
        else:
            raise HTTPException(status_code=403, detail="Sem permissão para visualizar tarefas.")
    return await ProjectTaskService.list(
        ctx.db,
        project_id=project_id,
        status_id=status_id,
        assigned_to=assigned_to,
    )


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


@router.delete("/projects/{project_id}/tasks/{task_id}", status_code=204)
async def delete_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
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
    return await ProjectTaskService.list_children(ctx.db, project_id, task_id)


@router.post("/projects/{project_id}/tasks/{task_id}/schedule-stages", response_model=ProjectTaskResponse, status_code=201)
async def create_schedule_stage(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    data: ScheduleStageCreate,
    ctx: ModuleContext = Depends(_ctx),
):
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
    ctx: ModuleContext = Depends(_ctx),
):
    from datetime import date as _date

    df = _date.fromisoformat(date_from) if date_from else None
    dt = _date.fromisoformat(date_to) if date_to else None
    cells = await TaskDependencyService.compute_workload(ctx.db, project_id, df, dt, unit=unit)
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


@router.get("/projects/{project_id}/critical-path", response_model=list[CriticalPathItem])
async def get_critical_path(
    project_id: uuid.UUID,
    root: uuid.UUID = Query(..., description="Card de planejamento (raiz do cronograma)"),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectTaskService.critical_path(ctx.db, project_id, root)


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
    return await ProjectDemandFormSubmissionService.get_by_task(ctx.db, project_id, task_id)


@router.put("/projects/{project_id}/tasks/{task_id}/form-submission", response_model=ProjectDemandFormSubmissionResponse)
async def upsert_task_form_submission(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    data: ProjectDemandFormSubmissionUpsert,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectDemandFormSubmissionService.upsert(
        ctx.db,
        project_id=project_id,
        task_id=task_id,
        data=data,
        updated_by=ctx.user.id,
    )


@router.get("/projects/{project_id}/tasks/{task_id}/comments", response_model=list[ProjectTaskCommentResponse])
async def list_task_comments(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectTaskCommentService.list(ctx.db, project_id, task_id)


@router.post("/projects/{project_id}/tasks/{task_id}/comments", response_model=ProjectTaskCommentResponse, status_code=201)
async def create_task_comment(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    data: ProjectTaskCommentCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_comment_manage),
):
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
    return await PriorityScoreService.get_for_task(ctx.db, task_id)


@router.get("/tasks/{task_id}/priority/history", response_model=list[PriorityScoreHistoryItem])
async def get_task_priority_history(
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await PriorityScoreService.history(ctx.db, task_id)


@router.put("/tasks/{task_id}/priority", response_model=PriorityScoreResponse)
async def save_task_priority(
    task_id: uuid.UUID,
    data: PriorityScoreInput,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_priority_score),
):
    return await PriorityScoreService.score_task(ctx.db, task_id, data, ctx.user.id)


@router.delete("/tasks/{task_id}/priority", status_code=204)
async def delete_task_priority(
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_priority_score),
):
    await PriorityScoreService.delete(ctx.db, task_id)

