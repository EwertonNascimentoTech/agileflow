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
_PROD_CATEGORIA = Literal["sistema_interno_dev", "sistema_interno_ia", "sistema_externo_ia", "sistema_externo_implantacao", "sistema_externo_hibrido", "sistema_externo_dn"]
_PROD_UNIDADE = Literal["sesi", "senai", "iel", "fiea", "corporativo"]
_PROD_MODELO_CONTRAT = Literal["licenca", "saas", "fabrica", "servico_continuado", "projeto_pontual", "interno", "outro"]
_SERVICO_SUPORTE = Literal["interno", "fornecedor", "compartilhado", "service_desk", "devops", "desenvolvimento", "infraestrutura"]
_SERVICO_STATUS = Literal["ativo", "em_implantacao", "suspenso", "descontinuado"]
_DOC_ESPECIE = Literal[
    "relatorio", "parecer", "termo", "certificado", "formulario_eletronico", "dashboard",
    "registro_sistemico", "comprovante_recibo", "extrato", "documento_fiscal_eletronico", "oficio", "outro",
]
_DOC_FORMATO = Literal["pdf", "xlsx", "xls", "docx", "doc", "xml", "csv", "txt", "imagem", "outro"]
_NIVEL_LGPD = Literal["sem_dados_pessoais", "dados_pessoais", "dados_pessoais_sensiveis"]
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


class StackMini(BaseModel):
    id: uuid.UUID
    name: str
    category: Optional[str] = None
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


class DefinirFornecedorRequest(BaseModel):
    fornecedor_id: Optional[uuid.UUID] = None


# ── Serviços / Documentos (com ano) ───────────
class ServicoCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    description: Optional[str] = None
    data_publicacao: Optional[date] = None
    status_servico: _SERVICO_STATUS
    # PO do serviço (usado em produtos corporativos)
    responsavel_person_id: Optional[uuid.UUID] = None
    # legado — mantidos opcionais para compatibilidade
    ano_referencia: Optional[int] = None
    area_usuaria: Optional[str] = Field(None, max_length=200)
    processo_relacionado: Optional[str] = Field(None, max_length=200)
    disponibilidade: Optional[str] = Field(None, max_length=120)
    sla_atendimento: Optional[str] = Field(None, max_length=200)
    tipo_suporte: Optional[_SERVICO_SUPORTE] = None


class ServicoSubprocessoDispensa(BaseModel):
    sem_subprocesso_disponivel: bool = False
    justificativa_sem_subprocesso: Optional[str] = None

    @model_validator(mode="after")
    def _justificativa_obrigatoria(self) -> "ServicoSubprocessoDispensa":
        if self.sem_subprocesso_disponivel and not (self.justificativa_sem_subprocesso or "").strip():
            raise ValueError("Informe a justificativa quando não houver sub-processo disponível para vincular.")
        return self


class ServicoUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    description: Optional[str] = None
    data_publicacao: Optional[date] = None
    status_servico: Optional[_SERVICO_STATUS] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    ano_referencia: Optional[int] = None
    area_usuaria: Optional[str] = None
    processo_relacionado: Optional[str] = None
    disponibilidade: Optional[str] = None
    sla_atendimento: Optional[str] = None
    tipo_suporte: Optional[_SERVICO_SUPORTE] = None


class ServicoResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    data_publicacao: Optional[date] = None
    ano_referencia: int
    area_usuaria: Optional[str] = None
    processo_relacionado: Optional[str] = None
    disponibilidade: Optional[str] = None
    sla_atendimento: Optional[str] = None
    tipo_suporte: Optional[str] = None
    status_servico: Optional[str] = None
    responsavel_person_id: Optional[uuid.UUID] = None
    responsavel: Optional[PersonMini] = None
    process_links: list["ServiceLinkItem"] = Field(default_factory=list)
    sem_subprocesso_disponivel: bool = False
    justificativa_sem_subprocesso: Optional[str] = None
    is_active: bool
    order: int
    model_config = {"from_attributes": True}


class _DocumentoFields(BaseModel):
    tipo_documento: Optional[_DOC_ESPECIE] = None
    formato: Optional[_DOC_FORMATO] = None
    origem_sistema: Optional[str] = Field(None, max_length=200)
    is_nato_digital: Optional[bool] = None
    assinatura_digital: Optional[bool] = None
    trilha_auditoria: Optional[bool] = None
    local_armazenamento: Optional[str] = Field(None, max_length=200)
    prazo_retencao: Optional[str] = Field(None, max_length=120)
    classificacao: Optional[_CLASSIFICACAO] = None
    nivel_dados_pessoais: Optional[_NIVEL_LGPD] = None
    dados_pessoais: Optional[bool] = None
    dados_sensiveis: Optional[bool] = None
    observacoes: Optional[str] = None


