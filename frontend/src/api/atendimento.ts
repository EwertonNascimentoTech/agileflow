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
    api.get<Funnel[]>("/atendimento/config/funnels", { params: { active_only: activeOnly } }).then(r => r.data),
  create: (data: FunnelCreate) =>
    api.post<Funnel>("/atendimento/config/funnels", data).then(r => r.data),
  update: (id: string, data: FunnelUpdate) =>
    api.patch<Funnel>(`/atendimento/config/funnels/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/atendimento/config/funnels/${id}`).then(r => r.data),
}

export const statusConfigApi = {
  list: (funnelId?: string) =>
    api.get<StatusConfig[]>("/atendimento/config/statuses", {
      params: funnelId ? { funnel_id: funnelId } : undefined,
    }).then(r => r.data),
  create: (data: Partial<StatusConfig>) => api.post<StatusConfig>("/atendimento/config/statuses", data).then(r => r.data),
  update: (id: string, data: Partial<StatusConfig>) => api.patch<StatusConfig>(`/atendimento/config/statuses/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/atendimento/config/statuses/${id}`),
  reorder: (items: { id: string; order: number }[]) =>
    api.patch<StatusConfig[]>("/atendimento/config/statuses/reorder", { items }).then(r => r.data),
}

export const transitionsApi = {
  list: () => api.get<KanbanTransition[]>("/atendimento/config/transitions").then(r => r.data),
  create: (data: { from_status_id?: string; to_status_id: string; conditions?: object }) =>
    api.post<KanbanTransition>("/atendimento/config/transitions", data).then(r => r.data),
  delete: (id: string) => api.delete(`/atendimento/config/transitions/${id}`),
}

export const customFieldsApi = {
  list: (entity_type?: FieldEntity) =>
    api.get<CustomField[]>("/atendimento/config/custom-fields", { params: { entity_type } }).then(r => r.data),
  create: (data: object) => api.post<CustomField>("/atendimento/config/custom-fields", data).then(r => r.data),
  update: (id: string, data: object) => api.patch<CustomField>(`/atendimento/config/custom-fields/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/atendimento/config/custom-fields/${id}`),
}

export const channelsApi = {
  list: () => api.get<ChannelConfig[]>("/atendimento/config/channels").then(r => r.data),
  create: (data: object) => api.post<ChannelConfig>("/atendimento/config/channels", data).then(r => r.data),
  update: (id: string, data: object) => api.patch<ChannelConfig>(`/atendimento/config/channels/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/atendimento/config/channels/${id}`),
}

export const assignmentRulesApi = {
  list: () => api.get<AssignmentRule[]>("/atendimento/config/assignment-rules").then(r => r.data),
  create: (data: object) => api.post<AssignmentRule>("/atendimento/config/assignment-rules", data).then(r => r.data),
  update: (id: string, data: object) => api.patch<AssignmentRule>(`/atendimento/config/assignment-rules/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/atendimento/config/assignment-rules/${id}`),
}

// ── Clients API ───────────────────────────────

export const clientsApi = {
  list: (params?: { search?: string; client_type?: ClientType; active_only?: boolean; skip?: number; limit?: number }) =>
    api.get<ClientSummary[]>("/atendimento/clients", { params }).then(r => r.data),
  get: (id: string) => api.get<Client>(`/atendimento/clients/${id}`).then(r => r.data),
  create: (data: object) => api.post<Client>("/atendimento/clients", data).then(r => r.data),
  update: (id: string, data: object) => api.patch<Client>(`/atendimento/clients/${id}`, data).then(r => r.data),
  getAttendances: (id: string) => api.get<AttendanceSummary[]>(`/atendimento/clients/${id}/attendances`).then(r => r.data),
}

// ── Attendances API ───────────────────────────

export const attendancesApi = {
  list: (params?: { status_id?: string; channel?: ChannelType; assigned_to?: string; client_id?: string; skip?: number; limit?: number }) =>
    api.get<AttendanceSummary[]>("/atendimento/attendances", { params }).then(r => r.data),
  get: (id: string) => api.get<Attendance>(`/atendimento/attendances/${id}`).then(r => r.data),
  create: (data: object) => api.post<Attendance>("/atendimento/attendances", data).then(r => r.data),
  update: (id: string, data: object) => api.patch<Attendance>(`/atendimento/attendances/${id}`, data).then(r => r.data),
  changeStatus: (id: string, to_status_id: string, notes?: string) =>
    api.post<Attendance>(`/atendimento/attendances/${id}/status`, { to_status_id, notes }).then(r => r.data),
  assign: (id: string, assigned_to: string | null) =>
    api.post<Attendance>(`/atendimento/attendances/${id}/assign`, { assigned_to }).then(r => r.data),
  getHistory: (id: string) => api.get<StatusLog[]>(`/atendimento/attendances/${id}/history`).then(r => r.data),
  getMessages: (id: string) => api.get<Message[]>(`/atendimento/attendances/${id}/messages`).then(r => r.data),
  sendMessage: (id: string, content: string, message_type = "text") =>
    api.post<Message>(`/atendimento/attendances/${id}/messages`, { content, message_type }).then(r => r.data),
  markRead: (id: string) => api.post(`/atendimento/attendances/${id}/messages/read`),
}

