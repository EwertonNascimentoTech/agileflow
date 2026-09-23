import { Outlet } from "react-router-dom"
import { NewAttendanceModalProvider } from "./newAttendanceModal"

/**
 * Layout do módulo CRM.
 * O sub-nav horizontal foi removido — agora o sidebar do AppLayout
 * mostra dinamicamente os itens do módulo ativo via moduleNavConfig.ts.
 */
export default function CrmLayout() {
  return (
    <NewAttendanceModalProvider>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </div>
    </NewAttendanceModalProvider>
  )
}
