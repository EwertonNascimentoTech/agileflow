import { Outlet } from "react-router-dom"

/** Layout do módulo Indicadores — a sidebar do AppLayout mostra os itens do módulo. */
export default function IndicadoresLayout() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
      <Outlet />
    </div>
  )
}
