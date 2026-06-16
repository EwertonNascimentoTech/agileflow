import { Outlet } from "react-router-dom"

/** Layout do módulo Portfólio de Produtos — a sidebar do AppLayout mostra os itens. */
export default function ProdutosLayout() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
      <Outlet />
    </div>
  )
}
