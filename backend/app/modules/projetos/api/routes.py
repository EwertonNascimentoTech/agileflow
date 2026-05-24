import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.core.dependencies import ModuleContext, require_module, require_permission
from app.modules.projetos.schemas import (
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
    ProjectStatusCreate,
    ProjectStatusReorder,
    ProjectStatusResponse,
    ProjectStatusSectionLinkCreate,
    ProjectStatusSectionLinkResponse,
    ProjectStatusUpdate,
    ProjectTaskCommentCreate,
    ProjectTaskCommentResponse,
    ProjectTaskCreate,
    ProjectTaskResponse,
    ProjectTaskUpdate,
    ProjectTaskWithContextResponse,
    ProjectUpdate,
)
from app.modules.projetos.service import (
    ProjectAutomationService,
    ProjectDemandFormFieldService,
    ProjectDemandFormSectionService,
    ProjectDemandFormSubmissionService,
    ProjectDemandTypeService,
    ProjectFunnelService,
    ProjectMemberService,
    ProjectReportsService,
    ProjectService,
    ProjectStatusService,
    ProjectTaskCommentService,
    ProjectTaskService,
    ProjectStatusSectionLinkService,
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


@router.get("/projects/{project_id}/funnels", response_model=list[ProjectFunnelResponse])
async def list_funnels(
    project_id: uuid.UUID,
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectFunnelService.list(ctx.db, project_id, active_only=active_only)


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


@router.get("/reports", response_model=ProjectReportsResponse)
async def get_reports(ctx: ModuleContext = Depends(_ctx)):
    return await ProjectReportsService.build(ctx.db)


@router.get("/projects/{project_id}/tasks", response_model=list[ProjectTaskResponse])
async def list_tasks(
    project_id: uuid.UUID,
    status_id: Optional[uuid.UUID] = Query(None),
    assigned_to: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    if await _is_basic_user(ctx):
        assigned_to = _ensure_uuid(ctx.user.id)
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
            assigned_to = _ensure_uuid(ctx.user.id)
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
        payload = ProjectTaskCreate(**{**data.model_dump(), "assigned_to": ctx.user.id})
    return await ProjectTaskService.create(ctx.db, project_id, payload, current_user_id=ctx.user.id)


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
        if task.assigned_to != ctx.user.id:
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
        if ctx.user.role != UserRole.COMPANY_USER or task.assigned_to != ctx.user.id:
            raise HTTPException(status_code=403, detail="Sem permissão para remover esta tarefa.")
    await ProjectTaskService.delete(ctx.db, project_id, task_id)


@router.get("/projects/{project_id}/tasks/{task_id}/children", response_model=list[ProjectTaskResponse])
async def list_task_children(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProjectTaskService.list_children(ctx.db, project_id, task_id)


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

