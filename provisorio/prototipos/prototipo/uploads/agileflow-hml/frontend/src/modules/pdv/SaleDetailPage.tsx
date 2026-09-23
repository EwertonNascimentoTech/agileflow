import { useEffect, useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { ArrowLeft, Printer, Ban, Loader2 } from "lucide-react"
import { salesApi, type Sale } from "@/api/pdv"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { fmtMoney, fmtQty, fmtDateTime, getApiError } from "./pdvUtils"

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [sale, setSale] = useState<Sale | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [cancelError, setCancelError] = useState("")
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!id) return
    salesApi.get(id)
      .then(setSale)
      .catch(err => setError(getApiError(err)))
      .finally(() => setLoading(false))
  }, [id])

  async function handleCancel() {
    if (!sale) return
    setCancelError("")
    setCancelling(true)
    try {
      const updated = await salesApi.cancel(sale.id, reason)
      setSale(updated)
      setCancelOpen(false)
    } catch (err) {
      setCancelError(getApiError(err))
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
  if (error) return <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>
  if (!sale) return null

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} /> Voltar
        </button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/app/modules/pdv/sales/${sale.id}/receipt`} target="_blank" className="gap-1.5">
              <Printer size={14} /> Recibo
            </Link>
          </Button>
          {sale.status === "completed" && (
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => { setReason(""); setCancelError(""); setCancelOpen(true) }}>
              <Ban size={14} /> Cancelar venda
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold font-mono">{sale.number}</h1>
        {sale.status === "cancelled"
          ? <Badge variant="outline">cancelada</Badge>
          : <Badge variant="secondary">concluída</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{fmtDateTime(sale.created_at)}</p>

      {sale.status === "cancelled" && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">
            Cancelada em {fmtDateTime(sale.cancelled_at)}. Motivo: {sale.cancel_reason ?? "—"}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-2">Itens</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground text-left border-b">
                <th className="py-1.5 font-medium">Produto</th>
                <th className="py-1.5 font-medium text-right">Qtd.</th>
                <th className="py-1.5 font-medium text-right">Preço</th>
                <th className="py-1.5 font-medium text-right">Desc.</th>
                <th className="py-1.5 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map(it => (
                <tr key={it.id} className="border-b last:border-0">
                  <td className="py-1.5">
                    <p>{it.product_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{it.product_sku}</p>
                  </td>
                  <td className="py-1.5 text-right">{fmtQty(it.quantity)} {it.unit}</td>
                  <td className="py-1.5 text-right">{fmtMoney(it.unit_price)}</td>
                  <td className="py-1.5 text-right">{fmtMoney(it.discount_amount)}</td>
                  <td className="py-1.5 text-right font-medium">{fmtMoney(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4 space-y-1.5">
            <h2 className="text-sm font-semibold mb-1">Pagamentos</h2>
            {sale.payments.map(p => (
              <div key={p.id} className="flex justify-between text-sm">
                <span>{p.method_name}</span>
                <span className="font-medium">{fmtMoney(p.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1.5 text-sm">
            <Row label="Subtotal" value={fmtMoney(sale.subtotal)} />
            <Row label="Desconto" value={fmtMoney(sale.discount_amount)} />
            <Separator />
            <Row label="Total" value={fmtMoney(sale.total)} bold />
            <Row label="Pago" value={fmtMoney(sale.paid_amount)} />
            <Row label="Troco" value={fmtMoney(sale.change_amount)} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar venda {sale.number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O estoque dos itens será devolvido. Esta ação não pode ser desfeita.
            </p>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            {cancelError && <Alert variant="destructive"><AlertDescription className="text-xs">{cancelError}</AlertDescription></Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling || !reason.trim()}>
              {cancelling && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-base" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  )
}
