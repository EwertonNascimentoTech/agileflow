/** Funil dedicado a User Story (exclui Features). */
export function isUserStoryKanbanFunnel(funnelName: string | null | undefined): boolean {
  if (!funnelName?.trim()) return false
  const n = funnelName.toLowerCase()
  if (n.includes("feature")) return false
  return /\bus\b|user story|user-story|hist[oó]ria/.test(n)
}

export function isFeatureKanbanFunnel(funnelName: string | null | undefined): boolean {
  if (!funnelName?.trim()) return false
  return funnelName.toLowerCase().includes("feature")
}

/** Funis de execução (Feature / US) exibem horas estimadas no card em vez de SLA/cronograma. */
export function isFeatureOrUsKanbanFunnel(funnelName: string | null | undefined): boolean {
  return isFeatureKanbanFunnel(funnelName) || isUserStoryKanbanFunnel(funnelName)
}

/** Funil onde circulam cards de planejamento (Projeto / Programa). */
export function isProjectOrProgramKanbanFunnel(funnelName: string | null | undefined): boolean {
  if (!funnelName?.trim()) return false
  if (isFeatureOrUsKanbanFunnel(funnelName)) return false
  const n = funnelName.toLowerCase()
  return (
    n.includes("projeto") ||
    n.includes("programa") ||
    n.includes("planejamento") ||
    n.includes("triagem")
  )
}

export function isPlanningRootTask(planningKind: string | null | undefined): boolean {
  return planningKind === "projeto" || planningKind === "programa"
}

export function isUserStoryDemandType(name: string | null | undefined, slug?: string | null): boolean {
  const n = (name ?? "").trim().toLowerCase()
  const s = (slug ?? "").trim().toLowerCase()
  if (["us", "user_story", "user-story", "historia", "história"].includes(s)) return true
  return n === "us" || n.includes("user story") || n.includes("história") || n.includes("historia")
}

export function percentFromUsChecklist(items: Array<{ done: boolean }> | null | undefined): number {
  if (!items?.length) return 0
  const done = items.filter((i) => i.done).length
  return Math.round((done / items.length) * 100)
}

export function buildTaskProgressById(tasks: Array<{
  id: string
  parent_task_id: string | null
  completed_at?: string | null
  percent_complete?: number
  estimated_hours?: number | null
}>): Map<string, number> {
  const kids = new Map<string, typeof tasks>()
  for (const t of tasks) {
    if (!t.parent_task_id) continue
    const list = kids.get(t.parent_task_id) ?? []
    list.push(t)
    kids.set(t.parent_task_id, list)
  }
  const calc = (t: (typeof tasks)[number]): [number, number] => {
    const ch = kids.get(t.id) ?? []
    if (ch.length === 0) {
      const pct = t.completed_at ? 100 : (t.percent_complete ?? 0)
      const h = Number(t.estimated_hours)
      const w = h > 0 ? h : 1
      return [pct * w, w]
    }
    let acc = 0
    let wsum = 0
    for (const k of ch) {
      const [a, w] = calc(k)
      acc += a
      wsum += w
    }
    return [acc, wsum]
  }
  const out = new Map<string, number>()
  for (const t of tasks) {
    const [a, w] = calc(t)
    out.set(t.id, w > 0 ? Math.round(a / w) : 0)
  }
  return out
}

export function taskHasChildTasks(
  tasks: Array<{ id: string; parent_task_id: string | null }>,
  taskId: string,
): boolean {
  return tasks.some((t) => t.parent_task_id === taskId)
}

export function usChecklistProgressPct(task: {
  completed_at?: string | null
  percent_complete?: number
}): number {
  return task.completed_at ? 100 : (task.percent_complete ?? 0)
}

export function shouldShowUsChecklistProgress(
  task: { us_checklist?: Array<{ done: boolean }> | null; completed_at?: string | null; percent_complete?: number },
  isUsKanban: boolean,
): boolean {
  if (!isUsKanban) return false
  return !!(task.us_checklist?.length || usChecklistProgressPct(task) > 0)
}

export function fmtEstimatedHours(h: number | null | undefined): string | null {
  if (h == null) return null
  const n = Number(h)
  if (!Number.isFinite(n) || n <= 0) return null
  return `${n % 1 === 0 ? n : n.toFixed(1)}h`
}

