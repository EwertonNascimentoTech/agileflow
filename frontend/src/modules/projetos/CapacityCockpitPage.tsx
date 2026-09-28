import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowLeftRight, Building2, CalendarClock, FlaskConical, Gauge, TrendingUp, UserCog, UserPlus, Users, UserSearch } from "lucide-react"

import {
  projetosApi,
  type CapacityByProjectResponse,
  type CapacityGapsResponse,
  type CapacityHeatmapResponse,
  type FreePeopleResponse,
} from "@/api/projetos"
import { teamopsApi, type Area, type Position, type Stack } from "@/api/teamops"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card, DetailTabs, FilterSelect, KpiCount, KpiRow, Notice, PageHeader, Pill, SectionCard, TABLE, type TabDef,
} from "@/components/ds"
import { CapacityDayDetailDialog } from "@/modules/projetos/CapacityDayDetailDialog"
import { WorkloadView } from "@/modules/projetos/WorkloadView"
import { CapacitySimulator } from "@/modules/projetos/CapacitySimulator"
import { CapacityTeamView } from "@/modules/projetos/CapacityTeamView"
import { CapacityCrossTeamView } from "@/modules/projetos/CapacityCrossTeamView"

const ALL = "__all__" // sentinela: sem filtro (Radix proíbe value="")

