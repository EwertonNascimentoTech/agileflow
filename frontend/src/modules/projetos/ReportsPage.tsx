import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Filter, Layers, TrendingUp, X } from "lucide-react"

import { teamopsApi } from "@/api/teamops"
import { projetosApi, type ProjectDefaultFormField, type ProjectReports } from "@/api/projetos"
import type { User } from "@/types"
import { parseDefaultFieldOptions } from "@/modules/projetos/defaultFormOptions"
import { KpiCard } from "@/components/KpiCard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"

const ALL = "__all__" // sentinela: sem filtro (Radix proíbe value="")

function BarRow({
  label,
  value,
  max,
  color,
  right,
}: {
  label: string
  value: number
  max: number
  color?: string
  right?: ReactNode
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate" title={label}>{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{right ?? value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color ?? "hsl(var(--primary))" }}
        />
      </div>
    </div>
  )
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  if (!y || !m) return ym
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
}

export default function ReportsPage() {
  const [data, setData] = useState<ProjectReports | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [defaultFields, setDefaultFields] = useState<ProjectDefaultFormField[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filtros (PO = responsável/Pessoa, diretoria e área são campos do card).
  const [po, setPo] = useState<string>(ALL)
  const [diretoria, setDiretoria] = useState<string>(ALL)
  const [area, setArea] = useState<string>(ALL)

  // Opções auxiliares carregadas uma vez.
  useEffect(() => {
    let active = true
    Promise.all([
      teamopsApi.listPersons().catch(() => []),
      projetosApi.getDefaultFormFields().catch(() => [] as ProjectDefaultFormField[]),
    ]).then(([ps, fields]) => {
      if (!active) return
      // by_assignee.user_id agora é person_id (responsável = Pessoa).
      setUsers(ps.map((p) => ({ id: p.id, full_name: p.full_name })) as unknown as User[])
      setDefaultFields(fields)
    })
    return () => {
      active = false
    }
  }, [])

  // Recarrega os relatórios sempre que um filtro muda.
  useEffect(() => {
    let active = true
    setRefreshing(true)
    projetosApi
      .getReports({
        po: po === ALL ? null : po,
        diretoria: diretoria === ALL ? null : diretoria,
        area: area === ALL ? null : area,
      })
      .then((r) => {
        if (active) setData(r)
      })
      .finally(() => {
        if (active) {
          setLoading(false)
          setRefreshing(false)
        }
      })
    return () => {
      active = false
    }
  }, [po, diretoria, area])

  const userName = useMemo(() => {
    const m = new Map(users.map((u) => [u.id, u.full_name]))
    return (id: string | null) => (id ? m.get(id) ?? "Usuário removido" : "Não atribuído")
  }, [users])

  // value → label das opções de diretoria/área (do formulário padrão), com fallback no valor cru.
  const labelMaps = useMemo(() => {
    const build = (key: string) => {
      const field = defaultFields.find((f) => f.field_key === key)
      const map = new Map<string, string>()
      if (field) parseDefaultFieldOptions(field).forEach((o) => map.set(o.value, o.label))
      return map
    }
    return { diretoria: build("diretoria"), area: build("area") }
  }, [defaultFields])

  const diretoriaOptions = data?.available_diretorias ?? []
  const areaOptions = data?.available_areas ?? []
  const hasFilters = po !== ALL || diretoria !== ALL || area !== ALL
  function clearFilters() {
    setPo(ALL)
    setDiretoria(ALL)
    setArea(ALL)
  }

  const stageGroups = useMemo(() => {
    if (!data) return [] as { funnel: string; rows: ProjectReports["by_stage"]; max: number }[]
    const groups = new Map<string, ProjectReports["by_stage"]>()
    for (const r of data.by_stage) {
      const list = groups.get(r.funnel_name) ?? []
      list.push(r)
      groups.set(r.funnel_name, list)
    }
    return Array.from(groups.entries()).map(([funnel, rows]) => ({
      funnel,
      rows,
      max: Math.max(1, ...rows.map((r) => r.count)),
    }))
  }, [data])

  const maxAssignee = useMemo(() => Math.max(1, ...(data?.by_assignee.map((a) => a.active) ?? [0])), [data])
  const maxType = useMemo(() => Math.max(1, ...(data?.by_type.map((t) => t.count) ?? [0])), [data])
  const maxMonth = useMemo(
    () => Math.max(1, ...(data?.throughput.by_month.map((m) => m.count) ?? [0])),
    [data],
  )

  const header = (
    <div>
      <h2 className="text-lg font-bold">Relatórios</h2>
      <p className="text-sm text-muted-foreground">
        Visão consolidada do board: distribuição por etapa, carga do time, tipos, SLA e throughput.
      </p>
    </div>
  )

  const filtersBar = (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex h-9 items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Filter className="h-4 w-4" /> Filtros
      </div>
      <div className="min-w-[180px] flex-1 sm:max-w-[220px]">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">PO / Responsável</label>
        <Select value={po} onValueChange={setPo}>
          <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os POs</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-[180px] flex-1 sm:max-w-[220px]">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Diretoria</label>
        <Select value={diretoria} onValueChange={setDiretoria}>
          <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as diretorias</SelectItem>
            {diretoriaOptions.map((v) => <SelectItem key={v} value={v}>{labelMaps.diretoria.get(v) ?? v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-[180px] flex-1 sm:max-w-[220px]">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Área</label>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as áreas</SelectItem>
            {areaOptions.map((v) => <SelectItem key={v} value={v}>{labelMaps.area.get(v) ?? v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={clearFilters}>
          <X className="h-3.5 w-3.5" /> Limpar
        </Button>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="w-full space-y-6 p-1">
        {header}
        {filtersBar}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80 rounded-lg" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="w-full space-y-6 p-1">
        {header}
        {filtersBar}
        <EmptyState
          icon={BarChart3}
          title="Sem dados para relatórios"
          description="Crie cards no board para visualizar as métricas."
        />
      </div>
    )
  }

  const sla = data.sla
  const isEmpty = data.total_active === 0 && data.total_completed === 0

  if (isEmpty) {
    return (
      <div className="w-full space-y-6 p-1">
        {header}
        {filtersBar}
        <EmptyState
          icon={BarChart3}
          title={hasFilters ? "Nenhum card para os filtros selecionados" : "Sem dados para relatórios"}
          description={hasFilters ? "Ajuste ou limpe os filtros para ver as métricas." : "Crie cards no board para visualizar as métricas."}
        />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 p-1" style={{ opacity: refreshing ? 0.6 : 1, transition: "opacity .15s" }}>
      {header}
      {filtersBar}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Cards ativos" value={data.total_active} icon={Layers} />
        <KpiCard label="Concluídos" value={data.total_completed} icon={CheckCircle2} />
        <KpiCard
          label="SLA estourado"
          value={sla.breached}
          icon={AlertTriangle}
          deltaTone={sla.breached > 0 ? "down" : "up"}
        />
        <KpiCard
          label="Atrasados"
          value={sla.overdue}
          icon={Clock}
          deltaTone={sla.overdue > 0 ? "down" : "up"}
        />
        <KpiCard
          label="Lead time médio"
          value={data.throughput.avg_lead_time_days != null ? `${data.throughput.avg_lead_time_days} d` : "—"}
          icon={TrendingUp}
          sub={`${data.throughput.completed_total} concluídos`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cards por etapa e funil</CardTitle>
            <CardDescription>Distribuição dos cards ativos em cada kanban.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {stageGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum card ativo.</p>
            ) : (
              stageGroups.map((g) => (
                <div key={g.funnel} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.funnel}</p>
                  {g.rows.map((r) => (
                    <BarRow
                      key={`${r.funnel_id}-${r.status_id}`}
                      label={r.status_name}
                      value={r.count}
                      max={g.max}
                      color={r.status_color}
                    />
                  ))}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Carga por responsável</CardTitle>
            <CardDescription>Cards ativos por pessoa (e quantos estão atrasados).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.by_assignee.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum card ativo.</p>
            ) : (
              data.by_assignee.map((a) => (
                <BarRow
                  key={a.user_id ?? "none"}
                  label={userName(a.user_id)}
                  value={a.active}
                  max={maxAssignee}
                  right={
                    <span className="flex items-center gap-2">
                      {a.overdue > 0 && (
                        <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                          {a.overdue} atrasado{a.overdue > 1 ? "s" : ""}
                        </Badge>
                      )}
                      <span className="tabular-nums">{a.active}</span>
                    </span>
                  }
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Volume por tipo de demanda</CardTitle>
            <CardDescription>Total de cards por tipo (ativos e concluídos).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.by_type.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum card cadastrado.</p>
            ) : (
              data.by_type.map((t) => (
                <BarRow key={t.type_id ?? "none"} label={t.type_name} value={t.count} max={maxType} />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">SLA e prazos</CardTitle>
            <CardDescription>Estado de SLA dos cards ativos.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-success">{sla.ok}</p>
                <p className="text-xs text-muted-foreground">No prazo</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-warning">{sla.warning}</p>
                <p className="text-xs text-muted-foreground">Em alerta</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-destructive">{sla.breached}</p>
                <p className="text-xs text-muted-foreground">Estourado</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-2xl font-bold text-muted-foreground">{sla.none}</p>
                <p className="text-xs text-muted-foreground">Sem SLA</p>
              </div>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm">
              <Clock size={15} className="text-destructive" />
              <span className="font-medium">{sla.overdue}</span>
              <span className="text-muted-foreground">card(s) atrasado(s) (SLA estourado ou prazo vencido).</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Throughput — concluídos por mês</CardTitle>
          <CardDescription>
            Cards finalizados a cada mês. Lead time médio:{" "}
            {data.throughput.avg_lead_time_days != null ? `${data.throughput.avg_lead_time_days} dias` : "sem dados"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.throughput.by_month.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum card concluído ainda.</p>
          ) : (
            <div className="flex items-end gap-3 overflow-x-auto pb-2" style={{ minHeight: 160 }}>
              {data.throughput.by_month.map((m) => {
                const h = Math.max(6, Math.round((m.count / maxMonth) * 130))
                return (
                  <div key={m.month} className="flex w-12 shrink-0 flex-col items-center gap-1">
                    <span className="text-xs font-medium tabular-nums">{m.count}</span>
                    <div className="w-full rounded-t bg-primary" style={{ height: h }} />
                    <span className="text-[10px] capitalize text-muted-foreground">{monthLabel(m.month)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
