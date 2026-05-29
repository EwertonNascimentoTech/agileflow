import { useEffect, useState } from "react"
import type { ProjectTask } from "@/api/projetos"
import { isProductOwnerPosition, type TeamMember } from "@/api/teamops"
import type { User } from "@/types"

export const FILTERS_KEY = "projetos.board.filters"

export type BoardFilters = {
  q?: string
  assignees?: string[]
  types?: string[]
  slas?: string[]
  diretorias?: string[]
  areas?: string[]
  productOwners?: string[]
}

export type BoardFilterState = {
  q: string
  assignees: string[]
  types: string[]
  slas: string[]
  diretorias: string[]
  areas: string[]
  productOwners: string[]
}

export function loadFilters(): BoardFilters {
  try {
    return JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}") as BoardFilters
  } catch {
    return {}
  }
}

export function taskMatches(t: ProjectTask, f: BoardFilterState): boolean {
  const q = f.q.trim().toLowerCase()
  if (q && !t.title.toLowerCase().includes(q)) return false
  if (f.assignees.length && !f.assignees.includes(t.assigned_to ?? "__none__")) return false
  if (f.productOwners.length && !f.productOwners.includes(t.assigned_to ?? "__none__")) return false
  if (f.types.length && !(t.demand_type_id ? f.types.includes(t.demand_type_id) : false)) return false
  if (f.slas.length && !f.slas.includes(t.sla_state)) return false
  if (f.diretorias.length && !(t.diretoria ? f.diretorias.includes(t.diretoria) : false)) return false
  if (f.areas.length && !(t.area ? f.areas.includes(t.area) : false)) return false
  return true
}

export function membersToUsers(members: TeamMember[]): User[] {
  return members.map((m) => ({ id: m.id, full_name: m.full_name, email: m.email })) as User[]
}

export function productOwnerMembers(members: TeamMember[]): TeamMember[] {
  return members.filter((m) => isProductOwnerPosition(m.position_slug, m.position_name))
}

/** Filtros do quadro/cronograma persistidos no localStorage (compartilhados entre visões). */
export function usePersistedTaskFilters() {
  const [searchQuery, setSearchQuery] = useState(() => loadFilters().q ?? "")
  const [assignees, setAssignees] = useState<string[]>(() => loadFilters().assignees ?? [])
  const [types, setTypes] = useState<string[]>(() => loadFilters().types ?? [])
  const [slas, setSlas] = useState<string[]>(() => loadFilters().slas ?? [])
  const [diretorias, setDiretorias] = useState<string[]>(() => loadFilters().diretorias ?? [])
  const [areas, setAreas] = useState<string[]>(() => loadFilters().areas ?? [])
  const [productOwners, setProductOwners] = useState<string[]>(() => loadFilters().productOwners ?? [])

  useEffect(() => {
    try {
      localStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({
          q: searchQuery,
          assignees,
          types,
          slas,
          diretorias,
          areas,
          productOwners,
        }),
      )
    } catch { /* ignore */ }
  }, [searchQuery, assignees, types, slas, diretorias, areas, productOwners])

  const filterState: BoardFilterState = {
    q: searchQuery,
    assignees,
    types,
    slas,
    diretorias,
    areas,
    productOwners,
  }
  const hasFilters = !!(
    searchQuery.trim()
    || assignees.length
    || types.length
    || slas.length
    || diretorias.length
    || areas.length
    || productOwners.length
  )

  function clearFilters() {
    setSearchQuery("")
    setAssignees([])
    setTypes([])
    setSlas([])
    setDiretorias([])
    setAreas([])
    setProductOwners([])
  }

  function toggleMulti(
    setter: React.Dispatch<React.SetStateAction<string[]>>,
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
    types,
    setTypes,
    slas,
    setSlas,
    diretorias,
    setDiretorias,
    areas,
    setAreas,
    productOwners,
    setProductOwners,
    filterState,
    hasFilters,
    clearFilters,
    toggleMulti,
  }
}
