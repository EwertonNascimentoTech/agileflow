import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import type { ProjectTask, ProjectDefaultFormField } from "@/api/projetos"
import { isProductOwnerPosition, type Person } from "@/api/teamops"
import type { User } from "@/types"
import { defaultSelectLabel } from "@/modules/projetos/defaultFormUtils"
import { requesterValuesMatchFilter } from "@/modules/projetos/cardFieldDisplay"

export const FILTERS_KEY = "projetos.board.filters"

/** Período de entrega (prazo / due_date) — só Feature e User Story. */
export type DeliveryPeriod = "this_week" | "next_week" | "this_month"

export const DELIVERY_PERIOD_OPTIONS: { value: DeliveryPeriod; label: string }[] = [
  { value: "this_week", label: "Essa semana" },
  { value: "next_week", label: "Próxima semana" },
  { value: "this_month", label: "Esse mês" },
]

export type BoardFilters = {
  q?: string
  assignees?: string[]
  productOwners?: string[]
  requisitantes?: string[]
  diretorias?: string[]
  /** IDs dos cards raiz (planning_kind projeto/programa) selecionados no filtro. */
  planningCards?: string[]
  areas?: string[]
  deliveryPeriod?: DeliveryPeriod | null
  /** IDs do cadastro de programas (linked_program_id); "__none__" = sem programa. */
  programIds?: string[]
}

export type BoardFilterState = {
  q: string
  assignees: string[]
  productOwners: string[]
  requisitantes: string[]
  requesterFieldKey: string
  formValuesByTask: Record<string, Record<string, unknown>>
  resolveRequisitanteLabel: (value: string) => string
  diretorias: string[]
  /** null = sem filtro de projeto/programa; Set = card selecionado + descendentes. */
  planningScopeIds: Set<string> | null
  areas: string[]
  /** null = sem filtro de período de entrega. */
  deliveryPeriod: DeliveryPeriod | null
  /** IDs de programa selecionados; vazio = sem filtro. */
  programIds: string[]
  /** Programa efetivo por card (próprio ou herdado do ancestral). */
  effectiveProgramByTaskId: Map<string, string | null>
  groupedChildIds: Set<string>
  /** PO efetivo por card (herdado do projeto/programa ancestral). */
  effectivePoByTaskId: Map<string, string | null>
  /** Solicitação → PO do projeto/programa convertido (origin_task_id). */
  poByOriginTaskId: Map<string, string>
  /** POs cuja área TeamOps casa com diretoria/área do formulário padrão. */
  matchPoIdsByForm: (diretoria: string | null, area: string | null) => string[]
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addLocalDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + n)
  return x
}

/** Segunda-feira da semana (local) que contém `ref`. */
export function startOfWeekMonday(ref: Date = new Date()): Date {
  const d = startOfLocalDay(ref)
  const day = d.getDay() // 0=domingo
  const diff = day === 0 ? -6 : 1 - day
  return addLocalDays(d, diff)
}

/** Interpreta due_date ISO como dia civil local (YYYY-MM-DD). */
export function parseDueLocalDay(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Intervalo [start, endExclusive) do período de entrega. */
export function deliveryPeriodRange(
  period: DeliveryPeriod,
  now: Date = new Date(),
): { start: Date; endExclusive: Date } {
  if (period === "this_week") {
    const start = startOfWeekMonday(now)
    return { start, endExclusive: addLocalDays(start, 7) }
  }
  if (period === "next_week") {
    const start = addLocalDays(startOfWeekMonday(now), 7)
    return { start, endExclusive: addLocalDays(start, 7) }
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const endExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start, endExclusive }
}

export function dueDateInDeliveryPeriod(
  dueDate: string | null | undefined,
  period: DeliveryPeriod | null,
  now: Date = new Date(),
): boolean {
  if (!period) return true
  const due = parseDueLocalDay(dueDate)
  if (!due) return false
  const { start, endExclusive } = deliveryPeriodRange(period, now)
  return due >= start && due < endExclusive
}

function parseStoredDeliveryPeriod(raw: unknown): DeliveryPeriod | null {
  if (raw === "this_week" || raw === "next_week" || raw === "this_month") return raw
  return null
}

export function loadFilters(): BoardFilters {
  try {
    return JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}") as BoardFilters
  } catch {
    return {}
  }
}

export function requesterValuesForTask(
  formValuesByTask: Record<string, Record<string, unknown>>,
  taskId: string,
  fieldKey: string,
): string[] {
  const raw = formValuesByTask[taskId]?.[fieldKey]
  if (raw === null || raw === undefined || raw === "") return ["__none__"]
  if (Array.isArray(raw)) {
    const items = raw.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    return items.length ? items : ["__none__"]
  }
  return [String(raw)]
}

