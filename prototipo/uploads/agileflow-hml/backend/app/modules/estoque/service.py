"""
Services do módulo Estoque.

Regra global do projeto: fail-fast. Nenhuma operação faz fallback silencioso
para defaults (depósito padrão, tipo padrão, quantidade zero, ...). Faltou
algo → 400/404/422 explícito.

Saldo é mantido em `estoque_stock_levels` como snapshot atualizado pelo
service em cada movimento. A fonte da verdade é `estoque_stock_movements`.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Any, Dict, Tuple

from fastapi import HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.estoque.models import (
    ProductType, ProductCategory, Product,
    Warehouse, Supplier, ProductSupplier,
    StockLevel, StockBatch, StockSerial, StockMovement,
    MovementType, SerialStatus,
)
from app.modules.estoque.schemas import (
    ProductTypeCreate, ProductTypeUpdate,
    ProductCategoryCreate, ProductCategoryUpdate,
    ProductCreate, ProductUpdate,
    WarehouseCreate, WarehouseUpdate,
    SupplierCreate, SupplierUpdate, ProductSupplierCreate,
    StockBatchCreate, StockBatchUpdate,
    StockSerialCreate, StockSerialUpdate,
    StockMovementCreate, StockTransferCreate, StockAdjustCreate,
)
from app.modules.super_admin.models import User


# ═════════════════════════════════════════════════════════
# PRODUCT TYPE
# ═════════════════════════════════════════════════════════

class ProductTypeService:

    @staticmethod
    async def list_types(db: AsyncSession, active_only: bool = False) -> List[ProductType]:
        q = select(ProductType).order_by(ProductType.name)
        if active_only:
            q = q.where(ProductType.is_active.is_(True))
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_type(db: AsyncSession, type_id: uuid.UUID) -> ProductType:
        result = await db.execute(select(ProductType).where(ProductType.id == type_id))
        t = result.scalar_one_or_none()
        if not t:
            raise HTTPException(status_code=404, detail="Tipo de produto não encontrado.")
        return t

    @staticmethod
    async def _get_by_slug(db: AsyncSession, slug: str) -> Optional[ProductType]:
        result = await db.execute(select(ProductType).where(ProductType.slug == slug))
        return result.scalar_one_or_none()

    @staticmethod
    async def create_type(db: AsyncSession, data: ProductTypeCreate) -> ProductType:
        if await ProductTypeService._get_by_slug(db, data.slug):
            raise HTTPException(status_code=400, detail=f"Tipo com slug '{data.slug}' já existe.")
        t = ProductType(**data.model_dump())
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t

    @staticmethod
    async def update_type(db: AsyncSession, type_id: uuid.UUID, data: ProductTypeUpdate) -> ProductType:
        t = await ProductTypeService.get_type(db, type_id)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(t, k, v)
        t.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(t)
        return t

    @staticmethod
    async def delete_type(db: AsyncSession, type_id: uuid.UUID) -> None:
        t = await ProductTypeService.get_type(db, type_id)
        count = await db.execute(select(func.count(Product.id)).where(Product.type_id == type_id))
        if (count.scalar() or 0) > 0:
            raise HTTPException(
                status_code=400,
                detail="Tipo possui produtos vinculados. Remova-os ou inative o tipo.",
            )
        await db.delete(t)
        await db.commit()


# ═════════════════════════════════════════════════════════
# CATEGORY
# ═════════════════════════════════════════════════════════

class ProductCategoryService:

    @staticmethod
    async def list_categories(db: AsyncSession) -> List[ProductCategory]:
        result = await db.execute(
            select(ProductCategory).order_by(ProductCategory.name)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_category(db: AsyncSession, cat_id: uuid.UUID) -> ProductCategory:
        result = await db.execute(
            select(ProductCategory).where(ProductCategory.id == cat_id)
        )
        c = result.scalar_one_or_none()
        if not c:
            raise HTTPException(status_code=404, detail="Categoria não encontrada.")
        return c

    @staticmethod
    async def create_category(db: AsyncSession, data: ProductCategoryCreate) -> ProductCategory:
        if data.parent_id:
            await ProductCategoryService.get_category(db, data.parent_id)
        if data.product_type_id:
            await ProductTypeService.get_type(db, data.product_type_id)
        c = ProductCategory(**data.model_dump())
        db.add(c)
        await db.commit()
        await db.refresh(c)
        return c

    @staticmethod
    async def update_category(
        db: AsyncSession, cat_id: uuid.UUID, data: ProductCategoryUpdate
    ) -> ProductCategory:
        c = await ProductCategoryService.get_category(db, cat_id)
        payload = data.model_dump(exclude_unset=True)
        if "parent_id" in payload and payload["parent_id"]:
            if payload["parent_id"] == cat_id:
                raise HTTPException(status_code=400, detail="Categoria não pode ser pai dela mesma.")
            await ProductCategoryService.get_category(db, payload["parent_id"])
        if payload.get("product_type_id"):
            await ProductTypeService.get_type(db, payload["product_type_id"])
        for k, v in payload.items():
            setattr(c, k, v)
        c.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(c)
        return c

    @staticmethod
    async def delete_category(db: AsyncSession, cat_id: uuid.UUID) -> None:
        c = await ProductCategoryService.get_category(db, cat_id)
        count = await db.execute(
            select(func.count(Product.id)).where(Product.category_id == cat_id)
        )
        if (count.scalar() or 0) > 0:
            raise HTTPException(
                status_code=400, detail="Categoria possui produtos vinculados."
            )
        await db.delete(c)
        await db.commit()


# ═════════════════════════════════════════════════════════
# PRODUCT
# ═════════════════════════════════════════════════════════

def _validate_custom_fields(field_schema: Optional[dict], values: Optional[dict]) -> None:
    """
    Valida `values` contra `field_schema.fields`.
    fail-fast: required ausente → 422; tipo errado → 422; chave desconhecida → 422.
    Permite ausência total de valores se nenhum required existir.
    """
    if not field_schema or not field_schema.get("fields"):
        if values:
            raise HTTPException(
                status_code=422,
                detail="Tipo de produto não declara campos extras, mas custom_fields foi enviado.",
            )
        return

    fields = field_schema["fields"]
    known_keys = {f["key"] for f in fields}
    values = values or {}

    # chaves desconhecidas
    unknown = set(values.keys()) - known_keys
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Campos desconhecidos em custom_fields: {sorted(unknown)}",
        )

    for f in fields:
        key = f["key"]
        ftype = f["type"]
        required = bool(f.get("required"))
        present = key in values
        v = values.get(key)

        if required and (not present or v is None or v == ""):
            raise HTTPException(
                status_code=422, detail=f"Campo '{key}' é obrigatório.",
            )
        if not present or v is None:
            continue

        if ftype in ("text", "textarea"):
            if not isinstance(v, str):
                raise HTTPException(status_code=422, detail=f"Campo '{key}' deve ser texto.")
        elif ftype == "number":
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                raise HTTPException(status_code=422, detail=f"Campo '{key}' deve ser numérico.")
        elif ftype == "boolean":
            if not isinstance(v, bool):
                raise HTTPException(status_code=422, detail=f"Campo '{key}' deve ser booleano.")
        elif ftype == "date":
            if not isinstance(v, str):
                raise HTTPException(status_code=422, detail=f"Campo '{key}' deve ser data (string ISO).")
        elif ftype == "select":
            opts = f.get("options") or []
            if v not in opts:
                raise HTTPException(
                    status_code=422,
                    detail=f"Campo '{key}' deve ser um de: {opts}.",
                )


class ProductService:

    @staticmethod
    async def list_products(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 50,
        type_id: Optional[uuid.UUID] = None,
        category_id: Optional[uuid.UUID] = None,
        is_active: Optional[bool] = None,
        search: Optional[str] = None,
    ) -> List[Product]:
        q = select(Product).order_by(Product.name).offset(skip).limit(limit)
        if type_id:
            q = q.where(Product.type_id == type_id)
        if category_id:
            q = q.where(Product.category_id == category_id)
        if is_active is not None:
            q = q.where(Product.is_active.is_(is_active))
        if search:
            like = f"%{search}%"
            q = q.where(
                (Product.name.ilike(like))
                | (Product.sku.ilike(like))
                | (Product.barcode.ilike(like))
            )
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_product(db: AsyncSession, product_id: uuid.UUID) -> Product:
        result = await db.execute(select(Product).where(Product.id == product_id))
        p = result.scalar_one_or_none()
        if not p:
            raise HTTPException(status_code=404, detail="Produto não encontrado.")
        return p

    @staticmethod
    async def _sku_exists(db: AsyncSession, sku: str, exclude_id: Optional[uuid.UUID] = None) -> bool:
        q = select(Product.id).where(Product.sku == sku)
        if exclude_id:
            q = q.where(Product.id != exclude_id)
        result = await db.execute(q)
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def create_product(db: AsyncSession, data: ProductCreate) -> Product:
        ptype = await ProductTypeService.get_type(db, data.type_id)
        if not ptype.is_active:
            raise HTTPException(status_code=400, detail="Tipo de produto inativo.")
        if data.category_id:
            await ProductCategoryService.get_category(db, data.category_id)
        if await ProductService._sku_exists(db, data.sku):
            raise HTTPException(status_code=400, detail=f"SKU '{data.sku}' já está em uso.")

        _validate_custom_fields(ptype.field_schema, data.custom_fields)

        p = Product(**data.model_dump())
        db.add(p)
        await db.commit()
        await db.refresh(p)
        return p

    @staticmethod
    async def update_product(db: AsyncSession, product_id: uuid.UUID, data: ProductUpdate) -> Product:
        p = await ProductService.get_product(db, product_id)
        payload = data.model_dump(exclude_unset=True)

        if "sku" in payload and payload["sku"] != p.sku:
            if await ProductService._sku_exists(db, payload["sku"], exclude_id=product_id):
                raise HTTPException(status_code=400, detail=f"SKU '{payload['sku']}' já está em uso.")
        if "category_id" in payload and payload["category_id"]:
            await ProductCategoryService.get_category(db, payload["category_id"])
        if "custom_fields" in payload:
            ptype = await ProductTypeService.get_type(db, p.type_id)
            _validate_custom_fields(ptype.field_schema, payload["custom_fields"])

        for k, v in payload.items():
            setattr(p, k, v)
        p.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(p)
        return p

    @staticmethod
    async def delete_product(db: AsyncSession, product_id: uuid.UUID) -> None:
        p = await ProductService.get_product(db, product_id)
        # Bloqueia exclusão se houver movimentos para preservar auditoria
        count = await db.execute(
            select(func.count(StockMovement.id)).where(StockMovement.product_id == product_id)
        )
        if (count.scalar() or 0) > 0:
            raise HTTPException(
                status_code=400,
                detail="Produto possui movimentações registradas. Inative-o em vez de excluir.",
            )
        await db.delete(p)
        await db.commit()

    @staticmethod
    async def list_suppliers(db: AsyncSession, product_id: uuid.UUID) -> List[ProductSupplier]:
        await ProductService.get_product(db, product_id)
        result = await db.execute(
            select(ProductSupplier).where(ProductSupplier.product_id == product_id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def attach_supplier(
        db: AsyncSession, product_id: uuid.UUID, data: ProductSupplierCreate
    ) -> ProductSupplier:
        await ProductService.get_product(db, product_id)
        await SupplierService.get_supplier(db, data.supplier_id)
        existing = await db.execute(
            select(ProductSupplier).where(
                ProductSupplier.product_id == product_id,
                ProductSupplier.supplier_id == data.supplier_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Fornecedor já vinculado a esse produto.")
        ps = ProductSupplier(product_id=product_id, **data.model_dump())
        db.add(ps)
        await db.commit()
        await db.refresh(ps)
        return ps

    @staticmethod
    async def detach_supplier(
        db: AsyncSession, product_id: uuid.UUID, supplier_id: uuid.UUID
    ) -> None:
        result = await db.execute(
            select(ProductSupplier).where(
                ProductSupplier.product_id == product_id,
                ProductSupplier.supplier_id == supplier_id,
            )
        )
        ps = result.scalar_one_or_none()
        if not ps:
            raise HTTPException(status_code=404, detail="Vínculo produto-fornecedor não encontrado.")
        await db.delete(ps)
        await db.commit()


# ═════════════════════════════════════════════════════════
# WAREHOUSE
# ═════════════════════════════════════════════════════════

class WarehouseService:

    @staticmethod
    async def list_warehouses(db: AsyncSession, active_only: bool = False) -> List[Warehouse]:
        q = select(Warehouse).order_by(Warehouse.name)
        if active_only:
            q = q.where(Warehouse.is_active.is_(True))
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_warehouse(db: AsyncSession, warehouse_id: uuid.UUID) -> Warehouse:
        result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
        w = result.scalar_one_or_none()
        if not w:
            raise HTTPException(status_code=404, detail="Depósito não encontrado.")
        return w

    @staticmethod
    async def _code_exists(db: AsyncSession, code: str, exclude_id: Optional[uuid.UUID] = None) -> bool:
        q = select(Warehouse.id).where(Warehouse.code == code)
        if exclude_id:
            q = q.where(Warehouse.id != exclude_id)
        result = await db.execute(q)
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def create_warehouse(db: AsyncSession, data: WarehouseCreate) -> Warehouse:
        if await WarehouseService._code_exists(db, data.code):
            raise HTTPException(status_code=400, detail=f"Código '{data.code}' já está em uso.")
        if data.is_default:
            await WarehouseService._clear_default(db)
        w = Warehouse(**data.model_dump())
        db.add(w)
        await db.commit()
        await db.refresh(w)
        return w

    @staticmethod
    async def update_warehouse(
        db: AsyncSession, warehouse_id: uuid.UUID, data: WarehouseUpdate
    ) -> Warehouse:
        w = await WarehouseService.get_warehouse(db, warehouse_id)
        payload = data.model_dump(exclude_unset=True)
        if "code" in payload and payload["code"] != w.code:
            if await WarehouseService._code_exists(db, payload["code"], exclude_id=warehouse_id):
                raise HTTPException(status_code=400, detail=f"Código '{payload['code']}' já está em uso.")
        if payload.get("is_default"):
            await WarehouseService._clear_default(db, exclude_id=warehouse_id)
        for k, v in payload.items():
            setattr(w, k, v)
        w.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(w)
        return w

    @staticmethod
    async def _clear_default(db: AsyncSession, exclude_id: Optional[uuid.UUID] = None) -> None:
        q = select(Warehouse).where(Warehouse.is_default.is_(True))
        if exclude_id:
            q = q.where(Warehouse.id != exclude_id)
        result = await db.execute(q)
        for w in result.scalars().all():
            w.is_default = False

    @staticmethod
    async def delete_warehouse(db: AsyncSession, warehouse_id: uuid.UUID) -> None:
        w = await WarehouseService.get_warehouse(db, warehouse_id)
        count = await db.execute(
            select(func.count(StockMovement.id)).where(StockMovement.warehouse_id == warehouse_id)
        )
        if (count.scalar() or 0) > 0:
            raise HTTPException(
                status_code=400,
                detail="Depósito possui movimentações registradas. Inative-o em vez de excluir.",
            )
        await db.delete(w)
        await db.commit()


# ═════════════════════════════════════════════════════════
# SUPPLIER
# ═════════════════════════════════════════════════════════

class SupplierService:

    @staticmethod
    async def list_suppliers(db: AsyncSession, active_only: bool = False) -> List[Supplier]:
        q = select(Supplier).order_by(Supplier.name)
        if active_only:
            q = q.where(Supplier.is_active.is_(True))
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_supplier(db: AsyncSession, supplier_id: uuid.UUID) -> Supplier:
        result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
        s = result.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")
        return s

    @staticmethod
    async def create_supplier(db: AsyncSession, data: SupplierCreate) -> Supplier:
        s = Supplier(**data.model_dump())
        db.add(s)
        await db.commit()
        await db.refresh(s)
        return s

    @staticmethod
    async def update_supplier(
        db: AsyncSession, supplier_id: uuid.UUID, data: SupplierUpdate
    ) -> Supplier:
        s = await SupplierService.get_supplier(db, supplier_id)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(s, k, v)
        s.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(s)
        return s

    @staticmethod
    async def delete_supplier(db: AsyncSession, supplier_id: uuid.UUID) -> None:
        s = await SupplierService.get_supplier(db, supplier_id)
        await db.delete(s)
        await db.commit()


# ═════════════════════════════════════════════════════════
# STOCK (saldo, batches, serials, movimentos)
# ═════════════════════════════════════════════════════════

def _to_decimal(v) -> Decimal:
    return v if isinstance(v, Decimal) else Decimal(str(v))


class StockService:

    # ── Saldo ──────────────────────────────────────

    @staticmethod
    async def list_levels(
        db: AsyncSession,
        product_id: Optional[uuid.UUID] = None,
        warehouse_id: Optional[uuid.UUID] = None,
    ) -> List[StockLevel]:
        q = select(StockLevel)
        if product_id:
            q = q.where(StockLevel.product_id == product_id)
        if warehouse_id:
            q = q.where(StockLevel.warehouse_id == warehouse_id)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def _get_or_create_level(
        db: AsyncSession, product_id: uuid.UUID, warehouse_id: uuid.UUID
    ) -> StockLevel:
        result = await db.execute(
            select(StockLevel).where(
                StockLevel.product_id == product_id,
                StockLevel.warehouse_id == warehouse_id,
            )
        )
        lvl = result.scalar_one_or_none()
        if lvl is None:
            lvl = StockLevel(product_id=product_id, warehouse_id=warehouse_id, quantity=0, reserved=0)
            db.add(lvl)
            await db.flush()
        return lvl

    # ── Batches ────────────────────────────────────

    @staticmethod
    async def list_batches(
        db: AsyncSession,
        product_id: Optional[uuid.UUID] = None,
        warehouse_id: Optional[uuid.UUID] = None,
    ) -> List[StockBatch]:
        q = select(StockBatch).order_by(StockBatch.expiry_date.asc().nullslast())
        if product_id:
            q = q.where(StockBatch.product_id == product_id)
        if warehouse_id:
            q = q.where(StockBatch.warehouse_id == warehouse_id)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_batch(db: AsyncSession, batch_id: uuid.UUID) -> StockBatch:
        result = await db.execute(select(StockBatch).where(StockBatch.id == batch_id))
        b = result.scalar_one_or_none()
        if not b:
            raise HTTPException(status_code=404, detail="Lote não encontrado.")
        return b

    @staticmethod
    async def create_batch(db: AsyncSession, data: StockBatchCreate) -> StockBatch:
        product = await ProductService.get_product(db, data.product_id)
        ptype = await ProductTypeService.get_type(db, product.type_id)
        if not ptype.tracks_batch:
            raise HTTPException(
                status_code=400,
                detail=f"Tipo '{ptype.slug}' não rastreia lotes (tracks_batch=False).",
            )
        await WarehouseService.get_warehouse(db, data.warehouse_id)
        existing = await db.execute(
            select(StockBatch).where(
                StockBatch.product_id == data.product_id,
                StockBatch.warehouse_id == data.warehouse_id,
                StockBatch.batch_code == data.batch_code,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"Lote '{data.batch_code}' já existe para esse produto/depósito.",
            )
        b = StockBatch(**data.model_dump())
        db.add(b)
        await db.commit()
        await db.refresh(b)
        return b

    @staticmethod
    async def update_batch(
        db: AsyncSession, batch_id: uuid.UUID, data: StockBatchUpdate
    ) -> StockBatch:
        b = await StockService.get_batch(db, batch_id)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(b, k, v)
        b.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(b)
        return b

    @staticmethod
    async def delete_batch(db: AsyncSession, batch_id: uuid.UUID) -> None:
        b = await StockService.get_batch(db, batch_id)
        await db.delete(b)
        await db.commit()

    # ── Serials ────────────────────────────────────

    @staticmethod
    async def list_serials(
        db: AsyncSession,
        product_id: Optional[uuid.UUID] = None,
        warehouse_id: Optional[uuid.UUID] = None,
        status: Optional[SerialStatus] = None,
    ) -> List[StockSerial]:
        q = select(StockSerial).order_by(StockSerial.serial)
        if product_id:
            q = q.where(StockSerial.product_id == product_id)
        if warehouse_id:
            q = q.where(StockSerial.warehouse_id == warehouse_id)
        if status:
            q = q.where(StockSerial.status == status)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def get_serial(db: AsyncSession, serial_id: uuid.UUID) -> StockSerial:
        result = await db.execute(select(StockSerial).where(StockSerial.id == serial_id))
        s = result.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=404, detail="Número de série não encontrado.")
        return s

    @staticmethod
    async def create_serial(db: AsyncSession, data: StockSerialCreate) -> StockSerial:
        product = await ProductService.get_product(db, data.product_id)
        ptype = await ProductTypeService.get_type(db, product.type_id)
        if not ptype.tracks_serial:
            raise HTTPException(
                status_code=400,
                detail=f"Tipo '{ptype.slug}' não rastreia números de série.",
            )
        if data.warehouse_id:
            await WarehouseService.get_warehouse(db, data.warehouse_id)
        if data.batch_id:
            await StockService.get_batch(db, data.batch_id)
        existing = await db.execute(
            select(StockSerial).where(
                StockSerial.product_id == data.product_id,
                StockSerial.serial == data.serial,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=400, detail=f"Serial '{data.serial}' já existe para esse produto."
            )
        payload = data.model_dump()
        metadata = payload.pop("metadata", None)
        s = StockSerial(metadata_json=metadata, **payload)
        db.add(s)
        await db.commit()
        await db.refresh(s)
        return s

    @staticmethod
    async def update_serial(
        db: AsyncSession, serial_id: uuid.UUID, data: StockSerialUpdate
    ) -> StockSerial:
        s = await StockService.get_serial(db, serial_id)
        payload = data.model_dump(exclude_unset=True)
        if "metadata" in payload:
            s.metadata_json = payload.pop("metadata")
        if "warehouse_id" in payload and payload["warehouse_id"]:
            await WarehouseService.get_warehouse(db, payload["warehouse_id"])
        if "batch_id" in payload and payload["batch_id"]:
            await StockService.get_batch(db, payload["batch_id"])
        for k, v in payload.items():
            setattr(s, k, v)
        s.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(s)
        return s

    @staticmethod
    async def delete_serial(db: AsyncSession, serial_id: uuid.UUID) -> None:
        s = await StockService.get_serial(db, serial_id)
        await db.delete(s)
        await db.commit()

    # ── Movements ──────────────────────────────────

    @staticmethod
    async def list_movements(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        product_id: Optional[uuid.UUID] = None,
        warehouse_id: Optional[uuid.UUID] = None,
        movement_type: Optional[MovementType] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> List[StockMovement]:
        q = select(StockMovement).order_by(StockMovement.created_at.desc()).offset(skip).limit(limit)
        if product_id:
            q = q.where(StockMovement.product_id == product_id)
        if warehouse_id:
            q = q.where(StockMovement.warehouse_id == warehouse_id)
        if movement_type:
            q = q.where(StockMovement.type == movement_type)
        if date_from:
            q = q.where(StockMovement.created_at >= date_from)
        if date_to:
            q = q.where(StockMovement.created_at <= date_to)
        result = await db.execute(q)
        return list(result.scalars().all())

    @staticmethod
    async def _apply_movement(
        db: AsyncSession,
        product: Product,
        warehouse_id: uuid.UUID,
        mov_type: MovementType,
        quantity: Decimal,
        cost_unit: Decimal,
        batch_id: Optional[uuid.UUID],
        serial_id: Optional[uuid.UUID],
        reason: Optional[str],
        reference_type: Optional[str],
        reference_id: Optional[uuid.UUID],
        transfer_group_id: Optional[uuid.UUID],
        supplier_id: Optional[uuid.UUID],
        user_id: Optional[uuid.UUID],
        notes: Optional[str],
    ) -> StockMovement:
        ptype = await ProductTypeService.get_type(db, product.type_id)

        if not ptype.tracks_stock and mov_type in (MovementType.IN, MovementType.OUT, MovementType.TRANSFER):
            raise HTTPException(
                status_code=400,
                detail=f"Tipo '{ptype.slug}' não rastreia estoque; movimentações IN/OUT/TRANSFER não são permitidas.",
            )

        # Batch obrigatório se tipo rastreia lote
        if ptype.tracks_batch and not batch_id:
            raise HTTPException(
                status_code=422,
                detail="Tipo rastreia lote — informe batch_id na movimentação.",
            )
        if ptype.tracks_serial and not serial_id and mov_type != MovementType.ADJUST:
            raise HTTPException(
                status_code=422,
                detail="Tipo rastreia número de série — informe serial_id.",
            )

        if batch_id:
            batch = await StockService.get_batch(db, batch_id)
            if batch.product_id != product.id or batch.warehouse_id != warehouse_id:
                raise HTTPException(
                    status_code=400,
                    detail="Lote informado não pertence ao produto/depósito da movimentação.",
                )
        if serial_id:
            serial = await StockService.get_serial(db, serial_id)
            if serial.product_id != product.id:
                raise HTTPException(
                    status_code=400, detail="Serial informado não pertence ao produto.",
                )

        lvl = await StockService._get_or_create_level(db, product.id, warehouse_id)
        current = _to_decimal(lvl.quantity)
        delta = _to_decimal(quantity)

        if mov_type == MovementType.IN:
            new_qty = current + delta
        elif mov_type == MovementType.OUT:
            if delta > current:
                raise HTTPException(
                    status_code=400,
                    detail=f"Saldo insuficiente: disponível {current}, solicitado {delta}.",
                )
            new_qty = current - delta
        elif mov_type == MovementType.ADJUST:
            # quantity em ADJUST representa o NOVO total absoluto
            new_qty = delta
            delta = new_qty - current  # delta efetivo registrado
        elif mov_type == MovementType.TRANSFER:
            # transferência: lado individual já decompõe em IN/OUT pelo caller
            raise HTTPException(status_code=500, detail="TRANSFER deve ser decomposto pelo caller.")
        else:
            raise HTTPException(status_code=422, detail=f"Tipo de movimento inválido: {mov_type}.")

        lvl.quantity = new_qty

        # Atualiza saldo do batch se aplicável
        if batch_id and mov_type in (MovementType.IN, MovementType.OUT):
            batch = await StockService.get_batch(db, batch_id)
            bqty = _to_decimal(batch.quantity)
            batch.quantity = (bqty + delta) if mov_type == MovementType.IN else (bqty - delta)
            if batch.quantity < 0:
                raise HTTPException(status_code=400, detail="Saldo do lote ficaria negativo.")

        # Atualiza serial
        if serial_id and mov_type == MovementType.OUT:
            serial = await StockService.get_serial(db, serial_id)
            serial.status = SerialStatus.SOLD
        elif serial_id and mov_type == MovementType.IN:
            serial = await StockService.get_serial(db, serial_id)
            serial.status = SerialStatus.IN_STOCK
            serial.warehouse_id = warehouse_id

        mov = StockMovement(
            product_id=product.id,
            warehouse_id=warehouse_id,
            batch_id=batch_id,
            serial_id=serial_id,
            type=mov_type,
            quantity=delta if mov_type != MovementType.ADJUST else delta,
            cost_unit=cost_unit,
            reason=reason,
            reference_type=reference_type,
            reference_id=reference_id,
            transfer_group_id=transfer_group_id,
            supplier_id=supplier_id,
            user_id=user_id,
            notes=notes,
        )
        db.add(mov)
        await db.flush()
        return mov

    @staticmethod
    async def create_movement(
        db: AsyncSession, data: StockMovementCreate, user: User
    ) -> StockMovement:
        if data.type == MovementType.TRANSFER:
            raise HTTPException(
                status_code=400,
                detail="Use o endpoint /movements/transfer para transferências.",
            )
        product = await ProductService.get_product(db, data.product_id)
        await WarehouseService.get_warehouse(db, data.warehouse_id)
        if data.supplier_id:
            await SupplierService.get_supplier(db, data.supplier_id)

        mov = await StockService._apply_movement(
            db,
            product=product,
            warehouse_id=data.warehouse_id,
            mov_type=data.type,
            quantity=_to_decimal(data.quantity),
            cost_unit=_to_decimal(data.cost_unit),
            batch_id=data.batch_id,
            serial_id=data.serial_id,
            reason=data.reason,
            reference_type=data.reference_type,
            reference_id=data.reference_id,
            transfer_group_id=None,
            supplier_id=data.supplier_id,
            user_id=user.id,
            notes=data.notes,
        )
        await db.commit()
        await db.refresh(mov)
        return mov

    @staticmethod
    async def transfer(
        db: AsyncSession, data: StockTransferCreate, user: User
    ) -> Tuple[StockMovement, StockMovement]:
        product = await ProductService.get_product(db, data.product_id)
        await WarehouseService.get_warehouse(db, data.from_warehouse_id)
        await WarehouseService.get_warehouse(db, data.to_warehouse_id)
        group_id = uuid.uuid4()
        qty = _to_decimal(data.quantity)

        out_mov = await StockService._apply_movement(
            db, product=product, warehouse_id=data.from_warehouse_id,
            mov_type=MovementType.OUT, quantity=qty, cost_unit=Decimal("0"),
            batch_id=data.batch_id, serial_id=data.serial_id,
            reason=data.reason or "Transferência (saída)",
            reference_type="transfer", reference_id=None,
            transfer_group_id=group_id, supplier_id=None,
            user_id=user.id, notes=data.notes,
        )
        in_mov = await StockService._apply_movement(
            db, product=product, warehouse_id=data.to_warehouse_id,
            mov_type=MovementType.IN, quantity=qty, cost_unit=Decimal("0"),
            batch_id=data.batch_id, serial_id=data.serial_id,
            reason=data.reason or "Transferência (entrada)",
            reference_type="transfer", reference_id=None,
            transfer_group_id=group_id, supplier_id=None,
            user_id=user.id, notes=data.notes,
        )
        # Marca o tipo do out_mov como TRANSFER (foi criado como OUT pra reusar lógica)
        out_mov.type = MovementType.TRANSFER
        in_mov.type = MovementType.TRANSFER
        await db.commit()
        await db.refresh(out_mov)
        await db.refresh(in_mov)
        return out_mov, in_mov

    @staticmethod
    async def adjust(
        db: AsyncSession, data: StockAdjustCreate, user: User
    ) -> StockMovement:
        product = await ProductService.get_product(db, data.product_id)
        await WarehouseService.get_warehouse(db, data.warehouse_id)

        mov = await StockService._apply_movement(
            db, product=product, warehouse_id=data.warehouse_id,
            mov_type=MovementType.ADJUST,
            quantity=_to_decimal(data.new_quantity), cost_unit=Decimal("0"),
            batch_id=None, serial_id=None,
            reason=data.reason, reference_type="adjust", reference_id=None,
            transfer_group_id=None, supplier_id=None,
            user_id=user.id, notes=data.notes,
        )
        await db.commit()
        await db.refresh(mov)
        return mov

    # ── Overview / dashboard ───────────────────────

    @staticmethod
    async def overview(db: AsyncSession) -> Dict[str, Any]:
        total_products = (await db.execute(
            select(func.count(Product.id)).where(Product.is_active.is_(True))
        )).scalar() or 0
        total_warehouses = (await db.execute(
            select(func.count(Warehouse.id)).where(Warehouse.is_active.is_(True))
        )).scalar() or 0
        total_stock_value = (await db.execute(
            select(func.coalesce(func.sum(StockLevel.quantity * Product.cost_price), 0))
            .select_from(StockLevel)
            .join(Product, Product.id == StockLevel.product_id)
        )).scalar() or 0

        low_stock_q = await db.execute(
            select(Product, StockLevel)
            .join(StockLevel, StockLevel.product_id == Product.id)
            .where(Product.min_stock > 0, StockLevel.quantity <= Product.min_stock)
            .limit(50)
        )
        low_stock = [
            {
                "product_id": str(p.id),
                "sku": p.sku,
                "name": p.name,
                "quantity": float(lvl.quantity),
                "min_stock": float(p.min_stock),
                "warehouse_id": str(lvl.warehouse_id),
            }
            for p, lvl in low_stock_q.all()
        ]

        return {
            "total_products": total_products,
            "total_warehouses": total_warehouses,
            "total_stock_value": float(total_stock_value),
            "low_stock": low_stock,
        }
