"""Schemas Pydantic do módulo TeamOps."""

import uuid
from datetime import date, datetime, time
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator

# Nível de acesso de uma Pessoa do time (binário):
#  none       -> só ficha de capacidade (sem login)
#  com_acesso -> company_user com a role do CARGO (matriz de permissões por cargo)
# O que a pessoa PODE fazer vem da matriz de permissões do cargo, não deste campo.
AccessLevel = Literal["none", "com_acesso"]


class PositionPermissionsUpdate(BaseModel):
    codes: list[str]


class CatalogPermission(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    module_slug: str

    model_config = {"from_attributes": True}

from app.modules.teamops.models import (
    AbsenceStatus,
    AreaStatus,
    AreaType,
    EmploymentType,
    PersonStatus,
    StackLevel,
)


# ─────────────────────────────────────────────
# Position (cargo)
# ─────────────────────────────────────────────


class PositionCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=140)
    slug: Optional[str] = Field(None, min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
    description: Optional[str] = None
    sort_order: int = Field(0, ge=0)
    is_active: bool = True


class PositionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=140)
    description: Optional[str] = None
    sort_order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class PositionResponse(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: Optional[str]
    is_system: bool
    sort_order: int
    is_active: bool
    role_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    person_count: int = 0

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# Stack Category
# ─────────────────────────────────────────────


class StackCategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    order: int = Field(0, ge=0)
    is_active: bool = True


class StackCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class StackCategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# Stack
# ─────────────────────────────────────────────


class StackCreate(BaseModel):
    category_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=140)
    slug: Optional[str] = Field(None, min_length=1, max_length=140, pattern=r"^[a-z0-9_\-]+$")
    is_critical: bool = False
    is_active: bool = True


class StackUpdate(BaseModel):
    category_id: Optional[uuid.UUID] = None
    name: Optional[str] = Field(None, min_length=1, max_length=140)
    slug: Optional[str] = Field(None, min_length=1, max_length=140, pattern=r"^[a-z0-9_\-]+$")
    is_critical: Optional[bool] = None
    is_active: Optional[bool] = None