type Lens = "person" | "team" | "project" | "gaps" | "free" | "crossteam" | "sim"

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}
function fmtWeek(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

/** Barra demanda×capacidade de um projeto (lente por projeto). */
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

/** Barra de utilização de uma pessoa (lente pessoas livres). */
function UtilBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  const color = pct > 100 ? "#ef4444" : pct > 80 ? "#f59e0b" : "#22c55e"
  return (
    <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${clamped}%`, backgroundColor: color }} />
    </div>
  )
}

/** "AAAA-MM-DD a AAAA-MM-DD (Tipo)" da API → "De férias até 01/10" (em curso) ou "Férias 02/10–16/10". */
function ProximaAusencia({ texto, hoje }: { texto: string | null | undefined; hoje: string }) {
  const m = /^(\d{4}-\d{2}-\d{2}) a (\d{4}-\d{2}-\d{2}) \((.+)\)$/.exec(texto ?? "")
  if (!m) return <>{texto ?? "—"}</>
  const [, ini, fim, tipo] = m
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  if (ini <= hoje && hoje <= fim) return <Pill tone="blue">De {tipo.toLowerCase()} até {dm(fim)}</Pill>
  return <>{tipo} {dm(ini)}–{dm(fim)}</>
}

const LENSES: TabDef<Lens>[] = [
  { value: "person", label: "Por pessoa", icon: Users },
  { value: "team", label: "Por time", icon: Building2 },
  { value: "project", label: "Por projeto", icon: TrendingUp },
  { value: "gaps", label: "Gargalos", icon: UserPlus },
  { value: "free", label: "Pessoas livres", icon: UserSearch },
  { value: "crossteam", label: "Cross-team", icon: ArrowLeftRight },
  { value: "sim", label: "Simulador", icon: FlaskConical },
]

/** Campo de data/número no mesmo formato do FilterSelect (rótulo em cima, altura 10). */
const INPUT_CLS = "block h-10 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function CapacityCockpitPage() {
  const today = useMemo(() => new Date(), [])
  const [from, setFrom] = useState(isoDate(today))
  const [to, setTo] = useState(isoDate(addDays(today, 56)))
  const [lens, setLens] = useState<Lens>("person")
  const [areaId, setAreaId] = useState<string>(ALL)
  const [positionSlug, setPositionSlug] = useState<string>(ALL)
  const [groupBy, setGroupBy] = useState<"position" | "area">("position")
  const [stackId, setStackId] = useState<string>(ALL)
  const [minFree, setMinFree] = useState<string>("0")

  const [areas, setAreas] = useState<Area[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [stacks, setStacks] = useState<Stack[]>([])

  const [heatmap, setHeatmap] = useState<CapacityHeatmapResponse | null>(null)
  const [byProject, setByProject] = useState<CapacityByProjectResponse | null>(null)
  const [gaps, setGaps] = useState<CapacityGapsResponse | null>(null)
  const [free, setFree] = useState<FreePeopleResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Célula do heatmap aberta no modal de detalhamento do dia.
  const [dayDetail, setDayDetail] = useState<{ personId: string; date: string } | null>(null)

  useEffect(() => {
    teamopsApi.listAreas(true).then(setAreas).catch(() => setAreas([]))
    teamopsApi.listPositions(true).then(setPositions).catch(() => setPositions([]))
    teamopsApi.listStacks({ active_only: true }).then(setStacks).catch(() => setStacks([]))
  }, [])

  useEffect(() => {
    if (lens === "sim" || lens === "team" || lens === "crossteam") {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    const area = areaId === ALL ? undefined : areaId
    const position = positionSlug === ALL ? undefined : positionSlug
    let req: Promise<unknown>
    if (lens === "person") {
      req = projetosApi.getCapacityHeatmap({ from, to, area, position }).then((r) => alive && setHeatmap(r))
    } else if (lens === "project") {
      req = projetosApi.getCapacityByProject({ from, to, area }).then((r) => alive && setByProject(r))
    } else if (lens === "gaps") {
      req = projetosApi.getCapacityGaps({ from, to, group_by: groupBy }).then((r) => alive && setGaps(r))
    } else {
      req = projetosApi
        .getAvailablePeople({
          from, to, area, position,
          stack: stackId === ALL ? undefined : stackId,
          min_free_hours: Number(minFree) || 0,
        })
        .then((r) => alive && setFree(r))
    }
    req
      .catch(() => alive && setError("Não foi possível carregar os dados de capacidade."))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [lens, from, to, areaId, positionSlug, groupBy, stackId, minFree])

  const nameFor = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of heatmap?.persons ?? []) m.set(p.id, p.full_name)
    return (id: string) => m.get(id) ?? `Sem pessoa (${id.slice(0, 8)})`
  }, [heatmap])

  const projMax = useMemo(
    () => Math.max(1, ...(byProject?.rows ?? []).map((r) => Math.max(r.demand_hours, r.capacity_hours))),
    [byProject],
  )

  const summary = heatmap?.summary
  const overCells = summary?.overallocated_cells ?? 0
  const unmapped = summary?.unmapped_assignees.length ?? 0

  return (
    <div className="space-y-5 p-1">
      {/* Cabeçalho */}
      <PageHeader
        icon={Gauge}
        color="#2563EB"
        title="Cockpit de Capacidade"
        description="Cruza o cronograma estimado de todos os projetos com a capacidade real das pessoas — sobrecarga, férias e reforço."
      />

      {/* Lentes */}
      <DetailTabs tabs={LENSES} value={lens} onChange={setLens} />

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">De</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={INPUT_CLS} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Até</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={INPUT_CLS} />
          </label>
          <div className="flex gap-1">
            {[4, 8, 12].map((w) => (
              <Button key={w} variant="outline" className="h-10"
                onClick={() => { setFrom(isoDate(today)); setTo(isoDate(addDays(today, w * 7))) }}>
                {w}sem
              </Button>
            ))}
          </div>

          {lens === "gaps" && (
            <FilterSelect
              label="Agrupar por"
              value={groupBy}
              onChange={(v) => setGroupBy(v as "position" | "area")}
              options={[{ value: "position", label: "Cargo" }, { value: "area", label: "Área" }]}
            />
          )}

          {(lens === "person" || lens === "project" || lens === "free") && areas.length > 0 && (
            <FilterSelect
              label="Área"
              value={areaId}
              onChange={setAreaId}
              options={[{ value: ALL, label: "Todas as áreas" }, ...areas.map((a) => ({ value: a.id, label: a.name }))]}
            />
          )}

          {(lens === "person" || lens === "free") && positions.length > 0 && (
            <FilterSelect
              label="Cargo"
              value={positionSlug}
              onChange={setPositionSlug}
              options={[{ value: ALL, label: "Todos os cargos" }, ...positions.map((p) => ({ value: p.slug, label: p.name }))]}
            />
          )}

          {lens === "free" && stacks.length > 0 && (
            <FilterSelect
              label="Competência"
              value={stackId}
              onChange={setStackId}
              options={[{ value: ALL, label: "Qualquer skill" }, ...stacks.map((st) => ({ value: st.id, label: st.name }))]}
            />
          )}

          {lens === "free" && (
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Folga mínima (h)</span>
              <input type="number" min={0} value={minFree} onChange={(e) => setMinFree(e.target.value)}
                className={`${INPUT_CLS} w-28`} />
            </label>
          )}
        </div>
      </Card>

      {error && <Notice tone="red" icon={AlertTriangle}>{error}</Notice>}

      {lens === "team" ? (
        <CapacityTeamView from={from} to={to} />
      ) : lens === "crossteam" ? (
        <CapacityCrossTeamView from={from} to={to} />
      ) : lens === "sim" ? (
        <CapacitySimulator from={from} to={to} />
      ) : loading ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[74px] w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : lens === "person" ? (
        <>
          <KpiRow className="sm:grid-cols-2 xl:grid-cols-4">
            <KpiCount icon={AlertTriangle} value={overCells}
              label={`Dias/pessoa em sobrecarga · ${summary?.persons_over ?? 0} pessoa(s) em risco`}
              tone={overCells > 0 ? "red" : "emerald"} highlight={overCells > 0} />
            <KpiCount icon={CalendarClock} value={`${Math.round(summary?.total_allocated_h ?? 0)}h`} label="Horas alocadas" />
            <KpiCount icon={Gauge} value={`${Math.round(summary?.total_capacity_h ?? 0)}h`} label="Capacidade total" />
            <KpiCount icon={UserCog} value={unmapped} label="Responsáveis sem cadastro (tarefas sem Pessoa vinculada)"
              tone={unmapped > 0 ? "amber" : "slate"} highlight={unmapped > 0} />
          </KpiRow>
          <SectionCard
            title="Carga por pessoa (todos os projetos)"
            subtitle={heatmap && heatmap.cells.length > 0
              ? <>Demanda = horas das <strong>User Stories</strong> (Features ficam de fora — já carregam o rollup das US).</>
              : undefined}
            icon={Users}
          >
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
                description="Nenhuma User Story com responsável, horas estimadas e datas no intervalo selecionado. Ajuste o período ou os filtros." />
            )}
          </SectionCard>
        </>
      ) : lens === "project" ? (
        <SectionCard
          title="Demanda × capacidade por projeto"
          subtitle={byProject && byProject.rows.length > 0
            ? "Barra colorida = demanda estimada do projeto no período. Barra cinza = capacidade total das pessoas alocadas (compartilhada entre projetos). Vermelho = a demanda deste projeto sozinha já excede a capacidade das suas pessoas."
            : undefined}
          icon={TrendingUp}
        >
          {byProject && byProject.rows.length > 0 ? (
            <div className="space-y-4">
              {byProject.rows.map((r) => (
                <ProjectBar key={r.project_id} label={r.project_name} demand={r.demand_hours} capacity={r.capacity_hours}
                  max={projMax} over={r.overallocated} overloadedPeople={r.overloaded_people} peopleCount={r.people_count} />
              ))}
            </div>
          ) : (
            <EmptyState icon={TrendingUp} title="Sem projetos no período"
              description="Nenhum projeto com tarefas agendadas (responsável + horas + datas) no intervalo selecionado." />
          )}
        </SectionCard>
      ) : lens === "gaps" ? (
        <SectionCard
          title={`Gargalos por ${groupBy === "position" ? "cargo" : "área"} & reforço sugerido`}
          subtitle={gaps && gaps.rows.length > 0
            ? "Déficit = soma das semanas em que a demanda do grupo excede a capacidade. O reforço sugerido cobre o pior pico semanal."
            : undefined}
          icon={UserPlus}
          flush
        >
          {gaps && gaps.rows.length > 0 ? (
            <div className={TABLE.wrap}>
              <table className={TABLE.table}>
                <thead className={TABLE.thead}>
                  <tr>
                    <th className={TABLE.thFirst}>{groupBy === "position" ? "Cargo" : "Área"}</th>
                    <th className={`${TABLE.th} text-right`}>Pessoas</th>
                    <th className={`${TABLE.th} text-right`}>Demanda / Capac.</th>
                    <th className={`${TABLE.th} text-right`}>Déficit</th>
                    <th className={TABLE.th}>Pior semana</th>
                    <th className={`${TABLE.th} text-right`}>Reforço</th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.rows.map((g) => (
                    <tr key={`${g.group_type}:${g.group_key}`} className={TABLE.tr}>
                      <td className={`${TABLE.tdFirst} font-medium`}>{g.group_label}</td>
                      <td className={`${TABLE.td} text-right tabular-nums`}>{g.people_count}</td>
                      <td className={`${TABLE.td} text-right tabular-nums text-muted-foreground`}>
                        {Math.round(g.allocated_hours)}h / {Math.round(g.capacity_hours)}h
                      </td>
                      <td className={`${TABLE.td} text-right font-medium tabular-nums text-destructive`}>+{Math.round(g.deficit_hours)}h</td>
                      <td className={`${TABLE.td} text-muted-foreground`}>{fmtWeek(g.peak_week)} (+{Math.round(g.peak_deficit_hours)}h)</td>
                      <td className={`${TABLE.td} text-right`}>
                        {g.suggested_headcount > 0
                          ? <Pill tone="red"><UserPlus size={12} />+{g.suggested_headcount}</Pill>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={UserPlus} title="Sem gargalos no período"
              description="Nenhum cargo/área com a demanda excedendo a capacidade nas semanas do intervalo. Time equilibrado 🎉" />
          )}
        </SectionCard>
      ) : (
        <SectionCard title="Pessoas com folga (para puxar ao projeto)" icon={UserSearch} flush>
          {free && free.rows.length > 0 ? (
            <div className={TABLE.wrap}>
              <table className={TABLE.table}>
                <thead className={TABLE.thead}>
                  <tr>
                    <th className={TABLE.thFirst}>Pessoa</th>
                    <th className={TABLE.th}>Cargo</th>
                    <th className={TABLE.th}>Competências</th>
                    <th className={`${TABLE.th} text-right`}>Folga</th>
                    <th className={TABLE.th}>Utilização</th>
                    <th className={TABLE.th}>Próxima ausência</th>
                  </tr>
                </thead>
                <tbody>
                  {free.rows.map((p) => (
                    <tr key={p.person_id} className={TABLE.tr}>
                      <td className={`${TABLE.tdFirst} font-medium`}>{p.full_name}</td>
                      <td className={`${TABLE.td} text-muted-foreground`}>{p.position_label ?? "—"}</td>
                      <td className={TABLE.td}>
                        <div className="flex flex-wrap gap-1">
                          {p.stacks.slice(0, 4).map((st) => <Pill key={st} tone="slate">{st}</Pill>)}
                          {p.stacks.length > 4 && <span className="text-xs text-muted-foreground">+{p.stacks.length - 4}</span>}
                          {p.stacks.length === 0 && <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className={`${TABLE.td} whitespace-nowrap text-right`}>
                        <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{Math.round(p.free_hours_total)}h</span>
                        <span className="ml-1 text-xs text-muted-foreground">/ {p.free_days}d</span>
                      </td>
                      <td className={TABLE.td}>
                        <div className="flex items-center gap-2">
                          <UtilBar pct={p.utilization_pct} />
                          <span className="text-xs tabular-nums text-muted-foreground">{Math.round(p.utilization_pct)}%</span>
                        </div>
                      </td>
                      <td className={`${TABLE.td} text-xs text-muted-foreground`}><ProximaAusencia texto={p.next_absence} hoje={isoDate(today)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={UserSearch} title="Ninguém com folga nos filtros"
              description="Nenhuma pessoa ativa com folga de capacidade no período para os filtros escolhidos. Relaxe os filtros ou amplie o período." />
          )}
        </SectionCard>
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

export default CapacityCockpitPage
