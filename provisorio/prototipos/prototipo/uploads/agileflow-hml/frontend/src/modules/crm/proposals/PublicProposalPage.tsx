import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { Check, X, Loader2, FileText, ShieldCheck } from "lucide-react"
import { publicProposalsApi } from "@/api/publicPropostas"
import type { PublicProposalView, PublicAcceptance } from "@/api/publicPropostas"

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  accepted: "Aceita",
  rejected: "Rejeitada",
  expired: "Expirada",
  cancelled: "Cancelada",
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v))

export default function PublicProposalPage() {
  const { token } = useParams<{ token: string }>()
  const [proposal, setProposal] = useState<PublicProposalView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [dialog, setDialog] = useState<"accept" | "reject" | null>(null)
  const [form, setForm] = useState<PublicAcceptance>({ accepter_name: "", accepter_email: "", accepter_document: "", notes: "" })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    publicProposalsApi.view(token)
      .then(setProposal)
      .catch(err => {
        const detail = err?.response?.data?.detail
        setError(typeof detail === "string" ? detail : "Não foi possível carregar a proposta.")
      })
      .finally(() => setLoading(false))
  }, [token])

  async function submitAction(action: "accept" | "reject") {
    if (!token) return
    if (!form.accepter_name.trim()) { return alert("Por favor informe seu nome.") }
    setSubmitting(true)
    try {
      const fn = action === "accept" ? publicProposalsApi.accept : publicProposalsApi.reject
      const data = { ...form, accepter_email: form.accepter_email || undefined }
      const r = await fn(token, data)
      setSuccess(r.message)
      setDialog(null)
      // Recarrega
      const p = await publicProposalsApi.view(token)
      setProposal(p)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      alert(e?.response?.data?.detail ?? "Erro ao processar.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
          <ShieldCheck size={36} className="text-slate-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-1">Link inválido</h1>
          <p className="text-sm text-slate-600">{error || "Esta proposta não está disponível ou o link expirou."}</p>
        </div>
      </div>
    )
  }

  const isFinal = proposal.status !== "sent"
  const itemsSubtotal = proposal.items.reduce((s, i) => s + i.total, 0)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <FileText size={20} className="text-violet-600" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500">Proposta de</p>
            <p className="font-semibold truncate">{proposal.tenant_name}</p>
          </div>
          <div className={`text-xs px-2 py-0.5 rounded-full ${
            proposal.status === "accepted" ? "bg-emerald-100 text-emerald-700" :
            proposal.status === "rejected" ? "bg-red-100 text-red-700" :
            proposal.status === "sent" ? "bg-blue-100 text-blue-700" :
            "bg-slate-100 text-slate-600"
          }`}>
            {STATUS_LABELS[proposal.status] ?? proposal.status}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {success && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-2">
            <Check size={16} /> {success}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs font-mono text-slate-500">{proposal.number}{proposal.version > 1 ? ` · v${proposal.version}` : ""}</p>
                <h1 className="text-2xl font-bold mt-1">{proposal.title}</h1>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>Emitida em {new Date(proposal.created_at).toLocaleDateString("pt-BR")}</p>
                {proposal.valid_until && (
                  <p className="mt-1">Válida até <span className="font-semibold text-slate-700">{new Date(proposal.valid_until).toLocaleDateString("pt-BR")}</span></p>
                )}
              </div>
            </div>
            {proposal.description && (
              <p className="text-sm text-slate-600 mt-4 whitespace-pre-wrap">{proposal.description}</p>
            )}
          </div>

          {proposal.client_name && (
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Para</p>
              <p className="font-medium">{proposal.client_name}</p>
              {proposal.client_document && <p className="text-xs text-slate-600 font-mono">{proposal.client_document}</p>}
            </div>
          )}

          <div className="p-6">
            <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">Itens</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th className="text-left pb-2 font-medium">Descrição</th>
                  <th className="text-right pb-2 font-medium w-16">Qtd.</th>
                  <th className="text-right pb-2 font-medium w-16">Unid.</th>
                  <th className="text-right pb-2 font-medium w-28">Preço un.</th>
                  <th className="text-right pb-2 font-medium w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                {proposal.items.map((it, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-2">{it.description}</td>
                    <td className="text-right py-2 tabular-nums">{it.quantity}</td>
                    <td className="text-right py-2 text-slate-500">{it.unit ?? "—"}</td>
                    <td className="text-right py-2 tabular-nums">{fmtCurrency(it.unit_price)}</td>
                    <td className="text-right py-2 font-medium tabular-nums">{fmtCurrency(it.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <div className="w-64 text-sm space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span><span className="tabular-nums">{fmtCurrency(itemsSubtotal)}</span>
                </div>
                {proposal.discount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Desconto</span><span className="tabular-nums">−{fmtCurrency(proposal.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t border-slate-300 pt-2 mt-2">
                  <span>Total</span><span className="tabular-nums">{fmtCurrency(proposal.total_value)}</span>
                </div>
              </div>
            </div>
          </div>

          {(proposal.payment_terms || proposal.delivery_terms || proposal.notes) && (
            <div className="px-6 py-5 border-t border-slate-200 bg-slate-50 space-y-4 text-sm">
              {proposal.payment_terms && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Pagamento</p>
                  <p className="whitespace-pre-wrap">{proposal.payment_terms}</p>
                </div>
              )}
              {proposal.delivery_terms && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Entrega</p>
                  <p className="whitespace-pre-wrap">{proposal.delivery_terms}</p>
                </div>
              )}
              {proposal.notes && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Observações</p>
                  <p className="whitespace-pre-wrap">{proposal.notes}</p>
                </div>
              )}
            </div>
          )}

          {!isFinal && !success && (
            <div className="px-6 py-5 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => setDialog("reject")}
                className="px-4 py-2 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50"
              >
                <X size={14} className="inline -mt-0.5 mr-1" /> Rejeitar
              </button>
              <button
                onClick={() => setDialog("accept")}
                className="px-5 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                <Check size={14} className="inline -mt-0.5 mr-1" /> Aceitar Proposta
              </button>
            </div>
          )}

          {isFinal && (
            <div className="px-6 py-5 border-t border-slate-200 bg-slate-50 text-center text-sm text-slate-600">
              Esta proposta está em status <strong>{STATUS_LABELS[proposal.status]}</strong>{
                proposal.accepted_at ? ` desde ${new Date(proposal.accepted_at).toLocaleDateString("pt-BR")}` :
                proposal.rejected_at ? ` desde ${new Date(proposal.rejected_at).toLocaleDateString("pt-BR")}` : ""
              }.
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 text-center mt-6">
          Esta página é segura. Sua identificação e IP são registrados para fins de auditoria.
        </p>
      </main>

      {/* Dialog de aceite/rejeição */}
      {dialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              {dialog === "accept" ? "Confirmar aceite" : "Rejeitar proposta"}
            </h2>
            <p className="text-sm text-slate-600">
              {dialog === "accept"
                ? "Confirme seus dados pra finalizar o aceite. Este registro fica como comprovante de aceitação."
                : "Conte rapidamente o motivo da rejeição (opcional). Seus dados ficam registrados."}
            </p>

            <div className="space-y-2">
              <label className="block">
                <span className="text-xs font-medium">Seu nome *</span>
                <input
                  value={form.accepter_name}
                  onChange={e => setForm({ ...form, accepter_name: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium">E-mail</span>
                <input
                  type="email"
                  value={form.accepter_email}
                  onChange={e => setForm({ ...form, accepter_email: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium">CPF/CNPJ</span>
                <input
                  value={form.accepter_document}
                  onChange={e => setForm({ ...form, accepter_document: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium">{dialog === "accept" ? "Mensagem (opcional)" : "Motivo da rejeição (opcional)"}</span>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm"
                />
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDialog(null)}
                disabled={submitting}
                className="px-4 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => submitAction(dialog)}
                disabled={submitting || !form.accepter_name.trim()}
                className={`px-4 py-2 text-sm rounded-md text-white ${
                  dialog === "accept" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                } disabled:opacity-50`}
              >
                {submitting ? <Loader2 size={14} className="inline animate-spin mr-1" /> : null}
                {dialog === "accept" ? "Aceitar" : "Rejeitar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
