"""Modelos do módulo TeamOps — vivem no schema isolado de cada tenant."""

import enum
import uuid
from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import TenantBase


_enum_values = lambda obj: [e.value for e in obj]


# ─────────────────────────────────────────────
# Tabelas de associação N:N
# ─────────────────────────────────────────────
# Uma pessoa pode pertencer a várias áreas e ter vários POs (a fonte única é a
# própria pessoa, via estas associações — substitui as antigas FKs únicas).

team_person_areas = Table(
    "team_person_areas",
    TenantBase.metadata,
    Column("person_id", UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="CASCADE"), primary_key=True),
    Column("area_id", UUID(as_uuid=True), ForeignKey("team_areas.id", ondelete="CASCADE"), primary_key=True),
)

team_person_pos = Table(
    "team_person_pos",
    TenantBase.metadata,
    Column("person_id", UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="CASCADE"), primary_key=True),
    Column("po_person_id", UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="CASCADE"), primary_key=True),
)


# ─────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────


class AreaType(str, enum.Enum):
    NEGOCIO = "negocio"
    SUPORTE = "suporte"
    DADOS = "dados"
    PRODUTO = "produto"
    SUSTENTACAO = "sustentacao"


class AreaStatus(str, enum.Enum):
    ATIVA = "ativa"
    INATIVA = "inativa"
    REESTRUTURACAO = "reestruturacao"


# Slugs sistêmicos: cargos que governam regras de negócio (organograma, áreas).
# Outros cargos custom podem ser criados pela UI livremente.
SYSTEM_POSITION_SLUGS: dict[str, str] = {
    "gerente": "Gerente",
    "coordenador": "Coordenador",
    "po": "Product Owner",
    "po_externo": "Product Owner (Externo)",
    "scrum_master": "Scrum Master",
    "tech_reference": "Referência Técnica",
    "dev_backend": "Dev Backend",
    "dev_frontend": "Dev Frontend",
    "dev_fullstack": "Dev Fullstack",
    "qa": "QA",
    "ux_ui": "UX/UI Designer",
    "data_analyst": "Analista de Dados",
    "data_scientist": "Cientista de Dados",
    "devops": "DevOps",
    "support": "Suporte",
    "intern": "Estagiário",
    "requirements": "Analista de Requisitos",
    "architect": "Arquiteto",
}


class EmploymentType(str, enum.Enum):
    CLT = "clt"
    PJ = "pj"
    ESTAGIO = "estagio"
    TERCEIRO = "terceiro"


class PersonStatus(str, enum.Enum):
    ATIVO = "ativo"
    AFASTADO = "afastado"
    FERIAS = "ferias"
    DESLIGADO = "desligado"


class StackLevel(str, enum.Enum):
    BASICO = "basico"
    JUNIOR = "junior"
    PLENO = "pleno"
    SENIOR = "senior"
    ESPECIALISTA = "especialista"
    REFERENCIA = "referencia"


class AbsenceStatus(str, enum.Enum):
    PENDENTE = "pendente"
    APROVADA = "aprovada"
    RECUSADA = "recusada"
    CANCELADA = "cancelada"


# ─────────────────────────────────────────────
# Catálogos
# ─────────────────────────────────────────────


