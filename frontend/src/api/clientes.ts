import api from "./client"

// ── Operação Assistida: clientes ────────────────────────────────────────────

export interface ClientProjectRef {
  task_id: string
  title: string
  status_name: string | null
  planning_kind: string | null
}

export interface ProjectClient {
  id: string
  email: string
  full_name: string
  phone: string | null
  organization: string | null
  department: string | null
  job_title?: string | null
  notes: string | null
  user_id: string | null
  is_active: boolean
  is_internal_user: boolean
  first_access_pending: boolean
  projects: ClientProjectRef[]
  created_at: string
}

export type ClientLookupStatus = "new" | "client" | "internal_user" | "other_tenant"

export interface ClientLookup {
  status: ClientLookupStatus
  client: ProjectClient | null
  user_full_name: string | null
}

export interface ProjectClientCreate {
  email: string
  full_name: string
  phone?: string | null
  organization?: string | null
  department?: string | null
  notes?: string | null
  project_task_ids: string[]
}

export type ProjectClientUpdate = Partial<Omit<ProjectClientCreate, "email" | "project_task_ids">> & {
  is_active?: boolean
}

export const clientesApi = {
  list: (params?: { search?: string; include_inactive?: boolean }) =>
    api.get<ProjectClient[]>("/projetos/clients", { params }).then((r) => r.data),
  lookup: (email: string) =>
    api.get<ClientLookup>("/projetos/clients/lookup", { params: { email } }).then((r) => r.data),
  linkableProjects: () =>
    api.get<ClientProjectRef[]>("/projetos/clients/linkable-projects").then((r) => r.data),
  create: (data: ProjectClientCreate) =>
    api.post<ProjectClient>("/projetos/clients", data).then((r) => r.data),
  update: (id: string, data: ProjectClientUpdate) =>
    api.patch<ProjectClient>(`/projetos/clients/${id}`, data).then((r) => r.data),
  setProjects: (id: string, projectTaskIds: string[]) =>
    api
      .put<ProjectClient>(`/projetos/clients/${id}/projects`, { project_task_ids: projectTaskIds })
      .then((r) => r.data),
  firstAccessLink: (id: string) =>
    api.post<{ path: string; expires_hours: number }>(`/projetos/clients/${id}/first-access-link`).then((r) => r.data),
  listForProject: (taskId: string) =>
    api.get<ProjectClient[]>(`/projetos/tasks/${taskId}/clients`).then((r) => r.data),
}


// ── Clientes do projeto (card do projeto) ───────────────────────────────────

export type ProjectClientRole = "solicitante" | "sponsor" | "usuario_chave" | "homologador" | "gestor_area" | "outro"

export const PROJECT_CLIENT_ROLE_LABEL: Record<ProjectClientRole, string> = {
  solicitante: "Solicitante",
  sponsor: "Sponsor",
  usuario_chave: "Usuário-chave",
  homologador: "Homologador",
  gestor_area: "Gestor da área",
  outro: "Outro",
}

export interface ProjectClientMember {
  client_id: string
  full_name: string
  email: string
  department: string | null
  organization: string | null
  job_title: string | null
  project_role: ProjectClientRole | null
  project_role_other: string | null
  project_role_label: string
  /** Já tem login; sem login, entra pelo IDigital (ou primeiro acesso). */
  has_login: boolean
  is_internal_user: boolean
  is_active: boolean
  added_at: string | null
}

export interface ProjectClientMembers {
  can_manage: boolean
  members: ProjectClientMember[]
}

export interface ProjectClientCandidate {
  source: "client" | "person" | "user" | "genus"
  email: string
  full_name: string | null
  department: string | null
  organization: string | null
  job_title: string | null
  client_id: string | null
  already_linked: boolean
}

export interface ProjectClientCandidates {
  items: ProjectClientCandidate[]
  /** Folha (Genus), só quando a busca é um e-mail. */
  genus: "ok" | "not_found" | "unavailable" | "off" | "skipped"
}

export interface ProjectClientMemberAdd {
  client_id?: string | null
  email?: string | null
  full_name?: string | null
  department?: string | null
  organization?: string | null
  job_title?: string | null
  project_role: ProjectClientRole
  project_role_other?: string | null
}

export const projectClientsApi = {
  list: (taskId: string) =>
    api.get<ProjectClientMembers>(`/projetos/tasks/${taskId}/project-clients`).then((r) => r.data),
  candidates: (taskId: string, q: string) =>
    api.get<ProjectClientCandidates>(`/projetos/tasks/${taskId}/project-clients/candidates`, { params: { q } }).then((r) => r.data),
  add: (taskId: string, data: ProjectClientMemberAdd) =>
    api.post<ProjectClientMembers>(`/projetos/tasks/${taskId}/project-clients`, data).then((r) => r.data),
  update: (taskId: string, clientId: string, data: { project_role: ProjectClientRole; project_role_other?: string | null }) =>
    api.patch<ProjectClientMembers>(`/projetos/tasks/${taskId}/project-clients/${clientId}`, data).then((r) => r.data),
  remove: (taskId: string, clientId: string) =>
    api.delete<ProjectClientMembers>(`/projetos/tasks/${taskId}/project-clients/${clientId}`).then((r) => r.data),
}

