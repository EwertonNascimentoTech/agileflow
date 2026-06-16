import api from "./client"

// ── Types ─────────────────────────────────────

export type ChannelType = "whatsapp" | "instagram" | "phone" | "site" | "other"
export type ClientType = "salao" | "delivery" | "evento" | "corporativo" | "recorrente"
export type ClientEntityType = "pf" | "pj"
export type Priority = "low" | "medium" | "high" | "urgent"
export type SenderType = "agent" | "client" | "bot" | "system"
export type MessageType = "text" | "image" | "audio" | "document" | "video"
export type FieldType = "text" | "textarea" | "number" | "date" | "boolean" | "select" | "multi_select"
export type FieldEntity = "client" | "attendance"
export type AssignmentRuleType = "manual" | "round_robin" | "least_busy" | "specific_user"

export type StageOutcome = "neutral" | "won" | "lost"

export interface Funnel {
  id: string
  name: string
  description: string | null
  color: string
  order: number
  is_default: boolean
  is_active: boolean
  stage_count: number
  created_at: string
}

export interface FunnelCreate {
  name: string
  description?: string
  color?: string
  order?: number
  is_default?: boolean
  is_active?: boolean
}

export interface FunnelUpdate {
  name?: string
  description?: string
  color?: string
  order?: number
  is_default?: boolean
  is_active?: boolean
}

export interface StatusConfig {
  id: string
  funnel_id: string
  name: string
  color: string
  icon: string | null
  order: number
  is_initial: boolean
  is_final: boolean
  outcome: StageOutcome
  lead_page_policy: Record<string, string> | null
  probability: number
  created_at: string
}

export interface KanbanTransition {
  id: string
  from_status_id: string | null
  to_status_id: string
  conditions: Record<string, unknown> | null
  created_at: string
}

export interface CustomField {
  id: string
  entity_type: FieldEntity
  name: string
  field_key: string
  field_type: FieldType
  options: string[] | null
  is_required: boolean
  order: number
  is_active: boolean
  created_at: string
}

export interface ChannelConfig {
  id: string
  channel: ChannelType
  name: string
  webhook_url: string | null
  is_active: boolean
  config: Record<string, unknown> | null
  created_at: string
}

export interface AssignmentRule {
  id: string
  name: string
  rule_type: AssignmentRuleType
  conditions: Record<string, unknown> | null
  config: Record<string, unknown> | null
  order: number
  is_active: boolean
  created_at: string
}

export interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
  document: string | null
  client_type: ClientType
  entity_type: ClientEntityType
  company_id: string | null
  notes: string | null
  custom_data: Record<string, unknown> | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ClientSummary {
  id: string
  name: string
  email: string | null
  phone: string | null
  client_type: ClientType
  entity_type: ClientEntityType
  company_id: string | null
  is_active: boolean
  created_at: string
}

// ── Companies ─────────────────────────────────

