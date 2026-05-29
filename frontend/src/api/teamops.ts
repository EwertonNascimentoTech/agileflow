import api from "./client"

export type AreaType = "negocio" | "suporte" | "dados" | "produto" | "sustentacao"
export type AreaStatus = "ativa" | "inativa" | "reestruturacao"
export type EmploymentType = "clt" | "pj" | "estagio" | "terceiro"
export type PersonStatus = "ativo" | "afastado" | "ferias" | "desligado"
export type StackLevel = "basico" | "junior" | "pleno" | "senior" | "especialista" | "referencia"
export type AbsenceStatus = "pendente" | "aprovada" | "recusada" | "cancelada"

export interface PositionMini {
  id: string
  slug: string
  name: string
  is_system: boolean
}

export interface Position {
  id: string
  slug: string
  name: string
  description: string | null
  is_system: boolean
  sort_order: number
  is_active: boolean
  role_id: string | null
  created_at: string
  updated_at: string
  person_count: number
}

export interface CatalogPermission {
  code: string
  name: string
  description: string | null
  module_slug: string
}

export interface PersonMini {
  id: string
  full_name: string
  position: PositionMini | null
}

export interface AreaMini {
  id: string
  name: string
}

export interface StackMini {
  id: string
  name: string
  slug: string
  is_critical: boolean
}

export interface StackCategoryMini {
  id: string
  name: string
}

export interface AbsenceTypeMini {
  id: string
  name: string
  slug: string
  color: string
  affects_capacity: boolean
}

