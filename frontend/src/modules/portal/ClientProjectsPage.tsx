import { useEffect, useMemo, useState } from "react"
import { FolderKanban, Search } from "lucide-react"

import type { PortalHealth, PortalPortfolio, PortalStatus } from "@/api/portalPortfolio"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { apiErrorDetail } from "@/modules/portal/occurrenceUi"
import { PortfolioTable } from "@/modules/portal/PortfolioTable"
import { Card, FilterSelect } from "@/modules/portal/portfolioUi"
import { HEALTH, loadPortfolio, STATUS } from "@/modules/portal/portfolioMeta"

const ALL = "__all__"
const NONE = "__none__"

/** Todos os projetos que o cliente acompanha, em lista, com filtros. */
export default function ClientProjectsPage() {
  const [data, setData] = useState<PortalPortfolio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [program, setProgram] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [health, setHealth] = useState(ALL)
  const [q, setQ] = useState("")

  useEffect(() => {
    loadPortfolio()
      .then(setData)
      .catch((err) => setError(apiErrorDetail(err, "Não foi possível carregar os projetos.")))
      .finally(() => setLoading(false))
  }, [])

  const projects = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (data?.projects ?? []).filter((p) => {
      if (program === NONE ? p.program_id !== null : program !== ALL && p.program_id !== program) return false
      if (status !== ALL && p.status !== status) return false
      if (health !== ALL && p.health !== health) return false
      if (term && !`${p.title} ${p.subtitle ?? ""} ${p.program_name ?? ""}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [data, program, status, health, q])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Projetos</h1>
        <p className="text-sm text-muted-foreground">Todos os projetos que você acompanha. Clique num projeto para ver o andamento.</p>
      </div>
      {loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : !data || data.projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="Nenhum projeto vinculado"
            description={error ?? "Peça ao Product Owner para vincular o seu cadastro a um projeto ou programa."}
          />
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-end gap-3 border-b p-4">
            <FilterSelect
              label="Programa" value={program} onChange={setProgram}
              options={[
                { value: ALL, label: "Todos" },
                ...data.programs.map((g) => ({ value: g.id, label: g.name })),
                { value: NONE, label: "Sem programa" },
              ]}
            />
            <FilterSelect
              label="Status" value={status} onChange={setStatus}
              options={[{ value: ALL, label: "Todos" }, ...(Object.keys(STATUS) as PortalStatus[]).map((k) => ({ value: k, label: STATUS[k].label }))]}
            />
            <FilterSelect
              label="Saúde" value={health} onChange={setHealth}
              options={[{ value: ALL, label: "Todas" }, ...(Object.keys(HEALTH) as PortalHealth[]).map((k) => ({ value: k, label: HEALTH[k].label }))]}
            />
            <div className="relative ml-auto">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar projeto…" aria-label="Buscar projeto"
                className="h-10 w-60 rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <PortfolioTable
            projects={projects}
            programs={data.programs}
            quadrants={data.quadrants}
            grouped={false}
            expanded={new Set()}
            onToggle={() => undefined}
          />
        </Card>
      )}
    </div>
  )
}
