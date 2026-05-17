import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Search, Package, Loader2, Pencil, Trash2 } from "lucide-react"
import {
  productsApi, productTypesApi, categoriesApi,
  type Product, type ProductCreate, type ProductType, type ProductCategory,
} from "@/api/estoque"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/EmptyState"
import CustomFieldsRenderer from "./CustomFieldsRenderer"

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar."
}

const NONE = "__none__"

export default function ProductsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Product[]>([])
  const [types, setTypes] = useState<ProductType[]>([])
  const [cats, setCats] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState<string>(NONE)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductCreate>({
    type_id: "", category_id: null, sku: "", name: "", description: "",
    barcode: "", unit: "un",
    cost_price: 0, sale_price: 0, min_stock: 0, max_stock: null,
    custom_fields: {}, is_active: true,
  })
  const [serverError, setServerError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      productsApi.list({ limit: 200 }),
      productTypesApi.list(true),
      categoriesApi.list(),
    ]).then(([p, t, c]) => {
      setItems(p); setTypes(t); setCats(c)
    }).finally(() => setLoading(false))
  }, [])

  const selectedType = useMemo(
    () => types.find(t => t.id === form.type_id) ?? null,
    [types, form.type_id]
  )

  const filtered = items.filter(p => {
    if (filterType !== NONE && p.type_id !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !p.name.toLowerCase().includes(q) &&
        !p.sku.toLowerCase().includes(q) &&
        !(p.barcode ?? "").toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  function openCreate() {
    setEditing(null)
    const defaultType = types[0]?.id ?? ""
    setForm({
      type_id: defaultType, category_id: null, sku: "", name: "", description: "",
      barcode: "", unit: "un",
      cost_price: 0, sale_price: 0, min_stock: 0, max_stock: null,
      custom_fields: {}, is_active: true,
    })
    setServerError("")
    setOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      type_id: p.type_id,
      category_id: p.category_id,
      sku: p.sku, name: p.name,
      description: p.description ?? "",
      barcode: p.barcode ?? "",
      unit: p.unit,
      cost_price: p.cost_price,
      sale_price: p.sale_price,
      min_stock: p.min_stock,
      max_stock: p.max_stock,
      custom_fields: (p.custom_fields as Record<string, unknown>) ?? {},
      is_active: p.is_active,
    })
    setServerError("")
    setOpen(true)
  }

  async function handleSave() {
    setServerError("")
    if (!form.type_id) {
      setServerError("Tipo de produto é obrigatório.")
      return
    }
    setSaving(true)
    try {
      const cleaned: ProductCreate = {
        ...form,
        custom_fields:
          form.custom_fields && Object.keys(form.custom_fields).length > 0
            ? form.custom_fields
            : undefined,
      }
      if (editing) {
        const { type_id: _t, ...update } = cleaned
        const updated = await productsApi.update(editing.id, update)
        setItems(prev => prev.map(x => x.id === updated.id ? updated : x))
      } else {
        const created = await productsApi.create(cleaned)
        setItems(prev => [created, ...prev])
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: Product) {
    if (!confirm(`Excluir "${p.name}"? Só funciona se não houver movimentações.`)) return
    setDeletingId(p.id)
    try {
      await productsApi.remove(p.id)
      setItems(prev => prev.filter(x => x.id !== p.id))
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  function typeName(id: string) {
    return types.find(t => t.id === id)?.name ?? "—"
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "…" : `${items.length} produto${items.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button
          onClick={openCreate}
          disabled={types.length === 0}
          className="gap-1.5"
          title={types.length === 0 ? "Cadastre um tipo primeiro" : undefined}
        >
          <Plus size={16} /> Novo produto
        </Button>
      </div>

      {types.length === 0 && (
        <Alert>
          <AlertDescription className="text-xs">
            Antes de cadastrar produtos, crie pelo menos um <strong>Tipo</strong> (na aba "Tipos").
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome, SKU ou código de barras…"
            value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Filtrar por tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Todos os tipos</SelectItem>
            {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={search || filterType !== NONE ? "Nenhum produto encontrado" : "Nenhum produto"}
          description={search || filterType !== NONE ? "Tente outros filtros." : "Cadastre o primeiro produto."}
          action={!search && filterType === NONE && types.length > 0 ? { label: "Novo produto", onClick: openCreate } : undefined}
        />
      ) : (
        <div className="space-y-1.5">
          {filtered.map(p => (
            <Card
              key={p.id}
              className={`cursor-pointer hover:shadow-sm transition-shadow ${!p.is_active ? "opacity-60" : ""}`}
              onClick={() => navigate(`/app/modules/estoque/products/${p.id}`)}
            >
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">{typeName(p.type_id)}</Badge>
                    {!p.is_active && <Badge variant="outline" className="text-[10px] h-4 px-1.5">inativo</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    SKU: {p.sku}{p.barcode ? ` · ${p.barcode}` : ""}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); openEdit(p) }}>
                    <Pencil size={13} />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); handleDelete(p) }}
                    disabled={deletingId === p.id}
                  >
                    {deletingId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.type_id}
                  disabled={!!editing}
                  onValueChange={(v) => setForm({ ...form, type_id: v, custom_fields: {} })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {editing && <p className="text-[11px] text-muted-foreground">Tipo não pode ser alterado.</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select
                  value={form.category_id ?? NONE}
                  onValueChange={(v) => setForm({ ...form, category_id: v === NONE ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem categoria</SelectItem>
                    {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SKU</Label>
                <Input className="font-mono" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} />
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

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Código de barras</Label>
                <Input value={form.barcode ?? ""} onChange={e => setForm({ ...form, barcode: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Input className="font-mono" placeholder="un, kg, L, m…"
                  value={form.unit ?? "un"} onChange={e => setForm({ ...form, unit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Estoque mínimo</Label>
                <Input type="number" step="0.0001" value={form.min_stock ?? 0}
                  onChange={e => setForm({ ...form, min_stock: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Preço de custo</Label>
                <Input type="number" step="0.0001" value={form.cost_price ?? 0}
                  onChange={e => setForm({ ...form, cost_price: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Preço de venda</Label>
                <Input type="number" step="0.0001" value={form.sale_price ?? 0}
                  onChange={e => setForm({ ...form, sale_price: Number(e.target.value) })} />
              </div>
            </div>

            {selectedType?.field_schema?.fields && selectedType.field_schema.fields.length > 0 && (
              <CustomFieldsRenderer
                fields={selectedType.field_schema.fields}
                values={(form.custom_fields as Record<string, unknown>) ?? {}}
                onChange={(v) => setForm({ ...form, custom_fields: v })}
              />
            )}

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
