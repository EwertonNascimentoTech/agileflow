import { Outlet } from "react-router-dom"

import { ClientModeBanner } from "@/modules/portal/ClientModeBanner"
import { PortalAssistant } from "@/modules/portal/PortalAssistant"

/** Módulo "Modo Cliente": as telas do Portal do Cliente dentro do AgileFlow, para a equipe ver
 *  o que o cliente vê (coordenação, todos os projetos; PO e dev, os projetos em que atuam). */
export default function PortalModuleLayout() {
  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-x-hidden">
      <div className="rounded-xl border bg-primary/5 px-4 py-2.5 print:hidden">
        <ClientModeBanner />
      </div>
      <Outlet />
      <PortalAssistant />
    </div>
  )
}
