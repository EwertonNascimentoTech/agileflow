import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, BarChart3, CheckCircle2, CircleSlash, Clock, Layers, TrendingUp, X, XCircle } from "lucide-react"

import { teamopsApi } from "@/api/teamops"
import { projetosApi, type ProjectDefaultFormField, type ProjectReports } from "@/api/projetos"
import type { User } from "@/types"
import { parseDefaultFieldOptions } from "@/modules/projetos/defaultFormOptions"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Card, FilterSelect, KpiCount, KpiRow, Pill, SectionCard } from "@/components/ds"

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
      <h2 className="text-lg font-semibold">Relatórios</h2>
      <p className="text-sm text-muted-foreground">
        Visão consolidada do board: distribuição por etapa, carga do time, tipos, SLA e throughput.
      </p>
    </div>
  )

  const filtersBar = (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="PO / Responsável"
          value={po}
          onChange={setPo}
          options={[{ value: ALL, label: "Todos os POs" }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]}
        />
        <FilterSelect
          label="Diretoria"
          value={diretoria}
          onChange={setDiretoria}
          options={[
            { value: ALL, label: "Todas as diretorias" },
            ...diretoriaOptions.map((v) => ({ value: v, label: labelMaps.diretoria.get(v) ?? v })),
          ]}
        />
        <FilterSelect
          label="Área"
          value={area}
          onChange={setArea}
          options={[
            { value: ALL, label: "Todas as áreas" },
            ...areaOptions.map((v) => ({ value: v, label: labelMaps.area.get(v) ?? v })),
          ]}
        />
        {hasFilters && (
          <Button variant="ghost" className="h-10 gap-1" onClick={clearFilters}>
            <X size={15} /> Limpar
          </Button>
        )}
      </div>
    </Card>
  )

  if (loading) {
    return (
      <div className="w-full space-y-5 p-1">
        {header}
        {filtersBar}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="w-full space-y-5 p-1">
        {header}
        {filtersBar}
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Sem dados para relatórios"
            description="Crie cards no board para visualizar as métricas."
          />
        </Card>
      </div>
    )
  }

  const sla = data.sla
  const isEmpty = data.total_active === 0 && data.total_completed === 0

  if (isEmpty) {
    return (
      <div className="w-full space-y-5 p-1">
        {header}
        {filtersBar}
        <Card>
          <EmptyState
            icon={BarChart3}
            title={hasFilters ? "Nenhum card para os filtros selecionados" : "Sem dados para relatórios"}
            description={hasFilters ? "Ajuste ou limpe os filtros para ver as métricas." : "Crie cards no board para visualizar as métricas."}
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full space-y-5 p-1" style={{ opacity: refreshing ? 0.6 : 1, transition: "opacity .15s" }}>
      {header}
      {filtersBar}

      <KpiRow className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCount icon={Layers} value={data.total_active} label="Cards ativos" />
        <KpiCount icon={CheckCircle2} value={data.total_completed} label="Concluídos" tone="emerald" />
        <KpiCount
          icon={AlertTriangle}
          value={sla.breached}
          label="SLA estourado"
          tone={sla.breached > 0 ? "red" : "slate"}
          highlight={sla.breached > 0}
        />
        <KpiCount
          icon={Clock}
          value={sla.overdue}
          label="Atrasados"
          tone={sla.overdue > 0 ? "red" : "slate"}
          highlight={sla.overdue > 0}
        />
        <KpiCount
          icon={TrendingUp}
          value={data.throughput.avg_lead_time_days != null ? `${data.throughput.avg_lead_time_days} d` : "—"}
          label={`Lead time médio · ${data.throughput.completed_total} concluídos`}
          tone="violet"
        />
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Cards por etapa e funil" subtitle="Distribuição dos cards ativos em cada kanban.">
          <div className="space-y-5">
            {stageGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum card ativo.</p>
            ) : (
              stageGroups.map((g) => (
                <div key={g.funnel} className="space-y-2">
                  <p className="text-sm font-semibold">{g.funnel}</p>
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
          </div>
        </SectionCard>

        <SectionCard title="Carga por responsável" subtitle="Cards ativos por pessoa (e quantos estão atrasados).">
          <div className="space-y-3">
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
                        <Pill tone="red">
                          {a.overdue} atrasado{a.overdue > 1 ? "s" : ""}
                        </Pill>
                      )}
                      <span className="tabular-nums">{a.active}</span>
                    </span>
                  }
                />
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Volume por tipo de demanda" subtitle="Total de cards por tipo (ativos e concluídos).">
          <div className="space-y-3">
            {data.by_type.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum card cadastrado.</p>
            ) : (
              data.by_type.map((t) => (
                <BarRow key={t.type_id ?? "none"} label={t.type_name} value={t.count} max={maxType} />
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="SLA e prazos" subtitle="Estado de SLA dos cards ativos.">
          <KpiRow className="grid-cols-1 sm:grid-cols-2">
            <KpiCount icon={CheckCircle2} value={sla.ok} label="No prazo" tone="emerald" />
            <KpiCount icon={Clock} value={sla.warning} label="Em alerta" tone="amber" />
            <KpiCount icon={XCircle} value={sla.breached} label="Estourado" tone="red" />
            <KpiCount icon={CircleSlash} value={sla.none} label="Sem SLA" tone="slate" />
          </KpiRow>
          <p className="mt-4 flex items-center gap-2 text-sm">
            <Clock size={15} className="text-destructive" />
            <span className="font-medium">{sla.overdue}</span>
            <span className="text-muted-foreground">card(s) atrasado(s) (SLA estourado ou prazo vencido).</span>
          </p>
        </SectionCard>
      </div>

      <SectionCard
        title="Throughput — concluídos por mês"
        subtitle={
          <>
            Cards finalizados a cada mês. Lead time médio:{" "}
            {data.throughput.avg_lead_time_days != null ? `${data.throughput.avg_lead_time_days} dias` : "sem dados"}.
          </>
        }
      >
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
      </SectionCard>
    </div>
  )
}
