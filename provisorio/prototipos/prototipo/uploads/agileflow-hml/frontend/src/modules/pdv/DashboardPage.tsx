import { useEffect, useState, useCallback } from "react"
import { ShoppingCart, DollarSign, Receipt, XCircle, TrendingUp, Percent, Wallet } from "lucide-react"
import { dashboardApi, type PdvDashboard } from "@/api/pdv"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PageHeader } from "@/components/PageHeader"
import { KpiCard } from "@/components/KpiCard"
import { SectionCard } from "@/components/SectionCard"
import { fmtMoney, getApiError } from "./pdvUtils"

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function PdvDashboardPage() {
  const [day, setDay] = useState(todayISO())
  const [data, setData] = useState<PdvDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback((d: string) => {
    setLoading(true)
    setError("")
    dashboardApi.get(d)
      .then(setData)
      .catch(err => setError(getApiError(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(day) }, [day, load])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        subtitle="Resumo de vendas do dia."
        actions={
          <div className="space-y-1.5">
            <Label className="text-xs">Dia</Label>
            <Input type="date" value={day} onChange={e => setDay(e.target.value)} className="w-44" />
          </div>
        }
      />

      {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Sem dados.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard icon={ShoppingCart} label="Vendas" value={String(data.sales_count)} />
            <KpiCard icon={DollarSign} label="Faturamento líquido" value={fmtMoney(data.net_total)} />
            <KpiCard icon={Receipt} label="Ticket médio" value={fmtMoney(data.average_ticket)} />
            <KpiCard icon={XCircle} label="Canceladas" value={String(data.cancelled_count)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard icon={TrendingUp} label="Faturamento bruto" value={fmtMoney(data.gross_total)} />
            <KpiCard icon={Percent} label="Descontos" value={fmtMoney(data.discount_total)} />
            <KpiCard icon={Wallet} label="Caixas abertos" value={String(data.open_sessions)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Por operador">
              {data.by_operator.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma venda.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground text-left">
                      <th className="py-1 font-medium">Operador</th>
                      <th className="py-1 font-medium text-right">Vendas</th>
                      <th className="py-1 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_operator.map(o => (
                      <tr key={o.operator_id} className="border-t border-border">
                        <td className="py-1.5">{o.operator_name}</td>
                        <td className="py-1.5 text-right">{o.count}</td>
                        <td className="py-1.5 text-right font-medium">{fmtMoney(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SectionCard>

            <SectionCard title="Por forma de pagamento">
              {data.by_payment_method.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum pagamento.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground text-left">
                      <th className="py-1 font-medium">Forma</th>
                      <th className="py-1 font-medium text-right">Qtd.</th>
                      <th className="py-1 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_payment_method.map(p => (
                      <tr key={p.method_id} className="border-t border-border">
                        <td className="py-1.5">{p.method_name}</td>
                        <td className="py-1.5 text-right">{p.count}</td>
                        <td className="py-1.5 text-right font-medium">{fmtMoney(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}
