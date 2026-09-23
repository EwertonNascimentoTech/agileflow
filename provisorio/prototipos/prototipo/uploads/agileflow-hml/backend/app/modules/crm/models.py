"""
Modelos do módulo Atendimento — vivem no schema isolado de cada tenant.
Enums usam native_enum=False para evitar conflito de tipos PostgreSQL entre schemas.
"""
import uuid
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String, Boolean, DateTime, ForeignKey,
    Text, Integer, Numeric, Enum as SAEnum, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.core.database import TenantBase

# Faz o SQLAlchemy gravar/ler o .value do enum (ex: "neutral") em vez do .name ("NEUTRAL").
# Sem isso, rows criadas pela migration (com DEFAULT lowercase) quebram a leitura.
_enum_values = lambda obj: [e.value for e in obj]  # noqa: E731


# ─────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────

class ClientType(str, enum.Enum):
    SALAO       = "salao"
    DELIVERY    = "delivery"
    EVENTO      = "evento"
    CORPORATIVO = "corporativo"
    RECORRENTE  = "recorrente"


class ClientEntityType(str, enum.Enum):
    """PF (pessoa física) vs PJ (pessoa jurídica)."""
    PF = "pf"
    PJ = "pj"


class ChannelType(str, enum.Enum):
    WHATSAPP  = "whatsapp"
    INSTAGRAM = "instagram"
    PHONE     = "phone"
    SITE      = "site"
    OTHER     = "other"


class SenderType(str, enum.Enum):
    AGENT  = "agent"
    CLIENT = "client"
    BOT    = "bot"
    SYSTEM = "system"


class MessageType(str, enum.Enum):
    TEXT     = "text"
    IMAGE    = "image"
    AUDIO    = "audio"
    DOCUMENT = "document"
    VIDEO    = "video"
    LOCATION = "location"


class FieldType(str, enum.Enum):
    TEXT         = "text"
    TEXTAREA     = "textarea"
    NUMBER       = "number"
    DATE         = "date"
    BOOLEAN      = "boolean"
    SELECT       = "select"
    MULTI_SELECT = "multi_select"


class FieldEntity(str, enum.Enum):
    CLIENT     = "client"
    ATTENDANCE = "attendance"


class AssignmentRuleType(str, enum.Enum):
    MANUAL        = "manual"
    ROUND_ROBIN   = "round_robin"
    LEAST_BUSY    = "least_busy"
    SPECIFIC_USER = "specific_user"


class AttendancePriority(str, enum.Enum):
    LOW    = "low"
    MEDIUM = "medium"
    HIGH   = "high"
    URGENT = "urgent"


class StageOutcome(str, enum.Enum):
    """Resultado da etapa quando um lead chega aqui."""
    NEUTRAL = "neutral"  # etapa intermediária
    WON     = "won"      # ganho (proposta aceita, venda fechada)
    LOST    = "lost"     # perdido (oportunidade descartada)


class TaskStatus(str, enum.Enum):
    PENDING   = "pending"
    DONE      = "done"
    CANCELLED = "cancelled"


class TaskPriority(str, enum.Enum):
    LOW    = "low"
    MEDIUM = "medium"
    HIGH   = "high"


class LeadEventType(str, enum.Enum):
    """Tipos de evento na timeline de um atendimento."""
    SYSTEM           = "system"            # evento de sistema (criação, fechamento)
    NOTE             = "note"              # nota manual do usuário
    AUTOMATION       = "automation"        # disparado por automação
    STATUS_CHANGED   = "status_changed"    # mudança de etapa
    ASSIGNED         = "assigned"          # atribuição alterada
    MESSAGE_SENT     = "message_sent"      # mensagem enviada pelo agente
    MESSAGE_RECEIVED = "message_received"  # mensagem recebida do cliente (ex.: WhatsApp)


class AutomationTrigger(str, enum.Enum):
    """Gatilho que dispara a automação."""
    ENTER_STAGE  = "enter_stage"   # atendimento entrou na etapa
    STATUS_WON   = "status_won"    # atendimento foi pra etapa de ganho
    STATUS_LOST  = "status_lost"   # atendimento foi pra etapa de perda
    CREATED      = "created"       # atendimento foi criado


class AutomationAction(str, enum.Enum):
    """Ação que a automação executa."""
    CREATE_TASK         = "create_task"
    SEND_NOTIFICATION   = "send_notification"
    UPDATE_PRIORITY     = "update_priority"
    ASSIGN_USER         = "assign_user"


