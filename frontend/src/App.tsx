import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { ToastContainer } from "@/components/ToastContainer"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import ProtectedRoute from "@/components/ProtectedRoute"

// ── Auth ──────────────────────────────────────────────────────────────
import LoginPage from "@/modules/auth/LoginPage"
import ForgotPasswordPage from "@/modules/auth/ForgotPasswordPage"

// ── Super Admin ───────────────────────────────────────────────────────
import AdminLayout from "@/modules/super-admin/AdminLayout"
import AdminDashboardPage from "@/modules/super-admin/DashboardPage"
import TenantsPage from "@/modules/super-admin/TenantsPage"
import TenantDetailPage from "@/modules/super-admin/TenantDetailPage"
import AdminModulesPage from "@/modules/super-admin/ModulesPage"
import AdminsPage from "@/modules/super-admin/AdminsPage"

// ── Company (admin do tenant, dentro de crm) ──────────────────────────
import CompanyLayout from "@/modules/crm/AppLayout"
import CompanyDashboardPage from "@/modules/crm/admin/DashboardPage"
import SettingsLayout from "@/modules/crm/admin/SettingsLayout"
import UsersPage from "@/modules/crm/admin/UsersPage"
import RolesPage from "@/modules/crm/admin/RolesPage"
import SettingsPage from "@/modules/crm/admin/SettingsPage"

// ── Pública (proposta com token sem auth) ─────────────────────────────
import PublicProposalPage from "@/modules/crm/proposals/PublicProposalPage"

// ── CRM (módulo unificado) ────────────────────────────────────────────
import CrmLayout from "@/modules/crm/CrmLayout"
import CrmKanbanPage from "@/modules/crm/KanbanPage"
import CrmDashboardPage from "@/modules/crm/DashboardPage"
import CrmClientsPage from "@/modules/crm/ClientsPage"
import CrmClientDetailPage from "@/modules/crm/ClientDetailPage"
import CrmAttendanceDetailPage from "@/modules/crm/AttendanceDetailPage"
import CrmCompaniesPage from "@/modules/crm/CompaniesPage"
import CrmCompanyDetailPage from "@/modules/crm/CompanyDetailPage"
import CrmNewAttendanceOpenRedirect from "@/modules/crm/NewAttendanceOpenRedirect"
import CrmConfigPage from "@/modules/crm/config/ConfigPage"
import CrmFunnelsConfigPage from "@/modules/crm/config/FunnelsConfigPage"
import CrmStatusConfigPage from "@/modules/crm/config/StatusConfigPage"
import CrmChannelsConfigPage from "@/modules/crm/config/ChannelsConfigPage"
import CrmAutomationsConfigPage from "@/modules/crm/config/AutomationsConfigPage"
import CrmFollowUpConfigPage from "@/modules/crm/config/FollowUpConfigPage"
import CrmReactivationConfigPage from "@/modules/crm/config/ReactivationConfigPage"
import CrmProposalsListPage from "@/modules/crm/proposals/ProposalsListPage"
import CrmNewProposalPage from "@/modules/crm/proposals/NewProposalPage"
import CrmProposalDetailPage from "@/modules/crm/proposals/ProposalDetailPage"
import CrmProposalPrintView from "@/modules/crm/proposals/ProposalPrintView"
import CrmProposalsDashboardPage from "@/modules/crm/proposals/DashboardPage"
import CrmProposalTemplatesPage from "@/modules/crm/proposals/ProposalTemplatesPage"
import CrmContractsListPage from "@/modules/crm/proposals/ContractsListPage"
import CrmContractDetailPage from "@/modules/crm/proposals/ContractDetailPage"

// ── Estoque ───────────────────────────────────────────────────────────
import EstoqueLayout from "@/modules/estoque/EstoqueLayout"
import EstoqueDashboardPage from "@/modules/estoque/DashboardPage"
import EstoqueProductsPage from "@/modules/estoque/ProductsPage"
import EstoqueProductDetailPage from "@/modules/estoque/ProductDetailPage"
import EstoqueProductTypesPage from "@/modules/estoque/ProductTypesPage"
import EstoqueCategoriesPage from "@/modules/estoque/CategoriesPage"
import EstoqueWarehousesPage from "@/modules/estoque/WarehousesPage"
import EstoqueSuppliersPage from "@/modules/estoque/SuppliersPage"
import EstoqueStockPage from "@/modules/estoque/StockPage"
import EstoqueMovementsPage from "@/modules/estoque/MovementsPage"
import EstoqueBatchesPage from "@/modules/estoque/BatchesPage"
import EstoqueSerialsPage from "@/modules/estoque/SerialsPage"
import EstoqueConfigPage from "@/modules/estoque/ConfigPage"

