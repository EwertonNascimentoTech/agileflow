import { NavLink, Outlet } from "react-router-dom"
import { KanbanSquare, Users, Building2, Settings2, BarChart3, TrendingUp, GitBranch, ClipboardList } from "lucide-react"
import { cn } from "@/lib/utils"
import { NewAttendanceModalProvider } from "./newAttendanceModal"

const tabs = [
  { to: "/app/modules/atendimento/dashboard",    icon: BarChart3,    label: "Dashboard" },
  { to: "/app/modules/atendimento/kanban",       icon: KanbanSquare, label: "Kanban" },
  { to: "/app/modules/atendimento/clients",      icon: Users,        label: "Contatos" },
  { to: "/app/modules/atendimento/companies",    icon: Building2,    label: "Empresas" },
  { to: "/app/modules/atendimento/forecast",     icon: TrendingUp,   label: "Forecast" },
  { to: "/app/modules/atendimento/conversion",   icon: GitBranch,    label: "Conversão" },
  { to: "/app/modules/atendimento/productivity", icon: ClipboardList, label: "Produtividade" },
  { to: "/app/modules/atendimento/config",       icon: Settings2,    label: "Config" },
]

export default function AtendimentoLayout() {
  return (
    <NewAttendanceModalProvider>
      <div className="flex min-h-0 flex-col h-full gap-4">
      {/* Sub-nav — scroll horizontal no mobile com fade no fim */}
      <div className="relative">
        <div className="flex overflow-x-auto scrollbar-none border-b -mx-4 px-4 md:-mx-6 md:px-6 gap-0">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
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
        {/* Fade hint no mobile para indicar mais abas */}
        <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </div>
      </div>
    </NewAttendanceModalProvider>
  )
}
