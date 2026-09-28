import { NavLink, Outlet } from "react-router-dom"
import { Settings } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/ds"
import { settingsNav } from "@/modules/crm/admin/settingsNav"

export default function SettingsLayout() {
  const { user } = useAuth()
  const isAdmin = user?.role === "company_admin" || user?.role === "super_admin"
  const visible = settingsNav.filter(t => !t.adminOnly || isAdmin)

  return (
    <div className="flex min-h-0 h-full flex-col gap-5">
      <PageHeader
        icon={Settings}
        color="#4F46E5"
        title="Configurações"
        description="Gerencie sua conta, empresa, usuários e funções."
      />

      {/* Sub-nav: abas sublinhadas no mesmo desenho do DetailTabs do Portal */}
      <nav className="border-b" aria-label="Configurações">
        <div className="-mb-px flex overflow-x-auto scrollbar-none">
          {visible.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/app/settings"}
              className={({ isActive }) =>
                cn(
                  "inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </div>
    </div>
  )
}
