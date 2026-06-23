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

# ── Enums "Produtos Digitais" (spec TI corporativa) ──
_PROD_STATUS = Literal["ideia", "discovery", "desenvolvimento", "homologacao", "producao", "sustentacao", "evolucao", "suspenso", "descontinuado"]
_PROD_CATEGORIA = Literal["sistema_interno", "sistema_externo", "saas", "dashboard", "api", "integracao", "automacao", "aplicativo", "bi", "workflow", "outro"]
_PROD_UNIDADE = Literal["sesi", "senai", "iel", "fiea", "corporativo"]
_PROD_TIPODEV = Literal["interno", "externo", "hibrido"]
_PROD_MODELO_CONTRAT = Literal["licenca", "saas", "fabrica", "servico_continuado", "projeto_pontual", "interno", "outro"]
_SERVICO_SUPORTE = Literal["interno", "fornecedor", "compartilhado", "service_desk", "devops", "desenvolvimento", "infraestrutura"]
_SERVICO_STATUS = Literal["ativo", "em_implantacao", "suspenso", "descontinuado"]
_DOC_TIPO = Literal["pdf", "planilha", "formulario", "workflow", "dashboard", "registro", "relatorio", "certificado", "termo", "outro"]
_CLASSIFICACAO = Literal["publica", "interna", "confidencial", "restrita"]
_CONTRATO_STATUS = Literal["sem_contrato", "em_formalizacao", "vigente", "a_vencer", "vencido", "em_renovacao", "encerrado"]
_CONTRATO_TIPOVALOR = Literal["mensal", "anual", "global", "sob_demanda"]
_RELEASE_TIPO = Literal["correcao", "melhoria", "nova_funcionalidade", "seguranca", "integracao", "refatoracao", "ajuste_tecnico"]
_RELEASE_STATUS = Literal["planejada", "em_desenvolvimento", "em_homologacao", "publicada", "cancelada", "revertida"]
_RELEASE_IMPACTO = Literal["baixo", "medio", "alto"]
_RELEASE_AMBIENTE = Literal["dev", "hml", "prd"]
_DOCNT_TIPO = Literal["usuario", "tecnica", "api", "implantacao", "sustentacao", "arquitetura", "seguranca", "operacional"]
_DOCNT_STATUS = Literal["nao_iniciada", "em_elaboracao", "publicada", "necessita_atualizacao", "obsoleta"]
_SUPORTE_TIPO = Literal["interna", "fornecedor", "compartilhada"]
_INTEGRACAO_TIPO = Literal["api", "banco", "arquivo", "etl", "webhook", "manual", "outro"]
_AUTENTICACAO_TIPO = Literal["active_directory", "entra_id", "login_local", "sso", "token", "oauth", "outro"]
_RISCO = Literal["baixo", "medio", "alto", "critico"]


# ── Anexo genérico (upload MinIO) ─────────────
class AnexoItem(BaseModel):
    object_name: str
    filename: str
    content_type: Optional[str] = None
    size: Optional[int] = None


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
    area_usuaria: Optional[str] = Field(None, max_length=200)
    processo_relacionado: Optional[str] = Field(None, max_length=200)
    disponibilidade: Optional[str] = Field(None, max_length=120)
    sla_atendimento: Optional[str] = Field(None, max_length=200)
    tipo_suporte: Optional[_SERVICO_SUPORTE] = None
    status_servico: Optional[_SERVICO_STATUS] = None


class ServicoUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    description: Optional[str] = None
    ano_referencia: Optional[int] = None
    area_usuaria: Optional[str] = None
    processo_relacionado: Optional[str] = None
    disponibilidade: Optional[str] = None
    sla_atendimento: Optional[str] = None
    tipo_suporte: Optional[_SERVICO_SUPORTE] = None
    status_servico: Optional[_SERVICO_STATUS] = None


class ServicoResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    ano_referencia: int
    area_usuaria: Optional[str] = None
    processo_relacionado: Optional[str] = None
    disponibilidade: Optional[str] = None
    sla_atendimento: Optional[str] = None
    tipo_suporte: Optional[str] = None
    status_servico: Optional[str] = None
    is_active: bool
    order: int
    model_config = {"from_attributes": True}


class _DocumentoFields(BaseModel):
    tipo_documento: Optional[_DOC_TIPO] = None
    is_nato_digital: Optional[bool] = None
    assinatura_digital: Optional[bool] = None
    trilha_auditoria: Optional[bool] = None
    local_armazenamento: Optional[str] = Field(None, max_length=200)
    prazo_retencao: Optional[str] = Field(None, max_length=120)
    classificacao: Optional[_CLASSIFICACAO] = None
    dados_pessoais: Optional[bool] = None
    dados_sensiveis: Optional[bool] = None
    observacoes: Optional[str] = None


