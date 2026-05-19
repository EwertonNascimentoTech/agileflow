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
import PlansPage from "@/modules/super-admin/PlansPage"
import AdminModulesPage from "@/modules/super-admin/ModulesPage"
import AdminsPage from "@/modules/super-admin/AdminsPage"

// ── Company ───────────────────────────────────────────────────────────
import CompanyLayout from "@/modules/company/CompanyLayout"
import CompanyDashboardPage from "@/modules/company/DashboardPage"
import UsersPage from "@/modules/company/UsersPage"
import RolesPage from "@/modules/company/RolesPage"
import ModulesPage from "@/modules/company/ModulesPage"
import SettingsPage from "@/modules/company/SettingsPage"

// ── Atendimento ───────────────────────────────────────────────────────
import AtendimentoLayout from "@/modules/atendimento/AtendimentoLayout"
import AtendimentoDashboardPage from "@/modules/atendimento/DashboardPage"
import KanbanPage from "@/modules/atendimento/KanbanPage"
import NewAttendanceOpenRedirect from "@/modules/atendimento/NewAttendanceOpenRedirect"
import AttendanceDetailPage from "@/modules/atendimento/AttendanceDetailPage"
import ClientsPage from "@/modules/atendimento/ClientsPage"
import ClientDetailPage from "@/modules/atendimento/ClientDetailPage"
import CompaniesPage from "@/modules/atendimento/CompaniesPage"
import CompanyDetailPage from "@/modules/atendimento/CompanyDetailPage"
import ConfigPage from "@/modules/atendimento/config/ConfigPage"
import FunnelsConfigPage from "@/modules/atendimento/config/FunnelsConfigPage"
import StatusConfigPage from "@/modules/atendimento/config/StatusConfigPage"
import ChannelsConfigPage from "@/modules/atendimento/config/ChannelsConfigPage"
import AutomationsConfigPage from "@/modules/atendimento/config/AutomationsConfigPage"
import FollowUpConfigPage from "@/modules/atendimento/config/FollowUpConfigPage"
import ForecastPage from "@/modules/atendimento/ForecastPage"
import ConversionFunnelPage from "@/modules/atendimento/ConversionFunnelPage"
import ProductivityReportPage from "@/modules/atendimento/ProductivityReportPage"
import RevenueReportPage from "@/modules/atendimento/RevenueReportPage"
import ReactivationConfigPage from "@/modules/atendimento/config/ReactivationConfigPage"

// ── Propostas e Contratos ─────────────────────────────────────────────
import ProposalsListPage from "@/modules/propostas_contratos/ProposalsListPage"
import NewProposalPage from "@/modules/propostas_contratos/NewProposalPage"
import ProposalDetailPage from "@/modules/propostas_contratos/ProposalDetailPage"
import ProposalPrintView from "@/modules/propostas_contratos/ProposalPrintView"
import ProposalTemplatesPage from "@/modules/propostas_contratos/ProposalTemplatesPage"
import PublicProposalPage from "@/modules/propostas_contratos/PublicProposalPage"
import ContractsListPage from "@/modules/propostas_contratos/ContractsListPage"
import ContractDetailPage from "@/modules/propostas_contratos/ContractDetailPage"
import ProposalsDashboardPage from "@/modules/propostas_contratos/DashboardPage"

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
import CrmForecastPage from "@/modules/crm/ForecastPage"
import CrmConversionFunnelPage from "@/modules/crm/ConversionFunnelPage"
import CrmProductivityReportPage from "@/modules/crm/ProductivityReportPage"
import CrmRevenueReportPage from "@/modules/crm/RevenueReportPage"
import CrmReactivationConfigPage from "@/modules/crm/config/ReactivationConfigPage"
import CrmProposalsListPage from "@/modules/crm/proposals/ProposalsListPage"
import CrmNewProposalPage from "@/modules/crm/proposals/NewProposalPage"
import CrmProposalDetailPage from "@/modules/crm/proposals/ProposalDetailPage"
import CrmProposalPrintView from "@/modules/crm/proposals/ProposalPrintView"
import CrmProposalsDashboardPage from "@/modules/crm/proposals/DashboardPage"
import CrmProposalTemplatesPage from "@/modules/crm/proposals/ProposalTemplatesPage"
import CrmContractsListPage from "@/modules/crm/proposals/ContractsListPage"
import CrmContractDetailPage from "@/modules/crm/proposals/ContractDetailPage"

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
                  <Route path="plans" element={<PlansPage />} />
                  <Route path="modules" element={<AdminModulesPage />} />
                  <Route path="admins" element={<AdminsPage />} />
                </Route>
              </Route>

              {/* Company */}
              <Route element={<ProtectedRoute allowedRoles={["company_admin", "company_user"]} />}>
                <Route path="/app" element={<CompanyLayout />}>
                  <Route index element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="dashboard" element={<CompanyDashboardPage />} />
                  <Route element={<ProtectedRoute allowedRoles={["super_admin", "company_admin"]} />}>
                    <Route path="users" element={<UsersPage />} />
                    <Route path="roles" element={<RolesPage />} />
                  </Route>
                  <Route path="modules" element={<ModulesPage />} />
                  <Route path="settings" element={<SettingsPage />} />

                  {/* Atendimento */}
                  <Route path="modules/atendimento" element={<AtendimentoLayout />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<AtendimentoDashboardPage />} />
                    <Route path="kanban" element={<KanbanPage />} />
                    <Route path="attendances" element={<Navigate to="kanban" replace />} />
                    <Route path="attendances/new" element={<NewAttendanceOpenRedirect />} />
                    <Route path="attendances/:id" element={<AttendanceDetailPage />} />
                    <Route path="clients" element={<ClientsPage />} />
                    <Route path="clients/:id" element={<ClientDetailPage />} />
                    <Route path="companies" element={<CompaniesPage />} />
                    <Route path="companies/:id" element={<CompanyDetailPage />} />
                    <Route path="config" element={<ConfigPage />} />
                    <Route path="config/funnels" element={<FunnelsConfigPage />} />
                    <Route path="config/statuses" element={<StatusConfigPage />} />
                    <Route path="config/channels" element={<ChannelsConfigPage />} />
                    <Route path="config/automations" element={<AutomationsConfigPage />} />
                    <Route path="config/follow-ups" element={<FollowUpConfigPage />} />
                    <Route path="forecast" element={<ForecastPage />} />
                    <Route path="conversion" element={<ConversionFunnelPage />} />
                    <Route path="productivity" element={<ProductivityReportPage />} />
                    <Route path="revenue" element={<RevenueReportPage />} />
                    <Route path="config/reactivation" element={<ReactivationConfigPage />} />
                  </Route>

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
                    <Route path="forecast" element={<CrmForecastPage />} />
                    <Route path="conversion" element={<CrmConversionFunnelPage />} />
                    <Route path="productivity" element={<CrmProductivityReportPage />} />
                    <Route path="revenue" element={<CrmRevenueReportPage />} />
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

                  {/* Propostas e Contratos */}
                  <Route path="modules/propostas_contratos">
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<ProposalsDashboardPage />} />
                    <Route path="proposals" element={<ProposalsListPage />} />
                    <Route path="proposals/new" element={<NewProposalPage />} />
                    <Route path="proposals/:id" element={<ProposalDetailPage />} />
                    <Route path="proposals/:id/print" element={<ProposalPrintView />} />
                    <Route path="templates" element={<ProposalTemplatesPage />} />
                    <Route path="contracts" element={<ContractsListPage />} />
                    <Route path="contracts/:id" element={<ContractDetailPage />} />
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
