import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Package, ArrowRight, Loader2, Users2, ClipboardList, CirclePlus } from "lucide-react"
import { resolveModuleIcon } from "@/lib/moduleIcons"
import { companyApi, type MyTenant, type ActiveModule } from "@/api/crm"
import { useAuth } from "@/contexts/AuthContext"
import type { Role } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/EmptyState"
import { EXTERNAL_PO_BLOCKED_MODULES, isExternalProductOwner } from "@/lib/permissions"

const resolveIcon = resolveModuleIcon

function moduleHomePath(m: ActiveModule): string {
  return `/app/modules/${m.slug}`
}

export default function CompanyDashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState<MyTenant | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    companyApi.getMyTenant()
      .then(setTenant)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (user?.role !== "company_user" || !user.role_id) return
    companyApi.listRoles()
      .then(setRoles)
      .catch(() => setRoles([]))
  }, [user?.role, user?.role_id])

  const firstName = user?.full_name?.split(" ")[0] ?? ""
  const userRoleName = (
    roles.find((r) => r.id === user?.role_id)?.name
    ?? (user as unknown as { role_name?: string; function_name?: string; role_display_name?: string }).role_name
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
    (m) => !(isExternalPO && EXTERNAL_PO_BLOCKED_MODULES.includes(m.slug)),
  )
  const hasProjetosModule = visibleModules.some((m) => m.slug === "projetos")
  const basicNewRequestRoute = hasProjetosModule ? "/app/modules/projetos" : "/app/modules/crm/attendances/new"
  const basicMyRequestsRoute = hasProjetosModule ? "/app/modules/projetos" : "/app/modules/crm/kanban"

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Olá, {firstName} 👋</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tenant ? `${tenant.name} · ` : ""}Bem-vindo ao seu painel.
        </p>
      </div>

      {!isBasicUser && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Módulos ativos</h2>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Carregando…
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
                  <Card
                    key={m.slug}
                    className="cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5 group overflow-hidden"
                    onClick={() => navigate(moduleHomePath(m))}
                  >
                    <div className="h-1" style={{ backgroundColor: m.color }} />
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div
                          className="h-9 w-9 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${m.color}1a`, color: m.color }}
                        >
                          <Icon size={17} />
                        </div>
                        <Badge variant="success" className="text-xs">Ativo</Badge>
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{m.name}</p>
                        {m.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{m.description}</p>
                        )}
                      </div>
                      <div
                        className="flex items-center gap-1 text-xs font-medium group-hover:gap-2 transition-all"
                        style={{ color: m.color }}
                      >
                        Acessar <ArrowRight size={11} />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">
          {isBasicUser ? "Solicitações" : "Atalhos"}
        </h2>
        <div className="flex flex-wrap gap-2">
          {isBasicUser ? (
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(basicNewRequestRoute)}>
                <CirclePlus size={13} className="mr-1.5" /> Nova Solicitação
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(basicMyRequestsRoute)}>
                <ClipboardList size={13} className="mr-1.5" /> Minhas Solicitações
              </Button>
            </>
          ) : (
            <>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => navigate("/app/users")}>
                  <Users2 size={13} className="mr-1.5" /> Gerenciar usuários
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => navigate("/app/modules/crm/dashboard")}>
                <Package size={13} className="mr-1.5" /> Ver módulos
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
