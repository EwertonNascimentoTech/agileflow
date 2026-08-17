import { Navigate, Outlet } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { isExternalProductOwner } from "@/lib/permissions"

/**
 * Bloqueia o que é vedado ao Product Owner (Externo), que só enxerga os projetos onde é
 * o responsável:
 *  - visões consolidadas do portfólio (PMO, PO Sync, Capacidade, Relatórios, Status
 *    Reports, Programas);
 *  - os módulos Pessoas (teamops), Indicadores e RTD por inteiro.
 *
 * Esses itens já saem do menu; o guard cobre o acesso por URL. O backend responde 403 nos
 * mesmos endpoints (`_deny_po_external` e `PO_EXTERNAL_BLOCKED_MODULES`) — aqui é só para
 * não abrir uma tela quebrada.
 */
export default function ExternalPOGuard() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    )
  }

  if (isExternalProductOwner(user)) {
    return <Navigate to="/app/modules/projetos/board" replace />
  }
  return <Outlet />
}