class FollowUpChannel(str, enum.Enum):
    """Canal de envio da mensagem de follow-up."""
    AUTO      = "auto"       # usa o canal do atendimento
    WHATSAPP  = "whatsapp"
    INSTAGRAM = "instagram"
    PHONE     = "phone"      # ligação manual (registro)
    INTERNAL  = "internal"   # apenas registra na timeline (sem enviar)


# ─────────────────────────────────────────────
# CONFIGURAÇÕES
# ─────────────────────────────────────────────

class Funnel(TenantBase):
    """
    Funil de vendas/atendimento. Agrupa stages (colunas do Kanban).
    Uma empresa pode ter vários funis (Vendas, Pós-venda, Onboarding etc.).
    """
    __tablename__ = "funnels"

    id: Mapped[uuid.UUID]        = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str]            = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    color: Mapped[str]           = mapped_column(String(7), nullable=False, default="#3B82F6")
    order: Mapped[int]           = mapped_column(Integer, default=0)
    is_default: Mapped[bool]     = mapped_column(Boolean, default=False)
    is_active: Mapped[bool]      = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    statuses: Mapped[list["AttendanceStatusConfig"]] = relationship(
        back_populates="funnel", cascade="all, delete-orphan", order_by="AttendanceStatusConfig.order"
    )


class AttendanceStatusConfig(TenantBase):
    """
    Coluna do Kanban dentro de um funil.
    `outcome` indica se a coluna representa ganho/perda/neutro.
    `lead_page_policy` controla quais tabs/seções aparecem na ficha do atendimento
    quando ele está nesta etapa (ex.: {"tab_proposals": "hidden", "tab_chat": "full"}).
    """
    __tablename__ = "attendance_status_configs"

    id: Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    funnel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("funnels.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str]           = mapped_column(String(100), nullable=False)
    color: Mapped[str]          = mapped_column(String(7), nullable=False, default="#6B7280")
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    order: Mapped[int]          = mapped_column(Integer, nullable=False, default=0)
    is_initial: Mapped[bool]    = mapped_column(Boolean, default=False)
    is_final: Mapped[bool]      = mapped_column(Boolean, default=False)
    outcome: Mapped[StageOutcome] = mapped_column(
        SAEnum(StageOutcome, native_enum=False, values_callable=_enum_values),
        nullable=False, default=StageOutcome.NEUTRAL,
    )
    lead_page_policy: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    probability: Mapped[int] = mapped_column(Integer, nullable=False, default=50)  # K-006
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    funnel: Mapped["Funnel"] = relationship(back_populates="statuses")
    attendances: Mapped[list["Attendance"]] = relationship(back_populates="status")
    transitions_from: Mapped[list["KanbanTransition"]] = relationship(
        back_populates="from_status", foreign_keys="KanbanTransition.from_status_id",
    )
    transitions_to: Mapped[list["KanbanTransition"]] = relationship(
        back_populates="to_status", foreign_keys="KanbanTransition.to_status_id",
    )


class KanbanTransition(TenantBase):
    """
    Regras de avanço entre status do Kanban.
    Se a tabela estiver vazia, movimento livre é permitido.
    """
    __tablename__ = "kanban_transitions"
    __table_args__ = (UniqueConstraint("from_status_id", "to_status_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_status_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attendance_status_configs.id", ondelete="CASCADE"),
        nullable=True,  # NULL = qualquer status de origem
    )
    to_status_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attendance_status_configs.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Ex.: {"roles_required": ["company_admin"], "fields_required": ["resolved_reason"]}
    conditions: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    from_status: Mapped[Optional["AttendanceStatusConfig"]] = relationship(
        back_populates="transitions_from", foreign_keys=[from_status_id],
    )
    to_status: Mapped["AttendanceStatusConfig"] = relationship(
        back_populates="transitions_to", foreign_keys=[to_status_id],
    )


class CustomFieldDefinition(TenantBase):
    """Campos personalizados para clientes ou atendimentos."""
    __tablename__ = "custom_field_definitions"

    id: Mapped[uuid.UUID]         = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[FieldEntity] = mapped_column(SAEnum(FieldEntity, native_enum=False), nullable=False)
    name: Mapped[str]             = mapped_column(String(100), nullable=False)
    field_key: Mapped[str]        = mapped_column(String(100), nullable=False)  # chave no JSON custom_data
    field_type: Mapped[FieldType] = mapped_column(SAEnum(FieldType, native_enum=False), nullable=False)
    options: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)  # valores para select
    is_required: Mapped[bool]     = mapped_column(Boolean, default=False)
    order: Mapped[int]            = mapped_column(Integer, default=0)
    is_active: Mapped[bool]       = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]  = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime]  = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ChannelConfig(TenantBase):
    """Configuração de integração por canal (WhatsApp, Instagram, etc.)."""
    __tablename__ = "channel_configs"

    id: Mapped[uuid.UUID]          = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel: Mapped[ChannelType]   = mapped_column(SAEnum(ChannelType, native_enum=False), nullable=False)
    name: Mapped[str]              = mapped_column(String(100), nullable=False)
    # Tokens, chaves de API, phone_number_id, etc.
    credentials: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Configurações específicas do canal (ex.: welcome_message, business_hours)
    config: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    webhook_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool]        = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]   = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime]   = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    attendances: Mapped[list["Attendance"]] = relationship(back_populates="channel_config")


