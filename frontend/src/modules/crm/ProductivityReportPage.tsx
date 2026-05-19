import { useEffect, useState } from "react"
import { TrendingUp, TrendingDown, Download, Minus } from "lucide-react"
import { productivityApi } from "@/api/crm"
import type { ProductivityData } from "@/api/crm"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

function getMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const last = new Date(y, now.getMonth() + 1, 0).getDate()
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${last}` }
}

function DeltaArrow({ delta }: { delta: number | null | undefined }) {
  if (delta === null || delta === undefined)
    return <span className="text-muted-foreground"><Minus size={12} /></span>
  return (
    <span className={cn("flex items-center gap-0.5 text-[10px]", delta >= 0 ? "text-emerald-600" : "text-red-600")}>
      {delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(delta).toFixed(1)}%
    </span>
  )
}

export default function ProductivityReportPage() {
  const [periodStart, setPeriodStart] = useState(getMonthRange().start)
  const [periodEnd, setPeriodEnd] = useState(getMonthRange().end)
  const [data, setData] = useState<ProductivityData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function load() {
    if (!periodStart || !periodEnd) return
    setLoading(true)
    setError("")
    productivityApi
      .get({ period_start: periodStart, period_end: periodEnd })
      .then(setData)
      .catch(() => setError("Erro ao carregar relatório de produtividade."))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [periodStart, periodEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleExport() {
    const url = productivityApi.exportCsvUrl({ period_start: periodStart, period_end: periodEnd })
    window.open(url, "_blank")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">Produtividade por Vendedor</h2>
          <p className="text-sm text-muted-foreground">Métricas por agente no período selecionado.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
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
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : data && data.users.length > 0 ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vendedor</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Abertos</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Ganhos</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Perdidos</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Tarefas Concluídas</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Mensagens</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tx. Conversão</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u, i) => (
                  <tr key={u.user_id ?? i} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {u.user_id?.slice(0, 8) ?? "Não atribuído"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-semibold">{u.attendances_opened}</span>
                        <DeltaArrow delta={u.attendances_opened_delta} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-semibold text-emerald-600">{u.attendances_won}</span>
                        <DeltaArrow delta={u.attendances_won_delta} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-semibold text-red-600">{u.attendances_lost}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-semibold">{u.tasks_done}</span>
                        <DeltaArrow delta={u.tasks_done_delta} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-semibold">{u.messages_sent}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "font-bold",
                        u.conversion_rate >= 50 ? "text-emerald-600" : u.conversion_rate >= 25 ? "text-amber-600" : "text-muted-foreground"
                      )}>
                        {u.conversion_rate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : data ? (
        <div className="text-center py-16 text-muted-foreground text-sm border border-dashed rounded-xl">
          Nenhum dado para o período selecionado.
        </div>
      ) : null}
    </div>
  )
}