class DocumentoCreate(_DocumentoFields):
    name: str = Field(..., min_length=1, max_length=200)
    ano_referencia: Optional[int] = None
    object_name: Optional[str] = None
    filename: Optional[str] = None
    content_type: Optional[str] = None
    size: Optional[int] = None
    category: Optional[str] = Field(None, max_length=80)
    external_link: Optional[str] = None


class DocumentoUpdate(_DocumentoFields):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    ano_referencia: Optional[int] = None
    category: Optional[str] = None
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
    tipo_documento: Optional[str] = None
    is_nato_digital: bool = True
    assinatura_digital: bool = False
    trilha_auditoria: bool = False
    local_armazenamento: Optional[str] = None
    prazo_retencao: Optional[str] = None
    classificacao: Optional[str] = None
    dados_pessoais: bool = False
    dados_sensiveis: bool = False
    observacoes: Optional[str] = None
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
    # ── Extensão spec ──
    numero: Optional[str] = Field(None, max_length=120)
    objeto_contratual: Optional[str] = None
    status_contrato: Optional[_CONTRATO_STATUS] = None
    valor: Optional[float] = None
    tipo_valor: Optional[_CONTRATO_TIPOVALOR] = None
    centro_custo: Optional[str] = Field(None, max_length=120)
    fiscal_person_id: Optional[uuid.UUID] = None
    sla_contratual: Optional[str] = None
    aditivos: Optional[list["AnexoItem"]] = None
    observacoes: Optional[str] = None

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
    object_name: Optional[str] = None
    filename: Optional[str] = None
    content_type: Optional[str] = None
    size: Optional[int] = None
    external_link: Optional[str] = None
    numero: Optional[str] = None
    objeto_contratual: Optional[str] = None
    status_contrato: Optional[_CONTRATO_STATUS] = None
    valor: Optional[float] = None
    tipo_valor: Optional[_CONTRATO_TIPOVALOR] = None
    centro_custo: Optional[str] = None
    fiscal_person_id: Optional[uuid.UUID] = None
    sla_contratual: Optional[str] = None
    aditivos: Optional[list["AnexoItem"]] = None
    observacoes: Optional[str] = None


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
    numero: Optional[str] = None
    objeto_contratual: Optional[str] = None
    status_contrato: Optional[str] = None
    valor: Optional[float] = None
    tipo_valor: Optional[str] = None
    centro_custo: Optional[str] = None
    fiscal_person_id: Optional[uuid.UUID] = None
    fiscal_nome: Optional[str] = None
    sla_contratual: Optional[str] = None
    aditivos: Optional[list["AnexoItem"]] = None
    observacoes: Optional[str] = None
    is_active: bool
    dias_para_vencer: Optional[int] = None


# ── Produto ───────────────────────────────────
class _ProductDigitalFields(BaseModel):
    """Campos novos 'Produtos Digitais' (todos opcionais) — compartilhados por Create/Update."""
    sigla: Optional[str] = Field(None, max_length=40)
    link_descricao: Optional[str] = None
    categoria: Optional[_PROD_CATEGORIA] = None
    unidade: Optional[_PROD_UNIDADE] = None
    dono_negocio_person_id: Optional[uuid.UUID] = None
    publico_alvo: Optional[str] = None
    url_acesso: Optional[str] = None
    observacoes: Optional[str] = None
    status_produto: Optional[_PROD_STATUS] = None
    tipo_desenvolvimento: Optional[_PROD_TIPODEV] = None
    desenvolvido_por: Optional[str] = Field(None, max_length=200)
    fornecedor_cnpj: Optional[str] = Field(None, max_length=20)
    modelo_contratacao: Optional[_PROD_MODELO_CONTRAT] = None
    ambiente_tecnologico: Optional[str] = None
    tecnologias: Optional[str] = None
    link_repositorio: Optional[str] = None
    link_dev: Optional[str] = None
    link_hml: Optional[str] = None
    link_prd: Optional[str] = None


class ProductCreate(_ProductDigitalFields):
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


