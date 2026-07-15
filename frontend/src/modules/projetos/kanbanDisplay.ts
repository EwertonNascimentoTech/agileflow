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

export function isFeatureDemandType(name: string | null | undefined, slug?: string | null): boolean {
  const n = (name ?? "").trim().toLowerCase()
  const s = (slug ?? "").trim().toLowerCase()
  if (["feature", "features"].includes(s)) return true
  return n === "feature" || n.includes("feature")
}

export type PlanningProgressBar = {
  key: "feature" | "user_story" | "other"
  label: string
  total: number
  pct: number
}

/**
 * Barras de progresso sob um card Projeto/Programa:
 * - Features: itens Feature na subárvore (tipo de demanda OU funil Features)
 * - User Stories: todas as US na subárvore (tipo OU funil User Story)
 * - Outros: filhos diretos que não são Feature nem US
 *
 * Muitos cards importados não têm demand_type_id — a classificação cai no funil do status.
 */
export function buildPlanningProgressBars(
  rootId: string,
  tasks: Array<{
    id: string
    parent_task_id: string | null
    status_id?: string
    demand_type_id: string | null
    completed_at?: string | null
    percent_complete?: number
    estimated_hours?: number | null
  }>,
  typeMeta: Map<string, { name: string; slug?: string | null }>,
  progressById: Map<string, number>,
  funnelNameByStatusId?: Map<string, string> | Record<string, string>,
): PlanningProgressBar[] {
  const byParent = new Map<string, typeof tasks>()
  for (const t of tasks) {
    if (!t.parent_task_id) continue
    const list = byParent.get(t.parent_task_id) ?? []
    list.push(t)
    byParent.set(t.parent_task_id, list)
  }

  const funnelOf = (t: (typeof tasks)[number]): string | null => {
    if (!t.status_id || !funnelNameByStatusId) return null
    if (funnelNameByStatusId instanceof Map) return funnelNameByStatusId.get(t.status_id) ?? null
    return funnelNameByStatusId[t.status_id] ?? null
  }

  const classify = (t: (typeof tasks)[number]): "feature" | "user_story" | "other" => {
    const meta = t.demand_type_id ? typeMeta.get(t.demand_type_id) : null
    if (isFeatureDemandType(meta?.name, meta?.slug)) return "feature"
    if (isUserStoryDemandType(meta?.name, meta?.slug)) return "user_story"
    const funnel = funnelOf(t)
    if (isFeatureKanbanFunnel(funnel)) return "feature"
    if (isUserStoryKanbanFunnel(funnel)) return "user_story"
    return "other"
  }

  // Descendentes (BFS) a partir da raiz.
  const descendants: typeof tasks = []
  const queue = [...(byParent.get(rootId) ?? [])]
  while (queue.length) {
    const cur = queue.shift()!
    descendants.push(cur)
    for (const k of byParent.get(cur.id) ?? []) queue.push(k)
  }

  const features = descendants.filter((t) => classify(t) === "feature")
  const userStories = descendants.filter((t) => classify(t) === "user_story")
  const others = descendants.filter(
    (t) => t.parent_task_id === rootId && classify(t) === "other",
  )

  const avgPct = (list: typeof tasks): number => {
    if (list.length === 0) return 0
    let acc = 0
    let wsum = 0
    for (const t of list) {
      const pct = progressById.get(t.id) ?? (t.completed_at ? 100 : (t.percent_complete ?? 0))
      const h = Number(t.estimated_hours)
      const w = h > 0 ? h : 1
      acc += pct * w
      wsum += w
    }
    return wsum > 0 ? Math.round(acc / wsum) : 0
  }

  const bars: PlanningProgressBar[] = []
  if (features.length > 0) {
    bars.push({
      key: "feature",
      label: `${features.length} Feature${features.length === 1 ? "" : "s"}`,
      total: features.length,
      pct: avgPct(features),
    })
  }
  if (userStories.length > 0) {
    bars.push({
      key: "user_story",
      label: `${userStories.length} User ${userStories.length === 1 ? "Story" : "Stories"}`,
      total: userStories.length,
      pct: avgPct(userStories),
    })
  }
  if (others.length > 0) {
    bars.push({
      key: "other",
      label: `${others.length} ${others.length === 1 ? "outro" : "outros"}`,
      total: others.length,
      pct: avgPct(others),
    })
  }
  return bars
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

