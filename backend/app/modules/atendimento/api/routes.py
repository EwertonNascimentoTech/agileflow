import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile

from app.core.dependencies import ModuleContext, require_module, require_permission
from app.modules.atendimento.models import ChannelType, ClientType

# Pré-instanciados (pequena otimização — FastAPI resolve a mesma instância)
_can_config         = require_permission("atendimento.config.manage")
_can_client_manage  = require_permission("atendimento.client.manage")
_can_company_manage = require_permission("atendimento.company.manage")
_can_task_manage    = require_permission("atendimento.task.manage")
_can_attendance_create = require_permission("atendimento.attendance.create")
_can_attendance_update = require_permission("atendimento.attendance.update")
_can_attendance_assign = require_permission("atendimento.attendance.assign")
_can_timeline_manage   = require_permission("atendimento.timeline.manage")
_can_automation_manage = require_permission("atendimento.automation.manage")
_can_followup_manage   = require_permission("atendimento.followup.manage")
_can_reports_view      = require_permission("atendimento.reports.view")
from app.modules.atendimento.schemas import (
    FunnelCreate, FunnelUpdate, FunnelResponse,
    StatusConfigCreate, StatusConfigUpdate, StatusConfigReorder, StatusConfigResponse,
    KanbanTransitionCreate, KanbanTransitionResponse,
    CustomFieldCreate, CustomFieldUpdate, CustomFieldResponse,
    ChannelConfigCreate, ChannelConfigUpdate, ChannelConfigResponse,
    AssignmentRuleCreate, AssignmentRuleUpdate, AssignmentRuleResponse,
    ClientCreate, ClientUpdate, ClientResponse, ClientSummary,
    AttendanceCreate, AttendanceUpdate, AttendanceStatusChange,
    AttendanceAssign, AttendanceResponse, AttendanceSummary,
    AttendanceCloseRequest,
    StatusLogResponse, MessageCreate, MessageResponse, AttachmentResponse,
    CompanyCreate, CompanyUpdate, CompanyResponse, CompanySummary,
    TaskCreate, TaskUpdate, TaskResponse,
    LeadEventCreate, LeadEventResponse,
    AutomationRuleCreate, AutomationRuleUpdate, AutomationRuleResponse,
    FollowUpTemplateCreate, FollowUpTemplateUpdate, FollowUpTemplateResponse,
    TagCreate, TagUpdate, TagResponse,
    SalesTargetCreate, SalesTargetResponse, ForecastResponse,
    StageRequiredFieldCreate, StageRequiredFieldResponse,
    PlaybookStepCreate, PlaybookStepUpdate, PlaybookStepResponse,
    ConversionFunnelResponse, ProductivityResponse,
)
from app.modules.atendimento.models import TaskStatus, AutomationTrigger
from app.modules.atendimento.service import (
    ConfigService, ClientService, AttendanceService,
    CompanyService, TaskService,
    TimelineService, AutomationService, FollowUpService,
    TagService,
    CloseAttendanceService, ForecastService,
    StageRequiredFieldService, PlaybookService,
    ConversionFunnelService, ProductivityService,
)

router = APIRouter(prefix="/atendimento", tags=["Atendimento"])

# Dependency de contexto para este módulo
_ctx = require_module("atendimento")


# ══════════════════════════════════════════════
# CONFIG — FUNIS
# ══════════════════════════════════════════════

