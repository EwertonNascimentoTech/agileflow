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
from app.modules.projetos.clients import ProjectClientService
from app.modules.projetos.schemas import (
    AssistedOpsDevResponse,
    ClientProjectReport,
    ProjectClientCandidates,
    ProjectClientMemberAdd,
    ProjectClientMembers,
    ProjectClientMemberUpdate,
    AssistedOpsDevsSet,
    OccurrenceForwardRelease,
    OccurrenceHomologation,
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


# ── Portal do Cliente ────────────────────────────────────────────────────────

@router.get("/portal/projects/{task_id}/report", response_model=ClientProjectReport)
async def portal_project_report(task_id: uuid.UUID, ctx: ModuleContext = Depends(_portal_ctx)):
    """Andamento do projeto para o cliente vinculado (fase, execução, Features e prazos)."""
    return await ProjectClientService.portal_project_report(ctx.db, ctx.user.id, task_id)


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


@router.put("/tasks/{task_id}/assisted-ops-devs", response_model=list[AssistedOpsDevResponse])
async def set_assisted_ops_devs(
    task_id: uuid.UUID,
    data: AssistedOpsDevsSet,
    ctx: ModuleContext = Depends(_ctx),
):
    await _assert_task_in_scope(ctx, task_id)
    return await AssistedOpsService.set_devs(ctx.db, task_id, data.person_ids, ctx.user, data.allocations)
