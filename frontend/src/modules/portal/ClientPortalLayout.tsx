import { Link, NavLink, Outlet } from "react-router-dom"
import { Home, LayoutGrid, LifeBuoy, LogOut, Moon, Sun } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/contexts/ThemeContext"
import { Button } from "@/components/ui/button"
import { NotificationBell } from "@/components/NotificationBell"
import { initials } from "@/modules/portal/occurrenceUi"

const NAV = [
  { to: "/portal", label: "Meus projetos", icon: Home, end: true },
  { to: "/portal/ocorrencias", label: "Ocorrências", icon: LifeBuoy, end: false },
]

/** Casca do Portal do Cliente (Operação Assistida) — sem o menu do AgileFlow. */
export default function ClientPortalLayout() {
  const { user, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()

  return (
    // shrink-0: dentro do #root (flex, altura 100%) a casca encolhia até a janela e o fundo parava no meio da rolagem.
    <div className="flex min-h-screen shrink-0 flex-col bg-muted/60 dark:bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 md:px-6">
          <Link to="/portal" className="mr-2 flex shrink-0 items-center gap-2" aria-label="Portal do Cliente — início">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              A
            </span>
            <span className="hidden leading-none sm:block">
              <span className="block text-sm font-bold tracking-tight">AgileFlow</span>
              <span className="block text-[11px] text-muted-foreground">Portal do Cliente</span>
            </span>
          </Link>

          <nav className="flex h-full items-stretch gap-1 text-sm" aria-label="Navegação do portal">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                aria-label={label}
                title={label}
                className={({ isActive }) =>
                  `relative flex items-center gap-1.5 px-2.5 transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full ${
                    isActive
                      ? "font-medium text-foreground after:bg-primary"
                      : "text-muted-foreground after:bg-transparent hover:text-foreground"
                  }`
                }
              >
                <Icon size={15} className="shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex-1" />

          {!user?.is_client && (
            <Button asChild variant="ghost" size="sm" className="hidden gap-1.5 text-muted-foreground md:inline-flex">
              <Link to="/app/dashboard">
                <LayoutGrid size={14} /> AgileFlow
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme} aria-label="Alternar tema" title="Alternar tema">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
          <NotificationBell />
          <div className="ml-1 flex items-center gap-2 border-l pl-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              aria-hidden
            >
              {initials(user?.full_name)}
            </span>
            <span className="hidden max-w-[160px] truncate text-sm md:block" title={user?.full_name ?? undefined}>
              {user?.full_name}
            </span>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={logout} aria-label="Sair" title="Sair">
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-8">
        <Outlet />
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-center text-[11px] text-muted-foreground md:px-6">
        Dúvidas sobre o acesso? Fale com o Product Owner do seu projeto.
      </footer>
    </div>
  )
}
