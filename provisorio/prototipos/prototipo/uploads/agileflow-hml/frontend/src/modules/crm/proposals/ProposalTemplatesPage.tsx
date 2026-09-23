import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, FileText, Layers } from "lucide-react"
import { proposalTemplatesApi } from "@/api/crm"
import type { ProposalTemplate, ProposalTemplateItemCreate } from "@/api/crm"
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

interface DraftItem {
  description: string
  quantity: string
  unit: string
  unit_price: string
}

const emptyItem = (): DraftItem => ({ description: "", quantity: "1", unit: "un", unit_price: "0" })

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x: { msg?: string }) => x.msg).join(", ")
  return "Erro ao processar."
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v))

export default function ProposalTemplatesPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<ProposalTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProposalTemplate | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [serverError, setServerError] = useState("")
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: "", description: "", title: "", body: "",
    payment_terms: "", delivery_terms: "", notes: "",
    discount: "0", validity_days: "30", is_active: true,
  })
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])

  useEffect(() => {
    proposalTemplatesApi.list(false)
      .then(setTemplates)
      .finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    setForm({
      name: "", description: "", title: "", body: "",
      payment_terms: "", delivery_terms: "", notes: "",
      discount: "0", validity_days: "30", is_active: true,
    })
    setItems([emptyItem()])
    setServerError("")
    setOpen(true)
  }

  function openEdit(t: ProposalTemplate) {
    setEditing(t)
    setForm({
      name: t.name,
      description: t.description ?? "",
      title: t.title ?? "",
      body: t.body ?? "",
      payment_terms: t.payment_terms ?? "",
      delivery_terms: t.delivery_terms ?? "",
      notes: t.notes ?? "",
      discount: String(t.discount ?? 0),
      validity_days: t.validity_days != null ? String(t.validity_days) : "",
      is_active: t.is_active,
    })
    setItems(t.items.length > 0
      ? t.items.map(i => ({
          description: i.description,
          quantity: String(i.quantity),
          unit: i.unit ?? "",
          unit_price: String(i.unit_price),
        }))
      : [emptyItem()]
    )
    setServerError("")
    setOpen(true)
  }

  function addItem() { setItems([...items, emptyItem()]) }
  function removeItem(i: number) { setItems(items.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof DraftItem, value: string) {
    setItems(items.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  async function save() {
    setServerError("")
    if (!form.name.trim()) { setServerError("Nome obrigatório."); return }

    const validItems = items.filter(i => i.description.trim() && Number(i.quantity) > 0)
    const payload = {
      name: form.name.trim(),
      description: form.description || undefined,
      title: form.title || undefined,
      body: form.body || undefined,
      payment_terms: form.payment_terms || undefined,
      delivery_terms: form.delivery_terms || undefined,
      notes: form.notes || undefined,
      discount: Number(form.discount) || 0,
      validity_days: form.validity_days ? Number(form.validity_days) : undefined,
      is_active: form.is_active,
      items: validItems.map<ProposalTemplateItemCreate>((i, idx) => ({
        description: i.description.trim(),
        quantity: Number(i.quantity),
        unit: i.unit || undefined,
        unit_price: Number(i.unit_price),
        order: idx,
      })),
    }

    setSaving(true)
    try {
      if (editing) {
        const updated = await proposalTemplatesApi.update(editing.id, payload)
        setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t))
      } else {
        const created = await proposalTemplatesApi.create(payload)
        setTemplates(prev => [...prev, created])
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(t: ProposalTemplate) {
    if (!confirm(`Excluir o template "${t.name}"?`)) return
    setDeletingId(t.id)
    try {
      await proposalTemplatesApi.remove(t.id)
      setTemplates(prev => prev.filter(x => x.id !== t.id))
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  const itemsTotal = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0)
  const finalTotal = Math.max(itemsTotal - Number(form.discount || 0), 0)

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/app/modules/crm/proposals")}>
          <ArrowLeft size={15} />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Templates de Proposta</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "Carregando…" : `${templates.length} template${templates.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus size={14} /> Novo Template
        </Button>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          Templates pré-preenchem novas propostas com items, condições e textos padrão. Útil pra serviços recorrentes.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhum template criado"
          description="Crie templates de proposta para reaproveitar em propostas futuras."
          action={{ label: "Novo Template", onClick: openCreate }}
        />
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <Card key={t.id} className={!t.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                  <FileText size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{t.name}</p>
                    {!t.is_active && <Badge variant="outline" className="text-[10px] h-4 px-1.5">inativo</Badge>}
                  </div>
                  {t.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{t.description}</p>}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{t.items.length} item{t.items.length !== 1 ? "s" : ""}</span>
                    {t.validity_days && <><span>·</span><span>Validade {t.validity_days} dias</span></>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Template" : "Novo Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {serverError && <Alert variant="destructive"><AlertDescription className="text-xs">{serverError}</AlertDescription></Alert>}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome interno *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Consultoria mensal" />
              </div>
              <div className="space-y-1.5">
                <Label>Título da proposta</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Proposta de consultoria…" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Descrição (uso interno)</Label>
              <Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label>Corpo da proposta</Label>
              <Textarea rows={3} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Texto que aparecerá como descrição da proposta criada…" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Validade (dias)</Label>
                <Input type="number" min={0} value={form.validity_days} onChange={e => setForm({ ...form, validity_days: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Desconto (R$)</Label>
                <Input type="number" min={0} step={0.01} value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} />
              </div>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Items</p>
                <Button size="sm" variant="outline" onClick={addItem} className="gap-1.5">
                  <Plus size={12} /> Item
                </Button>
              </div>
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_70px_50px_110px_32px] gap-2 items-end">
                  <Input
                    placeholder="Descrição"
                    value={it.description}
                    onChange={e => updateItem(idx, "description", e.target.value)}
                  />
                  <Input type="number" min={0} step={0.01} value={it.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} />
                  <Input placeholder="un" value={it.unit} onChange={e => updateItem(idx, "unit", e.target.value)} />
                  <Input type="number" min={0} step={0.01} value={it.unit_price} onChange={e => updateItem(idx, "unit_price", e.target.value)} />
                  <Button
                    size="icon" variant="ghost" className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => removeItem(idx)} disabled={items.length === 1}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground text-right">
                Subtotal: <span className="font-medium text-foreground">{fmtCurrency(itemsTotal)}</span> ·
                Total: <span className="font-bold text-emerald-600">{fmtCurrency(finalTotal)}</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Pagamento</Label>
              <Textarea rows={2} value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Entrega</Label>
              <Textarea rows={2} value={form.delivery_terms} onChange={e => setForm({ ...form, delivery_terms: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <Label>Ativo</Label>
              <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 size={13} className="animate-spin mr-1.5" />}
              {editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
