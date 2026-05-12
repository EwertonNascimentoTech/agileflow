import { useEffect, useState } from "react"
import { Building2, CreditCard, TrendingUp, AlertTriangle, Package, Clock } from "lucide-react"
import { statsApi, type PlatformStats } from "@/api/superAdmin"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    statsApi.get().then(setStats).finally(() => setLoading(false))
  }, [])

  const kpis = stats
    ? [
        {
          title: "Empresas ativas",
          value: stats.active_tenants,
          sub: `${stats.total_tenants} total · ${stats.inactive_tenants} inativas`,
          icon: Building2,
          color: "text-blue-500",
        },
        {
          title: "MRR Estimado",
          value: fmt(stats.mrr),
          sub: "soma dos planos das empresas ativas",
          icon: CreditCard,
          color: "text-green-500",
        },
        {
          title: "Taxa de ativação",
          value: stats.total_tenants
            ? `${Math.round((stats.active_tenants / stats.total_tenants) * 100)}%`
            : "—",
          sub: "empresas ativas / total",
          icon: TrendingUp,
          color: "text-indigo-500",
        },
        {
          title: "Expirando em 30 dias",
          value: stats.expiring_soon,
          sub: "planos próximos ao vencimento",
          icon: AlertTriangle,
          color: stats.expiring_soon > 0 ? "text-orange-500" : "text-muted-foreground",
        },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Visão geral da plataforma.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20 mb-1" />
                  <Skeleton className="h-3 w-40" />
                </CardContent>
              </Card>
            ))
          : kpis.map(({ title, value, sub, icon: Icon, color }) => (
              <Card key={title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                  <Icon size={16} className={color} />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Modules */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Package size={16} className="text-muted-foreground" />
            <CardTitle className="text-base">Módulos mais usados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-10" />
                </div>
              ))
            ) : stats?.top_modules.length ? (
              stats.top_modules.map((m, i) => (
                <div key={m.slug} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <span className="text-sm font-medium">{m.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{m.slug}</span>
                  </div>
                  <Badge variant="secondary">{m.tenant_count} empresa{m.tenant_count !== 1 ? "s" : ""}</Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum módulo ativado ainda.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Tenants */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Clock size={16} className="text-muted-foreground" />
            <CardTitle className="text-base">Empresas recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))
            ) : stats?.recent_tenants.length ? (
              stats.recent_tenants.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{t.slug}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={t.is_active ? "default" : "secondary"}>
                      {t.is_active ? "ativa" : "inativa"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
