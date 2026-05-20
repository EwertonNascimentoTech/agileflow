import { useEffect, useState, useCallback, useRef } from "react"
import { Link } from "react-router-dom"
import {
  Search, Plus, Trash2, ShoppingCart, Loader2, Wallet,
} from "lucide-react"
import {
  salesApi, paymentMethodsApi, cashApi,
  type ProductSearchResult, type PaymentMethod, type SaleCreate,
} from "@/api/pdv"
import { warehousesApi, type Warehouse } from "@/api/estoque"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"
import { fmtMoney, fmtQty, getApiError } from "./pdvUtils"

interface CartLine {
  product: ProductSearchResult
  qty: number
  discount: number
}
interface PaymentRow {
  methodId: string
  amount: string
}

export default function PosPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState("")
  const [hasOpenSession, setHasOpenSession] = useState<boolean | null>(null)
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState("")
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const [cart, setCart] = useState<CartLine[]>([])
  const [saleDiscount, setSaleDiscount] = useState("0")
  const [payments, setPayments] = useState<PaymentRow[]>([])

  const [error, setError] = useState("")
  const [finalizing, setFinalizing] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Carrega depósitos + formas de pagamento.
  useEffect(() => {
    Promise.all([warehousesApi.list(true), paymentMethodsApi.list(true)])
      .then(([ws, ms]) => {
        setWarehouses(ws)
        setMethods(ms)
        const def = ws.find(w => w.is_default) ?? ws[0]
        if (def) setWarehouseId(def.id)
        else setLoading(false)
      })
      .catch(err => { setError(getApiError(err)); setLoading(false) })
  }, [])

  // Verifica caixa aberto para o depósito selecionado.
  useEffect(() => {
    if (!warehouseId) return
    setLoading(true)
    setHasOpenSession(null)
    cashApi.getOpenSession(warehouseId)
      .then(s => setHasOpenSession(!!s))
      .catch(() => setHasOpenSession(false))
      .finally(() => setLoading(false))
  }, [warehouseId])

  const runSearch = useCallback((q: string, wid: string) => {
    if (!wid) return
    setSearching(true)
    salesApi.searchProducts(wid, q || undefined)
      .then(setResults)
      .catch(err => setError(getApiError(err)))
      .finally(() => setSearching(false))
  }, [])

  function onSearchChange(v: string) {
    setSearch(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(v, warehouseId), 300)
  }

  function addToCart(p: ProductSearchResult) {
    setCart(prev => {
      const existing = prev.find(l => l.product.id === p.id)
      if (existing) {
        return prev.map(l => l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l)
      }
      return [...prev, { product: p, qty: 1, discount: 0 }]
    })
  }

  function updateLine(id: string, patch: Partial<CartLine>) {
    setCart(prev => prev.map(l => l.product.id === id ? { ...l, ...patch } : l))
  }

  function removeLine(id: string) {
    setCart(prev => prev.filter(l => l.product.id !== id))
  }

  function addPayment() {
    setPayments(prev => [...prev, { methodId: methods[0]?.id ?? "", amount: "" }])
  }

  function updatePayment(idx: number, patch: Partial<PaymentRow>) {
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p))
  }

  function removePayment(idx: number) {
    setPayments(prev => prev.filter((_, i) => i !== idx))
  }

  const subtotal = cart.reduce(
    (sum, l) => sum + Math.max(0, l.qty * l.product.sale_price - l.discount), 0,
  )
  const saleDiscountNum = Number(saleDiscount) || 0
  const total = Math.max(0, subtotal - saleDiscountNum)
  const paidAmount = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const change = Math.max(0, paidAmount - total)
  const canFinalize =
    cart.length > 0 &&
    payments.length > 0 &&
    payments.every(p => p.methodId && Number(p.amount) > 0) &&
    paidAmount >= total &&
    total > 0

  async function handleFinalize() {
    setError("")
    setFinalizing(true)
    try {
      const payload: SaleCreate = {
        warehouse_id: warehouseId,
        items: cart.map(l => ({
          product_id: l.product.id,
          quantity: l.qty,
          discount_amount: l.discount,
        })),
        payments: payments.map(p => ({
          payment_method_id: p.methodId,
          amount: Number(p.amount),
        })),
        discount_amount: saleDiscountNum,
      }
      const sale = await salesApi.finalize(payload)
      // Limpa e abre recibo.
      setCart([])
      setPayments([])
      setSaleDiscount("0")
      setSearch("")
      setResults([])
      window.open(`/app/modules/pdv/sales/${sale.id}/receipt`, "_blank")
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setFinalizing(false)
    }
  }

  if (loading && hasOpenSession === null) {
    return <Skeleton className="h-64 rounded-lg" />
  }

  if (warehouses.length === 0) {
    return (
      <Alert><AlertDescription className="text-xs">
        Nenhum depósito ativo. Cadastre um depósito no módulo Estoque para vender.
      </AlertDescription></Alert>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Venda</h1>
          <p className="text-sm text-muted-foreground">Busque produtos, monte o carrinho e finalize.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Depósito</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}

      {hasOpenSession === false ? (
        <EmptyState
          icon={Wallet}
          title="Nenhum caixa aberto"
          description="Abra um caixa para este depósito antes de registrar vendas."
          action={{ label: "Ir para o Caixa", onClick: () => { window.location.href = "/app/modules/pdv/cash" } }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Busca + resultados */}
          <div className="lg:col-span-2 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, SKU ou código de barras…"
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                onFocus={() => { if (results.length === 0) runSearch(search, warehouseId) }}
              />
            </div>

            <Card>
              <CardContent className="p-0">
                {searching ? (
                  <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                ) : results.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {results.map(p => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <p className="font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {p.tracks_stock
                              ? <span className="text-xs text-muted-foreground">{fmtQty(p.stock_qty)} {p.unit}</span>
                              : <span className="text-xs text-muted-foreground">serviço</span>}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                            {fmtMoney(p.sale_price)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="outline" className="h-7 gap-1"
                              onClick={() => addToCart(p)}>
                              <Plus size={13} /> Add
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Carrinho + pagamento */}
          <div className="space-y-3">
            <Card>
              <CardContent className="p-4 space-y-3">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <ShoppingCart size={15} /> Carrinho
                </h2>
                {cart.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Carrinho vazio.</p>
                ) : (
                  <div className="space-y-2">
                    {cart.map(l => (
                      <div key={l.product.id} className="border rounded-md p-2 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-tight">{l.product.name}</p>
                          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive"
                            onClick={() => removeLine(l.product.id)}>
                            <Trash2 size={12} />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <Label className="text-[10px] text-muted-foreground">Qtd.</Label>
                            <Input type="number" min={0} step="0.01" className="h-7"
                              value={l.qty}
                              onChange={e => updateLine(l.product.id, { qty: Number(e.target.value) })} />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[10px] text-muted-foreground">Desconto</Label>
                            <Input type="number" min={0} step="0.01" className="h-7"
                              value={l.discount}
                              onChange={e => updateLine(l.product.id, { discount: Number(e.target.value) })} />
                          </div>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{fmtMoney(l.product.sale_price)} un.</span>
                          <span className="font-medium">
                            {fmtMoney(Math.max(0, l.qty * l.product.sale_price - l.discount))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Separator />
                <div className="space-y-1.5">
                  <Label className="text-xs">Desconto da venda</Label>
                  <Input type="number" min={0} step="0.01" className="h-8"
                    value={saleDiscount} onChange={e => setSaleDiscount(e.target.value)} />
                </div>

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span><span>{fmtMoney(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Desconto</span><span>{fmtMoney(saleDiscountNum)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base">
                    <span>Total</span><span>{fmtMoney(total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Pagamento</h2>
                  <Button size="sm" variant="outline" className="h-7 gap-1" onClick={addPayment}
                    disabled={methods.length === 0}>
                    <Plus size={13} /> Forma
                  </Button>
                </div>
                {methods.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma forma de pagamento cadastrada. Configure em Config.
                  </p>
                )}
                {payments.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={p.methodId} onValueChange={(v) => updatePayment(idx, { methodId: v })}>
                      <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Forma" /></SelectTrigger>
                      <SelectContent>
                        {methods.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" min={0} step="0.01" className="h-8 w-28"
                      placeholder="Valor"
                      value={p.amount}
                      onChange={e => updatePayment(idx, { amount: e.target.value })} />
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                      onClick={() => removePayment(idx)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}

                <Separator />
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Pago</span><span>{fmtMoney(paidAmount)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Troco</span><span>{fmtMoney(change)}</span>
                  </div>
                  {paidAmount < total && cart.length > 0 && (
                    <p className="text-xs text-destructive">
                      Falta {fmtMoney(total - paidAmount)}
                    </p>
                  )}
                </div>

                <Button className="w-full gap-1.5" disabled={!canFinalize || finalizing}
                  onClick={handleFinalize}>
                  {finalizing && <Loader2 size={15} className="animate-spin" />}
                  Finalizar venda
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Precisa abrir ou conferir o caixa? <Link to="/app/modules/pdv/cash" className="underline">Ir para o Caixa</Link>.
      </p>
    </div>
  )
}
