import { useEffect, useState } from "react"
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom"
import * as Icons from "lucide-react"
import {
  LayoutDashboard, Package, Grid3X3,
  LogOut, Menu, X, Settings, Search, Moon, Sun, ChevronLeft,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/contexts/ThemeContext"
import { companyApi, type ActiveModule } from "@/api/crm"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { NotificationBell } from "@/components/NotificationBell"
import { GlobalSearch } from "@/components/GlobalSearch"
import { moduleNavConfig, getActiveModuleSlug, type ModuleNavItem } from "@/modules/crm/moduleNavConfig"

type NavItem = { to: string; icon: React.ElementType; label: string; adminOnly?: boolean }

const homeNavItems: NavItem[] = [
  { to: "/app/dashboard", icon: LayoutDashboard, label: "Dashboard" },
]

const tailNavItems = [
  { to: "/app/settings", icon: Settings, label: "Configurações" },
]

function resolveIcon(name: string | null | undefined): React.ElementType {
  if (!name) return Package
  const Comp = (Icons as unknown as Record<string, React.ElementType>)[name]
  return Comp ?? Package
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [modules, setModules] = useState<ActiveModule[]>([])
  const [searchOpen, setSearchOpen] = useState(false)

  const activeModuleSlug = getActiveModuleSlug(location.pathname)
  const activeModule = activeModuleSlug ? modules.find(m => m.slug === activeModuleSlug) : null
  const moduleItems: ModuleNavItem[] = activeModuleSlug ? (moduleNavConfig[activeModuleSlug] ?? []) : []
  const inModule = !!activeModuleSlug

  // Cmd+K global search shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  useEffect(() => {
    companyApi.getMyTenant()
      .then(t => setModules(t?.active_modules ?? []))
      .catch(() => setModules([]))
  }, [])

  function handleLogout() {
    logout()
    navigate("/login", { replace: true })
  }

  const initials = user?.full_name
    .split(" ")
    .slice(0, 2)
    .map(n => n[0])
    .join("")
    .toUpperCase() ?? "?"

  return (
    <div className="flex h-screen min-h-0 bg-muted/40 overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-background border-r transition-transform duration-200 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Topo da sidebar — exibe nome do módulo ativo OU Kore */}
        <div className="flex h-14 items-center gap-2.5 px-4 border-b">
          {inModule && activeModule ? (
            <>
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: activeModule.color }}
              >
                {(() => {
                  const Icon = resolveIcon(activeModule.icon)
                  return <Icon size={16} />
                })()}
              </div>
              <div className="leading-tight flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{activeModule.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">Módulo</p>
              </div>
            </>
          ) : (
            <>
              <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                K
              </div>
              <div className="leading-tight flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">Kore</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {user?.role === "company_admin" ? "Admin" : "Usuário"}
                </p>
              </div>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 lg:hidden shrink-0"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={14} />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {inModule ? (
            <>
              {/* Botão voltar para Home */}
              <NavLink
                to="/app/dashboard"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors mb-1"
              >
                <ChevronLeft size={14} />
                Voltar para Módulos
              </NavLink>

              {/* Itens do módulo ativo */}
              {moduleItems.map(({ to, icon: Icon, label }) => (
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
            </>
          ) : (
            <>
              {/* Modo home: dashboard + módulos disponíveis */}
              {homeNavItems
                .filter(item => !item.adminOnly || user?.role === "company_admin" || user?.role === "super_admin")
                .map(({ to, icon: Icon, label }) => (
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

              {modules.length > 0 && (
                <>
                  <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                    Meus Módulos
                  </p>
                  {modules.map((m) => {
                    const Icon = resolveIcon(m.icon)
                    return (
                      <NavLink
                        key={m.slug}
                        to={`/app/modules/${m.slug}`}
                        onClick={() => setSidebarOpen(false)}
                        className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <span
                          className="h-5 w-5 rounded-md flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${m.color}1a`, color: m.color }}
                        >
                          <Icon size={12} />
                        </span>
                        {m.name}
                      </NavLink>
                    )
                  })}
                </>
              )}

              <div className="pt-3">
                {tailNavItems.map(({ to, icon: Icon, label }) => (
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
              </div>
            </>
          )}
        </nav>

        <div className="p-3 border-t space-y-1">
          <Separator className="mb-2" />
          <div className="flex items-center gap-2.5 px-3 py-1">
            <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user?.full_name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
            </div>
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

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="lg:hidden">
            <Menu size={18} />
          </Button>
          <span className="font-semibold text-sm lg:hidden">Kore</span>

          {/* Botão Módulos no topo — sempre visível, volta para o dashboard */}
          <Button
            variant={inModule ? "outline" : "ghost"}
            size="sm"
            onClick={() => navigate("/app/dashboard")}
            className="h-9 gap-1.5"
          >
            <Grid3X3 size={15} />
            <span className="hidden sm:inline">Módulos</span>
          </Button>

          <div className="flex-1" />

          {/* Search trigger */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 text-muted-foreground h-8 px-3 border rounded-md text-xs"
          >
            <Search size={13} />
            <span>Buscar</span>
            <kbd className="hidden md:inline-flex h-4 px-1 rounded border text-[10px] bg-muted">⌘K</kbd>
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:hidden" onClick={() => setSearchOpen(true)} aria-label="Buscar" title="Buscar (Cmd+K)">
            <Search size={16} />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme} aria-label="Alternar tema">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
          <NotificationBell />
        </header>
        {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}

        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
