import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FileText, TrendingUp, CheckCircle, Download, RefreshCw, AlertTriangle } from "lucide-react"
import { proposalMetricsApi, type ProposalMetricsOverview } from "@/api/propostasContratos"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho", sent: "Enviada", accepted: "Aceita",
  rejected: "Rejeitada", expired: "Expirada", cancelled: "Cancelada",
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-200", sent: "bg-blue-200", accepted: "bg-emerald-300",
  rejected: "bg-red-300", expired: "bg-orange-200", cancelled: "bg-gray-200",
}

export default function ProposalsDashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<ProposalMetricsOverview | null>(null)
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    proposalMetricsApi.overview().then(setData).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function downloadCSV() {
    proposalMetricsApi.exportCSV().then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "propostas.csv"
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const totalByStatus = data
    ? Object.values(data.by_status).reduce((s, v) => s + v.count, 0)
    : 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Dashboard Propostas</h2>
          <p className="text-sm text-muted-foreground">Pipeline e taxas de conversão</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={downloadCSV} className="gap-1.5">
            <Download size={14} /> Exportar CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={load} className="gap-1.5">
            <RefreshCw size={14} />
          </Button>
          <Button size="sm" onClick={() => navigate("/app/modules/propostas_contratos/proposals")} className="gap-1.5">
            <FileText size={14} /> Ver Propostas
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <FileText size={14} className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
                </div>
                <p className="text-2xl font-bold">{data.total}</p>
              </CardContent>
            </Card>

            <Card className="border-emerald-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle size={14} className="text-emerald-600" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Taxa Aceitação</p>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{data.acceptance_rate}%</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={14} className="text-blue-500" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor Pipeline</p>
                </div>
                <p className="text-xl font-bold text-blue-600">{fmtCurrency(data.total_pipeline_value)}</p>
              </CardContent>
            </Card>

            <Card className={data.expiring_7_days > 0 ? "border-orange-300" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={14} className={data.expiring_7_days > 0 ? "text-orange-500" : "text-muted-foreground"} />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Expirando em 7d</p>
                </div>
                <p className={`text-2xl font-bold ${data.expiring_7_days > 0 ? "text-orange-500" : ""}`}>
                  {data.expiring_7_days}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Distribuição por status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Distribuição por Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(data.by_status).map(([status, info]) => {
                const pct = totalByStatus > 0 ? (info.count / totalByStatus) * 100 : 0
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className="w-24 shrink-0">
                      <Badge variant="outline" className="text-[10px] w-full justify-center">
                        {STATUS_LABELS[status] ?? status}
                      </Badge>
                    </div>
                    <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                      <div
                        className={`h-full rounded transition-all ${STATUS_COLORS[status] ?? "bg-slate-300"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold w-8 text-right">{info.count}</span>
                    <span className="text-xs text-emerald-600 font-medium w-28 text-right hidden sm:block">
                      {fmtCurrency(info.value)}
                    </span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
