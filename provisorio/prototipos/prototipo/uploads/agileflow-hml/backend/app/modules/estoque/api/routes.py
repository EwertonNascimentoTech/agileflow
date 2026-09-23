"""
Endpoints HTTP do módulo Estoque.
Todos exigem require_module("estoque"). Permissions extras via require_permission.
"""
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import ModuleContext, require_module, require_permission
from app.modules.estoque.models import MovementType, SerialStatus
from app.modules.estoque.schemas import (
    ProductTypeCreate, ProductTypeUpdate, ProductTypeResponse,
    ProductCategoryCreate, ProductCategoryUpdate, ProductCategoryResponse,
    ProductCreate, ProductUpdate, ProductResponse,
    WarehouseCreate, WarehouseUpdate, WarehouseResponse,
    SupplierCreate, SupplierUpdate, SupplierResponse,
    ProductSupplierCreate, ProductSupplierResponse,
    StockBatchCreate, StockBatchUpdate, StockBatchResponse,
    StockSerialCreate, StockSerialUpdate, StockSerialResponse,
    StockLevelResponse, StockMovementCreate, StockMovementResponse,
    StockTransferCreate, StockAdjustCreate,
)
from app.modules.estoque.service import (
    ProductTypeService, ProductCategoryService, ProductService,
    WarehouseService, SupplierService, StockService,
)


router = APIRouter(prefix="/estoque", tags=["Estoque"])

_ctx = require_module("estoque")

_can_type     = require_permission("estoque.type.manage")
_can_category = require_permission("estoque.category.manage")
_can_view     = require_permission("estoque.product.view")
_can_create   = require_permission("estoque.product.create")
_can_update   = require_permission("estoque.product.update")
_can_delete   = require_permission("estoque.product.delete")
_can_warehouse = require_permission("estoque.warehouse.manage")
_can_supplier  = require_permission("estoque.supplier.manage")
_can_mov_view  = require_permission("estoque.movement.view")
_can_mov_create = require_permission("estoque.movement.create")
_can_batch    = require_permission("estoque.batch.manage")
_can_serial   = require_permission("estoque.serial.manage")


# ═════════════════════════════════════════════════════════
# PRODUCT TYPES
# ═════════════════════════════════════════════════════════

@router.get("/product-types", response_model=List[ProductTypeResponse])
async def list_product_types(
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProductTypeService.list_types(ctx.db, active_only=active_only)


@router.post("/product-types", response_model=ProductTypeResponse, status_code=201)
async def create_product_type(
    data: ProductTypeCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_type),
):
    return await ProductTypeService.create_type(ctx.db, data)


@router.get("/product-types/{type_id}", response_model=ProductTypeResponse)
async def get_product_type(
    type_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProductTypeService.get_type(ctx.db, type_id)


@router.patch("/product-types/{type_id}", response_model=ProductTypeResponse)
async def update_product_type(
    type_id: uuid.UUID,
    data: ProductTypeUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_type),
):
    return await ProductTypeService.update_type(ctx.db, type_id, data)


@router.delete("/product-types/{type_id}", status_code=204)
async def delete_product_type(
    type_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_type),
):
    await ProductTypeService.delete_type(ctx.db, type_id)


# ═════════════════════════════════════════════════════════
# CATEGORIES
# ═════════════════════════════════════════════════════════

@router.get("/categories", response_model=List[ProductCategoryResponse])
async def list_categories(ctx: ModuleContext = Depends(_ctx)):
    return await ProductCategoryService.list_categories(ctx.db)


@router.post("/categories", response_model=ProductCategoryResponse, status_code=201)
async def create_category(
    data: ProductCategoryCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_category),
):
    return await ProductCategoryService.create_category(ctx.db, data)


@router.patch("/categories/{cat_id}", response_model=ProductCategoryResponse)
async def update_category(
    cat_id: uuid.UUID,
    data: ProductCategoryUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_category),
):
    return await ProductCategoryService.update_category(ctx.db, cat_id, data)


