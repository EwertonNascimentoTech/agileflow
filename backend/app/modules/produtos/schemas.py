"""Schemas Pydantic do módulo Produtos (Portfólio)."""

import uuid
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

_ORIGEM = Literal["interno", "cots", "customizacao", "saas"]
_LIFECYCLE = Literal["concepcao", "desenvolvimento", "producao", "descontinuado"]
_CRITICIDADE = Literal["baixa", "media", "alta", "critica"]
_NIVEL = Literal["macroprocesso", "processo", "subprocesso"]
_SUSTENTACAO = Literal["interna", "externa", "hibrida"]
_GROUP_BY = Literal["produto", "area", "setor", "portfolio"]


# ── Org refs (reusa teamops) ──────────────────
class AreaRefMini(BaseModel):
    id: uuid.UUID
    name: str
    setor_name: Optional[str] = None


class PersonMini(BaseModel):
    id: uuid.UUID
    full_name: str
    model_config = {"from_attributes": True}


# ── Fornecedor ────────────────────────────────
class FornecedorCreate(BaseModel):
    nome: str = Field(..., min_length=2, max_length=200)
    cnpj: Optional[str] = Field(None, max_length=20)
    contato: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    notes: Optional[str] = None


class FornecedorUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=2, max_length=200)
    cnpj: Optional[str] = None
    contato: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    notes: Optional[str] = None


class FornecedorResponse(BaseModel):
    id: uuid.UUID
    nome: str
    cnpj: Optional[str]
    contato: Optional[str]
    email: Optional[str]
    telefone: Optional[str]
    notes: Optional[str]
    is_active: bool
    model_config = {"from_attributes": True}


# ── Serviços / Documentos (com ano) ───────────
class ServicoCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    description: Optional[str] = None
    ano_referencia: Optional[int] = None


class ServicoResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    ano_referencia: int
    is_active: bool
    order: int
    model_config = {"from_attributes": True}


class DocumentoCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    ano_referencia: Optional[int] = None
    object_name: Optional[str] = None
    filename: Optional[str] = None
    content_type: Optional[str] = None
    size: Optional[int] = None
    category: Optional[str] = Field(None, max_length=80)
    external_link: Optional[str] = None


class DocumentoResponse(BaseModel):
    id: uuid.UUID
    name: str
    ano_referencia: int
    object_name: Optional[str]
    filename: Optional[str]
    content_type: Optional[str]
    size: Optional[int]
    category: Optional[str]
    external_link: Optional[str]
    is_active: bool
    order: int
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Catálogo de processos (global) ────────────
class ProcessoCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    description: Optional[str] = None
    nivel: _NIVEL
    parent_id: Optional[uuid.UUID] = None


class ProcessoUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    description: Optional[str] = None
    order: Optional[int] = None


class ProcessoResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    nivel: str
    parent_id: Optional[uuid.UUID]
    is_active: bool
    order: int
    children: list["ProcessoResponse"] = Field(default_factory=list)
    model_config = {"from_attributes": True}


# ── Vínculo Produto–Processo (anual) ──────────
class ProdutoProcessoCreate(BaseModel):
    processo_id: uuid.UUID
    ano_referencia: Optional[int] = None
    automatizado: bool = False


class ProdutoProcessoUpdate(BaseModel):
    automatizado: Optional[bool] = None
    ano_referencia: Optional[int] = None


class ProdutoProcessoResponse(BaseModel):
    id: uuid.UUID
    processo_id: uuid.UUID
    processo_nome: Optional[str] = None
    macroprocesso_nome: Optional[str] = None
    processo_pai_nome: Optional[str] = None
    ano_referencia: int
    automatizado: bool
    is_active: bool


# ── Contrato ──────────────────────────────────
class ContratoCreate(BaseModel):
    fornecedor_id: uuid.UUID
    identificador: Optional[str] = Field(None, max_length=120)
    vigencia_inicio: date
    vigencia_fim: date
    renovacao_automatica: bool = False
    modelo_licenciamento: Optional[str] = Field(None, max_length=120)
    gestor_person_id: Optional[uuid.UUID] = None
    sustentacao_n1: _SUSTENTACAO = "interna"
    sustentacao_n2: _SUSTENTACAO = "interna"
    sustentacao_n3: _SUSTENTACAO = "interna"
    alerta_dias: Optional[list[int]] = None
    object_name: Optional[str] = None
    filename: Optional[str] = None
    content_type: Optional[str] = None
    size: Optional[int] = None
    external_link: Optional[str] = None

    @model_validator(mode="after")
    def _vigencia(self):
        if self.vigencia_fim <= self.vigencia_inicio:
            raise ValueError("A vigência final deve ser posterior à inicial.")
        return self


class ContratoUpdate(BaseModel):
    identificador: Optional[str] = None
    vigencia_inicio: Optional[date] = None
    vigencia_fim: Optional[date] = None
    renovacao_automatica: Optional[bool] = None
    modelo_licenciamento: Optional[str] = None
    gestor_person_id: Optional[uuid.UUID] = None
    sustentacao_n1: Optional[_SUSTENTACAO] = None
    sustentacao_n2: Optional[_SUSTENTACAO] = None
    sustentacao_n3: Optional[_SUSTENTACAO] = None
    alerta_dias: Optional[list[int]] = None