class ProductUpdate(_ProductDigitalFields):
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
    # ── campos/derivados spec (para filtros e colunas da listagem) ──
    sigla: Optional[str] = None
    categoria: Optional[str] = None
    unidade: Optional[str] = None
    status_produto: Optional[str] = None
    tipo_desenvolvimento: Optional[str] = None
    fornecedor_nome: Optional[str] = None
    contrato_status: Optional[str] = None      # status do contrato vigente (derivado)
    contrato_vigencia_fim: Optional[date] = None
    contrato_a_vencer: bool = False            # vence em ≤90d
    ultima_release: Optional[str] = None
    doc_status: Optional[str] = None           # status da doc mais recente
    has_documentation: bool = False
    tem_dados_pessoais: bool = False
    is_critico: bool = False


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
    # ── campos novos "Produtos Digitais" ──
    sigla: Optional[str] = None
    link_descricao: Optional[str] = None
    categoria: Optional[str] = None
    unidade: Optional[str] = None
    dono_negocio: Optional[PersonMini] = None
    publico_alvo: Optional[str] = None
    url_acesso: Optional[str] = None
    observacoes: Optional[str] = None
    status_produto: Optional[str] = None
    tipo_desenvolvimento: Optional[str] = None
    desenvolvido_por: Optional[str] = None
    fornecedor_cnpj: Optional[str] = None
    modelo_contratacao: Optional[str] = None
    ambiente_tecnologico: Optional[str] = None
    tecnologias: Optional[str] = None
    link_repositorio: Optional[str] = None
    link_dev: Optional[str] = None
    link_hml: Optional[str] = None
    link_prd: Optional[str] = None
    servicos: list[ServicoResponse]
    documentos: list[DocumentoResponse]
    processos: list[ProdutoProcessoResponse]
    contratos: list[ContratoResponse]
    releases: list["ReleaseResponse"] = Field(default_factory=list)
    documentations: list["DocumentationResponse"] = Field(default_factory=list)
    support: Optional["SupportResponse"] = None
    security: Optional["SecurityResponse"] = None


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


# ── Portfólio de Processos (versionado) ───────
_PP_VERSION_STATUS = Literal["rascunho", "consolidada", "arquivada"]
_PP_NIVEL = Literal["diretoria", "macroprocesso", "processo", "subprocesso"]
_PP_ITEM_STATUS = Literal["proposto", "ativo", "em_revisao", "descontinuado"]
_PP_CRITICIDADE = Literal["baixa", "media", "alta", "critica"]
_PP_MATURIDADE = Literal["inexistente", "inicial", "definido", "gerenciado", "otimizado"]


class ProcessVersionSummary(BaseModel):
    id: uuid.UUID
    version: int
    status: str
    justification: Optional[str]
    consolidated_at: Optional[datetime]
    created_at: datetime
    model_config = {"from_attributes": True}


class ProcessPortfolioCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None


class ProcessPortfolioUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ProcessPortfolioResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    is_active: bool
    current_version_id: Optional[uuid.UUID]
    current_version: Optional[int] = None
    versions_count: int = 0
    created_at: datetime
    model_config = {"from_attributes": True}


class ProcessItemBase(BaseModel):
    nivel: _PP_NIVEL
    codigo: Optional[str] = Field(None, max_length=40)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    diretoria: Optional[str] = Field(None, max_length=200)
    area: Optional[str] = Field(None, max_length=120)
    analista: Optional[str] = Field(None, max_length=200)
    dono: Optional[str] = Field(None, max_length=200)
    parent_id: Optional[uuid.UUID] = None
    order: Optional[int] = None
    analista_person_id: Optional[uuid.UUID] = None
    dono_person_id: Optional[uuid.UUID] = None
    area_id: Optional[uuid.UUID] = None
    vigencia_inicio: Optional[date] = None
    vigencia_fim: Optional[date] = None
    documentado: bool = False
    data_documentacao: Optional[date] = None
    doc_previsao_inicio: Optional[date] = None
    doc_previsao_fim: Optional[date] = None
    anexos: Optional[list[AnexoItem]] = None
    status_item: _PP_ITEM_STATUS = "ativo"
    criticidade: Optional[_PP_CRITICIDADE] = None
    objetivo: Optional[str] = None
    nivel_maturidade: Optional[_PP_MATURIDADE] = None
    tipo_documento: Optional[str] = Field(None, max_length=80)
    versao_documento: Optional[str] = Field(None, max_length=40)
    proxima_revisao: Optional[date] = None
    link_externo: Optional[str] = None
    frequencia: Optional[str] = Field(None, max_length=120)
    entradas: Optional[str] = None
    saidas: Optional[str] = None


class ProcessItemCreate(ProcessItemBase):
    pass


