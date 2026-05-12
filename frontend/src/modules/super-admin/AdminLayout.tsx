import { useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  Building2, CreditCard, LayoutDashboard, LogOut,
  Menu, Package, ShieldCheck, X,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/tenants",   icon: Building2,       label: "Empresas" },
  { to: "/admin/plans",     icon: CreditCard,      label: "Planos" },
  { to: "/admin/modules",   icon: Package,         label: "Módulos" },
  { to: "/admin/admins",    icon: ShieldCheck,     label: "Super Admins" },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate("/login", { replace: true })
  }

  return (
    <div className="flex h-screen min-h-0 bg-muted/40 overflow-hidden">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-background border-r transition-transform duration-200 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2.5 px-4 border-b">
          <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
            K
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Kore</p>
            <p className="text-[10px] text-muted-foreground">Super Admin</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={14} />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer do sidebar */}
        <div className="p-3 border-t space-y-1">
          <Separator className="mb-2" />
          <div className="px-3 py-1">
            <p className="text-xs font-medium truncate">{user?.full_name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Topbar mobile */}
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu size={18} />
          </Button>
          <span className="font-semibold text-sm">Kore Admin</span>
        </header>

        {/* Conteúdo */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
