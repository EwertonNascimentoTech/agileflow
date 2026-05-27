import { Navigate, Outlet } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import type { UserRole } from "@/types"

interface ProtectedRouteProps {
  allowedRoles?: UserRole[]
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
