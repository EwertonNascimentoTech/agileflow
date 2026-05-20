"""
Endpoints HTTP do módulo PDV (Ponto de Venda).
Todos exigem require_module("pdv"). Permissions extras via require_permission.
"""
import uuid
from datetime import datetime, date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import ModuleContext, require_module, require_permission
from app.modules.pdv.models import CashSessionStatus, SaleStatus
from app.modules.pdv.schemas import (
    PaymentMethodCreate, PaymentMethodUpdate, PaymentMethodResponse,
    CashSessionOpen, CashSessionClose, CashSessionResponse, CashSessionSummary,
    CashMovementCreate, CashMovementResponse,
    SaleCreate, SaleCancelRequest, SaleResponse, SaleListItem,
    ProductSearchResult, PdvDashboardResponse,
)
from app.modules.pdv.service import (
    PaymentMethodService, CashSessionService, SaleService, PdvReportService,
)


router = APIRouter(prefix="/pdv", tags=["PDV"])

_ctx = require_module("pdv")

_can_cash_view   = require_permission("pdv.cash.view")
_can_cash_op     = require_permission("pdv.cash.operate")
_can_sale_view   = require_permission("pdv.sale.view")
_can_sale_create = require_permission("pdv.sale.create")
_can_sale_cancel = require_permission("pdv.sale.cancel")
_can_pm_manage   = require_permission("pdv.payment_method.manage")
_can_report      = require_permission("pdv.report.view")


# ═════════════════════════════════════════════════════════
# FORMAS DE PAGAMENTO
# ═════════════════════════════════════════════════════════

@router.get("/payment-methods", response_model=List[PaymentMethodResponse])
async def list_payment_methods(
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    return await PaymentMethodService.list_methods(ctx.db, active_only=active_only)


@router.post("/payment-methods", response_model=PaymentMethodResponse, status_code=201)
async def create_payment_method(
    data: PaymentMethodCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_pm_manage),
):
    return await PaymentMethodService.create_method(ctx.db, data)


@router.get("/payment-methods/{method_id}", response_model=PaymentMethodResponse)
async def get_payment_method(
    method_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await PaymentMethodService.get_method(ctx.db, method_id)


@router.patch("/payment-methods/{method_id}", response_model=PaymentMethodResponse)
async def update_payment_method(
    method_id: uuid.UUID,
    data: PaymentMethodUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_pm_manage),
):
    return await PaymentMethodService.update_method(ctx.db, method_id, data)


@router.delete("/payment-methods/{method_id}", status_code=204)
async def delete_payment_method(
    method_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_pm_manage),
):
    await PaymentMethodService.delete_method(ctx.db, method_id)


# ═════════════════════════════════════════════════════════
# CAIXA
# ═════════════════════════════════════════════════════════

@router.get("/cash-sessions", response_model=List[CashSessionResponse])
async def list_cash_sessions(
    status: Optional[CashSessionStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_cash_view),
):
    return await CashSessionService.list_sessions(
        ctx.db, status=status, skip=skip, limit=limit,
    )


@router.get("/cash-sessions/open", response_model=Optional[CashSessionResponse])
async def get_open_cash_session(
    warehouse_id: uuid.UUID = Query(...),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_cash_view),
):
    return await CashSessionService.get_open_session(ctx.db, warehouse_id)


@router.post("/cash-sessions", response_model=CashSessionResponse, status_code=201)
async def open_cash_session(
    data: CashSessionOpen,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_cash_op),
):
    return await CashSessionService.open_session(ctx.db, data, ctx.user)


@router.get("/cash-sessions/{session_id}", response_model=CashSessionResponse)
async def get_cash_session(
    session_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_cash_view),
):
    return await CashSessionService.get_session(ctx.db, session_id)


@router.get("/cash-sessions/{session_id}/summary", response_model=CashSessionSummary)
async def get_cash_session_summary(
    session_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_cash_view),
):
    session = await CashSessionService.get_session(ctx.db, session_id)
    return await CashSessionService.session_summary(ctx.db, session)


@router.post(
    "/cash-sessions/{session_id}/movements",
    response_model=CashMovementResponse,
    status_code=201,
)
async def add_cash_movement(
    session_id: uuid.UUID,
    data: CashMovementCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_cash_op),
):
    return await CashSessionService.add_movement(ctx.db, session_id, data, ctx.user)


@router.post("/cash-sessions/{session_id}/close", response_model=CashSessionResponse)
async def close_cash_session(
    session_id: uuid.UUID,
    data: CashSessionClose,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_cash_op),
):
    return await CashSessionService.close_session(ctx.db, session_id, data, ctx.user)


# ═════════════════════════════════════════════════════════
# VENDAS
# ═════════════════════════════════════════════════════════

@router.get("/sales", response_model=List[SaleListItem])
async def list_sales(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[SaleStatus] = Query(None),
    session_id: Optional[uuid.UUID] = Query(None),
    operator_id: Optional[uuid.UUID] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_sale_view),
):
    return await SaleService.list_sales(
        ctx.db, skip=skip, limit=limit, status=status,
        session_id=session_id, operator_id=operator_id,
        date_from=date_from, date_to=date_to,
    )


@router.post("/sales", response_model=SaleResponse, status_code=201)
async def finalize_sale(
    data: SaleCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_sale_create),
):
    return await SaleService.finalize_sale(ctx.db, data, ctx.user)


@router.get("/sales/{sale_id}", response_model=SaleResponse)
async def get_sale(
    sale_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_sale_view),
):
    return await SaleService.get_sale(ctx.db, sale_id)


@router.post("/sales/{sale_id}/cancel", response_model=SaleResponse)
async def cancel_sale(
    sale_id: uuid.UUID,
    data: SaleCancelRequest,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_sale_cancel),
):
    return await SaleService.cancel_sale(ctx.db, sale_id, data, ctx.user)


@router.get("/sales/{sale_id}/receipt", response_model=SaleResponse)
async def get_sale_receipt(
    sale_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_sale_view),
):
    return await SaleService.get_sale(ctx.db, sale_id)


# ═════════════════════════════════════════════════════════
# BUSCA DE PRODUTO (POS)
# ═════════════════════════════════════════════════════════

@router.get("/products/search", response_model=List[ProductSearchResult])
async def search_products(
    warehouse_id: uuid.UUID = Query(...),
    q: Optional[str] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_sale_create),
):
    return await SaleService.search_products(ctx.db, q, warehouse_id, ctx.user)


# ═════════════════════════════════════════════════════════
# DASHBOARD
# ═════════════════════════════════════════════════════════

@router.get("/dashboard", response_model=PdvDashboardResponse)
async def pdv_dashboard(
    day: Optional[date] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_report),
):
    return await PdvReportService.dashboard(ctx.db, day)
