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

/** `mine` = quem vê abriu a ocorrência: "Aguardando Cliente" vira um chamado à ação. */
export function StageBadge({ stageKey, name, mine = false }: { stageKey: string | null; name: string | null; mine?: boolean }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_CLASS[stageKey ?? ""] ?? "bg-muted text-muted-foreground"}`}>
      {mine && stageKey === "aguardando_cliente" ? "Aguardando sua resposta" : name ?? "—"}
    </span>
  )
}

const PRIORITY_CLASS: Record<OccurrencePrioridade, string> = {
  P1: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
  P2: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200",
  P3: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
  P4: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
}

export function PriorityBadge({ value }: { value: OccurrencePrioridade }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${PRIORITY_CLASS[value]}`}>{value}</span>
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`)
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function apiErrorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join(", ")
  return fallback
}
