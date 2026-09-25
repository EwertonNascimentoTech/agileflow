"""
Rotas da Operação Assistida — cadastro de clientes (PO) e Portal do Cliente.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.core import storage
from app.core.dependencies import ModuleContext, require_module, require_permission
from app.modules.projetos.api.routes import (
    _MAX_UPLOAD_BYTES,
    _assert_task_in_scope,
    _ctx,
    _po_external_scope,
)
from app.modules.projetos.assisted_ops import AssistedOpsService
from app.modules.projetos.ai_solutions import AiSolutionsService
from app.modules.projetos.assisted_ops_closure import AssistedOpsClosureService, AssistedOpsIndicatorsService
from app.modules.projetos.clients import ProjectClientService
from app.modules.projetos.portal_assistant import PortalAssistantService
from app.modules.projetos.program_portal import PortalPortfolioService, ProgramAdminService
from app.modules.projetos.schemas import (
    AssistedOpsEntrySet,
    AssistedOpsEntryState,
    AssistedOpsExtend,
    AssistedOpsPhaseSet,
    AssistedOpsClosureAcceptance,
    AssistedOpsClosureOverride,
    AssistedOpsClosureSet,
    AssistedOpsClosureState,
    AssistedOpsIndicators,
    AssistedOpsMeasureIn,
    AssistedOpsTargets,
    PortalAssistedOps,
    AssistedOpMeetingIn,
    AssistedOpMeetingOut,
    PortalAssistantAnswer,
    PortalAssistantAsk,
    AiSolutionCancel,
    AiSolutionCreate,
    AiSolutionDetail,
    AiSolutionForm,
    AiSolutionHomologation,
    AiSolutionReady,
    AiSolutionResubmit,
    AiSolutionSummary,
    AssistedOpsDevResponse,
    ProjectClientCandidates,
    ProjectClientMemberAdd,
    ProjectClientMembers,
    ProjectClientMemberUpdate,
    AssistedOpsDevsSet,
    OccurrenceForwardRelease,
    OccurrenceHomologation,
    OccurrenceTriage,
    OccurrenceCommentCreate,
    OccurrenceCreate,
    OccurrenceDetail,
    OccurrenceSummary,
    OccurrenceTeamUpdate,
    PortalProject,
    ProjectUploadResponse,
    ProjectUploadUrlResponse,
    ProjectClientCreate,
    ProjectClientLookupResponse,
    ProjectClientProjectRef,
    ProjectClientProjectsSet,
    ProjectClientResponse,
    ProjectClientUpdate,
)

router = APIRouter(prefix="/projetos", tags=["Projetos - Operação Assistida"])

_can_client_manage = require_permission("projetos.client.manage")
_can_program_manage = require_permission("projetos.program.manage")
_can_task_manage = require_permission("projetos.task.manage")
# Portal: única entrada do cliente externo no sistema.
_portal_ctx = require_module("projetos", allow_client=True)


@router.get("/clients", response_model=list[ProjectClientResponse])
async def list_clients(
    search: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_client_manage),
):
    return await ProjectClientService.list_clients(
        ctx.db, search=search, include_inactive=include_inactive, scope=await _po_external_scope(ctx)
    )


@router.get("/clients/candidates", response_model=ProjectClientCandidates)
async def search_request_client_candidates(
    q: str = Query("", max_length=120),
    ctx: ModuleContext = Depends(_ctx),
):
    """Sugestões para o campo Clientes da solicitação (quem abre a demanda escolhe)."""
    return await ProjectClientService.search_candidates(ctx.db, None, q, ctx.user.tenant_id)


@router.get("/clients/lookup", response_model=ProjectClientLookupResponse)
async def lookup_client(
    email: str = Query(..., min_length=3),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_client_manage),
):
    """Verifica o e-mail antes de cadastrar (e-mail é único)."""
    return await ProjectClientService.lookup(ctx.db, email, ctx.user.tenant_id)


@router.get("/clients/linkable-projects", response_model=list[ProjectClientProjectRef])
async def list_linkable_projects(
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_client_manage),
):
    return await ProjectClientService.list_linkable_projects(ctx.db, scope=await _po_external_scope(ctx))


@router.post("/clients", response_model=ProjectClientResponse, status_code=201)
async def create_client(
    data: ProjectClientCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_client_manage),
):
    return await ProjectClientService.create(
        ctx.db, data, ctx.user.tenant_id, ctx.user.id, scope=await _po_external_scope(ctx)
    )


@router.post("/clients/{client_id}/first-access-link")
async def client_first_access_link(
    client_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_client_manage),
):
    """Link de primeiro acesso (72 h) para o PO enviar ao cliente."""
    from sqlalchemy import select as _select

    from app.modules.super_admin.models import User as _User
    from app.modules.super_admin.service import UserService

    client = await ProjectClientService.get(ctx.db, client_id)
    scope = await _po_external_scope(ctx)
    if scope is not None and not any(p.task_id in scope for p in client.projects):
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    user = (await ctx.db.execute(_select(_User).where(_User.id == client.user_id))).scalar_one_or_none() if client.user_id else None
    if user is None:
        raise HTTPException(status_code=400, detail="Cliente sem login.")
    return UserService.first_access_link_for_user(user)


@router.get("/clients/{client_id}", response_model=ProjectClientResponse)
async def get_client(
    client_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_client_manage),
):
    return await ProjectClientService.get(ctx.db, client_id)


@router.patch("/clients/{client_id}", response_model=ProjectClientResponse)
async def update_client(
    client_id: uuid.UUID,
    data: ProjectClientUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_client_manage),
):
    return await ProjectClientService.update(ctx.db, client_id, data)


@router.put("/clients/{client_id}/projects", response_model=ProjectClientResponse)
async def set_client_projects(
    client_id: uuid.UUID,
    data: ProjectClientProjectsSet,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_client_manage),
):
    return await ProjectClientService.set_projects(
        ctx.db, client_id, data.project_task_ids, ctx.user.id, scope=await _po_external_scope(ctx)
    )


@router.get("/tasks/{task_id}/clients", response_model=list[ProjectClientResponse])
async def list_project_clients(
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    return await ProjectClientService.list_for_project(ctx.db, task_id)


# ── Clientes do projeto (card do projeto): PO do projeto e coordenação ─────────

@router.get("/tasks/{task_id}/project-clients", response_model=ProjectClientMembers)
async def list_project_client_members(task_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    """Clientes do projeto com a função de cada um; `can_manage` diz se quem vê pode mexer."""
    await _assert_task_in_scope(ctx, task_id)
    return await ProjectClientService.list_members(ctx.db, task_id, ctx.user)


@router.get("/tasks/{task_id}/project-clients/candidates", response_model=ProjectClientCandidates)
async def search_project_client_candidates(
    task_id: uuid.UUID,
    q: str = Query("", max_length=120),
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    await ProjectClientService.assert_can_manage_project(ctx.db, ctx.user, task_id)
    return await ProjectClientService.search_candidates(ctx.db, task_id, q, ctx.user.tenant_id)


@router.post("/tasks/{task_id}/project-clients", response_model=ProjectClientMembers, status_code=201)
async def add_project_client_member(
    task_id: uuid.UUID, data: ProjectClientMemberAdd, ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    await ProjectClientService.assert_can_manage_project(ctx.db, ctx.user, task_id)
    await ProjectClientService.add_member(ctx.db, task_id, data, ctx.user.tenant_id, ctx.user.id)
    return await ProjectClientService.list_members(ctx.db, task_id, ctx.user)


@router.patch("/tasks/{task_id}/project-clients/{client_id}", response_model=ProjectClientMembers)
async def update_project_client_member(
    task_id: uuid.UUID, client_id: uuid.UUID, data: ProjectClientMemberUpdate,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    await ProjectClientService.assert_can_manage_project(ctx.db, ctx.user, task_id)
    await ProjectClientService.update_member(ctx.db, task_id, client_id, data)
    return await ProjectClientService.list_members(ctx.db, task_id, ctx.user)


@router.delete("/tasks/{task_id}/project-clients/{client_id}", response_model=ProjectClientMembers)
async def remove_project_client_member(
    task_id: uuid.UUID, client_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    await ProjectClientService.assert_can_manage_project(ctx.db, ctx.user, task_id)
    await ProjectClientService.remove_member(ctx.db, task_id, client_id)
    return await ProjectClientService.list_members(ctx.db, task_id, ctx.user)


# ── Clientes do programa (cadastro de Programas): veem todos os projetos no Portal ──

@router.get("/programs/{program_id}/clients", response_model=ProjectClientMembers)
async def list_program_clients(
    program_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_program_manage),
):
    return await ProgramAdminService.list_clients(ctx.db, program_id)


@router.get("/programs/{program_id}/clients/candidates", response_model=ProjectClientCandidates)
async def search_program_client_candidates(
    program_id: uuid.UUID,
    q: str = Query("", max_length=120),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_program_manage),
):
    return await ProgramAdminService.search_candidates(ctx.db, program_id, q, ctx.user.tenant_id)


@router.post("/programs/{program_id}/clients", response_model=ProjectClientMembers, status_code=201)
async def add_program_client(
    program_id: uuid.UUID, data: ProjectClientMemberAdd, ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_program_manage),
):
    return await ProgramAdminService.add_client(ctx.db, program_id, data, ctx.user.tenant_id, ctx.user.id)


@router.patch("/programs/{program_id}/clients/{client_id}", response_model=ProjectClientMembers)
async def update_program_client(
    program_id: uuid.UUID, client_id: uuid.UUID, data: ProjectClientMemberUpdate,
    ctx: ModuleContext = Depends(_ctx), _=Depends(_can_program_manage),
):
    return await ProgramAdminService.update_client(ctx.db, program_id, client_id, data)


@router.delete("/programs/{program_id}/clients/{client_id}", response_model=ProjectClientMembers)
async def remove_program_client(
    program_id: uuid.UUID, client_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_program_manage),
):
    return await ProgramAdminService.remove_client(ctx.db, program_id, client_id)


# ── Portal do Cliente ────────────────────────────────────────────────────────

@router.get("/portal/portfolio")
async def portal_portfolio(ctx: ModuleContext = Depends(_portal_ctx)):
    """Visão geral do cliente: mapa Impacto × Esforço, programas e projetos que ele acompanha."""
    return await PortalPortfolioService.portfolio(ctx.db, ctx.user.id)


@router.get("/portal/projects/{task_id}")
async def portal_project(task_id: uuid.UUID, ctx: ModuleContext = Depends(_portal_ctx)):
    """Projeto: indicadores, árvore Feature → User Story e roadmap (mesma visão do programa)."""
    return await PortalPortfolioService.project(ctx.db, ctx.user.id, task_id)


@router.get("/portal/programs/{program_id}")
async def portal_program(program_id: uuid.UUID, ctx: ModuleContext = Depends(_portal_ctx)):
    """Programa: cabeçalho, pilares, projetos com Features/US e roadmap."""
    return await PortalPortfolioService.program(ctx.db, ctx.user.id, program_id)


@router.get("/portal/deliveries")
async def portal_deliveries(ctx: ModuleContext = Depends(_portal_ctx)):
    """Entregas e Marcos: Features concluídas e previstas e a entrega de cada projeto."""
    return await PortalPortfolioService.deliveries(ctx.db, ctx.user.id)


@router.post("/portal/assistant", response_model=PortalAssistantAnswer)
async def portal_assistant(data: PortalAssistantAsk, ctx: ModuleContext = Depends(_portal_ctx)):
    """Assistente do Portal: responde sobre o que a pessoa vê no Portal (dados anonimizados antes da IA)."""
    return await PortalAssistantService.ask(ctx.db, ctx.user.id, data)

# ── Portal: Soluções com IA ─────────────────────────────────────────────────

@router.get("/portal/ai-solutions/form", response_model=AiSolutionForm)
async def portal_ai_solution_form(ctx: ModuleContext = Depends(_portal_ctx)):
    """Campos do pedido (seção "Pedido do cliente" do tipo Solicitar análise de solução com IA)."""
    return await AiSolutionsService.form(ctx.db)


@router.get("/portal/ai-solutions", response_model=list[AiSolutionSummary])
async def portal_ai_solutions(ctx: ModuleContext = Depends(_portal_ctx)):
    return await AiSolutionsService.portal_list(ctx.db, ctx.user)


@router.post("/portal/ai-solutions", response_model=AiSolutionDetail, status_code=201)
async def portal_ai_solution_create(data: AiSolutionCreate, ctx: ModuleContext = Depends(_portal_ctx)):
    return await AiSolutionsService.portal_create(ctx.db, ctx.user, data)


@router.get("/portal/ai-solutions/{task_id}", response_model=AiSolutionDetail)
async def portal_ai_solution_detail(task_id: uuid.UUID, ctx: ModuleContext = Depends(_portal_ctx)):
    return await AiSolutionsService.portal_detail(ctx.db, ctx.user, task_id)


@router.post("/portal/ai-solutions/{task_id}/resubmit", response_model=AiSolutionDetail)
async def portal_ai_solution_resubmit(
    task_id: uuid.UUID, data: AiSolutionResubmit, ctx: ModuleContext = Depends(_portal_ctx),
):
    return await AiSolutionsService.portal_resubmit(ctx.db, ctx.user, task_id, data)


@router.post("/portal/ai-solutions/{task_id}/ready", response_model=AiSolutionDetail)
async def portal_ai_solution_ready(
    task_id: uuid.UUID, data: AiSolutionReady, ctx: ModuleContext = Depends(_portal_ctx),
):
    return await AiSolutionsService.portal_ready(ctx.db, ctx.user, task_id, data)


@router.post("/portal/ai-solutions/{task_id}/homologation", response_model=AiSolutionDetail)
async def portal_ai_solution_homologate(
    task_id: uuid.UUID, data: AiSolutionHomologation, ctx: ModuleContext = Depends(_portal_ctx),
):
    return await AiSolutionsService.portal_homologate(ctx.db, ctx.user, task_id, data)


@router.post("/portal/ai-solutions/{task_id}/cancel", response_model=AiSolutionDetail)
async def portal_ai_solution_cancel(
    task_id: uuid.UUID, data: AiSolutionCancel, ctx: ModuleContext = Depends(_portal_ctx),
):
    return await AiSolutionsService.portal_cancel(ctx.db, ctx.user, task_id, data)


@router.post("/portal/ai-solutions/{task_id}/comments", response_model=AiSolutionDetail, status_code=201)
async def portal_ai_solution_comment(
    task_id: uuid.UUID, data: OccurrenceCommentCreate, ctx: ModuleContext = Depends(_portal_ctx),
):
    return await AiSolutionsService.portal_comment(ctx.db, ctx.user, task_id, data)


@router.get("/portal/projects", response_model=list[PortalProject])
async def portal_projects(ctx: ModuleContext = Depends(_portal_ctx)):
    """Projetos a que o cliente logado tem acesso (e se aceitam ocorrências agora)."""
    return await AssistedOpsService.portal_projects(ctx.db, ctx.user.id)


@router.get("/portal/occurrences", response_model=list[OccurrenceSummary])
async def portal_list_occurrences(
    project_task_id: Optional[uuid.UUID] = Query(None),
    mine: bool = Query(False),
    ctx: ModuleContext = Depends(_portal_ctx),
):
    return await AssistedOpsService.portal_list(ctx.db, ctx.user.id, project_task_id, mine)


@router.post("/portal/occurrences", response_model=OccurrenceDetail, status_code=201)
async def portal_open_occurrence(data: OccurrenceCreate, ctx: ModuleContext = Depends(_portal_ctx)):
    return await AssistedOpsService.portal_open(ctx.db, ctx.user, data)


@router.get("/portal/occurrences/{task_id}", response_model=OccurrenceDetail)
async def portal_get_occurrence(task_id: uuid.UUID, ctx: ModuleContext = Depends(_portal_ctx)):
    return await AssistedOpsService.portal_detail(ctx.db, ctx.user.id, task_id)


@router.post("/portal/occurrences/{task_id}/comments", response_model=OccurrenceDetail, status_code=201)
async def portal_comment_occurrence(
    task_id: uuid.UUID,
    data: OccurrenceCommentCreate,
    ctx: ModuleContext = Depends(_portal_ctx),
):
    return await AssistedOpsService.portal_comment(ctx.db, ctx.user, task_id, data)


@router.get("/portal/projects/{task_id}/assisted-ops", response_model=PortalAssistedOps)
async def portal_project_assisted_ops(task_id: uuid.UUID, ctx: ModuleContext = Depends(_portal_ctx)):
    """Aba Operação Assistida do projeto no Portal: indicadores, encerramento e atas."""
    return await AssistedOpsClosureService.portal_view(ctx.db, ctx.user.id, task_id)


@router.post("/portal/projects/{task_id}/assisted-ops/acceptance", response_model=PortalAssistedOps)
async def portal_project_assisted_ops_accept(
    task_id: uuid.UUID, data: AssistedOpsClosureAcceptance, ctx: ModuleContext = Depends(_portal_ctx),
):
    """Aceite (ou recusa) do encerramento pelo Dono do Processo (POP 8.4)."""
    return await AssistedOpsClosureService.portal_accept(ctx.db, ctx.user, task_id, data)


@router.post("/portal/occurrences/{task_id}/triage", response_model=OccurrenceDetail)
async def portal_triage_occurrence(
    task_id: uuid.UUID,
    data: OccurrenceTriage,
    ctx: ModuleContext = Depends(_portal_ctx),
):
    """Triagem N1 (POP 8.2.2): resolver a dúvida ou encaminhar à TI (correção ou melhoria)."""
    return await AssistedOpsService.portal_triage(ctx.db, ctx.user, task_id, data)


@router.post("/portal/occurrences/{task_id}/homologation", response_model=OccurrenceDetail)
async def portal_homologate_occurrence(
    task_id: uuid.UUID,
    data: OccurrenceHomologation,
    ctx: ModuleContext = Depends(_portal_ctx),
):
    """Cliente aprova (NPS 0–10) ou reprova (motivo) a ocorrência em Homologando."""
    return await AssistedOpsService.portal_homologate(ctx.db, ctx.user, task_id, data)


@router.post("/portal/uploads", response_model=ProjectUploadResponse)
async def portal_upload(file: UploadFile = File(...), ctx: ModuleContext = Depends(_portal_ctx)):
    """Anexo de ocorrência / mensagem enviado pelo cliente."""
    await AssistedOpsService._client_for_user(ctx.db, ctx.user.id)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo excede o limite de 20 MB.")
    object_name = storage.upload_file(
        data=data,
        content_type=file.content_type or "application/octet-stream",
        folder=f"projetos/{ctx.schema}/ocorrencias",
    )
    return ProjectUploadResponse(
        object_name=object_name,
        filename=file.filename or "arquivo",
        content_type=file.content_type or "application/octet-stream",
        size=len(data),
    )


@router.get("/portal/uploads/url", response_model=ProjectUploadUrlResponse)
async def portal_upload_url(object_name: str = Query(...), ctx: ModuleContext = Depends(_portal_ctx)):
    """URL temporária de anexo — só de ocorrências que o cliente pode ver."""
    if not object_name.startswith(f"projetos/{ctx.schema}/") or not await AssistedOpsService.portal_can_read_object(
        ctx.db, ctx.user.id, object_name
    ):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    url = storage.get_presigned_url(object_name)
    if not url:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    return ProjectUploadUrlResponse(url=url)


# ── Ocorrências: visão do time (drawer do card) ─────────────────────────────

@router.get("/occurrences/release-candidates")
async def team_release_candidates(ctx: ModuleContext = Depends(_ctx)):
    """Projetos de destino (e suas Features) para encaminhar melhoria."""
    return await AssistedOpsService.release_candidates(ctx.db, scope=await _po_external_scope(ctx))


@router.get("/occurrences/{task_id}", response_model=OccurrenceDetail)
async def team_get_occurrence(task_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.team_detail(ctx.db, task_id, ctx.user)


@router.patch("/occurrences/{task_id}", response_model=OccurrenceDetail)
async def team_update_occurrence(
    task_id: uuid.UUID,
    data: OccurrenceTeamUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_task_manage),
):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.team_update(ctx.db, task_id, data, ctx.user)


@router.post("/occurrences/{task_id}/assume", response_model=OccurrenceDetail)
async def team_assume_occurrence(task_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    """Dev fixo assume (ou toma de outro dev) a ocorrência."""
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.assume(ctx.db, task_id, ctx.user)


@router.post("/occurrences/{task_id}/forward-release", response_model=OccurrenceDetail)
async def team_forward_occurrence(
    task_id: uuid.UUID,
    data: OccurrenceForwardRelease,
    ctx: ModuleContext = Depends(_ctx),
):
    """PO encaminha a melhoria para um projeto de Release (Feature ou US)."""
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.forward_to_release(ctx.db, task_id, data, ctx.user)


@router.get("/tasks/{task_id}/assisted-ops-devs", response_model=list[AssistedOpsDevResponse])
async def list_assisted_ops_devs(task_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    """Desenvolvedores fixos de atendimento da Operação Assistida do projeto."""
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.list_devs(ctx.db, task_id)


@router.get("/tasks/{task_id}/assisted-ops-entry", response_model=AssistedOpsEntryState)
async def get_assisted_ops_entry(task_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    """Pré-requisitos (POP 5), fim previsto e prorrogações da Operação Assistida do projeto."""
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.entry_state(ctx.db, task_id, ctx.user)


@router.put("/tasks/{task_id}/assisted-ops-entry", response_model=AssistedOpsEntryState)
async def set_assisted_ops_entry(task_id: uuid.UUID, data: AssistedOpsEntrySet, ctx: ModuleContext = Depends(_ctx)):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.set_entry(ctx.db, task_id, data, ctx.user)


@router.post("/tasks/{task_id}/assisted-ops-entry/extend", response_model=AssistedOpsEntryState)
async def extend_assisted_ops(task_id: uuid.UUID, data: AssistedOpsExtend, ctx: ModuleContext = Depends(_ctx)):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.extend(ctx.db, task_id, data, ctx.user)


# ── Indicadores e encerramento da Operação Assistida (POP 8.1.3, 8.4 e 8.5) ──

@router.get("/tasks/{task_id}/assisted-ops-indicators", response_model=AssistedOpsIndicators)
async def get_assisted_ops_indicators(task_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsIndicatorsService.compute(ctx.db, task_id, ctx.user)


@router.put("/tasks/{task_id}/assisted-ops-targets", response_model=AssistedOpsIndicators)
async def set_assisted_ops_targets(task_id: uuid.UUID, data: AssistedOpsTargets, ctx: ModuleContext = Depends(_ctx)):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsIndicatorsService.set_targets(ctx.db, task_id, data, ctx.user)


@router.post("/tasks/{task_id}/assisted-ops-measures", response_model=AssistedOpsIndicators)
async def add_assisted_ops_measure(task_id: uuid.UUID, data: AssistedOpsMeasureIn, ctx: ModuleContext = Depends(_ctx)):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsIndicatorsService.add_measure(ctx.db, task_id, data, ctx.user)


@router.delete("/tasks/{task_id}/assisted-ops-measures/{measure_id}", response_model=AssistedOpsIndicators)
async def delete_assisted_ops_measure(task_id: uuid.UUID, measure_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsIndicatorsService.delete_measure(ctx.db, task_id, measure_id, ctx.user)


@router.get("/tasks/{task_id}/assisted-ops-closure", response_model=AssistedOpsClosureState)
async def get_assisted_ops_closure(task_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsClosureService.state(ctx.db, task_id, ctx.user)


@router.put("/tasks/{task_id}/assisted-ops-closure", response_model=AssistedOpsClosureState)
async def set_assisted_ops_closure(task_id: uuid.UUID, data: AssistedOpsClosureSet, ctx: ModuleContext = Depends(_ctx)):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsClosureService.save(ctx.db, task_id, data, ctx.user)


@router.get("/tasks/{task_id}/assisted-ops-closure/draft")
async def draft_assisted_ops_closure(task_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)) -> dict[str, str]:
    """Rascunho da análise crítica a partir das ocorrências, escalonamentos e atas."""
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsClosureService.draft(ctx.db, task_id, ctx.user)


@router.post("/tasks/{task_id}/assisted-ops-closure/request-acceptance", response_model=AssistedOpsClosureState)
async def request_assisted_ops_acceptance(task_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsClosureService.request_acceptance(ctx.db, task_id, ctx.user)


@router.post("/tasks/{task_id}/assisted-ops-closure/override", response_model=AssistedOpsClosureState)
async def override_assisted_ops_acceptance(
    task_id: uuid.UUID, data: AssistedOpsClosureOverride, ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsClosureService.override(ctx.db, task_id, data, ctx.user)


@router.put("/tasks/{task_id}/assisted-ops-phase", response_model=AssistedOpsEntryState)
async def set_assisted_ops_phase(task_id: uuid.UUID, data: AssistedOpsPhaseSet, ctx: ModuleContext = Depends(_ctx)):
    """Fase da Operação Assistida (POP 8.3.1)."""
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.set_phase(ctx.db, task_id, data, ctx.user)


@router.get("/tasks/{task_id}/assisted-ops-meetings", response_model=list[AssistedOpMeetingOut])
async def list_assisted_ops_meetings(task_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    """Atas dos ritos da Operação Assistida (POP 8.3.5)."""
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.list_meetings(ctx.db, task_id, ctx.user)


@router.post("/tasks/{task_id}/assisted-ops-meetings", response_model=AssistedOpMeetingOut, status_code=201)
async def create_assisted_ops_meeting(task_id: uuid.UUID, data: AssistedOpMeetingIn, ctx: ModuleContext = Depends(_ctx)):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.create_meeting(ctx.db, task_id, data, ctx.user)


@router.put("/tasks/{task_id}/assisted-ops-meetings/{meeting_id}", response_model=AssistedOpMeetingOut)
async def update_assisted_ops_meeting(
    task_id: uuid.UUID, meeting_id: uuid.UUID, data: AssistedOpMeetingIn, ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.update_meeting(ctx.db, task_id, meeting_id, data, ctx.user)


@router.delete("/tasks/{task_id}/assisted-ops-meetings/{meeting_id}", status_code=204)
async def delete_assisted_ops_meeting(task_id: uuid.UUID, meeting_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    await _assert_task_in_scope(ctx, task_id)
    await AssistedOpsService.delete_meeting(ctx.db, task_id, meeting_id, ctx.user)


@router.put("/tasks/{task_id}/assisted-ops-devs", response_model=list[AssistedOpsDevResponse])
async def set_assisted_ops_devs(
    task_id: uuid.UUID,
    data: AssistedOpsDevsSet,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.set_devs(ctx.db, task_id, data.person_ids, ctx.user, data.allocations)