export interface StackCategory {
  id: string
  name: string
  order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Stack {
  id: string
  category_id: string
  name: string
  slug: string
  is_critical: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  category: StackCategoryMini | null
}

export interface AbsenceType {
  id: string
  name: string
  slug: string
  requires_approval: boolean
  affects_capacity: boolean
  color: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AreaRef {
  id: string
  name: string
}

export interface Area {
  id: string
  name: string
  description: string | null
  parent_area_id: string | null
  area_type: AreaType
  po_person_id: string | null
  tech_reference_person_id: string | null
  coordinator_person_id: string | null
  manager_person_id: string | null
  status: AreaStatus
  is_active: boolean
  created_at: string
  updated_at: string
  parent_area: AreaRef | null
  po_person: PersonMini | null
  tech_reference_person: PersonMini | null
  coordinator_person: PersonMini | null
  manager_person: PersonMini | null
  person_count: number
  subarea_count: number
}

export interface Person {
  id: string
  user_id: string | null
  full_name: string
  email: string
  phone: string | null
  whatsapp: string | null
  birth_date: string | null
  position_id: string
  area_id: string | null
  po_person_id: string | null
  tech_reference_person_id: string | null
  manager_person_id: string | null
  employment_type: EmploymentType
  daily_hours: number
  weekly_hours: number
  start_date: string | null
  status: PersonStatus
  notes: string | null
  created_at: string
  updated_at: string
  position: PositionMini | null
  area: AreaMini | null
  po_person: PersonMini | null
  tech_reference_person: PersonMini | null
  manager_person: PersonMini | null
  // Acesso ao sistema (derivado do usuário vinculado)
  access_level: AccessLevel
  user_active: boolean | null
  user_email: string | null
}

export type AccessLevel = "none" | "com_acesso" | "executor" | "gestor"

export interface TeamMember {
  id: string // user_id
  person_id: string
  full_name: string
  email: string
  position_name: string | null
  position_slug: string | null
  access_level: AccessLevel
}

/** Slugs conhecidos do cargo Product Owner no TeamOps. */
export const PRODUCT_OWNER_POSITION_SLUGS = new Set(["po", "product_owner"])

export function isProductOwnerPosition(slug: string | null | undefined, name?: string | null): boolean {
  if (slug && PRODUCT_OWNER_POSITION_SLUGS.has(slug)) return true
  const n = (name ?? "").trim().toLowerCase()
  return n === "product owner" || n.includes("product owner")
}

export interface PersonStack {
  id: string
  person_id: string
  stack_id: string
  level: StackLevel
  years_experience: number
  is_reference: boolean
  notes: string | null
  created_at: string
  updated_at: string
  stack: StackMini | null
}

export interface Absence {
  id: string
  person_id: string
  absence_type_id: string
  start_date: string
  end_date: string
  partial_hours: number | null
  status: AbsenceStatus
  requested_by: string | null
  approver_person_id: string | null
  approved_at: string | null
  decision_notes: string | null
  notes: string | null
  created_at: string
  updated_at: string
  person: PersonMini | null
  absence_type: AbsenceTypeMini | null
  approver_person: PersonMini | null
}

export interface OrgNode {
  person: PersonMini
  area_id: string | null
  area_name: string | null
  children: OrgNode[]
}

export interface OrgTree {
  roots: OrgNode[]
  orphans: OrgNode[]
}

export interface CompetencyMapPerson {
  person: PersonMini
  level: StackLevel
  years_experience: number
  is_reference: boolean
}

export interface CompetencyMapEntry {
  stack: StackMini
  category_id: string
  category_name: string
  person_count: number
  has_reference: boolean
  risk_level: "low" | "medium" | "high"
  persons: CompetencyMapPerson[]
}

export interface CompetencyMap {
  entries: CompetencyMapEntry[]
}

export interface TeamAlert {
  code: string
  severity: "low" | "medium" | "high"
  title: string
  description: string
  related_person_ids: string[]
  related_stack_ids: string[]
  related_area_ids: string[]
}

export interface AlertsResponse {
  items: TeamAlert[]
}

export interface DashboardKpis {
  active_persons: number
  on_vacation_today: number
  pending_approvals: number
  critical_stacks_without_backup: number
  areas_without_po: number
  persons_by_area: Array<{ area: string; count: number }>
  persons_by_role: Array<{ role: string; count: number }>
}

export interface AbsenceCalendarDay {
  day: string
  absences: Absence[]
  conflict_flags: string[]
}

export interface AbsenceCalendar {
  month: string
  days: AbsenceCalendarDay[]
}

export const teamopsApi = {
  // Dashboard / Alerts
  getDashboard: () => api.get<DashboardKpis>("/teamops/dashboard").then((r) => r.data),
  getAlerts: () => api.get<AlertsResponse>("/teamops/alerts").then((r) => r.data),
  getOrgTree: () => api.get<OrgTree>("/teamops/org/tree").then((r) => r.data),
  getCompetencyMap: () => api.get<CompetencyMap>("/teamops/competency-map").then((r) => r.data),

  // Areas
  listAreas: (activeOnly = false) =>
    api.get<Area[]>("/teamops/areas", { params: { active_only: activeOnly } }).then((r) => r.data),
  getArea: (id: string) => api.get<Area>(`/teamops/areas/${id}`).then((r) => r.data),
  createArea: (data: Partial<Area>) => api.post<Area>("/teamops/areas", data).then((r) => r.data),
  updateArea: (id: string, data: Partial<Area>) =>
    api.patch<Area>(`/teamops/areas/${id}`, data).then((r) => r.data),
  deleteArea: (id: string) => api.delete<void>(`/teamops/areas/${id}`).then((r) => r.data),

  // Positions (cargos)
  listPositions: (activeOnly = false) =>
    api.get<Position[]>("/teamops/positions", { params: { active_only: activeOnly } }).then((r) => r.data),
  createPosition: (data: {
    name: string
    slug?: string
    description?: string | null
    sort_order?: number
    is_active?: boolean
  }) => api.post<Position>("/teamops/positions", data).then((r) => r.data),
  updatePosition: (id: string, data: Partial<Position>) =>
    api.patch<Position>(`/teamops/positions/${id}`, data).then((r) => r.data),
  deletePosition: (id: string) => api.delete<void>(`/teamops/positions/${id}`).then((r) => r.data),

  // Acesso por cargo (matriz de permissões)
  getPermissionsCatalog: () =>
    api.get<CatalogPermission[]>("/teamops/permissions-catalog").then((r) => r.data),
  getPositionPermissions: (positionId: string) =>
    api.get<string[]>(`/teamops/positions/${positionId}/permissions`).then((r) => r.data),
  setPositionPermissions: (positionId: string, codes: string[]) =>
    api.put<string[]>(`/teamops/positions/${positionId}/permissions`, { codes }).then((r) => r.data),

  // Stack Categories
  listStackCategories: (activeOnly = false) =>
    api.get<StackCategory[]>("/teamops/stack-categories", { params: { active_only: activeOnly } }).then((r) => r.data),
  createStackCategory: (data: { name: string; order?: number; is_active?: boolean }) =>
    api.post<StackCategory>("/teamops/stack-categories", data).then((r) => r.data),
  updateStackCategory: (id: string, data: Partial<StackCategory>) =>
    api.patch<StackCategory>(`/teamops/stack-categories/${id}`, data).then((r) => r.data),
  deleteStackCategory: (id: string) =>
    api.delete<void>(`/teamops/stack-categories/${id}`).then((r) => r.data),

  // Stacks
  listStacks: (params?: { category_id?: string; active_only?: boolean }) =>
    api.get<Stack[]>("/teamops/stacks", { params }).then((r) => r.data),
  createStack: (data: {
    category_id: string
    name: string
    slug?: string
    is_critical?: boolean
    is_active?: boolean
  }) => api.post<Stack>("/teamops/stacks", data).then((r) => r.data),
  updateStack: (id: string, data: Partial<Stack>) =>
    api.patch<Stack>(`/teamops/stacks/${id}`, data).then((r) => r.data),
  deleteStack: (id: string) => api.delete<void>(`/teamops/stacks/${id}`).then((r) => r.data),

  // Absence Types
  listAbsenceTypes: (activeOnly = false) =>
    api.get<AbsenceType[]>("/teamops/absence-types", { params: { active_only: activeOnly } }).then((r) => r.data),
  createAbsenceType: (data: {
    name: string
    slug?: string
    requires_approval?: boolean
    affects_capacity?: boolean
    color?: string
    is_active?: boolean
  }) => api.post<AbsenceType>("/teamops/absence-types", data).then((r) => r.data),
  updateAbsenceType: (id: string, data: Partial<AbsenceType>) =>
    api.patch<AbsenceType>(`/teamops/absence-types/${id}`, data).then((r) => r.data),
  deleteAbsenceType: (id: string) =>
    api.delete<void>(`/teamops/absence-types/${id}`).then((r) => r.data),

  // Persons
  listPersons: (params?: {
    area_id?: string
    position_id?: string
    status?: PersonStatus
    search?: string
  }) => api.get<Person[]>("/teamops/persons", { params }).then((r) => r.data),
  getPerson: (id: string) => api.get<Person>(`/teamops/persons/${id}`).then((r) => r.data),
  createPerson: (data: Partial<Person> & { full_name: string; email: string; access_level?: AccessLevel; password?: string }) =>
    api.post<Person>("/teamops/persons", data).then((r) => r.data),
  updatePerson: (id: string, data: Partial<Person> & { access_level?: AccessLevel; password?: string; reset_password?: string }) =>
    api.patch<Person>(`/teamops/persons/${id}`, data).then((r) => r.data),
  deletePerson: (id: string) => api.delete<void>(`/teamops/persons/${id}`).then((r) => r.data),

  // Membros do time (pessoas com login ativo) — para o seletor de responsável do kanban
  listMembers: () => api.get<TeamMember[]>("/teamops/members").then((r) => r.data),

  // Person Stacks
  listPersonStacks: (personId: string) =>
    api.get<PersonStack[]>(`/teamops/persons/${personId}/stacks`).then((r) => r.data),
  addPersonStack: (personId: string, data: {
    stack_id: string
    level?: StackLevel
    years_experience?: number
    is_reference?: boolean
    notes?: string
  }) => api.post<PersonStack>(`/teamops/persons/${personId}/stacks`, data).then((r) => r.data),
  updatePersonStack: (personId: string, personStackId: string, data: Partial<PersonStack>) =>
    api.patch<PersonStack>(`/teamops/persons/${personId}/stacks/${personStackId}`, data).then((r) => r.data),
  deletePersonStack: (personId: string, personStackId: string) =>
    api.delete<void>(`/teamops/persons/${personId}/stacks/${personStackId}`).then((r) => r.data),

  // Absences
  listAbsences: (params?: {
    person_id?: string
    status?: AbsenceStatus
    start_from?: string
    end_to?: string
    area_id?: string
  }) => api.get<Absence[]>("/teamops/absences", { params }).then((r) => r.data),
  getAbsenceCalendar: (month: string) =>
    api.get<AbsenceCalendar>("/teamops/absences/calendar", { params: { month } }).then((r) => r.data),
  createAbsence: (data: {
    person_id: string
    absence_type_id: string
    start_date: string
    end_date: string
    partial_hours?: number | null
    notes?: string
  }) => api.post<Absence>("/teamops/absences", data).then((r) => r.data),
  updateAbsence: (id: string, data: Partial<Absence>) =>
    api.patch<Absence>(`/teamops/absences/${id}`, data).then((r) => r.data),
  deleteAbsence: (id: string) => api.delete<void>(`/teamops/absences/${id}`).then((r) => r.data),
  approveAbsence: (id: string, decision_notes?: string) =>
    api.post<Absence>(`/teamops/absences/${id}/approve`, { decision_notes }).then((r) => r.data),
  rejectAbsence: (id: string, decision_notes?: string) =>
    api.post<Absence>(`/teamops/absences/${id}/reject`, { decision_notes }).then((r) => r.data),
}

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  clt: "CLT",
  pj: "PJ",
  estagio: "Estágio",
  terceiro: "Terceiro",
}

export const PERSON_STATUS_LABELS: Record<PersonStatus, string> = {
  ativo: "Ativo",
  afastado: "Afastado",
  ferias: "Em férias",
  desligado: "Desligado",
}

export const STACK_LEVEL_LABELS: Record<StackLevel, string> = {
  basico: "Básico",
  junior: "Júnior",
  pleno: "Pleno",
  senior: "Sênior",
  especialista: "Especialista",
  referencia: "Referência",
}

export const AREA_TYPE_LABELS: Record<AreaType, string> = {
  negocio: "Negócio",
  suporte: "Suporte",
  dados: "Dados",
  produto: "Produto",
  sustentacao: "Sustentação",
}

export const AREA_STATUS_LABELS: Record<AreaStatus, string> = {
  ativa: "Ativa",
  inativa: "Inativa",
  reestruturacao: "Em reestruturação",
}

export const ABSENCE_STATUS_LABELS: Record<AbsenceStatus, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  recusada: "Recusada",
  cancelada: "Cancelada",
}
