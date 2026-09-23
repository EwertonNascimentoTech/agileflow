import api from "./client"

// ── Types ─────────────────────────────────────

export type MovementType = "in" | "out" | "adjust" | "transfer"
export type SerialStatus = "in_stock" | "reserved" | "sold" | "damaged" | "returned"
export type FieldType = "text" | "textarea" | "number" | "date" | "boolean" | "select"

export interface ProductTypeField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: string[]
  help?: string
}

export interface ProductTypeFieldSchema {
  fields: ProductTypeField[]
}

export interface ProductType {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  field_schema: ProductTypeFieldSchema | null
  tracks_stock: boolean
  tracks_batch: boolean
  tracks_expiry: boolean
  tracks_serial: boolean
  is_active: boolean
  created_at: string
}

export interface ProductTypeCreate {
  slug: string
  name: string
  description?: string
  icon?: string
  field_schema?: ProductTypeFieldSchema
  tracks_stock?: boolean
  tracks_batch?: boolean
  tracks_expiry?: boolean
  tracks_serial?: boolean
  is_active?: boolean
}
export type ProductTypeUpdate = Partial<Omit<ProductTypeCreate, "slug">>

export interface ProductCategory {
  id: string
  name: string
  description: string | null
  parent_id: string | null
  product_type_id: string | null
  is_active: boolean
  created_at: string
}
export interface ProductCategoryCreate {
  name: string
  description?: string
  parent_id?: string | null
  product_type_id?: string | null
  is_active?: boolean
}
export type ProductCategoryUpdate = Partial<ProductCategoryCreate>

export interface Product {
  id: string
  type_id: string
  category_id: string | null
  sku: string
  name: string
  description: string | null
  barcode: string | null
  unit: string
  cost_price: number
  sale_price: number
  min_stock: number
  max_stock: number | null
  custom_fields: Record<string, unknown> | null
  is_active: boolean
  created_at: string
}
export interface ProductCreate {
  type_id: string
  category_id?: string | null
  sku: string
  name: string
  description?: string
  barcode?: string
  unit?: string
  cost_price?: number
  sale_price?: number
  min_stock?: number
  max_stock?: number | null
  custom_fields?: Record<string, unknown>
  is_active?: boolean
}
export type ProductUpdate = Partial<Omit<ProductCreate, "type_id">>

export interface Warehouse {
  id: string
  code: string
  name: string
  description: string | null
  address: Record<string, unknown> | null
  is_default: boolean
  is_active: boolean
  created_at: string
}
export interface WarehouseCreate {
  code: string
  name: string
  description?: string
  address?: Record<string, unknown>
  is_default?: boolean
  is_active?: boolean
}
export type WarehouseUpdate = Partial<WarehouseCreate>

export interface Supplier {
  id: string
  name: string
  trade_name: string | null
  document: string | null
  email: string | null
  phone: string | null
  address: Record<string, unknown> | null
  notes: string | null
  is_active: boolean
  created_at: string
}
export interface SupplierCreate {
  name: string
  trade_name?: string
  document?: string
  email?: string
  phone?: string
  address?: Record<string, unknown>
  notes?: string
  is_active?: boolean
}
export type SupplierUpdate = Partial<SupplierCreate>

export interface ProductSupplier {
  id: string
  product_id: string
  supplier_id: string
  supplier_sku: string | null
  cost_unit: number
  lead_time_days: number | null
  is_preferred: boolean
  created_at: string
}
export interface ProductSupplierCreate {
  supplier_id: string
  supplier_sku?: string
  cost_unit?: number
  lead_time_days?: number
  is_preferred?: boolean
}

export interface StockLevel {
  id: string
  product_id: string
  warehouse_id: string
  quantity: number
  reserved: number
  updated_at: string
}

export interface StockBatch {
  id: string
  product_id: string
  warehouse_id: string
  batch_code: string
  quantity: number
  cost_unit: number
  manufacture_date: string | null
  expiry_date: string | null
  created_at: string
}
export interface StockBatchCreate {
  product_id: string
  warehouse_id: string
  batch_code: string
  quantity: number
  cost_unit?: number
  manufacture_date?: string
  expiry_date?: string
}
export type StockBatchUpdate = Partial<Omit<StockBatchCreate, "product_id" | "warehouse_id" | "batch_code">>

export interface StockSerial {
  id: string
  product_id: string
  warehouse_id: string | null
  serial: string
  status: SerialStatus
  batch_id: string | null
  metadata: Record<string, unknown> | null
  cost_unit: number
  created_at: string
}
export interface StockSerialCreate {
  product_id: string
  warehouse_id?: string | null
  serial: string
  status?: SerialStatus
  batch_id?: string | null
  metadata?: Record<string, unknown>
  cost_unit?: number
}
export type StockSerialUpdate = Partial<Omit<StockSerialCreate, "product_id" | "serial">>

export interface StockMovement {
  id: string
  product_id: string
  warehouse_id: string
  batch_id: string | null
  serial_id: string | null
  type: MovementType
  quantity: number
  cost_unit: number
  reason: string | null
  reference_type: string | null
  reference_id: string | null
  transfer_group_id: string | null
  supplier_id: string | null
  user_id: string | null
  notes: string | null
  created_at: string
}

export interface StockMovementCreate {
  product_id: string
  warehouse_id: string
  type: MovementType
  quantity: number
  cost_unit?: number
  batch_id?: string | null
  serial_id?: string | null
  reason?: string
  reference_type?: string
  reference_id?: string
  supplier_id?: string | null
  notes?: string
}

export interface StockTransferCreate {
  product_id: string
  from_warehouse_id: string
  to_warehouse_id: string
  quantity: number
  batch_id?: string | null
  serial_id?: string | null
  reason?: string
  notes?: string
}

