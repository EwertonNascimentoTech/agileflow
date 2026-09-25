import api from "./client"

// ── Portal do Cliente: portfólio, programas, entregas ───────────────────────

export type PortalHealth = "no_prazo" | "atencao" | "critico" | "concluido"
export type PortalStatus = "planejamento" | "execucao" | "concluido" | "impedimento" | "pausado" | "cancelado"
export type PortalItemStatus = "concluida" | "impedimento" | "atrasado" | "nao_iniciada" | "no_prazo" | "andamento"
export type PortalPhase = "planejamento" | "desenvolvimento" | "homologacao" | "producao" | "concluido" | "impedimento"
export type RoadmapPhase =
  | "planejamento"
  | "desenvolvimento"
  | "homologacao"
  | "producao"
  | "operacao_assistida"
  | "concluido"
  | "impedimento"
  | "cancelado"
export type QuadrantCode = "quick_win" | "big_bet" | "fill_in" | "money_pit"

export interface PortalQuadrant {
  code: QuadrantCode
  label: string
  color: string
  action_hint: string | null
}

export interface PortalCriterion {
  label: string
  weight: number
  scale: { value: number; description: string }[]
}

export interface PortalMilestone {
  title: string
  date: string
  project_title?: string
  task_id?: string
}

export interface PortalProjectSummary {
  task_id: string
  title: string
  subtitle: string | null
  planning_kind: string | null
  program_id: string | null
  program_name: string | null
  pillar_id: string | null
  area: string | null
  area_label: string | null
  quadrant_code: QuadrantCode | null
  impact: number | null
  effort: number | null
  hours: number
  phase: PortalPhase
  roadmap_phase: RoadmapPhase
  stage_name: string | null
  status: PortalStatus
  item_status: PortalItemStatus
  health: PortalHealth
  exec_pct: number
  next_milestone: PortalMilestone | null
  start_date: string | null
  due_date: string | null
  delivered_at: string | null
  in_assisted_operation: boolean
  cancelled: boolean
  po_name: string | null
  feature_count: number
  feature_done: number
  story_count: number
  story_done: number
  updated_at: string | null
  /** "projeto": vínculo direto (cliente, PO ou dev); "programa": pelo programa; "todos": coordenação. */
  access: "programa" | "projeto" | "todos"
  role_label: string | null
}

export interface PortalAggregate {
  project_count: number
  exec_avg: number | null
  /** Pontos percentuais ganhos desde o mês passado (null sem histórico). */
  exec_delta: number | null
  health: PortalHealth
  status: PortalStatus
  quadrant_code: QuadrantCode | null
  impact: number | null
  effort: number | null
  hours: number
  next_milestone: PortalMilestone | null
  phase_counts: Partial<Record<PortalPhase, number>>
  updated_at: string | null
}

export interface PortalPerson {
  name: string
  position: string | null
}

export interface PortalProgramSummary extends PortalAggregate {
  id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  owner: PortalPerson | null
  pillar_count: number
  /** "programa": vínculo com o programa (vê tudo); "projetos": só alguns projetos dele. */
  access: "programa" | "projetos"
  role_label: string | null
}

/** Quem vê: cliente ou equipe em "modo cliente" (coordenação vê todos os projetos). */
export interface PortalViewer {
  team: boolean
  all: boolean
  client: boolean
}

export interface PortalPortfolio {
  generated_at: string
  updated_at: string | null
  delta_days: number | null
  cuts: { impact: number; effort: number }
  quadrants: PortalQuadrant[]
  criteria: { impact: PortalCriterion[]; effort: PortalCriterion[] }
  areas: { value: string; label: string }[]
  programs: PortalProgramSummary[]
  projects: PortalProjectSummary[]
  summary: PortalAggregate | null
  viewer: PortalViewer
}

export interface PortalTreeItem {
  id: string
  code: string | null
  title: string
  start_date: string | null
  due_date: string | null
  completed_at: string | null
  stage_name: string | null
  status: PortalItemStatus
  responsavel: string | null
  exec_pct: number
}

export interface PortalFeature extends PortalTreeItem {
  phase: "planejamento" | "desenvolvimento" | "homologacao" | "concluido"
  stories: PortalTreeItem[]
}

export interface RoadmapSegment {
  phase: RoadmapPhase
  start: string
  end: string
  kind: "realizado" | "atual" | "previsto"
}

export interface PortalRoadmap {
  segments: RoadmapSegment[]
  milestones: { date: string; label: string }[]
  start: string | null
  end: string | null
}

export interface PortalProgramProject extends PortalProjectSummary {
  po: PortalPerson | null
  features: PortalFeature[]
  orphan_stories: PortalTreeItem[]
  roadmap: PortalRoadmap
}

export interface PortalPillar extends PortalAggregate {
  id: string | null
  program_id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  order: number
}

export interface PortalProgramDetail {
  generated_at: string
  delta_days: number | null
  quadrants: PortalQuadrant[]
  program: PortalProgramSummary & {
    oa_days: number
    sponsors: { name: string; job_title: string | null }[]
    /** Cliente vê só alguns projetos do programa (vínculo por projeto). */
    partial: boolean
  }
  pillars: PortalPillar[]
  projects: PortalProgramProject[]
}

export interface PortalProjectDetail {
  generated_at: string
  delta_days: number | null
  quadrants: PortalQuadrant[]
  project: PortalProgramProject & {
    exec_delta: number | null
    program: { id: string; name: string; icon: string | null; color: string | null } | null
    pillar: { id: string; name: string; description: string | null; icon: string | null; color: string | null } | null
    sponsors: { name: string; job_title: string | null }[]
    /** Vínculo de cliente com o projeto e projeto na raia Operação Assistida. */
    accepts_occurrences: boolean
    /** Vínculo de cliente com o projeto (vê as ocorrências dele). */
    occurrences_link: boolean
  }
}

export interface PortalDelivery {
  task_id: string
  project_title: string
  program_name: string | null
  kind: "feature" | "projeto"
  id: string
  title: string
  code: string | null
  date: string
  done: boolean
  status: PortalItemStatus
  phase: string
}

export const portalPortfolioApi = {
  portfolio: () => api.get<PortalPortfolio>("/projetos/portal/portfolio").then((r) => r.data),
  program: (id: string) => api.get<PortalProgramDetail>(`/projetos/portal/programs/${id}`).then((r) => r.data),
  project: (id: string) => api.get<PortalProjectDetail>(`/projetos/portal/projects/${id}`).then((r) => r.data),
  deliveries: () =>
    api.get<{ generated_at: string; items: PortalDelivery[] }>("/projetos/portal/deliveries").then((r) => r.data),
}

// ── Assistente do Portal (chat) ──────────────────────────────────────────────

export interface PortalAssistantTurn {
  role: "user" | "assistant"
  content: string
}

export interface PortalAssistantSource {
  kind: "projeto" | "programa"
  id: string
  title: string
}

export interface PortalAssistantAnswer {
  answer: string
  sources: PortalAssistantSource[]
}

export const portalAssistantApi = {
  /** A IA externa pode levar alguns segundos (execução no Azure); timeout maior que o padrão. */
  ask: (body: { question: string; history: PortalAssistantTurn[]; project_id?: string; program_id?: string }) =>
    api.post<PortalAssistantAnswer>("/projetos/portal/assistant", body, { timeout: 120_000 }).then((r) => r.data),
}
