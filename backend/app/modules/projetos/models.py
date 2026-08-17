import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
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


class ProjectStageAgentKind(str, enum.Enum):
    ASK = "ask"                                    # pergunta livre ao gateway IDCortex
    CLASSIFY_AND_ADVANCE = "classify_and_advance"  # classifica matriz Impacto×Esforço e avança o card


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
    # Ao transitar de kanban (moves_to_funnel_id), leva os DESCENDENTES (etapas do
    # cronograma) junto para a etapa inicial do kanban destino.
    cascade_children_on_move: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Ao entrar nesta etapa, ENVIA os FILHOS (tarefas do cronograma) para a etapa inicial
    # deste kanban — o card atual (projeto) PERMANECE. NULL = não envia.
    children_to_funnel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_funnels.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Ao entrar nesta etapa, envia os NETOS (descendentes além do 1º nível) para a etapa
    # inicial DESTE kanban — separado de children_to_funnel_id. NULL = netos seguem os filhos.
    grandchildren_to_funnel_id: Mapped[Optional[uuid.UUID]] = mapped_column(
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
    # Funções autorizadas a mover cards que ESTÃO nesta etapa (origem).
    # NULL/vazio = sem restrição. company_admin/super_admin sempre podem.
    move_out_role_ids: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    # SLA: limite de horas que um card pode ficar nesta etapa. NULL = sem SLA.
    sla_hours: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Percentual do limite a partir do qual o card entra em "alerta" (default 80%).
    sla_warning_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=80)
    # Como a priorização (Impacto × Esforço) aparece nos cards desta etapa:
    # 'edit' (preencher/editar) | 'view' (somente leitura) | 'hidden' (não exibir).
    priority_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="edit")
    # OBRIG.: exige a demanda pontuada (Impacto × Esforço) para sair desta etapa.
    priority_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # OBRIG.: exige classificar o card (e vincular produto/release do portfólio) para
    # sair desta etapa. Aplica-se à etapa inicial (backlog, is_initial=True).
    classification_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Controle de baseline: quando o card-raiz de planejamento entra nesta etapa, o cronograma
    # do projeto é "comprometido" e passa a exigir baseline + justificativa para alterar
    # (ver ScheduleBaselineService). Marca tipicamente a etapa "Em Desenvolvimento".
    locks_schedule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Fluxo de contratação: raia "Contratação" no kanban de projetos/programas (origem travada).
    is_procurement_hold: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Raia "Cancelado" no kanban de projetos/programas (origem quando a contratação perde).
    is_procurement_cancel: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Etapa "Concluído" do funil Contratar (ganhou → libera origem + anexa contrato).
    is_procurement_won: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Etapa "Cancelado" do funil Contratar (perdeu → cancela origem).
    is_procurement_lost: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Slug estável da etapa no funil Contratar (backlog|prospectar|aderencia|proposta|negociacao|concluido|cancelado).
    procurement_stage_key: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
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
    # Campo padrão "Anexos": lista de metadados de arquivos no storage
    # ([{object_name, filename, content_type, size}, ...]). Configurável como
    # campo de sistema, espelhando o campo "description".
    anexos: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    assigned_to: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)  # public.users.id
    # Classificação do item de planejamento criado por conversão: 'projeto' | 'programa' | NULL.
    planning_kind: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # Referência (somente etiqueta) a um Programa existente, escolhida na conversão. UUID sem FK.
    linked_program_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Classificação obrigatória ao sair do backlog: 'desenvolvimento' | 'implantacao' |
    # 'melhoria' | NULL. Define o vínculo exigido com o portfólio de PRODUTOS.
    card_classification: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Pergunta obrigatória na classificação (qualquer tipo): será feito com IA ou
    # auxílio de IA? True=sim · False=não · NULL=não respondido (cards legados).
    ia_assisted: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    # Vínculos cross-módulo com PRODUTOS — UUID SEM FK (padrão origin_task_id), preserva
    # o desacoplamento entre módulos. Produtos vive no mesmo schema de tenant.
    linked_product_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    linked_release_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Contratação (implantação/melhoria + produto sistema externo):
    # procurement_required = resposta "Será contratado?"; locked trava o card de origem.
    procurement_required: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    procurement_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    procurement_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    procurement_cancel_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Evidência de código na conclusão da US: ou existe commit vinculado
    # (project_task_commits), ou o dev justifica por que não há. Autor e data ficam
    # registrados para o apontamento ser auditável.
    commit_justificativa: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    commit_justificativa_por: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    commit_justificativa_em: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # Metadados do card Contratar: proposta, valor, fornecedor, contrato (anexo MinIO).
    procurement_meta: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    diretoria: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    area: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    start_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # Horas estimadas para a tarefa. Usadas para derivar a duração (em dias úteis)
    # e para a análise de superlotação (workload) por responsável.
    estimated_hours: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)
    # Horas realizadas e percentual de conclusão (0–100). Não afetam o agendamento.
    actual_hours: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)
    percent_complete: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Checklist de execução (somente User Story): [{id, label, done, order}, ...].
    # O percent_complete é derivado dos itens marcados.
    us_checklist: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    # Rollup de impedimento: True quando alguma US filha está numa etapa "Impedimento".
    # Mantido pela automação de reconcile (a Feature não tem coluna de Impedimento, então
    # sinaliza-se com um selo no card ao invés de mover).
    us_impediment_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Rollup: True quando alguma US filha está numa etapa "Code Review" (selo no card).
    us_codereview_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Transiente (não é coluna): nome de quem criou a solicitação de origem, preenchido por
    # ProjectTaskService._attach_requester_names. Default None garante from_attributes em toda rota.
    requester_name = None
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # Primeira saída de etapa is_initial (backlog) — só User Story; não sobrescreve.
    left_backlog_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # SLA: quando o card entrou na etapa atual + estado calculado pela rotina de SLA.
    status_entered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    sla_state: Mapped[str] = mapped_column(String(12), nullable=False, default="none")  # none|ok|warning|breached
    # Controle de baseline (só relevante no card-raiz de planejamento). Quando o projeto entra
    # em desenvolvimento (etapa locks_schedule), grava-se schedule_committed_at e o cronograma
    # passa a ser governado: edição só com baseline+justificativa (janela de revisão).
    schedule_committed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    schedule_revision_open: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
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
    priority_score: Mapped[Optional["ProjectPriorityScore"]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        uselist=False,
    )
    comments: Mapped[list["ProjectTaskComment"]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="ProjectTaskComment.created_at",
    )


