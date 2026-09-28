import { useEffect, useMemo, useState } from "react"
import { AllocationSplitBar, allocationSplit } from "@/modules/teamops/AllocationSplit"
import { Link } from "react-router-dom"
import { CalendarOff, HeartPulse, KeyRound, Search, Trash2, UserCheck, UserPlus, UserX, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Card, FilterSelect, KpiCount, KpiRow, PageHeader, Pill, SectionCard, TABLE, type Tone } from "@/components/ds"
import {
  teamopsApi,
  PERSON_STATUS_LABELS,
  personAreasLabel,
  personPosLabel,
  type Area,
  type Person,
  type PersonStatus,
  type Position,
} from "@/api/teamops"
import { PersonFormDialog } from "./PersonFormDialog"
import { useAuth } from "@/contexts/AuthContext"
import { canManageTeamopsPeople } from "@/lib/permissions"

const NONE = "__none__"

/** Selo do status da pessoa (mesmas cores de antes: ativo verde, desligado vermelho, demais âmbar). */
const STATUS_TONE: Record<PersonStatus, Tone> = { ativo: "emerald", ferias: "amber", afastado: "amber", desligado: "red" }

export default function PeoplePage() {
  const { user } = useAuth()
  const canManage = canManageTeamopsPeople(user)
  const [people, setPeople] = useState<Person[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [areaFilter, setAreaFilter] = useState<string>(NONE)
  const [positionFilter, setPositionFilter] = useState<string>(NONE)
  const [statusFilter, setStatusFilter] = useState<string>(NONE)
  const [editing, setEditing] = useState<Person | null>(null)
  const [creating, setCreating] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (search) params.search = search
      if (areaFilter !== NONE) params.area_id = areaFilter
      if (positionFilter !== NONE) params.position_id = positionFilter
      if (statusFilter !== NONE) params.status = statusFilter
      const [ps, as, pos] = await Promise.all([
        teamopsApi.listPersons(params as any),
        teamopsApi.listAreas(),
        teamopsApi.listPositions(true),
      ])
      setPeople(ps)
      setAreas(as)
      setPositions(pos)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, areaFilter, positionFilter, statusFilter])

  const total = useMemo(() => people.length, [people])

  // Indicadores do topo: contam a lista atual (já com os filtros); os de status ligam/desligam o
  // mesmo filtro de Status da barra abaixo.
  const counts = useMemo(() => ({
    ativo: people.filter((p) => p.status === "ativo").length,
    ferias: people.filter((p) => p.status === "ferias").length,
    afastado: people.filter((p) => p.status === "afastado").length,
    desligado: people.filter((p) => p.status === "desligado").length,
    comAcesso: people.filter((p) => p.access_level !== "none").length,
  }), [people])

  function toggleStatus(s: PersonStatus) {
    setStatusFilter((cur) => (cur === s ? NONE : s))
  }

  return (
    <div className="space-y-5 p-4">
      <PageHeader
        icon={Users}
        color="#0891B2"
        title="Pessoas"
        description="Diretório do time: cargo, área, PO, divisão da jornada e acesso ao sistema. Clique no nome para abrir a ficha."
        actions={
          canManage ? (
            <Button className="h-10 gap-1.5" onClick={() => setCreating(true)}>
              <UserPlus size={16} /> Nova pessoa
            </Button>
          ) : undefined
        }
      />

      <KpiRow className="sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCount icon={Users} value={total} label="Pessoas na lista" />
        <KpiCount
          icon={UserCheck} value={counts.ativo} label={PERSON_STATUS_LABELS.ativo} tone="emerald"
          onClick={() => toggleStatus("ativo")} active={statusFilter === "ativo"}
        />
        <KpiCount
          icon={CalendarOff} value={counts.ferias} label={PERSON_STATUS_LABELS.ferias} tone={counts.ferias > 0 ? "amber" : "slate"}
          onClick={() => toggleStatus("ferias")} active={statusFilter === "ferias"}
        />
        <KpiCount
          icon={HeartPulse} value={counts.afastado} label={PERSON_STATUS_LABELS.afastado} tone={counts.afastado > 0 ? "amber" : "slate"}
          onClick={() => toggleStatus("afastado")} active={statusFilter === "afastado"}
        />
        <KpiCount
          icon={UserX} value={counts.desligado} label={PERSON_STATUS_LABELS.desligado} tone={counts.desligado > 0 ? "red" : "slate"}
          onClick={() => toggleStatus("desligado")} active={statusFilter === "desligado"}
        />
        <KpiCount icon={KeyRound} value={counts.comAcesso} label="Com acesso ao sistema" tone="violet" />
      </KpiRow>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[240px] flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">Buscar</span>
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou e-mail…"
                className="h-10 w-full rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </span>
          </label>
          <FilterSelect
            label="Área" value={areaFilter} onChange={setAreaFilter}
            options={[{ value: NONE, label: "Todas as áreas" }, ...areas.map((a) => ({ value: a.id, label: a.name }))]}
          />
          <FilterSelect
            label="Cargo" value={positionFilter} onChange={setPositionFilter}
            options={[{ value: NONE, label: "Todos os cargos" }, ...positions.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <FilterSelect
            label="Status" value={statusFilter} onChange={setStatusFilter}
            options={[{ value: NONE, label: "Todos status" }, ...Object.entries(PERSON_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))]}
          />
        </div>
      </Card>

      <SectionCard
        title="Lista do time"
        icon={Users}
        right={
          <span className="text-sm text-muted-foreground">
            <strong className="font-semibold text-foreground">{total}</strong> pessoa{total === 1 ? "" : "s"} cadastrada{total === 1 ? "" : "s"}.
          </span>
        }
        flush
      >
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : people.length === 0 ? (
          <EmptyState icon={Users} title="Nenhuma pessoa encontrada." compact />
        ) : (
          <div className={TABLE.wrap}>
            <table className={`${TABLE.table} min-w-[960px]`}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Nome</th>
                  <th className={TABLE.th}>Cargo</th>
                  <th className={TABLE.th}>Área</th>
                  <th className={TABLE.th}>PO</th>
                  <th className={TABLE.th} title="Projetos / Operação Assistida / Chamados">Jornada</th>
                  <th className={TABLE.th}>Acesso</th>
                  <th className={TABLE.th}>Status</th>
                  <th className={TABLE.th}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className={TABLE.tr}>
                    <td className={TABLE.tdFirst}>
                      <Link to={`/app/modules/teamops/people/${p.id}`} className="font-semibold hover:text-primary hover:underline">
                        {p.full_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                    </td>
                    <td className={TABLE.td}>{p.position?.name ?? "—"}</td>
                    <td className={`${TABLE.td} text-muted-foreground`}>{personAreasLabel(p)}</td>
                    <td className={`${TABLE.td} text-muted-foreground`}>{personPosLabel(p)}</td>
                    <td className={TABLE.td}>
                      <AllocationSplitBar
                        compact
                        split={allocationSplit(p.daily_hours, p.project_allocation_pct, p.assisted_ops_allocation_pct)}
                      />
                    </td>
                    <td className={TABLE.td}>
                      {p.access_level === "none" ? (
                        <span className="text-xs text-muted-foreground">Sem acesso</span>
                      ) : (
                        <Pill tone={p.user_active === false ? "slate" : "blue"}>
                          Com acesso{p.user_active === false ? " (inativo)" : ""}
                        </Pill>
                      )}
                    </td>
                    <td className={TABLE.td}>
                      <Pill tone={STATUS_TONE[p.status]} dot>{PERSON_STATUS_LABELS[p.status]}</Pill>
                    </td>
                    <td className={`${TABLE.td} text-right`}>
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>Editar</Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            title="Excluir pessoa"
                            aria-label={`Excluir ${p.full_name}`}
                            onClick={async () => {
                              if (!confirm(`Excluir permanentemente "${p.full_name}"?\n\nAusências e stacks vinculadas também serão removidas; vínculos no organograma viram nulos.`)) return
                              try {
                                await teamopsApi.deletePerson(p.id)
                                refresh()
                              } catch (err: any) {
                                alert(err?.response?.data?.detail ?? "Erro ao excluir.")
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {canManage && (creating || editing) && (
        <PersonFormDialog
          person={editing}
          areas={areas}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
