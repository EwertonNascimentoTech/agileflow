import api from "./client"

// ── Types ─────────────────────────────────────

export type ProposalStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "cancelled"

export interface ProposalItem {
  id: string
  proposal_id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
  order: number
  custom_data: Record<string, unknown> | null
  created_at: string
}

export interface ProposalItemCreate {
  description: string
  quantity: number
  unit?: string
  unit_price: number
  order?: number
  custom_data?: Record<string, unknown>
}

export type ProposalItemUpdate = Partial<ProposalItemCreate>

export interface Proposal {
  id: string
  number: string
  version: number
  title: string
  description: string | null
  status: ProposalStatus
  attendance_id: string | null
  client_id: string | null
  company_id: string | null
  client_name: string | null
  client_email: string | null
  client_phone: string | null
  client_document: string | null
  total_value: number
  discount: number
  payment_terms: string | null
  delivery_terms: string | null
  notes: string | null
  valid_until: string | null
  sent_at: string | null
  accepted_at: string | null
  rejected_at: string | null
  created_by: string | null
  public_token: string | null
  public_acceptance: Record<string, unknown> | null
  items: ProposalItem[]
  created_at: string
  updated_at: string
}

export interface ProposalSummary {
  id: string
  number: string
  version: number
  title: string
  status: ProposalStatus
  attendance_id: string | null
  client_id: string | null
  company_id: string | null
  client_name: string | null
  total_value: number
  valid_until: string | null
  sent_at: string | null
  accepted_at: string | null
  created_at: string
}

export interface ProposalCreate {
  title: string
  description?: string
  attendance_id?: string
  client_id?: string
  company_id?: string
  client_name?: string
  client_email?: string
  client_phone?: string
  client_document?: string
  discount?: number
  payment_terms?: string
  delivery_terms?: string
  notes?: string
  valid_until?: string
  items: ProposalItemCreate[]
  custom_data?: Record<string, unknown>
}

export type ProposalUpdate = Partial<Omit<ProposalCreate, "items">>

export interface ProposalStatusLog {
  id: string
  proposal_id: string
  from_status: ProposalStatus | null
  to_status: ProposalStatus
  changed_by: string | null
  notes: string | null
  changed_at: string
}

// ── Templates ─────────────────────────────────

export interface ProposalTemplateItem {
  id: string
  template_id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  order: number
}

export interface ProposalTemplate {
  id: string
  name: string
  description: string | null
  title: string | null
  body: string | null
  payment_terms: string | null
  delivery_terms: string | null
  notes: string | null
  discount: number
  validity_days: number | null
  is_active: boolean
  items: ProposalTemplateItem[]
  created_at: string
}

export interface ProposalTemplateItemCreate {
  description: string
  quantity: number
  unit?: string
  unit_price: number
  order?: number
}

export interface ProposalTemplateCreate {
  name: string
  description?: string
  title?: string
  body?: string
  payment_terms?: string
  delivery_terms?: string
  notes?: string
  discount?: number
  validity_days?: number
  is_active?: boolean
  items?: ProposalTemplateItemCreate[]
}

export type ProposalTemplateUpdate = Partial<ProposalTemplateCreate>

export interface ProposalFromTemplate {
  template_id: string
  attendance_id?: string
  client_id?: string
  company_id?: string
  client_name?: string
  client_email?: string
  client_phone?: string
  client_document?: string
}

// ── API ───────────────────────────────────────

export const proposalsApi = {
  list: (params?: { skip?: number; limit?: number; status?: ProposalStatus; attendance_id?: string; client_id?: string }) =>
    api.get<ProposalSummary[]>("/propostas-contratos/proposals", { params }).then(r => r.data),
  get: (id: string) =>
    api.get<Proposal>(`/propostas-contratos/proposals/${id}`).then(r => r.data),
  create: (data: ProposalCreate) =>
    api.post<Proposal>("/propostas-contratos/proposals", data).then(r => r.data),
  update: (id: string, data: ProposalUpdate) =>
    api.patch<Proposal>(`/propostas-contratos/proposals/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/propostas-contratos/proposals/${id}`).then(r => r.data),
  changeStatus: (id: string, to_status: ProposalStatus, notes?: string) =>
    api.post<Proposal>(`/propostas-contratos/proposals/${id}/status`, { to_status, notes }).then(r => r.data),
  newVersion: (id: string) =>
    api.post<Proposal>(`/propostas-contratos/proposals/${id}/new-version`).then(r => r.data),
  generatePublicToken: (id: string) =>
    api.post<Proposal>(`/propostas-contratos/proposals/${id}/public-token`).then(r => r.data),
  revokePublicToken: (id: string) =>
    api.delete<Proposal>(`/propostas-contratos/proposals/${id}/public-token`).then(r => r.data),
  statusLogs: (id: string) =>
    api.get<ProposalStatusLog[]>(`/propostas-contratos/proposals/${id}/status-logs`).then(r => r.data),

  // Items
  addItem: (proposalId: string, data: ProposalItemCreate) =>
    api.post<ProposalItem>(`/propostas-contratos/proposals/${proposalId}/items`, data).then(r => r.data),
  updateItem: (proposalId: string, itemId: string, data: ProposalItemUpdate) =>
    api.patch<ProposalItem>(`/propostas-contratos/proposals/${proposalId}/items/${itemId}`, data).then(r => r.data),
  removeItem: (proposalId: string, itemId: string) =>
    api.delete<void>(`/propostas-contratos/proposals/${proposalId}/items/${itemId}`).then(r => r.data),
}

