/**
 * View imprimível de uma proposta — usa window.print() do browser.
 * O <style> embutido controla o que aparece no PDF (oculta sidebar, etc).
 */
import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import type { Proposal } from "@/api/crm"
import { proposalsApi } from "@/api/crm"
import { Skeleton } from "@/components/ui/skeleton"

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

export default function ProposalPrintView() {
  const { id } = useParams<{ id: string }>()
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    proposalsApi.get(id).then(setProposal).finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="p-8 max-w-3xl mx-auto"><Skeleton className="h-64" /></div>
  }
  if (!proposal) return <div className="p-8 text-center">Proposta não encontrada.</div>

  return (
    <div className="bg-white min-h-screen">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
        }
        .print-page { font-family: ui-sans-serif, system-ui, sans-serif; }
      `}</style>

      {/* Toolbar (não imprime) */}
      <div className="no-print sticky top-0 z-10 bg-white border-b flex items-center justify-between px-6 py-3">
        <a href={`/app/modules/crm/proposals/${proposal.id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar
        </a>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      <div className="print-page max-w-3xl mx-auto p-10 text-gray-900">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">PROPOSTA COMERCIAL</h1>
            <p className="text-sm text-gray-600 mt-1">
              {proposal.number}{proposal.version > 1 ? ` · v${proposal.version}` : ""}
            </p>
          </div>
          <div className="text-right text-xs text-gray-600">
            <p>Emitida em</p>
            <p className="font-medium">{new Date(proposal.created_at).toLocaleDateString("pt-BR")}</p>
            {proposal.valid_until && (
              <>
                <p className="mt-2">Válida até</p>
                <p className="font-medium">{new Date(proposal.valid_until).toLocaleDateString("pt-BR")}</p>
              </>
            )}
            <div className="mt-2 inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] uppercase tracking-wider">
              {STATUS_LABELS[proposal.status]}
            </div>
          </div>
        </div>

        {/* Cliente */}
        <section className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Cliente</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold">{proposal.client_name ?? "—"}</p>
              {proposal.client_document && <p className="text-gray-600 font-mono">{proposal.client_document}</p>}
            </div>
            <div className="text-right text-gray-600">
              {proposal.client_email && <p>{proposal.client_email}</p>}
              {proposal.client_phone && <p>{proposal.client_phone}</p>}
            </div>
          </div>
        </section>

        {/* Título e descrição */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">{proposal.title}</h2>
          {proposal.description && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{proposal.description}</p>
          )}
        </section>

        {/* Itens */}
        <section className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Itens</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2 font-medium">Descrição</th>
                <th className="text-right py-2 font-medium w-16">Qtd.</th>
                <th className="text-right py-2 font-medium w-16">Unid.</th>
                <th className="text-right py-2 font-medium w-28">Preço un.</th>
                <th className="text-right py-2 font-medium w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {proposal.items.map(it => (
                <tr key={it.id} className="border-b border-gray-200">
                  <td className="py-2 pr-2">{it.description}</td>
                  <td className="text-right py-2 tabular-nums">{Number(it.quantity)}</td>
                  <td className="text-right py-2 text-gray-600">{it.unit ?? "—"}</td>
                  <td className="text-right py-2 tabular-nums">{fmtCurrency(it.unit_price)}</td>
                  <td className="text-right py-2 font-medium tabular-nums">{fmtCurrency(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totais */}
          <div className="mt-4 flex justify-end">
            <div className="w-72 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="tabular-nums">{fmtCurrency(proposal.items.reduce((s, i) => s + Number(i.total || 0), 0))}</span>
              </div>
              {Number(proposal.discount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Desconto</span>
                  <span className="tabular-nums">−{fmtCurrency(proposal.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t-2 border-gray-900 pt-2 mt-2">
                <span>TOTAL</span>
                <span className="tabular-nums">{fmtCurrency(proposal.total_value)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Condições */}
        {(proposal.payment_terms || proposal.delivery_terms || proposal.notes) && (
          <section className="border-t border-gray-300 pt-4 mt-4 text-sm space-y-3">
            {proposal.payment_terms && (
              <div>
                <h3 className="font-semibold mb-1">Condições de pagamento</h3>
                <p className="whitespace-pre-wrap text-gray-700">{proposal.payment_terms}</p>
              </div>
            )}
            {proposal.delivery_terms && (
              <div>
                <h3 className="font-semibold mb-1">Condições de entrega</h3>
                <p className="whitespace-pre-wrap text-gray-700">{proposal.delivery_terms}</p>
              </div>
            )}
            {proposal.notes && (
              <div>
                <h3 className="font-semibold mb-1">Observações</h3>
                <p className="whitespace-pre-wrap text-gray-700">{proposal.notes}</p>
              </div>
            )}
          </section>
        )}

        {/* Rodapé */}
        <footer className="mt-12 pt-4 border-t border-gray-300 text-xs text-gray-500 text-center">
          Proposta {proposal.number} · gerada em {new Date().toLocaleString("pt-BR")}
        </footer>
      </div>
    </div>
  )
}
