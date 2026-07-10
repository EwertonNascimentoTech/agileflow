"""Modelos do módulo Produtos (Portfólio de Produtos) — schema isolado de cada tenant.

Produto (semi-automático a partir de projeto finalizado) com classificação rica, ligado a
Área/Responsável (reusa teamops), Fornecedor+Contrato, catálogo global de Processos
(Macro→Processo→Sub) com vínculo anual, e serviços/documentos por ano. Histórico anual é
append-only (ano_referencia + is_active); auditoria por linha.
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
# Org reusa teamops (mesmo schema do tenant). Imports só para as relações.
from app.modules.teamops.models import Area, Person  # noqa: F401

_enum_values = lambda obj: [e.value for e in obj]


# ─────────────────────────────────────────────
# Enums (listas fechadas)
# ─────────────────────────────────────────────

class ProductOrigem(str, enum.Enum):
    INTERNO = "interno"
    COTS = "cots"
    CUSTOMIZACAO = "customizacao"
    SAAS = "saas"


class ProductLifecycle(str, enum.Enum):
    CONCEPCAO = "concepcao"
    DESENVOLVIMENTO = "desenvolvimento"
    PRODUCAO = "producao"
    DESCONTINUADO = "descontinuado"


class ProductCriticidade(str, enum.Enum):
    BAIXA = "baixa"
    MEDIA = "media"
    ALTA = "alta"
    CRITICA = "critica"


class ProcessoNivel(str, enum.Enum):
    MACROPROCESSO = "macroprocesso"
    PROCESSO = "processo"
    SUBPROCESSO = "subprocesso"


class SustentacaoModelo(str, enum.Enum):
    INTERNA = "interna"
    EXTERNA = "externa"
    HIBRIDA = "hibrida"


# ── Enums da spec "Produtos Digitais" (TI corporativa) ──

class ProductStatus(str, enum.Enum):
    IDEIA = "ideia"
    DISCOVERY = "discovery"
    DESENVOLVIMENTO = "desenvolvimento"
    HOMOLOGACAO = "homologacao"
    PRODUCAO = "producao"
    SUSTENTACAO = "sustentacao"
    EVOLUCAO = "evolucao"
    SUSPENSO = "suspenso"
    DESCONTINUADO = "descontinuado"


class ProductCategoria(str, enum.Enum):
    SISTEMA_INTERNO_DEV = "sistema_interno_dev"
    SISTEMA_INTERNO_IA = "sistema_interno_ia"
    SISTEMA_EXTERNO_IA = "sistema_externo_ia"
    SISTEMA_EXTERNO_IMPLANTACAO = "sistema_externo_implantacao"
    SISTEMA_EXTERNO_HIBRIDO = "sistema_externo_hibrido"
    SISTEMA_EXTERNO_DN = "sistema_externo_dn"


class ProductUnidade(str, enum.Enum):
    SESI = "sesi"
    SENAI = "senai"
    IEL = "iel"
    FIEA = "fiea"
    CORPORATIVO = "corporativo"


class ProductTipoDesenvolvimento(str, enum.Enum):
    INTERNO = "interno"
    EXTERNO = "externo"
    HIBRIDO = "hibrido"


class ProductModeloContratacao(str, enum.Enum):
    LICENCA = "licenca"
    SAAS = "saas"
    FABRICA = "fabrica"
    SERVICO_CONTINUADO = "servico_continuado"
    PROJETO_PONTUAL = "projeto_pontual"
    INTERNO = "interno"
    OUTRO = "outro"


class ServicoTipoSuporte(str, enum.Enum):
    INTERNO = "interno"
    FORNECEDOR = "fornecedor"
    COMPARTILHADO = "compartilhado"
    SERVICE_DESK = "service_desk"
    DEVOPS = "devops"
    DESENVOLVIMENTO = "desenvolvimento"
    INFRAESTRUTURA = "infraestrutura"


class ServicoStatus(str, enum.Enum):
    ATIVO = "ativo"
    EM_IMPLANTACAO = "em_implantacao"
    SUSPENSO = "suspenso"
    DESCONTINUADO = "descontinuado"


class DocumentoTipo(str, enum.Enum):
    """Espécie documental (não confundir com formato de arquivo)."""
    RELATORIO = "relatorio"
    PARECER = "parecer"
    TERMO = "termo"
    CERTIFICADO = "certificado"
    FORMULARIO_ELETRONICO = "formulario_eletronico"
    DASHBOARD = "dashboard"
    REGISTRO_SISTEMICO = "registro_sistemico"
    COMPROVANTE_RECIBO = "comprovante_recibo"
    EXTRATO = "extrato"
    DOCUMENTO_FISCAL_ELETRONICO = "documento_fiscal_eletronico"
    OFICIO = "oficio"
    OUTRO = "outro"


class NivelDadosPessoais(str, enum.Enum):
    SEM_DADOS = "sem_dados_pessoais"
    DADOS_PESSOAIS = "dados_pessoais"
    DADOS_SENSIVEIS = "dados_pessoais_sensiveis"


class ClassificacaoInformacao(str, enum.Enum):
    PUBLICA = "publica"
    INTERNA = "interna"
    CONFIDENCIAL = "confidencial"
    RESTRITA = "restrita"


class ContratoStatus(str, enum.Enum):
    SEM_CONTRATO = "sem_contrato"
    EM_FORMALIZACAO = "em_formalizacao"
    VIGENTE = "vigente"
    A_VENCER = "a_vencer"
    VENCIDO = "vencido"
    EM_RENOVACAO = "em_renovacao"
    ENCERRADO = "encerrado"


class ContratoTipoValor(str, enum.Enum):
    MENSAL = "mensal"
    ANUAL = "anual"
    GLOBAL = "global"
    SOB_DEMANDA = "sob_demanda"


class ReleaseTipo(str, enum.Enum):
    CORRECAO = "correcao"
    MELHORIA = "melhoria"
    NOVA_FUNCIONALIDADE = "nova_funcionalidade"
    SEGURANCA = "seguranca"
    INTEGRACAO = "integracao"
    REFATORACAO = "refatoracao"
    AJUSTE_TECNICO = "ajuste_tecnico"


class ReleaseStatus(str, enum.Enum):
    PLANEJADA = "planejada"
    EM_DESENVOLVIMENTO = "em_desenvolvimento"
    EM_HOMOLOGACAO = "em_homologacao"
    PUBLICADA = "publicada"
    CANCELADA = "cancelada"
    REVERTIDA = "revertida"


class ReleaseImpacto(str, enum.Enum):
    BAIXO = "baixo"
    MEDIO = "medio"
    ALTO = "alto"


class ReleaseAmbiente(str, enum.Enum):
    DEV = "dev"
    HML = "hml"
    PRD = "prd"


class DocumentacaoTipo(str, enum.Enum):
    USUARIO = "usuario"
    TECNICA = "tecnica"
    API = "api"
    IMPLANTACAO = "implantacao"
    SUSTENTACAO = "sustentacao"
    ARQUITETURA = "arquitetura"
    SEGURANCA = "seguranca"
    OPERACIONAL = "operacional"


class DocumentacaoStatus(str, enum.Enum):
    NAO_INICIADA = "nao_iniciada"
    EM_ELABORACAO = "em_elaboracao"
    PUBLICADA = "publicada"
    NECESSITA_ATUALIZACAO = "necessita_atualizacao"
    OBSOLETA = "obsoleta"


class SuporteTipo(str, enum.Enum):
    INTERNA = "interna"
    FORNECEDOR = "fornecedor"
    COMPARTILHADA = "compartilhada"


# ── Portfólio de Processos (versionado) ──────────

class ProcessPortfolioVersionStatus(str, enum.Enum):
    RASCUNHO = "rascunho"
    CONSOLIDADA = "consolidada"
    ARQUIVADA = "arquivada"


class ProcessItemNivel(str, enum.Enum):
    DIRETORIA = "diretoria"
    MACROPROCESSO = "macroprocesso"
    PROCESSO = "processo"
    SUBPROCESSO = "subprocesso"


class ProcessItemStatus(str, enum.Enum):
    PLANEJADO = "planejado"
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDO = "concluido"


class ProcessItemCriticidade(str, enum.Enum):
    BAIXA = "baixa"
    MEDIA = "media"
    ALTA = "alta"
    CRITICA = "critica"


class ProcessItemMaturidade(str, enum.Enum):
    INEXISTENTE = "inexistente"
    INICIAL = "inicial"
    DEFINIDO = "definido"
    GERENCIADO = "gerenciado"
    OTIMIZADO = "otimizado"


# ─────────────────────────────────────────────
# Fornecedor
# ─────────────────────────────────────────────

class Fornecedor(TenantBase):
    __tablename__ = "produto_fornecedores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    cnpj: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    contato: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    telefone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    inactivated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    inactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# ─────────────────────────────────────────────
# Produto + sub-entidades
# ─────────────────────────────────────────────

class Product(TenantBase):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    simbolo: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dominio_funcional: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    origem: Mapped[ProductOrigem] = mapped_column(
        SAEnum(ProductOrigem, native_enum=False, values_callable=_enum_values),
        nullable=False, default=ProductOrigem.INTERNO,
    )
    lifecycle: Mapped[ProductLifecycle] = mapped_column(
        SAEnum(ProductLifecycle, native_enum=False, values_callable=_enum_values),
        nullable=False, default=ProductLifecycle.DESENVOLVIMENTO,
    )
    criticidade: Mapped[ProductCriticidade] = mapped_column(
        SAEnum(ProductCriticidade, native_enum=False, values_callable=_enum_values),
        nullable=False, default=ProductCriticidade.MEDIA,
    )
    data_entrada_producao: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Org (reusa teamops): área escolhida; setor derivado da hierarquia (não armazenado).
    area_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_areas.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    responsavel_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="SET NULL"), nullable=True,
    )
    responsavel_tecnico_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="SET NULL"), nullable=True,
    )
    fornecedor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("produto_fornecedores.id", ondelete="SET NULL"), nullable=True,
    )
    # Rastreabilidade ao projeto finalizado de origem (sem FK — desacopla de projetos).
    origin_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)

    # ── Campos "Produtos Digitais" (TI corporativa) — todos opcionais (extensão) ──
    sigla: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    link_descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    categoria: Mapped[Optional[ProductCategoria]] = mapped_column(
        SAEnum(ProductCategoria, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    unidade: Mapped[Optional[ProductUnidade]] = mapped_column(
        SAEnum(ProductUnidade, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    dono_negocio_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="SET NULL"), nullable=True,
    )
    publico_alvo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    url_acesso: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status_produto: Mapped[Optional[ProductStatus]] = mapped_column(
        SAEnum(ProductStatus, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    tipo_desenvolvimento: Mapped[Optional[ProductTipoDesenvolvimento]] = mapped_column(
        SAEnum(ProductTipoDesenvolvimento, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    desenvolvido_por: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    fornecedor_cnpj: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    modelo_contratacao: Mapped[Optional[ProductModeloContratacao]] = mapped_column(
        SAEnum(ProductModeloContratacao, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    ambiente_tecnologico: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tecnologias: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Stacks do produto (multi-valorado) — lista de ids do catálogo team_stacks.
    stacks: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    link_repositorio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    link_dev: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    link_hml: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    link_prd: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Autenticação via Idigital (provedor de identidade corporativo)
    login_idigital: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Produto corporativo: quando True, o PO (responsável) não é do produto e sim de cada serviço.
    corporativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    inactivated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    inactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    area: Mapped[Optional["Area"]] = relationship("Area", lazy="selectin")
    responsavel: Mapped[Optional["Person"]] = relationship("Person", foreign_keys=[responsavel_person_id], lazy="selectin")
    responsavel_tecnico: Mapped[Optional["Person"]] = relationship("Person", foreign_keys=[responsavel_tecnico_person_id], lazy="selectin")
    dono_negocio: Mapped[Optional["Person"]] = relationship("Person", foreign_keys=[dono_negocio_person_id], lazy="selectin")
    fornecedor: Mapped[Optional["Fornecedor"]] = relationship("Fornecedor", lazy="selectin")
    servicos: Mapped[list["ProductServico"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="ProductServico.order", lazy="selectin",
    )
    documentos: Mapped[list["ProductDocumento"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="ProductDocumento.order", lazy="selectin",
    )
    processos: Mapped[list["ProdutoProcesso"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="selectin",
    )
    contratos: Mapped[list["Contrato"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="selectin",
    )
    releases: Mapped[list["ProductRelease"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="selectin",
    )
    documentations: Mapped[list["ProductDocumentation"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="selectin",
    )
    supports: Mapped[list["ProductSupport"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="selectin",
    )


class ProductServico(TenantBase):
    __tablename__ = "product_servicos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    data_publicacao: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    ano_referencia: Mapped[int] = mapped_column(Integer, nullable=False)
    # PO (responsável) do serviço — usado quando o produto é corporativo (PO por serviço).
    responsavel_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="SET NULL"), nullable=True,
    )
    # ── Extensão spec ──
    area_usuaria: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    processo_relacionado: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    disponibilidade: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    sla_atendimento: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    tipo_suporte: Mapped[Optional[ServicoTipoSuporte]] = mapped_column(
        SAEnum(ServicoTipoSuporte, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    status_servico: Mapped[Optional[ServicoStatus]] = mapped_column(
        SAEnum(ServicoStatus, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    # Quando não há sub-processo no portfólio para vincular — dispensa o critério de saúde (com justificativa).
    sem_subprocesso_disponivel: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    justificativa_sem_subprocesso: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    inactivated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    inactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    product: Mapped["Product"] = relationship(back_populates="servicos")
    responsavel: Mapped[Optional["Person"]] = relationship("Person", foreign_keys=[responsavel_person_id], lazy="selectin")


class ProductDocumento(TenantBase):
    __tablename__ = "product_documentos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    data_documento: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    ano_referencia: Mapped[int] = mapped_column(Integer, nullable=False)
    object_name: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    external_link: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # ── Extensão spec (documento nato-digital) ──
    tipo_documento: Mapped[Optional[DocumentoTipo]] = mapped_column(
        SAEnum(DocumentoTipo, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    formato: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    origem_sistema: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_nato_digital: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    assinatura_digital: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    trilha_auditoria: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    local_armazenamento: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    prazo_retencao: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    classificacao: Mapped[Optional[ClassificacaoInformacao]] = mapped_column(
        SAEnum(ClassificacaoInformacao, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    nivel_dados_pessoais: Mapped[Optional[NivelDadosPessoais]] = mapped_column(
        SAEnum(NivelDadosPessoais, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    dados_pessoais: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    dados_sensiveis: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    inactivated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    inactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    product: Mapped["Product"] = relationship(back_populates="documentos")


# ─────────────────────────────────────────────
# Catálogo global de Processos (Macro→Processo→Sub)
# ─────────────────────────────────────────────

class Processo(TenantBase):
    __tablename__ = "processos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("processos.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    nivel: Mapped[ProcessoNivel] = mapped_column(
        SAEnum(ProcessoNivel, native_enum=False, values_callable=_enum_values), nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    inactivated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    inactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    parent: Mapped[Optional["Processo"]] = relationship(remote_side="Processo.id", back_populates="children")
    children: Mapped[list["Processo"]] = relationship(
        back_populates="parent", cascade="all, delete-orphan", order_by="Processo.order",
    )


class ProdutoProcesso(TenantBase):
    """Vínculo Produto↔Subprocesso por ano, com flag automatizado (append-only)."""
    __tablename__ = "produto_processo"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    processo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("processos.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    ano_referencia: Mapped[int] = mapped_column(Integer, nullable=False)
    automatizado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    inactivated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    inactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    product: Mapped["Product"] = relationship(back_populates="processos")
    processo: Mapped["Processo"] = relationship("Processo", lazy="selectin")


# ─────────────────────────────────────────────
# Contrato
# ─────────────────────────────────────────────

class Contrato(TenantBase):
    __tablename__ = "produto_contratos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    fornecedor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("produto_fornecedores.id", ondelete="RESTRICT"), nullable=False,
    )
    identificador: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    vigencia_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    vigencia_fim: Mapped[date] = mapped_column(Date, nullable=False)
    renovacao_automatica: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    modelo_licenciamento: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    gestor_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="SET NULL"), nullable=True,
    )
    # ── Extensão spec (contrato) ──
    numero: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    objeto_contratual: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status_contrato: Mapped[Optional[ContratoStatus]] = mapped_column(
        SAEnum(ContratoStatus, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    valor: Mapped[Optional[float]] = mapped_column(Numeric(18, 2), nullable=True)
    tipo_valor: Mapped[Optional[ContratoTipoValor]] = mapped_column(
        SAEnum(ContratoTipoValor, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    centro_custo: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    fiscal_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="SET NULL"), nullable=True,
    )
    sla_contratual: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Lista de aditivos: [{object_name, filename, content_type, size}, ...]
    aditivos: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sustentacao_n1: Mapped[SustentacaoModelo] = mapped_column(
        SAEnum(SustentacaoModelo, native_enum=False, values_callable=_enum_values), nullable=False, default=SustentacaoModelo.INTERNA,
    )
    sustentacao_n2: Mapped[SustentacaoModelo] = mapped_column(
        SAEnum(SustentacaoModelo, native_enum=False, values_callable=_enum_values), nullable=False, default=SustentacaoModelo.INTERNA,
    )
    sustentacao_n3: Mapped[SustentacaoModelo] = mapped_column(
        SAEnum(SustentacaoModelo, native_enum=False, values_callable=_enum_values), nullable=False, default=SustentacaoModelo.INTERNA,
    )
    alerta_dias: Mapped[list] = mapped_column(JSONB, nullable=False, default=lambda: [90, 60, 30])
    object_name: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    external_link: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    inactivated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    inactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    product: Mapped["Product"] = relationship(back_populates="contratos")
    fornecedor: Mapped["Fornecedor"] = relationship("Fornecedor", lazy="selectin")
    gestor: Mapped[Optional["Person"]] = relationship("Person", foreign_keys=[gestor_person_id], lazy="selectin")
    fiscal: Mapped[Optional["Person"]] = relationship("Person", foreign_keys=[fiscal_person_id], lazy="selectin")


# ─────────────────────────────────────────────
# Produtos Digitais — entidades novas (Release / Documentação / Sustentação / Segurança)
# ─────────────────────────────────────────────

class ProductRelease(TenantBase):
    __tablename__ = "product_releases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    versao: Mapped[str] = mapped_column(String(60), nullable=False)
    nome: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    data_release: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    ambiente: Mapped[Optional[ReleaseAmbiente]] = mapped_column(
        SAEnum(ReleaseAmbiente, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    tipo: Mapped[Optional[ReleaseTipo]] = mapped_column(
        SAEnum(ReleaseTipo, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    descricao_mudanca: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    impacto: Mapped[Optional[ReleaseImpacto]] = mapped_column(
        SAEnum(ReleaseImpacto, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    responsavel_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="SET NULL"), nullable=True,
    )
    evidencia_link: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Anexos de evidência de homologação: [{object_name, filename, content_type, size}, ...]
    evidencia_anexos: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    changelog: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tem_rollback: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    descricao_rollback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    doc_atualizada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[ReleaseStatus] = mapped_column(
        SAEnum(ReleaseStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=ReleaseStatus.PLANEJADA,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product: Mapped["Product"] = relationship(back_populates="releases")
    responsavel: Mapped[Optional["Person"]] = relationship("Person", lazy="selectin")


class ProductDocumentation(TenantBase):
    __tablename__ = "product_documentations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    tipo: Mapped[DocumentacaoTipo] = mapped_column(
        SAEnum(DocumentacaoTipo, native_enum=False, values_callable=_enum_values),
        nullable=False, default=DocumentacaoTipo.USUARIO,
    )
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    conteudo_md: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    versao_relacionada: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    autor_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="SET NULL"), nullable=True,
    )
    status: Mapped[DocumentacaoStatus] = mapped_column(
        SAEnum(DocumentacaoStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=DocumentacaoStatus.NAO_INICIADA,
    )
    link_interno: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Anexos complementares: [{object_name, filename, content_type, size}, ...]
    anexos: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product: Mapped["Product"] = relationship(back_populates="documentations")
    autor: Mapped[Optional["Person"]] = relationship("Person", lazy="selectin")


class ProductSupport(TenantBase):
    __tablename__ = "product_supports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    tipo: Mapped[Optional[SuporteTipo]] = mapped_column(
        SAEnum(SuporteTipo, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    canal_atendimento: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sla_critico: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    sla_medio: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    sla_solicitacao: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    equipe_responsavel: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    horario_suporte: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    escalonamento: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    link_base_conhecimento: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # n1 | n2 | n3 — um registro por nível de atendimento
    nivel: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    # Config do nível: interno, person_ids, nomes_externos, sla_horas
    niveis_atendimento: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product: Mapped["Product"] = relationship(back_populates="supports")


# ─────────────────────────────────────────────
# Portfólio de Processos (versionado)
# ─────────────────────────────────────────────

class ProcessPortfolio(TenantBase):
    """Container lógico de um portfólio de processos. Cada portfólio tem uma série de versões;
    `current_version_id` aponta para a versão consolidada vigente."""
    __tablename__ = "process_portfolios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    current_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("process_portfolio_versions.id", ondelete="SET NULL", use_alter=True,
                   name="fk_portfolio_current_version"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    inactivated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    inactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    versions: Mapped[list["ProcessPortfolioVersion"]] = relationship(
        back_populates="portfolio", cascade="all, delete-orphan",
        order_by="ProcessPortfolioVersion.version", foreign_keys="ProcessPortfolioVersion.portfolio_id",
    )
    current_version: Mapped[Optional["ProcessPortfolioVersion"]] = relationship(
        foreign_keys=[current_version_id], post_update=True, lazy="selectin",
    )


class ProcessPortfolioVersion(TenantBase):
    """Versão de um portfólio de processos. Versão `consolidada` é imutável; edições só em `rascunho`.
    Forma a série histórica — cada nova versão é deep-copy da consolidada anterior + justificativa."""
    __tablename__ = "process_portfolio_versions"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "version", name="uq_process_portfolio_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("process_portfolios.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[ProcessPortfolioVersionStatus] = mapped_column(
        SAEnum(ProcessPortfolioVersionStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=ProcessPortfolioVersionStatus.RASCUNHO,
    )
    justification: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    consolidated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    consolidated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    portfolio: Mapped["ProcessPortfolio"] = relationship(
        back_populates="versions", foreign_keys=[portfolio_id],
    )
    items: Mapped[list["ProcessPortfolioItem"]] = relationship(
        back_populates="version", cascade="all, delete-orphan", order_by="ProcessPortfolioItem.order",
    )


class ProcessPortfolioItem(TenantBase):
    """Nó da árvore (Diretoria→Macro→Processo→Sub) pertencente a UMA versão. `lineage_id` é a
    identidade lógica estável copiada entre versões (base do diff e do vínculo com serviços)."""
    __tablename__ = "process_portfolio_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("process_portfolio_versions.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    lineage_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, default=uuid.uuid4, index=True)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("process_portfolio_items.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    nivel: Mapped[ProcessItemNivel] = mapped_column(
        SAEnum(ProcessItemNivel, native_enum=False, values_callable=_enum_values), nullable=False,
    )
    codigo: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Diretoria demandante — atributo (texto livre) tipicamente do macroprocesso, não um nível da cascata.
    diretoria: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Área — valor do formulário padrão de projetos (select), não TeamOps.
    area: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    analista: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    dono: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Governança / org (legado TeamOps — person_id)
    analista_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="SET NULL"), nullable=True,
    )
    dono_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_persons.id", ondelete="SET NULL"), nullable=True,
    )
    area_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_areas.id", ondelete="SET NULL"), nullable=True,
    )

    # Vigência + documentação
    vigencia_inicio: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    vigencia_fim: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # "Documentado" deixou de ser flag própria — deriva de status_item == concluido.
    data_documentacao: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    doc_previsao_inicio: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    doc_previsao_fim: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    passagem_para_ti: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Lista de anexos: [{object_name, filename, content_type, size}, ...]
    anexos: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)

    # Campos extras de controle
    status_item: Mapped[ProcessItemStatus] = mapped_column(
        SAEnum(ProcessItemStatus, native_enum=False, values_callable=_enum_values),
        nullable=False, default=ProcessItemStatus.PLANEJADO,
    )
    criticidade: Mapped[Optional[ProcessItemCriticidade]] = mapped_column(
        SAEnum(ProcessItemCriticidade, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    objetivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    nivel_maturidade: Mapped[Optional[ProcessItemMaturidade]] = mapped_column(
        SAEnum(ProcessItemMaturidade, native_enum=False, values_callable=_enum_values), nullable=True,
    )
    tipo_documento: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    versao_documento: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    proxima_revisao: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    link_externo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    frequencia: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    entradas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    saidas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    version: Mapped["ProcessPortfolioVersion"] = relationship(back_populates="items")
    analista_person: Mapped[Optional["Person"]] = relationship("Person", foreign_keys=[analista_person_id], lazy="selectin")
    dono_person: Mapped[Optional["Person"]] = relationship("Person", foreign_keys=[dono_person_id], lazy="selectin")
    team_area: Mapped[Optional["Area"]] = relationship("Area", foreign_keys=[area_id], lazy="selectin")
    parent: Mapped[Optional["ProcessPortfolioItem"]] = relationship(
        remote_side="ProcessPortfolioItem.id", back_populates="children",
    )
    children: Mapped[list["ProcessPortfolioItem"]] = relationship(
        back_populates="parent", cascade="all, delete-orphan",
        order_by="ProcessPortfolioItem.order", foreign_keys=[parent_id],
    )


class ProcessServiceLink(TenantBase):
    """Vínculo serviço do produto ↔ sub-processo do portfólio. Aponta para o sub-processo lógico
    (`item_lineage_id`) para sobreviver à criação de novas versões."""
    __tablename__ = "process_portfolio_service_links"
    __table_args__ = (
        UniqueConstraint("servico_id", "item_lineage_id", name="uq_process_service_link"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    servico_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_servicos.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    portfolio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("process_portfolios.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    item_lineage_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────
# Configuração do Índice de Saúde/Maturidade (singleton por tenant)
# ─────────────────────────────────────────────

class ProductHealthConfig(TenantBase):
    """Pesos e limiares configuráveis do score de saúde do portfólio. Linha única por tenant
    (criada na primeira gravação; até lá valem os padrões do código)."""
    __tablename__ = "produto_health_config"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # {check_code: peso}. Códigos ausentes usam o peso padrão de _HEALTH_CHECKS.
    weights: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    limiar_saudavel: Mapped[int] = mapped_column(Integer, nullable=False, default=75)
    limiar_atencao: Mapped[int] = mapped_column(Integer, nullable=False, default=40)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
