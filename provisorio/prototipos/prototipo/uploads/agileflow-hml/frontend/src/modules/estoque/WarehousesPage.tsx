import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, Warehouse as WarehouseIcon } from "lucide-react"
import { warehousesApi, type Warehouse, type WarehouseCreate } from "@/api/estoque"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar."
}

export default function WarehousesPage() {
  const [items, setItems] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [form, setForm] = useState<WarehouseCreate>({
    code: "", name: "", description: "", is_default: false, is_active: true,
  })
  const [serverError, setServerError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    warehousesApi.list(false).then(setItems).finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    setForm({ code: "", name: "", description: "", is_default: false, is_active: true })
    setServerError("")
    setOpen(true)
  }

  function openEdit(w: Warehouse) {
    setEditing(w)
    setForm({
      code: w.code, name: w.name,
      description: w.description ?? "",
      is_default: w.is_default, is_active: w.is_active,
    })
    setServerError("")
    setOpen(true)
  }

  async function handleSave() {
    setServerError("")
    setSaving(true)
    try {
      if (editing) {
        const updated = await warehousesApi.update(editing.id, form)
        setItems(prev => prev.map(x => x.id === updated.id ? updated : x))
      } else {
        const created = await warehousesApi.create(form)
        setItems(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(w: Warehouse) {
    if (!confirm(`Excluir o depósito "${w.name}"?`)) return
    setDeletingId(w.id)
    try {
      await warehousesApi.remove(w.id)
      setItems(prev => prev.filter(x => x.id !== w.id))
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Depósitos</h1>
          <p className="text-sm text-muted-foreground">Locais físicos ou lógicos onde o estoque é mantido.</p>
        </div>
        <Button onClick={openCreate} className="gap-1.5"><Plus size={16} /> Novo depósito</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={WarehouseIcon}
          title="Nenhum depósito"
          description="Cadastre pelo menos um depósito para registrar movimentações."
          action={{ label: "Novo depósito", onClick: openCreate }}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(w => (
            <Card key={w.id} className={!w.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{w.name}</p>
                      {w.is_default && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">padrão</Badge>}
                      {!w.is_active && <Badge variant="outline" className="text-[10px] h-4 px-1.5">inativo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{w.code}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(w)}>
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(w)}
                      disabled={deletingId === w.id}
                    >
                      {deletingId === w.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </Button>
                  </div>
                </div>
                {w.description && <p className="text-xs text-muted-foreground line-clamp-2">{w.description}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar depósito" : "Novo depósito"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Código</Label>
                <Input className="font-mono" value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.description ?? ""} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-md border p-3">
                <p className="text-sm">Padrão</p>
                <Switch checked={form.is_default ?? false} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <p className="text-sm">Ativo</p>
                <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
            </div>
            {serverError && <Alert variant="destructive"><AlertDescription className="text-xs">{serverError}</AlertDescription></Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
