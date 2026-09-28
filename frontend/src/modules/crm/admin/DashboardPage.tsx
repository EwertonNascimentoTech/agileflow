import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Package, ArrowRight, Users2, ClipboardList, CirclePlus, LayoutDashboard } from "lucide-react"
import { resolveModuleIcon } from "@/lib/moduleIcons"
import { companyApi, type MyTenant, type ActiveModule } from "@/api/crm"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Card, PageHeader, Pill } from "@/components/ds"
import { EXTERNAL_PO_BLOCKED_MODULES, isExternalProductOwner } from "@/lib/permissions"

const resolveIcon = resolveModuleIcon

function moduleHomePath(m: ActiveModule): string {
  return `/app/modules/${m.slug}`
}

/** Título de cada faixa (mesmo do painel de Produtos). */
function RowTitle({ children }: { children: string }) {
  return <h2 className="text-sm font-semibold text-muted-foreground">{children}</h2>
}

export default function CompanyDashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState<MyTenant | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    companyApi.getMyTenant()
      .then(setTenant)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const firstName = user?.full_name?.split(" ")[0] ?? ""
  // Nome da Função vem no /auth/me (role_name). Antes a tela listava todas as Funções
  // (/company/admin/roles), rota de admin: 403 no console para todo usuário comum.
  const userRoleName = (
    (user as unknown as { role_name?: string; function_name?: string; role_display_name?: string }).role_name
    ?? (user as unknown as { role_name?: string; function_name?: string; role_display_name?: string }).function_name
    ?? (user as unknown as { role_name?: string; function_name?: string; role_display_name?: string }).role_display_name
    ?? ""
  ).trim().toLowerCase()
  const isBasicUser =
    user?.role === "company_user" &&
    (userRoleName === "basic" || userRoleName === "")
  const isAdmin = user?.role === "company_admin" || user?.role === "super_admin"
  const isExternalPO = isExternalProductOwner(user)
  const visibleModules = (tenant?.active_modules ?? []).filter(
    (m) =>
      !(isExternalPO && EXTERNAL_PO_BLOCKED_MODULES.includes(m.slug)) &&
      // Modo Cliente: só para quem está em Times ou tem cadastro de cliente.
      (m.slug !== "portal_cliente" || !!(user?.has_team_portal || user?.has_client_portal)),
  )
  const hasProjetosModule = visibleModules.some((m) => m.slug === "projetos")
  const basicNewRequestRoute = hasProjetosModule ? "/app/modules/projetos" : "/app/modules/crm/attendances/new"
  const basicMyRequestsRoute = hasProjetosModule ? "/app/modules/projetos" : "/app/modules/crm/kanban"

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        color="#4F46E5"
        title={`Olá, ${firstName} 👋`}
        description={`${tenant ? `${tenant.name} · ` : ""}Bem-vindo ao seu painel.`}
      />

      {!isBasicUser && (
        <section className="space-y-2">
          <RowTitle>Módulos ativos</RowTitle>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-[148px] rounded-2xl" />)}
            </div>
          ) : visibleModules.length === 0 ? (
            <Card className="border-dashed">
              <EmptyState
                icon={Package}
                title="Nenhum módulo ativo"
                description="Entre em contato com o administrador da plataforma para ativar os módulos da sua empresa."
                compact
              />
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleModules.map((m) => {
                const Icon = resolveIcon(m.icon)
                return (
                  <button
                    key={m.slug}
                    type="button"
                    className="group flex flex-col gap-3 rounded-2xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => navigate(moduleHomePath(m))}
                  >
                    <div className="flex w-full items-start justify-between gap-3">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${m.color}1f`, color: m.color }}
                        aria-hidden
                      >
                        <Icon size={20} />
                      </span>
                      <Pill tone="emerald" dot>Ativo</Pill>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{m.name}</p>
                      {m.description && (
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{m.description}</p>
                      )}
                    </div>
                    <span
                      className="inline-flex items-center gap-1 text-sm font-medium transition-all group-hover:gap-2"
                      style={{ color: m.color }}
                    >
                      Acessar <ArrowRight size={14} />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <RowTitle>{isBasicUser ? "Solicitações" : "Atalhos"}</RowTitle>
        <div className="flex flex-wrap gap-2">
          {isBasicUser ? (
            <>
              <Button className="h-10 gap-1.5" onClick={() => navigate(basicNewRequestRoute)}>
                <CirclePlus size={16} /> Nova Solicitação
              </Button>
              <Button variant="outline" className="h-10 gap-1.5" onClick={() => navigate(basicMyRequestsRoute)}>
                <ClipboardList size={16} /> Minhas Solicitações
              </Button>
            </>
          ) : (
            <>
              {isAdmin && (
                <Button variant="outline" className="h-10 gap-1.5" onClick={() => navigate("/app/users")}>
                  <Users2 size={16} /> Gerenciar usuários
                </Button>
              )}
              <Button variant="outline" className="h-10 gap-1.5" onClick={() => navigate("/app/modules/crm/dashboard")}>
                <Package size={16} /> Ver módulos
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
