import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import TenantBase


_enum_values = lambda obj: [e.value for e in obj]


class ProjectAutomationAction(str, enum.Enum):
    ASSIGN_USER = "assign_user"        # define o responsável do card
    CREATE_SUBTASK = "create_subtask"  # cria um card filho (atividade) sob o card atual
    NOTIFY = "notify"                  # gera notificação in-app
    ADD_COMMENT = "add_comment"        # registra um comentário no histórico


class Project(TenantBase):
    __tablename__ = "project_projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)  # public.users.id
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    funnels: Mapped[list["ProjectFunnel"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectFunnel.order",
    )
    statuses: Mapped[list["ProjectStatusConfig"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    tasks: Mapped[list["ProjectTask"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    members: Mapped[list["ProjectMember"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )


class ProjectStatusConfig(TenantBase):
    __tablename__ = "project_status_configs"
    __table_args__ = (UniqueConstraint("funnel_id", "name"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    funnel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_funnels.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6B7280")
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_initial: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_final: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Quando um card entra nesta fase, gera automaticamente um novo card deste tipo
    # (ex: Demanda → Projeto). NULL = fase não dispara conversão.
    creates_demand_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_demand_types.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Quando um card entra nesta fase, o MESMO card transita para a etapa inicial
    # deste funil destino (ex: Planejamento → Desenvolvimento). NULL = sem transição.
    moves_to_funnel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_funnels.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Ao entrar nesta etapa, move o card de origem (origin_task_id) para a etapa indicada.
    updates_origin_status_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_status_configs.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Funções (roles do tenant) autorizadas a mover um card PARA esta etapa.
    # NULL/vazio = sem restrição. company_admin/super_admin sempre podem.
    move_in_role_ids: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    # SLA: limite de horas que um card pode ficar nesta etapa. NULL = sem SLA.
    sla_hours: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Percentual do limite a partir do qual o card entra em "alerta" (default 80%).
    sla_warning_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=80)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project: Mapped["Project"] = relationship(back_populates="statuses")
    funnel: Mapped["ProjectFunnel"] = relationship(back_populates="statuses", foreign_keys=[funnel_id])
    tasks: Mapped[list["ProjectTask"]] = relationship(back_populates="status")
    section_links: Mapped[list["ProjectStatusSectionLink"]] = relationship(cascade="all, delete-orphan")


class ProjectTask(TenantBase):
    __tablename__ = "project_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    status_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_status_configs.id", ondelete="RESTRICT"),
        nullable=False,
    )
    demand_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_demand_types.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Hierarquia de composição: Programa ⊃ Projeto ⊃ Feature
    parent_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_tasks.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Rastreabilidade da conversão: Projeto criado a partir de uma Demanda
    origin_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_tasks.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)  # public.users.id
    diretoria: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    area: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # SLA: quando o card entrou na etapa atual + estado calculado pela rotina de SLA.
    status_entered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    sla_state: Mapped[str] = mapped_column(String(12), nullable=False, default="none")  # none|ok|warning|breached
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project: Mapped["Project"] = relationship(back_populates="tasks")
    status: Mapped["ProjectStatusConfig"] = relationship(back_populates="tasks")
    demand_type: Mapped[Optional["ProjectDemandType"]] = relationship(back_populates="tasks")
    parent_task: Mapped[Optional["ProjectTask"]] = relationship(
        remote_side="ProjectTask.id",
        foreign_keys=[parent_task_id],
        back_populates="children",
    )
    children: Mapped[list["ProjectTask"]] = relationship(
        back_populates="parent_task",
        foreign_keys=[parent_task_id],
    )
    origin_task: Mapped[Optional["ProjectTask"]] = relationship(
        remote_side="ProjectTask.id",
        foreign_keys=[origin_task_id],
    )
    form_submission: Mapped[Optional["ProjectDemandFormSubmission"]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        uselist=False,
    )
    comments: Mapped[list["ProjectTaskComment"]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="ProjectTaskComment.created_at",
    )


class ProjectTaskComment(TenantBase):
    __tablename__ = "project_task_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_tasks.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task: Mapped["ProjectTask"] = relationship(back_populates="comments")


class ProjectMember(TenantBase):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project: Mapped["Project"] = relationship(back_populates="members")


class ProjectFunnel(TenantBase):
    __tablename__ = "project_funnels"
    __table_args__ = (UniqueConstraint("project_id", "name"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#7C3AED")
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Tipos de card permitidos neste kanban (lista de UUIDs de demand types).
    # NULL/vazio = sem restrição.
    allowed_demand_type_ids: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project: Mapped["Project"] = relationship(back_populates="funnels")
    statuses: Mapped[list["ProjectStatusConfig"]] = relationship(
        back_populates="funnel",
        cascade="all, delete-orphan",
        order_by="ProjectStatusConfig.order",
        foreign_keys="ProjectStatusConfig.funnel_id",
    )


class ProjectDemandType(TenantBase):
    __tablename__ = "project_demand_types"
    __table_args__ = (UniqueConstraint("slug"), UniqueConstraint("name"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    funnel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_funnels.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Tipos que podem ser filhos deste tipo na hierarquia (lista de UUIDs de demand types).
    allowed_child_type_ids: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    # Se False, usuários "basic" não podem solicitar nem ver demandas deste tipo.
    available_for_basic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Se False, itens deste tipo não aparecem no Cronograma.
    show_in_schedule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    funnel: Mapped[Optional["ProjectFunnel"]] = relationship()
    sections: Mapped[list["ProjectDemandFormSection"]] = relationship(
        back_populates="demand_type",
        cascade="all, delete-orphan",
        order_by="ProjectDemandFormSection.order",
    )
    tasks: Mapped[list["ProjectTask"]] = relationship(back_populates="demand_type")


class ProjectDemandFormSection(TenantBase):
    __tablename__ = "project_demand_form_sections"
    __table_args__ = (UniqueConstraint("demand_type_id", "key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    demand_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_demand_types.id", ondelete="CASCADE"),
        nullable=False,
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(140), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    demand_type: Mapped["ProjectDemandType"] = relationship(back_populates="sections")
    fields: Mapped[list["ProjectDemandFormField"]] = relationship(
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="ProjectDemandFormField.order",
    )
    status_links: Mapped[list["ProjectStatusSectionLink"]] = relationship(
        back_populates="section",
        cascade="all, delete-orphan",
    )


class ProjectDemandFormField(TenantBase):
    __tablename__ = "project_demand_form_fields"
    __table_args__ = (UniqueConstraint("section_id", "field_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    section_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_demand_form_sections.id", ondelete="CASCADE"),
        nullable=False,
    )
    field_key: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(140), nullable=False)
    field_type: Mapped[str] = mapped_column(String(30), nullable=False, default="text")
    placeholder: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    options: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    validation: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    section: Mapped["ProjectDemandFormSection"] = relationship(back_populates="fields")


class ProjectStatusSectionLink(TenantBase):
    __tablename__ = "project_status_section_links"
    __table_args__ = (UniqueConstraint("status_id", "section_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_status_configs.id", ondelete="CASCADE"),
        nullable=False,
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_demand_form_sections.id", ondelete="CASCADE"),
        nullable=False,
    )
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="visible")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    status: Mapped["ProjectStatusConfig"] = relationship()
    section: Mapped["ProjectDemandFormSection"] = relationship(back_populates="status_links")


class ProjectStatusDefaultFormLink(TenantBase):
    """Visibilidade/obrigatoriedade de um campo do formulário padrão por etapa (status)."""

    __tablename__ = "project_status_default_form_links"
    __table_args__ = (UniqueConstraint("status_id", "field_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_status_configs.id", ondelete="CASCADE"),
        nullable=False,
    )
    field_key: Mapped[str] = mapped_column(String(40), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="visible")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    status: Mapped["ProjectStatusConfig"] = relationship()


class ProjectDemandFormSubmission(TenantBase):
    __tablename__ = "project_demand_form_submissions"
    __table_args__ = (UniqueConstraint("task_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_tasks.id", ondelete="CASCADE"),
        nullable=False,
    )
    values: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    task: Mapped["ProjectTask"] = relationship(back_populates="form_submission")


class ProjectAutomationRule(TenantBase):
    """Regra de automação disparada quando um card entra numa etapa (status)."""

    __tablename__ = "project_automation_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    status_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_status_configs.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    trigger: Mapped[str] = mapped_column(String(30), nullable=False, default="enter_status")
    action: Mapped[ProjectAutomationAction] = mapped_column(
        SAEnum(ProjectAutomationAction, native_enum=False, values_callable=_enum_values),
        nullable=False,
    )
    action_config: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProjectScheduleBinding(TenantBase):
    """Vínculo do Cronograma com uma etapa (status) de um fluxo (funnel).

    Cards numa etapa vinculada aparecem no cronograma; com `require_fill`, só
    podem SAIR da etapa com início e prazo preenchidos (gate). Configurado no
    card "Cronograma" das configurações do módulo Projetos.
    """

    __tablename__ = "project_schedule_bindings"
    __table_args__ = (UniqueConstraint("status_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    funnel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_funnels.id", ondelete="CASCADE"),
        nullable=False,
    )
    status_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_status_configs.id", ondelete="CASCADE"),
        nullable=False,
    )
    require_fill: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProjectDefaultFormField(TenantBase):
    """Campos do formulário padrão de demandas (título, descrição, responsável, datas)."""

    __tablename__ = "project_default_form_fields"
    __table_args__ = (UniqueConstraint("field_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    field_key: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    field_type: Mapped[str] = mapped_column(String(30), nullable=False, default="text")
    options: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