class ProjectTaskDependency(TenantBase):
    """Dependência entre tarefas do cronograma. Suporta os 4 tipos do MS Project
    (FS/SS/FF/SF) com folga/antecipação (lag/lead) em HORAS úteis. Sem relationships
    (evita ambiguidade de self-FK como em parent_task); consultas via select() no service."""
    __tablename__ = "project_task_dependencies"
    __table_args__ = (
        UniqueConstraint("predecessor_id", "successor_id", name="uq_task_dep_pred_succ"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    predecessor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_tasks.id", ondelete="CASCADE"),
        nullable=False,
    )
    successor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_tasks.id", ondelete="CASCADE"),
        nullable=False,
    )
    dep_type: Mapped[str] = mapped_column(String(2), nullable=False, default="FS")  # FS|SS|FF|SF
    # Obsoleto (mantido por compat): a folga agora é em horas (lag_hours). Migrado no step de tenant.
    lag_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Folga/antecipação em horas úteis (aceita negativo = lead/antecipação).
    lag_hours: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProjectScheduleBaseline(TenantBase):
    """Linha de base (baseline) versionada do cronograma de um projeto-raiz. Cada registro é um
    snapshot imutável do cronograma ANTES de uma alteração, com a justificativa que abriu a
    janela de revisão. Forma o histórico de change-control do cronograma."""
    __tablename__ = "project_schedule_baselines"
    __table_args__ = (
        UniqueConstraint("root_task_id", "version", name="uq_schedule_baseline_root_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    root_task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    # {tasks: [{task_id,title,level,start_date,due_date,estimated_hours,percent_complete,status_name}],
    #  dependencies: [{predecessor_id,successor_id,dep_type,lag_hours}]}
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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


class ProjectTaskCommit(TenantBase):
    """Commit vinculado a uma User Story como evidência do código entregue.

    `commit_id` aponta para `repo_commits.id` (módulo Produtos) SEM foreign key — mesma
    convenção de `ProjectTask.linked_product_id`, que preserva o desacoplamento entre
    módulos. Um commit pode ser evidência de mais de uma US.
    """

    __tablename__ = "project_task_commits"
    __table_args__ = (UniqueConstraint("task_id", "commit_id", name="uq_project_task_commits"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    commit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    linked_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProjectTaskStatusHistory(TenantBase):
    """Timeline de movimentação entre raias (etapas) do kanban.

    Uma linha por mudança de status_id: quem arrastou, quando, de onde → para onde.
    Nomes denormalizados para a UI continuar legível se a raia for renomeada/apagada.
    """

    __tablename__ = "project_task_status_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_status_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    to_status_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    from_status_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    to_status_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    from_funnel_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    to_funnel_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    # public.users.id — null quando move automático (agente, reconcile, cascata).
    moved_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    moved_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    # user | automation | agent | reconcile | procurement | cascade | funnel_transition | system
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="user")


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
    # Controle de acesso por função (cargo) a este kanban. Mapa { "<role_id>": nível },
    # onde nível ∈ {"manage", "view", "none"}.
    #   manage = gerenciar cards (criar/mover/editar/excluir)
    #   view   = somente visualizar (board read-only)
    #   none   = sem acesso (kanban oculto)
    # Função ausente do mapa = "manage" (sem restrição, retrocompatível).
    # super_admin/company_admin sempre têm "manage". NULL/vazio = sem restrição.
    access_control: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Quando True + etapa inicial com classification_required, bloqueia saída do backlog
    # sem classificar. Desligado por padrão para permitir classificar projetos legados.
    classification_enforcement_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False,
    )
    # Funil dedicado ao fluxo de contratação (Backlog → … → Concluído/Cancelado).
    is_procurement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
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
    # Tipo usado pelo fluxo de contratação deste projeto (card no funil Contratar).
    is_procurement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
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


class ProjectStageAgentBinding(TenantBase):
    """Vínculo de um agente IDCortex a uma etapa (raia) do kanban.

    Quando um card entra na etapa, o runner chama o gateway /gateway/ask com
    o prompt configurado e registra a execução em project_agent_executions.
    """

    __tablename__ = "project_stage_agent_bindings"
    __table_args__ = (UniqueConstraint("status_id"),)

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
    status_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_status_configs.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    agent_kind: Mapped[str] = mapped_column(String(40), nullable=False, default=ProjectStageAgentKind.ASK.value)
    agent_id: Mapped[str] = mapped_column(String(120), nullable=False)
    usuario: Mapped[str] = mapped_column(String(255), nullable=False)
    prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    gateway_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    gateway_client_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    gateway_client_secret: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    continue_thread: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    add_comment_on_success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Raia de destino ao concluir (classify_and_advance). NULL = avança para a próxima etapa
    # do funil (comportamento padrão). UUID sem FK rígida para tolerar etapa removida.
    advance_to_status_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProjectAgentExecution(TenantBase):
    """Log de execução de um agente vinculado a uma etapa."""

    __tablename__ = "project_agent_executions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_tasks.id", ondelete="CASCADE"),
        nullable=False,
    )
    binding_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_stage_agent_bindings.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    thread_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    request_payload: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    response_payload: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    answer_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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