class AssignmentRule(TenantBase):
    """Regras configuráveis de atribuição de atendimento a agentes."""
    __tablename__ = "assignment_rules"

    id: Mapped[uuid.UUID]                   = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str]                       = mapped_column(String(100), nullable=False)
    rule_type: Mapped[AssignmentRuleType]   = mapped_column(SAEnum(AssignmentRuleType, native_enum=False), nullable=False)
    # Ex.: {"channels": ["whatsapp"], "client_types": ["corporativo"]}
    conditions: Mapped[Optional[dict]]      = mapped_column(JSONB, nullable=True)
    # Ex.: {"user_id": "uuid"} para SPECIFIC_USER
    config: Mapped[Optional[dict]]          = mapped_column(JSONB, nullable=True)
    order: Mapped[int]                      = mapped_column(Integer, default=0)
    is_active: Mapped[bool]                 = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]            = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime]            = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─────────────────────────────────────────────
# CRM
# ─────────────────────────────────────────────

class Company(TenantBase):
    """Empresa (cliente PJ). Pode agrupar contatos (Client com PF) e atendimentos."""
    __tablename__ = "companies"

    id: Mapped[uuid.UUID]             = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str]                 = mapped_column(String(200), nullable=False)
    trade_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # nome fantasia
    document: Mapped[Optional[str]]   = mapped_column(String(20), nullable=True)   # CNPJ
    email: Mapped[Optional[str]]      = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]]      = mapped_column(String(30), nullable=True)
    website: Mapped[Optional[str]]    = mapped_column(String(255), nullable=True)
    industry: Mapped[Optional[str]]   = mapped_column(String(100), nullable=True)  # setor / segmento
    address: Mapped[Optional[dict]]   = mapped_column(JSONB, nullable=True)        # {street, city, state, zip}
    notes: Mapped[Optional[str]]      = mapped_column(Text, nullable=True)
    custom_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)
    is_active: Mapped[bool]           = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]      = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime]      = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    clients: Mapped[list["Client"]]         = relationship(back_populates="company")
    attendances: Mapped[list["Attendance"]] = relationship(back_populates="company")


class Tag(TenantBase):
    """Tag reutilizável para clientes e/ou atendimentos."""
    __tablename__ = "tags"

    id: Mapped[uuid.UUID]          = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str]              = mapped_column(String(50), nullable=False)
    color: Mapped[str]             = mapped_column(String(7), nullable=False, default="#3B82F6")
    entity_type: Mapped[str]       = mapped_column(String(20), nullable=False)  # "client" or "attendance"
    slug: Mapped[Optional[str]]    = mapped_column(String(50), nullable=True)  # ex.: classificacao_pf / classificacao_pj
    created_at: Mapped[datetime]   = mapped_column(DateTime, default=datetime.utcnow)

    client_tags: Mapped[list["ClientTag"]]         = relationship(back_populates="tag", cascade="all, delete-orphan")
    attendance_tags: Mapped[list["AttendanceTag"]] = relationship(back_populates="tag", cascade="all, delete-orphan")


class ClientTag(TenantBase):
    """Junction table: Client <-> Tag."""
    __tablename__ = "client_tags"
    __table_args__ = (UniqueConstraint("client_id", "tag_id"),)

    id: Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    tag_id: Mapped[uuid.UUID]   = mapped_column(
        UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), nullable=False
    )

    client: Mapped["Client"] = relationship(back_populates="client_tags")
    tag: Mapped["Tag"]       = relationship(back_populates="client_tags")


