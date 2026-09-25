import type { ElementType } from "react"
import { useLocation } from "react-router-dom"
import {
  BarChart3, BookOpen, Boxes, Briefcase, Building2, Calculator, Cloud, Coins, Cpu, Database, Factory,
  FileText, Gavel, Globe, GraduationCap, Handshake, HeartPulse, Landmark, Layers, Leaf, Lightbulb,
  LifeBuoy, LineChart, Megaphone, Package, PieChart, Receipt, Rocket, Scale, Settings, Shield, ShieldCheck,
  ShoppingCart, Sparkles, Stethoscope, Target, Truck, UserCog, Users, Wallet, Wrench,
} from "lucide-react"

import {
  portalPortfolioApi,
  type PortalHealth,
  type PortalItemStatus,
  type PortalPortfolio,
  type PortalProgramProject,
  type PortalProgramSummary,
  type PortalProjectSummary,
  type PortalQuadrant,
  type PortalStatus,
  type QuadrantCode,
  type RoadmapPhase,
} from "@/api/portalPortfolio"

// Constantes e funções do Portal (sem componentes — os componentes ficam em portfolioUi.tsx).

// ── Ícones e cores de Programa/Pilar (texto livre no cadastro) ──────────────

const ICONS: Record<string, ElementType> = {
  Target, Users, Settings, Shield, ShieldCheck, Leaf, ShoppingCart, BarChart3, Calculator, Wallet,
  Landmark, Factory, GraduationCap, HeartPulse, Building2, Briefcase, Cpu, Globe, Layers, FileText,
  Truck, Package, Scale, Sparkles, Rocket, Lightbulb, Handshake, Coins, Receipt, UserCog, Stethoscope,
  BookOpen, Database, Cloud, LineChart, PieChart, Megaphone, Gavel, Wrench, Boxes, LifeBuoy,
}

/** Nomes oferecidos no cadastro de Programas e Pilares. */
export const PORTAL_ICON_NAMES = Object.keys(ICONS)

export function resolvePortalIcon(name: string | null | undefined, fallback: ElementType = Target): ElementType {
  return (name && ICONS[name]) || fallback
}

/** Paleta padrão quando o programa/pilar não tem cor cadastrada. */
export const PORTAL_PALETTE = ["#2563EB", "#16A34A", "#7C3AED", "#DB2777", "#D97706", "#0891B2", "#DC2626", "#4F46E5"]

export function colorFor(color: string | null | undefined, key: string): string {
  if (color) return color
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return PORTAL_PALETTE[h % PORTAL_PALETTE.length]
}

export const HEALTH: Record<PortalHealth, { label: string; dot: string; badge: string }> = {
  no_prazo: {
    label: "No prazo",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800",
  },
  atencao: {
    label: "Em atenção",
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800",
  },
  critico: {
    label: "Crítico",
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800",
  },
  concluido: {
    label: "Concluído",
    dot: "bg-teal-500",
    badge: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-800",
  },
}

export const STATUS: Record<PortalStatus, { label: string; dot: string }> = {
  planejamento: { label: "Planejamento", dot: "bg-slate-400" },
  execucao: { label: "Em execução", dot: "bg-blue-500" },
  concluido: { label: "Concluído", dot: "bg-emerald-500" },
  impedimento: { label: "Com impedimento", dot: "bg-orange-500" },
  pausado: { label: "Pausado", dot: "bg-slate-300 dark:bg-slate-500" },
  cancelado: { label: "Cancelado", dot: "bg-slate-500" },
}