class ContratoResponse(BaseModel):
    id: uuid.UUID
    fornecedor_id: uuid.UUID
    fornecedor_nome: Optional[str] = None
    identificador: Optional[str]
    vigencia_inicio: date
    vigencia_fim: date
    renovacao_automatica: bool
    modelo_licenciamento: Optional[str]
    gestor_person_id: Optional[uuid.UUID]
    gestor_nome: Optional[str] = None
    sustentacao_n1: str
    sustentacao_n2: str
    sustentacao_n3: str
    alerta_dias: list[int]
    object_name: Optional[str]
    filename: Optional[str]
    external_link: Optional[str]
    is_active: bool
    dias_para_vencer: Optional[int] = None


# ── Produto ───────────────────────────────────
class ProductCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    simbolo: Optional[str] = Field(None, max_length=80)
    description: Optional[str] = None
    dominio_funcional: Optional[str] = Field(None, max_length=160)
    origem: _ORIGEM = "interno"
    lifecycle: _LIFECYCLE = "desenvolvimento"
    criticidade: _CRITICIDADE = "media"
    data_entrada_producao: Optional[date] = None
    area_id: Optional[uuid.UUID] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    fornecedor_id: Optional[uuid.UUID] = None
    origin_task_id: Optional[uuid.UUID] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    simbolo: Optional[str] = None
    description: Optional[str] = None
    dominio_funcional: Optional[str] = None
    origem: Optional[_ORIGEM] = None
    lifecycle: Optional[_LIFECYCLE] = None
    criticidade: Optional[_CRITICIDADE] = None
    data_entrada_producao: Optional[date] = None
    area_id: Optional[uuid.UUID] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    fornecedor_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class ProductListItem(BaseModel):
    id: uuid.UUID
    name: str
    simbolo: Optional[str]
    origem: str
    lifecycle: str
    criticidade: str
    area_name: Optional[str] = None
    setor_name: Optional[str] = None
    responsavel_nome: Optional[str] = None
    requires_contract: bool
    has_active_contract: bool
    is_active: bool
    created_at: datetime


class ProductResponse(BaseModel):
    id: uuid.UUID
    name: str
    simbolo: Optional[str]
    description: Optional[str]
    dominio_funcional: Optional[str]
    origem: str
    lifecycle: str
    criticidade: str
    data_entrada_producao: Optional[date]
    area: Optional[AreaRefMini]
    setor_name: Optional[str]
    responsavel: Optional[PersonMini]
    fornecedor: Optional[FornecedorResponse]
    origin_task_id: Optional[uuid.UUID]
    is_active: bool
    requires_contract: bool
    has_active_contract: bool
    created_at: datetime
    updated_at: datetime
    servicos: list[ServicoResponse]
    documentos: list[DocumentoResponse]
    processos: list[ProdutoProcessoResponse]
    contratos: list[ContratoResponse]


# ── Projeto finalizado → produto ──────────────
class FinalizedProjectItem(BaseModel):
    task_id: uuid.UUID
    title: str
    description: Optional[str]
    completed_at: Optional[datetime]
    already_promoted: bool
    product_id: Optional[uuid.UUID] = None


class CreateFromProjectRequest(BaseModel):
    task_id: uuid.UUID
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    area_id: Optional[uuid.UUID] = None
    responsavel_person_id: Optional[uuid.UUID] = None


# ── Uploads ───────────────────────────────────
class ProductUploadResponse(BaseModel):
    object_name: str
    filename: str
    content_type: str
    size: int


class ProductUploadUrlResponse(BaseModel):
    url: str


# ── Indicadores ───────────────────────────────
class IndicadorCounts(BaseModel):
    servicos: int
    documentos: int
    processos_automatizados: int


class IndicadorGroupItem(BaseModel):
    key: str           # id (produto/area/setor) ou "portfolio"
    label: str
    counts: IndicadorCounts


class IndicadorResponse(BaseModel):
    ano: int
    group_by: str
    grupos: list[IndicadorGroupItem]
    total: IndicadorCounts


class IndicadorSeriesPoint(BaseModel):
    ano: int
    counts: IndicadorCounts


class ProcessoConsolidacaoNode(BaseModel):
    id: uuid.UUID
    name: str
    nivel: str
    automatizados: int  # total consolidado (soma da subárvore)
    children: list["ProcessoConsolidacaoNode"] = Field(default_factory=list)


# ── Alertas ───────────────────────────────────
class AlertaContrato(BaseModel):
    tipo: str  # "vencimento" | "sem_contrato"
    product_id: uuid.UUID
    product_name: str
    contrato_id: Optional[uuid.UUID] = None
    vigencia_fim: Optional[date] = None
    dias_para_vencer: Optional[int] = None
    mensagem: str


# ── Dashboard ─────────────────────────────────
class DashboardKpis(BaseModel):
    total_products: int
    active_products: int
    by_lifecycle: dict[str, int]
    by_criticidade: dict[str, int]
    total_servicos: int
    total_documentos: int
    total_processos_automatizados: int
    contratos_vencendo: int