/** Card selecionado + toda a subárvore de filhos (itens de programa, subtarefas, etc.). */
export function buildPlanningScopeIds(tasks: ProjectTask[], rootIds: string[]): Set<string> {
  const kids = new Map<string, string[]>()
  for (const t of tasks) {
    if (!t.parent_task_id) continue
    const list = kids.get(t.parent_task_id) ?? []
    list.push(t.id)
    kids.set(t.parent_task_id, list)
  }
  const scope = new Set<string>()
  const walk = (id: string) => {
    if (scope.has(id)) return
    scope.add(id)
    for (const kid of kids.get(id) ?? []) walk(kid)
  }
  for (const id of rootIds) walk(id)
  return scope
}

/**
 * Programa efetivo de cada card: `linked_program_id` próprio ou do ancestral
 * (projeto/programa na cadeia de pais). Features/US herdam do projeto pai.
 */
export function buildEffectiveProgramByTaskId(tasks: ProjectTask[]): Map<string, string | null> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const cache = new Map<string, string | null>()

  function resolve(taskId: string): string | null {
    if (cache.has(taskId)) return cache.get(taskId)!
    const task = byId.get(taskId)
    if (!task) {
      cache.set(taskId, null)
      return null
    }
    if (task.linked_program_id) {
      cache.set(taskId, task.linked_program_id)
      return task.linked_program_id
    }
    if (task.parent_task_id) {
      const v = resolve(task.parent_task_id)
      cache.set(taskId, v)
      return v
    }
    cache.set(taskId, null)
    return null
  }

  for (const t of tasks) resolve(t.id)
  return cache
}

/** PO efetivo de cada card: o `assigned_to` do projeto/programa ancestral.
 * Features, user stories etc. herdam do pai até achar um card `projeto`/`programa`.
 */
export function buildEffectivePoByTaskId(tasks: ProjectTask[]): Map<string, string | null> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const cache = new Map<string, string | null>()

  function resolve(taskId: string): string | null {
    if (cache.has(taskId)) return cache.get(taskId)!
    const task = byId.get(taskId)
    if (!task) {
      cache.set(taskId, null)
      return null
    }
    if (task.planning_kind === "projeto" || task.planning_kind === "programa") {
      const v = task.assigned_to ?? null
      cache.set(taskId, v)
      return v
    }
    if (task.parent_task_id) {
      const v = resolve(task.parent_task_id)
      cache.set(taskId, v)
      return v
    }
    cache.set(taskId, null)
    return null
  }

  for (const t of tasks) resolve(t.id)
  return cache
}

/** PO do projeto/programa gerado na conversão (origin_task_id → assigned_to). */
export function buildPoByOriginTaskId(tasks: ProjectTask[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const t of tasks) {
    if (
      (t.planning_kind === "projeto" || t.planning_kind === "programa")
      && t.origin_task_id
      && t.assigned_to
    ) {
      map.set(t.origin_task_id, t.assigned_to)
    }
  }
  return map
}

function normalizeFormLabel(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
}

/** POs cujo nome de área TeamOps contém a diretoria/área do card (solicitações em Prospectar). */
export function buildPoMatchByFormDimensions(
  poPersons: Person[],
  defaultFormFields: ProjectDefaultFormField[],
): (diretoria: string | null, area: string | null) => string[] {
  const poAreas = poPersons.map((p) => ({
    id: p.id,
    areaName: normalizeFormLabel(p.area?.name ?? ""),
  }))

  return (diretoria, area) => {
    const dirLabel = diretoria
      ? defaultSelectLabel(defaultFormFields, "diretoria", diretoria)
      : null
    const areaLabel = area
      ? defaultSelectLabel(defaultFormFields, "area", area)
      : null
    const out: string[] = []
    for (const po of poAreas) {
      if (!po.areaName) continue
      if (dirLabel && po.areaName.includes(normalizeFormLabel(dirLabel))) {
        out.push(po.id)
        continue
      }
      if (areaLabel && po.areaName.includes(normalizeFormLabel(areaLabel))) {
        out.push(po.id)
      }
    }
    return out
  }
}

/** Todos os PO candidatos de um card (herança, conversão, diretoria/área). */
export function poCandidateIdsForTask(
  task: ProjectTask,
  f: Pick<BoardFilterState, "effectivePoByTaskId" | "poByOriginTaskId" | "matchPoIdsByForm">,
): string[] {
  const ids = new Set<string>()
  const inherited = f.effectivePoByTaskId.get(task.id)
  if (inherited) ids.add(inherited)
  const fromOrigin = f.poByOriginTaskId.get(task.id)
  if (fromOrigin) ids.add(fromOrigin)
  if (task.assigned_to && (task.planning_kind === "projeto" || task.planning_kind === "programa")) {
    ids.add(task.assigned_to)
  }
  for (const pid of f.matchPoIdsByForm(task.diretoria, task.area)) ids.add(pid)
  return [...ids]
}

