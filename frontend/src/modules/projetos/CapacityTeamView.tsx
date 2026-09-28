import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowLeftRight, CalendarClock, Gauge, Loader2, ShieldAlert, UserPlus, Users } from "lucide-react"

import {
  projetosApi,
  type CapacityByProjectResponse,
  type CapacityHeatmapResponse,
  type CrossTeamResponse,
} from "@/api/projetos"
import { teamopsApi, type Area, type Person } from "@/api/teamops"
import { EmptyState } from "@/components/EmptyState"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, KpiCount, KpiRow, Pill, SectionCard } from "@/components/ds"
import { CapacityDayDetailDialog } from "@/modules/projetos/CapacityDayDetailDialog"
import { WorkloadView } from "@/modules/projetos/WorkloadView"

// Ordena o elenco: PO e Referência Técnica primeiro, depois o resto.
function cargoRank(slug: string | undefined): number {
  if (!slug) return 9
  if (slug.includes("product_owner") || slug === "po") return 0
  if (slug.includes("refer") || slug.includes("tech")) return 1
  if (slug.includes("coord")) return 2
  if (slug.includes("gerente") || slug.includes("manager")) return 3
  return 5
}

/** Barra demanda×capacidade de um projeto do time. */
function ProjectBar({
  label, demand, capacity, max, over, overloadedPeople, peopleCount,
}: {
  label: string; demand: number; capacity: number; max: number; over: boolean; overloadedPeople: number; peopleCount: number
}) {
  const demandPct = max > 0 ? Math.max(2, Math.round((demand / max) * 100)) : 0
  const capPct = max > 0 ? Math.min(100, Math.round((capacity / max) * 100)) : 0
  const color = over ? "#ef4444" : overloadedPeople > 0 ? "#f59e0b" : "hsl(var(--primary))"
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{Math.round(demand)}h / {Math.round(capacity)}h</span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 rounded-full bg-foreground/15" style={{ width: `${capPct}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${demandPct}%`, backgroundColor: color }} />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{peopleCount} pessoa(s)</span>
        {overloadedPeople > 0 && <span className="text-amber-600 dark:text-amber-400">{overloadedPeople} sobrecarregada(s)</span>}
        {over && <span className="font-medium text-destructive">demanda &gt; capacidade</span>}
      </div>
    </div>
  )
}