// ── Portal: andamento do projeto ────────────────────────────────────────────

export type ProjectPhase = "planejamento" | "desenvolvimento" | "homologacao" | "producao" | "concluido" | "impedimento"

export interface ClientProjectFeature {
  title: string
  status_name: string | null
  state: "a_iniciar" | "andamento" | "validacao" | "ajuste" | "concluida"
  start_date: string | null
  due_date: string | null
  us_total: number
  us_done: number
}

export interface ClientProjectReport {
  task_id: string
  title: string
  planning_kind: string | null
  my_role_label: string | null
  po_name: string | null
  stage_name: string | null
  phase: ProjectPhase
  in_assisted_operation: boolean
  paused: boolean
  exec_pct: number | null
  start_date: string | null
  due_date: string | null
  completed_at: string | null
  features: ClientProjectFeature[]
  updated_at: string | null
}

// ── Operação Assistida: Ocorrências ─────────────────────────────────────────

export type OccurrenceTipo = "erro" | "duvida" | "ajuste" | "melhoria"
export type OccurrenceImpacto = "impede" | "contorno" | "baixo"
export type OccurrenceAbrangencia = "eu" | "setor" | "todos"
export type OccurrencePrioridade = "P1" | "P2" | "P3" | "P4"
export type OccurrenceClassificacao = "erro_confirmado" | "duvida" | "ajuste" | "melhoria" | "nao_procede"

export const OCCURRENCE_TIPO_LABEL: Record<OccurrenceTipo, string> = {
  erro: "Erro / Falha",
  duvida: "Dúvida de uso",
  ajuste: "Ajuste (diferente do combinado)",
  melhoria: "Sugestão de melhoria",
}
/** Tipos oferecidos ao cliente na abertura (Portal). "Ajuste (diferente do combinado)" saiu
 *  a pedido; o rótulo segue em OCCURRENCE_TIPO_LABEL para exibir ocorrências antigas. */
export type OccurrenceTipoAbertura = Exclude<OccurrenceTipo, "ajuste">
export const OCCURRENCE_TIPO_ABERTURA: Record<OccurrenceTipoAbertura, string> = {
  erro: OCCURRENCE_TIPO_LABEL.erro,
  duvida: OCCURRENCE_TIPO_LABEL.duvida,
  melhoria: OCCURRENCE_TIPO_LABEL.melhoria,
}
export const OCCURRENCE_IMPACTO_LABEL: Record<OccurrenceImpacto, string> = {
  impede: "Impede o trabalho",
  contorno: "Tem contorno",
  baixo: "Baixo",
}
export const OCCURRENCE_ABRANGENCIA_LABEL: Record<OccurrenceAbrangencia, string> = {
  eu: "Só eu",
  setor: "Meu setor",
  todos: "Todos os usuários",
}
export const OCCURRENCE_CLASSIFICACAO_LABEL: Record<OccurrenceClassificacao, string> = {
  erro_confirmado: "Erro confirmado",
  duvida: "Dúvida",
  ajuste: "Ajuste",
  melhoria: "Melhoria (vai para o PO)",
  nao_procede: "Não procede",
}

export interface Upload {
  object_name: string
  filename: string
  content_type: string
  size: number
}

export interface PortalProject extends ClientProjectRef {
  accepts_occurrences: boolean
  open_occurrences: number
  /** Função do cliente logado neste projeto. */
  project_role_label?: string | null
}

export interface OccurrenceSummary {
  task_id: string
  project_id: string
  code: number
  code_label: string
  title: string
  tipo: OccurrenceTipo
  prioridade: OccurrencePrioridade
  impacto: OccurrenceImpacto
  abrangencia: OccurrenceAbrangencia
  stage_key: string | null
  stage_name: string | null
  is_closed: boolean
  project_task_id: string
  project_title: string | null
  opened_by_name: string | null
  opened_by_me: boolean
  can_interact: boolean
  assignee_name: string | null
  assumed_at: string | null
  /** Horas úteis gastas (pausa com o cliente). */
  worked_hours: number | null
  nps_score: number | null
  created_at: string
  updated_at: string | null
}

export interface OccurrenceComment {
  id: string
  author_name: string | null
  from_client: boolean
  content: string
  anexos: Upload[] | null
  created_at: string
}

