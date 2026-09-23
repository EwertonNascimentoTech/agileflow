"""
Services do módulo PDV.

Regra global do projeto: fail-fast. Nenhuma operação faz fallback silencioso.
Faltou algo → 400/404/409/422 explícito.

Integração com Estoque: a venda baixa estoque automaticamente. `finalize_sale` e
`cancel_sale` montam UMA transação atômica — usam `StockService._apply_movement`
(que só faz `flush()`, não `commit()`) e dão um único `commit()` no fim.
"""
import uuid
from datetime import datetime, date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.pdv.models import (
    PdvPaymentMethod, CashSession, CashMovement, Sale, SaleItem, SalePayment,
    CashSessionStatus, CashMovementType, SaleStatus, PaymentKind,
)
from app.modules.pdv.schemas import (
    PaymentMethodCreate, PaymentMethodUpdate,
    CashSessionOpen, CashSessionClose, CashMovementCreate,
    SaleCreate, SaleCancelRequest,
)
from app.modules.estoque.models import MovementType, SerialStatus
from app.modules.estoque.service import (
    StockService, ProductService, ProductTypeService, WarehouseService,
)
from app.modules.super_admin.models import User, TenantModule


_CENTS = Decimal("0.01")


def _to_decimal(v) -> Decimal:
    return v if isinstance(v, Decimal) else Decimal(str(v))


def _money(d) -> Decimal:
    """Arredonda para 2 casas, ROUND_HALF_UP."""
    return _to_decimal(d).quantize(_CENTS, rounding=ROUND_HALF_UP)


