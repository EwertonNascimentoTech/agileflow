"""
Modelos do módulo PDV (Ponto de Venda) — vivem no schema isolado de cada tenant.

Fluxo: o operador abre uma sessão de caixa (CashSession) para um depósito, registra
vendas (Sale) com itens (SaleItem) e pagamentos (SalePayment), eventualmente faz
sangria/suprimento (CashMovement) e fecha o caixa conferindo o valor contado.

Cross-module: `product_id` e `warehouse_id` referenciam o módulo Estoque e são
UUID simples SEM FK — módulos são ativáveis/desativáveis de forma independente.
A validação acontece no service em runtime.

Regra de dinheiro: colunas monetárias são Numeric(12,2); quantidade é Numeric(14,4).
"""
import uuid
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String, Boolean, DateTime, ForeignKey,
    Text, Integer, Numeric, Enum as SAEnum, UniqueConstraint, Index, text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import TenantBase

_enum_values = lambda obj: [e.value for e in obj]  # noqa: E731


# ─────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────

class CashSessionStatus(str, enum.Enum):
    OPEN   = "open"
    CLOSED = "closed"


class CashMovementType(str, enum.Enum):
    SANGRIA    = "sangria"     # retirada de dinheiro do caixa
    SUPRIMENTO = "suprimento"  # reforço de dinheiro no caixa


class SaleStatus(str, enum.Enum):
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PaymentKind(str, enum.Enum):
    CASH     = "cash"      # dispara cálculo de troco e conta no caixa físico
    CARD     = "card"
    PIX      = "pix"
    TRANSFER = "transfer"
    OTHER    = "other"


# ─────────────────────────────────────────────
# CONFIG — FORMAS DE PAGAMENTO
# ─────────────────────────────────────────────

class PdvPaymentMethod(TenantBase):
    """
    Forma de pagamento configurável pelo tenant.
    `kind` é a categoria de comportamento; `name` é o rótulo livre.
    """
    __tablename__ = "pdv_payment_methods"
    __table_args__ = (UniqueConstraint("name", name="uq_pdv_payment_methods_name"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    kind: Mapped[PaymentKind] = mapped_column(
        SAEnum(PaymentKind, values_callable=_enum_values, native_enum=False),
        nullable=False,
    )
    affects_cash_drawer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    change_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─────────────────────────────────────────────
# CAIXA
# ─────────────────────────────────────────────

class CashSession(TenantBase):
    """
    Sessão de caixa. No máximo uma OPEN por depósito (partial unique index).
    `warehouse_id` referencia estoque_warehouses sem FK (cross-module).
    """
    __tablename__ = "pdv_cash_sessions"
    __table_args__ = (
        Index("ix_pdv_cash_sessions_status", "status"),
        Index(
            "uq_pdv_cash_session_open_per_warehouse",
            "warehouse_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[CashSessionStatus] = mapped_column(
        SAEnum(CashSessionStatus, values_callable=_enum_values, native_enum=False),
        nullable=False, default=CashSessionStatus.OPEN,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    opening_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    opened_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    closed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    counted_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    expected_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    difference: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    movements: Mapped[list["CashMovement"]] = relationship(
        back_populates="session", cascade="all, delete-orphan",
    )


class CashMovement(TenantBase):
    """Sangria (saída) ou suprimento (entrada) de dinheiro no caixa."""
    __tablename__ = "pdv_cash_movements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pdv_cash_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[CashMovementType] = mapped_column(
        SAEnum(CashMovementType, values_callable=_enum_values, native_enum=False),
        nullable=False,
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    session: Mapped["CashSession"] = relationship(back_populates="movements")


# ─────────────────────────────────────────────
# VENDA
# ─────────────────────────────────────────────

class Sale(TenantBase):
    """
    Venda finalizada no PDV. `number` é sequencial (VND-NNNNNN).
    `session_id` amarra a venda à sessão de caixa aberta no momento.
    """
    __tablename__ = "pdv_sales"
    __table_args__ = (
        UniqueConstraint("number", name="uq_pdv_sales_number"),
        Index("ix_pdv_sales_created", "created_at"),
        Index("ix_pdv_sales_session", "session_id"),
        Index("ix_pdv_sales_operator", "operator_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[SaleStatus] = mapped_column(
        SAEnum(SaleStatus, values_callable=_enum_values, native_enum=False),
        nullable=False, default=SaleStatus.COMPLETED,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pdv_cash_sessions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    discount_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    paid_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    change_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    operator_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancelled_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items: Mapped[list["SaleItem"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan",
    )
    payments: Mapped[list["SalePayment"]] = relationship(
        back_populates="sale", cascade="all, delete-orphan",
    )


class SaleItem(TenantBase):
    """
    Linha de venda. sku/name/unit são snapshots — o recibo permanece correto
    mesmo se o produto for renomeado depois.
    """
    __tablename__ = "pdv_sale_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pdv_sales.id", ondelete="CASCADE"),
        nullable=False,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    product_sku: Mapped[str] = mapped_column(String(80), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="un")
    quantity: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    discount_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    line_total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sale: Mapped["Sale"] = relationship(back_populates="items")


class SalePayment(TenantBase):
    """
    Pagamento de uma venda. Uma venda pode ter vários (split).
    method_name/method_kind são snapshots — a aritmética do caixa sobrevive
    a edições posteriores da forma de pagamento.
    """
    __tablename__ = "pdv_sale_payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pdv_sales.id", ondelete="CASCADE"),
        nullable=False,
    )
    payment_method_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pdv_payment_methods.id", ondelete="RESTRICT"),
        nullable=False,
    )
    method_name: Mapped[str] = mapped_column(String(80), nullable=False)
    method_kind: Mapped[PaymentKind] = mapped_column(
        SAEnum(PaymentKind, values_callable=_enum_values, native_enum=False),
        nullable=False,
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sale: Mapped["Sale"] = relationship(back_populates="payments")