@router.delete("/categories/{cat_id}", status_code=204)
async def delete_category(
    cat_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_category),
):
    await ProductCategoryService.delete_category(ctx.db, cat_id)


# ═════════════════════════════════════════════════════════
# PRODUCTS
# ═════════════════════════════════════════════════════════

@router.get("/products", response_model=List[ProductResponse])
async def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
    type_id: Optional[uuid.UUID] = Query(None),
    category_id: Optional[uuid.UUID] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProductService.list_products(
        ctx.db, skip=skip, limit=limit,
        type_id=type_id, category_id=category_id,
        is_active=is_active, search=search,
    )


@router.post("/products", response_model=ProductResponse, status_code=201)
async def create_product(
    data: ProductCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_create),
):
    return await ProductService.create_product(ctx.db, data)


@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProductService.get_product(ctx.db, product_id)


@router.patch("/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: uuid.UUID,
    data: ProductUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_update),
):
    return await ProductService.update_product(ctx.db, product_id, data)


@router.delete("/products/{product_id}", status_code=204)
async def delete_product(
    product_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_delete),
):
    await ProductService.delete_product(ctx.db, product_id)


@router.get("/products/{product_id}/suppliers", response_model=List[ProductSupplierResponse])
async def list_product_suppliers(
    product_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
):
    return await ProductService.list_suppliers(ctx.db, product_id)


@router.post(
    "/products/{product_id}/suppliers",
    response_model=ProductSupplierResponse,
    status_code=201,
)
async def attach_product_supplier(
    product_id: uuid.UUID,
    data: ProductSupplierCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_update),
):
    return await ProductService.attach_supplier(ctx.db, product_id, data)


@router.delete("/products/{product_id}/suppliers/{supplier_id}", status_code=204)
async def detach_product_supplier(
    product_id: uuid.UUID,
    supplier_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_update),
):
    await ProductService.detach_supplier(ctx.db, product_id, supplier_id)


# ═════════════════════════════════════════════════════════
# WAREHOUSES
# ═════════════════════════════════════════════════════════

@router.get("/warehouses", response_model=List[WarehouseResponse])
async def list_warehouses(
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    return await WarehouseService.list_warehouses(ctx.db, active_only=active_only)


@router.post("/warehouses", response_model=WarehouseResponse, status_code=201)
async def create_warehouse(
    data: WarehouseCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_warehouse),
):
    return await WarehouseService.create_warehouse(ctx.db, data)


@router.patch("/warehouses/{warehouse_id}", response_model=WarehouseResponse)
async def update_warehouse(
    warehouse_id: uuid.UUID,
    data: WarehouseUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_warehouse),
):
    return await WarehouseService.update_warehouse(ctx.db, warehouse_id, data)


@router.delete("/warehouses/{warehouse_id}", status_code=204)
async def delete_warehouse(
    warehouse_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_warehouse),
):
    await WarehouseService.delete_warehouse(ctx.db, warehouse_id)


# ═════════════════════════════════════════════════════════
# SUPPLIERS
# ═════════════════════════════════════════════════════════

@router.get("/suppliers", response_model=List[SupplierResponse])
async def list_suppliers(
    active_only: bool = Query(False),
    ctx: ModuleContext = Depends(_ctx),
):
    return await SupplierService.list_suppliers(ctx.db, active_only=active_only)


@router.post("/suppliers", response_model=SupplierResponse, status_code=201)
async def create_supplier(
    data: SupplierCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_supplier),
):
    return await SupplierService.create_supplier(ctx.db, data)


@router.patch("/suppliers/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: uuid.UUID,
    data: SupplierUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_supplier),
):
    return await SupplierService.update_supplier(ctx.db, supplier_id, data)


@router.delete("/suppliers/{supplier_id}", status_code=204)
async def delete_supplier(
    supplier_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_supplier),
):
    await SupplierService.delete_supplier(ctx.db, supplier_id)


