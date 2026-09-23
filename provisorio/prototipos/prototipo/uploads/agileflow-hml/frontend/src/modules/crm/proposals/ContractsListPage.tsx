import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FileSignature, Search } from "lucide-react"
import { contractsApi } from "@/api/crm"
import type { ContractSummary, ContractStatus } from "@/api/crm"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"

const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Rascunho", ready: "Pronto", sent: "Enviado", signed: "Assinado", cancelled: "Cancelado",
}
const STATUS_COLORS: Record<ContractStatus, "secondary" | "success" | "destructive" | "outline"> = {
  draft: "outline", ready: "secondary", sent: "secondary", signed: "success", cancelled: "destructive",
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v))

export default function ContractsListPage() {
  const navigate = useNavigate()
  const [contracts, setContracts] = useState<ContractSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    contractsApi.list({ limit: 200 }).then(setContracts).finally(() => setLoading(false))
  }, [])

  const filtered = contracts.filter(c =>
    !search ||
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.number.toLowerCase().includes(search.toLowerCase()) ||
    (c.client_name ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Contratos</h2>
        <p className="text-sm text-muted-foreground">
          {loading ? "Carregando…" : `${contracts.length} contrato${contracts.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por título, número, cliente…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title={search ? "Nenhum contrato encontrado" : "Nenhum contrato gerado"}
          description={search ? "Tente buscar por outro termo." : "Os contratos aparecem aqui após serem gerados a partir de propostas aceitas."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <Card
              key={c.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/app/modules/crm/contracts/${c.id}`)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <FileSignature size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{c.number}</span>
                    <p className="font-semibold text-sm truncate">{c.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.client_name ?? "—"}
                    {c.start_date && <span> · início {new Date(c.start_date).toLocaleDateString("pt-BR")}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-emerald-600">{fmtCurrency(c.total_value)}</span>
                  <Badge variant={STATUS_COLORS[c.status]} className="text-xs">
                    {STATUS_LABELS[c.status]}
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
