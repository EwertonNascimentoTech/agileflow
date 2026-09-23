import { Check } from "lucide-react"

import type { OccurrencePrioridade } from "@/api/clientes"

const STAGE_CLASS: Record<string, string> = {
  backlog: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  aguardando_cliente: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  ajustando: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  homologando: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  finalizado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  melhoria_analise: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
  encaminhada_release: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
}

const STAGE_DOT: Record<string, string> = {
  backlog: "bg-slate-400",
  aguardando_cliente: "bg-amber-500",
  ajustando: "bg-blue-500",
  homologando: "bg-violet-500",
  finalizado: "bg-emerald-500",
  melhoria_analise: "bg-teal-500",
  encaminhada_release: "bg-slate-500",
}

/** `mine` = quem vê abriu a ocorrência: "Aguardando Cliente" vira um chamado à ação. */
export function StageBadge({ stageKey, name, mine = false }: { stageKey: string | null; name: string | null; mine?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
        STAGE_CLASS[stageKey ?? ""] ?? "bg-muted text-muted-foreground"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[stageKey ?? ""] ?? "bg-muted-foreground"}`} />
      {mine && stageKey === "aguardando_cliente" ? "Aguardando sua resposta" : name ?? "—"}
    </span>
  )
}

/** O que a etapa significa para o cliente e o que acontece a seguir. */
export function stageHint(stageKey: string | null, mine: boolean): string {
  switch (stageKey) {
    case "backlog":
      return "Recebida. Um responsável do time vai assumir em breve."
    case "ajustando":
      return "O time está trabalhando nesta ocorrência."
    case "aguardando_cliente":
      return mine ? "O time precisa de uma informação sua para continuar." : "O time aguarda uma informação de quem abriu."
    case "homologando":
      return mine ? "O time concluiu o ajuste. Teste e diga se está resolvido." : "Em validação por quem abriu."
    case "finalizado":
      return "Ocorrência resolvida e encerrada."
    case "melhoria_analise":
      return "É uma sugestão de melhoria: o PO do projeto está avaliando."
    case "encaminhada_release":
      return "A melhoria segue em um projeto de Release, fora da Operação Assistida."
    default:
      return ""
  }
}

/** Título sem o código na frente ("OC-0001 · …"), que a tela já mostra à parte. */
export function occTitle(o: { title: string; code_label: string }): string {
  const t = o.title ?? ""
  return t.startsWith(o.code_label) ? t.slice(o.code_label.length).replace(/^\s*·\s*/, "") || t : t
}

/** Ocorrência que depende de quem abriu (responder ou validar). */
export function needsMyAction(o: { opened_by_me: boolean; stage_key: string | null }): boolean {
  return o.opened_by_me && (o.stage_key === "aguardando_cliente" || o.stage_key === "homologando")
}

const PRIORITY_CLASS: Record<OccurrencePrioridade, string> = {
  P1: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  P2: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200",
  P3: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
  P4: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
}

const PRIORITY_TITLE: Record<OccurrencePrioridade, string> = {
  P1: "Prioridade 1 — crítica",
  P2: "Prioridade 2 — alta",
  P3: "Prioridade 3 — média",
  P4: "Prioridade 4 — baixa",
}

export function PriorityBadge({ value }: { value: OccurrencePrioridade }) {
  return (
    <span title={PRIORITY_TITLE[value]} className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${PRIORITY_CLASS[value]}`}>
      {value}
    </span>
  )
}

/** Etapas do fluxo em linha (o cliente vê onde a ocorrência está). */
const TRACK_DEFAULT = [
  { keys: ["backlog"], label: "Recebida" },
  { keys: ["ajustando", "aguardando_cliente"], label: "Em atendimento" },
  { keys: ["homologando"], label: "Validação" },
  { keys: ["finalizado"], label: "Resolvida" },
]
const TRACK_MELHORIA = [
  { keys: ["backlog"], label: "Recebida" },
  { keys: ["melhoria_analise"], label: "Análise do PO" },
  { keys: ["encaminhada_release"], label: "Encaminhada p/ Release" },
]

export function StageStepper({ stageKey }: { stageKey: string | null }) {
  const track = stageKey === "melhoria_analise" || stageKey === "encaminhada_release" ? TRACK_MELHORIA : TRACK_DEFAULT
  const current = Math.max(0, track.findIndex((s) => s.keys.includes(stageKey ?? "")))
  const lastDone = current === track.length - 1
  return (
    <ol className="flex w-full items-start">
      {track.map((step, i) => {
        const done = i < current || (lastDone && i === current)
        const active = i === current && !lastDone
        const waiting = active && stageKey === "aguardando_cliente"
        return (
          <li key={step.label} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                className={`absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2 ${i <= current ? "bg-primary" : "bg-border"}`}
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : waiting
                    ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950"
                    : active
                      ? "border-primary bg-background text-primary"
                      : "border-border bg-background text-muted-foreground"
              }`}
            >
              {done ? <Check size={13} strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={`mt-1.5 px-1 text-[11px] leading-tight ${
                active || done ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
            {waiting && <span className="mt-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">aguardando você</span>}
          </li>
        )
      })}
    </ol>
  )
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "•"
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function parseIso(iso: string): Date {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`)
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  return parseIso(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias" ou a data. */
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = parseIso(iso)
  const min = Math.floor((Date.now() - d.getTime()) / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const days = Math.floor(h / 24)
  if (days === 1) return "ontem"
  if (days < 7) return `há ${days} dias`
  return d.toLocaleDateString("pt-BR")
}

export function apiErrorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join(", ")
  return fallback
}
