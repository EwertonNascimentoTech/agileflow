import uuid
from datetime import datetime
from typing import Optional, List, Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator
import re

from app.modules.crm.models import (
    ClientType, ClientEntityType, ChannelType, SenderType, MessageType,
    FieldType, FieldEntity, AssignmentRuleType, AttendancePriority,
    StageOutcome, TaskStatus, TaskPriority,
    LeadEventType, AutomationTrigger, AutomationAction,
    FollowUpChannel,
)


# ══════════════════════════════════════════════
# TAGS
# ══════════════════════════════════════════════

class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str = Field("#3B82F6", pattern=r"^#[0-9A-Fa-f]{6}$")
    entity_type: str = Field(..., pattern=r"^(client|attendance)$")


class TagUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class TagResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    entity_type: str
    slug: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# CONFIG — FUNIS
# ══════════════════════════════════════════════

class FunnelCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    color: str = Field("#3B82F6", pattern=r"^#[0-9A-Fa-f]{6}$")
    order: int = Field(0, ge=0)
    is_default: bool = False
    is_active: bool = True


class FunnelUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    order: Optional[int] = Field(None, ge=0)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class FunnelResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    color: str
    order: int
    is_default: bool
    is_active: bool
    stage_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# CONFIG — STATUS DO KANBAN (stages do funil)
# ══════════════════════════════════════════════

class StatusConfigCreate(BaseModel):
    funnel_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field("#6B7280", pattern=r"^#[0-9A-Fa-f]{6}$")
    icon: Optional[str] = Field(None, max_length=50)
    order: int = Field(0, ge=0)
    is_initial: bool = False
    is_final: bool = False
    outcome: StageOutcome = StageOutcome.NEUTRAL
    lead_page_policy: Optional[dict] = None
    probability: int = Field(50, ge=0, le=100)


class StatusConfigUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    icon: Optional[str] = None
    order: Optional[int] = Field(None, ge=0)
    is_initial: Optional[bool] = None
    is_final: Optional[bool] = None
    outcome: Optional[StageOutcome] = None
    lead_page_policy: Optional[dict] = None
    probability: Optional[int] = Field(None, ge=0, le=100)


class StatusConfigReorder(BaseModel):
    """Reordenação em lote dentro de um funil: lista de {id, order}."""
    items: List[dict]  # [{"id": uuid, "order": int}]


class StatusConfigResponse(BaseModel):
    id: uuid.UUID
    funnel_id: uuid.UUID
    name: str
    color: str
    icon: Optional[str]
    order: int
    is_initial: bool
    is_final: bool
    outcome: StageOutcome
    lead_page_policy: Optional[dict]
    probability: int = 50
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# CONFIG — TRANSIÇÕES DO KANBAN
# ══════════════════════════════════════════════

class KanbanTransitionCreate(BaseModel):
    from_status_id: Optional[uuid.UUID] = None  # None = qualquer origem
    to_status_id: uuid.UUID
    conditions: Optional[dict] = None


class KanbanTransitionResponse(BaseModel):
    id: uuid.UUID
    from_status_id: Optional[uuid.UUID]
    to_status_id: uuid.UUID
    conditions: Optional[dict]
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# CONFIG — CAMPOS PERSONALIZADOS
# ══════════════════════════════════════════════

class CustomFieldCreate(BaseModel):
    entity_type: FieldEntity
    name: str = Field(..., min_length=1, max_length=100)
    field_key: str = Field(..., min_length=1, max_length=100)
    field_type: FieldType
    options: Optional[List[str]] = None  # obrigatório para select/multi_select
    is_required: bool = False
    order: int = Field(0, ge=0)

    @field_validator("field_key")
    @classmethod
    def key_must_be_slug(cls, v: str) -> str:
        if not re.match(r"^[a-z0-9_]+$", v):
            raise ValueError("field_key deve conter apenas letras minúsculas, números e underscores.")
        return v

    @field_validator("options")
    @classmethod
    def options_required_for_select(cls, v, info):
        field_type = info.data.get("field_type")
        if field_type in (FieldType.SELECT, FieldType.MULTI_SELECT) and not v:
            raise ValueError("options é obrigatório para campos do tipo select/multi_select.")
        return v


class CustomFieldUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    options: Optional[List[str]] = None
    is_required: Optional[bool] = None
    order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class CustomFieldResponse(BaseModel):
    id: uuid.UUID
    entity_type: FieldEntity
    name: str
    field_key: str
    field_type: FieldType
    options: Optional[List[str]]
    is_required: bool
    order: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# CONFIG — CANAIS
# ══════════════════════════════════════════════

class ChannelConfigCreate(BaseModel):
    channel: ChannelType
    name: str = Field(..., min_length=1, max_length=100)
    credentials: Optional[dict] = None
    config: Optional[dict] = None
    webhook_url: Optional[str] = Field(None, max_length=500)


class ChannelConfigUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    credentials: Optional[dict] = None
    config: Optional[dict] = None
    webhook_url: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class ChannelConfigResponse(BaseModel):
    id: uuid.UUID
    channel: ChannelType
    name: str
    webhook_url: Optional[str]
    is_active: bool
    config: Optional[dict]
    # credentials omitido propositalmente (contém tokens sensíveis)
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# CONFIG — REGRAS DE ATRIBUIÇÃO
# ══════════════════════════════════════════════

class AssignmentRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    rule_type: AssignmentRuleType
    conditions: Optional[dict] = None
    config: Optional[dict] = None
    order: int = Field(0, ge=0)


class AssignmentRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    rule_type: Optional[AssignmentRuleType] = None
    conditions: Optional[dict] = None
    config: Optional[dict] = None
    order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class AssignmentRuleResponse(BaseModel):
    id: uuid.UUID
    name: str
    rule_type: AssignmentRuleType
    conditions: Optional[dict]
    config: Optional[dict]
    order: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# CRM — CLIENTES
# ══════════════════════════════════════════════

class ClientCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=30)
    document: Optional[str] = Field(None, max_length=20)
    client_type: ClientType = ClientType.RECORRENTE
    entity_type: ClientEntityType = ClientEntityType.PF
    company_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    custom_data: Optional[dict] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=30)
    document: Optional[str] = Field(None, max_length=20)
    client_type: Optional[ClientType] = None
    entity_type: Optional[ClientEntityType] = None
    company_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    custom_data: Optional[dict] = None
    is_active: Optional[bool] = None


class ClientResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: Optional[str]
    phone: Optional[str]
    document: Optional[str]
    client_type: ClientType
    entity_type: ClientEntityType
    company_id: Optional[uuid.UUID] = None
    notes: Optional[str]
    custom_data: Optional[dict]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    tags: List["TagResponse"] = []

    model_config = {"from_attributes": True}


class ClientSummary(BaseModel):
    id: uuid.UUID
    name: str
    email: Optional[str]
    phone: Optional[str]
    client_type: ClientType
    entity_type: ClientEntityType
    company_id: Optional[uuid.UUID] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# COMPANIES
# ══════════════════════════════════════════════

class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    trade_name: Optional[str] = Field(None, max_length=200)
    document: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=30)
    website: Optional[str] = Field(None, max_length=255)
    industry: Optional[str] = Field(None, max_length=100)
    address: Optional[dict] = None
    notes: Optional[str] = None
    custom_data: Optional[dict] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    trade_name: Optional[str] = Field(None, max_length=200)
    document: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=30)
    website: Optional[str] = Field(None, max_length=255)
    industry: Optional[str] = Field(None, max_length=100)
    address: Optional[dict] = None
    notes: Optional[str] = None
    custom_data: Optional[dict] = None
    is_active: Optional[bool] = None


class CompanyResponse(BaseModel):
    id: uuid.UUID
    name: str
    trade_name: Optional[str]
    document: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    website: Optional[str]
    industry: Optional[str]
    address: Optional[dict]
    notes: Optional[str]
    custom_data: Optional[dict]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CompanySummary(BaseModel):
    id: uuid.UUID
    name: str
    trade_name: Optional[str]
    document: Optional[str]
    industry: Optional[str]
    is_active: bool
    contact_count: int = 0
    attendance_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# TASKS
