"""Modelos do módulo RTD (Reunião de Tomada de Decisão) — schema isolado de cada tenant.

A RTD é uma cerimônia de comitê por competência (mensal/trimestral). A Parte 1
("Comitê de Portfólio e Desenvolvimento Digital") reaproveita, em tempo de leitura,
os agregados de Projetos/Produtos/Indicadores; o que é PRÓPRIO do módulo e persiste
aqui é: o registro da reunião (período/competência) e suas deliberações (ata).

Referências cruzadas (project_task_id, responsavel_person_id) são guardadas como UUID
sem FK rígida — mesmo padrão frouxo do PO Sync — para não acoplar a ordem de criação
de tabelas entre módulos. Auditoria por linha.
"""

import enum
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import TenantBase

_enum_values = lambda obj: [e.value for e in obj]


# ─────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────

class TipoCompetencia(str, enum.Enum):
    MENSAL = "mensal"
    TRIMESTRAL = "trimestral"


class ReuniaoStatus(str, enum.Enum):
    RASCUNHO = "rascunho"
    REALIZADA = "realizada"
    FECHADA = "fechada"


class DeliberacaoTipo(str, enum.Enum):
    DECISAO_PENDENTE = "decisao_pendente"
    APOIO = "apoio"
    PRIORIZACAO = "priorizacao"


class DeliberacaoStatus(str, enum.Enum):
    PENDENTE = "pendente"
    ENCAMINHADA = "encaminhada"
    CONCLUIDA = "concluida"


# ─────────────────────────────────────────────
# Tabelas
# ─────────────────────────────────────────────

class RtdReuniao(TenantBase):
    __tablename__ = "rtd_reunioes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)

    # Competência (mensal → ordem 1-12; trimestral → ordem 1-4). Deriva o período.
    tipo_competencia: Mapped[TipoCompetencia] = mapped_column(
        SAEnum(TipoCompetencia, native_enum=False, values_callable=_enum_values),
        nullable=False, default=TipoCompetencia.TRIMESTRAL,
    )
    ano_referencia: Mapped[int] = mapped_column(Integer, nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False)
    competencia: Mapped[str] = mapped_column(String(40), nullable=False)  # rótulo legível
    periodo_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    periodo_fim: Mapped[date] = mapped_column(Date, nullable=False)

    status: Mapped[ReuniaoStatus] = mapped_column(
        SAEnum(ReuniaoStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=ReuniaoStatus.RASCUNHO,
    )
    data_realizacao: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Códigos dos planos do EPA exibidos nos slides (listas de ints):
    # epa_planos = Planos Estratégicos; epa_planos_taticos = Planos Táticos.
    epa_planos: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    epa_planos_taticos: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)

    # FOTO da Seção 1 (indicadores) congelada no fechamento da reunião:
    # {generated_at, indicadores_detalhe: [...]}. Enquanto status != fechada o report
    # calcula ao vivo; fechada → lê daqui. Reabrir preserva (sobrescrito no próximo fechamento).
    snapshot_indicadores: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    deliberacoes: Mapped[list["RtdDeliberacao"]] = relationship(
        back_populates="reuniao", cascade="all, delete-orphan",
    )
    indicador_analises: Mapped[list["RtdIndicadorAnalise"]] = relationship(
        back_populates="reuniao", cascade="all, delete-orphan",
    )


class RtdDeliberacao(TenantBase):
    __tablename__ = "rtd_deliberacoes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reuniao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rtd_reunioes.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    # Deliberação geral (projeto nulo) ou vinculada a um projeto/produto (project_tasks.id).
    project_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    tipo: Mapped[DeliberacaoTipo] = mapped_column(
        SAEnum(DeliberacaoTipo, native_enum=False, values_callable=_enum_values),
        nullable=False, default=DeliberacaoTipo.DECISAO_PENDENTE,
    )
    titulo: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    # team_persons.id (sem FK rígida — reuse frouxo do teamops).
    responsavel_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    prazo: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[DeliberacaoStatus] = mapped_column(
        SAEnum(DeliberacaoStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=DeliberacaoStatus.PENDENTE,
    )

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    reuniao: Mapped["RtdReuniao"] = relationship(back_populates="deliberacoes")


class RtdIndicadorAnalise(TenantBase):
    """Análise qualitativa de UM indicador em UMA reunião (Seção 1 da pauta).

    Fatores/riscos são preenchidos para qualquer indicador; os campos de reversão
    (causa, plano, responsável, prazo, resultado esperado) aplicam-se aos abaixo da meta.
    `indicador_id` é ref frouxa a `indicadores.id` (padrão do módulo) — se o indicador
    for removido/inativado, a análise fica órfã e simplesmente não aparece no merge."""
    __tablename__ = "rtd_indicador_analises"
    __table_args__ = (
        UniqueConstraint("reuniao_id", "indicador_id", name="uq_rtd_analise_reuniao_indicador"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reuniao_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rtd_reunioes.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    indicador_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    fatores_impacto: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    riscos: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Bloco de reversão (indicadores abaixo da meta) — campos LEGADOS de análise única;
    # o plano de ação em lista (acoes) os substitui na UI, mas seguem aceitos.
    causa_analise: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    plano_reversao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # team_persons.id (sem FK rígida — reuse frouxo do teamops).
    responsavel_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    prazo: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    resultado_esperado: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # PLANO DE AÇÃO em lista: [{causa, acao, responsavel_person_id, prazo, resultado_esperado}].
    # Permite N causas/ações por indicador, até o nível "realocar pessoa do time A para o B".
    acoes: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    reuniao: Mapped["RtdReuniao"] = relationship(back_populates="indicador_analises")