class StackCategoryMini(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class StackResponse(BaseModel):
    id: uuid.UUID
    category_id: uuid.UUID
    name: str
    slug: str
    is_critical: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    category: Optional[StackCategoryMini] = None

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# Absence Type
# ─────────────────────────────────────────────


class AbsenceTypeCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    slug: Optional[str] = Field(None, min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
    requires_approval: bool = True
    affects_capacity: bool = True
    color: str = Field("#8B5CF6", pattern=r"^#[0-9A-Fa-f]{6}$")
    is_active: bool = True


class AbsenceTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    slug: Optional[str] = Field(None, min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
    requires_approval: Optional[bool] = None
    affects_capacity: Optional[bool] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    is_active: Optional[bool] = None


class AbsenceTypeResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    requires_approval: bool
    affects_capacity: bool
    color: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# Area
# ─────────────────────────────────────────────


class AreaCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=140)
    description: Optional[str] = None
    parent_area_id: Optional[uuid.UUID] = None
    area_type: AreaType = AreaType.NEGOCIO
    # `status` é a fonte única de "ativa?". `is_active` é derivado dele no service.
    status: AreaStatus = AreaStatus.ATIVA


class AreaUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=140)
    description: Optional[str] = None
    parent_area_id: Optional[uuid.UUID] = None
    area_type: Optional[AreaType] = None
    status: Optional[AreaStatus] = None


class PositionMini(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    is_system: bool

    model_config = {"from_attributes": True}


class PersonMini(BaseModel):
    id: uuid.UUID
    full_name: str
    position: Optional[PositionMini] = None

    model_config = {"from_attributes": True}


class AreaRef(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class AreaResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    parent_area_id: Optional[uuid.UUID]
    area_type: AreaType
    status: AreaStatus
    is_active: bool
    created_at: datetime
    updated_at: datetime
    parent_area: Optional[AreaRef] = None
    person_count: int = 0
    subarea_count: int = 0

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# Person
# ─────────────────────────────────────────────


class PersonCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=200)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=30)
    whatsapp: Optional[str] = Field(None, max_length=30)
    birth_date: Optional[date] = None
    position_id: uuid.UUID
    area_ids: list[uuid.UUID] = []
    po_person_ids: list[uuid.UUID] = []
    # Aliases legados do formulário (singular) — normalizados para as listas.
    area_id: Optional[uuid.UUID] = None
    po_person_id: Optional[uuid.UUID] = None
    tech_reference_person_id: Optional[uuid.UUID] = None
    manager_person_id: Optional[uuid.UUID] = None
    employment_type: EmploymentType = EmploymentType.CLT
    daily_hours: float = Field(8.0, ge=0, le=24)
    weekly_hours: float = Field(40.0, ge=0, le=168)
    project_allocation_pct: float = Field(100.0, ge=0, le=100)
    start_date: Optional[date] = None
    status: PersonStatus = PersonStatus.ATIVO
    visible_in_org_chart: bool = True
    notes: Optional[str] = None
    # Acesso ao sistema (provisiona/vincula o login). Senha exigida ao criar o login.
    access_level: AccessLevel = "none"
    password: Optional[str] = None

    @model_validator(mode="after")
    def _normalize_singular_links(self):
        if self.area_id and self.area_id not in self.area_ids:
            self.area_ids = [*self.area_ids, self.area_id]
        if self.po_person_id and self.po_person_id not in self.po_person_ids:
            self.po_person_ids = [*self.po_person_ids, self.po_person_id]
        return self


class PersonUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=30)
    whatsapp: Optional[str] = Field(None, max_length=30)
    birth_date: Optional[date] = None
    position_id: Optional[uuid.UUID] = None
    area_ids: Optional[list[uuid.UUID]] = None
    po_person_ids: Optional[list[uuid.UUID]] = None
    area_id: Optional[uuid.UUID] = None
    po_person_id: Optional[uuid.UUID] = None
    tech_reference_person_id: Optional[uuid.UUID] = None
    manager_person_id: Optional[uuid.UUID] = None
    employment_type: Optional[EmploymentType] = None
    daily_hours: Optional[float] = Field(None, ge=0, le=24)
    weekly_hours: Optional[float] = Field(None, ge=0, le=168)
    project_allocation_pct: Optional[float] = Field(None, ge=0, le=100)
    start_date: Optional[date] = None
    status: Optional[PersonStatus] = None
    visible_in_org_chart: Optional[bool] = None
    notes: Optional[str] = None
    # Acesso ao sistema. access_level muda o vínculo; password define senha ao provisionar;
    # reset_password redefine a senha de um login já vinculado.
    access_level: Optional[AccessLevel] = None
    password: Optional[str] = None
    reset_password: Optional[str] = None
    # Ao marcar DESLIGADO: Person.id do colega (mesmo cargo) que recebe as tarefas em aberto.
    # Concluídas permanecem com a pessoa desligada (histórico).
    reassign_open_tasks_to: Optional[uuid.UUID] = None

    @model_validator(mode="after")
    def _normalize_singular_links(self):
        if self.area_id is not None:
            base = list(self.area_ids or [])
            if self.area_id not in base:
                base.append(self.area_id)
            self.area_ids = base
        if self.po_person_id is not None:
            base = list(self.po_person_ids or [])
            if self.po_person_id not in base:
                base.append(self.po_person_id)
            self.po_person_ids = base
        return self


