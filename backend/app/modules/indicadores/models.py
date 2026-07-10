"""Modelos do módulo Indicadores (KPIs institucionais) — schema isolado de cada tenant.

Indicador classificado em Estratégico/Tático, ligado a Área/Responsável (reusa teamops),
com registros de acompanhamento por período (gerados conforme a granularidade). O cálculo
de percentual de atingimento e status é feito no service. Auditoria por linha; soft-delete.
"""

import enum
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import TenantBase
# Org reusa teamops (mesmo schema do tenant). Import só para as relações.
from app.modules.teamops.models import Area, Person  # noqa: F401

_enum_values = lambda obj: [e.value for e in obj]


# ─────────────────────────────────────────────
# Enums (listas fechadas)
# ─────────────────────────────────────────────

class IndicadorCategoria(str, enum.Enum):
    ESTRATEGICO = "estrategico"
    TATICO = "tatico"


class IndicadorGranularidade(str, enum.Enum):
    MENSAL = "mensal"
    BIMESTRAL = "bimestral"
    TRIMESTRAL = "trimestral"
    SEMESTRAL = "semestral"
    ANUAL = "anual"


class IndicadorSentido(str, enum.Enum):
    MAIOR_MELHOR = "maior_melhor"
    MENOR_MELHOR = "menor_melhor"
    FAIXA_IDEAL = "faixa_ideal"


class IndicadorStatus(str, enum.Enum):
    ATIVO = "ativo"
    INATIVO = "inativo"


class AcompanhamentoStatus(str, enum.Enum):
    PENDENTE = "pendente"
    ATINGIDO = "atingido"
    EM_ATENCAO = "em_atencao"
    NAO_ATINGIDO = "nao_atingido"


class FonteDados(str, enum.Enum):
    """Origem do valor do acompanhamento: digitado à mão ou calculado do portfólio."""
    MANUAL = "manual"
    PORTFOLIO = "portfolio"


class FontePortfolioMetrica(str, enum.Enum):
    """Métrica do portfólio de Produtos usada quando fonte = portfolio (extensível)."""
    # % de serviços de produtos publicados (lifecycle=producao) sobre publicados + em desenvolvimento.
    SERVICOS_PUBLICADOS = "servicos_publicados"
    # % de documentos nato-digital cadastrados (prod. produção) sobre cadastrados (prod. + desenv.).
    # data_documento é sincronizada com data_publicacao dos serviços do produto.
    DOCUMENTOS_NATOS_DIGITAIS = "documentos_natos_digitais"


# ─────────────────────────────────────────────
# Indicador
# ─────────────────────────────────────────────

class Indicador(TenantBase):
    __tablename__ = "indicadores"
    __table_args__ = (
        UniqueConstraint("codigo", name="uq_indicadores_codigo"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    codigo: Mapped[str] = mapped_column(String(40), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    categoria: Mapped[IndicadorCategoria] = mapped_column(
        SAEnum(IndicadorCategoria, native_enum=False, values_callable=_enum_values), nullable=False,
    )
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    objetivo_estrategico: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Org (reusa teamops)
    area_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_areas.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    responsavel_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="SET NULL"), nullable=True,
    )

    unidade_medida: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    formula_calculo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fonte_dados: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    granularidade: Mapped[IndicadorGranularidade] = mapped_column(
        SAEnum(IndicadorGranularidade, native_enum=False, values_callable=_enum_values), nullable=False,
    )
    periodicidade_atualizacao: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    sentido: Mapped[IndicadorSentido] = mapped_column(
        SAEnum(IndicadorSentido, native_enum=False, values_callable=_enum_values), nullable=False,
    )
    # Usados quando sentido = faixa_ideal
    meta_min: Mapped[Optional[float]] = mapped_column(Numeric(18, 4), nullable=True)
    meta_max: Mapped[Optional[float]] = mapped_column(Numeric(18, 4), nullable=True)
    tolerancia_pct: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, default=20)

    # Origem dos dados do acompanhamento: manual (default) ou portfólio de Produtos.
    fonte: Mapped[FonteDados] = mapped_column(
        SAEnum(FonteDados, native_enum=False, values_callable=_enum_values),
        nullable=False, default=FonteDados.MANUAL,
    )
    fonte_metrica: Mapped[Optional[FontePortfolioMetrica]] = mapped_column(
        SAEnum(FontePortfolioMetrica, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    # 1º dia do mês a partir do qual os acompanhamentos nascem com fonte = portfolio.
    fonte_corte: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    status: Mapped[IndicadorStatus] = mapped_column(
        SAEnum(IndicadorStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=IndicadorStatus.ATIVO,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    inactivated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    inactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    area: Mapped[Optional["Area"]] = relationship("Area", lazy="selectin")
    responsavel: Mapped[Optional["Person"]] = relationship("Person", lazy="selectin")
    acompanhamentos: Mapped[list["IndicadorAcompanhamento"]] = relationship(
        back_populates="indicador", cascade="all, delete-orphan",
        order_by="IndicadorAcompanhamento.ano_referencia, IndicadorAcompanhamento.ordem", lazy="selectin",
    )


class IndicadorAcompanhamento(TenantBase):
    __tablename__ = "indicador_acompanhamentos"
    __table_args__ = (
        UniqueConstraint("indicador_id", "ano_referencia", "ordem", name="uq_indicador_acomp_periodo"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    indicador_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("indicadores.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    ano_referencia: Mapped[int] = mapped_column(Integer, nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False)
    competencia: Mapped[str] = mapped_column(String(40), nullable=False)
    periodo_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    periodo_fim: Mapped[date] = mapped_column(Date, nullable=False)
    meta: Mapped[Optional[float]] = mapped_column(Numeric(18, 4), nullable=True)
    realizado: Mapped[Optional[float]] = mapped_column(Numeric(18, 4), nullable=True)
    percentual_atingimento: Mapped[Optional[float]] = mapped_column(Numeric(7, 2), nullable=True)
    status: Mapped[AcompanhamentoStatus] = mapped_column(
        SAEnum(AcompanhamentoStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=AcompanhamentoStatus.PENDENTE,
    )
    # Origem do valor deste mês: manual (digitado) ou portfolio (calculado de Produtos).
    fonte: Mapped[FonteDados] = mapped_column(
        SAEnum(FonteDados, native_enum=False, values_callable=_enum_values),
        nullable=False, default=FonteDados.MANUAL,
    )
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Evidências/anexos: [{object_name, filename, content_type, size}, ...]
    evidencias: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    # Mês fechado: quando True, o registro fica congelado e não pode ser editado
    # (apenas desbloqueado). Trava de fechamento da competência.
    bloqueado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    indicador: Mapped["Indicador"] = relationship(back_populates="acompanhamentos")
