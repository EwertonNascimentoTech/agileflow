import api from "./client"

// ── Types ─────────────────────────────────────

export type CashSessionStatus = "open" | "closed"
export type CashMovementType = "sangria" | "suprimento"
export type SaleStatus = "completed" | "cancelled"
export type PaymentKind = "cash" | "card" | "pix" | "transfer" | "other"

export interface PaymentMethod {
  id: string
  name: string
  kind: PaymentKind
  affects_cash_drawer: boolean
  change_enabled: boolean
  order: number
  is_active: boolean
  created_at: string
}
export interface PaymentMethodCreate {
  name: string
  kind: PaymentKind
  affects_cash_drawer?: boolean
  change_enabled?: boolean
  order?: number
  is_active?: boolean
}
export type PaymentMethodUpdate = Partial<PaymentMethodCreate>

export interface CashMovement {
  id: string
  session_id: string
  type: CashMovementType
  amount: number
  reason: string
  notes: string | null
  user_id: string
  created_at: string
}
export interface CashMovementCreate {
  type: CashMovementType
  amount: number
  reason: string
  notes?: string
}

export interface CashSession {
  id: string
  status: CashSessionStatus
  warehouse_id: string
  opening_amount: number
  opened_by: string
  opened_at: string
  closed_by: string | null
  closed_at: string | null
  counted_amount: number | null
  expected_amount: number | null
  difference: number | null
  notes: string | null
  created_at: string
  movements: CashMovement[]
}
export interface CashSessionOpen {
  warehouse_id: string
  opening_amount?: number
  notes?: string
}
export interface CashSessionClose {
  counted_amount: number
  notes?: string
}

export interface PaymentBreakdown {
  method_kind: PaymentKind
  method_name: string
  count: number
  total: number
}
export interface CashSessionSummary {
  session_id: string
  status: CashSessionStatus
  opening_amount: number
  sales_count: number
  sales_total: number
  cash_in: number
  cash_out: number
  cash_sales_net: number
  expected_amount: number
  by_payment_method: PaymentBreakdown[]
}

export interface SaleItem {
  id: string
  product_id: string
  product_sku: string
  product_name: string
  unit: string
  quantity: number
  unit_price: number
  discount_amount: number
  line_total: number
  batch_id: string | null
  serial_id: string | null
}
export interface SalePayment {
  id: string
  payment_method_id: string
  method_name: string
  method_kind: PaymentKind
  amount: number
}
export interface Sale {
  id: string
  number: string
  status: SaleStatus
  session_id: string
  warehouse_id: string
  subtotal: number
  discount_amount: number
  total: number
  paid_amount: number
  change_amount: number
  operator_id: string
  notes: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
  created_at: string
  items: SaleItem[]
  payments: SalePayment[]
}
export interface SaleListItem {
  id: string
  number: string
  status: SaleStatus
  total: number
  operator_id: string
  created_at: string
}
export interface SaleItemInput {
  product_id: string
  quantity: number
  discount_amount?: number
  batch_id?: string | null
  serial_id?: string | null
}
export interface SalePaymentInput {
  payment_method_id: string
  amount: number
}
export interface SaleCreate {
  warehouse_id: string
  items: SaleItemInput[]
  payments: SalePaymentInput[]
  discount_amount?: number
  notes?: string
}

export interface ProductSearchResult {
  id: string
  sku: string
  name: string
  barcode: string | null
  unit: string
  sale_price: number
  stock_qty: number
  tracks_stock: boolean
  tracks_batch: boolean
  tracks_serial: boolean
}

export interface OperatorBreakdown {
  operator_id: string
  operator_name: string
  count: number
  total: number
}
export interface PaymentMethodDashboardBreakdown {
  method_id: string
  method_name: string
  count: number
  total: number
}
export interface PdvDashboard {
  date: string
  sales_count: number
  gross_total: number
  discount_total: number
  net_total: number
  average_ticket: number
  cancelled_count: number
  open_sessions: number
  by_operator: OperatorBreakdown[]
  by_payment_method: PaymentMethodDashboardBreakdown[]
}

// ── API ───────────────────────────────────────

export const paymentMethodsApi = {
  list: (activeOnly = false) =>
    api.get<PaymentMethod[]>("/pdv/payment-methods", { params: { active_only: activeOnly } }).then(r => r.data),
  get: (id: string) =>
    api.get<PaymentMethod>(`/pdv/payment-methods/${id}`).then(r => r.data),
  create: (data: PaymentMethodCreate) =>
    api.post<PaymentMethod>("/pdv/payment-methods", data).then(r => r.data),
  update: (id: string, data: PaymentMethodUpdate) =>
    api.patch<PaymentMethod>(`/pdv/payment-methods/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/pdv/payment-methods/${id}`).then(r => r.data),
}

export const cashApi = {
  listSessions: (params?: { status?: CashSessionStatus; skip?: number; limit?: number }) =>
    api.get<CashSession[]>("/pdv/cash-sessions", { params }).then(r => r.data),
  getOpenSession: (warehouseId: string) =>
    api.get<CashSession | null>("/pdv/cash-sessions/open", {
      params: { warehouse_id: warehouseId },
    }).then(r => r.data),
  getSession: (id: string) =>
    api.get<CashSession>(`/pdv/cash-sessions/${id}`).then(r => r.data),
  sessionSummary: (id: string) =>
    api.get<CashSessionSummary>(`/pdv/cash-sessions/${id}/summary`).then(r => r.data),
  openSession: (data: CashSessionOpen) =>
    api.post<CashSession>("/pdv/cash-sessions", data).then(r => r.data),
  addMovement: (sessionId: string, data: CashMovementCreate) =>
    api.post<CashMovement>(`/pdv/cash-sessions/${sessionId}/movements`, data).then(r => r.data),
  closeSession: (sessionId: string, data: CashSessionClose) =>
    api.post<CashSession>(`/pdv/cash-sessions/${sessionId}/close`, data).then(r => r.data),
}

export const salesApi = {
  list: (params?: {
    skip?: number
    limit?: number
    status?: SaleStatus
    session_id?: string
    operator_id?: string
    date_from?: string
    date_to?: string
  }) => api.get<SaleListItem[]>("/pdv/sales", { params }).then(r => r.data),
  get: (id: string) => api.get<Sale>(`/pdv/sales/${id}`).then(r => r.data),
  finalize: (data: SaleCreate) => api.post<Sale>("/pdv/sales", data).then(r => r.data),
  cancel: (id: string, reason: string) =>
    api.post<Sale>(`/pdv/sales/${id}/cancel`, { reason }).then(r => r.data),
  receipt: (id: string) => api.get<Sale>(`/pdv/sales/${id}/receipt`).then(r => r.data),
  searchProducts: (warehouseId: string, q?: string) =>
    api.get<ProductSearchResult[]>("/pdv/products/search", {
      params: { warehouse_id: warehouseId, q },
    }).then(r => r.data),
}

export const dashboardApi = {
  get: (day?: string) =>
    api.get<PdvDashboard>("/pdv/dashboard", { params: day ? { day } : undefined }).then(r => r.data),
}
