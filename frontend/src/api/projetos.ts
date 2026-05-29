import api from "./client"

export interface Project {
  id: string
  name: string
  description: string | null
  owner_id: string | null
  start_date: string | null
  due_date: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProjectStatus {
  id: string
  project_id: string
  funnel_id: string
  name: string
  color: string
  order: number
  is_initial: boolean
  is_final: boolean
  is_active: boolean
  creates_demand_type_id: string | null
  moves_to_funnel_id: string | null
  updates_origin_status_id: string | null
  move_in_role_ids: string[] | null
  sla_hours: number | null
  sla_warning_pct: number
  created_at: string
  updated_at: string
}

export interface ProjectFunnel {
  id: string
  project_id: string
  name: string
  description: string | null
  color: string
  order: number
  is_default: boolean
  is_active: boolean
  allowed_demand_type_ids: string[] | null
  created_at: string
  updated_at: string
}

export interface ProjectTask {
  id: string
  project_id: string
  status_id: string
  demand_type_id: string | null
  parent_task_id: string | null
  origin_task_id: string | null
  title: string
  description: string | null
  assigned_to: string | null
  diretoria: string | null
  area: string | null
  start_date: string | null
  due_date: string | null
  order: number
  created_by: string | null
  completed_at: string | null
  status_entered_at: string | null
  sla_state: "none" | "ok" | "warning" | "breached"
  created_at: string
  updated_at: string
}

export interface ProjectRefMini {
  id: string
  name: string
}

export interface ProjectStatusMini {
  id: string
  name: string
  color: string
  order: number
}

export interface ProjectDemandTypeMini {
  id: string
  name: string
}

export interface ProjectTaskWithContext extends ProjectTask {
  project: ProjectRefMini
  status: ProjectStatusMini
  demand_type: ProjectDemandTypeMini | null
}

export interface ProjectTaskComment {
  id: string
  task_id: string
  author_id: string | null
  content: string
  created_at: string
}

export interface ProjectDemandTypeFunnelRef {
  id: string
  project_id: string
  name: string
}

export interface ProjectDemandType {
  id: string
  slug: string
  name: string
  description: string | null
  funnel_id: string | null
  funnel: ProjectDemandTypeFunnelRef | null
  allowed_child_type_ids: string[] | null
  available_for_basic: boolean
  show_in_schedule: boolean
  order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProjectDemandFormSection {
  id: string
  demand_type_id: string
  key: string
  title: string
  description: string | null
  order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProjectDemandFormField {
  id: string
  section_id: string
  field_key: string
  label: string
  field_type: string
  placeholder: string | null
  options: Record<string, unknown> | null
  validation: Record<string, unknown> | null
  is_required: boolean
  is_active: boolean
  order: number
  created_at: string
  updated_at: string
}

export interface ProjectStatusSectionLink {
  id: string
  status_id: string
  section_id: string
  mode: "visible" | "editable" | "required" | "hidden"
  created_at: string
}

export interface ProjectStatusDefaultFormLink {
  id: string
  status_id: string
  field_key: DefaultFormFieldKey
  mode: "visible" | "editable" | "required" | "hidden"
  created_at: string
}

export interface ProjectDemandFormSubmission {
  id: string
  task_id: string
  values: Record<string, unknown>
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type ProjectAutomationAction = "assign_user" | "create_subtask" | "notify" | "add_comment"

export interface ProjectAutomationRule {
  id: string
  project_id: string
  status_id: string
  name: string
  trigger: string
  action: ProjectAutomationAction
  action_config: Record<string, unknown> | null
  order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type DefaultFormFieldKey =
  | "title"
  | "description"
  | "assigned_to"
  | "diretoria"
  | "area"
  | "start_date"
  | "due_date"

export interface ProjectDefaultFormField {
  id: string
  field_key: DefaultFormFieldKey
  label: string
  field_type: string
  options: { items?: Array<{ value: string; label: string; color?: string }> } | null
  is_visible: boolean
  is_required: boolean
  order: number
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface ProjectScheduleBinding {
  id: string
  funnel_id: string
  status_id: string
  require_fill: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProjectScheduleBindingInput {
  funnel_id: string
  status_id: string
  require_fill: boolean
  is_active: boolean
}

export interface ProjectReports {
  total_active: number
  total_completed: number
  by_stage: Array<{
    funnel_id: string | null
    funnel_name: string
    status_id: string | null
    status_name: string
    status_color: string
    count: number
  }>
  by_assignee: Array<{ user_id: string | null; active: number; overdue: number }>
  by_type: Array<{ type_id: string | null; type_name: string; count: number }>
  sla: { ok: number; warning: number; breached: number; none: number; overdue: number }
  throughput: {
    by_month: Array<{ month: string; count: number }>
    completed_total: number
    avg_lead_time_days: number | null
  }
}

export const projetosApi = {
  listProjects: (activeOnly = false) =>
    api.get<Project[]>("/projetos/projects", { params: { active_only: activeOnly } }).then((r) => r.data),
  getProject: (projectId: string) =>
    api.get<Project>(`/projetos/projects/${projectId}`).then((r) => r.data),
  createProject: (data: {
    name: string
    description?: string
    owner_id?: string | null
    start_date?: string | null
    due_date?: string | null
  }) => api.post<Project>("/projetos/projects", data).then((r) => r.data),
  updateProject: (projectId: string, data: Partial<{
    name: string
    description: string | null
    owner_id: string | null
    start_date: string | null
    due_date: string | null
    is_active: boolean
  }>) => api.patch<Project>(`/projetos/projects/${projectId}`, data).then((r) => r.data),
  deleteProject: (projectId: string) =>
    api.delete<void>(`/projetos/projects/${projectId}`).then((r) => r.data),

  listDemandTypes: (activeOnly = false) =>
    api.get<ProjectDemandType[]>("/projetos/config/demand-types", { params: { active_only: activeOnly } }).then((r) => r.data),
  createDemandType: (data: {
    slug: string
    name: string
    description?: string
    funnel_id?: string | null
    allowed_child_type_ids?: string[] | null
    available_for_basic?: boolean
    show_in_schedule?: boolean
    order?: number
    is_active?: boolean
  }) => api.post<ProjectDemandType>("/projetos/config/demand-types", data).then((r) => r.data),
  updateDemandType: (demandTypeId: string, data: Partial<{
    slug: string
    name: string
    description: string | null
    funnel_id: string | null
    allowed_child_type_ids: string[] | null
    available_for_basic: boolean
    show_in_schedule: boolean
    order: number
    is_active: boolean
  }>) => api.patch<ProjectDemandType>(`/projetos/config/demand-types/${demandTypeId}`, data).then((r) => r.data),
  reorderDemandTypes: (items: Array<{ id: string; order: number }>) =>
    api.patch<ProjectDemandType[]>("/projetos/config/demand-types/reorder", { items }).then((r) => r.data),
  deleteDemandType: (demandTypeId: string) =>
    api.delete<void>(`/projetos/config/demand-types/${demandTypeId}`).then((r) => r.data),

  listDemandSections: (demandTypeId: string, activeOnly = false) =>
    api.get<ProjectDemandFormSection[]>(`/projetos/config/demand-types/${demandTypeId}/sections`, { params: { active_only: activeOnly } }).then((r) => r.data),
  createDemandSection: (demandTypeId: string, data: {
    key: string
    title: string
    description?: string
    order?: number
    is_active?: boolean
  }) => api.post<ProjectDemandFormSection>(`/projetos/config/demand-types/${demandTypeId}/sections`, data).then((r) => r.data),
  updateDemandSection: (demandTypeId: string, sectionId: string, data: Partial<{
    key: string
    title: string
    description: string | null
    order: number
    is_active: boolean
  }>) => api.patch<ProjectDemandFormSection>(`/projetos/config/demand-types/${demandTypeId}/sections/${sectionId}`, data).then((r) => r.data),
  reorderDemandSections: (demandTypeId: string, items: Array<{ id: string; order: number }>) =>
    api.patch<ProjectDemandFormSection[]>(`/projetos/config/demand-types/${demandTypeId}/sections/reorder`, { items }).then((r) => r.data),
  deleteDemandSection: (demandTypeId: string, sectionId: string) =>
    api.delete<void>(`/projetos/config/demand-types/${demandTypeId}/sections/${sectionId}`).then((r) => r.data),

  listDemandFields: (demandTypeId: string, sectionId: string, activeOnly = false) =>
    api.get<ProjectDemandFormField[]>(`/projetos/config/demand-types/${demandTypeId}/sections/${sectionId}/fields`, { params: { active_only: activeOnly } }).then((r) => r.data),
  createDemandField: (demandTypeId: string, sectionId: string, data: {
    field_key: string
    label: string
    field_type?: string
    placeholder?: string | null
    options?: Record<string, unknown> | null
    validation?: Record<string, unknown> | null
    is_required?: boolean
    is_active?: boolean
    order?: number
  }) => api.post<ProjectDemandFormField>(`/projetos/config/demand-types/${demandTypeId}/sections/${sectionId}/fields`, data).then((r) => r.data),
  updateDemandField: (demandTypeId: string, sectionId: string, fieldId: string, data: Partial<{
    field_key: string
    label: string
    field_type: string
    placeholder: string | null
    options: Record<string, unknown> | null
    validation: Record<string, unknown> | null
    is_required: boolean
    is_active: boolean
    order: number
  }>) => api.patch<ProjectDemandFormField>(`/projetos/config/demand-types/${demandTypeId}/sections/${sectionId}/fields/${fieldId}`, data).then((r) => r.data),
  reorderDemandFields: (demandTypeId: string, sectionId: string, items: Array<{ id: string; order: number }>) =>
    api.patch<ProjectDemandFormField[]>(`/projetos/config/demand-types/${demandTypeId}/sections/${sectionId}/fields/reorder`, { items }).then((r) => r.data),
  deleteDemandField: (demandTypeId: string, sectionId: string, fieldId: string) =>
    api.delete<void>(`/projetos/config/demand-types/${demandTypeId}/sections/${sectionId}/fields/${fieldId}`).then((r) => r.data),

  listMyRequests: () =>
    api.get<ProjectTaskWithContext[]>(`/projetos/me/requests`).then((r) => r.data),

  listStatusSectionLinks: (projectId: string, statusId: string) =>
    api.get<ProjectStatusSectionLink[]>(`/projetos/projects/${projectId}/statuses/${statusId}/section-links`).then((r) => r.data),
  upsertStatusSectionLink: (projectId: string, statusId: string, data: {
    section_id: string
    mode?: "visible" | "editable" | "required" | "hidden"
  }) => api.post<ProjectStatusSectionLink>(`/projetos/projects/${projectId}/statuses/${statusId}/section-links`, data).then((r) => r.data),
  deleteStatusSectionLink: (projectId: string, statusId: string, linkId: string) =>
    api.delete<void>(`/projetos/projects/${projectId}/statuses/${statusId}/section-links/${linkId}`).then((r) => r.data),

  listStatusDefaultFormLinks: (projectId: string, statusId: string) =>
    api.get<ProjectStatusDefaultFormLink[]>(
      `/projetos/projects/${projectId}/statuses/${statusId}/default-form-links`,
    ).then((r) => r.data),
  upsertStatusDefaultFormLink: (projectId: string, statusId: string, data: {
    field_key: DefaultFormFieldKey
    mode?: "visible" | "editable" | "required" | "hidden"
  }) => api.post<ProjectStatusDefaultFormLink>(
    `/projetos/projects/${projectId}/statuses/${statusId}/default-form-links`,
    data,
  ).then((r) => r.data),
  deleteStatusDefaultFormLink: (projectId: string, statusId: string, linkId: string) =>
    api.delete<void>(
      `/projetos/projects/${projectId}/statuses/${statusId}/default-form-links/${linkId}`,
    ).then((r) => r.data),

  listFunnels: (projectId: string, activeOnly = false) =>
    api.get<ProjectFunnel[]>(`/projetos/projects/${projectId}/funnels`, { params: { active_only: activeOnly } }).then((r) => r.data),
  createFunnel: (projectId: string, data: {
    name: string
    description?: string
    color?: string
    order?: number
    is_default?: boolean
    is_active?: boolean
    allowed_demand_type_ids?: string[] | null
  }) => api.post<ProjectFunnel>(`/projetos/projects/${projectId}/funnels`, data).then((r) => r.data),
  reorderFunnels: (projectId: string, items: Array<{ id: string; order: number }>) =>
    api.patch<ProjectFunnel[]>(`/projetos/projects/${projectId}/funnels/reorder`, { items }).then((r) => r.data),
  updateFunnel: (projectId: string, funnelId: string, data: Partial<{
    name: string
    description: string | null
    color: string
    order: number
    is_default: boolean
    is_active: boolean
    allowed_demand_type_ids: string[] | null
  }>) => api.patch<ProjectFunnel>(`/projetos/projects/${projectId}/funnels/${funnelId}`, data).then((r) => r.data),
  deleteFunnel: (projectId: string, funnelId: string) =>
    api.delete<void>(`/projetos/projects/${projectId}/funnels/${funnelId}`).then((r) => r.data),

  listStatuses: (projectId: string, funnelId?: string, activeOnly = false) =>
    api.get<ProjectStatus[]>(`/projetos/projects/${projectId}/statuses`, {
      params: {
        ...(funnelId ? { funnel_id: funnelId } : {}),
        active_only: activeOnly,
      },
    }).then((r) => r.data),
  createStatus: (projectId: string, data: {
    funnel_id: string
    name: string
    color?: string
    order?: number
    is_initial?: boolean
    is_final?: boolean
    is_active?: boolean
    creates_demand_type_id?: string | null
    moves_to_funnel_id?: string | null
    move_in_role_ids?: string[] | null
    sla_hours?: number | null
    sla_warning_pct?: number
  }) => api.post<ProjectStatus>(`/projetos/projects/${projectId}/statuses`, data).then((r) => r.data),
  updateStatus: (projectId: string, funnelId: string, statusId: string, data: Partial<{
    name: string
    color: string
    order: number
    is_initial: boolean
    is_final: boolean
    is_active: boolean
    creates_demand_type_id: string | null
    moves_to_funnel_id: string | null
    updates_origin_status_id: string | null
    move_in_role_ids: string[] | null
    sla_hours: number | null
    sla_warning_pct: number
  }>) => api.patch<ProjectStatus>(`/projetos/projects/${projectId}/funnels/${funnelId}/statuses/${statusId}`, data).then((r) => r.data),
  reorderStatuses: (projectId: string, funnelId: string, items: Array<{ id: string; order: number }>) =>
    api.patch<ProjectStatus[]>(`/projetos/projects/${projectId}/funnels/${funnelId}/statuses/reorder`, { items }).then((r) => r.data),
  deleteStatus: (projectId: string, funnelId: string, statusId: string) =>
    api.delete<void>(`/projetos/projects/${projectId}/funnels/${funnelId}/statuses/${statusId}`).then((r) => r.data),

  listTasks: (projectId: string, params?: { status_id?: string; assigned_to?: string }) =>
    api.get<ProjectTask[]>(`/projetos/projects/${projectId}/tasks`, { params }).then((r) => r.data),
  createTask: (projectId: string, data: {
    status_id: string
    demand_type_id?: string | null
    parent_task_id?: string | null
    title: string
    description?: string | null
    assigned_to?: string | null
    diretoria?: string | null
    area?: string | null
    start_date?: string | null
    due_date?: string | null
    order?: number
    form_values?: Record<string, unknown>
  }) => api.post<ProjectTask>(`/projetos/projects/${projectId}/tasks`, data).then((r) => r.data),
  updateTask: (projectId: string, taskId: string, data: Partial<{
    status_id: string
    demand_type_id: string | null
    parent_task_id: string | null
    title: string
    description: string | null
    assigned_to: string | null
    diretoria: string | null
    area: string | null
    start_date: string | null
    due_date: string | null
    order: number
    form_values: Record<string, unknown>
    conversion_title: string
  }>) => api.patch<ProjectTask>(`/projetos/projects/${projectId}/tasks/${taskId}`, data).then((r) => r.data),
  deleteTask: (projectId: string, taskId: string) =>
    api.delete<void>(`/projetos/projects/${projectId}/tasks/${taskId}`).then((r) => r.data),
  listTaskChildren: (projectId: string, taskId: string) =>
    api.get<ProjectTask[]>(`/projetos/projects/${projectId}/tasks/${taskId}/children`).then((r) => r.data),

  listStatusAutomations: (projectId: string, statusId: string) =>
    api.get<ProjectAutomationRule[]>(`/projetos/projects/${projectId}/statuses/${statusId}/automations`).then((r) => r.data),
  createStatusAutomation: (projectId: string, statusId: string, data: {
    name: string
    action: ProjectAutomationAction
    action_config?: Record<string, unknown> | null
    order?: number
    is_active?: boolean
  }) => api.post<ProjectAutomationRule>(`/projetos/projects/${projectId}/statuses/${statusId}/automations`, data).then((r) => r.data),
  updateAutomation: (projectId: string, ruleId: string, data: Partial<{
    name: string
    action: ProjectAutomationAction
    action_config: Record<string, unknown> | null
    order: number
    is_active: boolean
  }>) => api.patch<ProjectAutomationRule>(`/projetos/projects/${projectId}/automations/${ruleId}`, data).then((r) => r.data),
  deleteAutomation: (projectId: string, ruleId: string) =>
    api.delete<void>(`/projetos/projects/${projectId}/automations/${ruleId}`).then((r) => r.data),

  getTaskFormSubmission: (projectId: string, taskId: string) =>
    api.get<ProjectDemandFormSubmission | null>(`/projetos/projects/${projectId}/tasks/${taskId}/form-submission`).then((r) => r.data),
  upsertTaskFormSubmission: (projectId: string, taskId: string, values: Record<string, unknown>) =>
    api.put<ProjectDemandFormSubmission>(`/projetos/projects/${projectId}/tasks/${taskId}/form-submission`, { values }).then((r) => r.data),

  listTaskComments: (projectId: string, taskId: string) =>
    api.get<ProjectTaskComment[]>(`/projetos/projects/${projectId}/tasks/${taskId}/comments`).then((r) => r.data),
  createTaskComment: (projectId: string, taskId: string, content: string) =>
    api.post<ProjectTaskComment>(`/projetos/projects/${projectId}/tasks/${taskId}/comments`, { content }).then((r) => r.data),

  getReports: () =>
    api.get<ProjectReports>(`/projetos/reports`).then((r) => r.data),

  // Cronograma: vínculos fluxo + etapa
  getDefaultFormFields: () =>
    api.get<ProjectDefaultFormField[]>("/projetos/config/default-form").then((r) => r.data),
  updateDefaultFormFields: (fields: Array<{
    field_key: DefaultFormFieldKey
    label: string
    field_type: string
    options?: { items: Array<{ value: string; label: string; color?: string }> } | null
    is_visible: boolean
    is_required: boolean
    order: number
  }>) =>
    api.put<ProjectDefaultFormField[]>("/projetos/config/default-form", { fields }).then((r) => r.data),

  listScheduleBindings: () =>
    api.get<ProjectScheduleBinding[]>(`/projetos/config/schedule-bindings`).then((r) => r.data),
  saveScheduleBindings: (bindings: ProjectScheduleBindingInput[]) =>
    api.put<ProjectScheduleBinding[]>(`/projetos/config/schedule-bindings`, { bindings }).then((r) => r.data),
  deleteScheduleBinding: (statusId: string) =>
    api.delete<void>(`/projetos/config/schedule-bindings/${statusId}`).then((r) => r.data),
}

