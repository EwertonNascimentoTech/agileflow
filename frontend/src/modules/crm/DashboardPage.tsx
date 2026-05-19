import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { BarChart3, Download, RefreshCw } from "lucide-react"
import { funnelsApi, metricsApi, type Funnel, type FunnelMetrics, type AttendanceOverview } from "@/api/crm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram",
  phone: "Telefone", site: "Site", other: "Outro",
}

export default function AtendimentoDashboardPage() {
  const navigate = useNavigate()
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [selectedFunnel, setSelectedFunnel] = useState<string>("")
  const [metrics, setMetrics] = useState<FunnelMetrics | null>(null)
  const [overview, setOverview] = useState<AttendanceOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMetrics, setLoadingMetrics] = useState(false)

  useEffect(() => {
    Promise.all([
      funnelsApi.list(),
      metricsApi.overview(),
    ]).then(([f, o]) => {
      setFunnels(f)
      setOverview(o)
      if (f.length > 0) {
        const defaultFunnel = f.find(x => x.is_default) || f[0]
        setSelectedFunnel(String(defaultFunnel.id))
      }
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedFunnel) return
    setLoadingMetrics(true)
    metricsApi.funnelMetrics(selectedFunnel)
      .then(setMetrics)
      .finally(() => setLoadingMetrics(false))
  }, [selectedFunnel])

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Dashboard CRM</h2>
          <p className="text-sm text-muted-foreground">Métricas de funil e atendimentos</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={downloadCSV} className="gap-1.5">
            <Download size={14} /> Exportar CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={() => {
            setLoadingMetrics(true)
            metricsApi.funnelMetrics(selectedFunnel).then(setMetrics).finally(() => setLoadingMetrics(false))
          }} className="gap-1.5">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* KPIs de overview */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
              <p className="text-2xl font-bold">{overview?.total ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Últimos 30 dias: {overview?.last_30_days ?? 0}</p>
            </CardContent>
          </Card>
          {Object.entries(overview?.by_channel ?? {}).map(([ch, count]) => (
            <Card key={ch}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{CHANNEL_LABELS[ch] ?? ch}</p>
                <p className="text-2xl font-bold">{count}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Seletor de funil */}
      <div className="flex items-center gap-3">
        <BarChart3 size={16} className="text-muted-foreground" />
        <Select value={selectedFunnel} onValueChange={setSelectedFunnel} disabled={funnels.length === 0}>
          <SelectTrigger className="w-52 h-9">
            <SelectValue placeholder="Selecione o funil" />
          </SelectTrigger>
          <SelectContent>
            {funnels.map(f => (
              <SelectItem key={String(f.id)} value={String(f.id)}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Funil visual */}
      {loadingMetrics ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : metrics && (
        <>
          {/* KPIs do funil */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">No funil</p>
                <p className="text-2xl font-bold">{totalAttendances}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor pipeline</p>
                <p className="text-xl font-bold text-emerald-600">{fmtCurrency(totalValue)}</p>
              </CardContent>
            </Card>
            {wonStage && (
              <Card className="border-emerald-200">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Ganhos</p>
                  <p className="text-2xl font-bold text-emerald-600">{wonStage.count}</p>
                  <p className="text-xs text-muted-foreground">{fmtCurrency(wonStage.total_value)}</p>
                </CardContent>
              </Card>
            )}
            {lostStage && (
              <Card className="border-red-200">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Perdidos</p>
                  <p className="text-2xl font-bold text-red-500">{lostStage.count}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Barras por etapa */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Distribuição por Etapa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {metrics.stages.map(stage => {
                const pct = totalAttendances > 0 ? (stage.count / totalAttendances) * 100 : 0
                return (
                  <div key={stage.id} className="flex items-center gap-3">
                    <div className="w-28 shrink-0 text-xs font-medium truncate">{stage.name}</div>
                    <div className="flex-1 relative h-6 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-all"
                        style={{ width: `${pct}%`, backgroundColor: stage.color }}
                      />
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

          {/* Top oportunidades */}
          {metrics.top_opportunities.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top 10 Oportunidades</CardTitle>
              </CardHeader>
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
        </>
      )}
    </div>
  )
}
