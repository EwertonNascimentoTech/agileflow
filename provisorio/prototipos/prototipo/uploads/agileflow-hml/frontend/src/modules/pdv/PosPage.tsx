import { useEffect, useState, useCallback, useRef } from "react"
import { Link } from "react-router-dom"
import {
  Search, Plus, Trash2, ShoppingCart, Loader2, Wallet, AlertTriangle,
} from "lucide-react"
import {
  salesApi, paymentMethodsApi, cashApi,
  type ProductSearchResult, type PaymentMethod, type SaleCreate,
} from "@/api/pdv"
import { warehousesApi, stockApi, type Warehouse, type StockBatch, type StockSerial } from "@/api/estoque"
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
  batchId?: string
  serialId?: string
}
interface PaymentRow {
  methodId: string
  amount: string
}

// Persistência do carrinho em andamento (sobrevive a reload). Escopado por depósito.
const CART_KEY = "pdv:cart:v1"
type PersistedCart = { warehouseId: string; cart: CartLine[]; saleDiscount: string; payments: PaymentRow[] }
function readPersistedCart(): PersistedCart | null {
  try {
    const raw = localStorage.getItem(CART_KEY)
    return raw ? (JSON.parse(raw) as PersistedCart) : null
  } catch {
    return null
  }
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

  const [cart, setCart] = useState<CartLine[]>(() => readPersistedCart()?.cart ?? [])
  const [saleDiscount, setSaleDiscount] = useState(() => readPersistedCart()?.saleDiscount ?? "0")
  const [payments, setPayments] = useState<PaymentRow[]>(() => readPersistedCart()?.payments ?? [])

  const [error, setError] = useState("")
  const [finalizing, setFinalizing] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Opções de lote/série por produto (carregadas sob demanda ao adicionar).
  const [batchOptions, setBatchOptions] = useState<Record<string, StockBatch[]>>({})
  const [serialOptions, setSerialOptions] = useState<Record<string, StockSerial[]>>({})

  // Atalhos de teclado: busca, F2 (qtd), F3 (desconto) da última linha.
  const searchRef = useRef<HTMLInputElement>(null)
  const qtyRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const discountRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const [lastLineId, setLastLineId] = useState<string | null>(null)

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

  // Carrinho restaurado pertence a outro depósito → descarta.
  useEffect(() => {
    if (!warehouseId) return
    const stored = readPersistedCart()
    if (stored && stored.warehouseId !== warehouseId) {
      setCart([])
      setPayments([])
      setSaleDiscount("0")
      localStorage.removeItem(CART_KEY)
    }
  }, [warehouseId])

  // Persiste o carrinho em andamento (some quando vazio ou após finalizar).
  useEffect(() => {
    if (!warehouseId) return
    const empty = cart.length === 0 && payments.length === 0 && (saleDiscount === "0" || saleDiscount === "")
    if (empty) {
      localStorage.removeItem(CART_KEY)
      return
    }
    localStorage.setItem(CART_KEY, JSON.stringify({ warehouseId, cart, saleDiscount, payments }))
  }, [warehouseId, cart, saleDiscount, payments])

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

  // Carrega lotes/séries disponíveis de um produto rastreado (uma vez).
  const loadTrackingOptions = useCallback((p: ProductSearchResult) => {
    if (!warehouseId) return
    if (p.tracks_batch) {
      stockApi.listBatches({ product_id: p.id, warehouse_id: warehouseId })
        .then(bs => setBatchOptions(prev => ({ ...prev, [p.id]: bs.filter(b => b.quantity > 0) })))
        .catch(() => {})
    }
    if (p.tracks_serial) {
      stockApi.listSerials({ product_id: p.id, warehouse_id: warehouseId, status: "in_stock" })
        .then(ss => setSerialOptions(prev => ({ ...prev, [p.id]: ss })))
        .catch(() => {})
    }
  }, [warehouseId])

  function addToCart(p: ProductSearchResult) {
    setCart(prev => {
      const existing = prev.find(l => l.product.id === p.id)
      if (existing) {
        // Série: 1 por linha (cada unidade é única) — não incrementa.
        if (p.tracks_serial) return prev
        return prev.map(l => l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l)
      }
      return [...prev, { product: p, qty: 1, discount: 0 }]
    })
    setLastLineId(p.id)
    loadTrackingOptions(p)
  }

  // Carrega opções para itens já no carrinho (ex: restaurado do localStorage).
  useEffect(() => {
    if (!warehouseId) return
    cart.forEach(l => {
      if (l.product.tracks_batch || l.product.tracks_serial) loadTrackingOptions(l.product)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, loadTrackingOptions])

  // Match exato por código de barras ou SKU (case-insensitive).
  function findExact(list: ProductSearchResult[], q: string): ProductSearchResult | null {
    const k = q.toLowerCase()
    return list.find(p => (p.barcode ?? "").toLowerCase() === k || p.sku.toLowerCase() === k) ?? null
  }

  function addAndReset(p: ProductSearchResult) {
    addToCart(p)
    setSearch("")
    setResults([])
    searchRef.current?.focus()
  }

  // Enter na busca: trata leitor de código de barras e digitação manual.
  // - leitor bipa dígitos + Enter (antes do debounce) → força busca e auto-adiciona o match exato
  // - digitação manual com resultados na tela → adiciona o 1º (ou o match exato)
  async function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return
    e.preventDefault()
    const q = e.currentTarget.value.trim()
    if (!q) return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const exact = findExact(results, q)
    if (exact) { addAndReset(exact); return }
    if (results.length > 0) { addAndReset(results[0]); return }

    // Nada carregado ainda (leitor mais rápido que o debounce) → busca imediata.
    setSearching(true)
    try {
      const found = await salesApi.searchProducts(warehouseId, q || undefined)
      const m = findExact(found, q) ?? (found.length >= 1 ? found[0] : null)
      if (m) { addAndReset(m); return }
      setResults(found)
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setSearching(false)
    }
  }

  // F2 → quantidade, F3 → desconto da última linha mexida.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== "F2" && e.key !== "F3") return
      const id = lastLineId ?? cart[cart.length - 1]?.product.id
      if (!id) return
      const map = e.key === "F2" ? qtyRefs.current : discountRefs.current
      const el = map.get(id)
      if (el) {
        e.preventDefault()
        el.focus()
        el.select()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [lastLineId, cart])

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
  // Toda linha rastreada precisa de lote/série selecionado.
  const trackingOk = cart.every(l =>
    (!l.product.tracks_batch || !!l.batchId) && (!l.product.tracks_serial || !!l.serialId)
  )
  const canFinalize =
    cart.length > 0 &&
    payments.length > 0 &&
    payments.every(p => p.methodId && Number(p.amount) > 0) &&
    paidAmount >= total &&
    total > 0 &&
    trackingOk

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
          batch_id: l.product.tracks_batch ? l.batchId : undefined,
          serial_id: l.product.tracks_serial ? l.serialId : undefined,
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
            <div>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  autoFocus
                  className="h-12 rounded-xl pl-10 text-base"
                  placeholder="Buscar por nome, SKU ou código de barras…"
                  value={search}
                  onChange={e => onSearchChange(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                  onFocus={() => { if (results.length === 0) runSearch(search, warehouseId) }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-muted px-1.5 py-0.5">Enter</kbd> adiciona</span>
                <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-muted px-1.5 py-0.5">F2</kbd> qtd</span>
                <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-muted px-1.5 py-0.5">F3</kbd> desconto</span>
              </div>
            </div>

            {searching ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : results.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>
            ) : (
              <div className="scrollbar-thin grid max-h-[calc(100vh-16rem)] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                {results.map(p => {
                  const out = p.tracks_stock && p.stock_qty <= 0
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="flex flex-col rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/50 hover:shadow-md"
                    >
                      <div className="mb-2 h-16 rounded-lg bg-muted" />
                      <span className="line-clamp-2 text-sm font-medium leading-tight">{p.name}</span>
                      <span className="mt-0.5 font-mono text-[11px] text-muted-foreground">{p.sku}</span>
                      <span className="mt-1 text-base font-bold text-primary">{fmtMoney(p.sale_price)}</span>
                      <span className={`mt-0.5 text-xs ${out ? "text-rose-500" : "text-muted-foreground"}`}>
                        {!p.tracks_stock ? "serviço" : out ? "Sem estoque" : `${fmtQty(p.stock_qty)} ${p.unit}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
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
                              ref={el => { if (el) qtyRefs.current.set(l.product.id, el); else qtyRefs.current.delete(l.product.id) }}
                              value={l.qty}
                              disabled={l.product.tracks_serial}
                              onFocus={() => setLastLineId(l.product.id)}
                              onChange={e => updateLine(l.product.id, { qty: Number(e.target.value) })} />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[10px] text-muted-foreground">Desconto</Label>
                            <Input type="number" min={0} step="0.01" className="h-7"
                              ref={el => { if (el) discountRefs.current.set(l.product.id, el); else discountRefs.current.delete(l.product.id) }}
                              value={l.discount}
                              onFocus={() => setLastLineId(l.product.id)}
                              onChange={e => updateLine(l.product.id, { discount: Number(e.target.value) })} />
                          </div>
                        </div>
                        {l.product.tracks_batch && (
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Lote</Label>
                            <Select value={l.batchId ?? ""} onValueChange={v => updateLine(l.product.id, { batchId: v })}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecione o lote" /></SelectTrigger>
                              <SelectContent>
                                {(batchOptions[l.product.id] ?? []).map(b => (
                                  <SelectItem key={b.id} value={b.id}>
                                    {b.batch_code}{b.expiry_date ? ` · val ${b.expiry_date}` : ""} · {fmtQty(b.quantity)} disp.
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {(batchOptions[l.product.id] ?? []).length === 0 && (
                              <p className="mt-0.5 text-[11px] text-amber-600">Nenhum lote disponível neste depósito.</p>
                            )}
                          </div>
                        )}
                        {l.product.tracks_serial && (
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Nº de série</Label>
                            <Select value={l.serialId ?? ""} onValueChange={v => updateLine(l.product.id, { serialId: v })}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecione a série" /></SelectTrigger>
                              <SelectContent>
                                {(serialOptions[l.product.id] ?? []).map(s => (
                                  <SelectItem key={s.id} value={s.id}>{s.serial}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {(serialOptions[l.product.id] ?? []).length === 0 && (
                              <p className="mt-0.5 text-[11px] text-amber-600">Nenhuma série disponível neste depósito.</p>
                            )}
                          </div>
                        )}
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{fmtMoney(l.product.sale_price)} un.</span>
                          <span className="font-medium">
                            {fmtMoney(Math.max(0, l.qty * l.product.sale_price - l.discount))}
                          </span>
                        </div>
                        {l.product.tracks_stock && !l.product.tracks_batch && l.qty > l.product.stock_qty && (
                          <p className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle size={12} />
                            Excede estoque (disp.: {fmtQty(l.product.stock_qty)} {l.product.unit})
                          </p>
                        )}
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

                <Button size="lg" className="w-full justify-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
                  disabled={!canFinalize || finalizing}
                  onClick={handleFinalize}>
                  {finalizing && <Loader2 size={15} className="animate-spin" />}
                  Finalizar venda{total > 0 ? ` · ${fmtMoney(total)}` : ""}
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