# ══════════════════════════════════════════════

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: Optional[datetime] = None
    attendance_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None
    assigned_to: Optional[uuid.UUID] = None


class TaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str]
    status: TaskStatus
    priority: TaskPriority
    due_date: Optional[datetime]
    attendance_id: Optional[uuid.UUID]
    assigned_to: Optional[uuid.UUID]
    created_by: Optional[uuid.UUID]
    completed_at: Optional[datetime]
    completed_by: Optional[uuid.UUID]
    source: str = "manual"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# ATENDIMENTO
# ══════════════════════════════════════════════

class AttendanceCreate(BaseModel):
    client_id: uuid.UUID
    """Tag de classificação do atendimento (registry: slug classificacao_pf ou classificacao_pj). PF = só contato; PJ = empresa obrigatória (um ou mais contatos podem estar vinculados à mesma empresa)."""
    classification_tag_id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    channel: ChannelType
    channel_config_id: Optional[uuid.UUID] = None
    subject: str = Field(..., min_length=2, max_length=300)
    priority: AttendancePriority = AttendancePriority.MEDIUM
    value: Optional[float] = Field(None, ge=0)
    expected_close_date: Optional[datetime] = None
    custom_data: Optional[dict] = None
    assigned_to: Optional[uuid.UUID] = None  # sobrescreve regras de atribuição


class AttendanceUpdate(BaseModel):
    subject: Optional[str] = Field(None, min_length=2, max_length=300)
    priority: Optional[AttendancePriority] = None
    value: Optional[float] = Field(None, ge=0)
    expected_close_date: Optional[datetime] = None
    custom_data: Optional[dict] = None
    company_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None
    channel_config_id: Optional[uuid.UUID] = None
    classification_tag_id: Optional[uuid.UUID] = Field(
        None,
        description="Trocar classificação (tags PF/PJ). Em PJ, envie company_id no mesmo PATCH se o atendimento ainda não tiver empresa.",
    )


class AttendanceStatusChange(BaseModel):
    to_status_id: uuid.UUID
    notes: Optional[str] = Field(None, max_length=500)


class AttendanceAssign(BaseModel):
    assigned_to: Optional[uuid.UUID]  # None = desatribuir


class StatusLogResponse(BaseModel):
    id: uuid.UUID
    from_status_id: Optional[uuid.UUID]
    to_status_id: uuid.UUID
    changed_by: Optional[uuid.UUID]
    notes: Optional[str]
    changed_at: datetime

    model_config = {"from_attributes": True}


class AttendanceResponse(BaseModel):
    id: uuid.UUID
    protocol: str
    client_id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    channel: ChannelType
    channel_config_id: Optional[uuid.UUID]
    status_id: uuid.UUID
    assigned_to: Optional[uuid.UUID]
    subject: str
    priority: AttendancePriority
    value: Optional[float] = None
    expected_close_date: Optional[datetime] = None
    last_interaction: Optional[datetime] = None
    custom_data: Optional[dict]
    quote_id: Optional[uuid.UUID]
    sale_id: Optional[uuid.UUID]
    opened_at: datetime
    closed_at: Optional[datetime]
    close_reason: Optional[str] = None
    closed_by: Optional[uuid.UUID] = None
    outcome: str = "open"
    created_at: datetime
    tags: List["TagResponse"] = []

    model_config = {"from_attributes": True}


class AttendanceSummary(BaseModel):
    id: uuid.UUID
    protocol: str
    client_id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    channel: ChannelType
    status_id: uuid.UUID
    assigned_to: Optional[uuid.UUID]
    subject: str
    priority: AttendancePriority
    value: Optional[float] = None
    expected_close_date: Optional[datetime] = None
    last_interaction: Optional[datetime] = None
    opened_at: datetime
    closed_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# MENSAGENS
# ══════════════════════════════════════════════

