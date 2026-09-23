import { NavLink, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"
import { settingsNav } from "@/modules/crm/admin/settingsNav"

export default function SettingsLayout() {
  const { user } = useAuth()
  const isAdmin = user?.role === "company_admin" || user?.role === "super_admin"
  const visible = settingsNav.filter(t => !t.adminOnly || isAdmin)

  return (
    <div className="flex min-h-0 h-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gerencie sua conta, empresa, usuários e funções.</p>
      </div>

      {/* Sub-nav */}
      <div className="relative">
        <div className="flex overflow-x-auto scrollbar-none border-b -mx-4 px-4 md:-mx-6 md:px-6 gap-0">
          {visible.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/app/settings"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap shrink-0 transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                )
              }
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </div>
    </div>
  )
}