class AttendanceTag(TenantBase):
    """Junction table: Attendance <-> Tag."""
    __tablename__ = "attendance_tags"
    __table_args__ = (UniqueConstraint("attendance_id", "tag_id"),)

    id: Mapped[uuid.UUID]           = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attendance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendances.id", ondelete="CASCADE"), nullable=False
    )
    tag_id: Mapped[uuid.UUID]       = mapped_column(
        UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), nullable=False
    )

    attendance: Mapped["Attendance"] = relationship(back_populates="attendance_tags")
    tag: Mapped["Tag"]               = relationship(back_populates="attendance_tags")


class Client(TenantBase):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID]             = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str]                 = mapped_column(String(200), nullable=False)
    email: Mapped[Optional[str]]      = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]]      = mapped_column(String(30), nullable=True)
    document: Mapped[Optional[str]]   = mapped_column(String(20), nullable=True)  # CPF/CNPJ
    client_type: Mapped[ClientType]   = mapped_column(
        SAEnum(ClientType, native_enum=False), nullable=False, default=ClientType.RECORRENTE
    )
    entity_type: Mapped[ClientEntityType] = mapped_column(
        SAEnum(ClientEntityType, native_enum=False, values_callable=_enum_values),
        nullable=False, default=ClientEntityType.PF
    )
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[Optional[str]]      = mapped_column(Text, nullable=True)
    custom_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)
    is_active: Mapped[bool]           = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]      = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime]      = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company: Mapped[Optional["Company"]]    = relationship(back_populates="clients")
    attendances: Mapped[list["Attendance"]] = relationship(back_populates="client")
    client_tags: Mapped[list["ClientTag"]]  = relationship(back_populates="client", cascade="all, delete-orphan")
    tags: Mapped[list["Tag"]]               = relationship(secondary="client_tags", viewonly=True)


# ─────────────────────────────────────────────
# ATENDIMENTO
# ─────────────────────────────────────────────

class Attendance(TenantBase):
    __tablename__ = "attendances"

    id: Mapped[uuid.UUID]                   = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    protocol: Mapped[str]                   = mapped_column(String(20), nullable=False, unique=True)
    client_id: Mapped[uuid.UUID]            = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False
    )
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), nullable=True
    )
    channel: Mapped[ChannelType]            = mapped_column(SAEnum(ChannelType, native_enum=False), nullable=False)
    channel_config_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("channel_configs.id", ondelete="SET NULL"), nullable=True
    )
    status_id: Mapped[uuid.UUID]            = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_status_configs.id", ondelete="RESTRICT"), nullable=False
    )
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)  # FK → public.users
    subject: Mapped[str]                    = mapped_column(String(300), nullable=False)
    priority: Mapped[AttendancePriority]    = mapped_column(
        SAEnum(AttendancePriority, native_enum=False), nullable=False, default=AttendancePriority.MEDIUM
    )
    # Campos comerciais (oportunidade)
    value: Mapped[Optional[float]]          = mapped_column(Numeric(12, 2), nullable=True)
    expected_close_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_interaction: Mapped[Optional[datetime]]    = mapped_column(DateTime, nullable=True)
    custom_data: Mapped[Optional[dict]]     = mapped_column(JSONB, nullable=True, default=dict)
    quote_id: Mapped[Optional[uuid.UUID]]   = mapped_column(UUID(as_uuid=True), nullable=True)  # futuro: orçamento
    sale_id: Mapped[Optional[uuid.UUID]]    = mapped_column(UUID(as_uuid=True), nullable=True)   # futuro: venda
    opened_at: Mapped[datetime]             = mapped_column(DateTime, default=datetime.utcnow)
    closed_at: Mapped[Optional[datetime]]   = mapped_column(DateTime, nullable=True)
    close_reason: Mapped[Optional[str]]     = mapped_column(String(500), nullable=True)
    closed_by: Mapped[Optional[uuid.UUID]]  = mapped_column(UUID(as_uuid=True), nullable=True)
    outcome: Mapped[str]                    = mapped_column(String(20), nullable=False, default="open")  # open|won|lost
    parent_attendance_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)  # K-016
    created_at: Mapped[datetime]            = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime]            = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client: Mapped["Client"]                        = relationship(back_populates="attendances")
    company: Mapped[Optional["Company"]]            = relationship(back_populates="attendances")
    status: Mapped["AttendanceStatusConfig"]         = relationship(back_populates="attendances")
    channel_config: Mapped[Optional["ChannelConfig"]] = relationship(back_populates="attendances")
    messages: Mapped[list["AttendanceMessage"]]     = relationship(
        back_populates="attendance", cascade="all, delete-orphan", order_by="AttendanceMessage.sent_at"
    )
    status_logs: Mapped[list["AttendanceStatusLog"]] = relationship(
        back_populates="attendance", cascade="all, delete-orphan", order_by="AttendanceStatusLog.changed_at"
    )
    tasks: Mapped[list["Task"]] = relationship(
        back_populates="attendance", cascade="all, delete-orphan", order_by="Task.due_date.nullslast()"
    )
    attendance_tags: Mapped[list["AttendanceTag"]] = relationship(
        back_populates="attendance", cascade="all, delete-orphan"
    )
    tags: Mapped[list["Tag"]] = relationship(secondary="attendance_tags", viewonly=True)


