import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import type { ProjectTask } from "@/api/projetos"
import { isProductOwnerPosition, type Person } from "@/api/teamops"
import type { User } from "@/types"
import { requesterValuesMatchFilter } from "@/modules/projetos/cardFieldDisplay"

export const FILTERS_KEY = "projetos.board.filters"

export type BoardFilters = {
  q?: string
  assignees?: string[]
  productOwners?: string[]
  requisitantes?: string[]
  diretorias?: string[]
  /** IDs dos cards raiz (planning_kind projeto/programa) selecionados no filtro. */
  planningCards?: string[]
  areas?: string[]
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
  groupedChildIds: Set<string>
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

export function taskMatches(t: ProjectTask, f: BoardFilterState): boolean {
  const q = f.q.trim().toLowerCase()
  if (q && !t.title.toLowerCase().includes(q)) return false
  if (f.assignees.length && !f.assignees.includes(t.assigned_to ?? "__none__")) return false
  if (f.productOwners.length && !f.productOwners.includes(t.assigned_to ?? "__none__")) return false
  if (f.requisitantes.length) {
    const vals = requesterValuesForTask(f.formValuesByTask, t.id, f.requesterFieldKey)
    if (!requesterValuesMatchFilter(vals, f.requisitantes, f.resolveRequisitanteLabel)) return false
  }
  if (f.diretorias.length && !f.diretorias.includes(t.diretoria ?? "__none__")) return false
  if (f.planningScopeIds && !f.planningScopeIds.has(t.id)) return false
  if (f.areas.length && !(t.area ? f.areas.includes(t.area) : false)) return false
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

/** Filtros do quadro/lista/calendário persistidos no localStorage. */
export function usePersistedTaskFilters(_groupedChildIds: Set<string>, tasks: ProjectTask[]) {
  const [searchQuery, setSearchQuery] = useState(() => loadFilters().q ?? "")
  const [assignees, setAssignees] = useState<string[]>(() => loadFilters().assignees ?? [])
  const [productOwners, setProductOwners] = useState<string[]>(() => loadFilters().productOwners ?? [])
  const [requisitantes, setRequisitantes] = useState<string[]>(() => loadFilters().requisitantes ?? [])
  const [diretorias, setDiretorias] = useState<string[]>(() => loadFilters().diretorias ?? [])
  const [planningCards, setPlanningCards] = useState<string[]>(() => loadFilters().planningCards ?? [])
  const [areas, setAreas] = useState<string[]>(() => loadFilters().areas ?? [])

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
        }),
      )
    } catch { /* ignore */ }
  }, [searchQuery, assignees, productOwners, requisitantes, diretorias, planningCards, areas])

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
  )

  function clearFilters() {
    setSearchQuery("")
    setAssignees([])
    setProductOwners([])
    setRequisitantes([])
    setDiretorias([])
    setPlanningCards([])
    setAreas([])
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
    planningScopeIds,
    hasFilters,
    clearFilters,
    toggleMulti,
  }
}
