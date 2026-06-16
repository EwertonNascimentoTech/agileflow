import { LayoutGrid, BarChart3, FileText } from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import PODashboardPage from "@/modules/projetos/PODashboardPage"
import ReportsPage from "@/modules/projetos/ReportsPage"
import StatusReportsPage from "@/modules/projetos/StatusReportsPage"

/**
 * Cockpit do PMO: unifica o portfólio (Painel do PO), os Relatórios do board e os
 * Status Reports por recorte em abas, dando ao coordenador controle de todos os
 * POs/projetos numa única tela.
 */
export default function PMODashboardPage({ initialTab = "portfolio" }: { initialTab?: "portfolio" | "relatorios" | "status-reports" }) {
  return (
    <div className="w-full space-y-4">
      <div>
        <h2 className="text-lg font-bold">PMO</h2>
        <p className="text-sm text-muted-foreground">
          Portfólio de todos os POs e relatórios do board num só lugar — priorize, repriorize e acompanhe entregas.
        </p>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="portfolio" className="gap-1.5">
            <LayoutGrid className="h-4 w-4" /> Portfólio
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Relatórios
          </TabsTrigger>
          <TabsTrigger value="status-reports" className="gap-1.5">
            <FileText className="h-4 w-4" /> Status Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio" className="mt-4">
          <PODashboardPage />
        </TabsContent>
        <TabsContent value="relatorios" className="mt-4">
          <ReportsPage />
        </TabsContent>
        <TabsContent value="status-reports" className="mt-4">
          <StatusReportsPage />
        </TabsContent>
      </Tabs>
    </div>
  )
}
