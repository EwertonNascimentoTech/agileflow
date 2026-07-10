import { lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { ToastContainer } from "@/components/ToastContainer"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import ProtectedRoute from "@/components/ProtectedRoute"
import ModuleConfigGuard from "@/components/ModuleConfigGuard"

// Todas as páginas/layouts abaixo são carregadas sob demanda (code splitting por
// rota). Sem isto, o bundle inicial embute o JS de TODOS os módulos (~100 páginas,
// incl. recharts/dnd-kit/telas de 1500-2000 linhas) antes do primeiro paint.

// ── Auth ──────────────────────────────────────────────────────────────
const LoginPage = lazy(() => import("@/modules/auth/LoginPage"))
const ForgotPasswordPage = lazy(() => import("@/modules/auth/ForgotPasswordPage"))
const FirstAccessPage = lazy(() => import("@/modules/auth/FirstAccessPage"))

// ── Super Admin ───────────────────────────────────────────────────────
const AdminLayout = lazy(() => import("@/modules/super-admin/AdminLayout"))
const AdminDashboardPage = lazy(() => import("@/modules/super-admin/DashboardPage"))
const TenantsPage = lazy(() => import("@/modules/super-admin/TenantsPage"))
const TenantDetailPage = lazy(() => import("@/modules/super-admin/TenantDetailPage"))
const AdminModulesPage = lazy(() => import("@/modules/super-admin/ModulesPage"))
const AdminsPage = lazy(() => import("@/modules/super-admin/AdminsPage"))

// ── Company (admin do tenant, dentro de crm) ──────────────────────────
const CompanyLayout = lazy(() => import("@/modules/crm/AppLayout"))
const CompanyDashboardPage = lazy(() => import("@/modules/crm/admin/DashboardPage"))
const SettingsLayout = lazy(() => import("@/modules/crm/admin/SettingsLayout"))
const UsersPage = lazy(() => import("@/modules/crm/admin/UsersPage"))
const RolesPage = lazy(() => import("@/modules/crm/admin/RolesPage"))
const SettingsPage = lazy(() => import("@/modules/crm/admin/SettingsPage"))

// ── Pública (proposta com token sem auth) ─────────────────────────────
const PublicProposalPage = lazy(() => import("@/modules/crm/proposals/PublicProposalPage"))

// ── CRM (módulo unificado) ────────────────────────────────────────────
const CrmLayout = lazy(() => import("@/modules/crm/CrmLayout"))
const CrmKanbanPage = lazy(() => import("@/modules/crm/KanbanPage"))
const CrmDashboardPage = lazy(() => import("@/modules/crm/DashboardPage"))
const CrmClientsPage = lazy(() => import("@/modules/crm/ClientsPage"))
const CrmClientDetailPage = lazy(() => import("@/modules/crm/ClientDetailPage"))
const CrmAttendanceDetailPage = lazy(() => import("@/modules/crm/AttendanceDetailPage"))
const CrmCompaniesPage = lazy(() => import("@/modules/crm/CompaniesPage"))
const CrmCompanyDetailPage = lazy(() => import("@/modules/crm/CompanyDetailPage"))
const CrmNewAttendanceOpenRedirect = lazy(() => import("@/modules/crm/NewAttendanceOpenRedirect"))
const CrmConfigPage = lazy(() => import("@/modules/crm/config/ConfigPage"))
const CrmFunnelsConfigPage = lazy(() => import("@/modules/crm/config/FunnelsConfigPage"))
const CrmStatusConfigPage = lazy(() => import("@/modules/crm/config/StatusConfigPage"))
const CrmChannelsConfigPage = lazy(() => import("@/modules/crm/config/ChannelsConfigPage"))
const CrmAutomationsConfigPage = lazy(() => import("@/modules/crm/config/AutomationsConfigPage"))
const CrmFollowUpConfigPage = lazy(() => import("@/modules/crm/config/FollowUpConfigPage"))
const CrmReactivationConfigPage = lazy(() => import("@/modules/crm/config/ReactivationConfigPage"))
const CrmProposalsListPage = lazy(() => import("@/modules/crm/proposals/ProposalsListPage"))
const CrmNewProposalPage = lazy(() => import("@/modules/crm/proposals/NewProposalPage"))
const CrmProposalDetailPage = lazy(() => import("@/modules/crm/proposals/ProposalDetailPage"))
const CrmProposalPrintView = lazy(() => import("@/modules/crm/proposals/ProposalPrintView"))
const CrmProposalsDashboardPage = lazy(() => import("@/modules/crm/proposals/DashboardPage"))
const CrmProposalTemplatesPage = lazy(() => import("@/modules/crm/proposals/ProposalTemplatesPage"))
const CrmContractsListPage = lazy(() => import("@/modules/crm/proposals/ContractsListPage"))
const CrmContractDetailPage = lazy(() => import("@/modules/crm/proposals/ContractDetailPage"))

// ── Estoque ───────────────────────────────────────────────────────────
const EstoqueLayout = lazy(() => import("@/modules/estoque/EstoqueLayout"))
const EstoqueDashboardPage = lazy(() => import("@/modules/estoque/DashboardPage"))
const EstoqueProductsPage = lazy(() => import("@/modules/estoque/ProductsPage"))
const EstoqueProductDetailPage = lazy(() => import("@/modules/estoque/ProductDetailPage"))
const EstoqueProductTypesPage = lazy(() => import("@/modules/estoque/ProductTypesPage"))
const EstoqueCategoriesPage = lazy(() => import("@/modules/estoque/CategoriesPage"))
const EstoqueWarehousesPage = lazy(() => import("@/modules/estoque/WarehousesPage"))
const EstoqueSuppliersPage = lazy(() => import("@/modules/estoque/SuppliersPage"))
const EstoqueStockPage = lazy(() => import("@/modules/estoque/StockPage"))
const EstoqueMovementsPage = lazy(() => import("@/modules/estoque/MovementsPage"))
const EstoqueBatchesPage = lazy(() => import("@/modules/estoque/BatchesPage"))
const EstoqueSerialsPage = lazy(() => import("@/modules/estoque/SerialsPage"))
const EstoqueConfigPage = lazy(() => import("@/modules/estoque/ConfigPage"))

// ── PDV ───────────────────────────────────────────────────────────────
const PdvLayout = lazy(() => import("@/modules/pdv/PdvLayout"))
const PdvPosPage = lazy(() => import("@/modules/pdv/PosPage"))
const PdvCashSessionPage = lazy(() => import("@/modules/pdv/CashSessionPage"))
const PdvSalesHistoryPage = lazy(() => import("@/modules/pdv/SalesHistoryPage"))
const PdvSaleDetailPage = lazy(() => import("@/modules/pdv/SaleDetailPage"))
const PdvReceiptPrintView = lazy(() => import("@/modules/pdv/ReceiptPrintView"))
const PdvDashboardPage = lazy(() => import("@/modules/pdv/DashboardPage"))
const PdvPaymentMethodsConfigPage = lazy(() => import("@/modules/pdv/PaymentMethodsConfigPage"))
const ProjetosLayout = lazy(() => import("@/modules/projetos/ProjetosLayout"))
const ProjectBoardPage = lazy(() => import("@/modules/projetos/ProjectBoardPage"))
const ProjectProgramsPage = lazy(() => import("@/modules/projetos/ProjectProgramsPage"))
const ProjectConfigHomePage = lazy(() => import("@/modules/projetos/config/ProjectConfigHomePage"))
const ProjectDefaultFormConfigPage = lazy(() => import("@/modules/projetos/config/ProjectDefaultFormConfigPage"))
const ProjectDemandTypesConfigPage = lazy(() => import("@/modules/projetos/config/ProjectDemandTypesConfigPage"))
const ProjectDemandTypeFormEditorPage = lazy(() => import("@/modules/projetos/config/ProjectDemandTypeFormEditorPage"))
const ProjectFunnelsConfigPage = lazy(() => import("@/modules/projetos/config/ProjectFunnelsConfigPage"))
const ProjectStatusesConfigPage = lazy(() => import("@/modules/projetos/config/ProjectStatusesConfigPage"))
const ProjectConfigPage = lazy(() => import("@/modules/projetos/ProjectConfigPage"))
const BasicNewRequestPage = lazy(() => import("@/modules/projetos/basic/BasicNewRequestPage"))
const BasicMyRequestsPage = lazy(() => import("@/modules/projetos/basic/BasicMyRequestsPage"))
const GanttPage = lazy(() => import("@/modules/projetos/GanttPage"))
const ProjectScheduleConfigPage = lazy(() => import("@/modules/projetos/config/ProjectScheduleConfigPage"))
const ProjectAgentsConfigPage = lazy(() => import("@/modules/projetos/config/ProjectAgentsConfigPage"))
const ProjectAgentLogsConfigPage = lazy(() => import("@/modules/projetos/config/ProjectAgentLogsConfigPage"))
const ProjectPriorityMatrixPage = lazy(() => import("@/modules/projetos/ProjectPriorityMatrixPage"))
const PMODashboardPage = lazy(() => import("@/modules/projetos/PMODashboardPage"))
const CapacityCockpitPage = lazy(() => import("@/modules/projetos/CapacityCockpitPage"))
const StatusReportEditorPage = lazy(() => import("@/modules/projetos/StatusReportEditorPage"))
const StatusReportViewPage = lazy(() => import("@/modules/projetos/StatusReportViewPage"))
const ProjectPriorityConfigPage = lazy(() => import("@/modules/projetos/config/ProjectPriorityConfigPage"))
const ProjectCardLayoutConfigPage = lazy(() => import("@/modules/projetos/config/ProjectCardLayoutConfigPage"))
const ProjectAllTasksConfigPage = lazy(() => import("@/modules/projetos/config/ProjectAllTasksConfigPage"))

// ── TeamOps ───────────────────────────────────────────────────────────
const TeamopsLayout = lazy(() => import("@/modules/teamops/TeamopsLayout"))
const TeamopsDashboardPage = lazy(() => import("@/modules/teamops/DashboardPage"))
const TeamopsOrgPage = lazy(() => import("@/modules/teamops/OrgPage"))
const TeamopsPeoplePage = lazy(() => import("@/modules/teamops/PeoplePage"))
const TeamopsPersonDetailPage = lazy(() => import("@/modules/teamops/PersonDetailPage"))
const TeamopsStacksPage = lazy(() => import("@/modules/teamops/StacksPage"))
const TeamopsAbsencesPage = lazy(() => import("@/modules/teamops/AbsencesPage"))
const TeamopsConfigPage = lazy(() => import("@/modules/teamops/ConfigPage"))
const ProdutosLayout = lazy(() => import("@/modules/produtos/ProdutosLayout"))
const ProdutosDashboardPage = lazy(() => import("@/modules/produtos/DashboardPage"))
const ProdutosProductsPage = lazy(() => import("@/modules/produtos/ProductsPage"))
const ProdutosProductDetailPage = lazy(() => import("@/modules/produtos/ProductDetailPage"))
const ProdutosProcessPortfolioPage = lazy(() => import("@/modules/produtos/ProcessPortfolioPage"))
const ProdutosIndicadoresPage = lazy(() => import("@/modules/produtos/IndicadoresPage"))
const ProdutosInteligenciaPage = lazy(() => import("@/modules/produtos/InteligenciaPage"))
const ProdutosFornecedoresPage = lazy(() => import("@/modules/produtos/FornecedoresPage"))
const ProdutosConfigPage = lazy(() => import("@/modules/produtos/config/ProdutosConfigPage"))
const IndicadoresLayout = lazy(() => import("@/modules/indicadores/IndicadoresLayout"))
const IndicadoresDashboardPage = lazy(() => import("@/modules/indicadores/DashboardPage"))
const IndicadoresListPage = lazy(() => import("@/modules/indicadores/IndicadoresListPage"))
const IndicadorDetailPage = lazy(() => import("@/modules/indicadores/IndicadorDetailPage"))
const IndicadoresConfigPage = lazy(() => import("@/modules/indicadores/config/IndicadoresConfigPage"))

function RouteFallback() {
  return (
    <div className="flex h-full min-h-[40vh] w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-0 flex-1 flex-col">
        <ThemeProvider>
          <AuthProvider>
            <ErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
              {/* Público */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/primeiro-acesso" element={<FirstAccessPage />} />
              <Route path="/p/propostas/:token" element={<PublicProposalPage />} />

              {/* Super Admin */}
              <Route element={<ProtectedRoute allowedRoles={["super_admin"]} />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="/admin/dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboardPage />} />
                  <Route path="tenants" element={<TenantsPage />} />
                  <Route path="tenants/:id" element={<TenantDetailPage />} />
                  <Route path="modules" element={<AdminModulesPage />} />
                  <Route path="admins" element={<AdminsPage />} />
                </Route>
              </Route>

              {/* Company */}
              <Route element={<ProtectedRoute allowedRoles={["company_admin", "company_user"]} />}>
                <Route path="/app" element={<CompanyLayout />}>
                  <Route index element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="dashboard" element={<CompanyDashboardPage />} />

                  {/* Redirects: rotas antigas /app/users e /app/roles → /app/settings/* */}
                  <Route path="users" element={<Navigate to="/app/settings/users" replace />} />
                  <Route path="roles" element={<Navigate to="/app/settings/roles" replace />} />

                  {/* Configurações com sub-menu */}
                  <Route path="settings" element={<SettingsLayout />}>
                    <Route index element={<SettingsPage />} />
                    <Route element={<ProtectedRoute allowedRoles={["super_admin", "company_admin"]} />}>
                      <Route path="users" element={<UsersPage />} />
                      <Route path="roles" element={<RolesPage />} />
                    </Route>
                  </Route>

                  {/* Atendimento (deprecated) → redireciona para CRM */}
                  <Route path="modules/atendimento/*" element={<Navigate to="/app/modules/crm" replace />} />

                  {/* CRM (módulo unificado) */}
                  <Route path="modules/crm" element={<CrmLayout />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<CrmDashboardPage />} />
                    <Route path="kanban" element={<CrmKanbanPage />} />
                    <Route path="attendances" element={<Navigate to="kanban" replace />} />
                    <Route path="attendances/new" element={<CrmNewAttendanceOpenRedirect />} />
                    <Route path="attendances/:id" element={<CrmAttendanceDetailPage />} />
                    <Route path="clients" element={<CrmClientsPage />} />
                    <Route path="clients/:id" element={<CrmClientDetailPage />} />
                    <Route path="companies" element={<CrmCompaniesPage />} />
                    <Route path="companies/:id" element={<CrmCompanyDetailPage />} />

                    {/* Sub-páginas legacy → todas unificadas no Dashboard */}
                    <Route path="forecast"     element={<Navigate to="/app/modules/crm/dashboard" replace />} />
                    <Route path="conversion"   element={<Navigate to="/app/modules/crm/dashboard" replace />} />
                    <Route path="productivity" element={<Navigate to="/app/modules/crm/dashboard" replace />} />

                    <Route element={<ModuleConfigGuard moduleSlug="crm" />}>
                      <Route path="config" element={<CrmConfigPage />} />
                      <Route path="config/funnels" element={<CrmFunnelsConfigPage />} />
                      <Route path="config/statuses" element={<CrmStatusConfigPage />} />
                      <Route path="config/channels" element={<CrmChannelsConfigPage />} />
                      <Route path="config/automations" element={<CrmAutomationsConfigPage />} />
                      <Route path="config/follow-ups" element={<CrmFollowUpConfigPage />} />
                      <Route path="config/reactivation" element={<CrmReactivationConfigPage />} />
                    </Route>
                    <Route path="proposals" element={<CrmProposalsListPage />} />
                    <Route path="proposals/new" element={<CrmNewProposalPage />} />
                    <Route path="proposals/dashboard" element={<CrmProposalsDashboardPage />} />
                    <Route path="proposals/templates" element={<CrmProposalTemplatesPage />} />
                    <Route path="proposals/:id" element={<CrmProposalDetailPage />} />
                    <Route path="proposals/:id/print" element={<CrmProposalPrintView />} />
                    <Route path="contracts" element={<CrmContractsListPage />} />
                    <Route path="contracts/:id" element={<CrmContractDetailPage />} />
                  </Route>

                  {/* Propostas/Contratos (deprecated) → redireciona para CRM */}
                  <Route path="modules/propostas_contratos/*" element={<Navigate to="/app/modules/crm/proposals" replace />} />

                  {/* Projetos */}
                  <Route path="modules/projetos" element={<ProjetosLayout />}>
                    <Route index element={<ProjectBoardPage />} />
                    <Route path="board" element={<ProjectBoardPage />} />
                    <Route path="lista" element={<ProjectBoardPage />} />
                    <Route path="calendario" element={<ProjectBoardPage />} />
                    <Route path="gantt" element={<GanttPage />} />
                    <Route path="cronograma" element={<GanttPage />} />
                    <Route path="capacidade" element={<CapacityCockpitPage />} />
                    <Route path="relatorios" element={<PMODashboardPage initialTab="relatorios" />} />
                    <Route path="matriz" element={<ProjectPriorityMatrixPage />} />
                    <Route path="painel-po" element={<PMODashboardPage />} />
                    <Route path="po-sync" element={<PMODashboardPage initialTab="po-sync" />} />
                    <Route path="status-reports" element={<PMODashboardPage initialTab="status-reports" />} />
                    <Route path="status-reports/new" element={<StatusReportEditorPage />} />
                    <Route path="status-reports/:id" element={<StatusReportViewPage />} />
                    <Route path="solicitacoes" element={<BasicNewRequestPage />} />
                    <Route path="minhas" element={<BasicMyRequestsPage />} />
                    <Route path="programas" element={<ProjectProgramsPage />} />
                    <Route path=":projectId/board" element={<ProjectBoardPage />} />
                    <Route path=":projectId/lista" element={<ProjectBoardPage />} />
                    <Route path=":projectId/calendario" element={<ProjectBoardPage />} />
                    <Route path=":projectId/gantt" element={<GanttPage />} />
                    <Route element={<ModuleConfigGuard moduleSlug="projetos" />}>
                      <Route path="config" element={<ProjectConfigHomePage />} />
                      <Route path="config/processos" element={<ProjectConfigPage />} />
                      <Route path="config/demandas" element={<ProjectAllTasksConfigPage />} />
                      <Route path="config/default-form" element={<ProjectDefaultFormConfigPage />} />
                      <Route path="config/demand-types" element={<ProjectDemandTypesConfigPage />} />
                      <Route path="config/demand-types/:demandTypeId" element={<ProjectDemandTypeFormEditorPage />} />
                      <Route path="config/funnels" element={<ProjectFunnelsConfigPage />} />
                      <Route path="config/statuses" element={<ProjectStatusesConfigPage />} />
                      <Route path="config/cronograma" element={<ProjectScheduleConfigPage />} />
                      <Route path="config/agentes" element={<ProjectAgentsConfigPage />} />
                      <Route path="config/agentes/logs" element={<ProjectAgentLogsConfigPage />} />
                      <Route path="config/priorizacao" element={<ProjectPriorityConfigPage />} />
                      <Route path="config/layout-card" element={<ProjectCardLayoutConfigPage />} />
                    </Route>
                  </Route>

                  {/* Estoque */}
                  <Route path="modules/estoque" element={<EstoqueLayout />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard"      element={<EstoqueDashboardPage />} />
                    <Route path="products"       element={<EstoqueProductsPage />} />
                    <Route path="products/:id"   element={<EstoqueProductDetailPage />} />
                    <Route path="stock"          element={<EstoqueStockPage />} />
                    <Route path="movements"      element={<EstoqueMovementsPage />} />
                    <Route path="batches"        element={<EstoqueBatchesPage />} />
                    <Route path="serials"        element={<EstoqueSerialsPage />} />
                    <Route element={<ModuleConfigGuard moduleSlug="estoque" />}>
                      <Route path="config"         element={<EstoqueConfigPage />} />
                      <Route path="product-types"  element={<EstoqueProductTypesPage />} />
                      <Route path="categories"     element={<EstoqueCategoriesPage />} />
                      <Route path="warehouses"     element={<EstoqueWarehousesPage />} />
                      <Route path="suppliers"      element={<EstoqueSuppliersPage />} />
                    </Route>
                  </Route>

                  {/* TeamOps */}
                  <Route path="modules/teamops" element={<TeamopsLayout />}>
                    <Route index element={<TeamopsDashboardPage />} />
                    <Route path="org"           element={<TeamopsOrgPage />} />
                    <Route path="people"        element={<TeamopsPeoplePage />} />
                    <Route path="people/:personId" element={<TeamopsPersonDetailPage />} />
                    <Route path="stacks"        element={<TeamopsStacksPage />} />
                    <Route path="absences"      element={<TeamopsAbsencesPage />} />
                    <Route element={<ModuleConfigGuard moduleSlug="teamops" />}>
                      <Route path="config"        element={<TeamopsConfigPage />} />
                    </Route>
                  </Route>

                  {/* Produtos */}
                  <Route path="modules/produtos" element={<ProdutosLayout />}>
                    <Route index element={<ProdutosDashboardPage />} />
                    <Route path="dashboard" element={<ProdutosDashboardPage />} />
                    <Route path="produtos" element={<ProdutosProductsPage />} />
                    <Route path="produtos/:id" element={<ProdutosProductDetailPage />} />
                    <Route path="inteligencia" element={<ProdutosInteligenciaPage />} />
                    <Route path="processos-portfolio" element={<ProdutosProcessPortfolioPage />} />
                    <Route path="indicadores" element={<ProdutosIndicadoresPage />} />
                    <Route path="fornecedores" element={<ProdutosFornecedoresPage />} />
                    <Route element={<ModuleConfigGuard moduleSlug="produtos" />}>
                      <Route path="config" element={<ProdutosConfigPage />} />
                    </Route>
                  </Route>

                  {/* Indicadores */}
                  <Route path="modules/indicadores" element={<IndicadoresLayout />}>
                    <Route index element={<IndicadoresDashboardPage />} />
                    <Route path="dashboard" element={<IndicadoresDashboardPage />} />
                    <Route path="indicadores" element={<IndicadoresListPage />} />
                    <Route path="indicadores/:id" element={<IndicadorDetailPage />} />
                    <Route element={<ModuleConfigGuard moduleSlug="indicadores" />}>
                      <Route path="config" element={<IndicadoresConfigPage />} />
                    </Route>
                  </Route>

                  {/* PDV */}
                  <Route path="modules/pdv/sales/:id/receipt" element={<PdvReceiptPrintView />} />
                  <Route path="modules/pdv" element={<PdvLayout />}>
                    <Route index element={<Navigate to="pos" replace />} />
                    <Route path="pos"        element={<PdvPosPage />} />
                    <Route path="cash"       element={<PdvCashSessionPage />} />
                    <Route path="sales"      element={<PdvSalesHistoryPage />} />
                    <Route path="sales/:id"  element={<PdvSaleDetailPage />} />
                    <Route path="dashboard"  element={<PdvDashboardPage />} />
                    <Route element={<ModuleConfigGuard moduleSlug="pdv" />}>
                      <Route path="config"     element={<PdvPaymentMethodsConfigPage />} />
                    </Route>
                  </Route>
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<RoleRedirect />} />
            </Routes>
              </Suspense>
          </ErrorBoundary>
          <ToastContainer />
        </AuthProvider>
      </ThemeProvider>
      </div>
    </BrowserRouter>
  )
}

function RoleRedirect() {
  try {
    const raw = localStorage.getItem("user")
    if (raw) {
      const user = JSON.parse(raw)
      if (user.role === "super_admin") return <Navigate to="/admin/dashboard" replace />
      if (user.role === "company_admin" || user.role === "company_user")
        return <Navigate to="/app/dashboard" replace />
    }
  } catch { /* ignore */ }
  return <Navigate to="/login" replace />
}