export interface Company {
  id: string
  name: string
  trade_name: string | null
  document: string | null
  email: string | null
  phone: string | null
  website: string | null
  industry: string | null
  address: Record<string, unknown> | null
  notes: string | null
  custom_data: Record<string, unknown> | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CompanySummary {
  id: string
  name: string
  trade_name: string | null
  document: string | null
  industry: string | null
  is_active: boolean
  contact_count: number
  attendance_count: number
  created_at: string
}

export interface CompanyCreate {
  name: string
  trade_name?: string
  document?: string
  email?: string
  phone?: string
  website?: string
  industry?: string
  address?: Record<string, unknown>
  notes?: string
}

export type CompanyUpdate = Partial<CompanyCreate> & { is_active?: boolean }

// ── Timeline ──────────────────────────────────

export type LeadEventType = "system" | "note" | "automation" | "status_changed" | "assigned" | "message_sent" | "message_received"

export interface LeadEvent {
  id: string
  attendance_id: string
  type: LeadEventType
  content: string
  author_id: string | null
  author_name: string | null
  extra_data: Record<string, unknown> | null
  created_at: string
}

export interface LeadEventCreate {
  content: string
  type?: LeadEventType
  extra_data?: Record<string, unknown>
}

// ── Automations ───────────────────────────────

export type AutomationTrigger = "enter_stage" | "status_won" | "status_lost" | "created"
export type AutomationAction = "create_task" | "send_notification" | "update_priority" | "assign_user"

export interface AutomationRule {
  id: string
  name: string
  description: string | null
  trigger: AutomationTrigger
  funnel_id: string | null
  stage_id: string | null
  action: AutomationAction
  action_config: Record<string, unknown> | null
  order: number
  is_active: boolean
  created_at: string
}

export interface AutomationRuleCreate {
  name: string
  description?: string
  trigger: AutomationTrigger
  funnel_id?: string | null
  stage_id?: string | null
  action: AutomationAction
  action_config?: Record<string, unknown>
  order?: number
  is_active?: boolean
}

export type AutomationRuleUpdate = Partial<AutomationRuleCreate>

// ── Follow-up Templates ───────────────────────

export type FollowUpChannel = "auto" | "whatsapp" | "instagram" | "phone" | "internal"

export interface FollowUpTemplate {
  id: string
  name: string
  funnel_id: string | null
  stage_id: string | null
  channel: FollowUpChannel
  message: string
  delay_minutes: number
  is_active: boolean
  created_at: string
}

export interface FollowUpTemplateCreate {
  name: string
  funnel_id?: string | null
  stage_id?: string | null
  channel?: FollowUpChannel
  message: string
  delay_minutes?: number
  is_active?: boolean
}

export type FollowUpTemplateUpdate = Partial<FollowUpTemplateCreate>

// ── Tasks ─────────────────────────────────────

export type TaskStatus = "pending" | "done" | "cancelled"
export type TaskPriority = "low" | "medium" | "high"

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  attendance_id: string | null
  assigned_to: string | null
  created_by: string | null
  completed_at: string | null
  completed_by: string | null
  source: string  // "manual" | "playbook" | "automation"
  created_at: string
  updated_at: string
}

export interface TaskCreate {
  title: string
  description?: string
  priority?: TaskPriority
  due_date?: string
  attendance_id?: string
  assigned_to?: string
}

export interface TaskUpdate {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  due_date?: string | null
  assigned_to?: string | null
}

export interface Attendance {
  id: string
  protocol: string
  client_id: string
  company_id: string | null
  channel: ChannelType
  channel_config_id: string | null
  status_id: string
  assigned_to: string | null
  subject: string
  priority: Priority
  value: number | null
  expected_close_date: string | null
  last_interaction: string | null
  custom_data: Record<string, unknown> | null
  quote_id: string | null
  sale_id: string | null
  opened_at: string
  closed_at: string | null
  close_reason: string | null
  closed_by: string | null
  outcome: "open" | "won" | "lost"
  created_at: string
  tags?: Tag[]
}

export interface AttendanceSummary {
  id: string
  protocol: string
  client_id: string
  company_id: string | null
  channel: ChannelType
  status_id: string
  assigned_to: string | null
  subject: string
  priority: Priority
  value: number | null
  expected_close_date: string | null
  last_interaction: string | null
  opened_at: string
  closed_at: string | null
  outcome?: "open" | "won" | "lost"
}

export interface StatusLog {
  id: string
  from_status_id: string | null
  to_status_id: string
  changed_by: string | null
  notes: string | null
  changed_at: string
}

export interface Message {
  id: string
  attendance_id: string
  sender_type: SenderType
  sender_id: string | null
  content: string
  message_type: MessageType
  media_url: string | null
  external_id: string | null
  is_read: boolean
  sent_at: string
}

// ── Config API ────────────────────────────────

export const funnelsApi = {
  list: (activeOnly = false) =>
    api.get<Funnel[]>("/crm/config/funnels", { params: { active_only: activeOnly } }).then(r => r.data),
  create: (data: FunnelCreate) =>
    api.post<Funnel>("/crm/config/funnels", data).then(r => r.data),
  update: (id: string, data: FunnelUpdate) =>
    api.patch<Funnel>(`/crm/config/funnels/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/crm/config/funnels/${id}`).then(r => r.data),
}

