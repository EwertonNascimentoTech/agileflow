import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Download, RefreshCw, TrendingUp, TrendingDown, GitBranch, ClipboardList, BarChart3 } from "lucide-react"
import {
  funnelsApi, metricsApi, forecastApi, conversionApi, productivityApi,
  type Funnel, type FunnelMetrics, type AttendanceOverview,
  type ForecastData, type ConversionFunnelData, type ProductivityData,
} from "@/api/crm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { KpiCard } from "@/components/KpiCard"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

function getMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()
  return {
    period: `${y}-${m}`,
    start: `${y}-${m}-01`,
    end: `${y}-${m}-${lastDay}`,
  }
}

type TabKey = "overview" | "forecast" | "conversion" | "productivity"

const TABS: { key: TabKey; label: string; icon: typeof BarChart3 }[] = [
  { key: "overview",     label: "Visão Geral",  icon: BarChart3 },
  { key: "forecast",     label: "Forecast",     icon: TrendingUp },
  { key: "conversion",   label: "Conversão",    icon: GitBranch },
  { key: "productivity", label: "Produtividade", icon: ClipboardList },
]

export default function CrmDashboardPage() {
  const navigate = useNavigate()
  const monthRange = useMemo(() => getMonthRange(), [])

  const [tab, setTab] = useState<TabKey>("overview")
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [selectedFunnel, setSelectedFunnel] = useState<string>("")
  const [period, setPeriod] = useState(monthRange.period)
  const [periodStart, setPeriodStart] = useState(monthRange.start)
  const [periodEnd, setPeriodEnd] = useState(monthRange.end)

  // Dados de cada bloco
  const [overview, setOverview] = useState<AttendanceOverview | null>(null)
  const [metrics, setMetrics] = useState<FunnelMetrics | null>(null)
  const [forecast, setForecast] = useState<ForecastData | null>(null)
  const [conversion, setConversion] = useState<ConversionFunnelData | null>(null)
  const [productivity, setProductivity] = useState<ProductivityData | null>(null)

  // Loading states
  const [loadingInit, setLoadingInit] = useState(true)
  const [loadingFunnel, setLoadingFunnel] = useState(false)
  const [loadingForecast, setLoadingForecast] = useState(false)
  const [loadingConversion, setLoadingConversion] = useState(false)
  const [loadingProductivity, setLoadingProductivity] = useState(false)

  // Carga inicial
  useEffect(() => {
    Promise.all([
      funnelsApi.list(),
      metricsApi.overview(),
    ]).then(([f, o]) => {
      setFunnels(f)
      setOverview(o)
      if (f.length > 0) {
        const def = f.find(x => x.is_default) || f[0]
        setSelectedFunnel(String(def.id))
      }
    }).finally(() => setLoadingInit(false))
  }, [])

  useEffect(() => {
    if (!selectedFunnel) return
    setLoadingFunnel(true)
    metricsApi.funnelMetrics(selectedFunnel)
      .then(setMetrics)
      .finally(() => setLoadingFunnel(false))
  }, [selectedFunnel])

  useEffect(() => {
    if (tab !== "forecast" || !selectedFunnel) return
    setLoadingForecast(true)
    forecastApi.get({ period, funnel_id: selectedFunnel })
      .then(setForecast)
      .catch(() => setForecast(null))
      .finally(() => setLoadingForecast(false))
  }, [tab, period, selectedFunnel])

  useEffect(() => {
    if (tab !== "conversion" || !selectedFunnel) return
    setLoadingConversion(true)
    conversionApi.getFunnelConversion({ period_start: periodStart, period_end: periodEnd, funnel_id: selectedFunnel })
      .then(setConversion)
      .catch(() => setConversion(null))
      .finally(() => setLoadingConversion(false))
  }, [tab, periodStart, periodEnd, selectedFunnel])

  useEffect(() => {
    if (tab !== "productivity") return
    setLoadingProductivity(true)
    productivityApi.get({ period_start: periodStart, period_end: periodEnd })
      .then(setProductivity)
      .catch(() => setProductivity(null))
      .finally(() => setLoadingProductivity(false))
  }, [tab, periodStart, periodEnd])

  function downloadCSV() {
    metricsApi.exportAttendances().then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "atendimentos.csv"
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const totalValue = metrics?.stages.reduce((s, st) => s + st.total_value, 0) ?? 0
  const totalAttendances = metrics?.stages.reduce((s, st) => s + st.count, 0) ?? 0
  const wonStage = metrics?.stages.find(s => s.outcome === "won")
  const lostStage = metrics?.stages.find(s => s.outcome === "lost")
  const maxConvEntries = Math.max(...(conversion?.stages.map(s => s.entries) ?? [0]), 1)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Dashboard CRM</h2>
          <p className="text-sm text-muted-foreground">Métricas, forecast, conversão e produtividade.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={downloadCSV} className="gap-1.5">
            <Download size={14} /> CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={() => {
            setLoadingFunnel(true)
            metricsApi.funnelMetrics(selectedFunnel).then(setMetrics).finally(() => setLoadingFunnel(false))
          }} className="gap-1.5">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Filtros globais */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Funil</Label>
            <Select value={selectedFunnel} onValueChange={setSelectedFunnel} disabled={funnels.length === 0}>
              <SelectTrigger className="w-48 h-9 text-sm">
                <SelectValue placeholder="Selecione o funil" />
              </SelectTrigger>
              <SelectContent>
                {funnels.map(f => (
                  <SelectItem key={String(f.id)} value={String(f.id)}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(tab === "forecast") && (
            <div className="space-y-1">
              <Label className="text-xs">Mês</Label>
              <Input
                type="month" className="h-9 w-36 text-sm"
                value={period} onChange={e => setPeriod(e.target.value)}
              />
            </div>
          )}
          {(tab === "conversion" || tab === "productivity") && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Início</Label>
                <Input type="date" className="h-9 w-36 text-sm" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fim</Label>
                <Input type="date" className="h-9 w-36 text-sm" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tabs internas */}
      <div className="flex border-b gap-0 overflow-x-auto scrollbar-none">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap shrink-0 transition-colors",
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ──────────────── VISÃO GERAL ──────────────── */}
      {tab === "overview" && (
        <div className="space-y-5">
          {loadingInit ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                icon={BarChart3}
                label="Total atendimentos"
                value={overview?.total ?? 0}
                sub={`Últimos 30d: ${overview?.last_30_days ?? 0}`}
              />
              <KpiCard icon={GitBranch} label="No funil" value={totalAttendances} />
              <KpiCard
                icon={TrendingUp}
                label="Valor pipeline"
                value={<span className="text-emerald-600">{fmtCurrency(totalValue)}</span>}
              />
              <KpiCard
                icon={TrendingDown}
                label="Ganhos / Perdidos"
                value={
                  <span>
                    <span className="text-emerald-600">{wonStage?.count ?? 0}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className="text-red-500">{lostStage?.count ?? 0}</span>
                  </span>
                }
                sub={wonStage ? fmtCurrency(wonStage.total_value) : undefined}
              />
            </div>
          )}

          {loadingFunnel ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : metrics && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição por Etapa</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {metrics.stages.map(stage => {
                  const pct = totalAttendances > 0 ? (stage.count / totalAttendances) * 100 : 0
                  return (
                    <div key={stage.id} className="flex items-center gap-3">
                      <div className="w-28 shrink-0 text-xs font-medium truncate">{stage.name}</div>
                      <div className="flex-1 relative h-6 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded transition-all" style={{ width: `${pct}%`, backgroundColor: stage.color }} />
                      </div>
                      <div className="w-14 text-right text-xs font-semibold">{stage.count}</div>
                      <div className="w-28 text-right text-xs text-emerald-600 font-medium hidden sm:block">
                        {fmtCurrency(stage.total_value)}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {metrics && metrics.top_opportunities.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top 10 Oportunidades</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {metrics.top_opportunities.map((opp, i) => (
                    <div
                      key={opp.id}
                      className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted cursor-pointer"
                      onClick={() => navigate(`/app/modules/crm/attendances/${opp.id}`)}
                    >
                      <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                      <span className="flex-1 text-sm font-medium truncate">{opp.client_name ?? opp.protocol}</span>
                      <Badge variant="outline" className="text-[10px]">{opp.stage_name}</Badge>
                      <span className="text-sm font-semibold text-emerald-600 shrink-0">{fmtCurrency(opp.value)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ──────────────── FORECAST ──────────────── */}
      {tab === "forecast" && (
        <div className="space-y-4">
          {loadingForecast ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : forecast && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Forecast</p>
                    <p className="text-xl font-bold text-emerald-600">{fmtCurrency(forecast.total_forecast)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Meta</p>
                    <p className="text-xl font-bold">{fmtCurrency(forecast.total_target)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Delta vs Meta</p>
                    {forecast.delta_pct !== null ? (
                      <div className="flex items-center gap-1">
                        {forecast.delta_pct >= 0
                          ? <TrendingUp size={18} className="text-emerald-500" />
                          : <TrendingDown size={18} className="text-red-500" />}
                        <p className={cn("text-xl font-bold", forecast.delta_pct >= 0 ? "text-emerald-600" : "text-red-500")}>
                          {forecast.delta_pct > 0 ? "+" : ""}{forecast.delta_pct}%
                        </p>
                      </div>
                    ) : <p className="text-xl font-bold text-muted-foreground">—</p>}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Forecast por etapa</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {forecast.by_stage.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período.</p>
                  ) : forecast.by_stage.map(s => {
                    const maxVal = Math.max(...forecast.by_stage.map(x => x.weighted_value), 1)
                    const pct = (s.weighted_value / maxVal) * 100
                    return (
                      <div key={s.stage_id} className="flex items-center gap-3">
                        <div className="w-32 shrink-0 text-xs font-medium truncate">{s.stage_name}</div>
                        <div className="flex-1 relative h-5 bg-muted rounded overflow-hidden">
                          <div className="h-full rounded bg-primary/70" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-16 text-right text-xs text-muted-foreground">{s.probability}%</div>
                        <div className="w-28 text-right text-xs font-semibold text-emerald-600">{fmtCurrency(s.weighted_value)}</div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ──────────────── CONVERSÃO ──────────────── */}
      {tab === "conversion" && (
        <div className="space-y-4">
          {loadingConversion ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : conversion && (
            <>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Funil de Conversão</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {conversion.stages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sem dados no período.</p>
                  ) : conversion.stages.map((s, i) => {
                    const width = (s.entries / maxConvEntries) * 100
                    return (
                      <div key={s.stage_id} className="flex items-center gap-3">
                        <div className="w-32 shrink-0 text-xs font-medium truncate">{s.stage_name}</div>
                        <div className="flex-1 relative h-7 bg-muted rounded overflow-hidden">
                          <div className="h-full rounded transition-all" style={{ width: `${width}%`, backgroundColor: s.color }} />
                        </div>
                        <div className="w-12 text-right text-xs font-semibold">{s.entries}</div>
                        {i > 0 && (
                          <div className="w-16 text-right text-xs text-muted-foreground">
                            {s.conversion_rate.toFixed(0)}%
                          </div>
                        )}
                        <div className="w-16 text-right text-xs text-muted-foreground hidden md:block">
                          {s.avg_days.toFixed(1)}d
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              {conversion.loss_reasons.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Top motivos de perda</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {conversion.loss_reasons.slice(0, 5).map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-1">
                        <span className="text-sm">{r.reason || <span className="italic text-muted-foreground">sem motivo</span>}</span>
                        <Badge variant="outline" className="text-xs">{r.count}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ──────────────── PRODUTIVIDADE ──────────────── */}
      {tab === "productivity" && (
        <div className="space-y-4">
          {loadingProductivity ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : productivity && (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Produtividade por vendedor</CardTitle>
                <Button
                  size="sm" variant="outline" className="gap-1.5"
                  onClick={() => window.open(productivityApi.exportCsvUrl({ period_start: periodStart, period_end: periodEnd }), "_blank")}
                >
                  <Download size={13} /> CSV
                </Button>
              </CardHeader>
              <CardContent>
                {productivity.users.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem dados no período.</p>
                ) : (
                  <div className="text-sm">
                    <div className="grid grid-cols-7 gap-2 pb-2 border-b text-xs text-muted-foreground font-medium">
                      <span className="col-span-2">Vendedor</span>
                      <span className="text-right">Abertos</span>
                      <span className="text-right">Ganhos</span>
                      <span className="text-right">Perdidos</span>
                      <span className="text-right">Tarefas</span>
                      <span className="text-right">Conv.</span>
                    </div>
                    {productivity.users.map((u, i) => (
                      <div key={i} className="grid grid-cols-7 gap-2 py-1.5 border-b last:border-b-0 items-center">
                        <span className="col-span-2 text-xs font-mono text-muted-foreground truncate">
                          {u.user_id ? u.user_id.slice(0, 8) + "…" : "—"}
                        </span>
                        <span className="text-right">{u.attendances_opened}</span>
                        <span className="text-right text-emerald-600 font-medium">{u.attendances_won}</span>
                        <span className="text-right text-red-500">{u.attendances_lost}</span>
                        <span className="text-right">{u.tasks_done}</span>
                        <span className="text-right font-medium">{u.conversion_rate.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
