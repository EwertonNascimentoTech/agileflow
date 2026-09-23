"""
Pydantic schemas do módulo PDV.

Filosofia: fail-fast. Sem defaults silenciosos para campos críticos.
Valores monetários e quantidades usam Decimal.
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, Field, model_validator

from app.modules.pdv.models import (
    CashSessionStatus, CashMovementType, SaleStatus, PaymentKind,
)


# ══════════════════════════════════════════════
# FORMA DE PAGAMENTO
# ══════════════════════════════════════════════

class PaymentMethodCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    kind: PaymentKind
    affects_cash_drawer: bool = False
    change_enabled: bool = False
    order: int = Field(0, ge=0)
    is_active: bool = True

    @model_validator(mode="after")
    def _check_change(self):
        if self.change_enabled and self.kind != PaymentKind.CASH:
            raise ValueError("change_enabled só é válido para formas do tipo 'cash'.")
        return self


class PaymentMethodUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    kind: Optional[PaymentKind] = None
    affects_cash_drawer: Optional[bool] = None
    change_enabled: Optional[bool] = None
    order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class PaymentMethodResponse(BaseModel):
    id: uuid.UUID
    name: str
    kind: PaymentKind
    affects_cash_drawer: bool
    change_enabled: bool
    order: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# CAIXA
# ══════════════════════════════════════════════

class CashSessionOpen(BaseModel):
    warehouse_id: uuid.UUID
    opening_amount: Decimal = Field(Decimal("0"), ge=0)
    notes: Optional[str] = None


class CashSessionClose(BaseModel):
    counted_amount: Decimal = Field(..., ge=0)
    notes: Optional[str] = None


class CashMovementCreate(BaseModel):
    type: CashMovementType
    amount: Decimal = Field(..., gt=0)
    reason: str = Field(..., min_length=1, max_length=200)
    notes: Optional[str] = None


class CashMovementResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    type: CashMovementType
    amount: Decimal
    reason: str
    notes: Optional[str]
    user_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class CashSessionResponse(BaseModel):
    id: uuid.UUID
    status: CashSessionStatus
    warehouse_id: uuid.UUID
    opening_amount: Decimal
    opened_by: uuid.UUID
    opened_at: datetime
    closed_by: Optional[uuid.UUID]
    closed_at: Optional[datetime]
    counted_amount: Optional[Decimal]
    expected_amount: Optional[Decimal]
    difference: Optional[Decimal]
    notes: Optional[str]
    created_at: datetime
    movements: List[CashMovementResponse] = []

    model_config = {"from_attributes": True}


class PaymentBreakdown(BaseModel):
    method_kind: PaymentKind
    method_name: str
    count: int
    total: Decimal


class CashSessionSummary(BaseModel):
    """Prévia do fechamento — totais calculados sobre as vendas da sessão."""
    session_id: uuid.UUID
    status: CashSessionStatus
    opening_amount: Decimal
    sales_count: int
    sales_total: Decimal
    cash_in: Decimal           # Σ suprimentos
    cash_out: Decimal          # Σ sangrias
    cash_sales_net: Decimal    # Σ (pagamentos cash − troco) das vendas
    expected_amount: Decimal   # quanto deve ter na gaveta
    by_payment_method: List[PaymentBreakdown] = []


# ══════════════════════════════════════════════
# VENDA
# ══════════════════════════════════════════════

class SaleItemInput(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal = Field(..., gt=0)
    discount_amount: Decimal = Field(Decimal("0"), ge=0)
    # Obrigatórios quando o tipo do produto rastreia lote/série.
    batch_id: Optional[uuid.UUID] = None
    serial_id: Optional[uuid.UUID] = None


class SalePaymentInput(BaseModel):
    payment_method_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)


class SaleCreate(BaseModel):
    warehouse_id: uuid.UUID
    items: List[SaleItemInput] = Field(..., min_length=1)
    payments: List[SalePaymentInput] = Field(..., min_length=1)
    discount_amount: Decimal = Field(Decimal("0"), ge=0)
    notes: Optional[str] = None


class SaleCancelRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=200)


class SaleItemResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_sku: str
    product_name: str
    unit: str
    quantity: Decimal
    unit_price: Decimal
    discount_amount: Decimal
    line_total: Decimal
    batch_id: Optional[uuid.UUID] = None
    serial_id: Optional[uuid.UUID] = None

    model_config = {"from_attributes": True}


class SalePaymentResponse(BaseModel):
    id: uuid.UUID
    payment_method_id: uuid.UUID
    method_name: str
    method_kind: PaymentKind
    amount: Decimal

    model_config = {"from_attributes": True}


class SaleResponse(BaseModel):
    id: uuid.UUID
    number: str
    status: SaleStatus
    session_id: uuid.UUID
    warehouse_id: uuid.UUID
    subtotal: Decimal
    discount_amount: Decimal
    total: Decimal
    paid_amount: Decimal
    change_amount: Decimal
    operator_id: uuid.UUID
    notes: Optional[str]
    cancelled_at: Optional[datetime]
    cancelled_by: Optional[uuid.UUID]
    cancel_reason: Optional[str]
    created_at: datetime
    items: List[SaleItemResponse] = []
    payments: List[SalePaymentResponse] = []

    model_config = {"from_attributes": True}


class SaleListItem(BaseModel):
    id: uuid.UUID
    number: str
    status: SaleStatus
    total: Decimal
    operator_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# BUSCA DE PRODUTO (POS)
# ══════════════════════════════════════════════

class ProductSearchResult(BaseModel):
    id: uuid.UUID
    sku: str
    name: str
    barcode: Optional[str]
    unit: str
    sale_price: Decimal
    stock_qty: Decimal
    tracks_stock: bool
    tracks_batch: bool = False
    tracks_serial: bool = False


# ══════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════

class OperatorBreakdown(BaseModel):
    operator_id: uuid.UUID
    operator_name: str
    count: int
    total: Decimal


class PaymentMethodBreakdown(BaseModel):
    method_id: uuid.UUID
    method_name: str
    count: int
    total: Decimal


class PdvDashboardResponse(BaseModel):
    date: date
    sales_count: int
    gross_total: Decimal
    discount_total: Decimal
    net_total: Decimal
    average_ticket: Decimal
    cancelled_count: int
    open_sessions: int
    by_operator: List[OperatorBreakdown] = []
    by_payment_method: List[PaymentMethodBreakdown] = []