class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1)
    message_type: MessageType = MessageType.TEXT
    media_url: Optional[str] = Field(None, max_length=500)
    extra_data: Optional[dict] = None


class AttachmentResponse(BaseModel):
    id: uuid.UUID
    message_id: uuid.UUID
    file_name: str
    content_type: str
    object_name: str
    file_size: Optional[int]
    presigned_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_url(cls, obj: Any) -> "AttachmentResponse":
        inst = cls.model_validate(obj)
        inst.presigned_url = getattr(obj, "_presigned_url", None)
        return inst


class MessageResponse(BaseModel):
    id: uuid.UUID
    attendance_id: uuid.UUID
    sender_type: SenderType
    sender_id: Optional[uuid.UUID]
    content: str
    message_type: MessageType
    media_url: Optional[str]
    external_id: Optional[str]
    is_read: bool
    sent_at: datetime
    attachments: List["AttachmentResponse"] = []

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# TIMELINE
# ══════════════════════════════════════════════

class LeadEventCreate(BaseModel):
    """Cria evento (geralmente nota manual)."""
    content: str = Field(..., min_length=1)
    type: LeadEventType = LeadEventType.NOTE
    extra_data: Optional[dict] = None


class LeadEventResponse(BaseModel):
    id: uuid.UUID
    attendance_id: uuid.UUID
    type: LeadEventType
    content: str
    author_id: Optional[uuid.UUID]
    author_name: Optional[str]
    extra_data: Optional[dict]
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# AUTOMAÇÕES
# ══════════════════════════════════════════════

class AutomationRuleCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    trigger: AutomationTrigger
    funnel_id: Optional[uuid.UUID] = None
    stage_id: Optional[uuid.UUID] = None
    action: AutomationAction
    action_config: Optional[dict] = None
    order: int = Field(0, ge=0)
    is_active: bool = True


class AutomationRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    trigger: Optional[AutomationTrigger] = None
    funnel_id: Optional[uuid.UUID] = None
    stage_id: Optional[uuid.UUID] = None
    action: Optional[AutomationAction] = None
    action_config: Optional[dict] = None
    order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class AutomationRuleResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    trigger: AutomationTrigger
    funnel_id: Optional[uuid.UUID]
    stage_id: Optional[uuid.UUID]
    action: AutomationAction
    action_config: Optional[dict]
    order: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# FOLLOW-UP TEMPLATES
# ══════════════════════════════════════════════

class FollowUpTemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    funnel_id: Optional[uuid.UUID] = None
    stage_id: Optional[uuid.UUID] = None
    channel: FollowUpChannel = FollowUpChannel.AUTO
    message: str = Field(..., min_length=1)
    delay_minutes: int = Field(0, ge=0)
    is_active: bool = True


class FollowUpTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    funnel_id: Optional[uuid.UUID] = None
    stage_id: Optional[uuid.UUID] = None
    channel: Optional[FollowUpChannel] = None
    message: Optional[str] = Field(None, min_length=1)
    delay_minutes: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class FollowUpTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    funnel_id: Optional[uuid.UUID]
    stage_id: Optional[uuid.UUID]
    channel: FollowUpChannel
    message: str
    delay_minutes: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# K-004 — FECHAR COM MOTIVO
# ══════════════════════════════════════════════

class AttendanceCloseRequest(BaseModel):
    outcome: Literal["won", "lost"]
    close_reason: Optional[str] = Field(None, max_length=500)

    @model_validator(mode="after")
    def reason_required_for_lost(self) -> "AttendanceCloseRequest":
        if self.outcome == "lost" and not self.close_reason:
            raise ValueError("Motivo obrigatório ao marcar como perdido.")
        return self


# ══════════════════════════════════════════════
# K-006 — FORECAST
# ══════════════════════════════════════════════

class SalesTargetCreate(BaseModel):
    user_id: Optional[uuid.UUID] = None
    funnel_id: Optional[uuid.UUID] = None
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$")  # "2026-05"
    target_value: float = Field(0, ge=0)


