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
    String,
    Text,
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
    fornecedor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("produto_fornecedores.id", ondelete="SET NULL"), nullable=True,
    )
    # Rastreabilidade ao projeto finalizado de origem (sem FK — desacopla de projetos).
    origin_task_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    inactivated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    inactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    area: Mapped[Optional["Area"]] = relationship("Area", lazy="selectin")
    responsavel: Mapped[Optional["Person"]] = relationship("Person", lazy="selectin")
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


class ProductServico(TenantBase):
    __tablename__ = "product_servicos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ano_referencia: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    inactivated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    inactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    product: Mapped["Product"] = relationship(back_populates="servicos")


class ProductDocumento(TenantBase):
    __tablename__ = "product_documentos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    ano_referencia: Mapped[int] = mapped_column(Integer, nullable=False)
    object_name: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    external_link: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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
    gestor: Mapped[Optional["Person"]] = relationship("Person", lazy="selectin")