class AttendanceMessage(TenantBase):
    __tablename__ = "attendance_messages"

    id: Mapped[uuid.UUID]               = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attendance_id: Mapped[uuid.UUID]    = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendances.id", ondelete="CASCADE"), nullable=False
    )
    sender_type: Mapped[SenderType]     = mapped_column(SAEnum(SenderType, native_enum=False), nullable=False)
    sender_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)  # user_id se agente
    content: Mapped[str]                = mapped_column(Text, nullable=False)
    message_type: Mapped[MessageType]   = mapped_column(
        SAEnum(MessageType, native_enum=False), nullable=False, default=MessageType.TEXT
    )
    media_url: Mapped[Optional[str]]    = mapped_column(String(500), nullable=True)
    external_id: Mapped[Optional[str]]  = mapped_column(String(200), nullable=True)  # ID do WhatsApp/Instagram
    extra_data: Mapped[Optional[dict]]  = mapped_column(JSONB, nullable=True)
    is_read: Mapped[bool]               = mapped_column(Boolean, default=False)
    sent_at: Mapped[datetime]           = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime]        = mapped_column(DateTime, default=datetime.utcnow)

    attendance: Mapped["Attendance"] = relationship(back_populates="messages")
    attachments: Mapped[list["MessageAttachment"]] = relationship(
        back_populates="message", cascade="all, delete-orphan"
    )


class MessageAttachment(TenantBase):
    """Anexo de uma mensagem (imagem, áudio, PDF, etc.) armazenado no MinIO."""
    __tablename__ = "message_attachments"

    id: Mapped[uuid.UUID]             = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID]     = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_messages.id", ondelete="CASCADE"), nullable=False
    )
    attendance_id: Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), nullable=False)  # desnorm. para query
    file_name: Mapped[str]            = mapped_column(String(255), nullable=False)
    content_type: Mapped[str]         = mapped_column(String(100), nullable=False)
    object_name: Mapped[str]          = mapped_column(String(500), nullable=False)  # key no MinIO
    file_size: Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime]      = mapped_column(DateTime, default=datetime.utcnow)

    message: Mapped["AttendanceMessage"] = relationship(back_populates="attachments")


class AttendanceStatusLog(TenantBase):
    """Histórico de mudanças de status de um atendimento."""
    __tablename__ = "attendance_status_logs"

    id: Mapped[uuid.UUID]                     = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attendance_id: Mapped[uuid.UUID]          = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendances.id", ondelete="CASCADE"), nullable=False
    )
    from_status_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    to_status_id: Mapped[uuid.UUID]           = mapped_column(UUID(as_uuid=True), nullable=False)
    changed_by: Mapped[Optional[uuid.UUID]]   = mapped_column(UUID(as_uuid=True), nullable=True)
    notes: Mapped[Optional[str]]              = mapped_column(String(500), nullable=True)
    changed_at: Mapped[datetime]              = mapped_column(DateTime, default=datetime.utcnow)

    attendance: Mapped["Attendance"] = relationship(back_populates="status_logs")


# ─────────────────────────────────────────────
# TAREFAS
# ─────────────────────────────────────────────