export const statusConfigApi = {
  list: (funnelId?: string) =>
    api.get<StatusConfig[]>("/crm/config/statuses", {
      params: funnelId ? { funnel_id: funnelId } : undefined,
    }).then(r => r.data),
  create: (data: Partial<StatusConfig>) => api.post<StatusConfig>("/crm/config/statuses", data).then(r => r.data),
  update: (id: string, data: Partial<StatusConfig>) => api.patch<StatusConfig>(`/crm/config/statuses/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/crm/config/statuses/${id}`),
  reorder: (items: { id: string; order: number }[]) =>
    api.patch<StatusConfig[]>("/crm/config/statuses/reorder", { items }).then(r => r.data),
}

export const transitionsApi = {
  list: () => api.get<KanbanTransition[]>("/crm/config/transitions").then(r => r.data),
  create: (data: { from_status_id?: string; to_status_id: string; conditions?: object }) =>
    api.post<KanbanTransition>("/crm/config/transitions", data).then(r => r.data),
  delete: (id: string) => api.delete(`/crm/config/transitions/${id}`),
}

export const customFieldsApi = {
  list: (entity_type?: FieldEntity) =>
    api.get<CustomField[]>("/crm/config/custom-fields", { params: { entity_type } }).then(r => r.data),
  create: (data: object) => api.post<CustomField>("/crm/config/custom-fields", data).then(r => r.data),
  update: (id: string, data: object) => api.patch<CustomField>(`/crm/config/custom-fields/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/crm/config/custom-fields/${id}`),
}

export const channelsApi = {
  list: () => api.get<ChannelConfig[]>("/crm/config/channels").then(r => r.data),
  create: (data: object) => api.post<ChannelConfig>("/crm/config/channels", data).then(r => r.data),
  update: (id: string, data: object) => api.patch<ChannelConfig>(`/crm/config/channels/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/crm/config/channels/${id}`),
}

export const assignmentRulesApi = {
  list: () => api.get<AssignmentRule[]>("/crm/config/assignment-rules").then(r => r.data),
  create: (data: object) => api.post<AssignmentRule>("/crm/config/assignment-rules", data).then(r => r.data),
  update: (id: string, data: object) => api.patch<AssignmentRule>(`/crm/config/assignment-rules/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/crm/config/assignment-rules/${id}`),
}

// ── Clients API ───────────────────────────────

export const clientsApi = {
  list: (params?: { search?: string; client_type?: ClientType; active_only?: boolean; skip?: number; limit?: number }) =>
    api.get<ClientSummary[]>("/crm/clients", { params }).then(r => r.data),
  get: (id: string) => api.get<Client>(`/crm/clients/${id}`).then(r => r.data),
  create: (data: object) => api.post<Client>("/crm/clients", data).then(r => r.data),
  update: (id: string, data: object) => api.patch<Client>(`/crm/clients/${id}`, data).then(r => r.data),
  getAttendances: (id: string) => api.get<AttendanceSummary[]>(`/crm/clients/${id}/attendances`).then(r => r.data),
}

// ── Attendances API ───────────────────────────

