/** Divisão da jornada da Pessoa: Projetos / Operação Assistida / Chamados (o que sobra).
 * Espelha `allocation_split` (backend/app/modules/teamops/calendar.py). */

export interface AllocationSplitValues {
  projectsPct: number
  assistedOpsPct: number
  ticketsPct: number
  projectsHours: number | null
  assistedOpsHours: number | null
  ticketsHours: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function allocationSplit(
  dailyHours: number | null | undefined,
  projectsPct: number | null | undefined,
  assistedOpsPct: number | null | undefined,
): AllocationSplitValues {
  const p = Number.isFinite(Number(projectsPct)) ? Number(projectsPct) : 100
  const oa = Number.isFinite(Number(assistedOpsPct)) ? Number(assistedOpsPct) : 0
  const t = Math.max(0, 100 - p - oa)
  const d = Number(dailyHours)
  const has = Number.isFinite(d) && d > 0
  return {
    projectsPct: p,
    assistedOpsPct: oa,
    ticketsPct: t,
    projectsHours: has ? round1((d * p) / 100) : null,
    assistedOpsHours: has ? round1((d * oa) / 100) : null,
    ticketsHours: has ? round1((d * t) / 100) : null,
  }
}

export const SPLIT_COLORS = {
  projects: "bg-sky-500",
  assistedOps: "bg-teal-500",
  tickets: "bg-amber-500",
} as const

/** Barra empilhada + legenda. `compact` = só a barra com os % (listas). */
export function AllocationSplitBar({ split, compact = false }: { split: AllocationSplitValues; compact?: boolean }) {
  const parts = [
    { key: "projects", label: "Projetos", pct: split.projectsPct, h: split.projectsHours, cls: SPLIT_COLORS.projects },
    { key: "oa", label: "Operação Assistida", pct: split.assistedOpsPct, h: split.assistedOpsHours, cls: SPLIT_COLORS.assistedOps },
    { key: "tickets", label: "Chamados", pct: split.ticketsPct, h: split.ticketsHours, cls: SPLIT_COLORS.tickets },
  ]
  const title = parts.map((p) => `${p.label} ${p.pct}%${p.h != null ? ` (${p.h}h/dia)` : ""}`).join(" · ")
  return (
    <div className={compact ? "w-32" : "space-y-2"} title={title}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-white/10">
        {parts.map((p) => (p.pct > 0 ? <div key={p.key} className={p.cls} style={{ width: `${p.pct}%` }} /> : null))}
      </div>
      {compact ? (
        <div className="mt-1 text-xs tabular-nums text-muted-foreground">
          {split.projectsPct}/{split.assistedOpsPct}/{split.ticketsPct}%
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {parts.map((p) => (
            <span key={p.key} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${p.cls}`} aria-hidden />
              {p.label} <span className="font-semibold tabular-nums text-foreground">{p.pct}%</span>
              {p.h != null && <span>({p.h}h/dia)</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