export const proposalTemplatesApi = {
  list: (activeOnly = false) =>
    api.get<ProposalTemplate[]>("/propostas-contratos/templates", { params: { active_only: activeOnly } }).then(r => r.data),
  get: (id: string) =>
    api.get<ProposalTemplate>(`/propostas-contratos/templates/${id}`).then(r => r.data),
  create: (data: ProposalTemplateCreate) =>
    api.post<ProposalTemplate>("/propostas-contratos/templates", data).then(r => r.data),
  update: (id: string, data: ProposalTemplateUpdate) =>
    api.patch<ProposalTemplate>(`/propostas-contratos/templates/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/propostas-contratos/templates/${id}`).then(r => r.data),
  applyTemplate: (data: ProposalFromTemplate) =>
    api.post<Proposal>("/propostas-contratos/proposals/from-template", data).then(r => r.data),
}

// ── Contracts ─────────────────────────────────

export type ContractStatus = "draft" | "ready" | "sent" | "signed" | "cancelled"

export interface ContractTemplate {
  id: string
  name: string
  description: string | null
  body: string
  is_active: boolean
  created_at: string
}

export interface ContractTemplateCreate {
  name: string
  description?: string
  body: string
  is_active?: boolean
}
export type ContractTemplateUpdate = Partial<ContractTemplateCreate>

export interface Contract {
  id: string
  number: string
  title: string
  body: string
  status: ContractStatus
  proposal_id: string | null
  attendance_id: string | null
  client_id: string | null
  company_id: string | null
  client_name: string | null
  client_document: string | null
  client_email: string | null
  client_phone: string | null
  total_value: number
  start_date: string | null
  end_date: string | null
  signed_at: string | null
  signer_name: string | null
  signer_document: string | null
  signer_email: string | null
  signer_ip: string | null
  signature_hash: string | null
  public_token: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ContractSummary {
  id: string
  number: string
  title: string
  status: ContractStatus
  client_name: string | null
  total_value: number
  start_date: string | null
  signed_at: string | null
  created_at: string
}

export interface ContractFromProposal {
  proposal_id: string
  template_id?: string
  title?: string
  start_date?: string
  end_date?: string
}

export interface ContractSign {
  signer_name: string
  signer_document?: string
  signer_email?: string
  accept_terms: boolean
}

export const contractTemplatesApi = {
  list: (activeOnly = false) =>
    api.get<ContractTemplate[]>("/propostas-contratos/contract-templates", { params: { active_only: activeOnly } }).then(r => r.data),
  create: (data: ContractTemplateCreate) =>
    api.post<ContractTemplate>("/propostas-contratos/contract-templates", data).then(r => r.data),
  update: (id: string, data: ContractTemplateUpdate) =>
    api.patch<ContractTemplate>(`/propostas-contratos/contract-templates/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/propostas-contratos/contract-templates/${id}`).then(r => r.data),
}

export const contractsApi = {
  list: (params?: { skip?: number; limit?: number; status?: ContractStatus; proposal_id?: string; client_id?: string }) =>
    api.get<ContractSummary[]>("/propostas-contratos/contracts", { params }).then(r => r.data),
  get: (id: string) =>
    api.get<Contract>(`/propostas-contratos/contracts/${id}`).then(r => r.data),
  fromProposal: (data: ContractFromProposal) =>
    api.post<Contract>("/propostas-contratos/contracts/from-proposal", data).then(r => r.data),
  update: (id: string, data: Partial<Contract>) =>
    api.patch<Contract>(`/propostas-contratos/contracts/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/propostas-contratos/contracts/${id}`).then(r => r.data),
  sign: (id: string, data: ContractSign) =>
    api.post<Contract>(`/propostas-contratos/contracts/${id}/sign`, data).then(r => r.data),
}

// ── Proposals Metrics API ─────────────────────

export interface ProposalMetricsOverview {
  total: number
  acceptance_rate: number
  total_pipeline_value: number
  expiring_7_days: number
  by_status: Record<string, { count: number; value: number }>
}

export const proposalMetricsApi = {
  overview: () =>
    api.get<ProposalMetricsOverview>("/propostas-contratos/metrics/proposals").then(r => r.data),
  exportCSV: (params?: { period_start?: string; period_end?: string; status?: string }) =>
    api.get<Blob>("/propostas-contratos/reports/proposals", {
      params,
      responseType: "blob",
    }).then(r => r.data),
}