export const attendancesApi = {
  list: (params?: { status_id?: string; channel?: ChannelType; assigned_to?: string; client_id?: string; skip?: number; limit?: number }) =>
    api.get<AttendanceSummary[]>("/crm/attendances", { params }).then(r => r.data),
  get: (id: string) => api.get<Attendance>(`/crm/attendances/${id}`).then(r => r.data),
  create: (data: object) => api.post<Attendance>("/crm/attendances", data).then(r => r.data),
  update: (id: string, data: object) => api.patch<Attendance>(`/crm/attendances/${id}`, data).then(r => r.data),
  changeStatus: (id: string, to_status_id: string, notes?: string) =>
    api.post<Attendance>(`/crm/attendances/${id}/status`, { to_status_id, notes }).then(r => r.data),
  assign: (id: string, assigned_to: string | null) =>
    api.post<Attendance>(`/crm/attendances/${id}/assign`, { assigned_to }).then(r => r.data),
  close: (id: string, data: { outcome: "won" | "lost"; close_reason?: string }) =>
    api.post<Attendance>(`/crm/attendances/${id}/close`, data).then(r => r.data),
  getHistory: (id: string) => api.get<StatusLog[]>(`/crm/attendances/${id}/history`).then(r => r.data),
  getMessages: (id: string) => api.get<Message[]>(`/crm/attendances/${id}/messages`).then(r => r.data),
  sendMessage: (id: string, content: string, message_type = "text") =>
    api.post<Message>(`/crm/attendances/${id}/messages`, { content, message_type }).then(r => r.data),
  markRead: (id: string) => api.post(`/crm/attendances/${id}/messages/read`),
}

// ── Companies API ─────────────────────────────

export const companiesApi = {
  list: (params?: { search?: string; active_only?: boolean; skip?: number; limit?: number }) =>
    api.get<CompanySummary[]>("/crm/companies", { params }).then(r => r.data),
  get: (id: string) => api.get<Company>(`/crm/companies/${id}`).then(r => r.data),
  create: (data: CompanyCreate) =>
    api.post<Company>("/crm/companies", data).then(r => r.data),
  update: (id: string, data: CompanyUpdate) =>
    api.patch<Company>(`/crm/companies/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/crm/companies/${id}`).then(r => r.data),
}

// ── Tasks API ─────────────────────────────────

export const tasksApi = {
  list: (params?: { attendance_id?: string; assigned_to?: string; status?: TaskStatus; skip?: number; limit?: number }) =>
    api.get<Task[]>("/crm/tasks", { params }).then(r => r.data),
  create: (data: TaskCreate) =>
    api.post<Task>("/crm/tasks", data).then(r => r.data),
  update: (id: string, data: TaskUpdate) =>
    api.patch<Task>(`/crm/tasks/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/crm/tasks/${id}`).then(r => r.data),
}

// ── Timeline API ──────────────────────────────

export const timelineApi = {
  list: (attendanceId: string, params?: { skip?: number; limit?: number }) =>
    api.get<LeadEvent[]>(`/crm/attendances/${attendanceId}/timeline`, { params }).then(r => r.data),
  addNote: (attendanceId: string, data: LeadEventCreate) =>
    api.post<LeadEvent>(`/crm/attendances/${attendanceId}/timeline`, data).then(r => r.data),
}

// ── Automations API ───────────────────────────

export const automationsApi = {
  list: (params?: { active_only?: boolean; trigger?: AutomationTrigger }) =>
    api.get<AutomationRule[]>("/crm/automations", { params }).then(r => r.data),
  get: (id: string) =>
    api.get<AutomationRule>(`/crm/automations/${id}`).then(r => r.data),
  create: (data: AutomationRuleCreate) =>
    api.post<AutomationRule>("/crm/automations", data).then(r => r.data),
  update: (id: string, data: AutomationRuleUpdate) =>
    api.patch<AutomationRule>(`/crm/automations/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/crm/automations/${id}`).then(r => r.data),
}

// ── Follow-up Templates API ───────────────────

export const followUpApi = {
  list: (params?: { active_only?: boolean; funnel_id?: string; stage_id?: string }) =>
    api.get<FollowUpTemplate[]>("/crm/follow-up-templates", { params }).then(r => r.data),
  get: (id: string) =>
    api.get<FollowUpTemplate>(`/crm/follow-up-templates/${id}`).then(r => r.data),
  create: (data: FollowUpTemplateCreate) =>
    api.post<FollowUpTemplate>("/crm/follow-up-templates", data).then(r => r.data),
  update: (id: string, data: FollowUpTemplateUpdate) =>
    api.patch<FollowUpTemplate>(`/crm/follow-up-templates/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/crm/follow-up-templates/${id}`).then(r => r.data),
  preview: (message: string) =>
    api.post<{ preview: string }>("/crm/follow-up-templates/preview", { message }).then(r => r.data),
}