// ── PDV ───────────────────────────────────────────────────────────────
import PdvLayout from "@/modules/pdv/PdvLayout"
import PdvPosPage from "@/modules/pdv/PosPage"
import PdvCashSessionPage from "@/modules/pdv/CashSessionPage"
import PdvSalesHistoryPage from "@/modules/pdv/SalesHistoryPage"
import PdvSaleDetailPage from "@/modules/pdv/SaleDetailPage"
import PdvReceiptPrintView from "@/modules/pdv/ReceiptPrintView"
import PdvDashboardPage from "@/modules/pdv/DashboardPage"
import PdvPaymentMethodsConfigPage from "@/modules/pdv/PaymentMethodsConfigPage"
import ProjetosLayout from "@/modules/projetos/ProjetosLayout"
import ProjectBoardPage from "@/modules/projetos/ProjectBoardPage"
import ProjectConfigHomePage from "@/modules/projetos/config/ProjectConfigHomePage"
import ProjectDemandTypesConfigPage from "@/modules/projetos/config/ProjectDemandTypesConfigPage"
import ProjectDemandTypeFormEditorPage from "@/modules/projetos/config/ProjectDemandTypeFormEditorPage"
import ProjectFunnelsConfigPage from "@/modules/projetos/config/ProjectFunnelsConfigPage"
import ProjectStatusesConfigPage from "@/modules/projetos/config/ProjectStatusesConfigPage"
import ProjectConfigPage from "@/modules/projetos/ProjectConfigPage"
import BasicNewRequestPage from "@/modules/projetos/basic/BasicNewRequestPage"
import BasicMyRequestsPage from "@/modules/projetos/basic/BasicMyRequestsPage"
import GanttPage from "@/modules/projetos/GanttPage"
import ProjetosReportsPage from "@/modules/projetos/ReportsPage"
import ProjectScheduleConfigPage from "@/modules/projetos/config/ProjectScheduleConfigPage"

// ── TeamOps ───────────────────────────────────────────────────────────
import TeamopsLayout from "@/modules/teamops/TeamopsLayout"
import TeamopsDashboardPage from "@/modules/teamops/DashboardPage"
import TeamopsOrgPage from "@/modules/teamops/OrgPage"
import TeamopsPeoplePage from "@/modules/teamops/PeoplePage"
import TeamopsPersonDetailPage from "@/modules/teamops/PersonDetailPage"
import TeamopsStacksPage from "@/modules/teamops/StacksPage"
import TeamopsAbsencesPage from "@/modules/teamops/AbsencesPage"
import TeamopsConfigPage from "@/modules/teamops/ConfigPage"

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-0 flex-1 flex-col">
        <ThemeProvider>
          <AuthProvider>
            <ErrorBoundary>
              <Routes>
              {/* Público */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
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

                    <Route path="config" element={<CrmConfigPage />} />
                    <Route path="config/funnels" element={<CrmFunnelsConfigPage />} />
                    <Route path="config/statuses" element={<CrmStatusConfigPage />} />
                    <Route path="config/channels" element={<CrmChannelsConfigPage />} />
                    <Route path="config/automations" element={<CrmAutomationsConfigPage />} />
                    <Route path="config/follow-ups" element={<CrmFollowUpConfigPage />} />
                    <Route path="config/reactivation" element={<CrmReactivationConfigPage />} />
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
                    <Route path="relatorios" element={<ProjetosReportsPage />} />
                    <Route path="solicitacoes" element={<BasicNewRequestPage />} />
                    <Route path="minhas" element={<BasicMyRequestsPage />} />
                    <Route path=":projectId/board" element={<ProjectBoardPage />} />
                    <Route path=":projectId/lista" element={<ProjectBoardPage />} />
                    <Route path=":projectId/calendario" element={<ProjectBoardPage />} />
                    <Route path=":projectId/gantt" element={<GanttPage />} />
                    <Route path="config" element={<ProjectConfigHomePage />} />
                    <Route path="config/processos" element={<ProjectConfigPage />} />
                    <Route path="config/demand-types" element={<ProjectDemandTypesConfigPage />} />
                    <Route path="config/demand-types/:demandTypeId" element={<ProjectDemandTypeFormEditorPage />} />
                    <Route path="config/funnels" element={<ProjectFunnelsConfigPage />} />
                    <Route path="config/statuses" element={<ProjectStatusesConfigPage />} />
                    <Route path="config/cronograma" element={<ProjectScheduleConfigPage />} />
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
                    <Route path="config"         element={<EstoqueConfigPage />} />
                    <Route path="product-types"  element={<EstoqueProductTypesPage />} />
                    <Route path="categories"     element={<EstoqueCategoriesPage />} />
                    <Route path="warehouses"     element={<EstoqueWarehousesPage />} />
                    <Route path="suppliers"      element={<EstoqueSuppliersPage />} />
                  </Route>

                  {/* TeamOps */}
                  <Route path="modules/teamops" element={<TeamopsLayout />}>
                    <Route index element={<TeamopsDashboardPage />} />
                    <Route path="org"           element={<TeamopsOrgPage />} />
                    <Route path="people"        element={<TeamopsPeoplePage />} />
                    <Route path="people/:personId" element={<TeamopsPersonDetailPage />} />
                    <Route path="stacks"        element={<TeamopsStacksPage />} />
                    <Route path="absences"      element={<TeamopsAbsencesPage />} />
                    <Route path="config"        element={<TeamopsConfigPage />} />
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
                    <Route path="config"     element={<PdvPaymentMethodsConfigPage />} />
                  </Route>
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<RoleRedirect />} />
            </Routes>
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