class SalesTargetResponse(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID]
    funnel_id: Optional[uuid.UUID]
    period: str
    target_value: float
    created_at: datetime

    model_config = {"from_attributes": True}


class ForecastStageItem(BaseModel):
    stage_id: str
    stage_name: str
    color: str
    probability: int
    count: int
    total_value: float
    weighted_value: float  # total_value * probability / 100


class ForecastUserItem(BaseModel):
    user_id: Optional[str]
    forecast: float
    target: float
    delta_pct: Optional[float]


class ForecastResponse(BaseModel):
    period: str
    funnel_id: Optional[str]
    total_forecast: float
    total_target: float
    delta_pct: Optional[float]
    by_stage: List[ForecastStageItem]
    by_user: List[ForecastUserItem]


# ══════════════════════════════════════════════
# K-003 — CAMPOS OBRIGATÓRIOS POR ETAPA
# ══════════════════════════════════════════════

class StageRequiredFieldCreate(BaseModel):
    field_name: str = Field(..., min_length=1, max_length=100)
    field_label: str = Field(..., min_length=1, max_length=100)
    field_type: str = Field("native", pattern=r"^(native|custom)$")


class StageRequiredFieldResponse(BaseModel):
    id: uuid.UUID
    status_id: uuid.UUID
    field_name: str
    field_label: str
    field_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# K-013 — PLAYBOOK
# ══════════════════════════════════════════════

class PlaybookStepCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    due_days: int = Field(1, ge=1)
    order: int = Field(0, ge=0)


class PlaybookStepUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    due_days: Optional[int] = Field(None, ge=1)
    order: Optional[int] = Field(None, ge=0)


class PlaybookStepResponse(BaseModel):
    id: uuid.UUID
    status_id: uuid.UUID
    title: str
    description: Optional[str]
    due_days: int
    order: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# K-019 — FUNIL DE CONVERSÃO
# ══════════════════════════════════════════════

class ConversionStageItem(BaseModel):
    stage_id: str
    stage_name: str
    color: str
    order: int
    entries: int
    exits_forward: int
    losses: int
    conversion_rate: float
    avg_days: float


class LossReasonItem(BaseModel):
    reason: str
    count: int


class ConversionFunnelResponse(BaseModel):
    funnel_id: Optional[str]
    period_start: str
    period_end: str
    stages: List[ConversionStageItem]
    loss_reasons: List[LossReasonItem]


# ══════════════════════════════════════════════
# K-018 — PRODUTIVIDADE
# ══════════════════════════════════════════════

class ProductivityUserItem(BaseModel):
    user_id: Optional[str]
    attendances_opened: int
    attendances_won: int
    attendances_lost: int
    tasks_done: int
    messages_sent: int
    conversion_rate: float
    attendances_opened_delta: Optional[float] = None
    attendances_won_delta: Optional[float] = None
    tasks_done_delta: Optional[float] = None


class ProductivityResponse(BaseModel):
    period_start: str
    period_end: str
    users: List[ProductivityUserItem]


# ══════════════════════════════════════════════
# K-016 — REATIVAÇÃO
# ══════════════════════════════════════════════

class ReactivationConfigCreate(BaseModel):
    funnel_id: Optional[uuid.UUID] = None
    loss_reason: Optional[str] = None
    delay_days: int = 30
    is_active: bool = True


class ReactivationConfigUpdate(BaseModel):
    loss_reason: Optional[str] = None
    delay_days: Optional[int] = None
    is_active: Optional[bool] = None


class ReactivationConfigResponse(BaseModel):
    id: uuid.UUID
    funnel_id: Optional[uuid.UUID]
    loss_reason: Optional[str]
    delay_days: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# K-020 — TICKET MÉDIO E RECEITA
# ══════════════════════════════════════════════

class RevenueUserItem(BaseModel):
    user_id: Optional[str]
    attendances_won: int
    total_revenue: float
    avg_ticket: float


class RevenueMonthItem(BaseModel):
    month: str   # "2026-05"
    revenue: float
    won_count: int