// ── Metrics API ───────────────────────────────

export interface FunnelStageMetric {
  id: string
  name: string
  color: string
  order: number
  outcome: string | null
  count: number
  total_value: number
}

export interface TopOpportunity {
  id: string
  protocol: string
  client_name: string | null
  value: number
  stage_name: string | null
}

export interface FunnelMetrics {
  stages: FunnelStageMetric[]
  top_opportunities: TopOpportunity[]
}

export interface AttendanceOverview {
  total: number
  last_30_days: number
  by_channel: Record<string, number>
}

export const metricsApi = {
  funnelMetrics: (funnelId: string) =>
    api.get<FunnelMetrics>(`/crm/metrics/funnel/${funnelId}`).then(r => r.data),
  overview: () =>
    api.get<AttendanceOverview>("/crm/metrics/overview").then(r => r.data),
  exportAttendances: (params?: {
    period_start?: string
    period_end?: string
    status_id?: string
    channel?: string
    assigned_to?: string
  }) =>
    api.get<Blob>("/crm/reports/attendances", {
      params,
      responseType: "blob",
    }).then(r => r.data),
}

// ── Tags API ──────────────────────────────────

export interface Tag {
  id: string
  name: string
  color: string
  entity_type: "client" | "attendance"
  slug?: string | null
  created_at: string
}

export interface TagCreate {
  name: string
  color: string
  entity_type: "client" | "attendance"
  slug?: string
}

export const tagsApi = {
  list: (entity_type?: "client" | "attendance") =>
    api.get<Tag[]>("/crm/tags", { params: entity_type ? { entity_type } : {} }).then(r => r.data),
  create: (data: TagCreate) =>
    api.post<Tag>("/crm/tags", data).then(r => r.data),
  update: (id: string, data: Partial<TagCreate>) =>
    api.patch<Tag>(`/crm/tags/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/crm/tags/${id}`).then(r => r.data),
  addToClient: (clientId: string, tagId: string) =>
    api.post<void>(`/crm/clients/${clientId}/tags/${tagId}`).then(r => r.data),
  removeFromClient: (clientId: string, tagId: string) =>
    api.delete<void>(`/crm/clients/${clientId}/tags/${tagId}`).then(r => r.data),
  addToAttendance: (attendanceId: string, tagId: string) =>
    api.post<void>(`/crm/attendances/${attendanceId}/tags/${tagId}`).then(r => r.data),
  removeFromAttendance: (attendanceId: string, tagId: string) =>
    api.delete<void>(`/crm/attendances/${attendanceId}/tags/${tagId}`).then(r => r.data),
}

// ── K-006 Forecast ────────────────────────────

export interface ForecastStageItem {
  stage_id: string
  stage_name: string
  color: string
  probability: number
  count: number
  total_value: number
  weighted_value: number
}

export interface ForecastUserItem {
  user_id: string | null
  forecast: number
  target: number
  delta_pct: number | null
}

export interface ForecastData {
  period: string
  funnel_id: string | null
  total_forecast: number
  total_target: number
  delta_pct: number | null
  by_stage: ForecastStageItem[]
  by_user: ForecastUserItem[]
}

export const forecastApi = {
  get: (params: { period: string; funnel_id?: string }) =>
    api.get<ForecastData>("/crm/reports/forecast", { params }).then(r => r.data),
  upsertTarget: (data: { user_id?: string; funnel_id?: string; period: string; target_value: number }) =>
    api.post("/crm/reports/targets", data).then(r => r.data),
}

// ── K-003 Stage Required Fields ───────────────

export interface StageRequiredField {
  id: string
  status_id: string
  field_name: string
  field_label: string
  field_type: string
  created_at: string
}

