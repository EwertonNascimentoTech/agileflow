import { useEffect, useState } from "react"
import { ArrowLeftRight, ArrowDown, ArrowUp, RefreshCw, Loader2 } from "lucide-react"
import {
  stockApi, productsApi, warehousesApi, suppliersApi,
  type StockMovement, type Product, type Warehouse, type Supplier, type MovementType,
} from "@/api/estoque"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { EmptyState } from "@/components/EmptyState"

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar."
}

const NONE = "__none__"

const TYPE_META: Record<MovementType, { label: string; icon: typeof ArrowUp; color: string }> = {
  in:       { label: "Entrada",       icon: ArrowDown,      color: "text-green-600" },
  out:      { label: "Saída",         icon: ArrowUp,        color: "text-red-600" },
  adjust:   { label: "Ajuste",        icon: RefreshCw,      color: "text-amber-600" },
  transfer: { label: "Transferência", icon: ArrowLeftRight, color: "text-blue-600" },
}

export default function MovementsPage() {
  const [items, setItems] = useState<StockMovement[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"in" | "out" | "adjust" | "transfer">("in")
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState("")

  // form fields
  const [productId, setProductId] = useState<string>("")
  const [warehouseId, setWarehouseId] = useState<string>("")
  const [toWarehouseId, setToWarehouseId] = useState<string>("")
  const [quantity, setQuantity] = useState<string>("")
  const [costUnit, setCostUnit] = useState<string>("")
  const [supplierId, setSupplierId] = useState<string>("")
  const [reason, setReason] = useState<string>("")
  const [notes, setNotes] = useState<string>("")

  useEffect(() => {
    Promise.all([
      stockApi.listMovements({ limit: 200 }),
      productsApi.list({ limit: 500 }),
      warehousesApi.list(false),
      suppliersApi.list(true),
    ]).then(([m, p, w, s]) => {
      setItems(m); setProducts(p); setWarehouses(w); setSuppliers(s)
    }).finally(() => setLoading(false))
  }, [])

  function resetForm() {
    setProductId(""); setWarehouseId(""); setToWarehouseId("")
    setQuantity(""); setCostUnit(""); setSupplierId("")
    setReason(""); setNotes("")
    setServerError("")
  }

  function openModal(t: typeof tab) {
    setTab(t); resetForm(); setOpen(true)
  }

  async function submit() {
    setServerError("")
    if (!productId) { setServerError("Selecione um produto."); return }
    if (!warehouseId) { setServerError("Selecione o depósito."); return }
    const qty = parseFloat(quantity)
    if (!qty || qty <= 0) { setServerError("Quantidade deve ser maior que zero."); return }

    setSaving(true)
    try {
      let mov: StockMovement | StockMovement[]
      if (tab === "in" || tab === "out") {
        mov = await stockApi.createMovement({
          product_id: productId,
          warehouse_id: warehouseId,
          type: tab,
          quantity: qty,
          cost_unit: costUnit ? parseFloat(costUnit) : undefined,
          supplier_id: tab === "in" && supplierId ? supplierId : undefined,
          reason: reason || undefined,
          notes: notes || undefined,
        })
        setItems(prev => [mov as StockMovement, ...prev])
      } else if (tab === "adjust") {
        if (!reason) { setServerError("Motivo é obrigatório em ajustes."); setSaving(false); return }
        mov = await stockApi.adjust({
          product_id: productId,
          warehouse_id: warehouseId,
          new_quantity: qty,
          reason,
          notes: notes || undefined,
        })
        setItems(prev => [mov as StockMovement, ...prev])
      } else {
        if (!toWarehouseId) { setServerError("Selecione o depósito de destino."); setSaving(false); return }
        mov = await stockApi.transfer({
          product_id: productId,
          from_warehouse_id: warehouseId,
          to_warehouse_id: toWarehouseId,
          quantity: qty,
          reason: reason || undefined,
          notes: notes || undefined,
        })
        setItems(prev => [...(mov as StockMovement[]), ...prev])
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  function productOf(id: string) { return products.find(p => p.id === id) }
  function warehouseOf(id: string) { return warehouses.find(w => w.id === id) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Movimentações</h1>
          <p className="text-sm text-muted-foreground">Histórico de entradas, saídas, ajustes e transferências.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => openModal("in")} className="gap-1.5"><ArrowDown size={14} /> Entrada</Button>
          <Button variant="outline" onClick={() => openModal("out")} className="gap-1.5"><ArrowUp size={14} /> Saída</Button>
          <Button variant="outline" onClick={() => openModal("adjust")} className="gap-1.5"><RefreshCw size={14} /> Ajuste</Button>
          <Button variant="outline" onClick={() => openModal("transfer")} className="gap-1.5"><ArrowLeftRight size={14} /> Transferir</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Nenhuma movimentação registrada"
          description="Registre uma entrada para começar."
          action={{ label: "Entrada", onClick: () => openModal("in") }}
        />
      ) : (
        <div className="space-y-1.5">
          {items.map(m => {
            const meta = TYPE_META[m.type]
            const Icon = meta.icon
            const p = productOf(m.product_id)
            const w = warehouseOf(m.warehouse_id)
            return (
              <Card key={m.id}>
                <CardContent className="p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-8 w-8 rounded-md bg-muted flex items-center justify-center ${meta.color}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p?.name ?? m.product_id}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {meta.label} · {w?.name ?? m.warehouse_id}
                        {m.reason ? ` · ${m.reason}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold">{m.quantity} {p?.unit ?? ""}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova movimentação</DialogTitle>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid grid-cols-4">
              <TabsTrigger value="in">Entrada</TabsTrigger>
              <TabsTrigger value="out">Saída</TabsTrigger>
              <TabsTrigger value="adjust">Ajuste</TabsTrigger>
              <TabsTrigger value="transfer">Transferir</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label>Produto</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{tab === "transfer" ? "Depósito de origem" : "Depósito"}</Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {tab === "transfer" && (
                  <div className="space-y-1.5">
                    <Label>Depósito de destino</Label>
                    <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {warehouses.filter(w => w.id !== warehouseId).map(w => (
                          <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>{tab === "adjust" ? "Nova quantidade total" : "Quantidade"}</Label>
                  <Input type="number" step="0.0001" value={quantity}
                    onChange={e => setQuantity(e.target.value)} />
                </div>
                {(tab === "in" || tab === "out") && (
                  <div className="space-y-1.5">
                    <Label>Custo unitário</Label>
                    <Input type="number" step="0.0001" value={costUnit}
                      onChange={e => setCostUnit(e.target.value)} />
                  </div>
                )}
              </div>

              {tab === "in" && (
                <div className="space-y-1.5">
                  <Label>Fornecedor</Label>
                  <Select value={supplierId || NONE} onValueChange={(v) => setSupplierId(v === NONE ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Sem fornecedor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem fornecedor</SelectItem>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>{tab === "adjust" ? "Motivo (obrigatório)" : "Motivo"}</Label>
                <Input value={reason} onChange={e => setReason(e.target.value)}
                  placeholder={tab === "adjust" ? "Inventário, perda, correção…" : "Compra #123, venda, devolução…"} />
              </div>

              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>

              {serverError && <Alert variant="destructive"><AlertDescription className="text-xs">{serverError}</AlertDescription></Alert>}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
