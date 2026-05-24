import { useMemo } from "react"
import type { ProjectTask } from "@/api/projetos"

const DAY_MS = 24 * 60 * 60 * 1000
const PX_PER_DAY = 26
const LABEL_W = 300

interface GanttNode {
  task: ProjectTask
  depth: number
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS)
}

/** Achata a subárvore (raiz + descendentes) em ordem de profundidade. */
function flattenSubtree(rootId: string, byParent: Map<string, ProjectTask[]>, root: ProjectTask): GanttNode[] {
  const out: GanttNode[] = [{ task: root, depth: 0 }]
  const walk = (parentId: string, depth: number) => {
    const children = (byParent.get(parentId) ?? []).slice().sort((a, b) => {
      const sa = a.start_date ?? a.due_date ?? ""
      const sb = b.start_date ?? b.due_date ?? ""
      return sa.localeCompare(sb) || a.order - b.order
    })
    for (const c of children) {
      out.push({ task: c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(rootId, 1)
  return out
}

function barColor(task: ProjectTask): string {
  if (task.completed_at) return "bg-success"
  if (task.sla_state === "breached") return "bg-destructive"
  if (task.sla_state === "warning") return "bg-warning"
  return "bg-primary"
}

export function GanttChart({ rootId, tasks }: { rootId: string; tasks: ProjectTask[] }) {
  const root = tasks.find((t) => t.id === rootId)
  const byParent = useMemo(() => {
    const m = new Map<string, ProjectTask[]>()
    for (const t of tasks) {
      if (!t.parent_task_id) continue
      const list = m.get(t.parent_task_id) ?? []
      list.push(t)
      m.set(t.parent_task_id, list)
    }
    return m
  }, [tasks])

  const nodes = useMemo(() => (root ? flattenSubtree(rootId, byParent, root) : []), [root, rootId, byParent])

  const { rangeStart, totalDays, months } = useMemo(() => {
    const dates: Date[] = []
    for (const n of nodes) {
      if (n.task.start_date) dates.push(new Date(n.task.start_date))
      if (n.task.due_date) dates.push(new Date(n.task.due_date))
    }
    if (dates.length === 0) {
      const today = startOfDay(new Date())
      return { rangeStart: today, totalDays: 30, months: [] as { label: string; days: number }[] }
    }
    let min = dates[0], max = dates[0]
    for (const d of dates) {
      if (d < min) min = d
      if (d > max) max = d
    }
    // margem de 2 dias de cada lado
    const start = startOfDay(new Date(min.getTime() - 2 * DAY_MS))
    const end = startOfDay(new Date(max.getTime() + 2 * DAY_MS))
    const days = Math.max(1, daysBetween(start, end) + 1)
    // agrupa cabeçalho por mês
    const ms: { label: string; days: number }[] = []
    let cursor = new Date(start)
    while (cursor <= end) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      const segEnd = monthEnd < end ? monthEnd : end
      const segDays = daysBetween(cursor, segEnd) + 1
      ms.push({
        label: cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        days: segDays,
      })
      cursor = new Date(monthEnd.getTime() + DAY_MS)
    }
    return { rangeStart: start, totalDays: days, months: ms }
  }, [nodes])

  if (!root) {
    return <p className="text-sm text-muted-foreground">Selecione um item para ver o cronograma.</p>
  }

  const timelineWidth = totalDays * PX_PER_DAY
  const todayOffset = daysBetween(rangeStart, new Date()) * PX_PER_DAY

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <div style={{ minWidth: LABEL_W + timelineWidth }}>
        {/* Cabeçalho de meses */}
        <div className="flex border-b bg-muted/40 text-[11px] font-medium text-muted-foreground">
          <div className="shrink-0 px-3 py-2" style={{ width: LABEL_W }}>Item</div>
          <div className="relative flex" style={{ width: timelineWidth }}>
            {months.map((m, i) => (
              <div key={i} className="border-l px-2 py-2 capitalize" style={{ width: m.days * PX_PER_DAY }}>
                {m.label}
              </div>
            ))}
          </div>
        </div>

        {/* Linhas */}
        <div className="relative">
          {/* marcador de hoje */}
          {todayOffset >= 0 && todayOffset <= timelineWidth && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-destructive/50 z-10"
              style={{ left: LABEL_W + todayOffset }}
              title="Hoje"
            />
          )}
          {nodes.map(({ task, depth }) => {
            const hasDates = !!(task.start_date || task.due_date)
            const s = task.start_date ? new Date(task.start_date) : (task.due_date ? new Date(task.due_date) : null)
            const e = task.due_date ? new Date(task.due_date) : (task.start_date ? new Date(task.start_date) : null)
            let left = 0, width = 0
            if (s && e) {
              left = daysBetween(rangeStart, s) * PX_PER_DAY
              width = Math.max(PX_PER_DAY, (daysBetween(s, e) + 1) * PX_PER_DAY)
            }
            return (
              <div key={task.id} className="flex border-b last:border-b-0 hover:bg-muted/20">
                <div
                  className="shrink-0 truncate px-3 py-2 text-sm"
                  style={{ width: LABEL_W, paddingLeft: 12 + depth * 16 }}
                  title={task.title}
                >
                  {depth > 0 && <span className="text-muted-foreground">↳ </span>}
                  {task.title}
                </div>
                <div className="relative" style={{ width: timelineWidth }}>
                  {hasDates ? (
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 h-4 rounded ${barColor(task)} opacity-90`}
                      style={{ left, width }}
                      title={`${task.start_date?.slice(0, 10) ?? "?"} → ${task.due_date?.slice(0, 10) ?? "?"}`}
                    />
                  ) : (
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] italic text-muted-foreground/60">
                      sem datas
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
