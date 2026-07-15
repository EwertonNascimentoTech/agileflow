import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

PriorityMode = Literal["edit", "view", "hidden"]

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.projetos.models import ProjectAutomationAction


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    owner_id: Optional[uuid.UUID] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    owner_id: Optional[uuid.UUID] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    is_active: Optional[bool] = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    owner_id: Optional[uuid.UUID]
    start_date: Optional[datetime]
    due_date: Optional[datetime]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectFunnelCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = None
    color: str = Field("#7C3AED", pattern=r"^#[0-9A-Fa-f]{6}$")
    order: int = Field(0, ge=0)
    is_default: bool = False
    is_active: bool = True
    allowed_demand_type_ids: Optional[list[uuid.UUID]] = None
    # Acesso por função (cargo): { "<role_id>": "manage" | "view" | "none" }.
    access_control: Optional[dict[str, str]] = None


class ProjectFunnelUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    description: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    order: Optional[int] = Field(None, ge=0)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    allowed_demand_type_ids: Optional[list[uuid.UUID]] = None
    access_control: Optional[dict[str, str]] = None
    classification_enforcement_enabled: Optional[bool] = None


class ProjectFunnelResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: Optional[str]
    color: str
    order: int
    is_default: bool
    is_active: bool
    allowed_demand_type_ids: Optional[list[uuid.UUID]] = None
    access_control: Optional[dict[str, str]] = None
    classification_enforcement_enabled: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectFunnelReorder(BaseModel):
    items: list[dict]


