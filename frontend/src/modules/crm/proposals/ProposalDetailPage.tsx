import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft, Loader2, FileText, Send, Check, X, Copy,
  Trash2, Pencil, Calendar, Plus, Printer, Link2, Eye, FileSignature,
} from "lucide-react"
import { proposalsApi, contractsApi } from "@/api/crm"
import { toast } from "@/lib/toast"
import { nullableStr } from "@/lib/utils"
import type { Proposal, ProposalStatus, ProposalStatusLog, ProposalItem } from "@/api/crm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  accepted: "Aceita",
  rejected: "Rejeitada",
  expired: "Expirada",
  cancelled: "Cancelada",
}

const STATUS_COLORS: Record<ProposalStatus, "secondary" | "success" | "destructive" | "outline"> = {
  draft: "outline",
  sent: "secondary",
  accepted: "success",
  rejected: "destructive",
  expired: "outline",
  cancelled: "outline",
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v))

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  return "Erro ao processar."
}

export default function ProposalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [logs, setLogs] = useState<ProposalStatusLog[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [error, setError] = useState("")

  const [statusDialog, setStatusDialog] = useState<{ target: ProposalStatus; label: string } | null>(null)
  const [statusNotes, setStatusNotes] = useState("")

  // Item edit/add state
  const [itemDialog, setItemDialog] = useState<{ mode: "create" } | { mode: "edit"; item: ProposalItem } | null>(null)
  const [itemForm, setItemForm] = useState({ description: "", quantity: "1", unit: "un", unit_price: "0" })
  const [itemSaving, setItemSaving] = useState(false)
  const [itemError, setItemError] = useState("")
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  // Edit proposal-level fields (discount, notes, terms, dates)
  const [editProposalOpen, setEditProposalOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    title: "", description: "", discount: "0",
    payment_terms: "", delivery_terms: "", notes: "", valid_until: "",
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState("")

  useEffect(() => {
    if (!id) return
    Promise.all([
      proposalsApi.get(id),
      proposalsApi.statusLogs(id).catch(() => [] as ProposalStatusLog[]),
    ]).then(([p, l]) => {
      setProposal(p); setLogs(l)
    }).finally(() => setLoading(false))
  }, [id])

  async function refresh() {
    if (!id) return
    const [p, l] = await Promise.all([
      proposalsApi.get(id),
      proposalsApi.statusLogs(id).catch(() => [] as ProposalStatusLog[]),
    ])
    setProposal(p); setLogs(l)
  }

  // ── Items ──────────────────────────────────────

  function openAddItem() {
    setItemForm({ description: "", quantity: "1", unit: "un", unit_price: "0" })
    setItemError("")
    setItemDialog({ mode: "create" })
  }

  function openEditItem(item: ProposalItem) {
    setItemForm({
      description: item.description,
      quantity: String(item.quantity),
      unit: item.unit ?? "",
      unit_price: String(item.unit_price),
    })
    setItemError("")
    setItemDialog({ mode: "edit", item })
  }

  async function saveItem() {
    if (!proposal || !itemDialog) return
    if (!itemForm.description.trim()) { setItemError("Descrição obrigatória."); return }
    const qty = Number(itemForm.quantity)
    if (!qty || qty <= 0) { setItemError("Quantidade inválida."); return }
    const price = Number(itemForm.unit_price)
    if (price < 0) { setItemError("Preço inválido."); return }

    setItemSaving(true)
    setItemError("")
    try {
      const payload = {
        description: itemForm.description.trim(),
        quantity: qty,
        unit: itemDialog.mode === "edit" ? nullableStr(itemForm.unit) : (itemForm.unit.trim() || undefined),
        unit_price: price,
      }
      if (itemDialog.mode === "create") {
        await proposalsApi.addItem(proposal.id, payload)
      } else {
        await proposalsApi.updateItem(proposal.id, itemDialog.item.id, payload)
      }
      await refresh()
      setItemDialog(null)
    } catch (err) {
      setItemError(getApiError(err))
    } finally {
      setItemSaving(false)
    }
  }

  async function deleteItem(item: ProposalItem) {
    if (!proposal) return
    if (!confirm(`Remover o item "${item.description}"?`)) return
    setDeletingItemId(item.id)
    try {
      await proposalsApi.removeItem(proposal.id, item.id)
      await refresh()
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setDeletingItemId(null)
    }
  }

  // ── Editar proposta (header) ───────────────────

  function openEditProposal() {
    if (!proposal) return
    setEditForm({
      title: proposal.title,
      description: proposal.description ?? "",
      discount: String(proposal.discount ?? 0),
      payment_terms: proposal.payment_terms ?? "",
      delivery_terms: proposal.delivery_terms ?? "",
      notes: proposal.notes ?? "",
      valid_until: proposal.valid_until ? proposal.valid_until.slice(0, 10) : "",
    })
    setEditError("")
    setEditProposalOpen(true)
  }

  async function saveProposal() {
    if (!proposal) return
    setEditSaving(true)
    setEditError("")
    try {
      const payload = {
        title: editForm.title.trim(),
        description: nullableStr(editForm.description),
        discount: Number(editForm.discount) || 0,
        payment_terms: nullableStr(editForm.payment_terms),
        delivery_terms: nullableStr(editForm.delivery_terms),
        notes: nullableStr(editForm.notes),
        valid_until: editForm.valid_until ? new Date(editForm.valid_until).toISOString() : null,
      }
      await proposalsApi.update(proposal.id, payload)
      await refresh()
      setEditProposalOpen(false)
    } catch (err) {
      setEditError(getApiError(err))
    } finally {
      setEditSaving(false)
    }
  }

  async function changeStatus(target: ProposalStatus, label: string) {
    setStatusDialog({ target, label })
    setStatusNotes("")
  }

  async function confirmChangeStatus() {
    if (!proposal || !statusDialog) return
    setActing(`status-${statusDialog.target}`)
    setError("")
    try {
      await proposalsApi.changeStatus(proposal.id, statusDialog.target, statusNotes || undefined)
      await refresh()
      setStatusDialog(null)
      toast.success(`Status alterado para "${statusDialog.label}".`)
    } catch (err) {
      const msg = getApiError(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setActing(null)
    }
  }

  async function handleGenerateContract() {
    if (!proposal) return
    if (!confirm("Gerar contrato a partir desta proposta aceita?")) return
    setActing("contract")
    try {
      const contract = await contractsApi.fromProposal({ proposal_id: proposal.id })
      toast.success("Contrato gerado com sucesso!")
      navigate(`/app/modules/crm/contracts/${contract.id}`)
    } catch (err) {
      const msg = getApiError(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setActing(null)
    }
  }

  async function handleGenerateLink() {
    if (!proposal) return
    setActing("public-link")
    try {
      const updated = await proposalsApi.generatePublicToken(proposal.id)
      setProposal(updated)
      const link = `${window.location.origin}/p/propostas/${updated.public_token}`
      try {
        await navigator.clipboard.writeText(link)
        toast.success("Link copiado para a área de transferência!")
      } catch {
        toast.info(`Link gerado: ${link}`)
      }
    } catch (err) {
      const msg = getApiError(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setActing(null)
    }
  }

  async function handleRevokeLink() {
    if (!proposal) return
    if (!confirm("Revogar o link público? O cliente não conseguirá mais acessar a proposta por ele.")) return
    setActing("public-link")
    try {
      const updated = await proposalsApi.revokePublicToken(proposal.id)
      setProposal(updated)
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setActing(null)
    }
  }

  async function handleCopyLink() {
    if (!proposal?.public_token) return
    const link = `${window.location.origin}/p/propostas/${proposal.public_token}`
    try {
      await navigator.clipboard.writeText(link)
      alert("Link copiado!")
    } catch {
      prompt("Copie este link:", link)
    }
  }

  async function handleNewVersion() {
    if (!proposal) return
    if (!confirm("Criar uma nova versão (rascunho) a partir desta proposta?")) return
    setActing("new-version")
    try {
      const created = await proposalsApi.newVersion(proposal.id)
      navigate(`/app/modules/crm/proposals/${created.id}`)
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setActing(null)
    }
  }

  async function handleDelete() {
    if (!proposal) return
    if (!confirm(`Excluir a proposta "${proposal.number}"?`)) return
    setActing("delete")
    try {
      await proposalsApi.remove(proposal.id)
      navigate("/app/modules/crm/proposals", { replace: true })
    } catch (err) {
      setError(getApiError(err))
      setActing(null)
    }
  }

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>
  }
  if (!proposal) {
    return <div className="text-center py-16 text-muted-foreground">Proposta não encontrada.</div>
  }

  const itemsTotal = proposal.items.reduce((s, i) => s + Number(i.total || 0), 0)
  const canEdit = proposal.status === "draft" || proposal.status === "sent"
  const canDelete = proposal.status === "draft" || proposal.status === "cancelled"

  // Botões de ação por status
  const actions: Array<{ label: string; target: ProposalStatus; variant?: "default" | "outline" | "destructive"; icon: typeof Send }> = []
  if (proposal.status === "draft") {
    actions.push({ label: "Enviar", target: "sent", icon: Send })
    actions.push({ label: "Cancelar", target: "cancelled", icon: X, variant: "outline" })
  } else if (proposal.status === "sent") {
    actions.push({ label: "Marcar como aceita", target: "accepted", icon: Check })
    actions.push({ label: "Rejeitar", target: "rejected", icon: X, variant: "destructive" })
    actions.push({ label: "Voltar pra rascunho", target: "draft", icon: Pencil, variant: "outline" })
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/app/modules/crm/proposals")}>
          <ArrowLeft size={15} />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">{proposal.number}</span>
            {proposal.version > 1 && <Badge variant="outline" className="text-[10px] h-4 px-1.5">v{proposal.version}</Badge>}
            <Badge variant={STATUS_COLORS[proposal.status]} className="text-xs">
              {STATUS_LABELS[proposal.status]}
            </Badge>
          </div>
          <h2 className="text-lg font-bold leading-tight">{proposal.title}</h2>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button
            size="sm" variant="outline"
            onClick={() => navigate(`/app/modules/crm/proposals/${proposal.id}/print`)}
            className="gap-1.5"
          >
            <Printer size={13} /> PDF
          </Button>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={openEditProposal} className="gap-1.5">
              <Pencil size={13} /> Editar
            </Button>
          )}
          {actions.map(a => (
            <Button
              key={a.target}
              size="sm"
              variant={a.variant ?? "default"}
              onClick={() => changeStatus(a.target, a.label)}
              disabled={!!acting}
              className="gap-1.5"
            >
              <a.icon size={13} /> {a.label}
            </Button>
          ))}
          {proposal.status === "accepted" && (
            <Button size="sm" onClick={handleGenerateContract} disabled={!!acting} className="gap-1.5">
              {acting === "contract" ? <Loader2 size={13} className="animate-spin" /> : <FileSignature size={13} />}
              Gerar Contrato
            </Button>
          )}
          {(proposal.status === "accepted" || proposal.status === "rejected" || proposal.status === "expired") && (
            <Button size="sm" variant="outline" onClick={handleNewVersion} disabled={!!acting} className="gap-1.5">
              <Copy size={13} /> Nova versão
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={!!acting}
            >
              {acting === "delete" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </Button>
          )}
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        <div className="space-y-4">
          {proposal.description && (
            <Card>
              <CardContent className="p-4 text-sm whitespace-pre-wrap">{proposal.description}</CardContent>
            </Card>
          )}

          {/* Itens */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Itens</p>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={openAddItem} className="gap-1.5">
                    <Plus size={13} /> Adicionar item
                  </Button>
                )}
              </div>
              {proposal.items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">Nenhum item. {canEdit && "Clique em \"Adicionar item\" pra começar."}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-b">
                      <tr>
                        <th className="text-left pb-2">Descrição</th>
                        <th className="text-right pb-2 w-16">Qtd.</th>
                        <th className="text-right pb-2 w-14">Unid.</th>
                        <th className="text-right pb-2 w-28">Preço un.</th>
                        <th className="text-right pb-2 w-28">Total</th>
                        {canEdit && <th className="w-16 pb-2"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {proposal.items.map(it => (
                        <tr key={it.id} className="border-b last:border-0 group">
                          <td className="py-2 pr-2">{it.description}</td>
                          <td className="text-right py-2 tabular-nums">{Number(it.quantity)}</td>
                          <td className="text-right py-2 text-muted-foreground">{it.unit ?? "—"}</td>
                          <td className="text-right py-2 tabular-nums">{fmtCurrency(it.unit_price)}</td>
                          <td className="text-right py-2 font-medium tabular-nums">{fmtCurrency(it.total)}</td>
                          {canEdit && (
                            <td className="py-2 pl-2">
                              <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  size="icon" variant="ghost" className="h-6 w-6"
                                  onClick={() => openEditItem(it)}
                                >
                                  <Pencil size={11} />
                                </Button>
                                <Button
                                  size="icon" variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => deleteItem(it)}
                                  disabled={deletingItemId === it.id}
                                >
                                  {deletingItemId === it.id
                                    ? <Loader2 size={11} className="animate-spin" />
                                    : <Trash2 size={11} />}
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="border-t pt-3 flex justify-end gap-6 text-sm">
                <div className="text-right space-y-0.5">
                  <p className="text-xs text-muted-foreground">Subtotal: <span className="font-medium text-foreground">{fmtCurrency(itemsTotal)}</span></p>
                  <p className="text-xs text-muted-foreground">Desconto: <span className="font-medium text-foreground">−{fmtCurrency(proposal.discount)}</span></p>
                  <p className="text-base font-bold text-emerald-600">Total: {fmtCurrency(proposal.total_value)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {(proposal.payment_terms || proposal.delivery_terms || proposal.notes) && (
            <Card>
              <CardContent className="p-4 space-y-3 text-sm">
                {proposal.payment_terms && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Pagamento</p>
                    <p className="whitespace-pre-wrap">{proposal.payment_terms}</p>
                  </div>
                )}
                {proposal.delivery_terms && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Entrega</p>
                    <p className="whitespace-pre-wrap">{proposal.delivery_terms}</p>
                  </div>
                )}
                {proposal.notes && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Observações</p>
                    <p className="whitespace-pre-wrap">{proposal.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <Card>
            <CardContent className="p-3 space-y-2 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</p>
              <p className="font-medium">{proposal.client_name ?? "—"}</p>
              {proposal.client_email && <p className="text-xs text-muted-foreground">{proposal.client_email}</p>}
              {proposal.client_phone && <p className="text-xs text-muted-foreground">{proposal.client_phone}</p>}
              {proposal.client_document && <p className="text-xs text-muted-foreground font-mono">{proposal.client_document}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-2 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datas</p>
              <div className="flex items-center gap-1.5 text-xs">
                <Calendar size={11} className="text-muted-foreground" />
                <span>Criada em {new Date(proposal.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
              {proposal.sent_at && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Send size={11} className="text-muted-foreground" />
                  <span>Enviada em {new Date(proposal.sent_at).toLocaleDateString("pt-BR")}</span>
                </div>
              )}
              {proposal.valid_until && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Calendar size={11} className="text-muted-foreground" />
                  <span>Válida até {new Date(proposal.valid_until).toLocaleDateString("pt-BR")}</span>
                </div>
              )}
              {proposal.accepted_at && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <Check size={11} />
                  <span>Aceita em {new Date(proposal.accepted_at).toLocaleDateString("pt-BR")}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Link público */}
          <Card>
            <CardContent className="p-3 space-y-2 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Link de aceite</p>
              {proposal.public_token ? (
                <>
                  <p className="text-xs text-muted-foreground break-all bg-muted/50 p-2 rounded font-mono">
                    {`${window.location.origin}/p/propostas/${proposal.public_token}`}
                  </p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs flex-1 gap-1" onClick={handleCopyLink}>
                      <Copy size={11} /> Copiar
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs flex-1 gap-1"
                      onClick={() => window.open(`/p/propostas/${proposal.public_token}`, "_blank")}
                    >
                      <Eye size={11} /> Abrir
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive p-0"
                      onClick={handleRevokeLink} disabled={acting === "public-link"}
                    >
                      {acting === "public-link" ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    </Button>
                  </div>
                </>
              ) : (
                proposal.status !== "accepted" && proposal.status !== "cancelled" && (
                  <Button
                    size="sm" variant="outline" className="w-full h-7 text-xs gap-1"
                    onClick={handleGenerateLink} disabled={acting === "public-link"}
                  >
                    {acting === "public-link" ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
                    Gerar link público
                  </Button>
                )
              )}
              {proposal.public_acceptance ? (
                <div className="text-[10px] text-muted-foreground pt-2 border-t">
                  <p>Aceito por <strong>{String(proposal.public_acceptance.name ?? "—")}</strong></p>
                  {!!proposal.public_acceptance.ip && <p>IP: {String(proposal.public_acceptance.ip)}</p>}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Histórico */}
          <Card>
            <CardContent className="p-3 space-y-2 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Histórico</p>
              {logs.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem alterações.</p>
              ) : (
                <div className="space-y-2">
                  {logs.map(l => (
                    <div key={l.id} className="flex items-start gap-2 text-xs">
                      <FileText size={11} className="text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p>
                          {l.from_status ? `${STATUS_LABELS[l.from_status]} → ` : ""}
                          <strong>{STATUS_LABELS[l.to_status]}</strong>
                        </p>
                        {l.notes && <p className="text-muted-foreground italic line-clamp-2">{l.notes}</p>}
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(l.changed_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Dialog item — adicionar/editar */}
      <Dialog open={!!itemDialog} onOpenChange={v => { if (!v) setItemDialog(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{itemDialog?.mode === "edit" ? "Editar Item" : "Novo Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {itemError && <Alert variant="destructive"><AlertDescription className="text-xs">{itemError}</AlertDescription></Alert>}
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Textarea
                rows={2}
                placeholder="Item ou serviço"
                value={itemForm.description}
                onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={itemForm.quantity}
                  onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Input
                  placeholder="un"
                  value={itemForm.unit}
                  onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Preço un. (R$)</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={itemForm.unit_price}
                  onChange={e => setItemForm({ ...itemForm, unit_price: e.target.value })}
                />
              </div>
            </div>
            <div className="rounded-md border p-2.5 flex items-center justify-between text-sm">
              <span className="text-muted-foreground text-xs">Total do item</span>
              <span className="font-semibold tabular-nums">
                {fmtCurrency((Number(itemForm.quantity) || 0) * (Number(itemForm.unit_price) || 0))}
              </span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setItemDialog(null)}>Cancelar</Button>
            <Button onClick={saveItem} disabled={itemSaving}>
              {itemSaving && <Loader2 size={13} className="animate-spin mr-1.5" />}
              {itemDialog?.mode === "edit" ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog editar proposta */}
      <Dialog open={editProposalOpen} onOpenChange={setEditProposalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Proposta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editError && <Alert variant="destructive"><AlertDescription className="text-xs">{editError}</AlertDescription></Alert>}
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input
                value={editForm.title}
                onChange={e => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={editForm.description}
                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Validade</Label>
                <Input
                  type="date"
                  value={editForm.valid_until}
                  onChange={e => setEditForm({ ...editForm, valid_until: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Desconto (R$)</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={editForm.discount}
                  onChange={e => setEditForm({ ...editForm, discount: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Condições de pagamento</Label>
              <Textarea
                rows={2}
                value={editForm.payment_terms}
                onChange={e => setEditForm({ ...editForm, payment_terms: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Condições de entrega</Label>
              <Textarea
                rows={2}
                value={editForm.delivery_terms}
                onChange={e => setEditForm({ ...editForm, delivery_terms: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                rows={2}
                value={editForm.notes}
                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditProposalOpen(false)}>Cancelar</Button>
            <Button onClick={saveProposal} disabled={editSaving}>
              {editSaving && <Loader2 size={13} className="animate-spin mr-1.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog mudança de status */}
      <Dialog open={!!statusDialog} onOpenChange={v => { if (!v) setStatusDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar status: {statusDialog?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Adicionar uma nota sobre essa mudança (opcional).
            </p>
            <Textarea
              rows={3}
              placeholder="Ex: Cliente confirmou por e-mail em 10/05"
              value={statusNotes}
              onChange={e => setStatusNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(null)}>Cancelar</Button>
            <Button onClick={confirmChangeStatus} disabled={!!acting}>
              {acting?.startsWith("status-") && <Loader2 size={13} className="animate-spin mr-1.5" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