class ProcessItemUpdate(BaseModel):
    codigo: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    diretoria: Optional[str] = Field(None, max_length=200)
    area: Optional[str] = Field(None, max_length=120)
    analista: Optional[str] = Field(None, max_length=200)
    dono: Optional[str] = Field(None, max_length=200)
    parent_id: Optional[uuid.UUID] = None
    order: Optional[int] = None
    analista_person_id: Optional[uuid.UUID] = None
    dono_person_id: Optional[uuid.UUID] = None
    area_id: Optional[uuid.UUID] = None
    vigencia_inicio: Optional[date] = None
    vigencia_fim: Optional[date] = None
    documentado: Optional[bool] = None
    data_documentacao: Optional[date] = None
    doc_previsao_inicio: Optional[date] = None
    doc_previsao_fim: Optional[date] = None
    anexos: Optional[list[AnexoItem]] = None
    status_item: Optional[_PP_ITEM_STATUS] = None
    criticidade: Optional[_PP_CRITICIDADE] = None
    objetivo: Optional[str] = None
    nivel_maturidade: Optional[_PP_MATURIDADE] = None
    tipo_documento: Optional[str] = None
    versao_documento: Optional[str] = None
    proxima_revisao: Optional[date] = None
    link_externo: Optional[str] = None
    frequencia: Optional[str] = None
    entradas: Optional[str] = None
    saidas: Optional[str] = None


class ProcessItemResponse(BaseModel):
    id: uuid.UUID
    lineage_id: uuid.UUID
    parent_id: Optional[uuid.UUID]
    nivel: str
    codigo: Optional[str]
    name: str
    description: Optional[str]
    diretoria: Optional[str] = None
    area: Optional[str] = None
    analista: Optional[str] = None
    dono: Optional[str] = None
    order: int
    analista_person_id: Optional[uuid.UUID]
    analista_nome: Optional[str] = None
    dono_person_id: Optional[uuid.UUID]
    dono_nome: Optional[str] = None
    area_id: Optional[uuid.UUID]
    area_nome: Optional[str] = None
    vigencia_inicio: Optional[date]
    vigencia_fim: Optional[date]
    documentado: bool
    data_documentacao: Optional[date]
    doc_previsao_inicio: Optional[date]
    doc_previsao_fim: Optional[date]
    anexos: Optional[list[AnexoItem]] = None
    status_item: str
    criticidade: Optional[str]
    objetivo: Optional[str]
    nivel_maturidade: Optional[str]
    tipo_documento: Optional[str]
    versao_documento: Optional[str]
    proxima_revisao: Optional[date]
    link_externo: Optional[str]
    frequencia: Optional[str]
    entradas: Optional[str]
    saidas: Optional[str]
    children: list["ProcessItemResponse"] = Field(default_factory=list)


class ProcessVersionTree(BaseModel):
    id: uuid.UUID
    portfolio_id: uuid.UUID
    version: int
    status: str
    justification: Optional[str]
    consolidated_at: Optional[datetime]
    created_at: datetime
    editable: bool
    items: list[ProcessItemResponse] = Field(default_factory=list)


class CreateVersionRequest(BaseModel):
    justification: str = Field(..., min_length=3)


class ServiceLinkSetRequest(BaseModel):
    portfolio_id: uuid.UUID
    item_lineage_ids: list[uuid.UUID] = Field(default_factory=list)


class ServiceLinkItem(BaseModel):
    item_lineage_id: uuid.UUID
    portfolio_id: uuid.UUID
    name: Optional[str] = None
    codigo: Optional[str] = None


class ProcessItemReorderEntry(BaseModel):
    id: uuid.UUID
    order: int


class ProcessItemReorderRequest(BaseModel):
    items: list[ProcessItemReorderEntry] = Field(default_factory=list)


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
    # ── KPIs "Produtos Digitais" (spec §10.4) ──
    by_status: dict[str, int] = Field(default_factory=dict)
    em_desenvolvimento: int = 0
    em_producao: int = 0
    em_sustentacao: int = 0
    descontinuados: int = 0
    internos: int = 0
    externos: int = 0
    sem_contrato: int = 0
    contratos_a_vencer_90d: int = 0
    sem_documentacao: int = 0
    criticos: int = 0
    com_dados_pessoais: int = 0
    com_plano_contingencia: int = 0
    releases_publicadas_mes: int = 0


# ─────────────────────────────────────────────
# Produtos Digitais — Release / Documentação / Sustentação / Segurança
# ─────────────────────────────────────────────

class _ReleaseFields(BaseModel):
    nome: Optional[str] = Field(None, max_length=200)
    data_release: Optional[date] = None
    ambiente: Optional[_RELEASE_AMBIENTE] = None
    tipo: Optional[_RELEASE_TIPO] = None
    descricao_mudanca: Optional[str] = None
    impacto: Optional[_RELEASE_IMPACTO] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    evidencia_link: Optional[str] = None
    evidencia_anexos: Optional[list[AnexoItem]] = None
    changelog: Optional[str] = None
    tem_rollback: Optional[bool] = None
    descricao_rollback: Optional[str] = None
    doc_atualizada: Optional[bool] = None
    status: Optional[_RELEASE_STATUS] = None