class Position(TenantBase):
    """Cargo (catálogo editável). Alguns cargos são 'is_system=True' — não podem ser
    apagados, mas podem ser renomeados/desativados. Cargos custom (is_system=False)
    são livremente gerenciáveis."""

    __tablename__ = "team_positions"
    __table_args__ = (UniqueConstraint("slug"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Role (public.roles) que guarda a matriz de permissões deste cargo. Sem FK (cross-schema).
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StackCategory(TenantBase):
    __tablename__ = "team_stack_categories"
    __table_args__ = (UniqueConstraint("name"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    stacks: Mapped[list["Stack"]] = relationship(
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="Stack.name",
    )


class Stack(TenantBase):
    __tablename__ = "team_stacks"
    __table_args__ = (UniqueConstraint("slug"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team_stack_categories.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), nullable=False)
    is_critical: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category: Mapped["StackCategory"] = relationship(back_populates="stacks")
    person_stacks: Mapped[list["PersonStack"]] = relationship(
        back_populates="stack",
        cascade="all, delete-orphan",
    )


class AbsenceType(TenantBase):
    __tablename__ = "team_absence_types"
    __table_args__ = (UniqueConstraint("slug"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    requires_approval: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    affects_capacity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#8B5CF6")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─────────────────────────────────────────────
# Estrutura organizacional
# ─────────────────────────────────────────────


class Area(TenantBase):
    __tablename__ = "team_areas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(140), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    parent_area_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team_areas.id", ondelete="SET NULL"),
        nullable=True,
    )
    area_type: Mapped[AreaType] = mapped_column(
        SAEnum(AreaType, native_enum=False, values_callable=_enum_values),
        nullable=False,
        default=AreaType.NEGOCIO,
    )
    # Os papéis de PO / Referência Técnica / Coordenador / Gerente da área NÃO são mais
    # armazenados aqui (evita fonte de verdade duplicada com Person). Eles são derivados
    # das pessoas alocadas na área pelo CARGO (ver AreaService.role_people).
    status: Mapped[AreaStatus] = mapped_column(
        SAEnum(AreaStatus, native_enum=False, values_callable=_enum_values),
        nullable=False,
        default=AreaStatus.ATIVA,
    )
    # Derivado de `status` (status == ATIVA). Mantido por compatibilidade de leitura.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    persons: Mapped[list["Person"]] = relationship(
        secondary=team_person_areas,
        back_populates="areas",
    )
    parent_area: Mapped[Optional["Area"]] = relationship(
        remote_side="Area.id",
        foreign_keys=[parent_area_id],
        back_populates="subareas",
    )
    subareas: Mapped[list["Area"]] = relationship(
        back_populates="parent_area",
        foreign_keys=[parent_area_id],
    )


class Person(TenantBase):
    __tablename__ = "team_persons"
    __table_args__ = (UniqueConstraint("email"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)  # public.users.id
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    position_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team_positions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Áreas e POs são N:N (uma pessoa pode estar em várias áreas e ter vários POs).
    tech_reference_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team_persons.id", ondelete="SET NULL"),
        nullable=True,
    )
    manager_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team_persons.id", ondelete="SET NULL"),
        nullable=True,
    )
    employment_type: Mapped[EmploymentType] = mapped_column(
        SAEnum(EmploymentType, native_enum=False, values_callable=_enum_values),
        nullable=False,
        default=EmploymentType.CLT,
    )
    daily_hours: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=8.0)
    weekly_hours: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=40.0)
    # Percentual da jornada diária reservado para projetos (ex.: 62,5% de 8h = 5h/dia).
    project_allocation_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=100.0)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[PersonStatus] = mapped_column(
        SAEnum(PersonStatus, native_enum=False, values_callable=_enum_values),
        nullable=False,
        default=PersonStatus.ATIVO,
    )
    visible_in_org_chart: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    position: Mapped["Position"] = relationship(lazy="joined")
    areas: Mapped[list["Area"]] = relationship(
        secondary=team_person_areas,
        back_populates="persons",
    )
    pos: Mapped[list["Person"]] = relationship(
        secondary=team_person_pos,
        primaryjoin=lambda: Person.id == team_person_pos.c.person_id,
        secondaryjoin=lambda: Person.id == team_person_pos.c.po_person_id,
    )
    tech_reference_person: Mapped[Optional["Person"]] = relationship(
        remote_side="Person.id", foreign_keys=[tech_reference_person_id],
    )
    manager_person: Mapped[Optional["Person"]] = relationship(
        remote_side="Person.id", foreign_keys=[manager_person_id],
    )
    stacks: Mapped[list["PersonStack"]] = relationship(
        back_populates="person",
        cascade="all, delete-orphan",
    )
    absences: Mapped[list["Absence"]] = relationship(
        back_populates="person",
        cascade="all, delete-orphan",
        foreign_keys="Absence.person_id",
    )


