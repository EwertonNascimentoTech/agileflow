import { Check } from "lucide-react"

import type { OccurrencePrioridade } from "@/api/clientes"

// Selos no padrão do Portal (portfólio/projetos): fundo claro, anel interno e bolinha.
const STAGE_CLASS: Record<string, string> = {
  backlog: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
  aguardando_cliente: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800",
  ajustando: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800",
  homologando: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-800",
  finalizado: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800",
  melhoria_analise: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-800",
  encaminhada_release: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
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

/** `mine` = quem vê abriu a ocorrência: "Aguardando Cliente" vira um chamado à ação.
 *  `size="lg"` = selo do cabeçalho, ao lado do título. */
export function StageBadge({
  stageKey,
  name,
  mine = false,
  size = "sm",
}: {
  stageKey: string | null
  name: string | null
  mine?: boolean
  size?: "sm" | "lg"
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-medium ring-1 ring-inset ${
        size === "lg" ? "px-2.5 py-0.5 text-sm" : "px-2 py-0.5 text-xs"
      } ${STAGE_CLASS[stageKey ?? ""] ?? "bg-muted text-muted-foreground ring-border"}`}
    >
      <span className={`${size === "lg" ? "h-2 w-2" : "h-1.5 w-1.5"} rounded-full ${STAGE_DOT[stageKey ?? ""] ?? "bg-muted-foreground"}`} />
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
  P1: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800",
  P2: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-800",
  P3: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-800",
  P4: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
}

/** Nome curto da prioridade (cartão de indicador). */
export const PRIORITY_LABEL: Record<OccurrencePrioridade, string> = {
  P1: "Crítica",
  P2: "Alta",
  P3: "Média",
  P4: "Baixa",
}

const PRIORITY_TITLE: Record<OccurrencePrioridade, string> = {
  P1: "Prioridade 1 — crítica",
  P2: "Prioridade 2 — alta",
  P3: "Prioridade 3 — média",
  P4: "Prioridade 4 — baixa",
}

export function PriorityBadge({ value, withLabel = false }: { value: OccurrencePrioridade; withLabel?: boolean }) {
  return (
    <span
      title={PRIORITY_TITLE[value]}
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${PRIORITY_CLASS[value]}`}
    >
      {value}
      {withLabel && <span className="ml-1 font-medium">· {PRIORITY_LABEL[value]}</span>}
    </span>
  )
}

/** Pessoa com as iniciais (mesmo chip da árvore de projetos). */
export function PersonChip({ name, empty = "—" }: { name: string | null | undefined; empty?: string }) {
  if (!name) return <span className="text-sm text-muted-foreground">{empty}</span>
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary" aria-hidden>
        {initials(name)}
      </span>
      <span className="truncate">{name}</span>
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
                className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${i <= current ? "bg-primary" : "bg-border"}`}
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : waiting
                    ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950"
                    : active
                      ? "border-primary bg-background text-primary"
                      : "border-border bg-background text-muted-foreground"
              }`}
            >
              {done ? <Check size={15} strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={`mt-2 px-1 text-sm leading-tight ${
                active || done ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
            {waiting && <span className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">aguardando você</span>}
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
