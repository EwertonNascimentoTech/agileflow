"""
Modelos do módulo Estoque — vivem no schema isolado de cada tenant.

Design genérico: ProductType define field_schema (JSONB) e Product guarda
custom_fields (JSONB) validados contra esse schema. Permite cadastrar qualquer
tipo de item (alimento, bateria, contrato, eletrônico, ...) sem migrations
adicionais.

Variantes ficam fora do MVP — duas SKUs equivalem a dois produtos distintos.
"""
import uuid
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String, Boolean, DateTime, ForeignKey,
    Text, Integer, Numeric, Enum as SAEnum, UniqueConstraint, Date,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.core.database import TenantBase

_enum_values = lambda obj: [e.value for e in obj]  # noqa: E731


# ─────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────

class MovementType(str, enum.Enum):
    IN       = "in"        # entrada (compra, devolução de cliente, ajuste positivo)
    OUT      = "out"       # saída (venda, perda, ajuste negativo)
    ADJUST   = "adjust"    # ajuste manual (set absoluto)
    TRANSFER = "transfer"  # transferência entre depósitos


class SerialStatus(str, enum.Enum):
    IN_STOCK  = "in_stock"
    RESERVED  = "reserved"
    SOLD      = "sold"
    DAMAGED   = "damaged"
    RETURNED  = "returned"


# ─────────────────────────────────────────────
# CONFIG / CATALOG
# ─────────────────────────────────────────────

class ProductType(TenantBase):
    """
    Tipo de produto configurável. Define quais campos extras o produto tem
    e quais funcionalidades de rastreio estão ativas (lote, validade, serial).

    Exemplos:
      - Bateria → tracks_serial=True, field_schema descreve voltagem/capacidade
      - Alimento → tracks_batch=True, tracks_expiry=True
      - Contrato/Serviço → tracks_stock=False
    """
    __tablename__ = "estoque_product_types"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str]        = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str]        = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    icon: Mapped[Optional[str]]        = mapped_column(String(50))

    field_schema: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    """
    JSON descrevendo campos custom. Formato:
      {
        "fields": [
          {"key": "voltage", "label": "Tensão (V)", "type": "number", "required": true},
          {"key": "chemistry", "label": "Química", "type": "select",
           "options": ["lithium", "lead_acid"], "required": false}
        ]
      }
    Tipos suportados: text, textarea, number, date, boolean, select.
    """

    tracks_stock: Mapped[bool]  = mapped_column(Boolean, nullable=False, default=True)
    tracks_batch: Mapped[bool]  = mapped_column(Boolean, nullable=False, default=False)
    tracks_expiry: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tracks_serial: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    is_active: Mapped[bool]      = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProductCategory(TenantBase):
    """Categoria hierárquica. parent_id permite árvore."""
    __tablename__ = "estoque_product_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str]        = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_product_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    product_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_product_types.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Product(TenantBase):
    """
    Item base. custom_fields guarda valores conforme field_schema do ProductType.
    """
    __tablename__ = "estoque_products"
    __table_args__ = (UniqueConstraint("sku", name="uq_estoque_products_sku"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_product_types.id", ondelete="RESTRICT"),
        nullable=False,
    )
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_product_categories.id", ondelete="SET NULL"),
        nullable=True,
    )

    sku: Mapped[str]         = mapped_column(String(80), nullable=False)
    name: Mapped[str]        = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    barcode: Mapped[Optional[str]] = mapped_column(String(80))
    unit: Mapped[str]        = mapped_column(String(20), nullable=False, default="un")
    cost_price: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    sale_price: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    min_stock: Mapped[float]  = mapped_column(Numeric(14, 4), nullable=False, default=0)
    max_stock: Mapped[Optional[float]] = mapped_column(Numeric(14, 4), nullable=True)

    custom_fields: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    is_active: Mapped[bool]      = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    type: Mapped["ProductType"] = relationship()
    category: Mapped[Optional["ProductCategory"]] = relationship()


# ─────────────────────────────────────────────
# WAREHOUSES / SUPPLIERS
# ─────────────────────────────────────────────

