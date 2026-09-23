import { Link, NavLink, Outlet } from "react-router-dom"
import { LayoutGrid, LogOut, Moon, Sun } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/contexts/ThemeContext"
import { Button } from "@/components/ui/button"
import { NotificationBell } from "@/components/NotificationBell"

/** Casca do Portal do Cliente (Operação Assistida) — sem o menu do AgileFlow. */
export default function ClientPortalLayout() {
  const { user, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center gap-3 border-b px-4 md:px-6">
        <Link to="/portal" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            A
          </span>
          <span className="hidden font-semibold tracking-tight sm:inline">Portal do Cliente</span>
        </Link>
        <nav className="ml-2 flex items-center gap-1 text-sm">
          {[
            { to: "/portal", label: "Meus projetos", end: true },
            { to: "/portal/ocorrencias", label: "Ocorrências", end: false },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-2.5 py-1.5 ${isActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1" />
        {!user?.is_client && (
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Link to="/app/dashboard">
              <LayoutGrid size={14} /> AgileFlow
            </Link>
          </Button>
        )}
        <span className="hidden text-sm text-muted-foreground sm:inline">{user?.full_name}</span>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme} aria-label="Alternar tema">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
        <NotificationBell />
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={logout} aria-label="Sair" title="Sair">
          <LogOut size={16} />
        </Button>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  )
}
