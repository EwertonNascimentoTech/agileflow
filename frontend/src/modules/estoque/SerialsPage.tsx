import { useEffect, useState } from "react"
import { Plus, BadgeCheck, Loader2, Trash2 } from "lucide-react"
import {
  stockApi, productsApi, warehousesApi,
  type StockSerial, type StockSerialCreate, type Product, type Warehouse, type SerialStatus,
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

const STATUS_LABEL: Record<SerialStatus, string> = {
  in_stock: "Em estoque",
  reserved: "Reservado",
  sold:     "Vendido",
  damaged:  "Danificado",
  returned: "Devolvido",
}

const NONE = "__none__"

export default function SerialsPage() {
  const [items, setItems] = useState<StockSerial[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>(NONE)
  const [form, setForm] = useState<StockSerialCreate>({
    product_id: "", warehouse_id: null, serial: "",
    status: "in_stock", cost_unit: 0,
  })

  useEffect(() => {
    Promise.all([
      stockApi.listSerials(),
      productsApi.list({ limit: 500 }),
      warehousesApi.list(false),
    ]).then(([s, p, w]) => {
      setItems(s); setProducts(p); setWarehouses(w)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    stockApi.listSerials({
      status: filterStatus !== NONE ? (filterStatus as SerialStatus) : undefined,
    }).then(setItems)
  }, [filterStatus])

  function openCreate() {
    setForm({ product_id: "", warehouse_id: null, serial: "", status: "in_stock", cost_unit: 0 })
    setServerError("")
    setOpen(true)
  }

  async function handleSave() {
    setServerError("")
    if (!form.product_id || !form.serial) {
      setServerError("Preencha produto e número de série."); return
    }
    setSaving(true)
    try {
      const created = await stockApi.createSerial(form)
      setItems(prev => [created, ...prev])
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: StockSerial) {
    if (!confirm(`Excluir serial "${s.serial}"?`)) return
    setDeletingId(s.id)
    try {
      await stockApi.removeSerial(s.id)
      setItems(prev => prev.filter(x => x.id !== s.id))
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  function productOf(id: string) { return products.find(p => p.id === id) }
  function warehouseOf(id: string | null) { return id ? warehouses.find(w => w.id === id) : null }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Números de série</h1>
          <p className="text-sm text-muted-foreground">Unidades individuais identificadas por serial.</p>
        </div>
        <Button onClick={openCreate} className="gap-1.5"><Plus size={16} /> Novo serial</Button>
      </div>

      <Select value={filterStatus} onValueChange={setFilterStatus}>
        <SelectTrigger className="w-56 h-9"><SelectValue placeholder="Todos os status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Todos os status</SelectItem>
          {(Object.keys(STATUS_LABEL) as SerialStatus[]).map(s => (
            <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="Nenhum serial cadastrado"
          description="Cadastre seriais para produtos cujo tipo rastreia número de série."
          action={{ label: "Novo serial", onClick: openCreate }}
        />
      ) : (
        <div className="space-y-1.5">
          {items.map(s => {
            const p = productOf(s.product_id)
            const w = warehouseOf(s.warehouse_id)
            return (
              <Card key={s.id}>
                <CardContent className="p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{p?.name ?? s.product_id}</p>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">{s.serial}</Badge>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{STATUS_LABEL[s.status]}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{w?.name ?? "—"}</p>
                  </div>
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(s)}
                    disabled={deletingId === s.id}
                  >
                    {deletingId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo número de série</DialogTitle>
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
                <Select value={form.warehouse_id ?? NONE}
                  onValueChange={(v) => setForm({ ...form, warehouse_id: v === NONE ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Sem depósito" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem depósito</SelectItem>
                    {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Serial</Label>
                <Input className="font-mono" value={form.serial}
                  onChange={e => setForm({ ...form, serial: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status ?? "in_stock"}
                  onValueChange={(v) => setForm({ ...form, status: v as SerialStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as SerialStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Custo unitário</Label>
                <Input type="number" step="0.0001" value={form.cost_unit ?? 0}
                  onChange={e => setForm({ ...form, cost_unit: Number(e.target.value) })} />
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
