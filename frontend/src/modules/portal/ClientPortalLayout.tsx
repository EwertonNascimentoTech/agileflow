import { useState } from "react"
import { Link, NavLink, Outlet } from "react-router-dom"
import {
  Flag, FolderKanban, Layers, LayoutDashboard, LayoutGrid, LifeBuoy, LogOut, Menu, Moon, Sparkles, Sun, X,
} from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/contexts/ThemeContext"
import { Button } from "@/components/ui/button"
import { NotificationBell } from "@/components/NotificationBell"
import { initials } from "@/modules/portal/occurrenceUi"
import { PortalSearch } from "@/modules/portal/PortalSearch"
import { ClientModeBanner } from "@/modules/portal/ClientModeBanner"
import { PortalAssistant } from "@/modules/portal/PortalAssistant"

// `client`: só para quem é cliente (ocorrências e soluções são ações do cliente; a equipe em
// "modo cliente" vê o acompanhamento dos projetos).
const NAV = [
  { to: "/portal", label: "Visão geral", icon: LayoutDashboard, end: true, client: false },
  { to: "/portal/programas", label: "Programas", icon: Layers, end: false, client: false },
  { to: "/portal/projetos", label: "Projetos", icon: FolderKanban, end: false, client: false },
  { to: "/portal/entregas", label: "Entregas e Marcos", icon: Flag, end: false, client: false },
  { to: "/portal/ocorrencias", label: "Ocorrências", icon: LifeBuoy, end: false, client: true },
  { to: "/portal/solucoes-ia", label: "Soluções com IA", icon: Sparkles, end: false, client: true },
]

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  const isClient = !!(user?.is_client || user?.has_client_portal)
  return (
    <div className="flex h-full flex-col">
      <Link to="/portal" onClick={onNavigate} className="flex items-center gap-2.5 px-5 py-5" aria-label="Portal do Cliente — início">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-base font-bold">A</span>
        <span className="leading-none">
          <span className="block text-base font-bold tracking-tight">AgileFlow</span>
          <span className="mt-0.5 block text-[11px] text-white/60">Portal do Cliente</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-1 px-3" aria-label="Navegação do portal">
        {NAV.filter((n) => isClient || !n.client).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive ? "bg-white/15 font-medium text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <Icon size={17} className="shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 px-3 pb-5 pt-3">
        {!user?.is_client && (
          <Link
            to="/app/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/10 hover:text-white"
          >
            <LayoutGrid size={17} /> Voltar ao AgileFlow
          </Link>
        )}
        <p className="px-3 pt-2 text-[11px] leading-snug text-white/50">
          Dúvidas sobre o acesso? Fale com o Product Owner do seu projeto.
        </p>
      </div>
    </div>
  )
}

/** Casca do Portal do Cliente — menu lateral próprio, sem o menu do AgileFlow. */
export default function ClientPortalLayout() {
  const { user, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  // Equipe em "modo cliente" (não é cliente externo): faixa explicando o que está vendo.
  const teamView = !user?.is_client && !!user?.has_team_portal

  return (
    // shrink-0: dentro do #root (flex, altura 100%) a casca encolhia até a janela e o fundo parava no meio da rolagem.
    <div className="flex min-h-screen shrink-0 bg-muted/60 dark:bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 bg-rail text-rail-foreground print:hidden lg:block">
        <SideNav />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />
          <aside className="relative h-full w-64 bg-rail text-rail-foreground shadow-xl">
            <button
              className="absolute right-3 top-5 rounded-md p-1 text-white/70 hover:bg-white/10"
              onClick={() => setMenuOpen(false)}
              aria-label="Fechar menu"
            >
              <X size={18} />
            </button>
            <SideNav onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
          <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-2 px-4 md:px-6">
            <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
              <Menu size={18} />
            </Button>
            <PortalSearch />
            <div className="flex-1" />
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme} aria-label="Alternar tema" title="Alternar tema">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
            <NotificationBell />
            <div className="ml-1 flex items-center gap-2 border-l pl-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                aria-hidden
              >
                {initials(user?.full_name)}
              </span>
              <span className="hidden max-w-[180px] leading-tight md:block">
                <span className="block truncate text-sm font-medium" title={user?.full_name ?? undefined}>{user?.full_name}</span>
                <span className="block text-[11px] text-muted-foreground">{teamView ? "Modo cliente" : "Cliente"}</span>
              </span>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={logout} aria-label="Sair" title="Sair">
                <LogOut size={16} />
              </Button>
            </div>
          </div>
        </header>
        {teamView && (
          <div className="border-b bg-primary/5 print:hidden">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-2 md:px-6">
              <ClientModeBanner backLink />
            </div>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 md:px-6 md:py-6">
          <Outlet />
        </main>
      </div>
      <PortalAssistant />
    </div>
  )
}
