import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Plus } from "lucide-react"
import type { ProjectTask } from "@/api/projetos"
import type { User } from "@/types"

const DAY_MS = 24 * 60 * 60 * 1000
const PX_PER_DAY = 26
const LABEL_W = 360

function toIsoOrNull(v: string): string | null {
  return v ? new Date(`${v}T00:00:00`).toISOString() : null
}

// ISO (meia-noite local) a partir de "YYYY-MM-DD", mesma convenção dos inputs de data.
function isoFromDateStr(s: string): string {
  return new Date(`${s}T00:00:00`).toISOString()
}

// Soma `days` à data (parte YYYY-MM-DD do ISO), sem deriva de fuso/horário de verão.
function addDaysToIso(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const ny = dt.getUTCFullYear()
  const nm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const nd = String(dt.getUTCDate()).padStart(2, "0")
  return isoFromDateStr(`${ny}-${nm}-${nd}`)
}

type DragState = { taskId: string; mode: "move" | "start" | "end"; startX: number; deltaDays: number }

function ganttInitials(name: string | undefined): string {
  if (!name) return "?"
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return "?"
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

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

export function GanttChart({
  rootId,
  tasks,
  users = [],
  onOpenTask,
  onAddChild,
  onUpdateDates,
}: {
  rootId: string
  tasks: ProjectTask[]
  users?: User[]
  onOpenTask?: (t: ProjectTask) => void
  onAddChild?: (t: ProjectTask) => void
  onUpdateDates?: (t: ProjectTask, patch: { start_date?: string | null; due_date?: string | null }) => void
}) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const root = tasks.find((t) => t.id === rootId)

  function startDrag(e: ReactPointerEvent, task: ProjectTask, mode: DragState["mode"]) {
    if (!onUpdateDates || !task.start_date || !task.due_date) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    setDrag({ taskId: task.id, mode, startX: e.clientX, deltaDays: 0 })
  }

  function moveDrag(e: ReactPointerEvent, taskId: string) {
    setDrag((d) => {
      if (!d || d.taskId !== taskId) return d
      const dd = Math.round((e.clientX - d.startX) / PX_PER_DAY)
      return dd === d.deltaDays ? d : { ...d, deltaDays: dd }
    })
  }

  function endDrag(e: ReactPointerEvent, task: ProjectTask) {
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
    if (!drag || drag.taskId !== task.id) { setDrag(null); return }
    const dd = drag.deltaDays
    const mode = drag.mode
    setDrag(null)
    if (dd === 0 || !onUpdateDates || !task.start_date || !task.due_date) return
    if (mode === "move") {
      onUpdateDates(task, {
        start_date: addDaysToIso(task.start_date, dd),
        due_date: addDaysToIso(task.due_date, dd),
      })
    } else if (mode === "start") {
      let ns = addDaysToIso(task.start_date, dd)
      if (ns.slice(0, 10) > task.due_date.slice(0, 10)) ns = isoFromDateStr(task.due_date.slice(0, 10))
      onUpdateDates(task, { start_date: ns })
    } else {
      let nd = addDaysToIso(task.due_date, dd)
      if (nd.slice(0, 10) < task.start_date.slice(0, 10)) nd = isoFromDateStr(task.start_date.slice(0, 10))
      onUpdateDates(task, { due_date: nd })
    }
  }
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
              <div key={task.id} className="group/row flex border-b last:border-b-0 hover:bg-muted/20">
                <div
                  className="flex shrink-0 flex-col gap-1 px-3 py-1.5"
                  style={{ width: LABEL_W, paddingLeft: 12 + depth * 16 }}
                >
                  <div className="flex items-center gap-1.5 text-sm">
                    {depth > 0 && <span className="shrink-0 text-muted-foreground">↳</span>}
                    {(() => {
                      const a = users.find((u) => u.id === task.assigned_to) ?? null
                      return (
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                          style={{ backgroundColor: a ? "#6366f1" : "#94a3b8" }}
                          title={a?.full_name ?? "Sem responsável"}
                        >
                          {ganttInitials(a?.full_name)}
                        </span>
                      )
                    })()}
                    <button
                      type="button"
                      className="flex-1 truncate text-left hover:text-primary hover:underline"
                      title={task.title}
                      onClick={() => onOpenTask?.(task)}
                    >
                      {task.title}
                    </button>
                    {onAddChild && (
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground opacity-0 transition hover:text-primary group-hover/row:opacity-100"
                        title="Adicionar item filho"
                        onClick={() => onAddChild(task)}
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                  {onUpdateDates && (
                    <div className="flex items-center gap-1 pl-6">
                      <input
                        type="date"
                        value={task.start_date ? task.start_date.slice(0, 10) : ""}
                        onChange={(e) => onUpdateDates(task, { start_date: toIsoOrNull(e.target.value) })}
                        className="h-6 w-[115px] rounded border border-border bg-background px-1 text-[11px] text-muted-foreground"
                        title="Início"
                      />
                      <span className="text-[10px] text-muted-foreground">→</span>
                      <input
                        type="date"
                        value={task.due_date ? task.due_date.slice(0, 10) : ""}
                        onChange={(e) => onUpdateDates(task, { due_date: toIsoOrNull(e.target.value) })}
                        className="h-6 w-[115px] rounded border border-border bg-background px-1 text-[11px] text-muted-foreground"
                        title="Prazo"
                      />
                    </div>
                  )}
                </div>
                <div className="relative" style={{ width: timelineWidth }}>
                  {hasDates ? (() => {
                    const draggable = !!onUpdateDates && !!task.start_date && !!task.due_date
                    let bl = left
                    let bw = width
                    if (drag && drag.taskId === task.id) {
                      const dd = drag.deltaDays * PX_PER_DAY
                      if (drag.mode === "move") bl = left + dd
                      else if (drag.mode === "start") { bl = left + dd; bw = Math.max(PX_PER_DAY, width - dd) }
                      else bw = Math.max(PX_PER_DAY, width + dd)
                    }
                    return (
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 h-4 select-none rounded ${barColor(task)} opacity-90 ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
                        style={{ left: bl, width: bw }}
                        title={`${task.start_date?.slice(0, 10) ?? "?"} → ${task.due_date?.slice(0, 10) ?? "?"}${draggable ? " · arraste para mover, pegue as bordas para redimensionar" : ""}`}
                        onPointerDown={draggable ? (e) => startDrag(e, task, "move") : undefined}
                        onPointerMove={draggable ? (e) => moveDrag(e, task.id) : undefined}
                        onPointerUp={draggable ? (e) => endDrag(e, task) : undefined}
                      >
                        {draggable && (
                          <>
                            <span
                              className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l bg-black/10"
                              onPointerDown={(e) => startDrag(e, task, "start")}
                              onPointerMove={(e) => moveDrag(e, task.id)}
                              onPointerUp={(e) => endDrag(e, task)}
                            />
                            <span
                              className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-black/10"
                              onPointerDown={(e) => startDrag(e, task, "end")}
                              onPointerMove={(e) => moveDrag(e, task.id)}
                              onPointerUp={(e) => endDrag(e, task)}
                            />
                          </>
                        )}
                      </div>
                    )
                  })() : (
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