// ── Companies API ─────────────────────────────

export const companiesApi = {
  list: (params?: { search?: string; active_only?: boolean; skip?: number; limit?: number }) =>
    api.get<CompanySummary[]>("/atendimento/companies", { params }).then(r => r.data),
  get: (id: string) => api.get<Company>(`/atendimento/companies/${id}`).then(r => r.data),
  create: (data: CompanyCreate) =>
    api.post<Company>("/atendimento/companies", data).then(r => r.data),
  update: (id: string, data: CompanyUpdate) =>
    api.patch<Company>(`/atendimento/companies/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/atendimento/companies/${id}`).then(r => r.data),
}

// ── Tasks API ─────────────────────────────────

export const tasksApi = {
  list: (params?: { attendance_id?: string; assigned_to?: string; status?: TaskStatus; skip?: number; limit?: number }) =>
    api.get<Task[]>("/atendimento/tasks", { params }).then(r => r.data),
  create: (data: TaskCreate) =>
    api.post<Task>("/atendimento/tasks", data).then(r => r.data),
  update: (id: string, data: TaskUpdate) =>
    api.patch<Task>(`/atendimento/tasks/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/atendimento/tasks/${id}`).then(r => r.data),
}

// ── Timeline API ──────────────────────────────

export const timelineApi = {
  list: (attendanceId: string, params?: { skip?: number; limit?: number }) =>
    api.get<LeadEvent[]>(`/atendimento/attendances/${attendanceId}/timeline`, { params }).then(r => r.data),
  addNote: (attendanceId: string, data: LeadEventCreate) =>
    api.post<LeadEvent>(`/atendimento/attendances/${attendanceId}/timeline`, data).then(r => r.data),
}

// ── Automations API ───────────────────────────

export const automationsApi = {
  list: (params?: { active_only?: boolean; trigger?: AutomationTrigger }) =>
    api.get<AutomationRule[]>("/atendimento/automations", { params }).then(r => r.data),
  get: (id: string) =>
    api.get<AutomationRule>(`/atendimento/automations/${id}`).then(r => r.data),
  create: (data: AutomationRuleCreate) =>
    api.post<AutomationRule>("/atendimento/automations", data).then(r => r.data),
  update: (id: string, data: AutomationRuleUpdate) =>
    api.patch<AutomationRule>(`/atendimento/automations/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/atendimento/automations/${id}`).then(r => r.data),
}

// ── Follow-up Templates API ───────────────────

export const followUpApi = {
  list: (params?: { active_only?: boolean; funnel_id?: string; stage_id?: string }) =>
    api.get<FollowUpTemplate[]>("/atendimento/follow-up-templates", { params }).then(r => r.data),
  get: (id: string) =>
    api.get<FollowUpTemplate>(`/atendimento/follow-up-templates/${id}`).then(r => r.data),
  create: (data: FollowUpTemplateCreate) =>
    api.post<FollowUpTemplate>("/atendimento/follow-up-templates", data).then(r => r.data),
  update: (id: string, data: FollowUpTemplateUpdate) =>
    api.patch<FollowUpTemplate>(`/atendimento/follow-up-templates/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/atendimento/follow-up-templates/${id}`).then(r => r.data),
  preview: (message: string) =>
    api.post<{ preview: string }>("/atendimento/follow-up-templates/preview", { message }).then(r => r.data),
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
    api.get<FunnelMetrics>(`/atendimento/metrics/funnel/${funnelId}`).then(r => r.data),
  overview: () =>
    api.get<AttendanceOverview>("/atendimento/metrics/overview").then(r => r.data),
  exportAttendances: (params?: {
    period_start?: string
    period_end?: string
    status_id?: string
    channel?: string
    assigned_to?: string
  }) =>
    api.get<Blob>("/atendimento/reports/attendances", {
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
    api.get<Tag[]>("/atendimento/tags", { params: entity_type ? { entity_type } : {} }).then(r => r.data),
  create: (data: TagCreate) =>
    api.post<Tag>("/atendimento/tags", data).then(r => r.data),
  update: (id: string, data: Partial<TagCreate>) =>
    api.patch<Tag>(`/atendimento/tags/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/atendimento/tags/${id}`).then(r => r.data),
  addToClient: (clientId: string, tagId: string) =>
    api.post<void>(`/atendimento/clients/${clientId}/tags/${tagId}`).then(r => r.data),
  removeFromClient: (clientId: string, tagId: string) =>
    api.delete<void>(`/atendimento/clients/${clientId}/tags/${tagId}`).then(r => r.data),
  addToAttendance: (attendanceId: string, tagId: string) =>
    api.post<void>(`/atendimento/attendances/${attendanceId}/tags/${tagId}`).then(r => r.data),
  removeFromAttendance: (attendanceId: string, tagId: string) =>
    api.delete<void>(`/atendimento/attendances/${attendanceId}/tags/${tagId}`).then(r => r.data),
}