export interface StockAdjustCreate {
  product_id: string
  warehouse_id: string
  new_quantity: number
  reason: string
  notes?: string
}

export interface EstoqueOverview {
  total_products: number
  total_warehouses: number
  total_stock_value: number
  low_stock: Array<{
    product_id: string
    sku: string
    name: string
    quantity: number
    min_stock: number
    warehouse_id: string
  }>
}

// ── API ───────────────────────────────────────

export const productTypesApi = {
  list: (activeOnly = false) =>
    api.get<ProductType[]>("/estoque/product-types", { params: { active_only: activeOnly } }).then(r => r.data),
  get: (id: string) =>
    api.get<ProductType>(`/estoque/product-types/${id}`).then(r => r.data),
  create: (data: ProductTypeCreate) =>
    api.post<ProductType>("/estoque/product-types", data).then(r => r.data),
  update: (id: string, data: ProductTypeUpdate) =>
    api.patch<ProductType>(`/estoque/product-types/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/estoque/product-types/${id}`).then(r => r.data),
}

export const categoriesApi = {
  list: () => api.get<ProductCategory[]>("/estoque/categories").then(r => r.data),
  create: (data: ProductCategoryCreate) =>
    api.post<ProductCategory>("/estoque/categories", data).then(r => r.data),
  update: (id: string, data: ProductCategoryUpdate) =>
    api.patch<ProductCategory>(`/estoque/categories/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/estoque/categories/${id}`).then(r => r.data),
}

export const productsApi = {
  list: (params?: {
    skip?: number
    limit?: number
    type_id?: string
    category_id?: string
    is_active?: boolean
    search?: string
  }) => api.get<Product[]>("/estoque/products", { params }).then(r => r.data),
  get: (id: string) => api.get<Product>(`/estoque/products/${id}`).then(r => r.data),
  create: (data: ProductCreate) => api.post<Product>("/estoque/products", data).then(r => r.data),
  update: (id: string, data: ProductUpdate) =>
    api.patch<Product>(`/estoque/products/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete<void>(`/estoque/products/${id}`).then(r => r.data),
  listSuppliers: (productId: string) =>
    api.get<ProductSupplier[]>(`/estoque/products/${productId}/suppliers`).then(r => r.data),
  attachSupplier: (productId: string, data: ProductSupplierCreate) =>
    api.post<ProductSupplier>(`/estoque/products/${productId}/suppliers`, data).then(r => r.data),
  detachSupplier: (productId: string, supplierId: string) =>
    api.delete<void>(`/estoque/products/${productId}/suppliers/${supplierId}`).then(r => r.data),
}

export const warehousesApi = {
  list: (activeOnly = false) =>
    api.get<Warehouse[]>("/estoque/warehouses", { params: { active_only: activeOnly } }).then(r => r.data),
  create: (data: WarehouseCreate) => api.post<Warehouse>("/estoque/warehouses", data).then(r => r.data),
  update: (id: string, data: WarehouseUpdate) =>
    api.patch<Warehouse>(`/estoque/warehouses/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete<void>(`/estoque/warehouses/${id}`).then(r => r.data),
}

export const suppliersApi = {
  list: (activeOnly = false) =>
    api.get<Supplier[]>("/estoque/suppliers", { params: { active_only: activeOnly } }).then(r => r.data),
  create: (data: SupplierCreate) => api.post<Supplier>("/estoque/suppliers", data).then(r => r.data),
  update: (id: string, data: SupplierUpdate) =>
    api.patch<Supplier>(`/estoque/suppliers/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete<void>(`/estoque/suppliers/${id}`).then(r => r.data),
}

export const stockApi = {
  levels: (params?: { product_id?: string; warehouse_id?: string }) =>
    api.get<StockLevel[]>("/estoque/stock", { params }).then(r => r.data),
  listBatches: (params?: { product_id?: string; warehouse_id?: string }) =>
    api.get<StockBatch[]>("/estoque/batches", { params }).then(r => r.data),
  createBatch: (data: StockBatchCreate) =>
    api.post<StockBatch>("/estoque/batches", data).then(r => r.data),
  updateBatch: (id: string, data: StockBatchUpdate) =>
    api.patch<StockBatch>(`/estoque/batches/${id}`, data).then(r => r.data),
  removeBatch: (id: string) =>
    api.delete<void>(`/estoque/batches/${id}`).then(r => r.data),

  listSerials: (params?: { product_id?: string; warehouse_id?: string; status?: SerialStatus }) =>
    api.get<StockSerial[]>("/estoque/serials", { params }).then(r => r.data),
  createSerial: (data: StockSerialCreate) =>
    api.post<StockSerial>("/estoque/serials", data).then(r => r.data),
  updateSerial: (id: string, data: StockSerialUpdate) =>
    api.patch<StockSerial>(`/estoque/serials/${id}`, data).then(r => r.data),
  removeSerial: (id: string) =>
    api.delete<void>(`/estoque/serials/${id}`).then(r => r.data),

  listMovements: (params?: {
    skip?: number
    limit?: number
    product_id?: string
    warehouse_id?: string
    movement_type?: MovementType
    date_from?: string
    date_to?: string
  }) => api.get<StockMovement[]>("/estoque/movements", { params }).then(r => r.data),
  createMovement: (data: StockMovementCreate) =>
    api.post<StockMovement>("/estoque/movements", data).then(r => r.data),
  transfer: (data: StockTransferCreate) =>
    api.post<StockMovement[]>("/estoque/movements/transfer", data).then(r => r.data),
  adjust: (data: StockAdjustCreate) =>
    api.post<StockMovement>("/estoque/movements/adjust", data).then(r => r.data),

  overview: () => api.get<EstoqueOverview>("/estoque/overview").then(r => r.data),
}