class DocumentoCreate(_DocumentoFields):
    name: str = Field(..., min_length=1, max_length=200)
    data_documento: Optional[date] = None
    ano_referencia: Optional[int] = None
    object_name: Optional[str] = None
    filename: Optional[str] = None
    content_type: Optional[str] = None
    size: Optional[int] = None
    category: Optional[str] = Field(None, max_length=80)
    external_link: Optional[str] = None


class DocumentoUpdate(_DocumentoFields):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    data_documento: Optional[date] = None
    ano_referencia: Optional[int] = None
    category: Optional[str] = None
    external_link: Optional[str] = None
    formato: Optional[_DOC_FORMATO] = None
    origem_sistema: Optional[str] = Field(None, max_length=200)


class DocumentoResponse(BaseModel):
    id: uuid.UUID
    name: str
    data_documento: Optional[date] = None
    ano_referencia: int
    object_name: Optional[str]
    filename: Optional[str]
    content_type: Optional[str]
    size: Optional[int]
    category: Optional[str]
    external_link: Optional[str]
    tipo_documento: Optional[str] = None
    formato: Optional[str] = None
    origem_sistema: Optional[str] = None
    is_nato_digital: bool = True
    assinatura_digital: bool = False
    trilha_auditoria: bool = False
    local_armazenamento: Optional[str] = None
    prazo_retencao: Optional[str] = None
    classificacao: Optional[str] = None
    nivel_dados_pessoais: Optional[str] = None
    dados_pessoais: bool = False
    dados_sensiveis: bool = False
    observacoes: Optional[str] = None
    is_active: bool
    order: int
    created_at: datetime
    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _fill_nivel_lgpd(self) -> "DocumentoResponse":
        if not self.nivel_dados_pessoais:
            if self.dados_sensiveis:
                self.nivel_dados_pessoais = "dados_pessoais_sensiveis"
            elif self.dados_pessoais:
                self.nivel_dados_pessoais = "dados_pessoais"
            else:
                self.nivel_dados_pessoais = "sem_dados_pessoais"
        return self


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
    identificador: Optional[str] = Field(None, max_length=255)
    vigencia_inicio: date
    vigencia_fim: date
    renovacao_automatica: bool = False
    modelo_licenciamento: Optional[str] = None
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
    numero: Optional[str] = Field(None, max_length=255)
    objeto_contratual: Optional[str] = None
    status_contrato: Optional[_CONTRATO_STATUS] = None
    valor: Optional[float] = None
    tipo_valor: Optional[_CONTRATO_TIPOVALOR] = None
    centro_custo: Optional[str] = Field(None, max_length=255)
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
    desenvolvido_por: Optional[str] = Field(None, max_length=200)
    fornecedor_cnpj: Optional[str] = Field(None, max_length=20)
    modelo_contratacao: Optional[_PROD_MODELO_CONTRAT] = None
    ambiente_tecnologico: Optional[str] = None
    tecnologias: Optional[str] = None
    link_repositorio: Optional[str] = None
    link_dev: Optional[str] = None
    link_hml: Optional[str] = None
    link_prd: Optional[str] = None
    login_idigital: Optional[bool] = None     # autenticação via Idigital
    corporativo: Optional[bool] = None        # PO por serviço (não no produto)


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
    responsavel_tecnico_person_id: Optional[uuid.UUID] = None
    stack_ids: Optional[list[uuid.UUID]] = None
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
    responsavel_tecnico_person_id: Optional[uuid.UUID] = None
    stack_ids: Optional[list[uuid.UUID]] = None
    fornecedor_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class ProductAlerta(BaseModel):
    """Alerta de governança/portfólio derivado do estado do produto (calculado na listagem)."""
    code: str          # producao_sem_servico | tecnico_nao_referencia | sem_documentacao | externo_sem_contrato | produto_parado | doc_desatualizada
    nivel: str         # alto | medio
    message: str


class HealthCheck(BaseModel):
    """Item transparente do score de saúde/maturidade do produto."""
    code: str
    label: str
    status: str        # pass | fail | na
    weight: int


