import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, Plus, Loader2, Trash2, FileText, Layers } from "lucide-react"
import { toast } from "@/lib/toast"
import { proposalsApi, proposalTemplatesApi } from "@/api/propostasContratos"
import type { ProposalItemCreate, ProposalTemplate } from "@/api/propostasContratos"
import { clientsApi, companiesApi, attendancesApi } from "@/api/atendimento"
import type { ClientSummary, CompanySummary, AttendanceSummary } from "@/api/atendimento"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const NO_VAL = "__none__"

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v))

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
  return "Erro ao criar proposta."
}

export default function NewProposalPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectAttendance = searchParams.get("attendance_id")
  const preselectClient = searchParams.get("client_id")

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [validUntil, setValidUntil] = useState("")
  const [discount, setDiscount] = useState("0")
  const [paymentTerms, setPaymentTerms] = useState("")
  const [deliveryTerms, setDeliveryTerms] = useState("")
  const [notes, setNotes] = useState("")

  const [attendanceId, setAttendanceId] = useState<string>(preselectAttendance ?? NO_VAL)
  const [clientId, setClientId] = useState<string>(preselectClient ?? NO_VAL)
  const [companyId, setCompanyId] = useState<string>(NO_VAL)

  const [items, setItems] = useState<DraftItem[]>([emptyItem()])
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [attendances, setAttendances] = useState<AttendanceSummary[]>([])
  const [templates, setTemplates] = useState<ProposalTemplate[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    clientsApi.list({ limit: 200, active_only: false }).then(setClients).catch(() => {})
    companiesApi.list({ limit: 200, active_only: true }).then(setCompanies).catch(() => {})
    attendancesApi.list({ limit: 200 }).then(setAttendances).catch(() => {})
    proposalTemplatesApi.list(true).then(setTemplates).catch(() => {})
  }, [])

  function applyTemplate(tplId: string) {
    const tpl = templates.find(t => t.id === tplId)
    if (!tpl) return
    if (!confirm(`Aplicar template "${tpl.name}"? Os campos atuais serão sobrescritos.`)) return
    setTitle(tpl.title ?? tpl.name)
    setDescription(tpl.body ?? "")
    setPaymentTerms(tpl.payment_terms ?? "")
    setDeliveryTerms(tpl.delivery_terms ?? "")
    setNotes(tpl.notes ?? "")
    setDiscount(String(tpl.discount ?? 0))
    if (tpl.validity_days) {
      const d = new Date()
      d.setDate(d.getDate() + tpl.validity_days)
      setValidUntil(d.toISOString().slice(0, 10))
    }
    setItems(tpl.items.length > 0
      ? tpl.items.map(i => ({
          description: i.description,
          quantity: String(i.quantity),
          unit: i.unit ?? "",
          unit_price: String(i.unit_price),
        }))
      : [emptyItem()]
    )
  }

  // Quando muda atendimento, pré-preenche cliente + empresa
  useEffect(() => {
    if (attendanceId === NO_VAL) return
    const a = attendances.find(x => x.id === attendanceId)
    if (!a) return
    setClientId(a.client_id ?? NO_VAL)
    if (a.company_id) setCompanyId(a.company_id)
  }, [attendanceId, attendances])

  // Quando muda cliente, pré-preenche empresa do cliente
  useEffect(() => {
    if (clientId === NO_VAL) return
    const c = clients.find(x => x.id === clientId)
    if (!c) return
    if (c.company_id) setCompanyId(c.company_id)
  }, [clientId, clients])

  const selectedClient = clients.find(c => c.id === clientId)

  function addItem() {
    setItems([...items, emptyItem()])
  }
  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i))
  }
  function updateItem(i: number, field: keyof DraftItem, value: string) {
    setItems(items.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  const itemsTotal = items.reduce(
    (sum, it) => sum + (Number(it.quantity || 0) * Number(it.unit_price || 0)), 0
  )
  const finalTotal = Math.max(itemsTotal - Number(discount || 0), 0)

  async function handleSave() {
    setError("")
    if (!title.trim()) { setError("Título é obrigatório."); return }
    const validItems = items.filter(i => i.description.trim() && Number(i.quantity) > 0)
    if (validItems.length === 0) { setError("Adicione pelo menos um item."); return }

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      attendance_id: attendanceId === NO_VAL ? undefined : attendanceId,
      client_id: clientId === NO_VAL ? undefined : clientId,
      company_id: companyId === NO_VAL ? undefined : companyId,
      client_name: selectedClient?.name,
      client_email: selectedClient?.email ?? undefined,
      client_phone: selectedClient?.phone ?? undefined,
      discount: Number(discount) || 0,
      payment_terms: paymentTerms || undefined,
      delivery_terms: deliveryTerms || undefined,
      notes: notes || undefined,
      valid_until: validUntil ? new Date(validUntil).toISOString() : undefined,
      items: validItems.map<ProposalItemCreate>((i, idx) => ({
        description: i.description.trim(),
        quantity: Number(i.quantity),
        unit: i.unit || undefined,
        unit_price: Number(i.unit_price),
        order: idx,
      })),
    }

    setSaving(true)
    try {
      const created = await proposalsApi.create(payload)
      toast.success(`Proposta ${created.number} criada com sucesso!`)
      navigate(`/app/modules/propostas_contratos/proposals/${created.id}`, { replace: true })
    } catch (err) {
      const msg = getApiError(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Nova Proposta</h2>
          <p className="text-sm text-muted-foreground">Preencha os dados e os itens da proposta comercial.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving && <Loader2 size={13} className="animate-spin" />}
          <FileText size={13} /> Criar Proposta
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {templates.length > 0 && (
        <Card className="bg-violet-50/50 border-violet-200">
          <CardContent className="p-3 flex items-center gap-3">
            <Layers size={16} className="text-violet-700 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Aplicar template</p>
              <p className="text-xs text-muted-foreground">Preenche os campos abaixo a partir de um modelo pré-cadastrado.</p>
            </div>
            <Select onValueChange={applyTemplate}>
              <SelectTrigger className="w-56 h-9">
                <SelectValue placeholder="Escolha um template…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input placeholder="Ex: Proposta de consultoria comercial" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea rows={2} placeholder="Resumo da proposta…" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Atendimento</Label>
              <Select value={attendanceId} onValueChange={setAttendanceId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VAL}>Sem atendimento</SelectItem>
                  {attendances.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.protocol} — {a.subject.slice(0, 40)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VAL}>Sem cliente vinculado</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VAL}>Sem empresa</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Validade</Label>
              <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Desconto (R$)</Label>
              <Input type="number" min={0} step={0.01} value={discount} onChange={e => setDiscount(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Itens da proposta</p>
            <Button size="sm" variant="outline" onClick={addItem} className="gap-1.5">
              <Plus size={13} /> Adicionar item
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => {
              const lineTotal = Number(it.quantity || 0) * Number(it.unit_price || 0)
              return (
                <div key={idx} className="grid grid-cols-[1fr_80px_60px_120px_120px_32px] gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Descrição</Label>
                    <Input
                      placeholder="Item ou serviço"
                      value={it.description}
                      onChange={e => updateItem(idx, "description", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Qtd.</Label>
                    <Input
                      type="number" min={0} step={0.01}
                      value={it.quantity}
                      onChange={e => updateItem(idx, "quantity", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unid.</Label>
                    <Input
                      placeholder="un"
                      value={it.unit}
                      onChange={e => updateItem(idx, "unit", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Preço un.</Label>
                    <Input
                      type="number" min={0} step={0.01}
                      value={it.unit_price}
                      onChange={e => updateItem(idx, "unit_price", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Total</Label>
                    <div className="h-9 px-3 flex items-center text-sm font-medium border rounded-md bg-muted/50">
                      {fmtCurrency(lineTotal)}
                    </div>
                  </div>
                  <Button
                    size="icon" variant="ghost"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              )
            })}
          </div>

          <div className="border-t pt-3 flex justify-end gap-6 text-sm">
            <div className="text-right space-y-0.5">
              <p className="text-xs text-muted-foreground">Subtotal: <span className="font-medium text-foreground">{fmtCurrency(itemsTotal)}</span></p>
              <p className="text-xs text-muted-foreground">Desconto: <span className="font-medium text-foreground">−{fmtCurrency(Number(discount) || 0)}</span></p>
              <p className="text-base font-bold text-emerald-600">Total: {fmtCurrency(finalTotal)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label>Condições de pagamento</Label>
            <Textarea rows={2} placeholder="Ex: 50% à vista + 50% em 30 dias" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Condições de entrega</Label>
            <Textarea rows={2} placeholder="Prazo, local, etc." value={deliveryTerms} onChange={e => setDeliveryTerms(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
