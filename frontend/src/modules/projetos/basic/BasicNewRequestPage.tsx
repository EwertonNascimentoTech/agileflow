import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, FileText, Search } from "lucide-react"

import { companyApi } from "@/api/company"
import { projetosApi, type ProjectDemandType } from "@/api/projetos"
import type { User } from "@/types"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { CreateDemandDialog } from "@/modules/projetos/CreateDemandDialog"
import { toast } from "@/lib/toast"

export default function BasicNewRequestPage() {
  const navigate = useNavigate()
  const [types, setTypes] = useState<ProjectDemandType[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [selectedType, setSelectedType] = useState<ProjectDemandType | null>(null)

  useEffect(() => {
    Promise.all([
      projetosApi.listDemandTypes(true),
      companyApi.listUsers({ active_only: true }).catch(() => [] as User[]),
    ])
      .then(([ts, us]) => {
        setTypes(ts)
        setUsers(us)
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return types
      .filter((t) => t.available_for_basic)
      .filter((t) => t.funnel?.project_id)
      .filter((t) => !q || t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q))
  }, [types, query])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Nova Solicitação</h1>
          <p className="text-xs text-muted-foreground">Escolha o tipo de solicitação que deseja abrir.</p>
        </div>
        <div className="relative ml-auto flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tipo..."
            className="pl-9 h-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={types.length === 0 ? "Nenhum tipo de solicitação disponível" : "Nenhum tipo encontrado"}
          description={
            types.length === 0
              ? "Peça ao administrador para configurar os tipos de demanda no módulo Projetos."
              : "Tente outra busca."
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setSelectedType(type)}
              className="group text-left rounded-xl border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-semibold text-foreground">{type.name}</p>
                <ArrowRight size={16} className="text-muted-foreground group-hover:text-primary shrink-0" />
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
                {type.description?.trim() || "Sem descrição"}
              </p>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="truncate">{type.funnel?.name ? `Funil · ${type.funnel.name}` : "—"}</span>
                <span className="font-semibold text-primary opacity-0 group-hover:opacity-100 transition">
                  Solicitar
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedType && selectedType.funnel?.project_id && (
        <CreateDemandDialog
          open={!!selectedType}
          onOpenChange={(v) => { if (!v) setSelectedType(null) }}
          projectId={selectedType.funnel.project_id}
          demandType={selectedType}
          users={users}
          onCreated={() => {
            toast.success("Solicitação criada.")
            setSelectedType(null)
            navigate("/app/modules/projetos/minhas")
          }}
        />
      )}
    </div>
  )
}

