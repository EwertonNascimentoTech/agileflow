import { Outlet } from "react-router-dom"

/**
 * Layout do módulo Estoque.
 * Sub-nav horizontal removido — sidebar do AppLayout mostra os itens.
 */
export default function EstoqueLayout() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <Outlet />
    </div>
  )
}
