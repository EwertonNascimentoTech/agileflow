import type { AssistedOpsIndicator, AssistedOpsIndicators } from "@/api/clientes"

const STATUS_CLASS: Record<AssistedOpsIndicator["status"], string> = {
  ok: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30",
  alerta: "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30",
  sem_dado: "border-border bg-muted/40",
}
const STATUS_TEXT: Record<AssistedOpsIndicator["status"], string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  alerta: "text-amber-700 dark:text-amber-300",
  sem_dado: "text-muted-foreground",
}
const STATUS_LABEL: Record<AssistedOpsIndicator["status"], string> = { ok: "na meta", alerta: "fora da meta", sem_dado: "sem dado" }

/** Indicadores do POP.COR.GTD.003 (quadro 3): valor, meta de referência e situação. */
export function IndicatorGrid({ items, compact = false }: { items: AssistedOpsIndicator[]; compact?: boolean }) {
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-3"}`}>
      {items.map((i) => (
        <div key={i.key} className={`rounded-lg border px-3 py-2 ${STATUS_CLASS[i.status]}`} title={i.detail ?? undefined}>
          <p className="truncate text-[11px] font-medium text-muted-foreground">{i.label}</p>
          <p className={`font-semibold tabular-nums ${compact ? "text-base" : "text-xl"}`}>{i.display}</p>
          <p className="text-[11px] text-muted-foreground">
            Meta {i.meta ?? "—"} · <span className={STATUS_TEXT[i.status]}>{STATUS_LABEL[i.status]}</span>
          </p>
          {!compact && i.detail && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{i.detail}</p>}
        </div>
      ))}
    </div>
  )
}

function fmtDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}`
}

/** Resumo por tipo, criticidade, N1 e volume das últimas semanas. */
export function IndicatorBreakdown({ data }: { data: AssistedOpsIndicators }) {
  const tipos = Object.entries(data.by_tipo)
  const crit = Object.entries(data.by_criticidade)
  const weeks = data.weekly.slice(-6)
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {tipos.length > 0 && (
        <p>
          Por tipo: {tipos.map(([k, v]) => `${k} ${v}`).join(" · ")}
          {crit.length > 0 && <> — correções por criticidade: {crit.map(([k, v]) => `${k} ${v}`).join(" · ")}</>}
        </p>
      )}
      {(data.n1.resolvidas || data.n1.encaminhadas) && (
        <p>Triagem N1: {data.n1.resolvidas ?? 0} resolvida(s) no N1 · {data.n1.encaminhadas ?? 0} encaminhada(s) à TI</p>
      )}
      {weeks.length > 0 && (
        <p>
          Semanas: {weeks.map((w) => `${fmtDay(w.week_start)} ${w.total}${w.correcoes ? ` (${w.correcoes} corr.)` : ""}`).join(" · ")}
        </p>
      )}
    </div>
  )
}