class Task(TenantBase):
    """Tarefa vinculada (opcionalmente) a um atendimento."""
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID]              = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str]                 = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus]         = mapped_column(
        SAEnum(TaskStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=TaskStatus.PENDING
    )
    priority: Mapped[TaskPriority]     = mapped_column(
        SAEnum(TaskPriority, native_enum=False, values_callable=_enum_values),
        nullable=False, default=TaskPriority.MEDIUM
    )
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    attendance_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendances.id", ondelete="CASCADE"), nullable=True
    )
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)  # FK → public.users
    created_by: Mapped[Optional[uuid.UUID]]  = mapped_column(UUID(as_uuid=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    source: Mapped[str]                = mapped_column(String(50), nullable=False, default="manual")  # K-013: manual|playbook|automation
    created_at: Mapped[datetime]       = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime]       = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    attendance: Mapped[Optional["Attendance"]] = relationship(back_populates="tasks")


# ─────────────────────────────────────────────
# TIMELINE
# ─────────────────────────────────────────────

class LeadEvent(TenantBase):
    """
    Evento da timeline de um atendimento.
    Inclui mudanças de estado, notas manuais, mensagens sistema (automação) etc.
    """
    __tablename__ = "lead_events"

    id: Mapped[uuid.UUID]            = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attendance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendances.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[LeadEventType] = mapped_column(
        SAEnum(LeadEventType, native_enum=False, values_callable=_enum_values),
        nullable=False, default=LeadEventType.SYSTEM,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    author_name: Mapped[Optional[str]]     = mapped_column(String(200), nullable=True)
    extra_data: Mapped[Optional[dict]]     = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime]           = mapped_column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────
# AUTOMAÇÕES
# ─────────────────────────────────────────────

class AutomationRule(TenantBase):
    """
    Regra de automação. Quando um gatilho é disparado num atendimento,
    todas as regras matching (por funil + etapa + trigger + ativo) são executadas.
    """
    __tablename__ = "automation_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str]     = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trigger: Mapped[AutomationTrigger] = mapped_column(
        SAEnum(AutomationTrigger, native_enum=False, values_callable=_enum_values),
        nullable=False,
    )
    # Filtros opcionais — se nulos, regra dispara em todos os contextos do trigger
    funnel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("funnels.id", ondelete="CASCADE"), nullable=True
    )
    stage_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attendance_status_configs.id", ondelete="CASCADE"),
        nullable=True,
    )
    action: Mapped[AutomationAction] = mapped_column(
        SAEnum(AutomationAction, native_enum=False, values_callable=_enum_values),
        nullable=False,
    )
    # Config da ação. Ex: {"task_title": "Ligar", "due_hours": 24}
    action_config: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    order: Mapped[int]   = mapped_column(Integer, default=0)
    is_active: Mapped[bool]    = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─────────────────────────────────────────────
# FOLLOW-UP AUTOMÁTICO
# ─────────────────────────────────────────────

class FollowUpTemplate(TenantBase):
    """
    Template de mensagem que é enviada automaticamente quando um atendimento entra
    em determinada etapa. Suporta variáveis:
      {{client_name}}, {{client_first_name}}, {{client_email}}, {{client_phone}}
      {{stage_name}}, {{funnel_name}}, {{protocol}}, {{user_name}}, {{value}}
    """
    __tablename__ = "follow_up_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str]     = mapped_column(String(200), nullable=False)
    funnel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("funnels.id", ondelete="CASCADE"), nullable=True
    )
    stage_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attendance_status_configs.id", ondelete="CASCADE"),
        nullable=True,
    )
    channel: Mapped[FollowUpChannel] = mapped_column(
        SAEnum(FollowUpChannel, native_enum=False, values_callable=_enum_values),
        nullable=False, default=FollowUpChannel.AUTO,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    delay_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool]    = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
# ─────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────

class ProposalStatus(str, enum.Enum):
    DRAFT     = "draft"      # rascunho, editável
    SENT      = "sent"       # enviada ao cliente
    ACCEPTED  = "accepted"   # cliente aceitou
    REJECTED  = "rejected"   # cliente rejeitou
    EXPIRED   = "expired"    # passou a validade
    CANCELLED = "cancelled"  # cancelada antes de fechar


class ContractStatus(str, enum.Enum):
    DRAFT     = "draft"
    READY     = "ready"      # pronto pra enviar
    SENT      = "sent"
    SIGNED    = "signed"     # assinado por ambas as partes
    CANCELLED = "cancelled"


# ─────────────────────────────────────────────
# PROPOSTA
# ─────────────────────────────────────────────

