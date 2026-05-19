import { useEffect, useState } from "react"
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { forecastApi, funnelsApi } from "@/api/crm"
import type { ForecastData, Funnel } from "@/api/crm"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`

function getCurrentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function generatePeriods(): string[] {
  const periods: string[] = []
  const now = new Date()
  for (let i = 5; i >= -2; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  return periods
}

export default function ForecastPage() {
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [selectedFunnelId, setSelectedFunnelId] = useState<string>("__all__")
  const [period, setPeriod] = useState(getCurrentPeriod())
  const [data, setData] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const periods = generatePeriods()

  useEffect(() => {
    funnelsApi.list(true).then(setFunnels).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setError("")
    const params: { period: string; funnel_id?: string } = { period }
    if (selectedFunnelId !== "__all__") params.funnel_id = selectedFunnelId
    forecastApi
      .get(params)
      .then(setData)
      .catch(() => setError("Erro ao carregar forecast."))
      .finally(() => setLoading(false))
  }, [period, selectedFunnelId])

  const maxWeighted = data ? Math.max(...data.by_stage.map(s => s.weighted_value), 1) : 1

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">Forecast de Vendas</h2>
        <p className="text-sm text-muted-foreground">Projeção ponderada por probabilidade de cada etapa.</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1 min-w-[140px]">
          <Label className="text-xs">Período</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-[160px]">
          <Label className="text-xs">Funil</Label>
          <Select value={selectedFunnelId} onValueChange={setSelectedFunnelId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os funis</SelectItem>
              {funnels.map(f => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Forecast Total</p>
              <p className="text-2xl font-bold text-emerald-600">{fmt(data.total_forecast)}</p>
              {data.delta_pct !== null && (
                <p className={cn("text-xs flex items-center gap-1", data.delta_pct >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {data.delta_pct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {fmtPct(data.delta_pct)} vs meta
                </p>
              )}
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Meta do Período</p>
              <p className="text-2xl font-bold">{fmt(data.total_target)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Atingimento</p>
              <p className={cn("text-2xl font-bold", data.delta_pct !== null && data.delta_pct >= 0 ? "text-emerald-600" : "text-red-600")}>
                {data.total_target > 0
                  ? `${((data.total_forecast / data.total_target) * 100).toFixed(1)}%`
                  : "—"}
              </p>
            </div>
          </div>

          {/* Gráfico de barras por etapa */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <p className="text-sm font-semibold">Forecast por etapa</p>
            {data.by_stage.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum dado para este funil/período.</p>
            ) : (
              <div className="space-y-3">
                {data.by_stage.map(stage => {
                  const pct = maxWeighted > 0 ? (stage.weighted_value / maxWeighted) * 100 : 0
                  return (
                    <div key={stage.stage_id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                          <span className="font-medium">{stage.stage_name}</span>
                          <span className="text-muted-foreground">({stage.count} neg. · {stage.probability}%)</span>
                        </div>
                        <span className="font-semibold text-emerald-600">{fmt(stage.weighted_value)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: stage.color }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tabela por vendedor */}
          {data.by_user.length > 0 && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold">Por vendedor</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left pb-2 font-medium text-muted-foreground">Vendedor</th>
                      <th className="text-right pb-2 font-medium text-muted-foreground">Forecast</th>
                      <th className="text-right pb-2 font-medium text-muted-foreground">Meta</th>
                      <th className="text-right pb-2 font-medium text-muted-foreground">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_user.map((u, i) => (
                      <tr key={u.user_id ?? i} className="border-b last:border-0">
                        <td className="py-2 text-muted-foreground font-mono text-[10px]">{u.user_id?.slice(0, 8) ?? "—"}</td>
                        <td className="py-2 text-right font-semibold text-emerald-600">{fmt(u.forecast)}</td>
                        <td className="py-2 text-right">{fmt(u.target)}</td>
                        <td className="py-2 text-right">
                          {u.delta_pct === null ? (
                            <span className="text-muted-foreground flex justify-end"><Minus size={12} /></span>
                          ) : (
                            <span className={cn("flex items-center justify-end gap-0.5", u.delta_pct >= 0 ? "text-emerald-600" : "text-red-600")}>
                              {u.delta_pct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                              {fmtPct(u.delta_pct)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}

      {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>}
    </div>
  )
}
