import { Navigate, Outlet } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

function Spinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 size={28} className="animate-spin text-primary" />
    </div>
  )
}

/**
 * Cliente externo da Operação Assistida só enxerga o Portal do Cliente. O backend já
 * responde 403 em todos os módulos (`require_module`); aqui evita abrir telas quebradas.
 */
export function NotClientGuard() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Spinner />
  if (user?.is_client) return <Navigate to="/portal" replace />
  return <Outlet />
}

/** Portal do Cliente: cliente externo ou colaborador interno com cadastro de cliente. */
export function ClientPortalGuard() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Spinner />
  if (!user?.is_client && !user?.has_client_portal) return <Navigate to="/app/dashboard" replace />
  return <Outlet />
}