class ProjectCardField(TenantBase):
    """Layout do card no quadro: quais atributos aparecem, ordem e rótulo.
    Configurado POR KANBAN (funil). Aceita chaves do catálogo fixo (ex.: "title",
    "assignee") e chaves de campos personalizados do formulário da demanda, no
    formato "form:<field_key>" (ex.: "form:requisitante"). Visibilidade/ordem/rótulo
    são editáveis por funil."""

    __tablename__ = "project_card_fields"
    __table_args__ = (UniqueConstraint("funnel_id", "field_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    funnel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_funnels.id", ondelete="CASCADE"),
        nullable=False,
    )
    field_key: Mapped[str] = mapped_column(String(120), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─────────────────────────────────────────────
# Priorização: Matriz de Impacto × Esforço
# Toda a metodologia é configurável por tenant (critérios, pesos, rubrica,
# pilares, confiança, quadrantes e cortes) — nada hardcoded.
# ─────────────────────────────────────────────


class ProjectPriorityCriterion(TenantBase):
    """Critério de pontuação (eixo Impacto ou Esforço) com peso e rubrica 1/3/5."""

    __tablename__ = "project_priority_criteria"
    __table_args__ = (UniqueConstraint("axis", "code"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    axis: Mapped[str] = mapped_column(String(10), nullable=False)  # 'impact' | 'effort'
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str] = mapped_column(String(140), nullable=False)
    weight: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, default=0)
    # Escala configurável: lista de {"value": int, "description": str}.
    # Define quais valores existem e o texto exibido para cada um na triagem.
    scale: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProjectPriorityPillar(TenantBase):
    """Objetivo estratégico do Mapa (pilar) com perspectiva e modulador de criticidade."""

    __tablename__ = "project_priority_pillars"
    __table_args__ = (UniqueConstraint("code"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(8), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    perspective: Mapped[str] = mapped_column(String(60), nullable=False)
    modifier: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=1)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6B7280")
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProjectPriorityConfidenceLevel(TenantBase):
    """Nível de confiança da estimativa e divisor aplicado ao impacto."""

    __tablename__ = "project_priority_confidence_levels"
    __table_args__ = (UniqueConstraint("code"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    label: Mapped[str] = mapped_column(String(60), nullable=False)
    divisor: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=1)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProjectPriorityQuadrant(TenantBase):
    """Apresentação/ação de cada quadrante (quick_win/big_bet/fill_in/money_pit)."""

    __tablename__ = "project_priority_quadrants"
    __table_args__ = (UniqueConstraint("code"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6B7280")
    action_hint: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProjectPrioritySettings(TenantBase):
    """Configuração singleton da metodologia: cortes dos eixos e flag de habilitação."""

    __tablename__ = "project_priority_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    impact_cut: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=3)
    effort_cut: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=3)
    # Fator de Confiança da Estimativa é um parâmetro GLOBAL da metodologia
    # (definido aqui na config), aplicado a todas as demandas — não é preenchido
    # por demanda na triagem.
    confidence_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_priority_confidence_levels.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProjectPriorityScore(TenantBase):
    """Pontuação de uma demanda (1:1 com ProjectTask). Guarda os inputs brutos
    (JSONB por code) e os agregados materializados para ordenar/filtrar o backlog."""

    __tablename__ = "project_priority_scores"
    __table_args__ = (UniqueConstraint("task_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_tasks.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Pilar "primário" (maior modificador entre os selecionados) — mantido para
    # compatibilidade/join da matriz. A lista completa fica em `pillar_ids`.
    pillar_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_priority_pillars.id", ondelete="RESTRICT"),
        nullable=True,
    )
    # Pilares estratégicos selecionados (lista de UUIDs em texto). O modulador usa o
    # MAIOR modificador entre eles.
    pillar_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    confidence_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_priority_confidence_levels.id", ondelete="RESTRICT"),
        nullable=True,
    )
    impact_scores: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    effort_scores: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    impacto_bruto: Mapped[float] = mapped_column(Numeric(6, 3), nullable=False, default=0)
    modulador: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=1)
    divisor: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=1)
    impacto_efetivo: Mapped[float] = mapped_column(Numeric(6, 3), nullable=False, default=0, index=True)
    esforco: Mapped[float] = mapped_column(Numeric(6, 3), nullable=False, default=0, index=True)
    quadrant_code: Mapped[str] = mapped_column(String(20), nullable=False, default="fill_in", index=True)
    scored_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    scored_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    task: Mapped["ProjectTask"] = relationship(back_populates="priority_score")
    pillar: Mapped[Optional["ProjectPriorityPillar"]] = relationship()
    confidence: Mapped[Optional["ProjectPriorityConfidenceLevel"]] = relationship()


class ProjectPriorityScoreHistory(TenantBase):
    """Auditoria de repriorização: uma linha por salvamento de pontuação de uma demanda.
    Guarda o snapshot dos agregados para a timeline (quem repriorizou, quando, o quê)."""

    __tablename__ = "project_priority_score_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pillar_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    impact_scores: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    effort_scores: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    impacto_efetivo: Mapped[float] = mapped_column(Numeric(6, 3), nullable=False, default=0)
    esforco: Mapped[float] = mapped_column(Numeric(6, 3), nullable=False, default=0)
    quadrant_code: Mapped[str] = mapped_column(String(20), nullable=False, default="fill_in")
    scored_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    scored_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ProjectStatusReport(TenantBase):
    """Snapshot imutável de um Status Report por recorte (diretoria/área). Cada geração
    congela o estado atual dos projetos (JSON renderizável) + a narrativa do gestor, virando
    um ponto na série histórica daquele recorte. `kpis` guarda um resumo leve para a timeline
    sem carregar o snapshot inteiro."""

    __tablename__ = "project_status_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Recorte (código cru do campo do formulário). Null = "todas".
    diretoria: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    area: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    # Rótulos congelados no momento da geração (autocontido p/ exibição histórica).
    diretoria_label: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    area_label: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="Status Report")
    # Report inteiro renderizável (dados do estado atual + narrativa).
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Resumo leve p/ a lista da timeline (nº projetos, progresso médio, etc).
    kpis: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    generated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)



class ProjectProgram(TenantBase):
    """Cadastro próprio de Programas (catálogo do tenant), independente do kanban.
    Cards podem referenciar um programa via ProjectTask.linked_program_id."""

    __tablename__ = "project_programs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Responsável (PO) — pessoa do TeamOps.
    responsavel_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="SET NULL"), nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
