import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import { conversionApi, funnelsApi } from "@/api/crm"
import type { ConversionFunnelData, Funnel } from "@/api/crm"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function getMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const last = new Date(y, now.getMonth() + 1, 0).getDate()
  return {
    start: `${y}-${m}-01`,
    end: `${y}-${m}-${last}`,
  }
}

export default function ConversionFunnelPage() {
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [selectedFunnelId, setSelectedFunnelId] = useState<string>("__all__")
  const [periodStart, setPeriodStart] = useState(getMonthRange().start)
  const [periodEnd, setPeriodEnd] = useState(getMonthRange().end)
  const [data, setData] = useState<ConversionFunnelData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    funnelsApi.list(true).then(setFunnels).catch(() => {})
  }, [])

  useEffect(() => {
    if (!periodStart || !periodEnd) return
    setLoading(true)
    setError("")
    const params: { period_start: string; period_end: string; funnel_id?: string } = {
      period_start: periodStart,
      period_end: periodEnd,
    }
    if (selectedFunnelId !== "__all__") params.funnel_id = selectedFunnelId
    conversionApi
      .getFunnelConversion(params)
      .then(setData)
      .catch(() => setError("Erro ao carregar dados de conversão."))
      .finally(() => setLoading(false))
  }, [periodStart, periodEnd, selectedFunnelId])

  function handleExportCsv() {
    const params = new URLSearchParams({ period_start: periodStart, period_end: periodEnd })
    if (selectedFunnelId !== "__all__") params.append("funnel_id", selectedFunnelId)
    window.open(`/api/v1/atendimento/reports/funnel-conversion?${params}`, "_blank")
  }

  const maxEntries = data ? Math.max(...data.stages.map(s => s.entries), 1) : 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">Funil de Conversão</h2>
          <p className="text-sm text-muted-foreground">Análise visual de taxas de conversão por etapa.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv}>
          <Download size={13} /> Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Início</Label>
          <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="h-8 text-xs w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fim</Label>
          <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="h-8 text-xs w-36" />
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
        <div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : data && data.stages.length > 0 ? (
        <>
          {/* Funil visual */}
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <p className="text-sm font-semibold mb-4">Funil de etapas</p>
            {data.stages.map((stage, i) => {
              const widthPct = maxEntries > 0 ? (stage.entries / maxEntries) * 100 : 0
              const prevEntries = i > 0 ? data.stages[i - 1].entries : stage.entries
              const convFromPrev = prevEntries > 0 ? (stage.entries / prevEntries * 100).toFixed(1) : null

              return (
                <div key={stage.stage_id} className="space-y-1">
                  {i > 0 && convFromPrev !== null && (
                    <div className="flex items-center gap-2 py-0.5">
                      <div className="flex-1 border-t border-dashed" />
                      <span className="text-[10px] text-muted-foreground bg-background px-1">{convFromPrev}% passou</span>
                      <div className="flex-1 border-t border-dashed" />
                    </div>
                  )}
                  <div className="relative flex items-center gap-3">
                    <div
                      className="h-10 rounded-md flex items-center justify-between px-3 transition-all"
                      style={{
                        width: `${Math.max(widthPct, 15)}%`,
                        minWidth: "120px",
                        backgroundColor: stage.color + "30",
                        borderLeft: `4px solid ${stage.color}`,
                      }}
                    >
                      <span className="text-xs font-medium truncate">{stage.stage_name}</span>
                      <span className="text-xs font-bold ml-2 shrink-0">{stage.entries}</span>
                    </div>
                    <div className="flex gap-4 text-[11px] text-muted-foreground">
                      <span>Tx. conv: <strong className="text-foreground">{stage.conversion_rate}%</strong></span>
                      <span>Tempo médio: <strong className="text-foreground">{stage.avg_days}d</strong></span>
                      {stage.losses > 0 && (
                        <span className="text-red-600">Perdas: <strong>{stage.losses}</strong></span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Top motivos de perda */}
          {data.loss_reasons.length > 0 && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold">Top motivos de perda</p>
              <div className="space-y-2">
                {data.loss_reasons.slice(0, 5).map((item, i) => {
                  const maxCount = data.loss_reasons[0].count
                  const pct = maxCount > 0 ? (item.count / maxCount * 100) : 0
                  return (
                    <div key={i} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate max-w-[80%]">{item.reason}</span>
                        <span className="font-semibold shrink-0 ml-2">{item.count}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-400 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : data ? (
        <div className="text-center py-16 text-muted-foreground text-sm border border-dashed rounded-xl">
          Nenhum dado para o período/funil selecionado.
        </div>
      ) : null}
    </div>
  )
}