class ProjectDemandTypeCreate(BaseModel):
    slug: str = Field(..., min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
    name: str = Field(..., min_length=2, max_length=140)
    description: Optional[str] = None
    funnel_id: Optional[uuid.UUID] = None
    allowed_child_type_ids: Optional[list[uuid.UUID]] = None
    available_for_basic: bool = True
    show_in_schedule: bool = True
    order: int = Field(0, ge=0)
    is_active: bool = True


class ProjectDemandTypeUpdate(BaseModel):
    slug: Optional[str] = Field(None, min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
    name: Optional[str] = Field(None, min_length=2, max_length=140)
    description: Optional[str] = None
    funnel_id: Optional[uuid.UUID] = None
    allowed_child_type_ids: Optional[list[uuid.UUID]] = None
    available_for_basic: Optional[bool] = None
    show_in_schedule: Optional[bool] = None
    order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class ProjectDemandTypeFunnelRef(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class ProjectDemandTypeResponse(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: Optional[str]
    funnel_id: Optional[uuid.UUID]
    funnel: Optional[ProjectDemandTypeFunnelRef] = None
    allowed_child_type_ids: Optional[list[uuid.UUID]] = None
    available_for_basic: bool = True
    show_in_schedule: bool = True
    order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectDemandTypeReorder(BaseModel):
    items: list[dict]


class ProjectDemandFormSectionCreate(BaseModel):
    key: str = Field(..., min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
    title: str = Field(..., min_length=2, max_length=140)
    description: Optional[str] = None
    order: int = Field(0, ge=0)
    is_active: bool = True


class ProjectDemandFormSectionUpdate(BaseModel):
    key: Optional[str] = Field(None, min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
    title: Optional[str] = Field(None, min_length=2, max_length=140)
    description: Optional[str] = None
    order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class ProjectDemandFormSectionResponse(BaseModel):
    id: uuid.UUID
    demand_type_id: uuid.UUID
    key: str
    title: str
    description: Optional[str]
    order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectDemandFormSectionReorder(BaseModel):
    items: list[dict]


class ProjectDemandFormFieldCreate(BaseModel):
    field_key: str = Field(..., min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
    label: str = Field(..., min_length=1, max_length=140)
    field_type: str = Field("text", min_length=2, max_length=30)
    placeholder: Optional[str] = Field(None, max_length=200)
    options: Optional[dict] = None
    validation: Optional[dict] = None
    is_required: bool = False
    is_active: bool = True
    order: int = Field(0, ge=0)


class ProjectDemandFormFieldUpdate(BaseModel):
    field_key: Optional[str] = Field(None, min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
    label: Optional[str] = Field(None, min_length=1, max_length=140)
    field_type: Optional[str] = Field(None, min_length=2, max_length=30)
    placeholder: Optional[str] = Field(None, max_length=200)
    options: Optional[dict] = None
    validation: Optional[dict] = None
    is_required: Optional[bool] = None
    is_active: Optional[bool] = None
    order: Optional[int] = Field(None, ge=0)


class ProjectDemandFormFieldResponse(BaseModel):
    id: uuid.UUID
    section_id: uuid.UUID
    field_key: str
    label: str
    field_type: str
    placeholder: Optional[str]
    options: Optional[dict]
    validation: Optional[dict]
    is_required: bool
    is_active: bool
    order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectDemandFormFieldReorder(BaseModel):
    items: list[dict]


class ProjectStatusSectionLinkCreate(BaseModel):
    section_id: uuid.UUID
    mode: str = Field("visible", pattern=r"^(visible|editable|required|hidden)$")


class ProjectStatusSectionLinkResponse(BaseModel):
    id: uuid.UUID
    status_id: uuid.UUID
    section_id: uuid.UUID
    mode: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectStatusDefaultFormLinkCreate(BaseModel):
    field_key: str = Field(..., min_length=1, max_length=40)
    mode: str = Field("visible", pattern=r"^(visible|editable|required|hidden)$")


class ProjectStatusDefaultFormLinkResponse(BaseModel):
    id: uuid.UUID
    status_id: uuid.UUID
    field_key: str
    mode: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectDemandFormSubmissionUpsert(BaseModel):
    values: dict


class ProjectDemandFormSubmissionResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    values: dict
    updated_by: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectUploadResponse(BaseModel):
    """Metadados de um arquivo enviado (campo de formulário do tipo anexo)."""
    object_name: str
    filename: str
    content_type: str
    size: int


class ProjectUploadUrlResponse(BaseModel):
    url: str


class ProjectStatusCreate(BaseModel):
    funnel_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field("#6B7280", pattern=r"^#[0-9A-Fa-f]{6}$")
    order: int = Field(0, ge=0)
    is_initial: bool = False
    is_final: bool = False
    is_active: bool = True
    creates_demand_type_id: Optional[uuid.UUID] = None
    moves_to_funnel_id: Optional[uuid.UUID] = None
    updates_origin_status_id: Optional[uuid.UUID] = None
    move_in_role_ids: Optional[list[uuid.UUID]] = None
    move_out_role_ids: Optional[list[uuid.UUID]] = None
    sla_hours: Optional[int] = Field(None, ge=1)
    sla_warning_pct: int = Field(80, ge=1, le=100)
    priority_mode: PriorityMode = "edit"
    priority_required: bool = False
    classification_required: bool = False
    cascade_children_on_move: bool = False
    children_to_funnel_id: Optional[uuid.UUID] = None
    grandchildren_to_funnel_id: Optional[uuid.UUID] = None
    locks_schedule: bool = False


class ProjectStatusUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    order: Optional[int] = Field(None, ge=0)
    is_initial: Optional[bool] = None
    is_final: Optional[bool] = None
    is_active: Optional[bool] = None
    creates_demand_type_id: Optional[uuid.UUID] = None
    moves_to_funnel_id: Optional[uuid.UUID] = None
    updates_origin_status_id: Optional[uuid.UUID] = None
    move_in_role_ids: Optional[list[uuid.UUID]] = None
    move_out_role_ids: Optional[list[uuid.UUID]] = None
    sla_hours: Optional[int] = Field(None, ge=1)
    sla_warning_pct: Optional[int] = Field(None, ge=1, le=100)
    priority_mode: Optional[PriorityMode] = None
    priority_required: Optional[bool] = None
    classification_required: Optional[bool] = None
    cascade_children_on_move: Optional[bool] = None
    children_to_funnel_id: Optional[uuid.UUID] = None
    grandchildren_to_funnel_id: Optional[uuid.UUID] = None
    locks_schedule: Optional[bool] = None


class ProjectStatusReorder(BaseModel):
    items: list[dict]


class ProjectStatusResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    funnel_id: uuid.UUID
    name: str
    color: str
    order: int
    is_initial: bool
    is_final: bool
    is_active: bool
    creates_demand_type_id: Optional[uuid.UUID] = None
    moves_to_funnel_id: Optional[uuid.UUID] = None
    updates_origin_status_id: Optional[uuid.UUID] = None
    move_in_role_ids: Optional[list[uuid.UUID]] = None
    move_out_role_ids: Optional[list[uuid.UUID]] = None
    sla_hours: Optional[int] = None
    sla_warning_pct: int = 80
    priority_mode: PriorityMode = "edit"
    priority_required: bool = False
    classification_required: bool = False
    cascade_children_on_move: bool = False
    children_to_funnel_id: Optional[uuid.UUID] = None
    grandchildren_to_funnel_id: Optional[uuid.UUID] = None
    locks_schedule: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskImportResult(BaseModel):
    """Resultado da importação de Features/US por planilha."""
    features_created: int = 0
    us_created: int = 0
    skipped: int = 0
    warnings: list[str] = Field(default_factory=list)


class UsChecklistItem(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=300)
    done: bool = False
    order: int = Field(0, ge=0)


class ProjectTaskCreate(BaseModel):
    status_id: uuid.UUID
    demand_type_id: Optional[uuid.UUID] = None
    parent_task_id: Optional[uuid.UUID] = None
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    anexos: Optional[list] = None
    assigned_to: Optional[uuid.UUID] = None
    diretoria: Optional[str] = Field(None, max_length=120)
    area: Optional[str] = Field(None, max_length=120)
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    estimated_hours: Optional[Decimal] = Field(None, ge=0)
    actual_hours: Optional[Decimal] = Field(None, ge=0)
    percent_complete: int = Field(0, ge=0, le=100)
    order: int = Field(0, ge=0)
    form_values: Optional[dict] = None


class ConversionItem(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None


class ScheduleStageCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None


class ProjectTaskReorder(BaseModel):
    items: list[dict]  # [{id, order}] — reordena irmãos (mesmo pai) no cronograma


class ProjectTaskUpdate(BaseModel):
    status_id: Optional[uuid.UUID] = None
    demand_type_id: Optional[uuid.UUID] = None
    parent_task_id: Optional[uuid.UUID] = None
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    anexos: Optional[list] = None
    assigned_to: Optional[uuid.UUID] = None
    diretoria: Optional[str] = Field(None, max_length=120)
    area: Optional[str] = Field(None, max_length=120)
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    estimated_hours: Optional[Decimal] = Field(None, ge=0)
    actual_hours: Optional[Decimal] = Field(None, ge=0)
    percent_complete: Optional[int] = Field(None, ge=0, le=100)
    us_checklist: Optional[list[UsChecklistItem]] = None
    order: Optional[int] = Field(None, ge=0)
    form_values: Optional[dict] = None
    # Nome do card a ser criado por conversão nesta troca de status (não é persistido
    # no card atual). Se vazio, a conversão copia o título do card de origem.
    conversion_title: Optional[str] = Field(None, min_length=2, max_length=200)
    # Classificação do item de planejamento criado na conversão.
    conversion_kind: Optional[Literal["projeto", "programa"]] = None
    # Descrição do Projeto (kind=projeto) ou do Programa (kind=programa).
    conversion_description: Optional[str] = None
    # Itens do Programa (kind=programa): cada um vira um card filho do Programa.
    conversion_items: Optional[list[ConversionItem]] = None
    # PO responsável pelo item de planejamento criado na conversão.
    conversion_assigned_to: Optional[uuid.UUID] = None
    # Programa existente a ser referenciado (kind=programa, modo "vincular"). None = criar novo.
    conversion_program_id: Optional[uuid.UUID] = None
    # Classificação exigida ao sair do backlog + vínculo com o portfólio de PRODUTOS.
    card_classification: Optional[Literal["desenvolvimento", "implantacao", "melhoria"]] = None
    linked_product_id: Optional[uuid.UUID] = None
    linked_release_id: Optional[uuid.UUID] = None


class PlanningClassificationUpdate(BaseModel):
    """Edição da classificação Projeto/Programa a partir do card de origem (ex.: etapa
    "Concluído" da prospecção). Propaga ao card de planejamento convertido."""
    kind: Literal["projeto", "programa"]
    # Programa existente a vincular (kind=programa). None + new_program_name = cadastrar novo.
    program_id: Optional[uuid.UUID] = None
    new_program_name: Optional[str] = Field(None, min_length=2, max_length=200)
    new_program_desc: Optional[str] = None


class ProjectTaskResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    status_id: uuid.UUID
    demand_type_id: Optional[uuid.UUID]
    parent_task_id: Optional[uuid.UUID]
    origin_task_id: Optional[uuid.UUID]
    title: str
    description: Optional[str]
    anexos: Optional[list] = None
    assigned_to: Optional[uuid.UUID]
    planning_kind: Optional[str] = None
    linked_program_id: Optional[uuid.UUID] = None
    card_classification: Optional[str] = None
    linked_product_id: Optional[uuid.UUID] = None
    linked_release_id: Optional[uuid.UUID] = None
    diretoria: Optional[str]
    area: Optional[str]
    start_date: Optional[datetime]
    due_date: Optional[datetime]
    estimated_hours: Optional[Decimal] = None
    actual_hours: Optional[Decimal] = None
    percent_complete: int = 0
    us_checklist: Optional[list] = None
    # Rollups das US filhas (usados pelos selos no card da Feature).
    us_impediment_active: bool = False
    us_codereview_active: bool = False
    order: int
    created_by: Optional[uuid.UUID]
    completed_at: Optional[datetime]
    left_backlog_at: Optional[datetime] = None
    status_entered_at: Optional[datetime] = None
    sla_state: str = "none"
    # Controle de baseline (só relevante no card-raiz de planejamento).
    schedule_committed_at: Optional[datetime] = None
    schedule_revision_open: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskDependencyCreate(BaseModel):
    predecessor_id: uuid.UUID
    successor_id: uuid.UUID
    dep_type: Literal["FS", "SS", "FF", "SF"] = "FS"
    # Folga/antecipação em HORAS úteis (aceita negativo = lead/antecipação).
    lag_hours: Decimal = Field(Decimal(0))

    @model_validator(mode="after")
    def _distinct(self):
        if self.predecessor_id == self.successor_id:
            raise ValueError("Uma tarefa não pode depender de si mesma.")
        return self


class TaskDependencyResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    predecessor_id: uuid.UUID
    successor_id: uuid.UUID
    dep_type: str
    lag_hours: Decimal = Decimal(0)
    created_at: datetime

    model_config = {"from_attributes": True}


class CriticalPathItem(BaseModel):
    task_id: uuid.UUID
    is_critical: bool
    total_float_hours: float
    free_float_hours: float
    late_start: datetime
    late_finish: datetime


# ── Controle de baseline / travamento do cronograma ──
class ScheduleBaselineCreateIn(BaseModel):
    root_task_id: uuid.UUID
    justification: str = Field(..., min_length=3, max_length=2000)


class ScheduleRevisionCloseIn(BaseModel):
    root_task_id: uuid.UUID


class ScheduleBaselineResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    root_task_id: uuid.UUID
    version: int
    justification: str
    snapshot: dict
    created_by: Optional[uuid.UUID] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScheduleLockState(BaseModel):
    root_task_id: uuid.UUID
    root_title: Optional[str] = None
    state: Literal["open", "locked", "revision"]
    committed_at: Optional[datetime] = None
    revision_open: bool = False
    baseline_count: int = 0
    latest_version: Optional[int] = None


class WorkloadCellItem(BaseModel):
    """Uma demanda (tarefa) que compõe a carga daquele dia — para o tooltip do heatmap."""
    project_name: str
    task_title: str
    hours: float


class WorkloadCell(BaseModel):
    user_id: uuid.UUID
    date: date
    allocated_hours: float
    capacity_hours: float
    overallocated: bool
    items: list[WorkloadCellItem] = []   # detalhamento projeto/demanda × horas no dia


class WorkloadResponse(BaseModel):
    unit: Literal["day", "week"]
    cells: list[WorkloadCell]


# ── Cockpit de capacidade (cross-project) ──
class CapacityPersonMeta(BaseModel):
    """Metadados da pessoa presentes no heatmap, para o front não precisar casar com listPersons."""
    id: uuid.UUID
    full_name: str
    position_slug: Optional[str] = None
    position_label: Optional[str] = None
    area_ids: list[uuid.UUID] = []


class CapacitySummary(BaseModel):
    overallocated_cells: int
    persons_over: int
    total_capacity_h: float
    total_allocated_h: float
    # assigned_to (person_id) que têm alocação mas nenhuma Person correspondente no teamops.
    unmapped_assignees: list[str] = []


class CapacityHeatmapResponse(BaseModel):
    """Lente por pessoa: sobrecarga pessoa×dia cruzando TODO o portfólio."""
    unit: Literal["day", "week"]
    cells: list[WorkloadCell]
    persons: list[CapacityPersonMeta]
    summary: CapacitySummary


class CapacityProjectRow(BaseModel):
    project_id: uuid.UUID
    project_name: str
    demand_hours: float          # horas estimadas deste projeto na janela
    capacity_hours: float        # capacidade total (janela) das pessoas alocadas — compartilhada entre projetos
    people_count: int
    overloaded_people: int       # pessoas deste projeto sobrecarregadas (global) em algum dia que trabalham nele
    overallocated: bool          # a demanda deste projeto sozinha já excede a capacidade das suas pessoas


class CapacityByProjectResponse(BaseModel):
    """Lente por projeto (viabilidade): demanda × capacidade das pessoas alocadas."""
    rows: list[CapacityProjectRow]


# ── Fase 1: gargalos/contratação e finder de pessoas livres ──
class CapacityGapRow(BaseModel):
    group_type: Literal["position", "area"]
    group_key: str
    group_label: str
    people_count: int
    capacity_hours: float
    allocated_hours: float
    deficit_hours: float          # soma dos déficits semanais positivos na janela
    peak_week: Optional[str] = None   # segunda-feira da semana de pior déficit
    peak_deficit_hours: float
    suggested_headcount: int      # reforço sugerido (freela/contratação) p/ cobrir o pico


class CapacityGapsResponse(BaseModel):
    rows: list[CapacityGapRow]


class FreePersonRow(BaseModel):
    person_id: uuid.UUID
    full_name: str
    position_slug: Optional[str] = None
    position_label: Optional[str] = None
    area_ids: list[uuid.UUID] = []
    stacks: list[str] = []              # competências (nomes) para o PO ver o fit
    capacity_hours_total: float
    allocated_hours_total: float
    free_hours_total: float            # folga de capacidade no período
    free_days: int                     # dias úteis com alguma folga
    utilization_pct: float
    next_absence: Optional[str] = None # próxima ausência que afeta capacidade


class FreePeopleResponse(BaseModel):
    rows: list[FreePersonRow]


# ── Fase 2: simulador de cenários (what-if efêmero) ──
class SimTaskMeta(BaseModel):
    """Tarefa agendada na janela, para alimentar o construtor de mutações do simulador."""
    task_id: uuid.UUID
    title: str
    project_name: str
    assigned_to: Optional[uuid.UUID] = None
    assignee_name: Optional[str] = None
    start_date: date
    due_date: date
    estimated_hours: float


class SimTasksResponse(BaseModel):
    tasks: list[SimTaskMeta]


class ScenarioMutation(BaseModel):
    op: Literal["move_task", "reassign", "scale_hours", "remove_person", "add_freelancer"]
    # move_task
    task_id: Optional[uuid.UUID] = None
    new_start: Optional[date] = None
    new_due: Optional[date] = None
    # reassign
    new_person_id: Optional[uuid.UUID] = None
    # scale_hours
    factor: Optional[float] = None
    # remove_person (simula férias/saída)
    person_id: Optional[uuid.UUID] = None
    # add_freelancer (pessoa virtual)
    freelancer_name: Optional[str] = None
    daily_hours: Optional[float] = None
    assign_task_ids: list[uuid.UUID] = []


class ScenarioRequest(BaseModel):
    date_from: date
    date_to: date
    mutations: list[ScenarioMutation] = []


class ScenarioDiff(BaseModel):
    before_over_cells: int
    after_over_cells: int
    before_persons_over: int
    after_persons_over: int
    resolved_cells: int   # estavam em sobrecarga antes e não estão depois
    new_cells: int        # não estavam em sobrecarga antes e passaram a estar
    before_allocated_h: float
    after_allocated_h: float
    before_capacity_h: float
    after_capacity_h: float


class ScenarioResult(BaseModel):
    """Comparação antes/depois — efêmero, nada é persistido."""
    before: CapacityHeatmapResponse
    after: CapacityHeatmapResponse
    diff: ScenarioDiff


# ── Simulador inteligente: cenários auto-gerados ──
class SuggestedScenario(BaseModel):
    id: str
    title: str
    description: str
    kind: Literal["reassign", "freelancer", "defer", "combo"]
    cost_tag: Literal["gratis", "custo", "prazo"]
    target_person_name: Optional[str] = None   # quem o cenário ajuda (pessoa sobrecarregada)
    mutations: list[ScenarioMutation]
    resolved_cells: int
    new_cells: int
    before_over_cells: int
    after_over_cells: int
    persons_over_before: int
    persons_over_after: int


class ScenarioSuggestionsResponse(BaseModel):
    has_overload: bool
    rows: list[SuggestedScenario]


# ── Vazamento entre times (cross-team) ──
class CrossTeamAwayItem(BaseModel):
    team_area_id: Optional[uuid.UUID] = None
    team_name: str
    hours: float


class CrossTeamPersonRow(BaseModel):
    person_id: uuid.UUID
    full_name: str
    position_label: Optional[str] = None
    home_area_ids: list[uuid.UUID] = []
    home_area_names: list[str] = []
    home_hours: float
    away_hours: float
    undefined_hours: float           # horas em cards sem PO/área resolvível
    total_hours: float
    away_pct: float                  # away / total (0..100)
    at_risk: bool                    # away_hours > home_hours
    away_by_team: list[CrossTeamAwayItem] = []


class CrossTeamResponse(BaseModel):
    rows: list[CrossTeamPersonRow]


class AssigneeAbsenceItem(BaseModel):
    """Ausência (APROVADA) de um responsável, para sinalizar risco no cronograma."""
    start_date: date
    end_date: date
    type_name: str
    status: str
    partial_hours: Optional[float] = None


class AssigneeAbsencesResponse(BaseModel):
    # Mapa chaveado por assigned_to (public.users.id em string) → ausências futuras.
    by_user: dict[str, list[AssigneeAbsenceItem]]


class PendingStageItem(BaseModel):
    """Uma etapa em aberto (card que ainda não chegou à etapa final): kanban + etapa + desde quando."""
    funnel_name: str
    status_name: str
    status_entered_at: Optional[datetime] = None


class PoPortfolioItem(BaseModel):
    """Um projeto/programa do PO, com prioridade + sinais de risco/gargalo/previsibilidade."""
    task_id: uuid.UUID
    title: str
    project_id: uuid.UUID
    planning_kind: str
    # Dados da solicitação (para exibir no modal de repriorização).
    description: Optional[str] = None
    demand_type_id: Optional[uuid.UUID] = None
    # Datas do root (para "Próximos a iniciar" e "Próximas entregas").
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    next_due_date: Optional[datetime] = None
    # Kanbans/etapas ainda em aberto (não chegaram à etapa final) — detalhe do tooltip.
    pending_stages: list[PendingStageItem] = Field(default_factory=list)
    # Prioridade (do score; None se não pontuado)
    quadrant_code: Optional[str] = None
    impacto_efetivo: Optional[float] = None
    esforco: Optional[float] = None
    # Densidade de valor (impacto ÷ esforço); None se sem score ou esforço 0.
    priority_rank: Optional[float] = None
    pillar_code: Optional[str] = None
    perspective: Optional[str] = None
    color: Optional[str] = None
    # Progresso (rollup da subárvore)
    progress_pct: int
    expected_progress_pct: Optional[int] = None
    subtree_total: int
    subtree_completed: int
    # Riscos
    overdue: bool
    breached_count: int
    absence_conflict: bool
    unscored: bool
    no_due_date: bool
    # Gargalos
    critical_count: int
    blocked_count: int
    overallocated_users: list[uuid.UUID]
    # Previsibilidade
    on_time_completed: int
    completed_count: int
    est_hours: float
    actual_hours: float
    avg_lead_time_days: Optional[float] = None
    # Saúde sintetizada
    health: Literal["verde", "amarelo", "vermelho"]


class PoPortfolioAggregates(BaseModel):
    rag: dict[str, int]
    total_projetos: int
    total_programas: int
    on_time_pct: Optional[float] = None
    avg_progress_pct: Optional[float] = None
    capacity_vs_demand: dict[str, float]


class PoPortfolioResponse(BaseModel):
    po_id: Optional[uuid.UUID] = None  # None = portfólio consolidado de todos os POs
    items: list[PoPortfolioItem]
    aggregates: PoPortfolioAggregates
    available_diretorias: list[str] = Field(default_factory=list)
    available_areas: list[str] = Field(default_factory=list)


class PoOption(BaseModel):
    """Um PO para o seletor do painel. has_login=False → ainda não pode possuir projetos."""
    person_id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    full_name: str
    has_login: bool


class PoOverviewItem(BaseModel):
    """Linha do modo gestão: agregados do portfólio de um PO."""
    po_id: uuid.UUID
    full_name: str
    total_projetos: int
    total_programas: int
    rag: dict[str, int]
    on_time_pct: Optional[float] = None
    avg_progress_pct: Optional[float] = None
    overallocated_user_days: int


class PoOverviewResponse(BaseModel):
    """Modo gestão: linhas por PO + opções de filtro (diretoria/área) do tenant."""
    items: list[PoOverviewItem]
    available_diretorias: list[str] = Field(default_factory=list)
    available_areas: list[str] = Field(default_factory=list)


class ProjectRefMini(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class ProjectStatusMini(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    order: int

    model_config = {"from_attributes": True}


class ProjectDemandTypeMini(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class ProjectTaskWithContextResponse(ProjectTaskResponse):
    project: ProjectRefMini
    status: ProjectStatusMini
    demand_type: Optional[ProjectDemandTypeMini] = None

    model_config = {"from_attributes": True}


class ProjectMyRequestStage(BaseModel):
    """Etapa do fluxo por kanban (funil) para o reporte de andamento."""

    label: str
    funnel_id: uuid.UUID
    funnel_order: int = 0
    task: Optional[ProjectTaskWithContextResponse] = None
    is_complete: bool = False
    is_current: bool = False
    is_pending: bool = False

    model_config = {"from_attributes": True}


class ProjectMyRequestResponse(ProjectTaskWithContextResponse):
    """Solicitação raiz (criada pelo usuário) com itens/filhos vinculados para acompanhamento."""

    children: list[ProjectTaskWithContextResponse] = Field(default_factory=list)
    stages: list[ProjectMyRequestStage] = Field(default_factory=list)
    origin_request_id: Optional[uuid.UUID] = None

    model_config = {"from_attributes": True}


class ProjectTaskCommentCreate(BaseModel):
    content: str = Field(..., min_length=1)


class ProjectTaskCommentResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    author_id: Optional[uuid.UUID]
    author_name: Optional[str] = None
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectMemberCreate(BaseModel):
    user_id: uuid.UUID
    role: str = Field("member", max_length=30)


class ProjectMemberResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# Automação por etapa
# ─────────────────────────────────────────────


class ProjectAutomationRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=140)
    action: ProjectAutomationAction
    action_config: Optional[dict] = None
    order: int = Field(0, ge=0)
    is_active: bool = True


class ProjectAutomationRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=140)
    action: Optional[ProjectAutomationAction] = None
    action_config: Optional[dict] = None
    order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class ProjectAutomationRuleResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    status_id: uuid.UUID
    name: str
    trigger: str
    action: ProjectAutomationAction
    action_config: Optional[dict]
    order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# Relatórios
# ─────────────────────────────────────────────


class ReportStageRow(BaseModel):
    funnel_id: Optional[uuid.UUID]
    funnel_name: str
    status_id: Optional[uuid.UUID]
    status_name: str
    status_color: str
    count: int


class ReportAssigneeRow(BaseModel):
    user_id: Optional[uuid.UUID]
    active: int
    overdue: int


class ReportTypeRow(BaseModel):
    type_id: Optional[uuid.UUID]
    type_name: str
    count: int


class ReportSlaSummary(BaseModel):
    ok: int
    warning: int
    breached: int
    none: int
    overdue: int


class ReportThroughputMonth(BaseModel):
    month: str
    count: int


class ReportThroughput(BaseModel):
    by_month: list[ReportThroughputMonth]
    completed_total: int
    avg_lead_time_days: Optional[float]


class ProjectReportsResponse(BaseModel):
    total_active: int
    total_completed: int
    by_stage: list[ReportStageRow]
    by_assignee: list[ReportAssigneeRow]
    by_type: list[ReportTypeRow]
    sla: ReportSlaSummary
    throughput: ReportThroughput
    available_diretorias: list[str] = Field(default_factory=list)
    available_areas: list[str] = Field(default_factory=list)


# ─────────────────────────────────────────────
# Relatório de entregas US por responsável
# ─────────────────────────────────────────────

UsDeliveryPeriod = Literal[
    "today", "tomorrow", "this_week", "next_week", "this_month", "next_month"
]


class UsDeliveryItem(BaseModel):
    id: uuid.UUID
    title: str
    project_id: uuid.UUID
    assigned_to: Optional[uuid.UUID] = None
    due_date: Optional[datetime] = None
    left_backlog_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    is_overdue: bool = False


class UsDeliveryAssigneeGroup(BaseModel):
    assignee_id: Optional[uuid.UUID] = None
    assignee_name: str
    delivered: list[UsDeliveryItem] = Field(default_factory=list)
    overdue: list[UsDeliveryItem] = Field(default_factory=list)
    delivered_count: int = 0
    overdue_count: int = 0


class UsDeliveryReportResponse(BaseModel):
    period: UsDeliveryPeriod
    range_start: datetime
    range_end: datetime
    by_assignee: list[UsDeliveryAssigneeGroup]
    available_assignees: list[dict] = Field(default_factory=list)


# ─────────────────────────────────────────────
# Cronograma: vínculos fluxo + etapa
# ─────────────────────────────────────────────


class ProjectScheduleBindingItem(BaseModel):
    funnel_id: uuid.UUID
    status_id: uuid.UUID
    require_fill: bool = True
    is_active: bool = True


class ProjectScheduleBindingsUpsert(BaseModel):
    bindings: list[ProjectScheduleBindingItem]


class ProjectScheduleBindingResponse(BaseModel):
    id: uuid.UUID
    funnel_id: uuid.UUID
    status_id: uuid.UUID
    require_fill: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# Agentes IDCortex por etapa
# ─────────────────────────────────────────────


class ProjectStageAgentBindingCreate(BaseModel):
    project_id: uuid.UUID
    funnel_id: uuid.UUID
    status_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=140)
    agent_kind: str = Field("ask", pattern=r"^(ask|classify_and_advance)$")
    # agent_id = ID do agente (assistant) do Azure AI Foundry.
    agent_id: str = Field(..., min_length=1, max_length=120)
    prompt_template: str = Field(..., min_length=1)
    # Campos abaixo: legado (auth/endpoint do Azure vêm do .env). Mantidos opcionais.
    usuario: str = Field("", max_length=255)
    gateway_url: Optional[str] = Field(None, max_length=500)
    gateway_client_id: Optional[str] = Field(None, max_length=255)
    gateway_client_secret: Optional[str] = Field(None, max_length=255)
    continue_thread: bool = False
    add_comment_on_success: bool = True
    # Raia de destino ao concluir (classify_and_advance). None = próxima etapa do funil.
    advance_to_status_id: Optional[uuid.UUID] = None
    is_active: bool = True


class ProjectStageAgentBindingUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=140)
    agent_kind: Optional[str] = Field(None, pattern=r"^(ask|classify_and_advance)$")
    agent_id: Optional[str] = Field(None, min_length=1, max_length=120)
    usuario: Optional[str] = Field(None, max_length=255)
    prompt_template: Optional[str] = Field(None, min_length=1)
    gateway_url: Optional[str] = Field(None, max_length=500)
    gateway_client_id: Optional[str] = Field(None, max_length=255)
    gateway_client_secret: Optional[str] = Field(None, max_length=255)
    continue_thread: Optional[bool] = None
    add_comment_on_success: Optional[bool] = None
    advance_to_status_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class ProjectStageAgentBindingResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    funnel_id: uuid.UUID
    status_id: uuid.UUID
    name: str
    agent_kind: str
    agent_id: str
    usuario: str
    prompt_template: str
    gateway_url: Optional[str]
    gateway_client_id: Optional[str]
    has_gateway_client_secret: bool = False
    continue_thread: bool
    add_comment_on_success: bool
    advance_to_status_id: Optional[uuid.UUID] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProjectAgentExecutionResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    binding_id: uuid.UUID
    status: str
    thread_id: Optional[str]
    answer_message: Optional[str]
    error_message: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectAgentExecutionLogItem(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    task_title: str
    binding_id: uuid.UUID
    agent_name: str
    agent_kind: str
    status_name: str
    status: str
    thread_id: Optional[str]
    answer_message: Optional[str]
    error_message: Optional[str]
    request_payload: Optional[dict] = None
    response_payload: Optional[dict] = None
    created_at: datetime


class ProjectAgentExecutionLogPage(BaseModel):
    items: list[ProjectAgentExecutionLogItem]
    total: int
    limit: int
    offset: int


# ─────────────────────────────────────────────
# Formulário padrão de demandas
# ─────────────────────────────────────────────


class ProjectDefaultFormFieldResponse(BaseModel):
    id: uuid.UUID
    field_key: str
    label: str
    field_type: str
    options: Optional[dict] = None
    is_visible: bool
    is_required: bool
    order: int
    is_system: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectDefaultFormFieldUpdateItem(BaseModel):
    field_key: str = Field(..., min_length=1, max_length=40)
    label: str = Field(..., min_length=1, max_length=120)
    field_type: str = Field("text", min_length=1, max_length=30)
    options: Optional[dict] = None
    is_visible: bool = True
    is_required: bool = False
    order: int = Field(0, ge=0)


class ProjectDefaultFormFieldsUpdate(BaseModel):
    fields: list[ProjectDefaultFormFieldUpdateItem]


# ─────────────────────────────────────────────
# Layout do card (quadro)
# ─────────────────────────────────────────────


class ProjectCardFieldItem(BaseModel):
    field_key: str = Field(..., min_length=1, max_length=120)
    label: str = Field(..., min_length=1, max_length=120)
    is_visible: bool = True
    order: int = Field(0, ge=0)


class ProjectCardFieldsUpdate(BaseModel):
    fields: list[ProjectCardFieldItem]


class ProjectCardFieldResponse(BaseModel):
    id: uuid.UUID
    funnel_id: uuid.UUID
    field_key: str
    label: str
    is_visible: bool
    order: int

    model_config = {"from_attributes": True}


class ProjectCardAvailableField(BaseModel):
    """Campo personalizado do formulário disponível para incluir no layout do card.
    `field_key` é a chave bruta (ex.: "requisitante"); no layout vira "form:<field_key>"."""
    field_key: str
    label: str
    field_type: str


# ─────────────────────────────────────────────
# Priorização: Matriz de Impacto × Esforço
# ─────────────────────────────────────────────

_VALID_AXES = {"impact", "effort"}
_VALID_QUADRANTS = {"quick_win", "big_bet", "fill_in", "money_pit"}


class PriorityScalePoint(BaseModel):
    value: int = Field(..., ge=0, le=100)
    description: str = ""


class PriorityCriterionItem(BaseModel):
    axis: str
    code: str = Field(..., min_length=1, max_length=40)
    label: str = Field(..., min_length=1, max_length=140)
    weight: float = Field(..., ge=0, le=1)
    scale: list[PriorityScalePoint] = Field(default_factory=list)
    order: int = Field(0, ge=0)
    is_active: bool = True

    @field_validator("axis")
    @classmethod
    def _axis_valid(cls, v: str) -> str:
        if v not in _VALID_AXES:
            raise ValueError("axis deve ser 'impact' ou 'effort'")
        return v


class PriorityCriteriaUpsert(BaseModel):
    criteria: list[PriorityCriterionItem]

    @model_validator(mode="after")
    def _weights_sum_to_one(self):
        for axis in _VALID_AXES:
            total = sum(c.weight for c in self.criteria if c.axis == axis and c.is_active)
            # só valida se há critérios ativos naquele eixo
            if any(c.axis == axis and c.is_active for c in self.criteria) and abs(total - 1.0) > 0.001:
                raise ValueError(
                    f"A soma dos pesos do eixo '{axis}' deve ser 100% (atual: {round(total * 100, 2)}%)."
                )
        return self


class PriorityCriterionResponse(BaseModel):
    id: uuid.UUID
    axis: str
    code: str
    label: str
    weight: float
    scale: list[PriorityScalePoint] = Field(default_factory=list)
    order: int
    is_active: bool

    model_config = {"from_attributes": True}


class PriorityPillarItem(BaseModel):
    code: str = Field(..., min_length=1, max_length=8)
    label: str = Field(..., min_length=1, max_length=200)
    perspective: str = Field(..., min_length=1, max_length=60)
    modifier: float = Field(1.0, ge=0, le=5)
    color: str = Field("#6B7280", max_length=7)
    order: int = Field(0, ge=0)
    is_active: bool = True


class PriorityPillarsUpsert(BaseModel):
    pillars: list[PriorityPillarItem]


class PriorityPillarResponse(BaseModel):
    id: uuid.UUID
    code: str
    label: str
    perspective: str
    modifier: float
    color: str
    order: int
    is_active: bool

    model_config = {"from_attributes": True}


class PriorityConfidenceItem(BaseModel):
    code: str = Field(..., min_length=1, max_length=20)
    label: str = Field(..., min_length=1, max_length=60)
    divisor: float = Field(1.0, gt=0, le=10)
    order: int = Field(0, ge=0)
    is_active: bool = True


class PriorityConfidenceUpsert(BaseModel):
    levels: list[PriorityConfidenceItem]


class PriorityConfidenceResponse(BaseModel):
    id: uuid.UUID
    code: str
    label: str
    divisor: float
    order: int
    is_active: bool

    model_config = {"from_attributes": True}


class PriorityQuadrantItem(BaseModel):
    code: str
    label: str = Field(..., min_length=1, max_length=80)
    color: str = Field("#6B7280", max_length=7)
    action_hint: Optional[str] = None
    order: int = Field(0, ge=0)

    @field_validator("code")
    @classmethod
    def _code_valid(cls, v: str) -> str:
        if v not in _VALID_QUADRANTS:
            raise ValueError(f"code de quadrante inválido: {v}")
        return v


class PriorityQuadrantsUpsert(BaseModel):
    quadrants: list[PriorityQuadrantItem]


class PriorityQuadrantResponse(BaseModel):
    id: uuid.UUID
    code: str
    label: str
    color: str
    action_hint: Optional[str] = None
    order: int

    model_config = {"from_attributes": True}


class PrioritySettingsUpdate(BaseModel):
    impact_cut: float = Field(..., ge=1, le=5)
    effort_cut: float = Field(..., ge=1, le=5)
    confidence_id: Optional[uuid.UUID] = None
    is_enabled: bool = True


class PrioritySettingsResponse(BaseModel):
    id: uuid.UUID
    impact_cut: float
    effort_cut: float
    confidence_id: Optional[uuid.UUID] = None
    is_enabled: bool

    model_config = {"from_attributes": True}


class PriorityScoreInput(BaseModel):
    # Lista de pilares estratégicos. `pillar_id` é legado (1 pilar) e ainda aceito.
    pillar_ids: list[uuid.UUID] = Field(default_factory=list)
    pillar_id: Optional[uuid.UUID] = None
    impact_scores: dict[str, int] = Field(default_factory=dict)
    effort_scores: dict[str, int] = Field(default_factory=dict)

    @property
    def effective_pillar_ids(self) -> list[uuid.UUID]:
        if self.pillar_ids:
            # Remove duplicados preservando a ordem.
            seen: set[uuid.UUID] = set()
            out: list[uuid.UUID] = []
            for pid in self.pillar_ids:
                if pid not in seen:
                    seen.add(pid)
                    out.append(pid)
            return out
        return [self.pillar_id] if self.pillar_id is not None else []

    @field_validator("impact_scores", "effort_scores")
    @classmethod
    def _scores_in_range(cls, v: dict[str, int]) -> dict[str, int]:
        for key, val in v.items():
            if not isinstance(val, int) or val < 1 or val > 5:
                raise ValueError(f"O valor de '{key}' deve estar entre 1 e 5.")
        return v


class PriorityComputeResult(BaseModel):
    impacto_bruto: float
    modulador: float
    divisor: float
    impacto_efetivo: float
    esforco: float
    quadrant_code: str


class PriorityScoreResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    pillar_id: Optional[uuid.UUID] = None
    pillar_ids: list[uuid.UUID] = Field(default_factory=list)
    confidence_id: Optional[uuid.UUID] = None
    impact_scores: dict[str, int]
    effort_scores: dict[str, int]
    impacto_bruto: float
    modulador: float
    divisor: float
    impacto_efetivo: float
    esforco: float
    quadrant_code: str
    scored_by: Optional[uuid.UUID] = None
    scored_at: datetime

    model_config = {"from_attributes": True}


class PriorityScoreHistoryItem(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    pillar_ids: list[uuid.UUID] = Field(default_factory=list)
    impact_scores: dict[str, int] = Field(default_factory=dict)
    effort_scores: dict[str, int] = Field(default_factory=dict)
    impacto_efetivo: float
    esforco: float
    quadrant_code: str
    scored_by: Optional[uuid.UUID] = None
    scored_at: datetime

    model_config = {"from_attributes": True}


class PriorityMatrixItem(BaseModel):
    task_id: uuid.UUID
    title: str
    impacto_efetivo: float
    esforco: float
    quadrant_code: str
    pillar_code: Optional[str] = None
    perspective: Optional[str] = None
    color: Optional[str] = None
    # Densidade de valor (impacto ÷ esforço) — desempate dentro do quadrante.
    # None apenas no caso raro de esforço 0.
    priority_rank: Optional[float] = None


# ===== Status Report (snapshot por recorte diretoria/área) =====

class StatusReportPreviewIn(BaseModel):
    """Recorte para montar o report do estado atual (não persiste)."""
    diretoria: Optional[str] = None
    area: Optional[str] = None


class StatusReportCreateIn(BaseModel):
    """Persiste o snapshot final (dados do estado atual + narrativa editada)."""
    diretoria: Optional[str] = None
    area: Optional[str] = None
    diretoria_label: Optional[str] = None
    area_label: Optional[str] = None
    title: str = Field(default="Status Report", max_length=200)
    # Report inteiro renderizável (estrutura validada no frontend).
    snapshot: dict
    # Resumo leve p/ a timeline (nº projetos, progresso médio, etc).
    kpis: dict = Field(default_factory=dict)


class StatusReportListItem(BaseModel):
    """Item da série histórica (sem o snapshot pesado)."""
    id: uuid.UUID
    diretoria: Optional[str] = None
    area: Optional[str] = None
    diretoria_label: Optional[str] = None
    area_label: Optional[str] = None
    title: str
    kpis: dict
    generated_by: Optional[uuid.UUID] = None
    generated_at: datetime

    model_config = {"from_attributes": True}


class StatusReportResponse(BaseModel):
    """Snapshot completo para visualização/impressão."""
    id: uuid.UUID
    diretoria: Optional[str] = None
    area: Optional[str] = None
    diretoria_label: Optional[str] = None
    area_label: Optional[str] = None
    title: str
    snapshot: dict
    kpis: dict
    generated_by: Optional[uuid.UUID] = None
    generated_at: datetime

    model_config = {"from_attributes": True}



class ProjectProgramCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    is_active: bool = True


class ProjectProgramUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class ProjectProgramResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    responsavel_nome: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