class Proposal(TenantBase):
    """
    Proposta comercial. Pode estar vinculada a um atendimento (lead) ou ser standalone.
    Versionada: quando uma proposta aceita é editada, cria-se nova versão.
    """
    __tablename__ = "proposals"

    id: Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number: Mapped[str]        = mapped_column(String(30), nullable=False, unique=True)  # PROP-0001
    version: Mapped[int]       = mapped_column(Integer, nullable=False, default=1)
    title: Mapped[str]         = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[ProposalStatus] = mapped_column(
        SAEnum(ProposalStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=ProposalStatus.DRAFT,
    )

    # Cross-module (UUIDs sem FK)
    attendance_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    client_id: Mapped[Optional[uuid.UUID]]     = mapped_column(UUID(as_uuid=True), nullable=True)
    company_id: Mapped[Optional[uuid.UUID]]    = mapped_column(UUID(as_uuid=True), nullable=True)

    # Snapshot do cliente (caso o registro original mude/seja deletado)
    client_name: Mapped[Optional[str]]      = mapped_column(String(200), nullable=True)
    client_email: Mapped[Optional[str]]     = mapped_column(String(255), nullable=True)
    client_phone: Mapped[Optional[str]]     = mapped_column(String(30), nullable=True)
    client_document: Mapped[Optional[str]]  = mapped_column(String(20), nullable=True)

    total_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    discount: Mapped[float]    = mapped_column(Numeric(12, 2), nullable=False, default=0)

    payment_terms: Mapped[Optional[str]]   = mapped_column(Text, nullable=True)
    delivery_terms: Mapped[Optional[str]]  = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]]           = mapped_column(Text, nullable=True)

    valid_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[Optional[datetime]]     = mapped_column(DateTime, nullable=True)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    rejected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Link público de aceitação
    public_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    public_acceptance: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # {name, email, ip, accepted_at}

    # FK em public.users (referência por UUID — sem FK no schema do tenant)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    custom_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items: Mapped[list["ProposalItem"]] = relationship(
        back_populates="proposal", cascade="all, delete-orphan", order_by="ProposalItem.order"
    )
    status_logs: Mapped[list["ProposalStatusLog"]] = relationship(
        back_populates="proposal", cascade="all, delete-orphan", order_by="ProposalStatusLog.changed_at"
    )


class ProposalItem(TenantBase):
    __tablename__ = "proposal_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("proposals.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[float]  = mapped_column(Numeric(12, 3), nullable=False, default=1)
    unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # un, h, kg, m, etc.
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total: Mapped[float]      = mapped_column(Numeric(12, 2), nullable=False, default=0)  # qty * unit_price
    order: Mapped[int]        = mapped_column(Integer, nullable=False, default=0)
    custom_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    proposal: Mapped["Proposal"] = relationship(back_populates="items")


class ProposalStatusLog(TenantBase):
    """Histórico de mudanças de status da proposta."""
    __tablename__ = "proposal_status_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("proposals.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[Optional[ProposalStatus]] = mapped_column(
        SAEnum(ProposalStatus, native_enum=False, values_callable=_enum_values),
        nullable=True,
    )
    to_status: Mapped[ProposalStatus] = mapped_column(
        SAEnum(ProposalStatus, native_enum=False, values_callable=_enum_values),
        nullable=False,
    )
    changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    proposal: Mapped["Proposal"] = relationship(back_populates="status_logs")


# ─────────────────────────────────────────────
# TEMPLATES
# ─────────────────────────────────────────────

class ProposalTemplate(TenantBase):
    """
    Template reusável de proposta. Quando aplicado em "nova proposta",
    os campos e items são copiados como ponto de partida.
    """
    __tablename__ = "proposal_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str]     = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Campos pré-preenchidos
    title: Mapped[Optional[str]]         = mapped_column(String(300), nullable=True)
    body: Mapped[Optional[str]]          = mapped_column(Text, nullable=True)  # descrição da proposta
    payment_terms: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivery_terms: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]]         = mapped_column(Text, nullable=True)
    discount: Mapped[float]              = mapped_column(Numeric(12, 2), default=0)
    validity_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # ex: 30

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items: Mapped[list["ProposalTemplateItem"]] = relationship(
        back_populates="template", cascade="all, delete-orphan", order_by="ProposalTemplateItem.order"
    )


class ProposalTemplateItem(TenantBase):
    __tablename__ = "proposal_template_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("proposal_templates.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[float]  = mapped_column(Numeric(12, 3), nullable=False, default=1)
    unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    order: Mapped[int]        = mapped_column(Integer, nullable=False, default=0)

    template: Mapped["ProposalTemplate"] = relationship(back_populates="items")


# ─────────────────────────────────────────────
# CONTRATOS
# ─────────────────────────────────────────────

