import type { ProjectTask, ProjectTaskDependency, ScheduleBaseline } from "@/api/projetos"

// Diff inteligente entre o cronograma ATUAL e um baseline salvo (snapshot). Função pura.

export interface FieldChange {
  task_id: string
  title: string
  from: string | null
  to: string | null
  deltaDays?: number
}
export interface AssigneeChange {
  task_id: string
  title: string
  fromName: string | null
  toName: string | null
}
export interface TaskRef { task_id: string; title: string }
export interface DepChange { predTitle: string; succTitle: string }

export interface BaselineDiff {
  dueChanges: FieldChange[]
  startChanges: FieldChange[]
  assigneeChanges: AssigneeChange[]
  assigneeUnavailable: boolean
  inserted: TaskRef[]
  removed: TaskRef[]
  hoursChanges: FieldChange[]
  statusChanges: FieldChange[]
  depsAdded: DepChange[]
  depsRemoved: DepChange[]
  markById: Map<string, "changed" | "inserted">
  total: number
}

function dayOf(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null
}
function diffDays(fromIso: string | null | undefined, toIso: string | null | undefined): number | undefined {
  const a = dayOf(fromIso), b = dayOf(toIso)
  if (!a || !b) return undefined
  const ms = new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()
  return Math.round(ms / 86400000)
}

export function computeBaselineDiff(
  currentTasks: ProjectTask[],
  currentDeps: ProjectTaskDependency[],
  nameById: Map<string, string>,
  statusNameById: Map<string, string>,
  baseline: ScheduleBaseline,
): BaselineDiff {
  const baseTasks = baseline.snapshot?.tasks ?? []
  const baseById = new Map(baseTasks.map((t) => [t.task_id, t]))
  const curById = new Map(currentTasks.map((t) => [t.id, t]))
  const titleOf = (id: string) => curById.get(id)?.title ?? baseById.get(id)?.title ?? "—"

  const dueChanges: FieldChange[] = []
  const startChanges: FieldChange[] = []
  const assigneeChanges: AssigneeChange[] = []
  const hoursChanges: FieldChange[] = []
  const statusChanges: FieldChange[] = []
  const inserted: TaskRef[] = []
  const removed: TaskRef[] = []
  const markById = new Map<string, "changed" | "inserted">()

  // O baseline guarda responsável? (snapshots antigos não têm o campo em nenhuma tarefa.)
  const assigneeUnavailable = !baseTasks.some((t) => t.assigned_to !== undefined)

  for (const cur of currentTasks) {
    const base = baseById.get(cur.id)
    if (!base) {
      inserted.push({ task_id: cur.id, title: cur.title })
      markById.set(cur.id, "inserted")
      continue
    }
    let changed = false

    if (dayOf(cur.due_date) !== dayOf(base.due_date)) {
      dueChanges.push({ task_id: cur.id, title: cur.title, from: base.due_date, to: cur.due_date, deltaDays: diffDays(base.due_date, cur.due_date) })
      changed = true
    }
    if (dayOf(cur.start_date) !== dayOf(base.start_date)) {
      startChanges.push({ task_id: cur.id, title: cur.title, from: base.start_date, to: cur.start_date, deltaDays: diffDays(base.start_date, cur.start_date) })
      changed = true
    }
    const curH = cur.estimated_hours == null ? null : Number(cur.estimated_hours)
    const baseH = base.estimated_hours == null ? null : Number(base.estimated_hours)
    if (curH !== baseH) {
      hoursChanges.push({ task_id: cur.id, title: cur.title, from: baseH === null ? null : String(baseH), to: curH === null ? null : String(curH) })
      changed = true
    }
    if (!assigneeUnavailable && (cur.assigned_to ?? null) !== (base.assigned_to ?? null)) {
      assigneeChanges.push({
        task_id: cur.id, title: cur.title,
        fromName: base.assigned_to_name ?? (base.assigned_to ? nameById.get(base.assigned_to) ?? "?" : null),
        toName: cur.assigned_to ? nameById.get(cur.assigned_to) ?? "?" : null,
      })
      changed = true
    }
    const curStatusName = statusNameById.get(cur.status_id) ?? null
    if ((curStatusName ?? null) !== (base.status_name ?? null)) {
      statusChanges.push({ task_id: cur.id, title: cur.title, from: base.status_name ?? null, to: curStatusName })
      changed = true
    }
    if (changed) markById.set(cur.id, "changed")
  }

  for (const base of baseTasks) {
    if (!curById.has(base.task_id)) removed.push({ task_id: base.task_id, title: base.title })
  }

  const key = (p: string, s: string) => p + ">" + s
  const curDepSet = new Set(currentDeps.map((d) => key(d.predecessor_id, d.successor_id)))
  const baseDeps = baseline.snapshot?.dependencies ?? []
  const baseDepSet = new Set(baseDeps.map((d) => key(d.predecessor_id, d.successor_id)))
  const depsAdded: DepChange[] = []
  const depsRemoved: DepChange[] = []
  for (const d of currentDeps) {
    if (!baseDepSet.has(key(d.predecessor_id, d.successor_id))) depsAdded.push({ predTitle: titleOf(d.predecessor_id), succTitle: titleOf(d.successor_id) })
  }
  for (const d of baseDeps) {
    if (!curDepSet.has(key(d.predecessor_id, d.successor_id))) depsRemoved.push({ predTitle: titleOf(d.predecessor_id), succTitle: titleOf(d.successor_id) })
  }

  const total =
    dueChanges.length + startChanges.length + assigneeChanges.length + inserted.length +
    removed.length + hoursChanges.length + statusChanges.length + depsAdded.length + depsRemoved.length

  return {
    dueChanges, startChanges, assigneeChanges, assigneeUnavailable, inserted, removed,
    hoursChanges, statusChanges, depsAdded, depsRemoved, markById, total,
  }
}
