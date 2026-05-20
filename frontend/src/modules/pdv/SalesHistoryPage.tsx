import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { ReceiptText } from "lucide-react"
import { salesApi, type SaleListItem, type SaleStatus } from "@/api/pdv"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { EmptyState } from "@/components/EmptyState"
import { fmtMoney, fmtDateTime, getApiError } from "./pdvUtils"

const ALL = "__all__"

export default function SalesHistoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<SaleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [status, setStatus] = useState<SaleStatus | typeof ALL>(ALL)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const load = useCallback(() => {
    setLoading(true)
    setError("")
    salesApi.list({
      status: status === ALL ? undefined : status,
      date_from: dateFrom ? `${dateFrom}T00:00:00` : undefined,
      date_to: dateTo ? `${dateTo}T23:59:59` : undefined,
      limit: 200,
    })
      .then(setItems)
      .catch(err => setError(getApiError(err)))
      .finally(() => setLoading(false))
  }, [status, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Vendas</h1>
        <p className="text-sm text-muted-foreground">Histórico de vendas registradas no PDV.</p>
      </div>

      <Card>
        <CardContent className="p-4 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as SaleStatus | typeof ALL)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                <SelectItem value="completed">Concluídas</SelectItem>
                <SelectItem value="cancelled">Canceladas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Nenhuma venda"
          description="Nenhuma venda no período selecionado."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground text-left border-b">
                  <th className="px-4 py-2 font-medium">Número</th>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map(s => (
                  <tr
                    key={s.id}
                    className="border-b last:border-0 cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/app/modules/pdv/sales/${s.id}`)}
                  >
                    <td className="px-4 py-2.5 font-mono">{s.number}</td>
                    <td className="px-4 py-2.5">{fmtDateTime(s.created_at)}</td>
                    <td className="px-4 py-2.5">
                      {s.status === "cancelled"
                        ? <Badge variant="outline" className="text-[10px]">cancelada</Badge>
                        : <Badge variant="secondary" className="text-[10px]">concluída</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">{fmtMoney(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