export const stageRequiredFieldsApi = {
  list: (statusId: string) =>
    api.get<StageRequiredField[]>(`/crm/config/statuses/${statusId}/required-fields`).then(r => r.data),
  create: (statusId: string, data: { field_name: string; field_label: string; field_type?: string }) =>
    api.post<StageRequiredField>(`/crm/config/statuses/${statusId}/required-fields`, data).then(r => r.data),
  delete: (statusId: string, fieldId: string) =>
    api.delete<void>(`/crm/config/statuses/${statusId}/required-fields/${fieldId}`).then(r => r.data),
}

// ── K-013 Playbook ────────────────────────────

export interface PlaybookStep {
  id: string
  status_id: string
  title: string
  description: string | null
  due_days: number
  order: number
  created_at: string
}

export const playbookApi = {
  list: (statusId: string) =>
    api.get<PlaybookStep[]>(`/crm/config/statuses/${statusId}/playbook`).then(r => r.data),
  create: (statusId: string, data: { title: string; description?: string; due_days?: number; order?: number }) =>
    api.post<PlaybookStep>(`/crm/config/statuses/${statusId}/playbook`, data).then(r => r.data),
  update: (statusId: string, stepId: string, data: Partial<{ title: string; description: string; due_days: number; order: number }>) =>
    api.patch<PlaybookStep>(`/crm/config/statuses/${statusId}/playbook/${stepId}`, data).then(r => r.data),
  delete: (statusId: string, stepId: string) =>
    api.delete<void>(`/crm/config/statuses/${statusId}/playbook/${stepId}`).then(r => r.data),
}

// ── K-019 Conversion Funnel ───────────────────

export interface ConversionStageItem {
  stage_id: string
  stage_name: string
  color: string
  order: number
  entries: number
  exits_forward: number
  losses: number
  conversion_rate: number
  avg_days: number
}

export interface LossReasonItem {
  reason: string
  count: number
}

export interface ConversionFunnelData {
  funnel_id: string | null
  period_start: string
  period_end: string
  stages: ConversionStageItem[]
  loss_reasons: LossReasonItem[]
}

export const conversionApi = {
  getFunnelConversion: (params: { period_start: string; period_end: string; funnel_id?: string }) =>
    api.get<ConversionFunnelData>("/crm/reports/funnel-conversion", { params }).then(r => r.data),
}

// ── K-018 Productivity ────────────────────────

export interface ProductivityUserItem {
  user_id: string | null
  attendances_opened: number
  attendances_won: number
  attendances_lost: number
  tasks_done: number
  messages_sent: number
  conversion_rate: number
  attendances_opened_delta: number | null
  attendances_won_delta: number | null
  tasks_done_delta: number | null
}

export interface ProductivityData {
  period_start: string
  period_end: string
  users: ProductivityUserItem[]
}

export const productivityApi = {
  get: (params: { period_start: string; period_end: string }) =>
    api.get<ProductivityData>("/crm/reports/productivity", { params }).then(r => r.data),
  exportCsvUrl: (params: { period_start: string; period_end: string }) => {
    const q = new URLSearchParams(params).toString()
    return `/api/v1/crm/reports/productivity/export?${q}`
  },
}

// ── K-016 Reactivation ────────────────────────

export interface ReactivationConfig {
  id: string
  funnel_id: string | null
  loss_reason: string | null
  delay_days: number
  is_active: boolean
  created_at: string
}

export const reactivationApi = {
  list: () =>
    api.get<ReactivationConfig[]>("/crm/config/reactivation").then(r => r.data),
  create: (data: { funnel_id?: string; loss_reason?: string; delay_days: number; is_active: boolean }) =>
    api.post<ReactivationConfig>("/crm/config/reactivation", data).then(r => r.data),
  update: (id: string, data: { is_active?: boolean; delay_days?: number; loss_reason?: string }) =>
    api.patch<ReactivationConfig>(`/crm/config/reactivation/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/crm/config/reactivation/${id}`),
}

// ── K-020 Revenue ─────────────────────────────

export interface RevenueUserItem {
  user_id: string | null
  attendances_won: number
  total_revenue: number
  avg_ticket: number
}