class ProductHealth(BaseModel):
    """Score 0–100 ponderado, com breakdown para transparência."""
    score: int                       # 0..100 (100 se nenhum check aplicável)
    classe: str                      # saudavel | atencao | critico
    applicable_weight: int
    passed_weight: int
    checks: list[HealthCheck] = []


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
    responsavel_tecnico_nome: Optional[str] = None
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
    corporativo: bool = False
    alertas: list[ProductAlerta] = []
    score: int = 100                           # índice de saúde/maturidade 0–100
    classe: str = "saudavel"                   # saudavel | atencao | critico
    saude_gaps: list[str] = []                 # labels dos critérios que faltam p/ 100
    servicos_count: int = 0                    # serviços digitais ativos
    stacks: list[StackMini] = Field(default_factory=list)


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
    responsavel_tecnico: Optional[PersonMini] = None
    stacks: list[StackMini] = Field(default_factory=list)
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
    login_idigital: bool = False
    corporativo: bool = False
    servicos: list[ServicoResponse]
    documentos: list[DocumentoResponse]
    processos: list[ProdutoProcessoResponse]
    contratos: list[ContratoResponse]
    releases: list["ReleaseResponse"] = Field(default_factory=list)
    documentations: list["DocumentationResponse"] = Field(default_factory=list)
    supports: list["SupportResponse"] = Field(default_factory=list)
    health: Optional[ProductHealth] = None


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
_PP_ITEM_STATUS = Literal["planejado", "em_andamento", "concluido"]
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
    data_documentacao: Optional[date] = None
    doc_previsao_inicio: Optional[date] = None
    doc_previsao_fim: Optional[date] = None
    passagem_para_ti: bool = False
    anexos: Optional[list[AnexoItem]] = None
    status_item: _PP_ITEM_STATUS = "planejado"
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
    data_documentacao: Optional[date] = None
    doc_previsao_inicio: Optional[date] = None
    doc_previsao_fim: Optional[date] = None
    passagem_para_ti: Optional[bool] = None
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
    data_documentacao: Optional[date]
    doc_previsao_inicio: Optional[date]
    doc_previsao_fim: Optional[date]
    passagem_para_ti: bool
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
    releases_publicadas_mes: int = 0


# ─────────────────────────────────────────────
# Inteligência de portfólio (saúde, risco, ações, contratos)
# ─────────────────────────────────────────────

class PendenciaAgg(BaseModel):
    code: str
    nivel: str            # alto | medio
    label: str
    count: int


class MatrizRiscoCell(BaseModel):
    criticidade: str      # baixa | media | alta | critica
    classe: str           # saudavel | atencao | critico
    count: int


class TopRiscoItem(BaseModel):
    id: uuid.UUID
    name: str
    score: int
    classe: str
    criticidade: str
    principais_gaps: list[str] = []   # labels dos checks "fail" mais pesados (≤3)


class ProdutoParadoItem(BaseModel):
    id: uuid.UUID
    name: str
    ultima_release_date: Optional[date] = None
    meses: Optional[int] = None


class DocDebtItem(BaseModel):
    id: uuid.UUID
    name: str
    doc_status: Optional[str] = None


class PortfolioInteligencia(BaseModel):
    media_score: float
    distribuicao: dict[str, int]      # {"saudavel","atencao","critico"}
    matriz_risco: list[MatrizRiscoCell]
    top_risco: list[TopRiscoItem]
    pendencias: list[PendenciaAgg]
    produtos_parados: list[ProdutoParadoItem]
    doc_debt: list[DocDebtItem]


class FornecedorContratoAgg(BaseModel):
    fornecedor_id: Optional[uuid.UUID] = None
    fornecedor_nome: str
    produtos_count: int
    contratos_count: int
    valor_total: float
    proximo_vencimento: Optional[date] = None


class ContratoAVencerItem(BaseModel):
    contrato_id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    fornecedor_nome: Optional[str] = None
    vigencia_fim: date
    dias_para_vencer: int
    valor: Optional[float] = None


class ContratosInteligencia(BaseModel):
    valor_total: float
    valor_total_por_tipo: dict[str, float]    # mensal/anual/global/sob_demanda/indefinido
    valor_ambiguo: bool                       # mix de periodicidades → soma só indicativa
    por_fornecedor: list[FornecedorContratoAgg]
    buckets_vencimento: dict[str, int]        # vencidos/ate_30/ate_60/ate_90/acima_90
    sem_renovacao_avencer: list[ContratoAVencerItem]


# ── Configuração do Índice de Saúde ──
class HealthConfigCheck(BaseModel):
    code: str
    label: str
    weight: int               # peso vigente (config ou padrão)
    default_weight: int       # peso padrão de fábrica (para "restaurar")
    aplicabilidade: str       # texto explicando quando o critério se aplica


class HealthConfigResponse(BaseModel):
    checks: list[HealthConfigCheck]
    limiar_saudavel: int
    limiar_atencao: int
    is_customizado: bool      # True se já houver config salva (≠ padrão)


