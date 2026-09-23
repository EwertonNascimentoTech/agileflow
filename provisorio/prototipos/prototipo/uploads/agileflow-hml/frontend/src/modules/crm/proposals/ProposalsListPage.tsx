import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FileText, Plus, Search, Layers, FileSignature } from "lucide-react"
import { proposalsApi } from "@/api/crm"
import type { ProposalSummary, ProposalStatus } from "@/api/crm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/EmptyState"

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

const ALL_STATUSES: ProposalStatus[] = ["draft", "sent", "accepted", "rejected", "expired", "cancelled"]

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v))

export default function ProposalsListPage() {
  const navigate = useNavigate()
  const [proposals, setProposals] = useState<ProposalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "all">("all")

  useEffect(() => {
    proposalsApi.list({ limit: 200 })
      .then(setProposals)
      .finally(() => setLoading(false))
  }, [])

  const filtered = proposals.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.title.toLowerCase().includes(q) ||
      p.number.toLowerCase().includes(q) ||
      (p.client_name ?? "").toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Propostas</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "Carregando…" : `${proposals.length} proposta${proposals.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/app/modules/crm/contracts")} className="gap-1.5">
            <FileSignature size={14} /> Contratos
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/app/modules/crm/templates")} className="gap-1.5">
            <Layers size={14} /> Templates
          </Button>
          <Button size="sm" onClick={() => navigate("/app/modules/crm/proposals/new")} className="gap-1.5">
            <Plus size={14} /> Nova Proposta
          </Button>
        </div>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, número ou cliente…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as ProposalStatus | "all")}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {ALL_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={search || statusFilter !== "all" ? "Nenhuma proposta encontrada" : "Nenhuma proposta criada"}
          description={search || statusFilter !== "all" ? "Tente ajustar os filtros." : "Crie a primeira proposta comercial."}
          action={!search && statusFilter === "all" ? { label: "Nova Proposta", onClick: () => navigate("/app/modules/crm/proposals/new") } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <Card
              key={p.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/app/modules/crm/proposals/${p.id}`)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                  <FileText size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">{p.number}</span>
                    {p.version > 1 && <Badge variant="outline" className="text-[10px] h-4 px-1.5">v{p.version}</Badge>}
                    <p className="font-semibold text-sm truncate">{p.title}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {p.client_name && <span className="truncate">{p.client_name}</span>}
                    {p.valid_until && (
                      <>
                        <span>·</span>
                        <span>Válida até {new Date(p.valid_until).toLocaleDateString("pt-BR")}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-emerald-600">{fmtCurrency(p.total_value)}</span>
                  <Badge variant={STATUS_COLORS[p.status]} className="text-xs">
                    {STATUS_LABELS[p.status]}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

    </div>
  )
}
