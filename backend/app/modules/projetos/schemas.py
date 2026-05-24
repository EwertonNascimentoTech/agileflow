import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

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


class ProjectFunnelUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    description: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    order: Optional[int] = Field(None, ge=0)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    allowed_demand_type_ids: Optional[list[uuid.UUID]] = None


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
    order: int = Field(0, ge=0)
    is_active: bool = True


class ProjectDemandTypeUpdate(BaseModel):
    slug: Optional[str] = Field(None, min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
    name: Optional[str] = Field(None, min_length=2, max_length=140)
    description: Optional[str] = None
    funnel_id: Optional[uuid.UUID] = None
    allowed_child_type_ids: Optional[list[uuid.UUID]] = None
    available_for_basic: Optional[bool] = None
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
    move_in_role_ids: Optional[list[uuid.UUID]] = None
    sla_hours: Optional[int] = Field(None, ge=1)
    sla_warning_pct: int = Field(80, ge=1, le=100)


class ProjectStatusUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    order: Optional[int] = Field(None, ge=0)
    is_initial: Optional[bool] = None
    is_final: Optional[bool] = None
    is_active: Optional[bool] = None
    creates_demand_type_id: Optional[uuid.UUID] = None
    moves_to_funnel_id: Optional[uuid.UUID] = None
    move_in_role_ids: Optional[list[uuid.UUID]] = None
    sla_hours: Optional[int] = Field(None, ge=1)
    sla_warning_pct: Optional[int] = Field(None, ge=1, le=100)


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
    move_in_role_ids: Optional[list[uuid.UUID]] = None
    sla_hours: Optional[int] = None
    sla_warning_pct: int = 80
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectTaskCreate(BaseModel):
    status_id: uuid.UUID
    demand_type_id: Optional[uuid.UUID] = None
    parent_task_id: Optional[uuid.UUID] = None
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    assigned_to: Optional[uuid.UUID] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    order: int = Field(0, ge=0)
    form_values: Optional[dict] = None


class ProjectTaskUpdate(BaseModel):
    status_id: Optional[uuid.UUID] = None
    demand_type_id: Optional[uuid.UUID] = None
    parent_task_id: Optional[uuid.UUID] = None
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    assigned_to: Optional[uuid.UUID] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    order: Optional[int] = Field(None, ge=0)
    form_values: Optional[dict] = None
    # Nome do card a ser criado por conversão nesta troca de status (não é persistido
    # no card atual). Se vazio, a conversão copia o título do card de origem.
    conversion_title: Optional[str] = Field(None, min_length=2, max_length=200)


class ProjectTaskResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    status_id: uuid.UUID
    demand_type_id: Optional[uuid.UUID]
    parent_task_id: Optional[uuid.UUID]
    origin_task_id: Optional[uuid.UUID]
    title: str
    description: Optional[str]
    assigned_to: Optional[uuid.UUID]
    start_date: Optional[datetime]
    due_date: Optional[datetime]
    order: int
    created_by: Optional[uuid.UUID]
    completed_at: Optional[datetime]
    status_entered_at: Optional[datetime] = None
    sla_state: str = "none"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


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


class ProjectTaskCommentCreate(BaseModel):
    content: str = Field(..., min_length=1)


class ProjectTaskCommentResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    author_id: Optional[uuid.UUID]
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