class HealthConfigUpdate(BaseModel):
    weights: dict[str, int] = Field(default_factory=dict)   # {code: peso} (≥0)
    limiar_saudavel: int = Field(..., ge=1, le=100)
    limiar_atencao: int = Field(..., ge=0, le=99)

    @model_validator(mode="after")
    def _check(self):
        if self.limiar_atencao >= self.limiar_saudavel:
            raise ValueError("O limiar de 'Atenção' deve ser menor que o de 'Saudável'.")
        for code, w in self.weights.items():
            if w < 0:
                raise ValueError(f"Peso de '{code}' não pode ser negativo.")
        return self


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
        tem_conteudo = (
            (self.conteudo_md and self.conteudo_md.strip())
            or (self.link_interno and self.link_interno.strip())
            or bool(self.anexos)
        )
        if self.status == "publicada" and not tem_conteudo:
            raise ValueError("Documentação publicada exige conteúdo Markdown, link ou anexo.")
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


_NIVEL_ATENDIMENTO = Literal["n1", "n2", "n3"]


class SupportCreate(BaseModel):
    canal_atendimento: Optional[str] = Field(None, max_length=200)
    nivel: _NIVEL_ATENDIMENTO
    interno: bool = True
    person_ids: list[uuid.UUID] = Field(default_factory=list)
    nomes_externos: list[str] = Field(default_factory=list)
    sla_horas: Optional[int] = Field(None, ge=1)
    observacoes: Optional[str] = None


class SupportUpdate(BaseModel):
    canal_atendimento: Optional[str] = Field(None, max_length=200)
    nivel: Optional[_NIVEL_ATENDIMENTO] = None
    interno: Optional[bool] = None
    person_ids: Optional[list[uuid.UUID]] = None
    nomes_externos: Optional[list[str]] = None
    sla_horas: Optional[int] = Field(None, ge=1)
    observacoes: Optional[str] = None


class SupportResponse(BaseModel):
    id: uuid.UUID
    canal_atendimento: Optional[str] = None
    nivel: str
    interno: bool
    person_ids: list[uuid.UUID] = Field(default_factory=list)
    nomes_externos: list[str] = Field(default_factory=list)
    sla_horas: Optional[int] = None
    responsaveis: list[PersonMini] = Field(default_factory=list)
    observacoes: Optional[str] = None


# Resolve forward references (ProductResponse referencia Release/Documentation/Support;
# Contrato* referenciam AnexoItem).
ProductResponse.model_rebuild()
ContratoCreate.model_rebuild()
ContratoUpdate.model_rebuild()
ContratoResponse.model_rebuild()


# ─────────────────────────────────────────────
# Repositórios de código e commits
# ─────────────────────────────────────────────

_REPO_PROVIDER = Literal["azure_devops", "github"]
_REPO_SYNC_STATUS = Literal["nunca", "ok", "erro", "not_found"]
_LINK_KIND = Literal["azure_repo", "azure_projeto", "outro_provider", "nao_repositorio"]


class ProductMini(BaseModel):
    id: uuid.UUID
    name: str
    sigla: Optional[str] = None


class RepositoryCreate(BaseModel):
    organization: Optional[str] = None  # vazio = usa a org padrão do .env
    project: str = Field(..., min_length=1, max_length=200)
    repository: str = Field(..., min_length=1, max_length=200)
    provider: _REPO_PROVIDER = "azure_devops"
    product_ids: list[uuid.UUID] = Field(default_factory=list)
    web_url: Optional[str] = None


class RepositoryUpdate(BaseModel):
    sync_enabled: Optional[bool] = None
    is_active: Optional[bool] = None
    product_ids: Optional[list[uuid.UUID]] = None


class RepositoryResponse(BaseModel):
    id: uuid.UUID
    provider: str
    organization: str
    project: str
    repository: str
    remote_repo_id: Optional[str] = None
    web_url: Optional[str] = None
    default_branch: Optional[str] = None
    is_active: bool
    sync_enabled: bool
    first_synced_at: Optional[datetime] = None
    last_sync_at: Optional[datetime] = None
    last_sync_status: str
    last_sync_error: Optional[str] = None
    last_commit_at: Optional[datetime] = None
    commits_count: int
    produtos: list[ProductMini] = Field(default_factory=list)


class RepoLinkPreviewItem(BaseModel):
    """Uma URL do `link_repositorio` de um produto, já classificada pelo parser."""
    product_id: uuid.UUID
    product_name: str
    url: str
    kind: _LINK_KIND
    organization: Optional[str] = None
    project: Optional[str] = None
    repository: Optional[str] = None
    provider: Optional[str] = None
    ja_vinculado: bool = False