class PersonStack(TenantBase):
    __tablename__ = "team_person_stacks"
    __table_args__ = (UniqueConstraint("person_id", "stack_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team_persons.id", ondelete="CASCADE"),
        nullable=False,
    )
    stack_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team_stacks.id", ondelete="CASCADE"),
        nullable=False,
    )
    level: Mapped[StackLevel] = mapped_column(
        SAEnum(StackLevel, native_enum=False, values_callable=_enum_values),
        nullable=False,
        default=StackLevel.PLENO,
    )
    years_experience: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_reference: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person: Mapped["Person"] = relationship(back_populates="stacks")
    stack: Mapped["Stack"] = relationship(back_populates="person_stacks", lazy="joined")


class Absence(TenantBase):
    __tablename__ = "team_absences"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team_persons.id", ondelete="CASCADE"),
        nullable=False,
    )
    absence_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team_absence_types.id", ondelete="RESTRICT"),
        nullable=False,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    partial_hours: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    status: Mapped[AbsenceStatus] = mapped_column(
        SAEnum(AbsenceStatus, native_enum=False, values_callable=_enum_values),
        nullable=False,
        default=AbsenceStatus.PENDENTE,
    )
    requested_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    approver_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("team_persons.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    decision_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person: Mapped["Person"] = relationship(
        back_populates="absences", foreign_keys=[person_id], lazy="joined",
    )
    absence_type: Mapped["AbsenceType"] = relationship(lazy="joined")
    approver_person: Mapped[Optional["Person"]] = relationship(
        foreign_keys=[approver_person_id], lazy="joined",
    )


# ─────────────────────────────────────────────
# Calendário de trabalho corporativo (singleton por tenant) + feriados
# ─────────────────────────────────────────────


class WorkCalendar(TenantBase):
    """Calendário corporativo do tenant (linha única). Define o expediente, o almoço e os
    dias úteis usados pelo motor de cronograma (horas úteis) e pelo cálculo de capacidade.
    As horas úteis por dia são derivadas das janelas (expediente − almoço)."""

    __tablename__ = "team_work_calendar"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    day_start: Mapped[time] = mapped_column(Time, nullable=False, default=time(8, 0))
    day_end: Mapped[time] = mapped_column(Time, nullable=False, default=time(17, 0))
    lunch_start: Mapped[Optional[time]] = mapped_column(Time, nullable=True, default=time(12, 0))
    lunch_end: Mapped[Optional[time]] = mapped_column(Time, nullable=True, default=time(13, 0))
    # Dias úteis da semana no padrão Python (0=seg … 6=dom).
    work_days: Mapped[list] = mapped_column(JSONB, nullable=False, default=lambda: [0, 1, 2, 3, 4])
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="America/Maceio")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def hours_per_day(self) -> float:
        """Horas úteis por dia derivadas das janelas (expediente − almoço)."""
        ds = self.day_start.hour * 60 + self.day_start.minute
        de = self.day_end.hour * 60 + self.day_end.minute
        lunch = 0
        if self.lunch_start and self.lunch_end:
            lunch = (self.lunch_end.hour * 60 + self.lunch_end.minute) - (
                self.lunch_start.hour * 60 + self.lunch_start.minute
            )
        return max(0, de - ds - lunch) / 60.0


class Holiday(TenantBase):
    """Feriado corporativo. `is_recurring` = feriado anual fixo (compara mês/dia, ignora o ano)."""

    __tablename__ = "team_holidays"
    __table_args__ = (UniqueConstraint("day", "is_recurring", name="uq_team_holiday_day"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    is_recurring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