class Warehouse(TenantBase):
    """Depósito físico ou lógico (loja, CD, filial)."""
    __tablename__ = "estoque_warehouses"
    __table_args__ = (UniqueConstraint("code", name="uq_estoque_warehouses_code"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str]        = mapped_column(String(30), nullable=False)
    name: Mapped[str]        = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    address: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool]  = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Supplier(TenantBase):
    __tablename__ = "estoque_suppliers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str]        = mapped_column(String(200), nullable=False)
    trade_name: Mapped[Optional[str]] = mapped_column(String(200))
    document: Mapped[Optional[str]] = mapped_column(String(30))
    email: Mapped[Optional[str]]    = mapped_column(String(255))
    phone: Mapped[Optional[str]]    = mapped_column(String(30))
    address: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    notes: Mapped[Optional[str]]    = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProductSupplier(TenantBase):
    """M:N produto × fornecedor (com SKU do fornecedor, custo, lead time)."""
    __tablename__ = "estoque_product_suppliers"
    __table_args__ = (UniqueConstraint("product_id", "supplier_id", name="uq_estoque_product_supplier"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_products.id", ondelete="CASCADE"),
        nullable=False,
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_suppliers.id", ondelete="CASCADE"),
        nullable=False,
    )
    supplier_sku: Mapped[Optional[str]] = mapped_column(String(80))
    cost_unit: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    lead_time_days: Mapped[Optional[int]] = mapped_column(Integer)
    is_preferred: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────────
# STOCK STATE
# ─────────────────────────────────────────────

class StockLevel(TenantBase):
    """
    Saldo atual por (produto, depósito). Atualizado pelo service em cada movimento.
    Snapshot para queries rápidas — fonte da verdade é stock_movements.
    """
    __tablename__ = "estoque_stock_levels"
    __table_args__ = (
        UniqueConstraint("product_id", "warehouse_id", name="uq_estoque_stock_level"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_products.id", ondelete="CASCADE"),
        nullable=False,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_warehouses.id", ondelete="CASCADE"),
        nullable=False,
    )
    quantity: Mapped[float]  = mapped_column(Numeric(14, 4), nullable=False, default=0)
    reserved: Mapped[float]  = mapped_column(Numeric(14, 4), nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockBatch(TenantBase):
    """
    Lote rastreável (produto type.tracks_batch=True).
    Pode ter validade (tracks_expiry=True).
    """
    __tablename__ = "estoque_stock_batches"
    __table_args__ = (
        UniqueConstraint("product_id", "warehouse_id", "batch_code", name="uq_estoque_batch"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_products.id", ondelete="CASCADE"),
        nullable=False,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_warehouses.id", ondelete="CASCADE"),
        nullable=False,
    )
    batch_code: Mapped[str]  = mapped_column(String(80), nullable=False)
    quantity: Mapped[float]  = mapped_column(Numeric(14, 4), nullable=False, default=0)
    cost_unit: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    manufacture_date: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Optional[datetime]]      = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StockSerial(TenantBase):
    """
    Item identificado por número de série (produto type.tracks_serial=True).
    Cada serial é uma unidade individual com ciclo de vida.
    """
    __tablename__ = "estoque_stock_serials"
    __table_args__ = (UniqueConstraint("product_id", "serial", name="uq_estoque_serial"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_products.id", ondelete="CASCADE"),
        nullable=False,
    )
    warehouse_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_warehouses.id", ondelete="SET NULL"),
        nullable=True,
    )
    serial: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[SerialStatus] = mapped_column(
        SAEnum(SerialStatus, values_callable=_enum_values, native_enum=False),
        nullable=False, default=SerialStatus.IN_STOCK,
    )
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_stock_batches.id", ondelete="SET NULL"),
        nullable=True,
    )
    metadata_json: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    cost_unit: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─────────────────────────────────────────────
# MOVEMENTS (ledger imutável)
# ─────────────────────────────────────────────

class StockMovement(TenantBase):
    """
    Lançamento de estoque. Imutável — correções viram novos movimentos.
    Para transfer, dois movimentos são criados (origem OUT + destino IN) com
    o mesmo transfer_group_id.
    """
    __tablename__ = "estoque_stock_movements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_products.id", ondelete="RESTRICT"),
        nullable=False,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_warehouses.id", ondelete="RESTRICT"),
        nullable=False,
    )
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_stock_batches.id", ondelete="SET NULL"),
        nullable=True,
    )
    serial_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_stock_serials.id", ondelete="SET NULL"),
        nullable=True,
    )
    type: Mapped[MovementType] = mapped_column(
        SAEnum(MovementType, values_callable=_enum_values, native_enum=False),
        nullable=False,
    )
    quantity: Mapped[float]  = mapped_column(Numeric(14, 4), nullable=False)
    cost_unit: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    reason: Mapped[Optional[str]] = mapped_column(String(200))
    reference_type: Mapped[Optional[str]] = mapped_column(String(50))
    reference_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    transfer_group_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    supplier_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("estoque_suppliers.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