export interface OccurrenceDetail extends OccurrenceSummary {
  description: string | null
  passos: string | null
  esperado: string | null
  funcionalidade: string | null
  anexos: Upload[] | null
  solucao: string | null
  classificacao: OccurrenceClassificacao | null
  causa_raiz: string | null
  homologated_at: string | null
  nps_comment: string | null
  rejection_count: number
  finalized_by_team: boolean
  release_project_title: string | null
  release_item_title: string | null
  /** Visão do time: PO responsável e produto do projeto (card da ocorrência). */
  project_po_name?: string | null
  product_name?: string | null
  /** Visão do time: devs de atendimento do projeto (quem pode assumir, além do PO e da coordenação). */
  assisted_ops_dev_names?: string[]
  can_assume: boolean
  comments: OccurrenceComment[]
  history: Array<{
    stage_name: string | null
    from_stage_name?: string | null
    moved_at: string | null
    moved_by_name?: string | null
    source?: string | null
  }>
}

export interface OccurrenceCreate {
  project_task_id: string
  tipo: OccurrenceTipo
  title: string
  description: string
  passos?: string | null
  esperado?: string | null
  funcionalidade?: string | null
  impacto: OccurrenceImpacto
  abrangencia: OccurrenceAbrangencia
  anexos?: Upload[] | null
}

export interface OccurrenceTeamUpdate {
  prioridade?: OccurrencePrioridade
  classificacao?: OccurrenceClassificacao | null
  solucao?: string | null
  causa_raiz?: string | null
  funcionalidade?: string | null
}

export const portalOccurrencesApi = {
  projects: () => api.get<PortalProject[]>("/projetos/portal/projects").then((r) => r.data),
  projectReport: (taskId: string) =>
    api.get<ClientProjectReport>(`/projetos/portal/projects/${taskId}/report`).then((r) => r.data),
  list: (params?: { project_task_id?: string; mine?: boolean }) =>
    api.get<OccurrenceSummary[]>("/projetos/portal/occurrences", { params }).then((r) => r.data),
  get: (taskId: string) => api.get<OccurrenceDetail>(`/projetos/portal/occurrences/${taskId}`).then((r) => r.data),
  open: (data: OccurrenceCreate) =>
    api.post<OccurrenceDetail>("/projetos/portal/occurrences", data).then((r) => r.data),
  comment: (taskId: string, data: { content: string; anexos?: Upload[] | null }) =>
    api.post<OccurrenceDetail>(`/projetos/portal/occurrences/${taskId}/comments`, data).then((r) => r.data),
  upload: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return api.post<Upload>("/projetos/portal/uploads", fd).then((r) => r.data)
  },
  homologate: (taskId: string, data: { approve: boolean; nps_score?: number | null; comment?: string | null }) =>
    api.post<OccurrenceDetail>(`/projetos/portal/occurrences/${taskId}/homologation`, data).then((r) => r.data),
  uploadUrl: (objectName: string) =>
    api
      .get<{ url: string }>("/projetos/portal/uploads/url", { params: { object_name: objectName } })
      .then((r) => r.data.url),
}

export interface ReleaseCandidate {
  task_id: string
  title: string
  status_name: string | null
  features: Array<{ task_id: string; title: string }>
}

export interface AssistedOpsDev {
  person_id: string
  full_name: string
  position_name: string | null
  daily_hours: number | null
  project_allocation_pct: number | null
  assisted_ops_allocation_pct: number
  tickets_allocation_pct: number
}

export const teamOccurrencesApi = {
  get: (taskId: string) => api.get<OccurrenceDetail>(`/projetos/occurrences/${taskId}`).then((r) => r.data),
  update: (taskId: string, data: OccurrenceTeamUpdate) =>
    api.patch<OccurrenceDetail>(`/projetos/occurrences/${taskId}`, data).then((r) => r.data),
  assume: (taskId: string) =>
    api.post<OccurrenceDetail>(`/projetos/occurrences/${taskId}/assume`).then((r) => r.data),
  releaseCandidates: () =>
    api.get<ReleaseCandidate[]>("/projetos/occurrences/release-candidates").then((r) => r.data),
  forwardRelease: (
    taskId: string,
    data: {
      release_task_id?: string | null
      new_release_title?: string | null
      item_kind: "feature" | "user_story"
      parent_feature_id?: string | null
    },
  ) => api.post<OccurrenceDetail>(`/projetos/occurrences/${taskId}/forward-release`, data).then((r) => r.data),
  listDevs: (projectTaskId: string) =>
    api.get<AssistedOpsDev[]>(`/projetos/tasks/${projectTaskId}/assisted-ops-devs`).then((r) => r.data),
  setDevs: (
    projectTaskId: string,
    personIds: string[],
    allocations: Array<{ person_id: string; project_allocation_pct: number; assisted_ops_allocation_pct: number }> = [],
  ) =>
    api
      .put<AssistedOpsDev[]>(`/projetos/tasks/${projectTaskId}/assisted-ops-devs`, {
        person_ids: personIds,
        allocations,
      })
      .then((r) => r.data),
}