# ═════════════════════════════════════════════════════════
# STOCK LEVELS
# ═════════════════════════════════════════════════════════

@router.get("/stock", response_model=List[StockLevelResponse])
async def list_stock_levels(
    product_id: Optional[uuid.UUID] = Query(None),
    warehouse_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await StockService.list_levels(ctx.db, product_id=product_id, warehouse_id=warehouse_id)


# ═════════════════════════════════════════════════════════
# BATCHES
# ═════════════════════════════════════════════════════════

@router.get("/batches", response_model=List[StockBatchResponse])
async def list_batches(
    product_id: Optional[uuid.UUID] = Query(None),
    warehouse_id: Optional[uuid.UUID] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await StockService.list_batches(ctx.db, product_id=product_id, warehouse_id=warehouse_id)


@router.post("/batches", response_model=StockBatchResponse, status_code=201)
async def create_batch(
    data: StockBatchCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_batch),
):
    return await StockService.create_batch(ctx.db, data)


@router.patch("/batches/{batch_id}", response_model=StockBatchResponse)
async def update_batch(
    batch_id: uuid.UUID,
    data: StockBatchUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_batch),
):
    return await StockService.update_batch(ctx.db, batch_id, data)


@router.delete("/batches/{batch_id}", status_code=204)
async def delete_batch(
    batch_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_batch),
):
    await StockService.delete_batch(ctx.db, batch_id)


# ═════════════════════════════════════════════════════════
# SERIALS
# ═════════════════════════════════════════════════════════

@router.get("/serials", response_model=List[StockSerialResponse])
async def list_serials(
    product_id: Optional[uuid.UUID] = Query(None),
    warehouse_id: Optional[uuid.UUID] = Query(None),
    status: Optional[SerialStatus] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await StockService.list_serials(
        ctx.db, product_id=product_id, warehouse_id=warehouse_id, status=status
    )


@router.post("/serials", response_model=StockSerialResponse, status_code=201)
async def create_serial(
    data: StockSerialCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_serial),
):
    return await StockService.create_serial(ctx.db, data)


@router.patch("/serials/{serial_id}", response_model=StockSerialResponse)
async def update_serial(
    serial_id: uuid.UUID,
    data: StockSerialUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_serial),
):
    return await StockService.update_serial(ctx.db, serial_id, data)


@router.delete("/serials/{serial_id}", status_code=204)
async def delete_serial(
    serial_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_serial),
):
    await StockService.delete_serial(ctx.db, serial_id)


# ═════════════════════════════════════════════════════════
# MOVEMENTS
# ═════════════════════════════════════════════════════════

@router.get("/movements", response_model=List[StockMovementResponse])
async def list_movements(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    product_id: Optional[uuid.UUID] = Query(None),
    warehouse_id: Optional[uuid.UUID] = Query(None),
    movement_type: Optional[MovementType] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await StockService.list_movements(
        ctx.db, skip=skip, limit=limit,
        product_id=product_id, warehouse_id=warehouse_id,
        movement_type=movement_type, date_from=date_from, date_to=date_to,
    )


@router.post("/movements", response_model=StockMovementResponse, status_code=201)
async def create_movement(
    data: StockMovementCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_mov_create),
):
    return await StockService.create_movement(ctx.db, data, ctx.user)


@router.post("/movements/transfer", response_model=List[StockMovementResponse], status_code=201)
async def transfer_stock(
    data: StockTransferCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_mov_create),
):
    out_mov, in_mov = await StockService.transfer(ctx.db, data, ctx.user)
    return [out_mov, in_mov]


@router.post("/movements/adjust", response_model=StockMovementResponse, status_code=201)
async def adjust_stock(
    data: StockAdjustCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_mov_create),
):
    return await StockService.adjust(ctx.db, data, ctx.user)


# ═════════════════════════════════════════════════════════
# OVERVIEW
# ═════════════════════════════════════════════════════════

@router.get("/overview")
async def overview(ctx: ModuleContext = Depends(_ctx)):
    return await StockService.overview(ctx.db)
