import { useEffect, useState } from "react"
import { Download, TrendingUp, TrendingDown } from "lucide-react"
import { revenueApi } from "@/api/crm"
import type { RevenueReport } from "@/api/crm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)

function getMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  return {
    start: `${y}-${m}-01`,
    end: `${y}-${m}-${new Date(y, now.getMonth() + 1, 0).getDate()}`,
  }
}

export default function RevenueReportPage() {
  const def = getMonthRange()
  const [periodStart, setPeriodStart] = useState(def.start)
  const [periodEnd, setPeriodEnd] = useState(def.end)
  const [data, setData] = useState<RevenueReport | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const result = await revenueApi.get({ period_start: periodStart, period_end: periodEnd })
      setData(result)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleExport() {
    const params = new URLSearchParams({ period_start: periodStart, period_end: periodEnd })
    window.open(`/api/v1/atendimento/reports/revenue/export?${params}`, "_blank")
  }

  const maxRevenue = data ? Math.max(...data.monthly_evolution.map(m => m.revenue), 1) : 1

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Ticket Médio & Receita</h2>
          <p className="text-sm text-muted-foreground">Negócios ganhos, receita realizada e ticket médio por vendedor.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
          <Download size={14} /> Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end p-3 bg-muted/50 rounded-lg border">
        <div className="space-y-1">
          <Label className="text-xs">Período início</Label>
          <Input type="date" className="h-8 text-sm w-36" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Período fim</Label>
          <Input type="date" className="h-8 text-sm w-36" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
        </div>
        <Button size="sm" onClick={load} disabled={loading}>
          {loading ? "Carregando…" : "Aplicar"}
        </Button>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-8 w-24 mb-1" /><Skeleton className="h-3 w-32" /></CardContent></Card>
          ))}
        </div>
      ) : data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Receita Total</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-600">{fmt(data.total_revenue)}</p>
                {data.target_value > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">Meta: {fmt(data.target_value)}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Ticket Médio</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(data.avg_ticket)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">por negócio ganho</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Negócios Ganhos</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.total_won}</p>
                <p className="text-xs text-muted-foreground mt-0.5">no período</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">vs. Meta</CardTitle></CardHeader>
              <CardContent>
                {data.delta_vs_target !== null && data.delta_vs_target !== undefined ? (
                  <div className="flex items-center gap-1">
                    {data.delta_vs_target >= 0
                      ? <TrendingUp size={20} className="text-emerald-500" />
                      : <TrendingDown size={20} className="text-red-500" />}
                    <p className={`text-2xl font-bold ${data.delta_vs_target >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {data.delta_vs_target > 0 ? "+" : ""}{data.delta_vs_target}%
                    </p>
                  </div>
                ) : (
                  <p className="text-2xl font-bold text-muted-foreground">—</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">diferença da meta</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Evolução mensal */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Evolução mensal</CardTitle></CardHeader>
              <CardContent>
                {data.monthly_evolution.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem dados no período.</p>
                ) : (
                  <div className="space-y-3">
                    {data.monthly_evolution.map(m => (
                      <div key={m.month}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{m.month}</span>
                          <span className="font-medium">{fmt(m.revenue)} · {m.won_count} negócio{m.won_count !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${(m.revenue / maxRevenue) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Por vendedor */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Por responsável</CardTitle></CardHeader>
              <CardContent>
                {data.by_user.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem dados no período.</p>
                ) : (
                  <div className="space-y-1">
                    <div className="grid grid-cols-4 text-xs text-muted-foreground pb-1 border-b">
                      <span className="col-span-2">Responsável</span>
                      <span className="text-right">Ganhos</span>
                      <span className="text-right">Receita</span>
                    </div>
                    {data.by_user.map((u, i) => (
                      <div key={i} className="grid grid-cols-4 text-sm py-1">
                        <span className="col-span-2 truncate text-xs text-muted-foreground font-mono">{u.user_id === "sem_responsavel" ? "Sem responsável" : u.user_id?.slice(0, 8) + "…"}</span>
                        <span className="text-right font-medium">{u.attendances_won}</span>
                        <span className="text-right text-emerald-600 font-semibold text-xs">{fmt(u.total_revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
