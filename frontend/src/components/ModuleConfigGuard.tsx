import { Navigate, Outlet, useLocation } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { canAccessModuleConfig } from "@/lib/permissions"

interface Props {
  moduleSlug: string
}

/** Bloqueia rotas /config/* para quem não tem permissão de configuração do módulo. */
export default function ModuleConfigGuard({ moduleSlug }: Props) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    )
  }

  const isAdmin = user?.role === "super_admin" || user?.role === "company_admin"
  if (isAdmin || canAccessModuleConfig(user?.permissions, moduleSlug)) {
    return <Outlet />
  }

  const fallback = location.pathname.match(/^\/app\/modules\/[^/]+/)
    ? location.pathname.split("/config")[0] || `/app/modules/${moduleSlug}`
    : `/app/modules/${moduleSlug}`

  return <Navigate to={fallback} replace />
}
