import { Outlet } from "react-router-dom"

/**
 * Layout do módulo PDV.
 * Sub-nav horizontal removido — sidebar do AppLayout mostra os itens.
 */
export default function PdvLayout() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <Outlet />
    </div>
  )
}
