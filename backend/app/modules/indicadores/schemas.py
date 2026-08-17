"""Schemas Pydantic do módulo Indicadores."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

_CATEGORIA = Literal["estrategico", "tatico"]
_GRANULARIDADE = Literal["mensal", "bimestral", "trimestral", "semestral", "anual"]
_SENTIDO = Literal["maior_melhor", "menor_melhor", "faixa_ideal"]
_STATUS = Literal["ativo", "inativo"]
_FONTE = Literal["manual", "portfolio"]
_FONTE_METRICA = Literal[
    # Produtos
    "servicos_publicados", "documentos_natos_digitais",
    # Projetos (indicadores táticos — ver portfolio_projetos.py)
    "cronograma_desenvolvimento", "cronograma_implantacao",
    "desvio_trabalho_desenvolvimento", "desvio_trabalho_implantacao",
    "pct_desenvolvimento", "tempo_analise_oportunidade", "lead_time_us",
    "pct_sla_estourado", "taxa_impedimento", "pct_projetos_ia",
]
_ACOMP_STATUS = Literal["pendente", "atingido", "em_atencao", "nao_atingido"]


class AreaRefMini(BaseModel):
    id: uuid.UUID
    name: str
    setor_name: Optional[str] = None


class PersonMini(BaseModel):
    id: uuid.UUID
    full_name: str

    model_config = {"from_attributes": True}


class AnexoItem(BaseModel):
    object_name: str
    filename: str
    content_type: Optional[str] = None
    size: Optional[int] = None


class PortfolioServicoRef(BaseModel):
    product_id: uuid.UUID
    product_name: str
    servico_id: uuid.UUID
    servico_name: str
    lifecycle: str
    data_publicacao: Optional[date] = None
    em_producao: bool = False
    novo_no_mes: bool = False


class PortfolioDocumentoRef(BaseModel):
    product_id: uuid.UUID
    product_name: str
    documento_id: uuid.UUID
    documento_name: str
    lifecycle: str
    data_documento: Optional[date] = None
    em_producao: bool = False
    novo_no_mes: bool = False


class PortfolioLinkRef(BaseModel):
    label: str
    url: str


class _IndicadorFields(BaseModel):
    nome: str
    categoria: _CATEGORIA
    descricao: Optional[str] = None
    objetivo_estrategico: Optional[str] = None
    sub_processo: Optional[str] = None
    area_id: Optional[uuid.UUID] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    unidade_medida: Optional[str] = None
    formula_calculo: Optional[str] = None
    fonte_dados: Optional[str] = None
    granularidade: _GRANULARIDADE
    periodicidade_atualizacao: Optional[str] = None
    sentido: _SENTIDO
    meta_min: Optional[float] = None
    meta_max: Optional[float] = None
    tolerancia_pct: Optional[float] = 20
    fonte: _FONTE = "manual"
    fonte_metrica: Optional[_FONTE_METRICA] = None
    fonte_corte: Optional[date] = None
    status: _STATUS = "ativo"


class IndicadorCreate(_IndicadorFields):
    codigo: str
    anos_referencia: Optional[list[int]] = None

    @model_validator(mode="after")
    def _faixa(self) -> "IndicadorCreate":
        if self.sentido == "faixa_ideal" and (self.meta_min is None or self.meta_max is None):
            raise ValueError("Faixa ideal exige meta_min e meta_max.")
        if self.meta_min is not None and self.meta_max is not None and self.meta_min > self.meta_max:
            raise ValueError("meta_min não pode ser maior que meta_max.")
        return self


class IndicadorUpdate(BaseModel):
    codigo: Optional[str] = None
    nome: Optional[str] = None
    categoria: Optional[_CATEGORIA] = None
    descricao: Optional[str] = None
    objetivo_estrategico: Optional[str] = None
    sub_processo: Optional[str] = None
    area_id: Optional[uuid.UUID] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    unidade_medida: Optional[str] = None
    formula_calculo: Optional[str] = None
    fonte_dados: Optional[str] = None
    granularidade: Optional[_GRANULARIDADE] = None
    periodicidade_atualizacao: Optional[str] = None
    sentido: Optional[_SENTIDO] = None
    meta_min: Optional[float] = None
    meta_max: Optional[float] = None
    tolerancia_pct: Optional[float] = None
    fonte: Optional[_FONTE] = None
    fonte_metrica: Optional[_FONTE_METRICA] = None
    fonte_corte: Optional[date] = None
    status: Optional[_STATUS] = None
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def _faixa(self) -> "IndicadorUpdate":
        if self.sentido == "faixa_ideal" and self.meta_min is not None and self.meta_max is not None:
            if self.meta_min > self.meta_max:
                raise ValueError("meta_min não pode ser maior que meta_max.")
        return self


class AcompanhamentoResponse(BaseModel):
    id: uuid.UUID
    indicador_id: uuid.UUID
    ano_referencia: int
    ordem: int
    competencia: str
    periodo_inicio: date
    periodo_fim: date
    meta: Optional[float] = None
    realizado: Optional[float] = None
    percentual_atingimento: Optional[float] = None
    status: _ACOMP_STATUS
    fonte: _FONTE
    bloqueado: bool = False
    observacao: Optional[str] = None
    evidencias: Optional[list[AnexoItem]] = None
    portfolio_servicos: Optional[list[PortfolioServicoRef]] = None
    portfolio_servicos_novos: Optional[list[PortfolioServicoRef]] = None
    portfolio_documentos: Optional[list[PortfolioDocumentoRef]] = None
    portfolio_documentos_novos: Optional[list[PortfolioDocumentoRef]] = None
    portfolio_links: Optional[list[PortfolioLinkRef]] = None
    portfolio_links_novos: Optional[list[PortfolioLinkRef]] = None
    created_at: datetime
    updated_at: datetime
    updated_by: Optional[uuid.UUID] = None

    model_config = {"from_attributes": True}


class AcompanhamentoUpdate(BaseModel):
    meta: Optional[float] = None
    realizado: Optional[float] = None
    observacao: Optional[str] = None
    evidencias: Optional[list[AnexoItem]] = None
    fonte: Optional[_FONTE] = None
    limpar_meta: bool = False
    limpar_realizado: bool = False
    # Trava de fechamento: True congela o mês; False desbloqueia. None = não altera.
    bloqueado: Optional[bool] = None


class AcompanhamentoEvidenciasResponse(BaseModel):
    fonte: str
    evidencias: list[AnexoItem] = Field(default_factory=list)
    evidencias_novos: list[AnexoItem] = Field(default_factory=list)
    portfolio_servicos: list[PortfolioServicoRef] = Field(default_factory=list)
    portfolio_servicos_novos: list[PortfolioServicoRef] = Field(default_factory=list)
    portfolio_documentos: list[PortfolioDocumentoRef] = Field(default_factory=list)
    portfolio_documentos_novos: list[PortfolioDocumentoRef] = Field(default_factory=list)
    portfolio_links: list[PortfolioLinkRef] = Field(default_factory=list)
    portfolio_links_novos: list[PortfolioLinkRef] = Field(default_factory=list)


class IndicadorResponse(BaseModel):
    id: uuid.UUID
    codigo: str
    nome: str
    categoria: _CATEGORIA
    descricao: Optional[str] = None
    objetivo_estrategico: Optional[str] = None
    sub_processo: Optional[str] = None
    area: Optional[AreaRefMini] = None
    responsavel: Optional[PersonMini] = None
    unidade_medida: Optional[str] = None
    formula_calculo: Optional[str] = None
    fonte_dados: Optional[str] = None
    granularidade: _GRANULARIDADE
    periodicidade_atualizacao: Optional[str] = None
    sentido: _SENTIDO
    meta_min: Optional[float] = None
    meta_max: Optional[float] = None
    tolerancia_pct: float
    fonte: _FONTE
    fonte_metrica: Optional[_FONTE_METRICA] = None
    fonte_corte: Optional[date] = None
    fonte_portfolio_num: Optional[int] = None
    fonte_portfolio_den: Optional[int] = None
    fonte_portfolio_pct: Optional[float] = None
    status: _STATUS
    is_active: bool
    created_at: datetime
    updated_at: datetime
    anos: list[int] = Field(default_factory=list)
    acompanhamentos: list[AcompanhamentoResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class IndicadorListItem(BaseModel):
    id: uuid.UUID
    codigo: str
    nome: str
    categoria: _CATEGORIA
    sub_processo: Optional[str] = None
    area_id: Optional[uuid.UUID] = None
    area_name: Optional[str] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    responsavel_nome: Optional[str] = None
    unidade_medida: Optional[str] = None
    granularidade: _GRANULARIDADE
    sentido: _SENTIDO
    status: _STATUS
    is_active: bool
    ano_referencia: Optional[int] = None
    percentual_atingimento: Optional[float] = None
    status_atual: Optional[_ACOMP_STATUS] = None
    created_at: datetime


class DashboardKpis(BaseModel):
    total: int
    total_estrategicos: int
    total_taticos: int
    atingidos: int
    em_atencao: int
    nao_atingidos: int
    pendentes_atualizacao: int
    percentual_geral_atingimento: float
    por_categoria: dict[str, int] = Field(default_factory=dict)
    por_area: dict[str, int] = Field(default_factory=dict)


class DashboardChartPeriodo(BaseModel):
    competencia: str
    ordem: int
    meta: Optional[float] = None
    realizado: Optional[float] = None
    percentual_atingimento: Optional[float] = None
    status: _ACOMP_STATUS = "pendente"


class DashboardChartIndicador(BaseModel):
    id: uuid.UUID
    codigo: str
    nome: str
    categoria: _CATEGORIA
    unidade_medida: Optional[str] = None
    area_name: Optional[str] = None
    sub_processo: Optional[str] = None
    formula_calculo: Optional[str] = None
    sentido: Optional[_SENTIDO] = None
    granularidade: Optional[_GRANULARIDADE] = None
    meta_min: Optional[float] = None
    meta_max: Optional[float] = None
    periodos: list[DashboardChartPeriodo] = Field(default_factory=list)


class DashboardCharts(BaseModel):
    indicadores: list[DashboardChartIndicador] = Field(default_factory=list)


class UploadResponse(BaseModel):
    object_name: str
    filename: str
    content_type: str
    size: int


class UploadUrlResponse(BaseModel):
    url: str
