import { useEffect, useState } from "react"
import { AlertTriangle, Building2, CalendarOff, CheckCircle2, Gauge, Users, ShieldAlert, UserMinus, Cake } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { KpiCount, KpiRow, PageHeader, Pill, ProgressBar, SectionCard } from "@/components/ds"
import { teamopsApi, type DashboardKpis, type AlertsResponse } from "@/api/teamops"
import { AllocationSplitBar, SPLIT_COLORS } from "@/modules/teamops/AllocationSplit"

const MONTH_LABEL = new Date().toLocaleDateString("pt-BR", { month: "long" })

/** Cor do módulo Times/Pessoas (cabeçalho e barras). */
const TEAMOPS_COLOR = "#0891B2"

export default function TeamopsDashboardPage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([teamopsApi.getDashboard(), teamopsApi.getAlerts()])
      .then(([k, a]) => {
        if (!active) return
        setKpis(k)
        setAlerts(a)
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const areaMax = kpis ? Math.max(1, ...kpis.persons_by_area.map((r) => r.count)) : 1

  return (
    <div className="space-y-5 p-4">
      <PageHeader
        icon={Users}
        color={TEAMOPS_COLOR}
        title="Visão geral do time"
        description="Indicadores de pessoas, ausências, competências e riscos operacionais."
      />

      {loading || !kpis ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
      ) : (
        <KpiRow className="sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <KpiCount icon={Users} value={kpis.active_persons} label="Pessoas ativas" />
          <KpiCount
            icon={CalendarOff} value={kpis.on_vacation_today} label="Em férias hoje"
            tone={kpis.on_vacation_today > 0 ? "amber" : "slate"}
          />
          <KpiCount
            icon={UserMinus} value={kpis.pending_approvals} label="Aprovações pendentes"
            tone={kpis.pending_approvals > 0 ? "amber" : "slate"} highlight={kpis.pending_approvals > 0}
          />
          <KpiCount
            icon={ShieldAlert} value={kpis.critical_stacks_without_backup} label="Stacks críticas sem backup"
            tone={kpis.critical_stacks_without_backup > 0 ? "red" : "emerald"} highlight={kpis.critical_stacks_without_backup > 0}
          />
          <KpiCount
            icon={AlertTriangle} value={kpis.areas_without_po} label="Áreas sem PO"
            tone={kpis.areas_without_po > 0 ? "amber" : "emerald"} highlight={kpis.areas_without_po > 0}
          />
          <KpiCount
            icon={Cake} value={kpis.birthdays_this_month.length} label="Aniversariantes no mês"
            tone={kpis.birthdays_this_month.some((p) => p.is_today) ? "violet" : "slate"}
          />
        </KpiRow>
      )}

      {kpis?.capacity_split && (
        <SectionCard
          title="Capacidade diária do time"
          icon={Gauge}
          subtitle="Soma da jornada das pessoas ativas pela divisão cadastrada em Pessoas (Chamados = o que sobra)."
        >
          {(() => {
            const c = kpis.capacity_split
            const total = c.projects_hours + c.assisted_ops_hours + c.tickets_hours
            const pct = (h: number) => (total > 0 ? Math.round((h / total) * 1000) / 10 : 0)
            return (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Projetos", hours: c.projects_hours, cls: SPLIT_COLORS.projects },
                    { label: "Operação Assistida", hours: c.assisted_ops_hours, cls: SPLIT_COLORS.assistedOps },
                    { label: "Chamados", hours: c.tickets_hours, cls: SPLIT_COLORS.tickets },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border bg-background px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className={`h-2.5 w-2.5 rounded-full ${s.cls}`} aria-hidden />
                        {s.label}
                      </div>
                      <div className="mt-1 text-2xl font-bold tabular-nums">{s.hours}h</div>
                    </div>
                  ))}
                </div>
                <AllocationSplitBar
                  split={{
                    projectsPct: pct(c.projects_hours),
                    assistedOpsPct: pct(c.assisted_ops_hours),
                    ticketsPct: pct(c.tickets_hours),
                    projectsHours: c.projects_hours,
                    assistedOpsHours: c.assisted_ops_hours,
                    ticketsHours: c.tickets_hours,
                  }}
                />
              </div>
            )
          })()}
        </SectionCard>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Pessoas por área" icon={Building2} subtitle="Distribuição do time por unidade.">
          {!kpis || kpis.persons_by_area.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem dados — cadastre áreas e pessoas.</p>
          ) : (
            <ul className="space-y-3">
              {kpis.persons_by_area.map((row) => (
                <li key={row.area}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium" title={row.area}>{row.area}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{row.count}</span>
                  </div>
                  <ProgressBar value={(100 * row.count) / areaMax} color={TEAMOPS_COLOR} showLabel={false} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={`Alertas operacionais${alerts && alerts.items.length ? ` (${alerts.items.length})` : ""}`}
          icon={AlertTriangle}
          subtitle="Riscos identificados automaticamente."
          flush
        >
          {loading ? (
            <div className="p-5"><Skeleton className="h-24 rounded-xl" /></div>
          ) : !alerts || alerts.items.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nenhum alerta no momento. ✨" compact />
          ) : (
            <ul className="divide-y">
              {alerts.items.slice(0, 8).map((al, idx) => (
                <li key={`${al.code}-${idx}`} className="px-5 py-3 transition-colors hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium">{al.title}</span>
                    <Pill
                      tone={al.severity === "high" ? "red" : al.severity === "medium" ? "amber" : "slate"}
                      dot
                      className="shrink-0"
                    >
                      {al.severity === "high" ? "Alto" : al.severity === "medium" ? "Médio" : "Baixo"}
                    </Pill>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{al.description}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Aniversariantes do mês"
        icon={Cake}
        subtitle={<span className="capitalize">{MONTH_LABEL}</span>}
      >
        {loading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : !kpis || kpis.birthdays_this_month.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum aniversariante neste mês. 🎂
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kpis.birthdays_this_month.map((p) => (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${
                  p.is_today ? "border-pink-300 bg-pink-50 dark:border-pink-800 dark:bg-pink-950/40" : "bg-background"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 text-xs font-semibold tabular-nums text-pink-700 dark:bg-pink-900/50 dark:text-pink-200">
                    {String(p.day).padStart(2, "0")}
                  </span>
                  <span className="truncate font-medium">{p.full_name}</span>
                </div>
                {p.is_today && (
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md bg-pink-50 px-2 py-0.5 text-xs font-medium text-pink-700 ring-1 ring-inset ring-pink-200 dark:bg-pink-950/60 dark:text-pink-300 dark:ring-pink-800">
                    Hoje 🎉
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
