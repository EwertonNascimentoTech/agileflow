import api from "./client"

// ── Projetos ────────────────────────────────────────────────────────────────

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

export type FunnelAccessLevel = "manage" | "view" | "none"

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
  access_control: Record<string, FunnelAccessLevel> | null
  classification_enforcement_enabled: boolean
  created_at: string
  updated_at: string
}

export type PriorityMode = "edit" | "view" | "hidden"

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
  move_out_role_ids: string[] | null
  sla_hours: number | null
  sla_warning_pct: number
  priority_mode: PriorityMode
  priority_required: boolean
  classification_required: boolean
  cascade_children_on_move: boolean
  children_to_funnel_id: string | null
  grandchildren_to_funnel_id: string | null
  locks_schedule: boolean
  created_at: string
  updated_at: string
}

export type CardClassification = "desenvolvimento" | "implantacao" | "melhoria"

export interface ProjectUpload {
  object_name: string
  filename: string
  content_type: string
  size: number
}

export interface UsChecklistItem {
  id: string
  label: string
  done: boolean
  order: number
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
  planning_kind: string | null
  linked_program_id: string | null
  card_classification: CardClassification | null
  linked_product_id: string | null
  linked_release_id: string | null
  diretoria: string | null
  area: string | null
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  actual_hours: number | null
  percent_complete: number
  us_checklist?: UsChecklistItem[] | null
  us_impediment_active?: boolean
  us_codereview_active?: boolean
  order: number
  created_by: string | null
  completed_at: string | null
  left_backlog_at?: string | null
  status_entered_at: string | null
  sla_state: "none" | "ok" | "warning" | "breached"
  anexos?: ProjectUpload[] | null
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

export interface ProjectMyRequest extends ProjectTaskWithContext {
  children: ProjectTaskWithContext[]
  stages: ProjectMyRequestStage[]
  origin_request_id: string | null
}

export interface ProjectMyRequestStage {
  label: string
  funnel_id: string
  funnel_order: number
  task: ProjectTaskWithContext | null
  is_complete: boolean
  is_current: boolean
  is_pending: boolean
}

export interface ProjectTaskComment {
  id: string
  task_id: string
  author_id: string | null
  author_name: string | null
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

export type DefaultFormFieldKey =
  | "title"
  | "description"
  | "assigned_to"
  | "diretoria"
  | "area"
  | "start_date"
  | "due_date"
  | "anexos"

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

export type ProjectStageAgentKind = "ask" | "classify_and_advance"

export interface ProjectStageAgentBinding {
  id: string
  project_id: string
  funnel_id: string
  status_id: string
  name: string
  agent_kind: ProjectStageAgentKind
  agent_id: string
  usuario: string
  prompt_template: string
  gateway_url: string | null
  gateway_client_id: string | null
  has_gateway_client_secret: boolean
  continue_thread: boolean
  add_comment_on_success: boolean
  advance_to_status_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProjectStageAgentBindingInput {
  project_id: string
  funnel_id: string
  status_id: string
  name: string
  agent_kind?: ProjectStageAgentKind
  agent_id: string
  prompt_template: string
  continue_thread?: boolean
  add_comment_on_success?: boolean
  advance_to_status_id?: string | null
  is_active?: boolean
}

export interface ProjectProgram {
  id: string
  name: string
  description: string | null
  responsavel_person_id: string | null
  responsavel_nome: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProjectProgramInput {
  name: string
  description?: string | null
  responsavel_person_id?: string | null
  is_active?: boolean
}

export interface ProjectAgentExecution {
  id: string
  task_id: string
  binding_id: string
  status: string
  thread_id: string | null
  answer_message: string | null
  error_message: string | null
  created_at: string
}

export interface ProjectAgentExecutionLogItem {
  id: string
  task_id: string
  task_title: string
  binding_id: string
  agent_name: string
  agent_kind: ProjectStageAgentKind
  status_name: string
  status: string
  thread_id: string | null
  answer_message: string | null
  error_message: string | null
  request_payload: Record<string, unknown> | null
  response_payload: Record<string, unknown> | null
  created_at: string
}

export interface ProjectAgentExecutionLogPage {
  items: ProjectAgentExecutionLogItem[]
  total: number
  limit: number
  offset: number
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
  available_diretorias: string[]
  available_areas: string[]
}

export type UsDeliveryPeriod =
  | "today"
  | "tomorrow"
  | "this_week"
  | "next_week"
  | "this_month"
  | "next_month"

export interface UsDeliveryItem {
  id: string
  title: string
  project_id: string
  assigned_to: string | null
  due_date: string | null
  left_backlog_at: string | null
  completed_at: string | null
  is_overdue: boolean
}

export interface UsDeliveryAssigneeGroup {
  assignee_id: string | null
  assignee_name: string
  delivered: UsDeliveryItem[]
  overdue: UsDeliveryItem[]
  delivered_count: number
  overdue_count: number
}

export interface UsDeliveryReport {
  period: UsDeliveryPeriod
  range_start: string
  range_end: string
  by_assignee: UsDeliveryAssigneeGroup[]
  available_assignees: Array<{ id: string; name: string }>
}

// ── Layout do card (quadro) ─────────────────────────────────────────────────

export type CardFieldKey =
  | "demand_type"
  | "priority_quadrant"
  | "card_classification"
  | "schedule_sla"
  | "code"
  | "title"
  | "description"
  | "parent"
  | "children_progress"
  | "diretoria"
  | "area"
  | "due_date"
  | "assignee"
  | `form:${string}`

export interface ProjectCardField {
  id: string
  funnel_id: string
  field_key: CardFieldKey
  label: string
  is_visible: boolean
  order: number
}

export interface ProjectCardAvailableField {
  field_key: string
  label: string
  field_type: string
}

// ── Cronograma / Gantt ────────────────────────────────────────────────────────

export type DependencyType = "FS" | "SS" | "FF" | "SF"

export interface ProjectTaskDependency {
  id: string
  project_id: string
  predecessor_id: string
  successor_id: string
  dep_type: DependencyType
  lag_hours: number | string
  created_at: string
}

export interface CriticalPathItem {
  task_id: string
  is_critical: boolean
  total_float_hours: number
  free_float_hours: number
  late_start: string
  late_finish: string
}

// ── Controle de baseline / travamento do cronograma ──
export type ScheduleLockStateKind = "open" | "locked" | "revision"

export interface ScheduleLockState {
  root_task_id: string
  root_title: string | null
  state: ScheduleLockStateKind
  committed_at: string | null
  revision_open: boolean
  baseline_count: number
  latest_version: number | null
}

export interface ScheduleBaselineSnapshotTask {
  task_id: string
  title: string
  level: number
  parent_task_id?: string | null
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  percent_complete: number
  status_name: string | null
  assigned_to?: string | null
  assigned_to_name?: string | null
}

export interface ScheduleBaseline {
  id: string
  project_id: string
  root_task_id: string
  version: number
  justification: string
  snapshot: {
    tasks: ScheduleBaselineSnapshotTask[]
    dependencies: Array<{ predecessor_id: string; successor_id: string; dep_type: string; lag_hours: number }>
  }
  created_by: string | null
  created_at: string
}

export interface WorkloadCellItem {
  project_name: string
  task_title: string
  hours: number
}

export interface WorkloadCell {
  user_id: string
  date: string
  allocated_hours: number
  capacity_hours: number
  overallocated: boolean
  items?: WorkloadCellItem[]
}

export interface WorkloadResponse {
  unit: "day" | "week"
  cells: WorkloadCell[]
}

// ── Cockpit de capacidade (cross-project) ──
export interface CapacityPersonMeta {
  id: string
  full_name: string
  position_slug: string | null
  position_label: string | null
  area_ids: string[]
}

export interface CapacitySummary {
  overallocated_cells: number
  persons_over: number
  total_capacity_h: number
  total_allocated_h: number
  unmapped_assignees: string[]
}

export interface CapacityHeatmapResponse {
  unit: "day" | "week"
  cells: WorkloadCell[]
  persons: CapacityPersonMeta[]
  summary: CapacitySummary
}

export interface CapacityProjectRow {
  project_id: string
  project_name: string
  demand_hours: number
  capacity_hours: number
  people_count: number
  overloaded_people: number
  overallocated: boolean
}

export interface CapacityByProjectResponse {
  rows: CapacityProjectRow[]
}

export interface CapacityGapRow {
  group_type: "position" | "area"
  group_key: string
  group_label: string
  people_count: number
  capacity_hours: number
  allocated_hours: number
  deficit_hours: number
  peak_week: string | null
  peak_deficit_hours: number
  suggested_headcount: number
}

export interface CapacityGapsResponse {
  rows: CapacityGapRow[]
}

export interface FreePersonRow {
  person_id: string
  full_name: string
  position_slug: string | null
  position_label: string | null
  area_ids: string[]
  stacks: string[]
  capacity_hours_total: number
  allocated_hours_total: number
  free_hours_total: number
  free_days: number
  utilization_pct: number
  next_absence: string | null
}

export interface FreePeopleResponse {
  rows: FreePersonRow[]
}

// ── Fase 2: simulador what-if ──
export interface SimTaskMeta {
  task_id: string
  title: string
  project_name: string
  assigned_to: string | null
  assignee_name: string | null
  start_date: string
  due_date: string
  estimated_hours: number
}

export interface SimTasksResponse {
  tasks: SimTaskMeta[]
}

export interface ScenarioMutation {
  op: "move_task" | "reassign" | "scale_hours" | "remove_person" | "add_freelancer"
  task_id?: string
  new_start?: string
  new_due?: string
  new_person_id?: string
  factor?: number
  person_id?: string
  freelancer_name?: string
  daily_hours?: number
  assign_task_ids?: string[]
}

export interface ScenarioRequest {
  date_from: string
  date_to: string
  mutations: ScenarioMutation[]
}

export interface ScenarioDiff {
  before_over_cells: number
  after_over_cells: number
  before_persons_over: number
  after_persons_over: number
  resolved_cells: number
  new_cells: number
  before_allocated_h: number
  after_allocated_h: number
  before_capacity_h: number
  after_capacity_h: number
}

export interface ScenarioResult {
  before: CapacityHeatmapResponse
  after: CapacityHeatmapResponse
  diff: ScenarioDiff
}

// ── Simulador inteligente: cenários auto-gerados ──
export interface SuggestedScenario {
  id: string
  title: string
  description: string
  kind: "reassign" | "freelancer" | "defer" | "combo"
  cost_tag: "gratis" | "custo" | "prazo"
  target_person_name: string | null
  mutations: ScenarioMutation[]
  resolved_cells: number
  new_cells: number
  before_over_cells: number
  after_over_cells: number
  persons_over_before: number
  persons_over_after: number
}

export interface ScenarioSuggestionsResponse {
  has_overload: boolean
  rows: SuggestedScenario[]
}

// ── Vazamento entre times (cross-team) ──
export interface CrossTeamAwayItem {
  team_area_id: string | null
  team_name: string
  hours: number
}

export interface CrossTeamPersonRow {
  person_id: string
  full_name: string
  position_label: string | null
  home_area_ids: string[]
  home_area_names: string[]
  home_hours: number
  away_hours: number
  undefined_hours: number
  total_hours: number
  away_pct: number
  at_risk: boolean
  away_by_team: CrossTeamAwayItem[]
}

export interface CrossTeamResponse {
  rows: CrossTeamPersonRow[]
}

export interface AssigneeAbsenceItem {
  start_date: string
  end_date: string
  type_name: string
  status: string
  partial_hours: number | null
}

export interface AssigneeAbsencesResponse {
  by_user: Record<string, AssigneeAbsenceItem[]>
}

export interface TaskImportResult {
  features_created: number
  us_created: number
  skipped: number
  warnings: string[]
}

// ── Priorização ─────────────────────────────────────────────────────────────

export type QuadrantCode = "quick_win" | "big_bet" | "fill_in" | "money_pit"

export interface PriorityScalePoint {
  value: number
  description: string
}

export interface PriorityCriterion {
  id: string
  axis: "impact" | "effort"
  code: string
  label: string
  weight: number
  scale: PriorityScalePoint[]
  order: number
  is_active: boolean
}

export interface PriorityPillar {
  id: string
  code: string
  label: string
  perspective: string
  modifier: number
  color: string
  order: number
  is_active: boolean
}

export interface PriorityConfidenceLevel {
  id: string
  code: string
  label: string
  divisor: number
  order: number
  is_active: boolean
}

export interface PriorityQuadrant {
  id: string
  code: QuadrantCode
  label: string
  color: string
  action_hint: string | null
  order: number
}

export interface PrioritySettings {
  id: string
  impact_cut: number
  effort_cut: number
  confidence_id: string | null
  is_enabled: boolean
}

export interface PriorityMatrixItem {
  task_id: string
  title: string
  impacto_efetivo: number
  esforco: number
  quadrant_code: QuadrantCode
  pillar_code: string | null
  perspective: string | null
  color: string | null
  priority_rank: number | null
}

export interface PriorityScore {
  id: string
  task_id: string
  pillar_id: string | null
  pillar_ids: string[]
  confidence_id: string | null
  impact_scores: Record<string, number>
  effort_scores: Record<string, number>
  impacto_bruto: number
  modulador: number
  divisor: number
  impacto_efetivo: number
  esforco: number
  quadrant_code: QuadrantCode
  scored_by: string | null
  scored_at: string
}

export interface PriorityScoreHistoryItem {
  id: string
  task_id: string
  pillar_ids: string[]
  impact_scores: Record<string, number>
  effort_scores: Record<string, number>
  impacto_efetivo: number
  esforco: number
  quadrant_code: QuadrantCode
  scored_by: string | null
  scored_at: string
}

export interface PriorityScoreInput {
  pillar_ids?: string[]
  pillar_id?: string | null
  impact_scores: Record<string, number>
  effort_scores: Record<string, number>
}

export interface PriorityComputeResult {
  impacto_bruto: number
  modulador: number
  divisor: number
  impacto_efetivo: number
  esforco: number
  quadrant_code: QuadrantCode
}

// ── Painel PO / Portfólio ─────────────────────────────────────────────────────

export interface PendingStage {
  funnel_name: string
  status_name: string
  status_entered_at: string | null
}

export interface PoPortfolioItem {
  task_id: string
  title: string
  project_id: string
  planning_kind: string
  description: string | null
  demand_type_id: string | null
  start_date: string | null
  due_date: string | null
  next_due_date: string | null
  pending_stages: PendingStage[]
  quadrant_code: QuadrantCode | null
  impacto_efetivo: number | null
  esforco: number | null
  priority_rank: number | null
  pillar_code: string | null
  perspective: string | null
  color: string | null
  progress_pct: number
  expected_progress_pct: number | null
  subtree_total: number
  subtree_completed: number
  overdue: boolean
  breached_count: number
  absence_conflict: boolean
  unscored: boolean
  no_due_date: boolean
  critical_count: number
  blocked_count: number
  overallocated_users: string[]
  on_time_completed: number
  completed_count: number
  est_hours: number
  actual_hours: number
  avg_lead_time_days: number | null
  health: "verde" | "amarelo" | "vermelho"
}

export interface PoPortfolioAggregates {
  rag: { verde: number; amarelo: number; vermelho: number }
  total_projetos: number
  total_programas: number
  on_time_pct: number | null
  avg_progress_pct: number | null
  capacity_vs_demand: Record<string, number>
}

export interface PoPortfolioResponse {
  po_id: string | null
  items: PoPortfolioItem[]
  aggregates: PoPortfolioAggregates
  available_diretorias: string[]
  available_areas: string[]
}

export interface PoOption {
  person_id: string
  user_id: string | null
  full_name: string
  has_login: boolean
}

export interface PoOverviewItem {
  po_id: string
  full_name: string
  total_projetos: number
  total_programas: number
  rag: { verde: number; amarelo: number; vermelho: number }
  on_time_pct: number | null
  avg_progress_pct: number | null
  overallocated_user_days: number
}

export interface PoOverviewResponse {
  items: PoOverviewItem[]
  available_diretorias: string[]
  available_areas: string[]
}

// ── Status Report ───────────────────────────────────────────────────────────

export interface StatusReportMeta {
  diretoria: string | null
  area: string | null
  diretoria_label: string | null
  area_label: string | null
  generated_at: string
}

export interface StatusReportKpis {
  total: number
  concluido: number
  planejado: number
  sem_data: number
  avg_progress_pct: number | null
}

export interface StatusReportCustomField {
  label: string
  field_type: string
  value: string
}

export interface StatusReportCustomSection {
  title: string
  fields: StatusReportCustomField[]
}

export interface StatusReportRisk {
  ponto: string
  impacto: string
  acao: string
}

export interface StatusReportOpenStage {
  title: string
  kanban: string | null
  stage: string | null
  is_root: boolean
}

export interface StatusReportScheduleItem {
  title: string
  level?: number
  status: string | null
  kanban: string | null
  open: boolean
  percent: number
  planned_date: string | null
  completed_at: string | null
  responsavel: string | null
}

export interface StatusReportProject {
  task_id: string
  project_id: string
  title: string
  description: string | null
  planning_kind: string
  fase: string | null
  health: "verde" | "amarelo" | "vermelho"
  progress_pct: number
  expected_progress_pct: number | null
  start_date: string | null
  due_date: string | null
  next_due_date: string | null
  responsavel: string | null
  subtree_total: number
  subtree_completed: number
  no_due_date: boolean
  entregas_realizadas: Array<{ title: string; responsavel: string | null; completed_at: string | null }>
  proximas_atividades: Array<{ title: string; responsavel: string | null; previsao: string | null; status: string | null }>
  cronograma: StatusReportScheduleItem[]
  open_stages: StatusReportOpenStage[]
  riscos: StatusReportRisk[]
  custom_sections: StatusReportCustomSection[]
  objetivo: string
  resumo_executivo: string
  decisoes: string[]
}

export interface StatusReportSnapshot {
  meta: StatusReportMeta
  kpis: StatusReportKpis
  projects: StatusReportProject[]
  plano: { d30: string; d60: string; d90: string }
}

export interface StatusReportListItem {
  id: string
  diretoria: string | null
  area: string | null
  diretoria_label: string | null
  area_label: string | null
  title: string
  kpis: StatusReportKpis
  generated_by: string | null
  generated_at: string
}

export interface StatusReportResponse extends StatusReportListItem {
  snapshot: StatusReportSnapshot
}

// ── PO Sync (análise de portfólio para a cerimônia) ─────────────────────────────
export type PoSyncFase = "planejamento" | "execucao" | "encerramento"

export interface PoSyncOption {
  value: string
  label: string
}

export interface PoSyncProjeto {
  task_id: string
  title: string
  planning_kind: string
  po_id: string | null
  po: string | null
  fase: PoSyncFase
  stage_name: string | null
  exec_pct: number | null
  health: "verde" | "vermelho"
  overdue: boolean
  diretoria: string | null
  diretoria_label: string | null
  start_date: string | null
  due_date: string | null
  completed_at: string | null
  comparable: boolean
  prazo_status: "no_prazo" | "atrasado" | "sem_baseline"
  atraso_dias: number | null
  subtree_total: number
  subtree_completed: number
  backlog_montado: boolean
  sem_datas_planejadas: boolean
  baseline_inconsistente: boolean
  sem_diretoria: boolean
}

export interface PoSyncKpis {
  total: number
  planejamento: number
  execucao: number
  encerramento: number
  avg_exec_pct: number | null
  em_risco: number
  atrasados: number
}

export interface PoSyncPrazoBlock {
  avaliaveis: number
  no_prazo: number
  atrasados: number
  atraso_medio: number | null
  atraso_mediana: number | null
  pct_atrasados: number | null
}

export interface PoSyncOutlier {
  title: string
  po: string | null
  projeto: string
  nivel: "projeto" | "item"
  planejada: string | null
  real: string | null
  atraso_dias: number | null
}

export interface PoSyncResponse {
  meta: {
    generated_at: string | null
    diretoria: string | null
    area: string | null
    diretoria_label: string | null
    area_label: string | null
  }
  capa: {
    total_projetos: number
    total_programas: number
    total_pos: number
    total_itens: number
    total_concluidos: number
  }
  panorama: {
    fases: { planejamento: number; execucao: number; encerramento: number }
    backlog_sem_execucao: number
    avg_exec_pct: number | null
  }
  prazo: {
    projetos: PoSyncPrazoBlock | null
    itens: PoSyncPrazoBlock | null
    sem_datas_comparaveis: number
  }
  ranking_pos: Array<{ po_id: string | null; full_name: string | null } & PoSyncKpis>
  por_po: Array<{
    po_id: string | null
    full_name: string | null
    kpis: PoSyncKpis
    projetos: PoSyncProjeto[]
  }>
  por_diretoria: Array<{
    diretoria_label: string
    total: number
    planejamento: number
    execucao: number
    encerramento: number
    avg_exec_pct: number | null
    em_risco: number
    sem_baseline: boolean
  }>
  maiores_atrasos: PoSyncOutlier[]
  baseline_gaps: {
    sem_datas_comparaveis: number
    sem_datas_planejadas: number
    baseline_inconsistente: number
    sem_diretoria: number
    total_projetos: number
  } | null
  proximos_passos: string[]
  saude_produtos: {
    por_po: PoSyncSaudeProdutosPo[]
    resumo: {
      total_produtos: number
      media_score: number
      producao: PoSyncSaudeProdutosFaixa
      desenvolvimento: PoSyncSaudeProdutosFaixa
      outros: PoSyncSaudeProdutosFaixa
      distribuicao: { saudavel: number; atencao: number; critico: number }
    }
  }
  available_diretorias: PoSyncOption[]
  available_areas: PoSyncOption[]
}

export interface PoSyncSaudeProdutosFaixa {
  total: number
  score_medio: number | null
}

export interface PoSyncSaudeProdutosPo {
  po_id: string | null
  full_name: string
  total: number
  score_medio: number
  producao: PoSyncSaudeProdutosFaixa
  desenvolvimento: PoSyncSaudeProdutosFaixa
  outros: PoSyncSaudeProdutosFaixa
  saudavel: number
  atencao: number
  critico: number
}

// ── API client ────────────────────────────────────────────────────────────────

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
    api.get<ProjectMyRequest[]>(`/projetos/me/requests`).then((r) => r.data),
  listAllTasks: (projectId?: string) =>
    api.get<ProjectTaskWithContext[]>(`/projetos/tasks`, { params: projectId ? { project_id: projectId } : undefined }).then((r) => r.data),

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
    access_control?: Record<string, FunnelAccessLevel> | null
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
    access_control: Record<string, FunnelAccessLevel> | null
    classification_enforcement_enabled: boolean
  }>) => api.patch<ProjectFunnel>(`/projetos/projects/${projectId}/funnels/${funnelId}`, data).then((r) => r.data),
  getUnclassifiedPastBacklogCount: (projectId: string, funnelId: string) =>
    api.get<{ count: number }>(`/projetos/projects/${projectId}/funnels/${funnelId}/unclassified-count`).then((r) => r.data),
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
    updates_origin_status_id?: string | null
    move_in_role_ids?: string[] | null
    sla_hours?: number | null
    sla_warning_pct?: number
    priority_mode?: PriorityMode
    priority_required?: boolean
    classification_required?: boolean
    cascade_children_on_move?: boolean
    children_to_funnel_id?: string | null
    grandchildren_to_funnel_id?: string | null
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
    priority_mode: PriorityMode
    priority_required: boolean
    classification_required: boolean
    cascade_children_on_move: boolean
    children_to_funnel_id: string | null
    grandchildren_to_funnel_id: string | null
    locks_schedule: boolean
  }>) => api.patch<ProjectStatus>(`/projetos/projects/${projectId}/funnels/${funnelId}/statuses/${statusId}`, data).then((r) => r.data),
  reorderStatuses: (projectId: string, funnelId: string, items: Array<{ id: string; order: number }>) =>
    api.patch<ProjectStatus[]>(`/projetos/projects/${projectId}/funnels/${funnelId}/statuses/reorder`, { items }).then((r) => r.data),
  deleteStatus: (projectId: string, funnelId: string, statusId: string) =>
    api.delete<void>(`/projetos/projects/${projectId}/funnels/${funnelId}/statuses/${statusId}`).then((r) => r.data),

  listTasks: (projectId: string, params?: { status_id?: string; assigned_to?: string }) =>
    api.get<ProjectTask[]>(`/projetos/projects/${projectId}/tasks`, { params }).then((r) => r.data),
  listPrograms: (projectId: string) =>
    api.get<{ id: string; name: string }[]>(`/projetos/projects/${projectId}/programs`).then((r) => r.data),
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
    estimated_hours?: number | null
    actual_hours?: number | null
    percent_complete?: number
    order?: number
    anexos?: ProjectUpload[] | null
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
    estimated_hours: number | null
    actual_hours: number | null
    percent_complete: number
    order: number
    anexos: ProjectUpload[] | null
    form_values: Record<string, unknown>
    conversion_title: string
    conversion_kind: string | null
    conversion_description: string | null
    conversion_items: Array<{ title: string; description?: string | null; start_date?: string | null; due_date?: string | null }>
    conversion_assigned_to: string | null
    conversion_program_id: string | null
    card_classification: CardClassification | null
    linked_product_id: string | null
    linked_release_id: string | null
    us_checklist: UsChecklistItem[] | null
  }>) => api.patch<ProjectTask>(`/projetos/projects/${projectId}/tasks/${taskId}`, data).then((r) => r.data),
  setPlanningClassification: (projectId: string, taskId: string, data: {
    kind: "projeto" | "programa"
    program_id?: string | null
    new_program_name?: string | null
    new_program_desc?: string | null
  }) => api.patch<ProjectTask>(`/projetos/projects/${projectId}/tasks/${taskId}/planning-classification`, data).then((r) => r.data),
  deleteTask: (projectId: string, taskId: string) =>
    api.delete<void>(`/projetos/projects/${projectId}/tasks/${taskId}`).then((r) => r.data),
  reorderTasks: (projectId: string, items: Array<{ id: string; order: number }>) =>
    api.patch<ProjectTask[]>(`/projetos/projects/${projectId}/tasks/reorder`, { items }).then((r) => r.data),
  listTaskChildren: (projectId: string, taskId: string) =>
    api.get<ProjectTask[]>(`/projetos/projects/${projectId}/tasks/${taskId}/children`).then((r) => r.data),
  createScheduleStage: (projectId: string, parentTaskId: string, data: {
    title: string
    start_date?: string | null
    due_date?: string | null
  }) => api.post<ProjectTask>(`/projetos/projects/${projectId}/tasks/${parentTaskId}/schedule-stages`, data).then((r) => r.data),

  listDependencies: (projectId: string) =>
    api.get<ProjectTaskDependency[]>(`/projetos/projects/${projectId}/dependencies`).then((r) => r.data),
  createDependency: (projectId: string, data: {
    predecessor_id: string
    successor_id: string
    dep_type?: DependencyType
    lag_hours?: number
  }) => api.post<ProjectTaskDependency>(`/projetos/projects/${projectId}/dependencies`, data).then((r) => r.data),
  deleteDependency: (projectId: string, depId: string) =>
    api.delete<void>(`/projetos/projects/${projectId}/dependencies/${depId}`).then((r) => r.data),
  getWorkload: (projectId: string, params?: { unit?: "day" | "week"; from?: string; to?: string }) =>
    api.get<WorkloadResponse>(`/projetos/projects/${projectId}/workload`, { params }).then((r) => r.data),
  getCapacityHeatmap: (params: { from: string; to: string; unit?: "day" | "week"; area?: string; position?: string }) =>
    api.get<CapacityHeatmapResponse>(`/projetos/capacity/heatmap`, { params }).then((r) => r.data),
  getCapacityByProject: (params: { from: string; to: string; area?: string }) =>
    api.get<CapacityByProjectResponse>(`/projetos/capacity/by-project`, { params }).then((r) => r.data),
  getCapacityGaps: (params: { from: string; to: string; group_by?: "position" | "area" }) =>
    api.get<CapacityGapsResponse>(`/projetos/capacity/gaps`, { params }).then((r) => r.data),
  getAvailablePeople: (params: {
    from: string
    to: string
    position?: string
    area?: string
    stack?: string
    min_level?: string
    min_free_hours?: number
  }) => api.get<FreePeopleResponse>(`/projetos/capacity/available-people`, { params }).then((r) => r.data),
  getSimulatableTasks: (params: { from: string; to: string }) =>
    api.get<SimTasksResponse>(`/projetos/capacity/tasks`, { params }).then((r) => r.data),
  simulateScenario: (payload: ScenarioRequest) =>
    api.post<ScenarioResult>(`/projetos/capacity/simulate`, payload).then((r) => r.data),
  getCrossTeam: (params: { from: string; to: string }) =>
    api.get<CrossTeamResponse>(`/projetos/capacity/cross-team`, { params }).then((r) => r.data),
  getScenarioSuggestions: (params: { from: string; to: string }) =>
    api.get<ScenarioSuggestionsResponse>(`/projetos/capacity/suggest-scenarios`, { params }).then((r) => r.data),
  getCriticalPath: (projectId: string, rootTaskId: string) =>
    api.get<CriticalPathItem[]>(`/projetos/projects/${projectId}/critical-path`, { params: { root: rootTaskId } }).then((r) => r.data),
  getAssigneeAbsences: (projectId: string) =>
    api.get<AssigneeAbsencesResponse>(`/projetos/projects/${projectId}/assignee-absences`).then((r) => r.data),

  // Controle de baseline / travamento do cronograma.
  getScheduleLock: (projectId: string, rootTaskId: string) =>
    api.get<ScheduleLockState>(`/projetos/projects/${projectId}/schedule-lock`, { params: { root: rootTaskId } }).then((r) => r.data),
  getScheduleLocks: (projectId: string) =>
    api.get<ScheduleLockState[]>(`/projetos/projects/${projectId}/schedule-locks`).then((r) => r.data),
  getScheduleLockForTask: (projectId: string, taskId: string) =>
    api.get<ScheduleLockState>(`/projetos/projects/${projectId}/schedule-lock-for-task`, { params: { task: taskId } }).then((r) => r.data),
  listBaselines: (projectId: string, rootTaskId: string) =>
    api.get<ScheduleBaseline[]>(`/projetos/projects/${projectId}/baselines`, { params: { root: rootTaskId } }).then((r) => r.data),
  saveBaseline: (projectId: string, data: { root_task_id: string; justification: string }) =>
    api.post<ScheduleBaseline>(`/projetos/projects/${projectId}/baselines`, data).then((r) => r.data),
  closeScheduleRevision: (projectId: string, rootTaskId: string) =>
    api.post<ScheduleLockState>(`/projetos/projects/${projectId}/baselines/close-revision`, { root_task_id: rootTaskId }).then((r) => r.data),

  listPlanningNodes: (projectId: string) =>
    api.get<ProjectTask[]>(`/projetos/projects/${projectId}/planning-nodes`).then((r) => r.data),
  importTasks: (
    projectId: string,
    file: File,
    featureStatusId: string,
    usStatusId?: string,
    parentTaskId?: string,
  ) => {
    const fd = new FormData()
    fd.append("file", file)
    fd.append("target_status_id", featureStatusId)
    if (usStatusId) fd.append("us_status_id", usStatusId)
    if (parentTaskId) fd.append("parent_task_id", parentTaskId)
    return api.post<TaskImportResult>(`/projetos/projects/${projectId}/import-tasks`, fd).then((r) => r.data)
  },
  downloadImportTemplate: (projectId: string) =>
    api.get(`/projetos/projects/${projectId}/import-template`, { responseType: "blob" }).then((r) => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement("a")
      a.href = url
      a.download = "modelo-importacao-features-us.xlsx"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }),

  getProjectFormValues: (projectId: string) =>
    api.get<Record<string, Record<string, unknown>>>(`/projetos/projects/${projectId}/form-values`).then((r) => r.data),

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

  getReports: (params?: { po?: string | null; diretoria?: string | null; area?: string | null }) =>
    api.get<ProjectReports>(`/projetos/reports`, {
      params: {
        ...(params?.po ? { po: params.po } : {}),
        ...(params?.diretoria ? { diretoria: params.diretoria } : {}),
        ...(params?.area ? { area: params.area } : {}),
      },
    }).then((r) => r.data),

  getUsDeliveryReport: (params?: { period?: UsDeliveryPeriod; assignee?: string | null }) =>
    api.get<UsDeliveryReport>(`/projetos/reports/us-delivery`, {
      params: {
        period: params?.period ?? "today",
        ...(params?.assignee ? { assignee: params.assignee } : {}),
      },
    }).then((r) => r.data),

  listPos: () =>
    api.get<PoOption[]>(`/projetos/pos`).then((r) => r.data),
  getPoPortfolio: (poId?: string, filters?: { diretoria?: string | null; area?: string | null }) =>
    api.get<PoPortfolioResponse>(`/projetos/po-portfolio`, {
      params: {
        ...(poId ? { po_id: poId } : {}),
        ...(filters?.diretoria ? { diretoria: filters.diretoria } : {}),
        ...(filters?.area ? { area: filters.area } : {}),
      },
    }).then((r) => r.data),
  getPoOverview: (filters?: { diretoria?: string | null; area?: string | null }) =>
    api.get<PoOverviewResponse>(`/projetos/po-portfolio/overview`, {
      params: {
        ...(filters?.diretoria ? { diretoria: filters.diretoria } : {}),
        ...(filters?.area ? { area: filters.area } : {}),
      },
    }).then((r) => r.data),

  previewStatusReport: (params: { diretoria?: string | null; area?: string | null }) =>
    api.post<StatusReportSnapshot>(`/projetos/status-reports/preview`, {
      diretoria: params.diretoria ?? null,
      area: params.area ?? null,
    }).then((r) => r.data),
  createStatusReport: (data: {
    diretoria?: string | null
    area?: string | null
    diretoria_label?: string | null
    area_label?: string | null
    title: string
    snapshot: StatusReportSnapshot
    kpis?: StatusReportKpis
  }) => api.post<StatusReportResponse>(`/projetos/status-reports`, data).then((r) => r.data),
  listStatusReports: (params?: { diretoria?: string | null; area?: string | null }) =>
    api.get<StatusReportListItem[]>(`/projetos/status-reports`, {
      params: {
        ...(params?.diretoria ? { diretoria: params.diretoria } : {}),
        ...(params?.area ? { area: params.area } : {}),
      },
    }).then((r) => r.data),
  getStatusReport: (reportId: string) =>
    api.get<StatusReportResponse>(`/projetos/status-reports/${reportId}`).then((r) => r.data),

  // Análise de portfólio para a cerimônia PO Sync (read-only, recortável por diretoria/área).
  getPoSync: (params?: { diretoria?: string | null; area?: string | null }) =>
    api.get<PoSyncResponse>(`/projetos/po-sync`, {
      params: {
        ...(params?.diretoria ? { diretoria: params.diretoria } : {}),
        ...(params?.area ? { area: params.area } : {}),
      },
    }).then((r) => r.data),

  uploadFile: (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    return api.post<ProjectUpload>(`/projetos/uploads`, fd).then((r) => r.data)
  },
  getUploadUrl: (objectName: string) =>
    api.get<{ url: string }>(`/projetos/uploads/url`, { params: { object_name: objectName } }).then((r) => r.data.url),

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

  listStageAgents: (projectId?: string) =>
    api.get<ProjectStageAgentBinding[]>(`/projetos/config/stage-agents`, {
      params: projectId ? { project_id: projectId } : undefined,
    }).then((r) => r.data),
  createStageAgent: (data: ProjectStageAgentBindingInput) =>
    api.post<ProjectStageAgentBinding>(`/projetos/config/stage-agents`, data).then((r) => r.data),
  updateStageAgent: (bindingId: string, data: Partial<Omit<ProjectStageAgentBindingInput, "project_id" | "funnel_id" | "status_id">>) =>
    api.patch<ProjectStageAgentBinding>(`/projetos/config/stage-agents/${bindingId}`, data).then((r) => r.data),
  deleteStageAgent: (bindingId: string) =>
    api.delete<void>(`/projetos/config/stage-agents/${bindingId}`).then((r) => r.data),

  // Cadastro próprio de Programas (catálogo do tenant).
  listProgramCatalog: (activeOnly = false) =>
    api.get<ProjectProgram[]>(`/projetos/programs`, { params: activeOnly ? { active_only: true } : undefined }).then((r) => r.data),
  createProgram: (data: ProjectProgramInput) =>
    api.post<ProjectProgram>(`/projetos/programs`, data).then((r) => r.data),
  updateProgram: (programId: string, data: Partial<ProjectProgramInput>) =>
    api.patch<ProjectProgram>(`/projetos/programs/${programId}`, data).then((r) => r.data),
  deleteProgram: (programId: string) =>
    api.delete<void>(`/projetos/programs/${programId}`).then((r) => r.data),
  listTaskAgentExecutions: (taskId: string) =>
    api.get<ProjectAgentExecution[]>(`/projetos/tasks/${taskId}/agent-executions`).then((r) => r.data),
  listAgentExecutionLogs: (params?: {
    status?: "pending" | "success" | "failed"
    binding_id?: string
    limit?: number
    offset?: number
  }) =>
    api.get<ProjectAgentExecutionLogPage>(`/projetos/config/agent-executions`, { params }).then((r) => r.data),

  listCardFields: (funnelId: string) =>
    api.get<ProjectCardField[]>(`/projetos/config/card-fields`, { params: { funnel_id: funnelId } }).then((r) => r.data),
  listAvailableCardFields: (funnelId: string) =>
    api.get<ProjectCardAvailableField[]>(`/projetos/config/card-fields/available`, { params: { funnel_id: funnelId } }).then((r) => r.data),
  saveCardFields: (funnelId: string, fields: Array<{ field_key: string; label: string; is_visible: boolean; order: number }>) =>
    api.put<ProjectCardField[]>(`/projetos/config/card-fields`, { fields }, { params: { funnel_id: funnelId } }).then((r) => r.data),

  getPrioritySettings: () =>
    api.get<PrioritySettings>(`/projetos/config/priority/settings`).then((r) => r.data),
  updatePrioritySettings: (data: {
    impact_cut: number
    effort_cut: number
    confidence_id?: string | null
    is_enabled: boolean
  }) => api.put<PrioritySettings>(`/projetos/config/priority/settings`, data).then((r) => r.data),
  listPriorityCriteria: () =>
    api.get<PriorityCriterion[]>(`/projetos/config/priority/criteria`).then((r) => r.data),
  savePriorityCriteria: (criteria: Array<Omit<PriorityCriterion, "id">>) =>
    api.put<PriorityCriterion[]>(`/projetos/config/priority/criteria`, { criteria }).then((r) => r.data),
  listPriorityPillars: () =>
    api.get<PriorityPillar[]>(`/projetos/config/priority/pillars`).then((r) => r.data),
  savePriorityPillars: (pillars: Array<Omit<PriorityPillar, "id">>) =>
    api.put<PriorityPillar[]>(`/projetos/config/priority/pillars`, { pillars }).then((r) => r.data),
  listPriorityConfidence: () =>
    api.get<PriorityConfidenceLevel[]>(`/projetos/config/priority/confidence-levels`).then((r) => r.data),
  savePriorityConfidence: (levels: Array<Omit<PriorityConfidenceLevel, "id">>) =>
    api.put<PriorityConfidenceLevel[]>(`/projetos/config/priority/confidence-levels`, { levels }).then((r) => r.data),
  listPriorityQuadrants: () =>
    api.get<PriorityQuadrant[]>(`/projetos/config/priority/quadrants`).then((r) => r.data),
  savePriorityQuadrants: (quadrants: Array<Omit<PriorityQuadrant, "id">>) =>
    api.put<PriorityQuadrant[]>(`/projetos/config/priority/quadrants`, { quadrants }).then((r) => r.data),
  priorityMatrix: (params?: { funnel_id?: string; quadrant?: string; pillar_id?: string }) =>
    api.get<PriorityMatrixItem[]>(`/projetos/priority/matrix`, { params }).then((r) => r.data),
  getTaskPriority: (taskId: string) =>
    api.get<PriorityScore | null>(`/projetos/tasks/${taskId}/priority`).then((r) => r.data),
  getTaskPriorityHistory: (taskId: string) =>
    api.get<PriorityScoreHistoryItem[]>(`/projetos/tasks/${taskId}/priority/history`).then((r) => r.data),
  saveTaskPriority: (taskId: string, data: PriorityScoreInput) =>
    api.put<PriorityScore>(`/projetos/tasks/${taskId}/priority`, data).then((r) => r.data),
  deleteTaskPriority: (taskId: string) =>
    api.delete<void>(`/projetos/tasks/${taskId}/priority`).then((r) => r.data),
  previewTaskPriority: (taskId: string, data: PriorityScoreInput) =>
    api.post<PriorityComputeResult>(`/projetos/tasks/${taskId}/priority/preview`, data).then((r) => r.data),
}
