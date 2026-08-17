"""Schemas Pydantic do módulo RTD (Reunião de Tomada de Decisão)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

_TIPO_COMPETENCIA = Literal["mensal", "trimestral"]
_REUNIAO_STATUS = Literal["rascunho", "realizada", "fechada"]
_DELIB_TIPO = Literal["decisao_pendente", "apoio", "priorizacao"]
_DELIB_STATUS = Literal["pendente", "encaminhada", "concluida"]


# ── Reunião ──
class ReuniaoBase(BaseModel):
    titulo: str = Field(..., min_length=1, max_length=200)
    tipo_competencia: _TIPO_COMPETENCIA = "trimestral"
    ano_referencia: int = Field(..., ge=2000, le=2100)
    ordem: int = Field(..., ge=1, le=12)
    observacoes: Optional[str] = None
    data_realizacao: Optional[date] = None


class ReuniaoCreate(ReuniaoBase):
    pass


class ReuniaoUpdate(BaseModel):
    titulo: Optional[str] = Field(None, min_length=1, max_length=200)
    status: Optional[_REUNIAO_STATUS] = None
    observacoes: Optional[str] = None
    data_realizacao: Optional[date] = None
    # Códigos dos planos do EPA (slides da apresentação).
    epa_planos: Optional[list[int]] = None            # Planos Estratégicos
    epa_planos_taticos: Optional[list[int]] = None    # Planos Táticos


class ReuniaoOut(BaseModel):
    id: uuid.UUID
    titulo: str
    tipo_competencia: _TIPO_COMPETENCIA
    ano_referencia: int
    ordem: int
    competencia: str
    periodo_inicio: date
    periodo_fim: date
    status: _REUNIAO_STATUS
    data_realizacao: Optional[date] = None
    observacoes: Optional[str] = None
    epa_planos: Optional[list[int]] = None
    epa_planos_taticos: Optional[list[int]] = None
    total_deliberacoes: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Deliberação ──
class DeliberacaoBase(BaseModel):
    tipo: _DELIB_TIPO = "decisao_pendente"
    titulo: Optional[str] = Field(None, max_length=200)
    descricao: str = Field(..., min_length=1)
    project_task_id: Optional[uuid.UUID] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    prazo: Optional[date] = None
    status: _DELIB_STATUS = "pendente"


class DeliberacaoCreate(DeliberacaoBase):
    pass


class DeliberacaoUpdate(BaseModel):
    tipo: Optional[_DELIB_TIPO] = None
    titulo: Optional[str] = Field(None, max_length=200)
    descricao: Optional[str] = Field(None, min_length=1)
    project_task_id: Optional[uuid.UUID] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    prazo: Optional[date] = None
    status: Optional[_DELIB_STATUS] = None


class DeliberacaoOut(BaseModel):
    id: uuid.UUID
    reuniao_id: uuid.UUID
    project_task_id: Optional[uuid.UUID] = None
    projeto_titulo: Optional[str] = None
    tipo: _DELIB_TIPO
    titulo: Optional[str] = None
    descricao: str
    responsavel_person_id: Optional[uuid.UUID] = None
    responsavel_nome: Optional[str] = None
    prazo: Optional[date] = None
    status: _DELIB_STATUS
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Seção 1: análise por indicador (preenchida na reunião) ──
class AnaliseAcaoItem(BaseModel):
    """Uma linha do PLANO DE AÇÃO de reversão (N por análise): causa → ação →
    responsável/prazo/resultado. Permite chegar ao nível de pessoas (ex.: realocar
    alguém com folga de um time para outro)."""
    causa: Optional[str] = None
    acao: Optional[str] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    prazo: Optional[date] = None
    resultado_esperado: Optional[str] = None


class AnaliseAcaoOut(AnaliseAcaoItem):
    responsavel_nome: Optional[str] = None


class IndicadorAnaliseUpsert(BaseModel):
    """Semântica PUT: o payload SUBSTITUI o registro inteiro — campos ausentes viram null."""
    fatores_impacto: Optional[str] = None
    riscos: Optional[str] = None
    causa_analise: Optional[str] = None
    plano_reversao: Optional[str] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    prazo: Optional[date] = None
    resultado_esperado: Optional[str] = None
    acoes: Optional[list[AnaliseAcaoItem]] = None


class IndicadorAnaliseOut(BaseModel):
    id: uuid.UUID
    reuniao_id: uuid.UUID
    indicador_id: uuid.UUID
    fatores_impacto: Optional[str] = None
    riscos: Optional[str] = None
    causa_analise: Optional[str] = None
    plano_reversao: Optional[str] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    responsavel_nome: Optional[str] = None
    prazo: Optional[date] = None
    resultado_esperado: Optional[str] = None
    acoes: Optional[list[AnaliseAcaoOut]] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PersonMiniOut(BaseModel):
    id: uuid.UUID
    full_name: str


class AcaoSugerida(BaseModel):
    """Ação do plano sugerida pela IA (responsável/prazo ficam com o humano)."""
    causa: Optional[str] = None
    acao: Optional[str] = None
    resultado_esperado: Optional[str] = None


class IndicadorAnaliseSugestao(BaseModel):
    """Sugestão gerada pelo agente de IA — NÃO persistida; preenche o formulário para
    revisão humana. `anonimizacao` = relatório (categoria→contagem) do que foi anonimizado
    no prompt antes do envio externo."""
    fatores_impacto: Optional[str] = None
    riscos: Optional[str] = None
    causa_analise: Optional[str] = None
    plano_reversao: Optional[str] = None
    resultado_esperado: Optional[str] = None
    acoes: list[AcaoSugerida] = Field(default_factory=list)
    anonimizacao: dict[str, int] = Field(default_factory=dict)


# ── Relatório da cerimônia (payload livre; montado no service) ──
class ReuniaoReport(BaseModel):
    meta: dict[str, Any]
    panorama: dict[str, Any]
    por_po: list[dict[str, Any]]
    indicadores: Optional[dict[str, Any]] = None
    # Seção 1 — lista por indicador (dados do período + tendência + análise mesclada).
    indicadores_detalhe: Optional[list[dict[str, Any]]] = None
    produtos_digitais: Optional[dict[str, Any]] = None
    em_desenvolvimento: dict[str, Any]
    deliberacoes: list[DeliberacaoOut] = []