class ContractTemplate(TenantBase):
    """Template de contrato (cláusulas e estrutura padrão)."""
    __tablename__ = "contract_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)  # texto com {{placeholders}}
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Contract(TenantBase):
    """
    Contrato. Pode ser criado standalone ou a partir de proposta aceita.
    O body é renderizado pelo template + dados (snapshot na criação).
    """
    __tablename__ = "contracts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number: Mapped[str]   = mapped_column(String(30), nullable=False, unique=True)  # CTR-0001
    title: Mapped[str]    = mapped_column(String(300), nullable=False)
    body: Mapped[str]     = mapped_column(Text, nullable=False)  # texto final (já interpolado)

    status: Mapped[ContractStatus] = mapped_column(
        SAEnum(ContractStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=ContractStatus.DRAFT,
    )

    # Cross-module refs (UUIDs sem FK)
    proposal_id: Mapped[Optional[uuid.UUID]]   = mapped_column(UUID(as_uuid=True), nullable=True)
    attendance_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    client_id: Mapped[Optional[uuid.UUID]]     = mapped_column(UUID(as_uuid=True), nullable=True)
    company_id: Mapped[Optional[uuid.UUID]]    = mapped_column(UUID(as_uuid=True), nullable=True)

    # Snapshot do cliente
    client_name: Mapped[Optional[str]]      = mapped_column(String(200), nullable=True)
    client_document: Mapped[Optional[str]]  = mapped_column(String(20), nullable=True)
    client_email: Mapped[Optional[str]]     = mapped_column(String(255), nullable=True)
    client_phone: Mapped[Optional[str]]     = mapped_column(String(30), nullable=True)

    total_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    end_date: Mapped[Optional[datetime]]   = mapped_column(DateTime, nullable=True)

    # Assinatura (stub — sem integração externa)
    signed_at: Mapped[Optional[datetime]]      = mapped_column(DateTime, nullable=True)
    signer_name: Mapped[Optional[str]]         = mapped_column(String(200), nullable=True)
    signer_document: Mapped[Optional[str]]     = mapped_column(String(20), nullable=True)
    signer_email: Mapped[Optional[str]]        = mapped_column(String(255), nullable=True)
    signer_ip: Mapped[Optional[str]]           = mapped_column(String(45), nullable=True)
    signature_hash: Mapped[Optional[str]]      = mapped_column(String(128), nullable=True)
    # Link público de assinatura
    public_token: Mapped[Optional[str]]        = mapped_column(String(64), nullable=True, unique=True)

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    custom_data: Mapped[Optional[dict]]      = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



# ─────────────────────────────────────────────
# FORECAST / METAS DE VENDAS (K-006)
# ─────────────────────────────────────────────

class SalesTarget(TenantBase):
    """Meta de vendas por usuário/funil/período."""
    __tablename__ = "sales_targets"
    __table_args__ = (UniqueConstraint("user_id", "funnel_id", "period"),)

    id: Mapped[uuid.UUID]              = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    funnel_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    period: Mapped[str]                = mapped_column(String(7), nullable=False)  # "2026-05"
    target_value: Mapped[float]        = mapped_column(Numeric(14, 2), nullable=False, default=0)
    created_at: Mapped[datetime]       = mapped_column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────
# CAMPOS OBRIGATÓRIOS POR ETAPA (K-003)
# ─────────────────────────────────────────────

class StageRequiredField(TenantBase):
    """Campo obrigatório para avançar para uma determinada etapa do funil."""
    __tablename__ = "stage_required_fields"
    __table_args__ = (UniqueConstraint("status_id", "field_name"),)

    id: Mapped[uuid.UUID]        = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attendance_status_configs.id", ondelete="CASCADE"),
        nullable=False,
    )
    field_name: Mapped[str]      = mapped_column(String(100), nullable=False)
    field_label: Mapped[str]     = mapped_column(String(100), nullable=False)
    field_type: Mapped[str]      = mapped_column(String(20), nullable=False, default="native")  # native | custom
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────
# PLAYBOOK DE TAREFAS (K-013)
# ─────────────────────────────────────────────

class PlaybookStep(TenantBase):
    """Step de playbook vinculado a uma etapa do funil. Cria tasks automaticamente na transição."""
    __tablename__ = "playbook_steps"

    id: Mapped[uuid.UUID]              = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status_id: Mapped[uuid.UUID]       = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("attendance_status_configs.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str]                 = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_days: Mapped[int]              = mapped_column(Integer, nullable=False, default=1)
    order: Mapped[int]                 = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime]       = mapped_column(DateTime, default=datetime.utcnow)


class ReactivationConfig(TenantBase):
    """Configuração de reativação automática de negócios perdidos por funil/motivo (K-016)."""
    __tablename__ = "reactivation_configs"

    id: Mapped[uuid.UUID]              = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    funnel_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)   # NULL = todos os funis
    loss_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)              # NULL = qualquer motivo
    delay_days: Mapped[int]            = mapped_column(Integer, nullable=False, default=30)
    is_active: Mapped[bool]            = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]       = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime]       = mapped_column(DateTime, default=datetime.utcnow)