class OffboardingPeer(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str


class OffboardingPreviewResponse(BaseModel):
    """Resumo ao desligar: tarefas em aberto (a realocar) vs concluídas (histórico)."""
    person_id: uuid.UUID
    full_name: str
    position_id: Optional[uuid.UUID] = None
    position_name: Optional[str] = None
    open_tasks: int = 0
    completed_tasks: int = 0
    peers: list[OffboardingPeer] = Field(default_factory=list)


class AreaMini(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class PersonResponse(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID]
    full_name: str
    email: str
    phone: Optional[str]
    whatsapp: Optional[str]
    birth_date: Optional[date]
    position_id: uuid.UUID
    area_ids: list[uuid.UUID] = []
    po_person_ids: list[uuid.UUID] = []
    tech_reference_person_id: Optional[uuid.UUID]
    manager_person_id: Optional[uuid.UUID]
    employment_type: EmploymentType
    daily_hours: float
    weekly_hours: float
    project_allocation_pct: float
    start_date: Optional[date]
    status: PersonStatus
    visible_in_org_chart: bool = True
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    position: Optional[PositionMini] = None
    areas: list[AreaMini] = []
    pos: list[PersonMini] = []
    tech_reference_person: Optional[PersonMini] = None
    manager_person: Optional[PersonMini] = None
    # Acesso ao sistema (derivado do usuário vinculado).
    access_level: AccessLevel = "none"
    user_active: Optional[bool] = None
    user_email: Optional[str] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="wrap")
    @classmethod
    def _fill_ids_from_relations(cls, value, handler):
        """Popula area_ids/po_person_ids a partir dos relacionamentos ORM."""
        data = handler(value)
        if isinstance(value, dict):
            return data
        areas = getattr(value, "areas", None) or []
        pos = getattr(value, "pos", None) or []
        if not data.area_ids and areas:
            data.area_ids = [a.id for a in areas]
        if not data.po_person_ids and pos:
            data.po_person_ids = [p.id for p in pos]
        return data


class TeamMemberResponse(BaseModel):
    """Membro do time = Pessoa com login vinculado e ativo. `id` é o user_id
    (compatível com o seletor de responsável do kanban)."""
    id: uuid.UUID  # user_id
    person_id: uuid.UUID
    full_name: str
    email: str
    position_name: Optional[str] = None
    position_slug: Optional[str] = None
    access_level: AccessLevel = "com_acesso"


# ─────────────────────────────────────────────
# PersonStack
# ─────────────────────────────────────────────


class PersonStackCreate(BaseModel):
    stack_id: uuid.UUID
    level: StackLevel = StackLevel.PLENO
    years_experience: int = Field(0, ge=0, le=80)
    is_reference: bool = False
    notes: Optional[str] = None


class PersonStackUpdate(BaseModel):
    level: Optional[StackLevel] = None
    years_experience: Optional[int] = Field(None, ge=0, le=80)
    is_reference: Optional[bool] = None
    notes: Optional[str] = None


class StackMini(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    is_critical: bool

    model_config = {"from_attributes": True}


class PersonStackResponse(BaseModel):
    id: uuid.UUID
    person_id: uuid.UUID
    stack_id: uuid.UUID
    level: StackLevel
    years_experience: int
    is_reference: bool
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    stack: Optional[StackMini] = None

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# Absence
# ─────────────────────────────────────────────


class AbsenceCreate(BaseModel):
    person_id: uuid.UUID
    absence_type_id: uuid.UUID
    start_date: date
    end_date: date
    partial_hours: Optional[float] = Field(None, ge=0, le=24)
    notes: Optional[str] = None


class AbsenceUpdate(BaseModel):
    absence_type_id: Optional[uuid.UUID] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    partial_hours: Optional[float] = Field(None, ge=0, le=24)
    notes: Optional[str] = None


class AbsenceDecision(BaseModel):
    decision_notes: Optional[str] = None


class AbsenceTypeMini(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    color: str
    affects_capacity: bool

    model_config = {"from_attributes": True}


class AbsenceResponse(BaseModel):
    id: uuid.UUID
    person_id: uuid.UUID
    absence_type_id: uuid.UUID
    start_date: date
    end_date: date
    partial_hours: Optional[float]
    status: AbsenceStatus
    requested_by: Optional[uuid.UUID]
    approver_person_id: Optional[uuid.UUID]
    approved_at: Optional[datetime]
    decision_notes: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    person: Optional[PersonMini] = None
    absence_type: Optional[AbsenceTypeMini] = None
    approver_person: Optional[PersonMini] = None

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# Visões agregadas
# ─────────────────────────────────────────────


class OrgAreaMember(BaseModel):
    person_id: uuid.UUID
    name: str
    position: str
    rank: int
    employment_type: EmploymentType = EmploymentType.CLT


class OrgAreaNode(BaseModel):
    """Nó do organograma = uma ÁREA com todas as pessoas alocadas (uma caixa por pessoa
    no diagrama) e sub-áreas (parent_area_id)."""
    area_id: uuid.UUID
    area_name: str
    members: list[OrgAreaMember] = []
    person_count: int = 0
    children: list["OrgAreaNode"] = []


OrgAreaNode.model_rebuild()


class OrgTreeResponse(BaseModel):
    roots: list[OrgAreaNode] = []


class CompetencyMapPerson(BaseModel):
    person: PersonMini
    level: StackLevel
    years_experience: int
    is_reference: bool


class CompetencyMapEntry(BaseModel):
    stack: StackMini
    category_id: uuid.UUID
    category_name: str
    person_count: int
    has_reference: bool
    risk_level: str  # "low" | "medium" | "high"
    persons: list[CompetencyMapPerson] = []


class CompetencyMapResponse(BaseModel):
    entries: list[CompetencyMapEntry] = []


class AlertItem(BaseModel):
    code: str  # ex: "po_and_tech_ref_absent", "critical_stack_no_backup"
    severity: str  # "low" | "medium" | "high"
    title: str
    description: str
    related_person_ids: list[uuid.UUID] = []
    related_stack_ids: list[uuid.UUID] = []
    related_area_ids: list[uuid.UUID] = []


class AlertsResponse(BaseModel):
    items: list[AlertItem] = []


class DashboardKpis(BaseModel):
    active_persons: int
    on_vacation_today: int
    pending_approvals: int
    critical_stacks_without_backup: int
    areas_without_po: int
    persons_by_area: list[dict] = []
    persons_by_role: list[dict] = []
    birthdays_this_month: list[dict] = []


class AbsenceCalendarDay(BaseModel):
    day: date
    absences: list[AbsenceResponse] = []
    conflict_flags: list[str] = []


class AbsenceCalendarResponse(BaseModel):
    month: str  # "YYYY-MM"
    days: list[AbsenceCalendarDay] = []


# ─────────────────────────────────────────────
# Calendário de trabalho + feriados
# ─────────────────────────────────────────────


class WorkCalendarResponse(BaseModel):
    id: uuid.UUID
    day_start: time
    day_end: time
    lunch_start: Optional[time] = None
    lunch_end: Optional[time] = None
    work_days: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])
    timezone: str
    hours_per_day: float

    model_config = {"from_attributes": True}


class WorkCalendarUpdate(BaseModel):
    day_start: time
    day_end: time
    lunch_start: Optional[time] = None
    lunch_end: Optional[time] = None
    work_days: list[int] = Field(..., min_length=1)
    timezone: str = Field("America/Maceio", max_length=64)

    @model_validator(mode="after")
    def _validate(self):
        if self.day_end <= self.day_start:
            raise ValueError("O fim do expediente deve ser depois do início.")
        if (self.lunch_start is None) != (self.lunch_end is None):
            raise ValueError("Informe início e fim do almoço, ou nenhum.")
        if self.lunch_start and self.lunch_end:
            if not (self.day_start <= self.lunch_start < self.lunch_end <= self.day_end):
                raise ValueError("O almoço deve estar dentro do expediente.")
        if any(d < 0 or d > 6 for d in self.work_days):
            raise ValueError("Dias úteis devem estar entre 0 (seg) e 6 (dom).")
        return self


class HolidayCreate(BaseModel):
    day: date
    name: str = Field(..., min_length=1, max_length=140)
    is_recurring: bool = False


class HolidayResponse(BaseModel):
    id: uuid.UUID
    day: date
    name: str
    is_recurring: bool

    model_config = {"from_attributes": True}
