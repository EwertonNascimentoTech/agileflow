import { Outlet } from "react-router-dom"
import { CircleHelp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ClientModeBanner } from "@/modules/portal/ClientModeBanner"
import { PortalAssistant } from "@/modules/portal/PortalAssistant"
import { PortalTour } from "@/modules/portal/tour/PortalTour"
import { startPortalTour } from "@/modules/portal/tour/tourSteps"

/** Módulo "Modo Cliente": as telas do Portal do Cliente dentro do AgileFlow, para a equipe ver
 *  o que o cliente vê (coordenação, todos os projetos; PO e dev, os projetos em que atuam). */
export default function PortalModuleLayout() {
  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-x-hidden">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-primary/5 px-4 py-2.5 print:hidden">
        <div className="min-w-0 flex-1">
          <ClientModeBanner />
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-background" onClick={startPortalTour} data-tour="tour-button">
          <CircleHelp size={14} /> Tour do Portal
        </Button>
      </div>
      <Outlet />
      <PortalAssistant />
      <PortalTour standalone={false} />
    </div>
  )
}