export function taskMatches(t: ProjectTask, f: BoardFilterState): boolean {
  const q = f.q.trim().toLowerCase()
  if (q && !t.title.toLowerCase().includes(q)) return false
  if (f.assignees.length && !f.assignees.includes(t.assigned_to ?? "__none__")) return false
  if (f.productOwners.length) {
    const candidates = poCandidateIdsForTask(t, f)
    const matched = f.productOwners.some((po) => candidates.includes(po))
    if (!matched) {
      if (f.productOwners.includes("__none__") && candidates.length === 0) {
        // sem PO identificado
      } else {
        return false
      }
    }
  }
  if (f.requisitantes.length) {
    const vals = requesterValuesForTask(f.formValuesByTask, t.id, f.requesterFieldKey)
    if (!requesterValuesMatchFilter(vals, f.requisitantes, f.resolveRequisitanteLabel)) return false
  }
  if (f.diretorias.length && !f.diretorias.includes(t.diretoria ?? "__none__")) return false
  if (f.planningScopeIds && !f.planningScopeIds.has(t.id)) return false
  if (f.areas.length && !(t.area ? f.areas.includes(t.area) : false)) return false
  if (f.deliveryPeriod && !dueDateInDeliveryPeriod(t.due_date, f.deliveryPeriod)) return false
  if (f.programIds.length) {
    const prog = f.effectiveProgramByTaskId.get(t.id) ?? null
    const key = prog ?? "__none__"
    if (!f.programIds.includes(key)) return false
  }
  // Esconde itens-filhos agrupados no mesmo kanban — exceto quando há escopo de projeto/programa.
  if (!f.planningScopeIds && f.groupedChildIds.has(t.id)) return false
  return true
}

export function personsToUsers(persons: Person[]): User[] {
  return persons.map((p) => ({ id: p.id, full_name: p.full_name, email: p.email ?? "" })) as User[]
}

export function productOwnerPersons(persons: Person[]): Person[] {
  return persons.filter((p) => isProductOwnerPosition(p.position?.slug, p.position?.name))
}

/** Cards raiz (projeto/programa) para o filtro do quadro. */
export function planningRootTasks(tasks: ProjectTask[]): ProjectTask[] {
  return tasks.filter((t) => t.planning_kind === "projeto" || t.planning_kind === "programa")
}

/** Restringe projetos/programas ao PO selecionado (assigned_to do card raiz). */
export function filterPlanningRootsByPo(roots: ProjectTask[], productOwnerIds: string[]): ProjectTask[] {
  if (productOwnerIds.length === 0) return roots
  return roots.filter((t) => productOwnerIds.includes(t.assigned_to ?? "__none__"))
}

/** Filtros do quadro/lista/calendário persistidos no localStorage. */
export function usePersistedTaskFilters(_groupedChildIds: Set<string>, tasks: ProjectTask[]) {
  const [searchQuery, setSearchQuery] = useState(() => loadFilters().q ?? "")
  const [assignees, setAssignees] = useState<string[]>(() => loadFilters().assignees ?? [])
  const [productOwners, setProductOwners] = useState<string[]>(() => loadFilters().productOwners ?? [])
  const [requisitantes, setRequisitantes] = useState<string[]>(() => loadFilters().requisitantes ?? [])
  const [diretorias, setDiretorias] = useState<string[]>(() => loadFilters().diretorias ?? [])
  const [planningCards, setPlanningCards] = useState<string[]>(() => loadFilters().planningCards ?? [])
  const [areas, setAreas] = useState<string[]>(() => loadFilters().areas ?? [])
  const [deliveryPeriod, setDeliveryPeriod] = useState<DeliveryPeriod | null>(
    () => parseStoredDeliveryPeriod(loadFilters().deliveryPeriod),
  )
  const [programIds, setProgramIds] = useState<string[]>(() => loadFilters().programIds ?? [])

  useEffect(() => {
    try {
      localStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({
          q: searchQuery,
          assignees,
          productOwners,
          requisitantes,
          diretorias,
          planningCards,
          areas,
          deliveryPeriod,
          programIds,
        }),
      )
    } catch { /* ignore */ }
  }, [searchQuery, assignees, productOwners, requisitantes, diretorias, planningCards, areas, deliveryPeriod, programIds])

  const planningScopeIds = planningCards.length > 0
    ? buildPlanningScopeIds(tasks, planningCards)
    : null

  const hasFilters = !!(
    searchQuery.trim()
    || assignees.length
    || productOwners.length
    || requisitantes.length
    || diretorias.length
    || planningCards.length
    || areas.length
    || deliveryPeriod
    || programIds.length
  )

  function clearFilters() {
    setSearchQuery("")
    setAssignees([])
    setProductOwners([])
    setRequisitantes([])
    setDiretorias([])
    setPlanningCards([])
    setAreas([])
    setDeliveryPeriod(null)
    setProgramIds([])
  }

  function toggleMulti(
    setter: Dispatch<SetStateAction<string[]>>,
    current: string[],
    val: string,
  ) {
    setter(current.includes(val) ? current.filter((x) => x !== val) : [...current, val])
  }

  return {
    searchQuery,
    setSearchQuery,
    assignees,
    setAssignees,
    productOwners,
    setProductOwners,
    requisitantes,
    setRequisitantes,
    diretorias,
    setDiretorias,
    planningCards,
    setPlanningCards,
    areas,
    setAreas,
    deliveryPeriod,
    setDeliveryPeriod,
    programIds,
    setProgramIds,
    planningScopeIds,
    hasFilters,
    clearFilters,
    toggleMulti,
  }
}