@router.get("/config/funnels", response_model=List[FunnelResponse])
async def list_funnels(
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    if active_only:
        items = await ConfigService.list_funnels(ctx.db, active_only=True)
        # devolve sem stage_count quando filtrado
        return [
            FunnelResponse(
                id=f.id, name=f.name, description=f.description, color=f.color,
                order=f.order, is_default=f.is_default, is_active=f.is_active,
                stage_count=0, created_at=f.created_at,
            ) for f in items
        ]
    return await ConfigService.list_funnels_with_stage_count(ctx.db)


@router.post("/config/funnels", response_model=FunnelResponse, status_code=201)
async def create_funnel(
    data: FunnelCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    f = await ConfigService.create_funnel(ctx.db, data)
    return FunnelResponse(
        id=f.id, name=f.name, description=f.description, color=f.color,
        order=f.order, is_default=f.is_default, is_active=f.is_active,
        stage_count=0, created_at=f.created_at,
    )


@router.patch("/config/funnels/{funnel_id}", response_model=FunnelResponse)
async def update_funnel(
    funnel_id: uuid.UUID,
    data: FunnelUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    f = await ConfigService.update_funnel(ctx.db, funnel_id, data)
    return FunnelResponse(
        id=f.id, name=f.name, description=f.description, color=f.color,
        order=f.order, is_default=f.is_default, is_active=f.is_active,
        stage_count=0, created_at=f.created_at,
    )


@router.delete("/config/funnels/{funnel_id}", status_code=204)
async def delete_funnel(
    funnel_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    await ConfigService.delete_funnel(ctx.db, funnel_id)


# ══════════════════════════════════════════════
# CONFIG — STATUS DO KANBAN (stages)
# ══════════════════════════════════════════════

@router.get("/config/statuses", response_model=List[StatusConfigResponse])
async def list_statuses(
    funnel_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ConfigService.list_statuses(ctx.db, funnel_id=funnel_id)


@router.post("/config/statuses", response_model=StatusConfigResponse, status_code=201)
async def create_status(
    data: StatusConfigCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await ConfigService.create_status(ctx.db, data)


@router.patch("/config/statuses/reorder", response_model=List[StatusConfigResponse])
async def reorder_statuses(
    data: StatusConfigReorder,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await ConfigService.reorder_statuses(ctx.db, data.items)


@router.patch("/config/statuses/{status_id}", response_model=StatusConfigResponse)
async def update_status(
    status_id: uuid.UUID,
    data: StatusConfigUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await ConfigService.update_status(ctx.db, status_id, data)


@router.delete("/config/statuses/{status_id}", status_code=204)
async def delete_status(
    status_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    await ConfigService.delete_status(ctx.db, status_id)


# ══════════════════════════════════════════════
# CONFIG — TRANSIÇÕES DO KANBAN
# ══════════════════════════════════════════════

@router.get("/config/transitions", response_model=List[KanbanTransitionResponse])
async def list_transitions(ctx: ModuleContext = Depends(_ctx)):
    return await ConfigService.list_transitions(ctx.db)


@router.post("/config/transitions", response_model=KanbanTransitionResponse, status_code=201)
async def create_transition(
    data: KanbanTransitionCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await ConfigService.create_transition(ctx.db, data)


@router.delete("/config/transitions/{transition_id}", status_code=204)
async def delete_transition(
    transition_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    await ConfigService.delete_transition(ctx.db, transition_id)


# ══════════════════════════════════════════════
# CONFIG — CAMPOS PERSONALIZADOS
# ══════════════════════════════════════════════

@router.get("/config/custom-fields", response_model=List[CustomFieldResponse])
async def list_custom_fields(
    entity_type: Optional[str] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ConfigService.list_custom_fields(ctx.db, entity_type)


@router.post("/config/custom-fields", response_model=CustomFieldResponse, status_code=201)
async def create_custom_field(
    data: CustomFieldCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await ConfigService.create_custom_field(ctx.db, data)


@router.patch("/config/custom-fields/{field_id}", response_model=CustomFieldResponse)
async def update_custom_field(
    field_id: uuid.UUID,
    data: CustomFieldUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await ConfigService.update_custom_field(ctx.db, field_id, data)


@router.delete("/config/custom-fields/{field_id}", status_code=204)
async def delete_custom_field(
    field_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    await ConfigService.delete_custom_field(ctx.db, field_id)


# ══════════════════════════════════════════════
# CONFIG — CANAIS
# ══════════════════════════════════════════════

@router.get("/config/channels", response_model=List[ChannelConfigResponse])
async def list_channels(ctx: ModuleContext = Depends(_ctx)):
    return await ConfigService.list_channels(ctx.db)


@router.post("/config/channels", response_model=ChannelConfigResponse, status_code=201)
async def create_channel(
    data: ChannelConfigCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await ConfigService.create_channel(ctx.db, data)


@router.patch("/config/channels/{channel_id}", response_model=ChannelConfigResponse)
async def update_channel(
    channel_id: uuid.UUID,
    data: ChannelConfigUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await ConfigService.update_channel(ctx.db, channel_id, data)


@router.delete("/config/channels/{channel_id}", status_code=204)
async def delete_channel(
    channel_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    await ConfigService.delete_channel(ctx.db, channel_id)


# ══════════════════════════════════════════════
# CONFIG — REGRAS DE ATRIBUIÇÃO
# ══════════════════════════════════════════════

@router.get("/config/assignment-rules", response_model=List[AssignmentRuleResponse])
async def list_assignment_rules(ctx: ModuleContext = Depends(_ctx)):
    return await ConfigService.list_assignment_rules(ctx.db)


@router.post("/config/assignment-rules", response_model=AssignmentRuleResponse, status_code=201)
async def create_assignment_rule(
    data: AssignmentRuleCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await ConfigService.create_assignment_rule(ctx.db, data)


@router.patch("/config/assignment-rules/{rule_id}", response_model=AssignmentRuleResponse)
async def update_assignment_rule(
    rule_id: uuid.UUID,
    data: AssignmentRuleUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await ConfigService.update_assignment_rule(ctx.db, rule_id, data)


@router.delete("/config/assignment-rules/{rule_id}", status_code=204)
async def delete_assignment_rule(
    rule_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    await ConfigService.delete_assignment_rule(ctx.db, rule_id)


# ══════════════════════════════════════════════
# CRM — CLIENTES
# ══════════════════════════════════════════════

@router.get("/clients", response_model=List[ClientSummary])
async def list_clients(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    client_type: Optional[ClientType] = Query(None),
    active_only: bool = Query(True),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ClientService.list_clients(
        ctx.db, skip=skip, limit=limit, search=search,
        client_type=client_type, active_only=active_only,
    )


@router.post("/clients", response_model=ClientResponse, status_code=201)
async def create_client(
    data: ClientCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_client_manage),
):
    return await ClientService.create_client(ctx.db, data)


@router.get("/clients/{client_id}", response_model=ClientResponse)
async def get_client(client_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await ClientService.get_client(ctx.db, client_id)


@router.patch("/clients/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: uuid.UUID,
    data: ClientUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_client_manage),
):
    return await ClientService.update_client(ctx.db, client_id, data)


@router.get("/clients/{client_id}/attendances", response_model=List[AttendanceSummary])
async def get_client_attendances(
    client_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ClientService.get_client_attendances(ctx.db, client_id, skip=skip, limit=limit)


# ══════════════════════════════════════════════
# ATENDIMENTOS
# ══════════════════════════════════════════════

@router.get("/attendances", response_model=List[AttendanceSummary])
async def list_attendances(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_id: Optional[uuid.UUID] = Query(None),
    channel: Optional[ChannelType] = Query(None),
    assigned_to: Optional[uuid.UUID] = Query(None),
    client_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await AttendanceService.list_attendances(
        ctx.db, skip=skip, limit=limit,
        status_id=status_id, channel=channel,
        assigned_to=assigned_to, client_id=client_id,
    )


@router.post("/attendances", response_model=AttendanceResponse, status_code=201)
async def create_attendance(
    data: AttendanceCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_attendance_create),
):
    return await AttendanceService.create_attendance(ctx.db, data, ctx.user)


@router.get("/attendances/{attendance_id}", response_model=AttendanceResponse)
async def get_attendance(attendance_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await AttendanceService.get_attendance(ctx.db, attendance_id)


@router.patch("/attendances/{attendance_id}", response_model=AttendanceResponse)
async def update_attendance(
    attendance_id: uuid.UUID,
    data: AttendanceUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_attendance_update),
):
    return await AttendanceService.update_attendance(ctx.db, attendance_id, data)


@router.post("/attendances/{attendance_id}/status", response_model=AttendanceResponse)
async def change_status(
    attendance_id: uuid.UUID,
    data: AttendanceStatusChange,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_attendance_update),
):
    return await AttendanceService.change_status(ctx.db, attendance_id, data, ctx.user)


@router.post("/attendances/{attendance_id}/assign", response_model=AttendanceResponse)
async def assign_attendance(
    attendance_id: uuid.UUID,
    data: AttendanceAssign,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_attendance_assign),
):
    return await AttendanceService.assign(ctx.db, attendance_id, data)


@router.post("/attendances/{attendance_id}/close", response_model=AttendanceResponse)
async def close_attendance(
    attendance_id: uuid.UUID,
    data: AttendanceCloseRequest,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_attendance_update),
):
    """Marca um atendimento como ganho ou perdido com motivo (K-004)."""
    return await CloseAttendanceService.close_attendance(ctx.db, attendance_id, data, ctx.user)


@router.get("/attendances/{attendance_id}/history", response_model=List[StatusLogResponse])
async def get_attendance_history(attendance_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await AttendanceService.get_history(ctx.db, attendance_id)


# ── Mensagens ────────────────────────────────

@router.get("/attendances/{attendance_id}/messages", response_model=List[MessageResponse])
async def list_messages(
    attendance_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    ctx: ModuleContext = Depends(_ctx),
):
    return await AttendanceService.list_messages(ctx.db, attendance_id, skip=skip, limit=limit)


@router.post(
    "/attendances/{attendance_id}/messages",
    response_model=MessageResponse,
    status_code=201,
)
async def add_message(
    attendance_id: uuid.UUID,
    data: MessageCreate,
    ctx: ModuleContext = Depends(_ctx),
):
    return await AttendanceService.add_message(ctx.db, attendance_id, data, ctx.user)


@router.post("/attendances/{attendance_id}/messages/read", status_code=204)
async def mark_messages_read(attendance_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    await AttendanceService.mark_messages_read(ctx.db, attendance_id)


@router.post(
    "/attendances/{attendance_id}/messages/{message_id}/attachments",
    response_model=AttachmentResponse,
    status_code=201,
)
async def upload_attachment(
    attendance_id: uuid.UUID,
    message_id: uuid.UUID,
    file: UploadFile = File(...),
    ctx: ModuleContext = Depends(_ctx),
):
    data = await file.read()
    attachment = await AttendanceService.upload_attachment(
        ctx.db,
        attendance_id=attendance_id,
        message_id=message_id,
        file_name=file.filename or "attachment",
        content_type=file.content_type or "application/octet-stream",
        data=data,
        current_user=ctx.user,
    )
    return AttachmentResponse.model_validate(attachment)


# ══════════════════════════════════════════════
# CRM — EMPRESAS
# ══════════════════════════════════════════════

@router.get("/companies", response_model=List[CompanySummary])
async def list_companies(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    active_only: bool = Query(True),
    ctx: ModuleContext = Depends(_ctx),
):
    return await CompanyService.list_companies(
        ctx.db, skip=skip, limit=limit, search=search, active_only=active_only,
    )


@router.post("/companies", response_model=CompanyResponse, status_code=201)
async def create_company(
    data: CompanyCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_company_manage),
):
    return await CompanyService.create_company(ctx.db, data)


@router.get("/companies/{company_id}", response_model=CompanyResponse)
async def get_company(company_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await CompanyService.get_company(ctx.db, company_id)


@router.patch("/companies/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: uuid.UUID,
    data: CompanyUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_company_manage),
):
    return await CompanyService.update_company(ctx.db, company_id, data)


@router.delete("/companies/{company_id}", status_code=204)
async def delete_company(
    company_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_company_manage),
):
    await CompanyService.delete_company(ctx.db, company_id)


# ══════════════════════════════════════════════
# TAREFAS
# ══════════════════════════════════════════════

@router.get("/tasks", response_model=List[TaskResponse])
async def list_tasks(
    attendance_id: Optional[uuid.UUID] = Query(None),
    assigned_to: Optional[uuid.UUID] = Query(None),
    status: Optional[TaskStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    ctx: ModuleContext = Depends(_ctx),
):
    return await TaskService.list_tasks(
        ctx.db, attendance_id=attendance_id, assigned_to=assigned_to,
        status=status, skip=skip, limit=limit,
    )


@router.post("/tasks", response_model=TaskResponse, status_code=201)
async def create_task(
    data: TaskCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_task_manage),
):
    return await TaskService.create_task(ctx.db, data, ctx.user)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    data: TaskUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_task_manage),
):
    return await TaskService.update_task(ctx.db, task_id, data, ctx.user)


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_task_manage),
):
    await TaskService.delete_task(ctx.db, task_id)


# ══════════════════════════════════════════════
# TIMELINE
# ══════════════════════════════════════════════

@router.get(
    "/attendances/{attendance_id}/timeline",
    response_model=List[LeadEventResponse],
)
async def get_attendance_timeline(
    attendance_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    ctx: ModuleContext = Depends(_ctx),
):
    await AttendanceService.get_attendance(ctx.db, attendance_id)
    return await TimelineService.list_events(ctx.db, attendance_id, skip=skip, limit=limit)


@router.post(
    "/attendances/{attendance_id}/timeline",
    response_model=LeadEventResponse,
    status_code=201,
)
async def add_timeline_note(
    attendance_id: uuid.UUID,
    data: LeadEventCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_timeline_manage),
):
    return await TimelineService.add_note(ctx.db, attendance_id, data, ctx.user)


# ══════════════════════════════════════════════
# AUTOMAÇÕES
# ══════════════════════════════════════════════

@router.get("/automations", response_model=List[AutomationRuleResponse])
async def list_automations(
    active_only: bool = Query(False),
    trigger: Optional[AutomationTrigger] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await AutomationService.list_rules(ctx.db, active_only=active_only, trigger=trigger)


@router.post("/automations", response_model=AutomationRuleResponse, status_code=201)
async def create_automation(
    data: AutomationRuleCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_automation_manage),
):
    return await AutomationService.create_rule(ctx.db, data)


@router.get("/automations/{rule_id}", response_model=AutomationRuleResponse)
async def get_automation(rule_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await AutomationService.get_rule(ctx.db, rule_id)


@router.patch("/automations/{rule_id}", response_model=AutomationRuleResponse)
async def update_automation(
    rule_id: uuid.UUID,
    data: AutomationRuleUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_automation_manage),
):
    return await AutomationService.update_rule(ctx.db, rule_id, data)


@router.delete("/automations/{rule_id}", status_code=204)
async def delete_automation(
    rule_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_automation_manage),
):
    await AutomationService.delete_rule(ctx.db, rule_id)


# ══════════════════════════════════════════════
# FOLLOW-UP TEMPLATES
# ══════════════════════════════════════════════

@router.get("/follow-up-templates", response_model=List[FollowUpTemplateResponse])
async def list_follow_up_templates(
    active_only: bool = Query(False),
    funnel_id: Optional[uuid.UUID] = Query(None),
    stage_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await FollowUpService.list_templates(
        ctx.db, active_only=active_only, funnel_id=funnel_id, stage_id=stage_id,
    )


@router.post("/follow-up-templates", response_model=FollowUpTemplateResponse, status_code=201)
async def create_follow_up_template(
    data: FollowUpTemplateCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_followup_manage),
):
    return await FollowUpService.create_template(ctx.db, data)


@router.get("/follow-up-templates/{template_id}", response_model=FollowUpTemplateResponse)
async def get_follow_up_template(template_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await FollowUpService.get_template(ctx.db, template_id)


@router.patch("/follow-up-templates/{template_id}", response_model=FollowUpTemplateResponse)
async def update_follow_up_template(
    template_id: uuid.UUID,
    data: FollowUpTemplateUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_followup_manage),
):
    return await FollowUpService.update_template(ctx.db, template_id, data)


@router.delete("/follow-up-templates/{template_id}", status_code=204)
async def delete_follow_up_template(
    template_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_followup_manage),
):
    await FollowUpService.delete_template(ctx.db, template_id)


@router.post("/follow-up-templates/preview")
async def preview_follow_up_template(
    payload: dict,
    ctx: ModuleContext = Depends(_ctx),
):
    """Renderiza preview interpolando variáveis com dados de exemplo."""
    message = (payload or {}).get("message") or ""
    return {"preview": FollowUpService.render_preview(message)}


# ══════════════════════════════════════════════
# MÉTRICAS / DASHBOARD
# ══════════════════════════════════════════════

@router.get("/metrics/funnel/{funnel_id}")
async def funnel_metrics(funnel_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    """
    Retorna métricas do funil:
    - Contagem e valor total por etapa
    - Taxa de conversão entre etapas
    - Top 10 oportunidades por valor
    """
    from app.modules.atendimento.service import MetricsService
    return await MetricsService.funnel_metrics(ctx.db, funnel_id)


@router.get("/metrics/overview")
async def attendance_overview(ctx: ModuleContext = Depends(_ctx)):
    """Visão geral: atendimentos por status, por canal, por período."""
    from app.modules.atendimento.service import MetricsService
    return await MetricsService.attendance_overview(ctx.db)


# ══════════════════════════════════════════════
# RELATÓRIOS / EXPORTAÇÃO CSV
# ══════════════════════════════════════════════

@router.get("/config/statuses/{status_id}/required-fields", response_model=List[StageRequiredFieldResponse])
async def list_required_fields(status_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    """Lista campos obrigatórios de uma etapa (K-003)."""
    return await StageRequiredFieldService.list_fields(ctx.db, status_id)


@router.post("/config/statuses/{status_id}/required-fields", response_model=StageRequiredFieldResponse, status_code=201)
async def create_required_field(
    status_id: uuid.UUID,
    data: StageRequiredFieldCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await StageRequiredFieldService.create_field(ctx.db, status_id, data)


@router.delete("/config/statuses/{status_id}/required-fields/{field_id}", status_code=204)
async def delete_required_field(
    status_id: uuid.UUID,
    field_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    await StageRequiredFieldService.delete_field(ctx.db, field_id)


@router.get("/config/statuses/{status_id}/playbook", response_model=List[PlaybookStepResponse])
async def list_playbook_steps(status_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    """Lista steps do playbook de uma etapa (K-013)."""
    return await PlaybookService.list_steps(ctx.db, status_id)


@router.post("/config/statuses/{status_id}/playbook", response_model=PlaybookStepResponse, status_code=201)
async def create_playbook_step(
    status_id: uuid.UUID,
    data: PlaybookStepCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await PlaybookService.create_step(ctx.db, status_id, data)


@router.patch("/config/statuses/{status_id}/playbook/{step_id}", response_model=PlaybookStepResponse)
async def update_playbook_step(
    status_id: uuid.UUID,
    step_id: uuid.UUID,
    data: PlaybookStepUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await PlaybookService.update_step(ctx.db, step_id, data)


@router.delete("/config/statuses/{status_id}/playbook/{step_id}", status_code=204)
async def delete_playbook_step(
    status_id: uuid.UUID,
    step_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    await PlaybookService.delete_step(ctx.db, step_id)


@router.get("/reports/forecast")
async def get_forecast(
    period: str = Query(..., description="Período no formato YYYY-MM"),
    funnel_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    """Retorna forecast de vendas ponderado por probabilidade de etapa (K-006)."""
    return await ForecastService.get_forecast(ctx.db, funnel_id, period)


@router.post("/reports/targets", response_model=SalesTargetResponse, status_code=201)
async def upsert_sales_target(
    data: SalesTargetCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    """Cria ou atualiza meta de vendas por período (K-006)."""
    return await ForecastService.upsert_target(ctx.db, data)


@router.get("/reports/funnel-conversion")
async def funnel_conversion(
    period_start: str = Query(..., description="YYYY-MM-DD"),
    period_end: str = Query(..., description="YYYY-MM-DD"),
    funnel_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    """Funil de conversão visual por etapa (K-019)."""
    return await ConversionFunnelService.get_funnel_conversion(ctx.db, funnel_id, period_start, period_end)


@router.get("/reports/loss-reasons")
async def loss_reasons(
    period_start: str = Query(..., description="YYYY-MM-DD"),
    period_end: str = Query(..., description="YYYY-MM-DD"),
    funnel_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    """Top motivos de perda no período (K-019)."""
    result = await ConversionFunnelService.get_funnel_conversion(ctx.db, funnel_id, period_start, period_end)
    return result["loss_reasons"]


@router.get("/reports/productivity")
async def productivity_report(
    period_start: str = Query(..., description="YYYY-MM-DD"),
    period_end: str = Query(..., description="YYYY-MM-DD"),
    ctx: ModuleContext = Depends(_ctx),
):
    """Relatório de produtividade por vendedor (K-018)."""
    return await ProductivityService.get_productivity(ctx.db, period_start, period_end)


@router.get("/reports/productivity/export")
async def productivity_export(
    period_start: str = Query(..., description="YYYY-MM-DD"),
    period_end: str = Query(..., description="YYYY-MM-DD"),
    ctx: ModuleContext = Depends(_ctx),
):
    """Exporta produtividade como CSV (K-018)."""
    import csv, io
    from fastapi.responses import StreamingResponse

    data = await ProductivityService.get_productivity(ctx.db, period_start, period_end)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["user_id", "Abertos", "Ganhos", "Perdidos", "Tarefas Concluídas", "Mensagens", "Tx. Conversão %"])
    for u in data["users"]:
        writer.writerow([
            u["user_id"] or "",
            u["attendances_opened"],
            u["attendances_won"],
            u["attendances_lost"],
            u["tasks_done"],
            u["messages_sent"],
            u["conversion_rate"],
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=produtividade.csv"},
    )


@router.get("/reports/attendances")
async def report_attendances(
    period_start: Optional[str] = Query(None, description="YYYY-MM-DD"),
    period_end: Optional[str] = Query(None, description="YYYY-MM-DD"),
    status_id: Optional[uuid.UUID] = Query(None),
    channel: Optional[str] = Query(None),
    assigned_to: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    """Exporta atendimentos filtrados como CSV."""
    from fastapi.responses import StreamingResponse
    from app.modules.atendimento.service import MetricsService
    csv_content = await MetricsService.export_attendances_csv(
        ctx.db, period_start, period_end, status_id, channel, assigned_to
    )
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=atendimentos.csv"},
    )


# ══════════════════════════════════════════════
# TAGS
# ══════════════════════════════════════════════

@router.get("/tags", response_model=List[TagResponse])
async def list_tags(
    entity_type: Optional[str] = Query(None, pattern="^(client|attendance)$"),
    ctx: ModuleContext = Depends(_ctx),
):
    return await TagService.list_tags(ctx.db, entity_type=entity_type)


@router.post("/tags", response_model=TagResponse, status_code=201)
async def create_tag(
    data: TagCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await TagService.create_tag(ctx.db, data)


@router.patch("/tags/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: uuid.UUID,
    data: TagUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    return await TagService.update_tag(ctx.db, tag_id, data)


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(
    tag_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_config),
):
    await TagService.delete_tag(ctx.db, tag_id)


@router.post("/clients/{client_id}/tags/{tag_id}", status_code=204)
async def add_tag_to_client(
    client_id: uuid.UUID,
    tag_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_client_manage),
):
    await TagService.add_to_client(ctx.db, client_id, tag_id)


@router.delete("/clients/{client_id}/tags/{tag_id}", status_code=204)
async def remove_tag_from_client(
    client_id: uuid.UUID,
    tag_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_client_manage),
):
    await TagService.remove_from_client(ctx.db, client_id, tag_id)


@router.post("/attendances/{attendance_id}/tags/{tag_id}", status_code=204)
async def add_tag_to_attendance(
    attendance_id: uuid.UUID,
    tag_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_attendance_update),
):
    await TagService.add_to_attendance(ctx.db, attendance_id, tag_id)


@router.delete("/attendances/{attendance_id}/tags/{tag_id}", status_code=204)
async def remove_tag_from_attendance(
    attendance_id: uuid.UUID,
    tag_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_attendance_update),
):
    await TagService.remove_from_attendance(ctx.db, attendance_id, tag_id)