export interface RevenueMonthItem {
  month: string
  revenue: number
  won_count: number
}

export interface RevenueReport {
  period_start: string
  period_end: string
  total_revenue: number
  avg_ticket: number
  total_won: number
  target_value: number
  delta_vs_target: number | null
  by_user: RevenueUserItem[]
  monthly_evolution: RevenueMonthItem[]
}

export const revenueApi = {
  get: (params: { period_start: string; period_end: string; funnel_id?: string }) =>
    api.get<RevenueReport>("/crm/reports/revenue", { params }).then(r => r.data),
  exportCsvUrl: (params: { period_start: string; period_end: string }) => {
    const q = new URLSearchParams(params).toString()
    return `/api/v1/crm/reports/revenue/export?${q}`
  },
}

// ── Types (Proposals) ─────────────────────────────────────

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
    api.get<ProposalSummary[]>("/crm/proposals", { params }).then(r => r.data),
  get: (id: string) =>
    api.get<Proposal>(`/crm/proposals/${id}`).then(r => r.data),
  create: (data: ProposalCreate) =>
    api.post<Proposal>("/crm/proposals", data).then(r => r.data),
  update: (id: string, data: ProposalUpdate) =>
    api.patch<Proposal>(`/crm/proposals/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/crm/proposals/${id}`).then(r => r.data),
  changeStatus: (id: string, to_status: ProposalStatus, notes?: string) =>
    api.post<Proposal>(`/crm/proposals/${id}/status`, { to_status, notes }).then(r => r.data),
  newVersion: (id: string) =>
    api.post<Proposal>(`/crm/proposals/${id}/new-version`).then(r => r.data),
  generatePublicToken: (id: string) =>
    api.post<Proposal>(`/crm/proposals/${id}/public-token`).then(r => r.data),
  revokePublicToken: (id: string) =>
    api.delete<Proposal>(`/crm/proposals/${id}/public-token`).then(r => r.data),
  statusLogs: (id: string) =>
    api.get<ProposalStatusLog[]>(`/crm/proposals/${id}/status-logs`).then(r => r.data),

  // Items
  addItem: (proposalId: string, data: ProposalItemCreate) =>
    api.post<ProposalItem>(`/crm/proposals/${proposalId}/items`, data).then(r => r.data),
  updateItem: (proposalId: string, itemId: string, data: ProposalItemUpdate) =>
    api.patch<ProposalItem>(`/crm/proposals/${proposalId}/items/${itemId}`, data).then(r => r.data),
  removeItem: (proposalId: string, itemId: string) =>
    api.delete<void>(`/crm/proposals/${proposalId}/items/${itemId}`).then(r => r.data),
}

export const proposalTemplatesApi = {
  list: (activeOnly = false) =>
    api.get<ProposalTemplate[]>("/crm/templates", { params: { active_only: activeOnly } }).then(r => r.data),
  get: (id: string) =>
    api.get<ProposalTemplate>(`/crm/templates/${id}`).then(r => r.data),
  create: (data: ProposalTemplateCreate) =>
    api.post<ProposalTemplate>("/crm/templates", data).then(r => r.data),
  update: (id: string, data: ProposalTemplateUpdate) =>
    api.patch<ProposalTemplate>(`/crm/templates/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/crm/templates/${id}`).then(r => r.data),
  applyTemplate: (data: ProposalFromTemplate) =>
    api.post<Proposal>("/crm/proposals/from-template", data).then(r => r.data),
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
    api.get<ContractTemplate[]>("/crm/contract-templates", { params: { active_only: activeOnly } }).then(r => r.data),
  create: (data: ContractTemplateCreate) =>
    api.post<ContractTemplate>("/crm/contract-templates", data).then(r => r.data),
  update: (id: string, data: ContractTemplateUpdate) =>
    api.patch<ContractTemplate>(`/crm/contract-templates/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/crm/contract-templates/${id}`).then(r => r.data),
}