class RevenueResponse(BaseModel):
    period_start: str
    period_end: str
    total_revenue: float
    avg_ticket: float
    total_won: int
    target_value: float
    delta_vs_target: Optional[float]
    by_user: List[RevenueUserItem]
    monthly_evolution: List[RevenueMonthItem]


# ═════════════════════════════════════════════════════════════
# PROPOSTAS E CONTRATOS — absorvido do módulo propostas_contratos
# ═════════════════════════════════════════════════════════════
from app.modules.crm.models import ProposalStatus  # noqa: E402

# ══════════════════════════════════════════════
# ITEMS
# ══════════════════════════════════════════════

class ProposalItemCreate(BaseModel):
    description: str = Field(..., min_length=1)
    quantity: float = Field(1, gt=0)
    unit: Optional[str] = Field(None, max_length=20)
    unit_price: float = Field(0, ge=0)
    order: int = Field(0, ge=0)
    custom_data: Optional[dict] = None


class ProposalItemUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1)
    quantity: Optional[float] = Field(None, gt=0)
    unit: Optional[str] = Field(None, max_length=20)
    unit_price: Optional[float] = Field(None, ge=0)
    order: Optional[int] = Field(None, ge=0)
    custom_data: Optional[dict] = None


class ProposalItemResponse(BaseModel):
    id: uuid.UUID
    proposal_id: uuid.UUID
    description: str
    quantity: float
    unit: Optional[str]
    unit_price: float
    total: float
    order: int
    custom_data: Optional[dict]
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# PROPOSTAS
# ══════════════════════════════════════════════

class ProposalCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=300)
    description: Optional[str] = None

    attendance_id: Optional[uuid.UUID] = None
    client_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None

    # Snapshot manual (caso não use atendimento/cliente)
    client_name: Optional[str] = Field(None, max_length=200)
    client_email: Optional[str] = Field(None, max_length=255)
    client_phone: Optional[str] = Field(None, max_length=30)
    client_document: Optional[str] = Field(None, max_length=20)

    discount: float = Field(0, ge=0)
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    notes: Optional[str] = None
    valid_until: Optional[datetime] = None

    items: List[ProposalItemCreate] = Field(default_factory=list)
    custom_data: Optional[dict] = None


class ProposalUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=300)
    description: Optional[str] = None
    client_name: Optional[str] = Field(None, max_length=200)
    client_email: Optional[str] = Field(None, max_length=255)
    client_phone: Optional[str] = Field(None, max_length=30)
    client_document: Optional[str] = Field(None, max_length=20)
    discount: Optional[float] = Field(None, ge=0)
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    notes: Optional[str] = None
    valid_until: Optional[datetime] = None
    custom_data: Optional[dict] = None


class ProposalStatusChange(BaseModel):
    to_status: ProposalStatus
    notes: Optional[str] = Field(None, max_length=1000)


class ProposalStatusLogResponse(BaseModel):
    id: uuid.UUID
    proposal_id: uuid.UUID
    from_status: Optional[ProposalStatus]
    to_status: ProposalStatus
    changed_by: Optional[uuid.UUID]
    notes: Optional[str]
    changed_at: datetime

    model_config = {"from_attributes": True}


class ProposalResponse(BaseModel):
    id: uuid.UUID
    number: str
    version: int
    title: str
    description: Optional[str]
    status: ProposalStatus

    attendance_id: Optional[uuid.UUID]
    client_id: Optional[uuid.UUID]
    company_id: Optional[uuid.UUID]

    client_name: Optional[str]
    client_email: Optional[str]
    client_phone: Optional[str]
    client_document: Optional[str]

    total_value: float
    discount: float

    payment_terms: Optional[str]
    delivery_terms: Optional[str]
    notes: Optional[str]

    valid_until: Optional[datetime]
    sent_at: Optional[datetime]
    accepted_at: Optional[datetime]
    rejected_at: Optional[datetime]
    created_by: Optional[uuid.UUID]

    public_token: Optional[str] = None
    public_acceptance: Optional[dict] = None

    items: List[ProposalItemResponse] = Field(default_factory=list)

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProposalTemplateItemCreate(BaseModel):
    description: str = Field(..., min_length=1)
    quantity: float = Field(1, gt=0)
    unit: Optional[str] = Field(None, max_length=20)
    unit_price: float = Field(0, ge=0)
    order: int = Field(0, ge=0)


