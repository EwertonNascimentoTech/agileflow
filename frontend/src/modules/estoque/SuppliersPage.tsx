import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, Truck } from "lucide-react"
import { suppliersApi, type Supplier, type SupplierCreate } from "@/api/estoque"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"
import { nullableStr } from "@/lib/utils"

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar."
}

export default function SuppliersPage() {
  const [items, setItems] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState<SupplierCreate>({
    name: "", trade_name: "", document: "", email: "", phone: "", notes: "", is_active: true,
  })
  const [serverError, setServerError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    suppliersApi.list(false).then(setItems).finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    setForm({ name: "", trade_name: "", document: "", email: "", phone: "", notes: "", is_active: true })
    setServerError("")
    setOpen(true)
  }

  function openEdit(s: Supplier) {
    setEditing(s)
    setForm({
      name: s.name,
      trade_name: s.trade_name ?? "",
      document: s.document ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      notes: s.notes ?? "",
      is_active: s.is_active,
    })
    setServerError("")
    setOpen(true)
  }

  async function handleSave() {
    setServerError("")
    setSaving(true)
    try {
      if (editing) {
        const updated = await suppliersApi.update(editing.id, {
          name: form.name.trim(),
          trade_name: nullableStr(form.trade_name),
          document: nullableStr(form.document),
          email: nullableStr(form.email),
          phone: nullableStr(form.phone),
          notes: nullableStr(form.notes),
          is_active: form.is_active,
        })
        setItems(prev => prev.map(x => x.id === updated.id ? updated : x))
      } else {
        const created = await suppliersApi.create(form)
        setItems(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: Supplier) {
    if (!confirm(`Excluir o fornecedor "${s.name}"?`)) return
    setDeletingId(s.id)
    try {
      await suppliersApi.remove(s.id)
      setItems(prev => prev.filter(x => x.id !== s.id))
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
          <h1 className="text-xl font-bold">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">Cadastro de fornecedores para vincular a produtos e movimentações de entrada.</p>
        </div>
        <Button onClick={openCreate} className="gap-1.5"><Plus size={16} /> Novo fornecedor</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nenhum fornecedor"
          description="Cadastre fornecedores para vinculá-los a produtos."
          action={{ label: "Novo fornecedor", onClick: openCreate }}
        />
      ) : (
        <div className="space-y-1.5">
          {items.map(s => (
            <Card key={s.id} className={!s.is_active ? "opacity-60" : ""}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {[s.document, s.email, s.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}>
                    <Pencil size={13} />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(s)}
                    disabled={deletingId === s.id}
                  >
                    {deletingId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Razão social</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Nome fantasia</Label>
                <Input value={form.trade_name ?? ""} onChange={e => setForm({ ...form, trade_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Documento (CNPJ/CPF)</Label>
                <Input value={form.document ?? ""} onChange={e => setForm({ ...form, document: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.phone ?? ""} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea rows={2} value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <p className="text-sm">Ativo</p>
              <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
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
