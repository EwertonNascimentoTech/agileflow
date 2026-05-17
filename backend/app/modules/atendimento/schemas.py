import uuid
from datetime import datetime
from typing import Optional, List, Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator
import re

from app.modules.atendimento.models import (
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
