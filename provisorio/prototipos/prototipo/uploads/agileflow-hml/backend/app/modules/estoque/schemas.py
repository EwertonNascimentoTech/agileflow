"""
Pydantic schemas do módulo Estoque.

Filosofia: fail-fast. Nada de defaults silenciosos para campos críticos
(produto, depósito, quantidade, tipo de movimento). Se faltar → 422.
"""
import re
import uuid
from datetime import datetime, date
from typing import Optional, List, Any, Dict

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.estoque.models import MovementType, SerialStatus


# ══════════════════════════════════════════════
# PRODUCT TYPE
# ══════════════════════════════════════════════

_FIELD_TYPES = {"text", "textarea", "number", "date", "boolean", "select"}
_SLUG_RE = re.compile(r"^[a-z0-9_]+$")


def _validate_field_schema(schema: Optional[dict]) -> Optional[dict]:
    """Valida formato do field_schema. Retorna o schema ou levanta ValueError."""
    if schema is None:
        return None
    if not isinstance(schema, dict):
        raise ValueError("field_schema deve ser um objeto JSON.")
    fields = schema.get("fields")
    if fields is None:
        return schema  # vazio é OK
    if not isinstance(fields, list):
        raise ValueError("field_schema.fields deve ser uma lista.")
    seen_keys = set()
    for idx, f in enumerate(fields):
        if not isinstance(f, dict):
            raise ValueError(f"Campo #{idx} deve ser um objeto.")
        key = f.get("key")
        if not key or not isinstance(key, str) or not _SLUG_RE.match(key):
            raise ValueError(f"Campo #{idx}: 'key' deve ser slug (a-z0-9_).")
        if key in seen_keys:
            raise ValueError(f"Campo '{key}' duplicado.")
        seen_keys.add(key)
        if not f.get("label"):
            raise ValueError(f"Campo '{key}' precisa de 'label'.")
        ftype = f.get("type")
        if ftype not in _FIELD_TYPES:
            raise ValueError(f"Campo '{key}': type deve ser um de {_FIELD_TYPES}.")
        if ftype == "select":
            opts = f.get("options")
            if not isinstance(opts, list) or not opts:
                raise ValueError(f"Campo '{key}' (select) precisa de 'options' não vazio.")
    return schema


class ProductTypeBase(BaseModel):
    slug: str = Field(..., min_length=2, max_length=50)
    name: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=50)
    field_schema: Optional[Dict[str, Any]] = None
    tracks_stock: bool = True
    tracks_batch: bool = False
    tracks_expiry: bool = False
    tracks_serial: bool = False
    is_active: bool = True

    @field_validator("slug")
    @classmethod
    def _slug_valid(cls, v: str) -> str:
        if not _SLUG_RE.match(v):
            raise ValueError("slug deve conter apenas letras minúsculas, números e underscores.")
        return v

    @field_validator("field_schema")
    @classmethod
    def _schema_valid(cls, v: Optional[dict]) -> Optional[dict]:
        return _validate_field_schema(v)


class ProductTypeCreate(ProductTypeBase):
    pass


class ProductTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    description: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=50)
    field_schema: Optional[Dict[str, Any]] = None
    tracks_stock: Optional[bool] = None
    tracks_batch: Optional[bool] = None
    tracks_expiry: Optional[bool] = None
    tracks_serial: Optional[bool] = None
    is_active: Optional[bool] = None

    @field_validator("field_schema")
    @classmethod
    def _schema_valid(cls, v: Optional[dict]) -> Optional[dict]:
        return _validate_field_schema(v)


class ProductTypeResponse(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: Optional[str]
    icon: Optional[str]
    field_schema: Optional[Dict[str, Any]]
    tracks_stock: bool
    tracks_batch: bool
    tracks_expiry: bool
    tracks_serial: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# CATEGORY
# ══════════════════════════════════════════════

class ProductCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    product_type_id: Optional[uuid.UUID] = None
    is_active: bool = True


class ProductCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    product_type_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None


class ProductCategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    parent_id: Optional[uuid.UUID]
    product_type_id: Optional[uuid.UUID]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# PRODUCT
# ══════════════════════════════════════════════

class ProductCreate(BaseModel):
    type_id: uuid.UUID
    category_id: Optional[uuid.UUID] = None
    sku: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    barcode: Optional[str] = Field(None, max_length=80)
    unit: str = Field("un", min_length=1, max_length=20)
    cost_price: float = Field(0, ge=0)
    sale_price: float = Field(0, ge=0)
    min_stock: float = Field(0, ge=0)
    max_stock: Optional[float] = Field(None, ge=0)
    custom_fields: Optional[Dict[str, Any]] = None
    is_active: bool = True


class ProductUpdate(BaseModel):
    category_id: Optional[uuid.UUID] = None
    sku: Optional[str] = Field(None, min_length=1, max_length=80)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    barcode: Optional[str] = Field(None, max_length=80)
    unit: Optional[str] = Field(None, min_length=1, max_length=20)
    cost_price: Optional[float] = Field(None, ge=0)
    sale_price: Optional[float] = Field(None, ge=0)
    min_stock: Optional[float] = Field(None, ge=0)
    max_stock: Optional[float] = Field(None, ge=0)
    custom_fields: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class ProductResponse(BaseModel):
    id: uuid.UUID
    type_id: uuid.UUID
    category_id: Optional[uuid.UUID]
    sku: str
    name: str
    description: Optional[str]
    barcode: Optional[str]
    unit: str
    cost_price: float
    sale_price: float
    min_stock: float
    max_stock: Optional[float]
    custom_fields: Optional[Dict[str, Any]]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# WAREHOUSE
# ══════════════════════════════════════════════

class WarehouseCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=30)
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    address: Optional[Dict[str, Any]] = None
    is_default: bool = False
    is_active: bool = True


class WarehouseUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=1, max_length=30)
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None
    address: Optional[Dict[str, Any]] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class WarehouseResponse(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: Optional[str]
    address: Optional[Dict[str, Any]]
    is_default: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# SUPPLIER
# ══════════════════════════════════════════════

class SupplierCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    trade_name: Optional[str] = Field(None, max_length=200)
    document: Optional[str] = Field(None, max_length=30)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=30)
    address: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    is_active: bool = True


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    trade_name: Optional[str] = Field(None, max_length=200)
    document: Optional[str] = Field(None, max_length=30)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=30)
    address: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class SupplierResponse(BaseModel):
    id: uuid.UUID
    name: str
    trade_name: Optional[str]
    document: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    address: Optional[Dict[str, Any]]
    notes: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductSupplierCreate(BaseModel):
    supplier_id: uuid.UUID
    supplier_sku: Optional[str] = Field(None, max_length=80)
    cost_unit: float = Field(0, ge=0)
    lead_time_days: Optional[int] = Field(None, ge=0)
    is_preferred: bool = False


class ProductSupplierResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    supplier_id: uuid.UUID
    supplier_sku: Optional[str]
    cost_unit: float
    lead_time_days: Optional[int]
    is_preferred: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════
# BATCH / SERIAL
# ══════════════════════════════════════════════

class StockBatchCreate(BaseModel):
    product_id: uuid.UUID
    warehouse_id: uuid.UUID
    batch_code: str = Field(..., min_length=1, max_length=80)
    quantity: float = Field(..., ge=0)
    cost_unit: float = Field(0, ge=0)
    manufacture_date: Optional[date] = None
    expiry_date: Optional[date] = None


class StockBatchUpdate(BaseModel):
    quantity: Optional[float] = Field(None, ge=0)
    cost_unit: Optional[float] = Field(None, ge=0)
    manufacture_date: Optional[date] = None
    expiry_date: Optional[date] = None


class StockBatchResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    warehouse_id: uuid.UUID
    batch_code: str
    quantity: float
    cost_unit: float
    manufacture_date: Optional[date]
    expiry_date: Optional[date]
    created_at: datetime

    model_config = {"from_attributes": True}


class StockSerialCreate(BaseModel):
    product_id: uuid.UUID
    warehouse_id: Optional[uuid.UUID] = None
    serial: str = Field(..., min_length=1, max_length=120)
    status: SerialStatus = SerialStatus.IN_STOCK
    batch_id: Optional[uuid.UUID] = None
    metadata: Optional[Dict[str, Any]] = None
    cost_unit: float = Field(0, ge=0)


class StockSerialUpdate(BaseModel):
    warehouse_id: Optional[uuid.UUID] = None
    status: Optional[SerialStatus] = None
    batch_id: Optional[uuid.UUID] = None
    metadata: Optional[Dict[str, Any]] = None
    cost_unit: Optional[float] = Field(None, ge=0)


class StockSerialResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    warehouse_id: Optional[uuid.UUID]
    serial: str
    status: SerialStatus
    batch_id: Optional[uuid.UUID]
    metadata: Optional[Dict[str, Any]] = Field(None, alias="metadata_json")
    cost_unit: float
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


# ══════════════════════════════════════════════
# STOCK LEVEL / MOVEMENTS
# ══════════════════════════════════════════════

class StockLevelResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    warehouse_id: uuid.UUID
    quantity: float
    reserved: float
    updated_at: datetime

    model_config = {"from_attributes": True}


class StockMovementCreate(BaseModel):
    product_id: uuid.UUID
    warehouse_id: uuid.UUID
    type: MovementType
    quantity: float = Field(..., gt=0)
    cost_unit: float = Field(0, ge=0)
    batch_id: Optional[uuid.UUID] = None
    serial_id: Optional[uuid.UUID] = None
    reason: Optional[str] = Field(None, max_length=200)
    reference_type: Optional[str] = Field(None, max_length=50)
    reference_id: Optional[uuid.UUID] = None
    supplier_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class StockTransferCreate(BaseModel):
    product_id: uuid.UUID
    from_warehouse_id: uuid.UUID
    to_warehouse_id: uuid.UUID
    quantity: float = Field(..., gt=0)
    batch_id: Optional[uuid.UUID] = None
    serial_id: Optional[uuid.UUID] = None
    reason: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _warehouses_distinct(self) -> "StockTransferCreate":
        if self.from_warehouse_id == self.to_warehouse_id:
            raise ValueError("from_warehouse_id e to_warehouse_id devem ser diferentes.")
        return self


class StockAdjustCreate(BaseModel):
    """Ajuste manual: define quantidade absoluta (NÃO incrementa)."""
    product_id: uuid.UUID
    warehouse_id: uuid.UUID
    new_quantity: float = Field(..., ge=0)
    reason: str = Field(..., min_length=1, max_length=200)
    notes: Optional[str] = None


class StockMovementResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    warehouse_id: uuid.UUID
    batch_id: Optional[uuid.UUID]
    serial_id: Optional[uuid.UUID]
    type: MovementType
    quantity: float
    cost_unit: float
    reason: Optional[str]
    reference_type: Optional[str]
    reference_id: Optional[uuid.UUID]
    transfer_group_id: Optional[uuid.UUID]
    supplier_id: Optional[uuid.UUID]
    user_id: Optional[uuid.UUID]
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
