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
  /** Sugestões para o campo Clientes da solicitação (sem card ainda). */
  candidates: (q: string) =>
    api.get<ProjectClientCandidates>("/projetos/clients/candidates", { params: { q } }).then((r) => r.data),
  listForProject: (taskId: string) =>
    api.get<ProjectClient[]>(`/projetos/tasks/${taskId}/clients`).then((r) => r.data),
}


// ── Clientes do projeto (card do projeto) ───────────────────────────────────

export type ProjectClientRole =
  | "solicitante" | "sponsor" | "dono_processo" | "especialista_processo" | "escritorio_processos"
  | "usuario_chave" | "homologador" | "gestor_area" | "outro"

/** Dono do Processo, Especialista do Processo e Escritório de Processos são papéis do
 *  POP.COR.GTD.003; o Sponsor é a Instância Executiva (Patrocinador) do POP. */
export const PROJECT_CLIENT_ROLE_LABEL: Record<ProjectClientRole, string> = {
  solicitante: "Solicitante",
  sponsor: "Sponsor",
  dono_processo: "Dono do Processo",
  especialista_processo: "Especialista do Processo",
  escritorio_processos: "Escritório de Processos",
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

/** Clientes do programa: veem no Portal todos os projetos do programa (só leitura). */
export const programClientsApi = {
  list: (programId: string) =>
    api.get<ProjectClientMembers>(`/projetos/programs/${programId}/clients`).then((r) => r.data),
  candidates: (programId: string, q: string) =>
    api.get<ProjectClientCandidates>(`/projetos/programs/${programId}/clients/candidates`, { params: { q } }).then((r) => r.data),
  add: (programId: string, data: ProjectClientMemberAdd) =>
    api.post<ProjectClientMembers>(`/projetos/programs/${programId}/clients`, data).then((r) => r.data),
  update: (programId: string, clientId: string, data: { project_role: ProjectClientRole; project_role_other?: string | null }) =>
    api.patch<ProjectClientMembers>(`/projetos/programs/${programId}/clients/${clientId}`, data).then((r) => r.data),
  remove: (programId: string, clientId: string) =>
    api.delete<ProjectClientMembers>(`/projetos/programs/${programId}/clients/${clientId}`).then((r) => r.data),
}

// ── Operação Assistida: Ocorrências ─────────────────────────────────────────

export type OccurrenceTipo = "erro" | "duvida" | "ajuste" | "melhoria"
export type OccurrenceImpacto = "impede" | "contorno" | "baixo"
export type OccurrenceAbrangencia = "eu" | "setor" | "todos"
export type OccurrencePrioridade = "P1" | "P2" | "P3" | "P4"
export type OccurrenceClassificacao = "erro_confirmado" | "duvida" | "ajuste" | "melhoria" | "nao_procede"

/** Tipos do POP.COR.GTD.003 (7): correção, dúvida e melhoria. */
export const OCCURRENCE_TIPO_LABEL: Record<OccurrenceTipo, string> = {
  erro: "Correção (erro)",
  duvida: "Dúvida de uso",
  ajuste: "Ajuste (diferente do combinado)",
  melhoria: "Melhoria",
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
  /** Satisfação na homologação, de 1 a 5 (POP). */
  nps_score: number | null
  /** POP: só correção tem criticidade e prazo-alvo de resolução (horas úteis). */
  is_correction: boolean
  criticidade: string | null
  sla_target_hours: number | null
  sla_elapsed_hours: number | null
  sla_state: "ok" | "risco" | "estourado" | null
  /** Quem vê é do N1 do projeto e a ocorrência está na Triagem N1. */
  can_triage: boolean
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
  /** Triagem N1 (POP): responsáveis e resultado ("resolvida" no N1 ou "encaminhada" à TI). */
  n1_names: string[]
  n1_outcome: "resolvida" | "encaminhada" | null
  n1_by_name: string | null
  n1_at: string | null
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
  triage: (
    taskId: string,
    data: { action: "resolver" | "encaminhar"; tipo?: "erro" | "melhoria" | null; prioridade?: OccurrencePrioridade | null; comment?: string | null },
  ) => api.post<OccurrenceDetail>(`/projetos/portal/occurrences/${taskId}/triage`, data).then((r) => r.data),
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

/** Entrada na Operação Assistida (POP.COR.GTD.003, 5 e 8.1.2): pré-requisitos e fim previsto. */
export interface AssistedOpsPrereqItem {
  key: string
  label: string
  allow_na: boolean
  value: "sim" | "na" | null
  /** O que falta para poder confirmar (ex.: papéis sem Dono do Processo). */
  hint: string | null
}

export interface AssistedOpsExtension {
  from: string | null
  to: string
  reason: string
  by: string | null
  at: string
}

export interface AssistedOpsEntryState {
  items: AssistedOpsPrereqItem[]
  complete: boolean
  due_date: string | null
  max_days: number
  entered_at: string | null
  extensions: AssistedOpsExtension[]
  overdue: boolean
  can_manage: boolean
  /** Papéis do POP que faltam nos clientes do projeto. */
  missing_roles: string[]
  /** Fase atual (POP 8.3.1): 1 Estabilização intensiva, 2 Acompanhamento assistido, 3 Preparação para encerramento. */
  phase: number | null
  phase_label: string | null
  /** Pode registrar atas dos ritos (PO, coordenação e devs de atendimento). */
  can_record: boolean
}

export type AssistedOpMeetingKind = "diaria" | "semanal" | "comite"

export const ASSISTED_OP_MEETING_KIND_LABEL: Record<AssistedOpMeetingKind, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  comite: "Comitê",
}

export const ASSISTED_OP_PHASES: Record<number, string> = {
  1: "Estabilização intensiva",
  2: "Acompanhamento assistido",
  3: "Preparação para encerramento",
}

export interface AssistedOpMeeting {
  id: string
  kind: AssistedOpMeetingKind
  kind_label: string
  held_on: string
  phase: number | null
  participants: string | null
  summary: string
  decisions: string | null
  created_by_name: string | null
  created_at: string | null
  can_edit: boolean
}

export interface AssistedOpMeetingInput {
  kind: AssistedOpMeetingKind
  held_on: string
  participants?: string | null
  summary: string
  decisions?: string | null
}

// ── Operação Assistida: indicadores e encerramento (POP 8.1.3, 8.4 e 8.5) ─────

export interface AssistedOpsIndicator {
  key: string
  label: string
  value: number | null
  display: string
  meta: string | null
  status: "ok" | "alerta" | "sem_dado"
  detail: string | null
}

export interface AssistedOpsMeasure {
  id: string
  kind: "taxa_erros" | "disponibilidade"
  period_start: string
  period_end: string
  value: number | null
  transactions: number | null
  incidents: number | null
  rate: number | null
  note: string | null
}

export interface AssistedOpsTargets {
  sla_pct: number
  disponibilidade_pct: number
  reincidencia_pct: number
  satisfacao: number
  justificativa: string | null
}

export interface AssistedOpsIndicators {
  items: AssistedOpsIndicator[]
  weekly: Array<{ week_start: string; total: number; correcoes: number }>
  by_criticidade: Record<string, number>
  by_tipo: Record<string, number>
  n1: Record<string, number>
  targets: AssistedOpsTargets
  targets_calibrated: boolean
  measures: AssistedOpsMeasure[]
  since: string | null
  can_manage: boolean
}

export interface AssistedOpsClosureItem {
  key: string
  label: string
  done: boolean
  text: string | null
}

export interface AssistedOpsClosureState {
  criterios: AssistedOpsClosureItem[]
  decisao_estrategica: boolean
  decisao_texto: string | null
  analise: AssistedOpsClosureItem[]
  aceite_status: "pendente" | "aceito" | "recusado" | null
  aceite_requested_at: string | null
  aceite_requested_by: string | null
  donos: Array<{ name: string; has_login: boolean; answered: boolean; approved: boolean | null; comment: string | null; at: string | null }>
  override: { by: string; at: string; justificativa: string } | null
  open_occurrences: number
  missing: string[]
  ready: boolean
  concluded: boolean
  can_manage: boolean
  can_override: boolean
  can_accept: boolean
}

export interface AssistedOpsClosureInput {
  criterios: Record<string, boolean>
  decisao_estrategica: boolean
  decisao_texto: string | null
  analise: Record<string, string>
}

export interface PortalAssistedOps {
  indicators: AssistedOpsIndicators
  closure: AssistedOpsClosureState
  meetings: AssistedOpMeeting[]
  phase: number | null
  phase_label: string | null
  entered_at: string | null
  due_date: string | null
}

export const portalAssistedOpsApi = {
  get: (projectTaskId: string) =>
    api.get<PortalAssistedOps>(`/projetos/portal/projects/${projectTaskId}/assisted-ops`).then((r) => r.data),
  accept: (projectTaskId: string, data: { approve: boolean; comment?: string | null }) =>
    api.post<PortalAssistedOps>(`/projetos/portal/projects/${projectTaskId}/assisted-ops/acceptance`, data).then((r) => r.data),
}

export const teamOccurrencesApi = {
  indicators: (projectTaskId: string) =>
    api.get<AssistedOpsIndicators>(`/projetos/tasks/${projectTaskId}/assisted-ops-indicators`).then((r) => r.data),
  setTargets: (projectTaskId: string, data: AssistedOpsTargets) =>
    api.put<AssistedOpsIndicators>(`/projetos/tasks/${projectTaskId}/assisted-ops-targets`, data).then((r) => r.data),
  addMeasure: (
    projectTaskId: string,
    data: { kind: "taxa_erros" | "disponibilidade"; period_start: string; period_end: string; value?: number | null; transactions?: number | null; note?: string | null },
  ) => api.post<AssistedOpsIndicators>(`/projetos/tasks/${projectTaskId}/assisted-ops-measures`, data).then((r) => r.data),
  deleteMeasure: (projectTaskId: string, measureId: string) =>
    api.delete<AssistedOpsIndicators>(`/projetos/tasks/${projectTaskId}/assisted-ops-measures/${measureId}`).then((r) => r.data),
  closure: (projectTaskId: string) =>
    api.get<AssistedOpsClosureState>(`/projetos/tasks/${projectTaskId}/assisted-ops-closure`).then((r) => r.data),
  saveClosure: (projectTaskId: string, data: AssistedOpsClosureInput) =>
    api.put<AssistedOpsClosureState>(`/projetos/tasks/${projectTaskId}/assisted-ops-closure`, data).then((r) => r.data),
  closureDraft: (projectTaskId: string) =>
    api.get<Record<string, string>>(`/projetos/tasks/${projectTaskId}/assisted-ops-closure/draft`).then((r) => r.data),
  requestAcceptance: (projectTaskId: string) =>
    api.post<AssistedOpsClosureState>(`/projetos/tasks/${projectTaskId}/assisted-ops-closure/request-acceptance`).then((r) => r.data),
  overrideAcceptance: (projectTaskId: string, justificativa: string) =>
    api.post<AssistedOpsClosureState>(`/projetos/tasks/${projectTaskId}/assisted-ops-closure/override`, { justificativa }).then((r) => r.data),
  entry: (projectTaskId: string) =>
    api.get<AssistedOpsEntryState>(`/projetos/tasks/${projectTaskId}/assisted-ops-entry`).then((r) => r.data),
  setEntry: (projectTaskId: string, data: { checklist: Record<string, "sim" | "na">; due_date?: string | null }) =>
    api.put<AssistedOpsEntryState>(`/projetos/tasks/${projectTaskId}/assisted-ops-entry`, data).then((r) => r.data),
  extend: (projectTaskId: string, data: { new_due_date: string; reason: string }) =>
    api.post<AssistedOpsEntryState>(`/projetos/tasks/${projectTaskId}/assisted-ops-entry/extend`, data).then((r) => r.data),
  setPhase: (projectTaskId: string, phase: number) =>
    api.put<AssistedOpsEntryState>(`/projetos/tasks/${projectTaskId}/assisted-ops-phase`, { phase }).then((r) => r.data),
  meetings: (projectTaskId: string) =>
    api.get<AssistedOpMeeting[]>(`/projetos/tasks/${projectTaskId}/assisted-ops-meetings`).then((r) => r.data),
  createMeeting: (projectTaskId: string, data: AssistedOpMeetingInput) =>
    api.post<AssistedOpMeeting>(`/projetos/tasks/${projectTaskId}/assisted-ops-meetings`, data).then((r) => r.data),
  updateMeeting: (projectTaskId: string, meetingId: string, data: AssistedOpMeetingInput) =>
    api.put<AssistedOpMeeting>(`/projetos/tasks/${projectTaskId}/assisted-ops-meetings/${meetingId}`, data).then((r) => r.data),
  deleteMeeting: (projectTaskId: string, meetingId: string) =>
    api.delete(`/projetos/tasks/${projectTaskId}/assisted-ops-meetings/${meetingId}`).then(() => undefined),
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

// ── Portal: Soluções com IA ─────────────────────────────────────────────────

export interface AiSolutionFormField {
  key: string
  label: string
  field_type: string
  required: boolean
  placeholder: string | null
  options: { value: string; label: string }[]
}

export type AiSolutionClientAction = "ajustar" | "versao" | "homologar" | null

export interface AiSolutionSummary {
  task_id: string
  code_label: string
  title: string
  stage_key: string | null
  stage_name: string | null
  is_closed: boolean
  client_action: AiSolutionClientAction
  created_at: string | null
  updated_at: string | null
}

export interface AiSolutionDetail extends AiSolutionSummary {
  fields: { label: string; value: string }[]
  values: Record<string, string | null>
  versao_url: string | null
  repositorio_url: string | null
  homolog_url: string | null
  producao_url: string | null
  po_name: string | null
  comments: OccurrenceComment[]
  history: { stage_name: string | null; from_stage_name: string | null; moved_at: string | null }[]
  can_cancel: boolean
  /** Quem pediu pode mandar mensagem/agir; a equipe no Modo Cliente só lê. */
  can_interact: boolean
}

export const aiSolutionsPortalApi = {
  form: () => api.get<{ fields: AiSolutionFormField[] }>("/projetos/portal/ai-solutions/form").then((r) => r.data),
  list: () => api.get<AiSolutionSummary[]>("/projetos/portal/ai-solutions").then((r) => r.data),
  get: (id: string) => api.get<AiSolutionDetail>(`/projetos/portal/ai-solutions/${id}`).then((r) => r.data),
  create: (data: { title: string; values: Record<string, string | null> }) =>
    api.post<AiSolutionDetail>("/projetos/portal/ai-solutions", data).then((r) => r.data),
  resubmit: (id: string, data: { values: Record<string, string | null>; note?: string | null }) =>
    api.post<AiSolutionDetail>(`/projetos/portal/ai-solutions/${id}/resubmit`, data).then((r) => r.data),
  ready: (id: string, data: { versao_url: string; repositorio_url: string; note?: string | null }) =>
    api.post<AiSolutionDetail>(`/projetos/portal/ai-solutions/${id}/ready`, data).then((r) => r.data),
  homologate: (id: string, data: { approve: boolean; comment?: string | null }) =>
    api.post<AiSolutionDetail>(`/projetos/portal/ai-solutions/${id}/homologation`, data).then((r) => r.data),
  cancel: (id: string, reason: string) =>
    api.post<AiSolutionDetail>(`/projetos/portal/ai-solutions/${id}/cancel`, { reason }).then((r) => r.data),
  comment: (id: string, content: string) =>
    api.post<AiSolutionDetail>(`/projetos/portal/ai-solutions/${id}/comments`, { content }).then((r) => r.data),
}