export function CapacityTeamView({ from, to }: { from: string; to: string }) {
  const [areas, setAreas] = useState<Area[]>([])
  const [areaId, setAreaId] = useState<string>("")
  const [roster, setRoster] = useState<Person[]>([])
  const [heatmap, setHeatmap] = useState<CapacityHeatmapResponse | null>(null)
  const [projects, setProjects] = useState<CapacityByProjectResponse | null>(null)
  const [crossTeam, setCrossTeam] = useState<CrossTeamResponse | null>(null)
  const [loading, setLoading] = useState(false)
  // Célula do heatmap aberta no modal de detalhamento do dia.
  const [dayDetail, setDayDetail] = useState<{ personId: string; date: string } | null>(null)

  useEffect(() => {
    teamopsApi.listAreas(true).then(setAreas).catch(() => setAreas([]))
  }, [])

  useEffect(() => {
    if (!areaId) return
    let alive = true
    setLoading(true)
    Promise.all([
      teamopsApi.listPersons({ area_id: areaId }).catch(() => [] as Person[]),
      projetosApi.getCapacityHeatmap({ from, to, area: areaId }).catch(() => null),
      projetosApi.getCapacityByProject({ from, to, area: areaId }).catch(() => null),
      projetosApi.getCrossTeam({ from, to }).catch(() => null),
    ]).then(([r, h, p, ct]) => {
      if (!alive) return
      setRoster(r)
      setHeatmap(h)
      setProjects(p)
      setCrossTeam(ct)
    }).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [areaId, from, to])

  const team = useMemo(
    () => [...roster]
      .filter((p) => p.status !== "desligado")
      .sort((a, b) => cargoRank(a.position?.slug) - cargoRank(b.position?.slug) || a.full_name.localeCompare(b.full_name)),
    [roster],
  )

  const nameFor = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of heatmap?.persons ?? []) m.set(p.id, p.full_name)
    return (id: string) => m.get(id) ?? `Sem pessoa (${id.slice(0, 8)})`
  }, [heatmap])

  const projMax = useMemo(
    () => Math.max(1, ...(projects?.rows ?? []).map((r) => Math.max(r.demand_hours, r.capacity_hours))),
    [projects],
  )

  // Vazamento entre times, derivado do resultado global de cross-team para o time selecionado.
  const { lentOut, helpIn } = useMemo(() => {
    const rows = crossTeam?.rows ?? []
    const out = rows
      .filter((r) => r.home_area_ids.includes(areaId) && r.away_hours > 0)
      .sort((a, b) => b.away_hours - a.away_hours)
    const inn = rows
      .filter((r) => !r.home_area_ids.includes(areaId))
      .map((r) => {
        const item = r.away_by_team.find((a) => a.team_area_id === areaId)
        return item ? { row: r, hours: item.hours } : null
      })
      .filter((x): x is { row: (typeof rows)[number]; hours: number } => x !== null)
      .sort((a, b) => b.hours - a.hours)
    return { lentOut: out, helpIn: inn }
  }, [crossTeam, areaId])

  const areaName = areas.find((a) => a.id === areaId)?.name
  const summary = heatmap?.summary
  const overCells = summary?.overallocated_cells ?? 0

  return (
    <div className="space-y-5">
      {/* Escolha do time: mesmo formato do FilterSelect, mas com placeholder (começa sem time). */}
      <Card className="p-4">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Time (área)</span>
          <Select value={areaId} onValueChange={setAreaId}>
            <SelectTrigger className="h-10 w-[320px] max-w-full bg-background"><SelectValue placeholder="Escolha um time…" /></SelectTrigger>
            <SelectContent>
              {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
      </Card>

      {!areaId ? (
        <EmptyState icon={Users} title="Escolha um time"
          description="Selecione uma área acima para ver o elenco, a capacidade e os projetos desse time." />
      ) : loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Carregando {areaName}…
        </div>
      ) : (
        <>
          {/* Elenco do time */}
          <SectionCard title={`Elenco — ${areaName}`} icon={Users}>
            {team.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {team.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.position?.name ?? "—"}</p>
                    </div>
                    {p.status === "ferias" && <Pill tone="amber" className="shrink-0">Férias</Pill>}
                    {p.status === "afastado" && <Pill tone="slate" className="shrink-0">Afastado</Pill>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma pessoa ativa nesse time.</p>
            )}
          </SectionCard>

          {/* KPIs do time */}
          <KpiRow className="sm:grid-cols-2 xl:grid-cols-4">
            <KpiCount icon={Users} value={team.length} label="Pessoas no time" />
            <KpiCount icon={AlertTriangle} value={overCells}
              label={`Dias/pessoa em sobrecarga · ${summary?.persons_over ?? 0} em risco`}
              tone={overCells > 0 ? "red" : "emerald"} highlight={overCells > 0} />
            <KpiCount icon={CalendarClock} value={`${Math.round(summary?.total_allocated_h ?? 0)}h`} label="Horas alocadas" />
            <KpiCount icon={Gauge} value={`${Math.round(summary?.total_capacity_h ?? 0)}h`} label="Capacidade total" />
          </KpiRow>

          {/* Capacidade do time */}
          <SectionCard title="Capacidade do time (todos os projetos)" icon={Gauge}>
            {heatmap && (heatmap.cells.length > 0 || heatmap.persons.length > 0) ? (
              <WorkloadView
                cells={heatmap.cells}
                reserves={heatmap.reserves}
                people={heatmap.persons}
                nameForUser={nameFor}
                dateFrom={from}
                dateTo={to}
                onCellClick={(personId, date) => setDayDetail({ personId, date })}
              />
            ) : (
              <EmptyState icon={Users} title="Sem carga no período"
                description="Ninguém do time tem tarefas com responsável, horas e datas no intervalo. Ajuste o período." />
            )}
          </SectionCard>

          {/* Projetos do time */}
          <SectionCard
            title="Projetos do time (onde as pessoas estão alocadas)"
            subtitle={projects && projects.rows.length > 0
              ? "Projetos em que pessoas deste time têm tarefas no período. Barra colorida = demanda das pessoas do time nesse projeto; cinza = capacidade total delas (compartilhada com outros projetos)."
              : undefined}
          >
            {projects && projects.rows.length > 0 ? (
              <div className="space-y-4">
                {projects.rows.map((r) => (
                  <ProjectBar key={r.project_id} label={r.project_name} demand={r.demand_hours} capacity={r.capacity_hours}
                    max={projMax} over={r.overallocated} overloadedPeople={r.overloaded_people} peopleCount={r.people_count} />
                ))}
              </div>
            ) : (
              <EmptyState icon={Gauge} title="Sem projetos no período"
                description="Nenhuma tarefa agendada das pessoas deste time no intervalo selecionado." />
            )}
          </SectionCard>

          {/* Vazamento entre times */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="Meu pessoal emprestado"
              subtitle={lentOut.length > 0 ? "Pessoas deste time gastando horas em projetos de outros times." : undefined}
              icon={ArrowLeftRight}
            >
              {lentOut.length > 0 ? (
                <div className="space-y-2">
                  {lentOut.map((r) => (
                    <div key={r.person_id} className="flex items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.full_name}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.away_by_team.map((a) => (
                            <Pill key={a.team_area_id ?? a.team_name} tone="slate">
                              {a.team_name}: {Math.round(a.hours)}h
                            </Pill>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-medium text-destructive">{Math.round(r.away_hours)}h fora</div>
                        {r.at_risk && <Pill tone="red" className="mt-1"><ShieldAlert size={12} />Risco</Pill>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={ArrowLeftRight} title="Ninguém emprestado"
                  description="Ninguém deste time está gastando horas em projetos de outros times no período." />
              )}
            </SectionCard>

            <SectionCard
              title="Reforço de fora"
              subtitle={helpIn.length > 0 ? "Pessoas de outros times trabalhando em projetos deste time." : undefined}
              icon={UserPlus}
            >
              {helpIn.length > 0 ? (
                <div className="space-y-2">
                  {helpIn.map(({ row, hours }) => (
                    <div key={row.person_id} className="flex items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.home_area_names.length > 0 ? row.home_area_names.join(", ") : "sem time"}
                        </p>
                      </div>
                      <div className="shrink-0 text-sm font-medium text-emerald-600 dark:text-emerald-400">{Math.round(hours)}h</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={UserPlus} title="Sem reforço externo"
                  description="Nenhuma pessoa de outros times está trabalhando em projetos deste time no período." />
              )}
            </SectionCard>
          </div>
        </>
      )}

      <CapacityDayDetailDialog
        personId={dayDetail?.personId ?? null}
        date={dayDetail?.date ?? null}
        personName={dayDetail ? nameFor(dayDetail.personId) : undefined}
        onClose={() => setDayDetail(null)}
      />
    </div>
  )
}

export default CapacityTeamView
