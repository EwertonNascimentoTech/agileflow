import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, Settings2 } from "lucide-react"
import {
  productTypesApi,
  type ProductType,
  type ProductTypeCreate,
  type ProductTypeField,
  type FieldType,
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
import { nullableStr } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/EmptyState"

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar."
}

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text",     label: "Texto curto" },
  { value: "textarea", label: "Texto longo" },
  { value: "number",   label: "Número" },
  { value: "date",     label: "Data" },
  { value: "boolean",  label: "Sim/Não" },
  { value: "select",   label: "Lista (opções)" },
]

const emptyField = (): ProductTypeField => ({ key: "", label: "", type: "text", required: false })

export default function ProductTypesPage() {
  const [types, setTypes] = useState<ProductType[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProductType | null>(null)
  const [serverError, setServerError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<ProductTypeCreate>({
    slug: "", name: "", description: "", icon: "",
    field_schema: { fields: [] },
    tracks_stock: true, tracks_batch: false, tracks_expiry: false, tracks_serial: false,
    is_active: true,
  })

  useEffect(() => {
    productTypesApi.list(false).then(setTypes).finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    setForm({
      slug: "", name: "", description: "", icon: "",
      field_schema: { fields: [] },
      tracks_stock: true, tracks_batch: false, tracks_expiry: false, tracks_serial: false,
      is_active: true,
    })
    setServerError("")
    setOpen(true)
  }

  function openEdit(t: ProductType) {
    setEditing(t)
    setForm({
      slug: t.slug,
      name: t.name,
      description: t.description ?? "",
      icon: t.icon ?? "",
      field_schema: t.field_schema ?? { fields: [] },
      tracks_stock: t.tracks_stock,
      tracks_batch: t.tracks_batch,
      tracks_expiry: t.tracks_expiry,
      tracks_serial: t.tracks_serial,
      is_active: t.is_active,
    })
    setServerError("")
    setOpen(true)
  }

  function addField() {
    setForm(f => ({
      ...f,
      field_schema: { fields: [...(f.field_schema?.fields ?? []), emptyField()] },
    }))
  }

  function updateField(idx: number, patch: Partial<ProductTypeField>) {
    setForm(f => {
      const fields = [...(f.field_schema?.fields ?? [])]
      fields[idx] = { ...fields[idx], ...patch }
      return { ...f, field_schema: { fields } }
    })
  }

  function removeField(idx: number) {
    setForm(f => {
      const fields = [...(f.field_schema?.fields ?? [])]
      fields.splice(idx, 1)
      return { ...f, field_schema: { fields } }
    })
  }

  async function handleSave() {
    setServerError("")
    setSaving(true)
    try {
      const payload: ProductTypeCreate = {
        ...form,
        field_schema:
          form.field_schema && form.field_schema.fields.length > 0
            ? form.field_schema
            : undefined,
      }
      if (editing) {
        const { slug: _slug, ...rest } = payload
        const updated = await productTypesApi.update(editing.id, {
          name: rest.name,
          description: nullableStr(rest.description),
          icon: nullableStr(rest.icon),
          field_schema: rest.field_schema ?? null,
          tracks_stock: rest.tracks_stock,
          tracks_batch: rest.tracks_batch,
          tracks_expiry: rest.tracks_expiry,
          tracks_serial: rest.tracks_serial,
          is_active: rest.is_active,
        })
        setTypes(prev => prev.map(t => t.id === updated.id ? updated : t))
      } else {
        const created = await productTypesApi.create(payload)
        setTypes(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(t: ProductType) {
    if (!confirm(`Excluir o tipo "${t.name}"? Só funciona se nenhum produto estiver vinculado.`)) return
    setDeletingId(t.id)
    try {
      await productTypesApi.remove(t.id)
      setTypes(prev => prev.filter(x => x.id !== t.id))
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  const fields = form.field_schema?.fields ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Tipos de produto</h1>
          <p className="text-sm text-muted-foreground">
            Define quais campos extras cada tipo de produto possui e o que é rastreado (lote, validade, serial).
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus size={16} /> Novo tipo
        </Button>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          O catálogo é genérico. Crie um tipo para cada categoria conceitual de produto: "Alimento" (com validade/lote),
          "Bateria" (com serial), "Serviço/Contrato" (sem estoque) etc. Os campos custom ficam disponíveis ao
          cadastrar um produto desse tipo.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : types.length === 0 ? (
        <EmptyState
          icon={Settings2}
          title="Nenhum tipo cadastrado"
          description="Cadastre o primeiro tipo de produto para começar."
          action={{ label: "Novo tipo", onClick: openCreate }}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {types.map(t => (
            <Card key={t.id} className={!t.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{t.name}</p>
                      {t.is_active
                        ? <Badge variant="secondary" className="text-[10px] h-4 px-1.5">ativo</Badge>
                        : <Badge variant="outline" className="text-[10px] h-4 px-1.5">inativo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{t.slug}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(t)}
                      disabled={deletingId === t.id}
                    >
                      {deletingId === t.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </Button>
                  </div>
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                )}
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {t.tracks_stock && <Badge variant="outline" className="h-4 px-1.5">estoque</Badge>}
                  {t.tracks_batch && <Badge variant="outline" className="h-4 px-1.5">lote</Badge>}
                  {t.tracks_expiry && <Badge variant="outline" className="h-4 px-1.5">validade</Badge>}
                  {t.tracks_serial && <Badge variant="outline" className="h-4 px-1.5">serial</Badge>}
                  {(t.field_schema?.fields?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="h-4 px-1.5">
                      {t.field_schema!.fields.length} campo(s) custom
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar tipo" : "Novo tipo de produto"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={form.slug}
                  disabled={!!editing}
                  className="font-mono"
                  placeholder="alimento"
                  onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                />
                {editing && <p className="text-[11px] text-muted-foreground">Slug não pode ser alterado.</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  placeholder="Alimento"
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={form.description ?? ""}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                ["tracks_stock", "Rastreia estoque"],
                ["tracks_batch", "Rastreia lote"],
                ["tracks_expiry", "Tem validade"],
                ["tracks_serial", "Número de série"],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2 rounded-md border p-2">
                  <Switch
                    checked={form[key] ?? false}
                    onCheckedChange={(v) => setForm({ ...form, [key]: v })}
                  />
                  <span className="text-xs">{label}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Campos customizados</p>
                  <p className="text-[11px] text-muted-foreground">
                    Aparecem ao cadastrar/editar produtos deste tipo.
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addField} className="gap-1.5">
                  <Plus size={13} /> Campo
                </Button>
              </div>

              {fields.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Nenhum campo custom — apenas dados padrão.</p>
              ) : (
                <div className="space-y-2">
                  {fields.map((f, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3 space-y-1">
                        <Label className="text-[10px]">Key</Label>
                        <Input
                          className="h-8 text-xs font-mono"
                          value={f.key}
                          onChange={e => updateField(idx, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                        />
                      </div>
                      <div className="col-span-3 space-y-1">
                        <Label className="text-[10px]">Label</Label>
                        <Input
                          className="h-8 text-xs"
                          value={f.label}
                          onChange={e => updateField(idx, { label: e.target.value })}
                        />
                      </div>
                      <div className="col-span-3 space-y-1">
                        <Label className="text-[10px]">Tipo</Label>
                        <Select value={f.type} onValueChange={(v) => updateField(idx, { type: v as FieldType })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPE_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 flex items-center gap-1 pb-2">
                        <Switch
                          checked={!!f.required}
                          onCheckedChange={(v) => updateField(idx, { required: v })}
                        />
                        <span className="text-[10px]">obrig.</span>
                      </div>
                      <div className="col-span-1 pb-1">
                        <Button
                          type="button" size="icon" variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removeField(idx)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                      {f.type === "select" && (
                        <div className="col-span-12 space-y-1">
                          <Label className="text-[10px]">Opções (separadas por vírgula)</Label>
                          <Input
                            className="h-8 text-xs"
                            value={(f.options ?? []).join(", ")}
                            onChange={e => updateField(idx, {
                              options: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
                            })}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <p className="text-sm font-medium">Tipo ativo</p>
              <Switch
                checked={form.is_active ?? true}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>

            {serverError && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{serverError}</AlertDescription>
              </Alert>
            )}
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
