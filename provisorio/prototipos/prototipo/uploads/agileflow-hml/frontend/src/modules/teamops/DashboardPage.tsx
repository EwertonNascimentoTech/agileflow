import { useEffect, useState } from "react"
import { AlertTriangle, CalendarOff, Users, ShieldAlert, UserMinus } from "lucide-react"
import { KpiCard } from "@/components/KpiCard"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { teamopsApi, type DashboardKpis, type AlertsResponse } from "@/api/teamops"

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

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Visão geral do time</h1>
        <p className="text-sm text-muted-foreground">
          Indicadores de pessoas, ausências, competências e riscos operacionais.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {loading || !kpis ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <KpiCard label="Pessoas ativas" value={kpis.active_persons} icon={Users} />
            <KpiCard
              label="Em férias hoje"
              value={kpis.on_vacation_today}
              icon={CalendarOff}
              deltaTone={kpis.on_vacation_today > 0 ? "down" : "neutral"}
            />
            <KpiCard
              label="Aprovações pendentes"
              value={kpis.pending_approvals}
              icon={UserMinus}
              deltaTone={kpis.pending_approvals > 0 ? "down" : "neutral"}
            />
            <KpiCard
              label="Stacks críticas sem backup"
              value={kpis.critical_stacks_without_backup}
              icon={ShieldAlert}
              deltaTone={kpis.critical_stacks_without_backup > 0 ? "down" : "up"}
            />
            <KpiCard
              label="Áreas sem PO"
              value={kpis.areas_without_po}
              icon={AlertTriangle}
              deltaTone={kpis.areas_without_po > 0 ? "down" : "up"}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pessoas por área</CardTitle>
            <CardDescription>Distribuição do time por unidade.</CardDescription>
          </CardHeader>
          <CardContent>
            {!kpis || kpis.persons_by_area.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados — cadastre áreas e pessoas.</p>
            ) : (
              <ul className="space-y-2">
                {kpis.persons_by_area.map((row) => (
                  <li key={row.area} className="flex items-center justify-between text-sm">
                    <span>{row.area}</span>
                    <Badge variant="secondary">{row.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Alertas operacionais</CardTitle>
            <CardDescription>Riscos identificados automaticamente.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24" />
            ) : !alerts || alerts.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum alerta no momento. ✨</p>
            ) : (
              <ul className="space-y-3">
                {alerts.items.slice(0, 8).map((al, idx) => (
                  <li key={`${al.code}-${idx}`} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{al.title}</span>
                      <Badge
                        variant={
                          al.severity === "high"
                            ? "destructive"
                            : al.severity === "medium"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {al.severity === "high" ? "Alto" : al.severity === "medium" ? "Médio" : "Baixo"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{al.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
