import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FileText, Plus, Loader2, ArrowRight } from "lucide-react"
import { proposalsApi } from "@/api/propostasContratos"
import type { ProposalSummary, ProposalStatus } from "@/api/propostasContratos"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

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

interface Props {
  attendanceId?: string
  clientId?: string
  /** Pré-preenche o link "Nova proposta" com query params */
  newProposalParams?: Record<string, string>
  /** Dentro de um cartão maior (ex.: detalhe do atendimento) — cabeçalho mais discreto */
  embedded?: boolean
}

export default function ProposalsListPanel({ attendanceId, clientId, newProposalParams, embedded }: Props) {
  const navigate = useNavigate()
  const [proposals, setProposals] = useState<ProposalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    proposalsApi.list({
      attendance_id: attendanceId,
      client_id: clientId,
      limit: 50,
    })
      .then(setProposals)
      .catch(err => {
        // Módulo pode estar desativado pro tenant — 403
        if (err?.response?.status === 403) setEnabled(false)
      })
      .finally(() => setLoading(false))
  }, [attendanceId, clientId])

  function goToNew() {
    const params = new URLSearchParams(newProposalParams ?? {})
    navigate(`/app/modules/propostas_contratos/proposals/new?${params.toString()}`)
  }

  if (!enabled) {
    return (
      <div className="text-xs text-muted-foreground text-center py-3 italic">
        Módulo Propostas e Contratos não está ativo para esta empresa.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        {embedded ? (
          <span className="text-xs font-medium text-muted-foreground">
            Propostas {proposals.length > 0 && <span className="text-foreground/60">({proposals.length})</span>}
          </span>
        ) : (
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Propostas {proposals.length > 0 && <span className="text-foreground/60">({proposals.length})</span>}
          </p>
        )}
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2 gap-1 shrink-0" onClick={goToNew}>
          <Plus size={11} /> Nova
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 size={11} className="animate-spin" /> Carregando…
        </p>
      ) : proposals.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-md">
          Nenhuma proposta vinculada.
          <button onClick={goToNew} className="block w-full mt-1 text-primary hover:underline">
            Criar a primeira
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {proposals.map(p => (
            <button
              key={p.id}
              onClick={() => navigate(`/app/modules/propostas_contratos/proposals/${p.id}`)}
              className="w-full text-left flex items-center gap-2 p-2 rounded-md border hover:border-primary/50 hover:bg-accent/30 transition-colors group"
            >
              <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                <FileText size={12} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground">{p.number}</span>
                  {p.version > 1 && <span className="text-[10px] text-muted-foreground">v{p.version}</span>}
                </div>
                <p className="text-xs font-medium truncate">{p.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant={STATUS_COLORS[p.status]} className="text-[9px] h-3.5 px-1">
                    {STATUS_LABELS[p.status]}
                  </Badge>
                  <span className="text-[10px] font-semibold text-emerald-600">
                    {fmtCurrency(p.total_value)}
                  </span>
                </div>
              </div>
              <ArrowRight size={11} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
