import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, CreditCard } from "lucide-react"
import {
  paymentMethodsApi,
  type PaymentMethod, type PaymentMethodCreate, type PaymentKind,
} from "@/api/pdv"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"
import { getApiError } from "./pdvUtils"

const KIND_LABEL: Record<PaymentKind, string> = {
  cash: "Dinheiro",
  card: "Cartão",
  pix: "PIX",
  transfer: "Transferência",
  other: "Outro",
}

const EMPTY: PaymentMethodCreate = {
  name: "", kind: "card", affects_cash_drawer: false,
  change_enabled: false, order: 0, is_active: true,
}

export default function PaymentMethodsConfigPage() {
  const [items, setItems] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PaymentMethod | null>(null)
  const [form, setForm] = useState<PaymentMethodCreate>(EMPTY)
  const [serverError, setServerError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    paymentMethodsApi.list(false).then(setItems).finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setServerError("")
    setOpen(true)
  }

  function openEdit(m: PaymentMethod) {
    setEditing(m)
    setForm({
      name: m.name, kind: m.kind,
      affects_cash_drawer: m.affects_cash_drawer,
      change_enabled: m.change_enabled,
      order: m.order, is_active: m.is_active,
    })
    setServerError("")
    setOpen(true)
  }

  function setKind(kind: PaymentKind) {
    // Troco e gaveta só fazem sentido para dinheiro.
    setForm(f => ({
      ...f, kind,
      change_enabled: kind === "cash" ? f.change_enabled : false,
      affects_cash_drawer: kind === "cash" ? f.affects_cash_drawer : false,
    }))
  }

  async function handleSave() {
    setServerError("")
    setSaving(true)
    try {
      if (editing) {
        const updated = await paymentMethodsApi.update(editing.id, form)
        setItems(prev => prev.map(x => x.id === updated.id ? updated : x))
      } else {
        const created = await paymentMethodsApi.create(form)
        setItems(prev => [...prev, created])
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(m: PaymentMethod) {
    if (!confirm(`Excluir a forma de pagamento "${m.name}"?`)) return
    setDeletingId(m.id)
    try {
      await paymentMethodsApi.remove(m.id)
      setItems(prev => prev.filter(x => x.id !== m.id))
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
          <h1 className="text-xl font-bold">Formas de pagamento</h1>
          <p className="text-sm text-muted-foreground">
            Configure como o caixa aceita pagamentos. Dinheiro calcula troco.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5"><Plus size={16} /> Nova forma</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhuma forma de pagamento"
          description="Cadastre ao menos uma forma para registrar vendas."
          action={{ label: "Nova forma", onClick: openCreate }}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(m => (
            <Card key={m.id} className={!m.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{m.name}</p>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{KIND_LABEL[m.kind]}</Badge>
                      {!m.is_active && <Badge variant="outline" className="text-[10px] h-4 px-1.5">inativo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.change_enabled ? "calcula troco · " : ""}
                      {m.affects_cash_drawer ? "conta na gaveta" : "não conta na gaveta"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(m)}>
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(m)}
                      disabled={deletingId === m.id}
                    >
                      {deletingId === m.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar forma" : "Nova forma de pagamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.kind} onValueChange={(v) => setKind(v as PaymentKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABEL) as PaymentKind[]).map(k => (
                      <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ordem</Label>
                <Input
                  type="number" min={0} value={form.order ?? 0}
                  onChange={e => setForm({ ...form, order: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm">Calcula troco</p>
                <p className="text-xs text-muted-foreground">Só para dinheiro.</p>
              </div>
              <Switch
                checked={form.change_enabled ?? false}
                disabled={form.kind !== "cash"}
                onCheckedChange={(v) => setForm({ ...form, change_enabled: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm">Conta na gaveta</p>
                <p className="text-xs text-muted-foreground">Soma ao caixa físico no fechamento.</p>
              </div>
              <Switch
                checked={form.affects_cash_drawer ?? false}
                disabled={form.kind !== "cash"}
                onCheckedChange={(v) => setForm({ ...form, affects_cash_drawer: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <p className="text-sm">Ativo</p>
              <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
            {serverError && <Alert variant="destructive"><AlertDescription className="text-xs">{serverError}</AlertDescription></Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
