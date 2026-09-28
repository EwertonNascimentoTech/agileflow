import { useState } from "react"
import { LayoutGrid, BarChart3, FileText, Users, PackageCheck, Gauge, LayoutDashboard } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { DetailTabs, PageHeader, type TabDef } from "@/components/ds"
import PODashboardPage from "@/modules/projetos/PODashboardPage"
import PoSyncPage from "@/modules/projetos/PoSyncPage"
import ReportsPage from "@/modules/projetos/ReportsPage"
import StatusReportsPage from "@/modules/projetos/StatusReportsPage"
import TeamPerformancePage from "@/modules/projetos/TeamPerformancePage"
import UsDeliveryReportPage from "@/modules/projetos/UsDeliveryReportPage"

export type PmoTab = "portfolio" | "po-sync" | "relatorios" | "entregas-us" | "status-reports" | "desempenho"

/**
 * Cockpit do PMO: unifica o portfólio (Painel do PO), os Relatórios do board e os
 * Status Reports por recorte em abas, dando ao coordenador controle de todos os
 * POs/projetos numa única tela.
 */
export default function PMODashboardPage({ initialTab = "portfolio" }: { initialTab?: PmoTab }) {
  const { user } = useAuth()
  const canViewPerformance =
    !!user &&
    (!!user.permissions?.includes("*") || !!user.permissions?.includes("projetos.performance.view"))
  // Aba inicial vem da rota (mesmo comportamento do antigo `defaultValue`); a troca de aba não mexe na URL.
  const [tab, setTab] = useState<PmoTab>(initialTab)

  const tabs: TabDef<PmoTab>[] = [
    { value: "portfolio", label: "Portfólio", icon: LayoutGrid },
    ...(canViewPerformance ? [{ value: "desempenho" as const, label: "Desempenho", icon: Gauge }] : []),
    { value: "po-sync", label: "PO Sync", icon: Users },
    { value: "status-reports", label: "Status Reports", icon: FileText },
    { value: "relatorios", label: "Relatórios", icon: BarChart3 },
    { value: "entregas-us", label: "Entregas", icon: PackageCheck },
  ]

  return (
    <div className="w-full space-y-5">
      <PageHeader
        icon={LayoutDashboard}
        color="#2563EB"
        title="PMO"
        description="Portfólio de todos os POs e relatórios do board num só lugar — priorize, repriorize e acompanhe entregas."
      />

      <DetailTabs tabs={tabs} value={tab} onChange={setTab} />

      <div>
        {tab === "portfolio" && <PODashboardPage />}
        {canViewPerformance && tab === "desempenho" && <TeamPerformancePage />}
        {tab === "po-sync" && <PoSyncPage />}
        {tab === "relatorios" && <ReportsPage />}
        {tab === "entregas-us" && <UsDeliveryReportPage />}
        {tab === "status-reports" && <StatusReportsPage />}
      </div>
    </div>
  )
}