export const contractsApi = {
  list: (params?: { skip?: number; limit?: number; status?: ContractStatus; proposal_id?: string; client_id?: string }) =>
    api.get<ContractSummary[]>("/crm/contracts", { params }).then(r => r.data),
  get: (id: string) =>
    api.get<Contract>(`/crm/contracts/${id}`).then(r => r.data),
  fromProposal: (data: ContractFromProposal) =>
    api.post<Contract>("/crm/contracts/from-proposal", data).then(r => r.data),
  update: (id: string, data: Partial<Contract>) =>
    api.patch<Contract>(`/crm/contracts/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/crm/contracts/${id}`).then(r => r.data),
  sign: (id: string, data: ContractSign) =>
    api.post<Contract>(`/crm/contracts/${id}/sign`, data).then(r => r.data),
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
    api.get<ProposalMetricsOverview>("/crm/metrics/proposals").then(r => r.data),
  exportCSV: (params?: { period_start?: string; period_end?: string; status?: string }) =>
    api.get<Blob>("/crm/reports/proposals", {
      params,
      responseType: "blob",
    }).then(r => r.data),
}

// CRM — Company Admin
// ============================================================

import type {
  User as _User, Role, RoleCreate, RoleUpdate, ModulePermission,
} from "@/types"

export type User = _User

export type ModuleSlug = string

export interface ActiveModule {
  slug: string
  name: string
  description: string | null
  icon: string | null
  color: string
}

export interface MyTenant {
  id: string
  name: string
  slug: string
  is_active: boolean
  plan_expires_at: string | null
  active_modules: ActiveModule[]
}

export interface UserCreatePayload {
  full_name: string
  email: string
  password: string
  role?: "company_admin" | "company_user"
  role_id?: string | null
}

export interface UserUpdatePayload {
  full_name?: string
  is_active?: boolean
  role?: "company_admin" | "company_user"
  role_id?: string | null
}

export interface Branding {
  name: string
  logo_url: string | null
  primary_color: string | null
}

export const companyApi = {
  getMyTenant: () =>
    api.get<MyTenant>("/company/admin/me/tenant").then(r => r.data),

  getBranding: () =>
    api.get<Branding>("/company/admin/branding").then(r => r.data),

  listUsers: (params?: { search?: string; active_only?: boolean }) =>
    api.get<User[]>("/company/admin/users", { params }).then(r => r.data),

  createUser: (data: UserCreatePayload) =>
    api.post<User>("/company/admin/users", data).then(r => r.data),

  updateUser: (id: string, data: UserUpdatePayload) =>
    api.patch<User>(`/company/admin/users/${id}`, data).then(r => r.data),

  // ── Permissions / Roles ─────────────────────
  listPermissions: () =>
    api.get<ModulePermission[]>("/company/admin/permissions").then(r => r.data),

  listRoles: () =>
    api.get<Role[]>("/company/admin/roles").then(r => r.data),

  getRole: (id: string) =>
    api.get<Role>(`/company/admin/roles/${id}`).then(r => r.data),

  createRole: (data: RoleCreate) =>
    api.post<Role>("/company/admin/roles", data).then(r => r.data),

  updateRole: (id: string, data: RoleUpdate) =>
    api.patch<Role>(`/company/admin/roles/${id}`, data).then(r => r.data),

  deleteRole: (id: string) =>
    api.delete<void>(`/company/admin/roles/${id}`).then(r => r.data),
}

// ── Notifications API ─────────────────────────

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  created_at: string
}

export const notificationsApi = {
  list: (params?: { limit?: number; unread_only?: boolean }) =>
    api.get<Notification[]>("/company/admin/notifications", { params }).then(r => r.data),
  unreadCount: () =>
    api.get<{ count: number }>("/company/admin/notifications/unread-count").then(r => r.data),
  markRead: (id: string) =>
    api.post<void>(`/company/admin/notifications/${id}/read`).then(r => r.data),
  markAllRead: () =>
    api.post<void>("/company/admin/notifications/read-all").then(r => r.data),
}