class ReleaseCreate(_ReleaseFields):
    versao: str = Field(..., min_length=1, max_length=60)

    @model_validator(mode="after")
    def _publicada(self):
        if self.status == "publicada":
            faltando = [f for f in ("data_release", "ambiente", "tipo", "descricao_mudanca") if not getattr(self, f)]
            if faltando:
                raise ValueError("Release publicada exige data, ambiente, tipo e descrição da mudança.")
        return self


class ReleaseUpdate(_ReleaseFields):
    versao: Optional[str] = Field(None, min_length=1, max_length=60)


class ReleaseResponse(BaseModel):
    id: uuid.UUID
    versao: str
    nome: Optional[str]
    data_release: Optional[date]
    ambiente: Optional[str]
    tipo: Optional[str]
    descricao_mudanca: Optional[str]
    impacto: Optional[str]
    responsavel_person_id: Optional[uuid.UUID]
    responsavel_nome: Optional[str] = None
    evidencia_link: Optional[str]
    evidencia_anexos: Optional[list[AnexoItem]] = None
    changelog: Optional[str]
    tem_rollback: bool
    descricao_rollback: Optional[str]
    doc_atualizada: bool
    status: str
    created_at: datetime


class _DocumentationFields(BaseModel):
    tipo: Optional[_DOCNT_TIPO] = None
    conteudo_md: Optional[str] = None
    versao_relacionada: Optional[str] = Field(None, max_length=60)
    autor_person_id: Optional[uuid.UUID] = None
    status: Optional[_DOCNT_STATUS] = None
    link_interno: Optional[str] = None
    anexos: Optional[list[AnexoItem]] = None


class DocumentationCreate(_DocumentationFields):
    titulo: str = Field(..., min_length=1, max_length=200)

    @model_validator(mode="after")
    def _publicada(self):
        if self.status == "publicada" and not (self.conteudo_md and self.conteudo_md.strip()):
            raise ValueError("Documentação publicada exige conteúdo Markdown preenchido.")
        return self


class DocumentationUpdate(_DocumentationFields):
    titulo: Optional[str] = Field(None, min_length=1, max_length=200)


class DocumentationResponse(BaseModel):
    id: uuid.UUID
    tipo: str
    titulo: str
    conteudo_md: Optional[str]
    versao_relacionada: Optional[str]
    autor_person_id: Optional[uuid.UUID]
    autor_nome: Optional[str] = None
    status: str
    link_interno: Optional[str]
    anexos: Optional[list[AnexoItem]] = None
    created_at: datetime
    updated_at: datetime


class SupportUpsert(BaseModel):
    tipo: Optional[_SUPORTE_TIPO] = None
    canal_atendimento: Optional[str] = None
    sla_critico: Optional[str] = None
    sla_medio: Optional[str] = None
    sla_solicitacao: Optional[str] = None
    equipe_responsavel: Optional[str] = None
    horario_suporte: Optional[str] = None
    escalonamento: Optional[str] = None
    link_base_conhecimento: Optional[str] = None
    observacoes: Optional[str] = None


class SupportResponse(SupportUpsert):
    id: uuid.UUID
    model_config = {"from_attributes": True}


class SecurityUpsert(BaseModel):
    possui_integracao: Optional[bool] = None
    sistemas_integrados: Optional[str] = None
    tipo_integracao: Optional[_INTEGRACAO_TIPO] = None
    dados_tratados: Optional[str] = None
    dados_pessoais: Optional[bool] = None
    dados_sensiveis: Optional[bool] = None
    classificacao: Optional[_CLASSIFICACAO] = None
    tipo_autenticacao: Optional[_AUTENTICACAO_TIPO] = None
    perfis_acesso: Optional[str] = None
    logs_auditoria: Optional[bool] = None
    backup: Optional[bool] = None
    plano_contingencia: Optional[bool] = None
    risco_indisponibilidade: Optional[_RISCO] = None
    observacoes: Optional[str] = None


class SecurityResponse(SecurityUpsert):
    id: uuid.UUID
    model_config = {"from_attributes": True}


# Resolve forward references (ProductResponse referencia Release/Documentation/Support/Security;
# Contrato* referenciam AnexoItem).
ProductResponse.model_rebuild()
ContratoCreate.model_rebuild()
ContratoUpdate.model_rebuild()
ContratoResponse.model_rebuild()
