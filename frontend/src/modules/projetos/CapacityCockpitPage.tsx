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
import { KpiCard } from "@/components/KpiCard"
import { EmptyState } from "@/components/EmptyState"
import { SectionCard } from "@/components/SectionCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
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
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>{peopleCount} pessoa(s)</span>
        {overloadedPeople > 0 && <span className="text-amber-600">{overloadedPeople} sobrecarregada(s)</span>}
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

const LENSES: { key: Lens; label: string; icon: typeof Users }[] = [
  { key: "person", label: "Por pessoa", icon: Users },
  { key: "team", label: "Por time", icon: Building2 },
  { key: "project", label: "Por projeto", icon: TrendingUp },
  { key: "gaps", label: "Gargalos", icon: UserPlus },
  { key: "free", label: "Pessoas livres", icon: UserSearch },
  { key: "crossteam", label: "Cross-team", icon: ArrowLeftRight },
  { key: "sim", label: "Simulador", icon: FlaskConical },
]

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

  return (
    <div className="space-y-5 p-1">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Gauge size={20} className="text-primary" /> Cockpit de Capacidade
          </h1>
          <p className="text-sm text-muted-foreground">
            Cruza o cronograma estimado de todos os projetos com a capacidade real das pessoas — sobrecarga, férias e reforço.
          </p>
        </div>
        {/* Toggle de lente */}
        <div className="inline-flex flex-wrap rounded-md border bg-card p-0.5">
          {LENSES.map((l) => {
            const Icon = l.icon
            return (
              <Button
                key={l.key}
                variant={lens === l.key ? "default" : "ghost"}
                size="sm"
                className="gap-1.5"
                onClick={() => setLens(l.key)}
              >
                <Icon size={15} /> {l.label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>De</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            className="block h-9 rounded-md border bg-background px-2 text-sm" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Até</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)}
            className="block h-9 rounded-md border bg-background px-2 text-sm" />
        </label>
        <div className="flex gap-1">
          {[4, 8, 12].map((w) => (
            <Button key={w} variant="outline" size="sm"
              onClick={() => { setFrom(isoDate(today)); setTo(isoDate(addDays(today, w * 7))) }}>
              {w}sem
            </Button>
          ))}
        </div>

        {lens === "gaps" && (
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Agrupar por</span>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "position" | "area")}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="position">Cargo</SelectItem>
                <SelectItem value="area">Área</SelectItem>
              </SelectContent>
            </Select>
          </label>
        )}

        {(lens === "person" || lens === "project" || lens === "free") && areas.length > 0 && (
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Área</span>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Todas as áreas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as áreas</SelectItem>
                {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        )}

        {(lens === "person" || lens === "free") && positions.length > 0 && (
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Cargo</span>
            <Select value={positionSlug} onValueChange={setPositionSlug}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Todos os cargos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os cargos</SelectItem>
                {positions.map((p) => <SelectItem key={p.id} value={p.slug}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        )}

        {lens === "free" && stacks.length > 0 && (
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Competência</span>
            <Select value={stackId} onValueChange={setStackId}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Qualquer skill" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Qualquer skill</SelectItem>
                {stacks.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        )}

        {lens === "free" && (
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Folga mínima (h)</span>
            <input type="number" min={0} value={minFree} onChange={(e) => setMinFree(e.target.value)}
              className="block h-9 w-28 rounded-md border bg-background px-2 text-sm" />
          </label>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {lens === "team" ? (
        <CapacityTeamView from={from} to={to} />
      ) : lens === "crossteam" ? (
        <CapacityCrossTeamView from={from} to={to} />
      ) : lens === "sim" ? (
        <CapacitySimulator from={from} to={to} />
      ) : loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : lens === "person" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Dias/pessoa em sobrecarga" value={summary?.overallocated_cells ?? 0} icon={AlertTriangle}
              deltaTone={summary && summary.overallocated_cells > 0 ? "down" : "up"} sub={`${summary?.persons_over ?? 0} pessoa(s) em risco`} />
            <KpiCard label="Horas alocadas" value={`${Math.round(summary?.total_allocated_h ?? 0)}h`} icon={CalendarClock} />
            <KpiCard label="Capacidade total" value={`${Math.round(summary?.total_capacity_h ?? 0)}h`} icon={Gauge} />
            <KpiCard label="Responsáveis sem cadastro" value={summary?.unmapped_assignees.length ?? 0} icon={UserCog}
              sub="tarefas sem Pessoa vinculada" deltaTone={summary && summary.unmapped_assignees.length > 0 ? "down" : "neutral"} />
          </div>
          <SectionCard title="Carga por pessoa (todos os projetos)">
            {heatmap && heatmap.cells.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Demanda = horas das <strong>User Stories</strong> (Features ficam de fora — já carregam o rollup das US).
                </p>
                <WorkloadView cells={heatmap.cells} nameForUser={nameFor} />
              </div>
            ) : (
              <EmptyState icon={Users} title="Sem carga no período"
                description="Nenhuma User Story com responsável, horas estimadas e datas no intervalo selecionado. Ajuste o período ou os filtros." />
            )}
          </SectionCard>
        </>
      ) : lens === "project" ? (
        <SectionCard title="Demanda × capacidade por projeto">
          {byProject && byProject.rows.length > 0 ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Barra colorida = demanda estimada do projeto no período. Barra cinza = capacidade total das pessoas alocadas
                (compartilhada entre projetos). Vermelho = a demanda deste projeto sozinha já excede a capacidade das suas pessoas.
              </p>
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
        <SectionCard title={`Gargalos por ${groupBy === "position" ? "cargo" : "área"} & reforço sugerido`}>
          {gaps && gaps.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <p className="mb-3 text-xs text-muted-foreground">
                Déficit = soma das semanas em que a demanda do grupo excede a capacidade. O reforço sugerido cobre o pior pico semanal.
              </p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">{groupBy === "position" ? "Cargo" : "Área"}</th>
                    <th className="py-2 pr-3 text-right font-medium">Pessoas</th>
                    <th className="py-2 pr-3 text-right font-medium">Demanda / Capac.</th>
                    <th className="py-2 pr-3 text-right font-medium">Déficit</th>
                    <th className="py-2 pr-3 font-medium">Pior semana</th>
                    <th className="py-2 pr-3 text-right font-medium">Reforço</th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.rows.map((g) => (
                    <tr key={`${g.group_type}:${g.group_key}`} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{g.group_label}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{g.people_count}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {Math.round(g.allocated_hours)}h / {Math.round(g.capacity_hours)}h
                      </td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums text-destructive">+{Math.round(g.deficit_hours)}h</td>
                      <td className="py-2 pr-3 text-muted-foreground">{fmtWeek(g.peak_week)} (+{Math.round(g.peak_deficit_hours)}h)</td>
                      <td className="py-2 pr-3 text-right">
                        {g.suggested_headcount > 0
                          ? <Badge variant="destructive" className="gap-1"><UserPlus size={12} />+{g.suggested_headcount}</Badge>
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
        <SectionCard title="Pessoas com folga (para puxar ao projeto)">
          {free && free.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">Pessoa</th>
                    <th className="py-2 pr-3 font-medium">Cargo</th>
                    <th className="py-2 pr-3 font-medium">Competências</th>
                    <th className="py-2 pr-3 text-right font-medium">Folga</th>
                    <th className="py-2 pr-3 font-medium">Utilização</th>
                    <th className="py-2 pr-3 font-medium">Próxima ausência</th>
                  </tr>
                </thead>
                <tbody>
                  {free.rows.map((p) => (
                    <tr key={p.person_id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{p.full_name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{p.position_label ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {p.stacks.slice(0, 4).map((s) => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
                          {p.stacks.length > 4 && <span className="text-[10px] text-muted-foreground">+{p.stacks.length - 4}</span>}
                          {p.stacks.length === 0 && <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <span className="font-medium tabular-nums text-green-600">{Math.round(p.free_hours_total)}h</span>
                        <span className="ml-1 text-[11px] text-muted-foreground">/ {p.free_days}d</span>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <UtilBar pct={p.utilization_pct} />
                          <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(p.utilization_pct)}%</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-[11px] text-muted-foreground">{p.next_absence ?? "—"}</td>
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
    </div>
  )
}

export default CapacityCockpitPage
