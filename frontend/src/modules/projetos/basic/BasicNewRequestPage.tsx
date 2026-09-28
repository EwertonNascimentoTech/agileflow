import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, FilePlus2, FileText, Search, Sparkles } from "lucide-react"

import { companyApi } from "@/api/company"
import { projetosApi, type ProjectDemandType } from "@/api/projetos"
import type { User } from "@/types"
import { Card, HowItWorks, PageHeader } from "@/components/ds"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { CreateDemandDialog } from "@/modules/projetos/CreateDemandDialog"
import { toast } from "@/lib/toast"
import { PORTAL_MODULE_BASE } from "@/modules/portal/portfolioMeta"

/** Tipo "Solicitar análise de solução com IA" (AiSolutionsService.DEMAND_TYPE_SLUG). */
const AI_SOLUTION_SLUG = "solucao_ia"

const MY_REQUESTS = "/app/modules/projetos/minhas"

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

  const header = (
    <PageHeader
      crumbs={[{ label: "Minhas Solicitações", to: MY_REQUESTS }, { label: "Nova solicitação" }]}
      icon={FilePlus2}
      color="#2563EB"
      title="Nova Solicitação"
      description="Escolha o tipo de solicitação que deseja abrir."
    />
  )

  if (loading) {
    return (
      <div className="w-full space-y-5 p-1">
        {header}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-5 p-1">
      {header}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block w-full max-w-md space-y-1">
                <span className="text-xs text-muted-foreground">Buscar</span>
                <span className="relative block">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar tipo..."
                    className="h-10 bg-background pl-9"
                  />
                </span>
              </label>
              <span className="ml-auto pb-2 text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">{filtered.length}</strong>{" "}
                {filtered.length === 1 ? "tipo disponível" : "tipos disponíveis"}
              </span>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={FileText}
                title={types.length === 0 ? "Nenhum tipo de solicitação disponível" : "Nenhum tipo encontrado"}
                description={
                  types.length === 0
                    ? "Peça ao administrador para configurar os tipos de demanda no módulo Projetos."
                    : "Tente outra busca."
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((type) => {
                const isAi = type.slug === AI_SOLUTION_SLUG
                const Icon = isAi ? Sparkles : FileText
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => {
                      // Solução com IA tem fluxo próprio (IA-0001, ações do solicitante): abre o pedido no Modo Cliente.
                      if (type.slug === AI_SOLUTION_SLUG) navigate(`${PORTAL_MODULE_BASE}/solucoes-ia/nova`)
                      else setSelectedType(type)
                    }}
                    className="group flex flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
                        <Icon size={19} />
                      </span>
                      <p className="min-w-0 flex-1 pt-2 font-semibold leading-snug text-foreground group-hover:text-primary">{type.name}</p>
                      <ArrowRight size={16} className="mt-2.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                    </div>
                    <p className="flex-1 text-sm text-muted-foreground line-clamp-3">
                      {type.description?.trim() || "Sem descrição"}
                    </p>
                    <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                      <span className="truncate">{type.funnel?.name ? `Funil · ${type.funnel.name}` : "—"}</span>
                      <span className="shrink-0 font-semibold text-primary opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                        Solicitar
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <HowItWorks
            items={[
              ["Escolha o tipo", "Cada tipo abre no kanban configurado para ele (o funil aparece no cartão)."],
              ["Preencha o formulário", "Os campos pedidos dependem do tipo escolhido."],
              ["Acompanhe o andamento", "Depois de enviar, a solicitação aparece em Minhas Solicitações. Solução com IA é pedida e acompanhada no Modo Cliente."],
            ]}
          />
        </aside>
      </div>

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
            navigate(MY_REQUESTS)
          }}
        />
      )}
    </div>
  )
}