export const ITEM_STATUS: Record<PortalItemStatus, { label: string; dot: string; badge: string }> = {
  no_prazo: { label: "No prazo", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  andamento: { label: "Em andamento", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  atrasado: { label: "Atrasado", dot: "bg-red-500", badge: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300" },
  impedimento: { label: "Com impedimento", dot: "bg-violet-500", badge: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" },
  nao_iniciada: { label: "Não iniciada", dot: "bg-slate-300 dark:bg-slate-500", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  concluida: { label: "Concluída", dot: "bg-teal-500", badge: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300" },
}

/** Fases (roadmap e selos). `bar`/`light` = barra realizada/prevista no roadmap. */
export const PHASE: Record<RoadmapPhase, { label: string; badge: string; bar: string; light: string; dot: string }> = {
  planejamento: {
    label: "Planejamento",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    bar: "bg-slate-400 text-white dark:bg-slate-500",
    light: "bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200",
    dot: "bg-slate-400",
  },
  desenvolvimento: {
    label: "Desenvolvimento",
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    bar: "bg-sky-500 text-white",
    light: "bg-sky-200 text-sky-900 dark:bg-sky-900/60 dark:text-sky-100",
    dot: "bg-sky-400",
  },
  homologacao: {
    label: "Homologação",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    bar: "bg-blue-700 text-white",
    light: "bg-blue-300 text-blue-950 dark:bg-blue-800/60 dark:text-blue-100",
    dot: "bg-blue-700",
  },
  producao: {
    label: "Produção",
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
    bar: "bg-indigo-600 text-white",
    light: "bg-indigo-200 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100",
    dot: "bg-indigo-600",
  },
  operacao_assistida: {
    label: "Operação Assistida",
    badge: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
    bar: "bg-teal-600 text-white",
    light: "bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100",
    dot: "bg-teal-500",
  },
  concluido: {
    label: "Concluído",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    bar: "bg-emerald-400 text-emerald-950",
    light: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100",
    dot: "bg-emerald-500",
  },
  impedimento: {
    label: "Impedimento",
    badge: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
    bar: "bg-orange-500 text-white",
    light: "bg-orange-200 text-orange-900 dark:bg-orange-900/50 dark:text-orange-100",
    dot: "bg-orange-500",
  },
  cancelado: {
    label: "Cancelado",
    badge: "bg-slate-200 text-slate-600 line-through dark:bg-slate-800 dark:text-slate-300",
    bar: "bg-slate-500 text-white",
    light: "bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200",
    dot: "bg-slate-500",
  },
}

export function quadrantOf(quadrants: PortalQuadrant[], code: QuadrantCode | null | undefined): PortalQuadrant | null {
  return code ? quadrants.find((q) => q.code === code) ?? null : null
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  // Datas do servidor vêm em UTC sem fuso.
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function parseDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Favoritos do cliente (só neste navegador). */
const FAV_KEY = "portal:favoritePrograms"
export function readFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(FAV_KEY)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}
export function writeFavorites(ids: string[]): void {
  try {
    window.localStorage.setItem(FAV_KEY, JSON.stringify(ids))
  } catch {
    /* sem storage: favorito vale só nesta visita */
  }
}

// ── Dados compartilhados ────────────────────────────────────────────────────

// Portfólio carregado uma vez por minuto e dividido entre a busca e as telas.
let cache: { at: number; promise: Promise<PortalPortfolio> } | null = null
export function loadPortfolio(force = false): Promise<PortalPortfolio> {
  if (force || !cache || Date.now() - cache.at > 60_000) {
    const promise = portalPortfolioApi.portfolio()
    cache = { at: Date.now(), promise }
    promise.catch(() => { cache = null })
  }
  return cache.promise
}

export const NO_PROGRAM = "__sem_programa__"

/** Grupo do projeto na tabela agrupada por programa. */
export function groupKey(p: PortalProjectSummary, programs: PortalProgramSummary[]): string {
  return p.program_id && programs.some((g) => g.id === p.program_id) ? p.program_id : NO_PROGRAM
}

export const ORPHANS = "__orphans__"

/** Chaves de expansão da árvore: p:<projeto>, f:<feature>, f:__orphans__:<projeto>. */
export function treeKeys(projects: PortalProgramProject[], withProjects: boolean): string[] {
  const keys: string[] = []
  for (const p of projects) {
    if (withProjects) keys.push(`p:${p.task_id}`)
    for (const f of p.features) keys.push(`f:${f.id}`)
    if (p.orphan_stories.length) keys.push(`f:${ORPHANS}:${p.task_id}`)
  }
  return keys
}

/** Base das rotas do Portal: o layout do cliente (`/portal`) ou o módulo "Modo Cliente" dentro
 *  do AgileFlow. As telas montam os links a partir daqui para funcionar nos dois lugares. */
export const PORTAL_MODULE_BASE = "/app/modules/portal_cliente"
export function usePortalBase(): string {
  const { pathname } = useLocation()
  return pathname.startsWith(PORTAL_MODULE_BASE) ? PORTAL_MODULE_BASE : "/portal"
}
