import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, Tags } from "lucide-react"
import {
  categoriesApi, productTypesApi,
  type ProductCategory, type ProductCategoryCreate, type ProductType,
} from "@/api/estoque"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
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

const NONE = "__none__"

export default function CategoriesPage() {
  const [cats, setCats] = useState<ProductCategory[]>([])
  const [types, setTypes] = useState<ProductType[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProductCategory | null>(null)
  const [form, setForm] = useState<ProductCategoryCreate>({
    name: "", description: "", parent_id: null, product_type_id: null, is_active: true,
  })
  const [serverError, setServerError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([categoriesApi.list(), productTypesApi.list(true)])
      .then(([c, t]) => { setCats(c); setTypes(t) })
      .finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    setForm({ name: "", description: "", parent_id: null, product_type_id: null, is_active: true })
    setServerError("")
    setOpen(true)
  }

  function openEdit(c: ProductCategory) {
    setEditing(c)
    setForm({
      name: c.name,
      description: c.description ?? "",
      parent_id: c.parent_id,
      product_type_id: c.product_type_id,
      is_active: c.is_active,
    })
    setServerError("")
    setOpen(true)
  }

  async function handleSave() {
    setServerError("")
    setSaving(true)
    try {
      if (editing) {
        const updated = await categoriesApi.update(editing.id, form)
        setCats(prev => prev.map(c => c.id === updated.id ? updated : c))
      } else {
        const created = await categoriesApi.create(form)
        setCats(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: ProductCategory) {
    if (!confirm(`Excluir a categoria "${c.name}"?`)) return
    setDeletingId(c.id)
    try {
      await categoriesApi.remove(c.id)
      setCats(prev => prev.filter(x => x.id !== c.id))
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
          <h1 className="text-xl font-bold">Categorias</h1>
          <p className="text-sm text-muted-foreground">Agrupe produtos. Suporta hierarquia (pai/filho).</p>
        </div>
        <Button onClick={openCreate} className="gap-1.5"><Plus size={16} /> Nova categoria</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : cats.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="Nenhuma categoria cadastrada"
          description="Cadastre categorias para agrupar produtos."
          action={{ label: "Nova categoria", onClick: openCreate }}
        />
      ) : (
        <div className="space-y-1.5">
          {cats.map(c => {
            const parent = c.parent_id ? cats.find(x => x.id === c.parent_id) : null
            const ptype = c.product_type_id ? types.find(t => t.id === c.product_type_id) : null
            return (
              <Card key={c.id} className={!c.is_active ? "opacity-60" : ""}>
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {parent ? `↳ ${parent.name}` : "Categoria raiz"}
                      {ptype ? ` · tipo: ${ptype.name}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(c)}
                      disabled={deletingId === c.id}
                    >
                      {deletingId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
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
            <DialogTitle>{editing ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.description ?? ""} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria pai</Label>
                <Select
                  value={form.parent_id ?? NONE}
                  onValueChange={(v) => setForm({ ...form, parent_id: v === NONE ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhuma (raiz)</SelectItem>
                    {cats.filter(c => c.id !== editing?.id).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de produto</Label>
                <Select
                  value={form.product_type_id ?? NONE}
                  onValueChange={(v) => setForm({ ...form, product_type_id: v === NONE ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Sem tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem tipo</SelectItem>
                    {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <p className="text-sm font-medium">Categoria ativa</p>
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