class RepoImportPreview(BaseModel):
    itens: list[RepoLinkPreviewItem] = Field(default_factory=list)
    total_produtos_com_link: int = 0
    total_importaveis: int = 0
    total_repos_novos: int = 0
    resumo_por_tipo: dict[str, int] = Field(default_factory=dict)


class RepoImportApply(BaseModel):
    """Cada item confirmado vira (ou reaproveita) um repositório e o vincula ao produto."""
    itens: list[RepoLinkPreviewItem] = Field(default_factory=list)


class RepoImportResult(BaseModel):
    repos_criados: int = 0
    vinculos_criados: int = 0
    ignorados: int = 0


class AzureProjectMini(BaseModel):
    id: str
    name: str


class AzureRepoMini(BaseModel):
    id: str
    name: str
    project: str
    web_url: Optional[str] = None
    default_branch: Optional[str] = None
    ja_cadastrado: bool = False


class RepoSyncResult(BaseModel):
    repositorios: int = 0
    commits_novos: int = 0
    erros: list[str] = Field(default_factory=list)


class CommitAuthorResponse(BaseModel):
    id: uuid.UUID
    email: str
    display_name: Optional[str] = None
    person_id: Optional[uuid.UUID] = None
    person_name: Optional[str] = None
    ignored: bool
    commits_count: int
    last_commit_at: Optional[datetime] = None


class CommitAuthorUpdate(BaseModel):
    person_id: Optional[uuid.UUID] = None
    ignored: Optional[bool] = None


class RepoCommitItem(BaseModel):
    id: uuid.UUID
    commit_id: str
    short_id: str
    author_name: Optional[str] = None
    author_email: Optional[str] = None
    author_date: datetime
    comment: Optional[str] = None
    add_count: int = 0
    edit_count: int = 0
    delete_count: int = 0
    is_merge: bool = False
    is_bot: bool = False
    person_id: Optional[uuid.UUID] = None
    person_name: Optional[str] = None
    repository: str
    project: str
    remote_url: Optional[str] = None
    produtos: list[str] = Field(default_factory=list)


class RepoCommitPage(BaseModel):
    items: list[RepoCommitItem] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 50


class MonthPoint(BaseModel):
    month: str  # "2026-08"
    commits: int = 0


class DevCommitRow(BaseModel):
    person_id: Optional[uuid.UUID] = None
    person_name: str
    position: Optional[str] = None
    teams: list[str] = Field(default_factory=list)
    commits: int = 0
    # changeCounts do Azure conta ARQUIVOS tocados, não linhas.
    arquivos_add: int = 0
    arquivos_edit: int = 0
    arquivos_delete: int = 0
    repos_tocados: int = 0
    produtos_tocados: int = 0
    dias_com_commit: int = 0
    merges: int = 0
    primeiro_commit: Optional[datetime] = None
    ultimo_commit: Optional[datetime] = None
    series: list[MonthPoint] = Field(default_factory=list)


class ProductCommitRow(BaseModel):
    product_id: uuid.UUID
    product_name: str
    sigla: Optional[str] = None
    repos: int = 0
    commits: int = 0
    devs: int = 0
    ultimo_commit_at: Optional[datetime] = None
    dias_sem_commit: Optional[int] = None
    series: list[MonthPoint] = Field(default_factory=list)


class RepoOverviewKpis(BaseModel):
    commits_total: int = 0
    devs_ativos: int = 0
    repos_ativos: int = 0
    repos_sem_commit: int = 0
    produtos_com_repo: int = 0
    produtos_sem_commit: int = 0
    commits_sem_autor: int = 0
    autores_pendentes: int = 0
    # Quebra por ambiente. Branch main → prod · preview → hml · demais → dev.
    # Um commit que chegou em main conta como prod mesmo tendo passado por preview,
    # então `hml` é a fila do que está homologado e ainda não subiu.
    commits_prod: int = 0
    commits_hml: int = 0
    commits_dev: int = 0
    ultimo_sync_at: Optional[datetime] = None


class RepoOverviewResponse(BaseModel):
    kpis: RepoOverviewKpis
    by_dev: list[DevCommitRow] = Field(default_factory=list)
    by_product: list[ProductCommitRow] = Field(default_factory=list)
    series: list[MonthPoint] = Field(default_factory=list)
    position_options: list[dict] = Field(default_factory=list)
    team_options: list[dict] = Field(default_factory=list)
    repo_options: list[dict] = Field(default_factory=list)
    integracao_configurada: bool = True
