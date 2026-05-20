import { useEffect, useState } from "react"
import { Plus, Layers, Loader2, Trash2 } from "lucide-react"
import {
  stockApi, productsApi, warehousesApi,
  type StockBatch, type StockBatchCreate, type Product, type Warehouse,
} from "@/api/estoque"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/EmptyState"

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar."
}

export default function BatchesPage() {
  const [items, setItems] = useState<StockBatch[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState<StockBatchCreate>({
    product_id: "", warehouse_id: "", batch_code: "",
    quantity: 0, cost_unit: 0, manufacture_date: undefined, expiry_date: undefined,
  })

  useEffect(() => {
    Promise.all([
      stockApi.listBatches(),
      productsApi.list({ limit: 500 }),
      warehousesApi.list(false),
    ]).then(([b, p, w]) => {
      setItems(b); setProducts(p); setWarehouses(w)
    }).finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setForm({ product_id: "", warehouse_id: "", batch_code: "", quantity: 0, cost_unit: 0 })
    setServerError("")
    setOpen(true)
  }

  async function handleSave() {
    setServerError("")
    if (!form.product_id || !form.warehouse_id || !form.batch_code) {
      setServerError("Preencha produto, depósito e código do lote."); return
    }
    setSaving(true)
    try {
      const created = await stockApi.createBatch(form)
      setItems(prev => [created, ...prev])
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(b: StockBatch) {
    if (!confirm(`Excluir lote "${b.batch_code}"?`)) return
    setDeletingId(b.id)
    try {
      await stockApi.removeBatch(b.id)
      setItems(prev => prev.filter(x => x.id !== b.id))
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  function productOf(id: string) { return products.find(p => p.id === id) }
  function warehouseOf(id: string) { return warehouses.find(w => w.id === id) }

  function isExpired(d: string | null) {
    if (!d) return false
    return new Date(d) < new Date()
  }
  function isExpiring(d: string | null) {
    if (!d) return false
    const days = (new Date(d).getTime() - Date.now()) / 86400000
    return days > 0 && days <= 30
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Lotes</h1>
          <p className="text-sm text-muted-foreground">Lotes rastreáveis com data de fabricação e validade.</p>
        </div>
        <Button onClick={openCreate} className="gap-1.5"><Plus size={16} /> Novo lote</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhum lote"
          description="Cadastre lotes para produtos cujo tipo rastreia lote/validade."
          action={{ label: "Novo lote", onClick: openCreate }}
        />
      ) : (
        <div className="space-y-1.5">
          {items.map(b => {
            const p = productOf(b.product_id)
            const w = warehouseOf(b.warehouse_id)
            return (
              <Card key={b.id}>
                <CardContent className="p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{p?.name ?? b.product_id}</p>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">{b.batch_code}</Badge>
                      {isExpired(b.expiry_date) && <Badge variant="destructive" className="text-[10px] h-4 px-1.5">vencido</Badge>}
                      {!isExpired(b.expiry_date) && isExpiring(b.expiry_date) && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">vence em breve</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {w?.name ?? b.warehouse_id}
                      {b.expiry_date ? ` · validade ${new Date(b.expiry_date).toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold">{b.quantity}</span>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(b)}
                      disabled={deletingId === b.id}
                    >
                      {deletingId === b.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </Button>
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
            <DialogTitle>Novo lote</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Produto</Label>
              <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Depósito</Label>
                <Select value={form.warehouse_id} onValueChange={(v) => setForm({ ...form, warehouse_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Código do lote</Label>
                <Input className="font-mono" value={form.batch_code}
                  onChange={e => setForm({ ...form, batch_code: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input type="number" step="0.0001" value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Custo unitário</Label>
                <Input type="number" step="0.0001" value={form.cost_unit ?? 0}
                  onChange={e => setForm({ ...form, cost_unit: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fabricação</Label>
                <Input type="date" value={form.manufacture_date ?? ""}
                  onChange={e => setForm({ ...form, manufacture_date: e.target.value || undefined })} />
              </div>
              <div className="space-y-1.5">
                <Label>Validade</Label>
                <Input type="date" value={form.expiry_date ?? ""}
                  onChange={e => setForm({ ...form, expiry_date: e.target.value || undefined })} />
              </div>
            </div>
            {serverError && <Alert variant="destructive"><AlertDescription className="text-xs">{serverError}</AlertDescription></Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