class ProposalTemplateItemResponse(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    description: str
    quantity: float
    unit: Optional[str]
    unit_price: float
    order: int

    model_config = {"from_attributes": True}


class ProposalTemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    notes: Optional[str] = None
    discount: float = Field(0, ge=0)
    validity_days: Optional[int] = Field(None, ge=0)
    is_active: bool = True
    items: List[ProposalTemplateItemCreate] = Field(default_factory=list)


class ProposalTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    notes: Optional[str] = None
    discount: Optional[float] = Field(None, ge=0)
    validity_days: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None
    items: Optional[List[ProposalTemplateItemCreate]] = None  # se fornecido, substitui


class ProposalTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    title: Optional[str]
    body: Optional[str]
    payment_terms: Optional[str]
    delivery_terms: Optional[str]
    notes: Optional[str]
    discount: float
    validity_days: Optional[int]
    is_active: bool
    items: List[ProposalTemplateItemResponse] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class ProposalFromTemplate(BaseModel):
    """Cria proposta a partir de template, opcionalmente sobrescrevendo campos."""
    template_id: uuid.UUID
    attendance_id: Optional[uuid.UUID] = None
    client_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    client_document: Optional[str] = None


class ProposalSummary(BaseModel):
    id: uuid.UUID
    number: str
    version: int
    title: str
    status: ProposalStatus
    attendance_id: Optional[uuid.UUID]
    client_id: Optional[uuid.UUID]
    company_id: Optional[uuid.UUID]
    client_name: Optional[str]
    total_value: float
    valid_until: Optional[datetime]
    sent_at: Optional[datetime]
    accepted_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# CONTRATOS
# ══════════════════════════════════════════════

from app.modules.crm.models import ContractStatus  # noqa: E402


class ContractTemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    body: str = Field(..., min_length=1)
    is_active: bool = True


class ContractTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    body: Optional[str] = Field(None, min_length=1)
    is_active: Optional[bool] = None


class ContractTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    body: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ContractCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=300)
    body: str = Field(..., min_length=1)
    proposal_id: Optional[uuid.UUID] = None
    attendance_id: Optional[uuid.UUID] = None
    client_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    client_name: Optional[str] = None
    client_document: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    total_value: float = Field(0, ge=0)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    custom_data: Optional[dict] = None


class ContractUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    status: Optional[ContractStatus] = None
    total_value: Optional[float] = Field(None, ge=0)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    custom_data: Optional[dict] = None


class ContractFromProposal(BaseModel):
    proposal_id: uuid.UUID
    template_id: Optional[uuid.UUID] = None  # se nulo, usa body simples
    title: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class ContractSign(BaseModel):
    signer_name: str = Field(..., min_length=2, max_length=200)
    signer_document: Optional[str] = None
    signer_email: Optional[str] = None
    accept_terms: bool = True


class ContractResponse(BaseModel):
    id: uuid.UUID
    number: str
    title: str
    body: str
    status: ContractStatus
    proposal_id: Optional[uuid.UUID]
    attendance_id: Optional[uuid.UUID]
    client_id: Optional[uuid.UUID]
    company_id: Optional[uuid.UUID]
    client_name: Optional[str]
    client_document: Optional[str]
    client_email: Optional[str]
    client_phone: Optional[str]
    total_value: float
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    signed_at: Optional[datetime]
    signer_name: Optional[str]
    signer_document: Optional[str]
    signer_email: Optional[str]
    signer_ip: Optional[str]
    signature_hash: Optional[str]
    public_token: Optional[str]
    created_by: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContractSummary(BaseModel):
    id: uuid.UUID
    number: str
    title: str
    status: ContractStatus
    client_name: Optional[str]
    total_value: float
    start_date: Optional[datetime]
    signed_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