async def _require_estoque_active(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    """O PDV depende do módulo Estoque para baixar/reverter saldo."""
    result = await db.execute(
        select(TenantModule).where(
            TenantModule.tenant_id == tenant_id,
            TenantModule.module_slug == "estoque",
            TenantModule.is_active == True,  # noqa: E712
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="O módulo Estoque precisa estar ativo para operar o PDV.",
        )


# ═════════════════════════════════════════════════════════
# FORMAS DE PAGAMENTO
# ═════════════════════════════════════════════════════════

class PaymentMethodService:

    @staticmethod
    async def list_methods(db: AsyncSession, active_only: bool = False) -> List[PdvPaymentMethod]:
        q = select(PdvPaymentMethod).order_by(PdvPaymentMethod.order, PdvPaymentMethod.name)
        if active_only:
            q = q.where(PdvPaymentMethod.is_active.is_(True))
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_method(db: AsyncSession, method_id: uuid.UUID) -> PdvPaymentMethod:
        result = await db.execute(
            select(PdvPaymentMethod).where(PdvPaymentMethod.id == method_id)
        )
        m = result.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="Forma de pagamento não encontrada.")
        return m

    @staticmethod
    async def _name_exists(
        db: AsyncSession, name: str, exclude_id: Optional[uuid.UUID] = None
    ) -> bool:
        q = select(PdvPaymentMethod.id).where(PdvPaymentMethod.name == name)
        if exclude_id:
            q = q.where(PdvPaymentMethod.id != exclude_id)
        result = await db.execute(q)
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def create_method(db: AsyncSession, data: PaymentMethodCreate) -> PdvPaymentMethod:
        if await PaymentMethodService._name_exists(db, data.name):
            raise HTTPException(status_code=400, detail=f"Já existe uma forma '{data.name}'.")
        m = PdvPaymentMethod(**data.model_dump())
        db.add(m)
        await db.commit()
        await db.refresh(m)
        return m

    @staticmethod
    async def update_method(
        db: AsyncSession, method_id: uuid.UUID, data: PaymentMethodUpdate
    ) -> PdvPaymentMethod:
        m = await PaymentMethodService.get_method(db, method_id)
        payload = data.model_dump(exclude_unset=True)
        if "name" in payload and payload["name"] != m.name:
            if await PaymentMethodService._name_exists(db, payload["name"], exclude_id=method_id):
                raise HTTPException(status_code=400, detail=f"Já existe uma forma '{payload['name']}'.")
        for k, v in payload.items():
            setattr(m, k, v)
        # Coerência: troco só vale para dinheiro.
        if m.change_enabled and m.kind != PaymentKind.CASH:
            raise HTTPException(
                status_code=422,
                detail="change_enabled só é válido para formas do tipo 'cash'.",
            )
        m.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(m)
        return m

    @staticmethod
    async def delete_method(db: AsyncSession, method_id: uuid.UUID) -> None:
        m = await PaymentMethodService.get_method(db, method_id)
        count = await db.execute(
            select(func.count(SalePayment.id)).where(SalePayment.payment_method_id == method_id)
        )
        if (count.scalar() or 0) > 0:
            raise HTTPException(
                status_code=400,
                detail="Forma de pagamento possui pagamentos vinculados. Inative-a em vez de excluir.",
            )
        await db.delete(m)
        await db.commit()


# ═════════════════════════════════════════════════════════
# CAIXA
# ═════════════════════════════════════════════════════════

class CashSessionService:

    @staticmethod
    async def get_open_session(
        db: AsyncSession, warehouse_id: uuid.UUID
    ) -> Optional[CashSession]:
        result = await db.execute(
            select(CashSession)
            .where(
                CashSession.warehouse_id == warehouse_id,
                CashSession.status == CashSessionStatus.OPEN,
            )
            .options(selectinload(CashSession.movements))
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def require_open_session(
        db: AsyncSession, warehouse_id: uuid.UUID
    ) -> CashSession:
        session = await CashSessionService.get_open_session(db, warehouse_id)
        if not session:
            raise HTTPException(
                status_code=409, detail="Nenhum caixa aberto para este depósito.",
            )
        return session

    @staticmethod
    async def list_sessions(
        db: AsyncSession,
        status: Optional[CashSessionStatus] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[CashSession]:
        q = (
            select(CashSession)
            .order_by(CashSession.opened_at.desc())
            .offset(skip).limit(limit)
            .options(selectinload(CashSession.movements))
        )
        if status:
            q = q.where(CashSession.status == status)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_session(db: AsyncSession, session_id: uuid.UUID) -> CashSession:
        result = await db.execute(
            select(CashSession)
            .where(CashSession.id == session_id)
            .options(selectinload(CashSession.movements))
        )
        s = result.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Sessão de caixa não encontrada.")
        return s

    @staticmethod
    async def open_session(
        db: AsyncSession, data: CashSessionOpen, user: User
    ) -> CashSession:
        await _require_estoque_active(db, user.tenant_id)
        # Depósito precisa existir no estoque.
        await WarehouseService.get_warehouse(db, data.warehouse_id)
        # No máximo um caixa aberto por depósito.
        existing = await CashSessionService.get_open_session(db, data.warehouse_id)
        if existing:
            raise HTTPException(
                status_code=409,
                detail="Já existe um caixa aberto para este depósito.",
            )
        session = CashSession(
            warehouse_id=data.warehouse_id,
            opening_amount=_money(data.opening_amount),
            opened_by=user.id,
            notes=data.notes,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session, attribute_names=["movements"])
        return session

    @staticmethod
    async def add_movement(
        db: AsyncSession, session_id: uuid.UUID, data: CashMovementCreate, user: User
    ) -> CashMovement:
        session = await CashSessionService.get_session(db, session_id)
        if session.status != CashSessionStatus.OPEN:
            raise HTTPException(status_code=409, detail="O caixa já está fechado.")
        amount = _money(data.amount)
        if data.type == CashMovementType.SANGRIA:
            expected = await CashSessionService.compute_expected(db, session)
            if amount > expected:
                raise HTTPException(
                    status_code=400,
                    detail=f"Sangria maior que o disponível em caixa (R$ {expected}).",
                )
        mov = CashMovement(
            session_id=session.id,
            type=data.type,
            amount=amount,
            reason=data.reason,
            notes=data.notes,
            user_id=user.id,
        )
        db.add(mov)
        await db.commit()
        await db.refresh(mov)
        return mov

    @staticmethod
    async def _session_sales(db: AsyncSession, session_id: uuid.UUID) -> List[Sale]:
        result = await db.execute(
            select(Sale)
            .where(Sale.session_id == session_id, Sale.status == SaleStatus.COMPLETED)
            .options(selectinload(Sale.payments))
        )
        return list(result.scalars().all())

    @staticmethod
    async def compute_expected(db: AsyncSession, session: CashSession) -> Decimal:
        """opening + Σ suprimentos − Σ sangrias + Σ (pagamentos cash − troco)."""
        expected = _to_decimal(session.opening_amount)
        for mov in session.movements:
            if mov.type == CashMovementType.SUPRIMENTO:
                expected += _to_decimal(mov.amount)
            elif mov.type == CashMovementType.SANGRIA:
                expected -= _to_decimal(mov.amount)
        sales = await CashSessionService._session_sales(db, session.id)
        for sale in sales:
            cash_in = sum(
                (_to_decimal(p.amount) for p in sale.payments if p.method_kind == PaymentKind.CASH),
                Decimal("0"),
            )
            expected += cash_in - _to_decimal(sale.change_amount)
        return _money(expected)

    @staticmethod
    async def session_summary(db: AsyncSession, session: CashSession) -> dict:
        sales = await CashSessionService._session_sales(db, session.id)
        sales_total = sum((_to_decimal(s.total) for s in sales), Decimal("0"))

        cash_in = sum(
            (_to_decimal(m.amount) for m in session.movements
             if m.type == CashMovementType.SUPRIMENTO),
            Decimal("0"),
        )
        cash_out = sum(
            (_to_decimal(m.amount) for m in session.movements
             if m.type == CashMovementType.SANGRIA),
            Decimal("0"),
        )
        cash_sales_net = Decimal("0")
        breakdown: dict[PaymentKind, dict] = {}
        for sale in sales:
            for p in sale.payments:
                b = breakdown.setdefault(
                    p.method_kind,
                    {"method_kind": p.method_kind, "method_name": p.method_name,
                     "count": 0, "total": Decimal("0")},
                )
                b["count"] += 1
                b["total"] += _to_decimal(p.amount)
                if p.method_kind == PaymentKind.CASH:
                    cash_sales_net += _to_decimal(p.amount)
            cash_sales_net -= _to_decimal(sale.change_amount)

        expected = _to_decimal(session.opening_amount) + cash_in - cash_out + cash_sales_net

        return {
            "session_id": session.id,
            "status": session.status,
            "opening_amount": _money(session.opening_amount),
            "sales_count": len(sales),
            "sales_total": _money(sales_total),
            "cash_in": _money(cash_in),
            "cash_out": _money(cash_out),
            "cash_sales_net": _money(cash_sales_net),
            "expected_amount": _money(expected),
            "by_payment_method": [
                {**b, "total": _money(b["total"])} for b in breakdown.values()
            ],
        }

    @staticmethod
    async def close_session(
        db: AsyncSession, session_id: uuid.UUID, data: CashSessionClose, user: User
    ) -> CashSession:
        session = await CashSessionService.get_session(db, session_id)
        if session.status != CashSessionStatus.OPEN:
            raise HTTPException(status_code=409, detail="O caixa já está fechado.")
        expected = await CashSessionService.compute_expected(db, session)
        counted = _money(data.counted_amount)
        session.status = CashSessionStatus.CLOSED
        session.closed_by = user.id
        session.closed_at = datetime.utcnow()
        session.counted_amount = counted
        session.expected_amount = expected
        session.difference = _money(counted - expected)
        if data.notes:
            session.notes = data.notes
        session.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(session, attribute_names=["movements"])
        return session


# ═════════════════════════════════════════════════════════
# VENDA
# ═════════════════════════════════════════════════════════

class SaleService:

    @staticmethod
    async def _generate_number(db: AsyncSession) -> str:
        result = await db.execute(select(func.count(Sale.id)))
        count = result.scalar() or 0
        return f"VND-{count + 1:06d}"

    @staticmethod
    async def list_sales(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 50,
        status: Optional[SaleStatus] = None,
        session_id: Optional[uuid.UUID] = None,
        operator_id: Optional[uuid.UUID] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> List[Sale]:
        q = select(Sale).order_by(Sale.created_at.desc()).offset(skip).limit(limit)
        if status:
            q = q.where(Sale.status == status)
        if session_id:
            q = q.where(Sale.session_id == session_id)
        if operator_id:
            q = q.where(Sale.operator_id == operator_id)
        if date_from:
            q = q.where(Sale.created_at >= date_from)
        if date_to:
            q = q.where(Sale.created_at <= date_to)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_sale(db: AsyncSession, sale_id: uuid.UUID) -> Sale:
        result = await db.execute(
            select(Sale)
            .where(Sale.id == sale_id)
            .options(selectinload(Sale.items), selectinload(Sale.payments))
        )
        s = result.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Venda não encontrada.")
        return s

    @staticmethod
    async def finalize_sale(db: AsyncSession, data: SaleCreate, user: User) -> Sale:
        # 1. Caixa aberto para o depósito.
        session = await CashSessionService.require_open_session(db, data.warehouse_id)
        # 2. Estoque ativo (baixa é obrigatória).
        await _require_estoque_active(db, user.tenant_id)

        # 3. Resolve itens — snapshot de preço, validação de tipo/lote/série.
        resolved = []  # (product, ptype, qty, unit_price, line_discount, line_total, batch_id, serial_id)
        for item in data.items:
            product = await ProductService.get_product(db, item.product_id)
            if not product.is_active:
                raise HTTPException(
                    status_code=400, detail=f"Produto '{product.name}' está inativo.",
                )
            ptype = await ProductTypeService.get_type(db, product.type_id)
            qty = _to_decimal(item.quantity)

            # Lote/série: exige seleção e valida pertencimento + disponibilidade.
            batch_id = item.batch_id if ptype.tracks_batch else None
            serial_id = item.serial_id if ptype.tracks_serial else None
            if ptype.tracks_batch:
                if not batch_id:
                    raise HTTPException(status_code=422, detail=f"Produto '{product.name}' exige seleção de lote.")
                batch = await StockService.get_batch(db, batch_id)
                if batch.product_id != product.id or batch.warehouse_id != data.warehouse_id:
                    raise HTTPException(status_code=400, detail=f"Lote informado não pertence a '{product.name}' neste depósito.")
                if _to_decimal(batch.quantity) < qty:
                    raise HTTPException(status_code=400, detail=f"Saldo do lote insuficiente para '{product.name}'.")
            if ptype.tracks_serial:
                if not serial_id:
                    raise HTTPException(status_code=422, detail=f"Produto '{product.name}' exige número de série.")
                if qty != Decimal("1"):
                    raise HTTPException(status_code=422, detail=f"Produto serializado '{product.name}': use 1 por linha.")
                serial = await StockService.get_serial(db, serial_id)
                if serial.product_id != product.id:
                    raise HTTPException(status_code=400, detail=f"Série informada não pertence a '{product.name}'.")
                if serial.status != SerialStatus.IN_STOCK:
                    raise HTTPException(status_code=400, detail=f"Série de '{product.name}' não está disponível.")

            unit_price = _money(product.sale_price)
            line_discount = _money(item.discount_amount)
            gross = _money(qty * unit_price)
            if line_discount > gross:
                raise HTTPException(
                    status_code=422,
                    detail=f"Desconto do item '{product.name}' maior que o valor da linha.",
                )
            line_total = _money(gross - line_discount)
            resolved.append((product, ptype, qty, unit_price, line_discount, line_total, batch_id, serial_id))

        # 4. Totais.
        subtotal = _money(sum((r[5] for r in resolved), Decimal("0")))
        sale_discount = _money(data.discount_amount)
        if sale_discount > subtotal:
            raise HTTPException(
                status_code=422, detail="Desconto da venda maior que o subtotal.",
            )
        total = _money(subtotal - sale_discount)

        # 5. Pagamentos — snapshot de forma.
        resolved_payments = []  # (method, amount)
        for pay in data.payments:
            method = await PaymentMethodService.get_method(db, pay.payment_method_id)
            if not method.is_active:
                raise HTTPException(
                    status_code=400,
                    detail=f"Forma de pagamento '{method.name}' está inativa.",
                )
            resolved_payments.append((method, _money(pay.amount)))
        paid_amount = _money(sum((p[1] for p in resolved_payments), Decimal("0")))

        # 6. Troco — só dinheiro pode exceder o total.
        cash_total = _money(sum(
            (amt for method, amt in resolved_payments if method.kind == PaymentKind.CASH),
            Decimal("0"),
        ))
        non_cash_total = _money(paid_amount - cash_total)
        if non_cash_total > total:
            raise HTTPException(
                status_code=422,
                detail="Pagamentos não-dinheiro excedem o total da venda.",
            )
        if paid_amount < total:
            raise HTTPException(status_code=422, detail="Pagamento insuficiente.")
        change_amount = _money(max(Decimal("0"), paid_amount - total))

        # 7. Pré-check de saldo (guarda amigável antes de escrever).
        for product, ptype, qty, *_ in resolved:
            if not ptype.tracks_stock:
                continue
            levels = await StockService.list_levels(
                db, product_id=product.id, warehouse_id=data.warehouse_id
            )
            available = _to_decimal(levels[0].quantity) if levels else Decimal("0")
            if qty > available:
                raise HTTPException(
                    status_code=400,
                    detail=(f"Saldo insuficiente de '{product.name}': "
                            f"disponível {available}, solicitado {qty}."),
                )

        # 8. Cria a venda.
        number = await SaleService._generate_number(db)
        sale = Sale(
            number=number,
            status=SaleStatus.COMPLETED,
            session_id=session.id,
            warehouse_id=data.warehouse_id,
            subtotal=subtotal,
            discount_amount=sale_discount,
            total=total,
            paid_amount=paid_amount,
            change_amount=change_amount,
            operator_id=user.id,
            notes=data.notes,
        )
        db.add(sale)
        await db.flush()  # gera sale.id

        # 9. Itens e pagamentos.
        for product, ptype, qty, unit_price, line_discount, line_total, batch_id, serial_id in resolved:
            sale.items.append(SaleItem(
                product_id=product.id,
                product_sku=product.sku,
                product_name=product.name,
                unit=product.unit,
                quantity=qty,
                unit_price=unit_price,
                discount_amount=line_discount,
                line_total=line_total,
                batch_id=batch_id,
                serial_id=serial_id,
            ))
        for method, amount in resolved_payments:
            sale.payments.append(SalePayment(
                payment_method_id=method.id,
                method_name=method.name,
                method_kind=method.kind,
                amount=amount,
            ))
        await db.flush()

        # 10. Baixa de estoque (não commita — só flush).
        for product, ptype, qty, _up, _ld, _lt, batch_id, serial_id in resolved:
            if not ptype.tracks_stock:
                continue
            await StockService._apply_movement(
                db,
                product=product,
                warehouse_id=data.warehouse_id,
                mov_type=MovementType.OUT,
                quantity=qty,
                cost_unit=_to_decimal(product.cost_price),
                batch_id=batch_id,
                serial_id=serial_id,
                reason=f"Venda {sale.number}",
                reference_type="pdv_sale",
                reference_id=sale.id,
                transfer_group_id=None,
                supplier_id=None,
                user_id=user.id,
                notes=None,
            )

        # 11. Commit único — venda + itens + pagamentos + movimentos + saldos.
        await db.commit()
        await db.refresh(sale, attribute_names=["items", "payments"])
        return sale

    @staticmethod
    async def cancel_sale(
        db: AsyncSession, sale_id: uuid.UUID, data: SaleCancelRequest, user: User
    ) -> Sale:
        sale = await SaleService.get_sale(db, sale_id)
        if sale.status == SaleStatus.CANCELLED:
            raise HTTPException(status_code=409, detail="Venda já cancelada.")
        await _require_estoque_active(db, user.tenant_id)

        # Reverte o estoque de cada item rastreado.
        for item in sale.items:
            product = await ProductService.get_product(db, item.product_id)
            ptype = await ProductTypeService.get_type(db, product.type_id)
            if not ptype.tracks_stock:
                continue
            await StockService._apply_movement(
                db,
                product=product,
                warehouse_id=sale.warehouse_id,
                mov_type=MovementType.IN,
                quantity=_to_decimal(item.quantity),
                cost_unit=_to_decimal(product.cost_price),
                batch_id=item.batch_id,
                serial_id=item.serial_id,
                reason=f"Estorno venda {sale.number}",
                reference_type="pdv_sale_cancel",
                reference_id=sale.id,
                transfer_group_id=None,
                supplier_id=None,
                user_id=user.id,
                notes=None,
            )

        sale.status = SaleStatus.CANCELLED
        sale.cancelled_at = datetime.utcnow()
        sale.cancelled_by = user.id
        sale.cancel_reason = data.reason
        sale.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(sale, attribute_names=["items", "payments"])
        return sale

    @staticmethod
    async def search_products(
        db: AsyncSession, q: Optional[str], warehouse_id: uuid.UUID, user: User
    ) -> List[dict]:
        await _require_estoque_active(db, user.tenant_id)
        await WarehouseService.get_warehouse(db, warehouse_id)
        products = await ProductService.list_products(
            db, skip=0, limit=50, is_active=True, search=q,
        )
        results = []
        for p in products:
            ptype = await ProductTypeService.get_type(db, p.type_id)
            levels = await StockService.list_levels(
                db, product_id=p.id, warehouse_id=warehouse_id
            )
            stock_qty = _to_decimal(levels[0].quantity) if levels else Decimal("0")
            results.append({
                "id": p.id,
                "sku": p.sku,
                "name": p.name,
                "barcode": p.barcode,
                "unit": p.unit,
                "sale_price": _money(p.sale_price),
                "stock_qty": stock_qty,
                "tracks_stock": ptype.tracks_stock,
                "tracks_batch": ptype.tracks_batch,
                "tracks_serial": ptype.tracks_serial,
            })
        return results


# ═════════════════════════════════════════════════════════
# RELATÓRIOS
# ═════════════════════════════════════════════════════════

class PdvReportService:

    @staticmethod
    async def dashboard(db: AsyncSession, day: Optional[date] = None) -> dict:
        if day is None:
            day = datetime.utcnow().date()
        start = datetime(day.year, day.month, day.day)
        end = start + timedelta(days=1)

        result = await db.execute(
            select(Sale)
            .where(Sale.created_at >= start, Sale.created_at < end)
            .options(selectinload(Sale.payments))
        )
        sales = list(result.scalars().all())
        completed = [s for s in sales if s.status == SaleStatus.COMPLETED]
        cancelled_count = sum(1 for s in sales if s.status == SaleStatus.CANCELLED)

        gross_total = _money(sum((_to_decimal(s.subtotal) for s in completed), Decimal("0")))
        discount_total = _money(sum((_to_decimal(s.discount_amount) for s in completed), Decimal("0")))
        net_total = _money(sum((_to_decimal(s.total) for s in completed), Decimal("0")))
        sales_count = len(completed)
        average_ticket = _money(net_total / sales_count) if sales_count else Decimal("0.00")

        # Por operador.
        op_agg: dict[uuid.UUID, dict] = {}
        for s in completed:
            a = op_agg.setdefault(
                s.operator_id, {"count": 0, "total": Decimal("0")}
            )
            a["count"] += 1
            a["total"] += _to_decimal(s.total)
        by_operator = []
        if op_agg:
            names_result = await db.execute(
                select(User.id, User.full_name).where(User.id.in_(list(op_agg.keys())))
            )
            names = {row[0]: row[1] for row in names_result.all()}
            for op_id, a in op_agg.items():
                by_operator.append({
                    "operator_id": op_id,
                    "operator_name": names.get(op_id, "—"),
                    "count": a["count"],
                    "total": _money(a["total"]),
                })

        # Por forma de pagamento.
        pm_agg: dict[uuid.UUID, dict] = {}
        for s in completed:
            for p in s.payments:
                a = pm_agg.setdefault(
                    p.payment_method_id,
                    {"method_name": p.method_name, "count": 0, "total": Decimal("0")},
                )
                a["count"] += 1
                a["total"] += _to_decimal(p.amount)
        by_payment_method = [
            {"method_id": mid, "method_name": a["method_name"],
             "count": a["count"], "total": _money(a["total"])}
            for mid, a in pm_agg.items()
        ]

        open_sessions = (await db.execute(
            select(func.count(CashSession.id)).where(
                CashSession.status == CashSessionStatus.OPEN
            )
        )).scalar() or 0

        return {
            "date": day,
            "sales_count": sales_count,
            "gross_total": gross_total,
            "discount_total": discount_total,
            "net_total": net_total,
            "average_ticket": average_ticket,
            "cancelled_count": cancelled_count,
            "open_sessions": open_sessions,
            "by_operator": by_operator,
            "by_payment_method": by_payment_method,
        }
