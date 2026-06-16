import { useEffect, useMemo, useState } from "react"
import { Outlet, useNavigate, useLocation, useSearchParams } from "react-router-dom"
import * as Icons from "lucide-react"
import {
  LayoutDashboard, Package, Menu, Settings, Search, Moon, Sun, ChevronRight, ClipboardList, CirclePlus,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/contexts/ThemeContext"
import { companyApi, type ActiveModule } from "@/api/crm"
import { projetosApi } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { NotificationBell } from "@/components/NotificationBell"
import { GlobalSearch } from "@/components/GlobalSearch"
import {
  moduleNavConfig, getActiveModuleSlug, firstAccessibleModuleRoute,
} from "@/modules/crm/moduleNavConfig"
import { settingsNav } from "@/modules/crm/admin/settingsNav"
import { canAccessModuleConfig, hasAnyPermission, isConfigNavPath } from "@/lib/permissions"
import { ModuleRail, type RailItem } from "@/modules/crm/shell/ModuleRail"
import { ContextualSidebar, type SidebarKanbanItem, type SidebarSection } from "@/modules/crm/shell/ContextualSidebar"

const homeSections: SidebarSection[] = [
  { to: "/app/dashboard", icon: LayoutDashboard, label: "Dashboard", end: true },
]

function resolveIcon(name: string | null | undefined): React.ElementType {
  if (!name) return Package
  const Comp = (Icons as unknown as Record<string, React.ElementType>)[name]
  return Comp ?? Package
}

// Slug do registry (crm/estoque/…) → prefixos de módulo nos códigos de permissão.
// crm é servido por dois módulos de permissão (atendimento + propostas_contratos).
const MODULE_PERM_SLUGS: Record<string, string[]> = {
  crm: ["atendimento", "propostas_contratos"],
}

/** Usuário enxerga o módulo se tem ["*"] ou ≥1 permissão em algum prefixo do módulo. */
function canSeeModule(permissions: string[] | undefined, slug: string): boolean {
  if (!permissions || permissions.length === 0) return false
  if (permissions.includes("*")) return true
  const prefixes = MODULE_PERM_SLUGS[slug] ?? [slug]
  return permissions.some((code) => prefixes.some((p) => code.startsWith(p + ".")))
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [modules, setModules] = useState<ActiveModule[]>([])
  const [kanbanItems, setKanbanItems] = useState<SidebarKanbanItem[]>([])
  const [searchOpen, setSearchOpen] = useState(false)

  const isAdmin = user?.role === "company_admin" || user?.role === "super_admin"
  // Nome da role vem no payload do usuário autenticado (/auth/me) — não depende de endpoint admin.
  const userRoleName = useMemo(() => (user?.role_name ?? "").trim().toLowerCase(), [user])
  const isBasicUser =
    user?.role === "company_user" &&
    (userRoleName === "basic" || userRoleName === "")
  const activeModuleSlug = getActiveModuleSlug(location.pathname)
  const inSettings = location.pathname.startsWith("/app/settings")
  const activeModule = activeModuleSlug ? modules.find(m => m.slug === activeModuleSlug) : null
  const activeProjectIdFromPath = useMemo(() => {
    const match = location.pathname.match(/^\/app\/modules\/projetos\/([^/]+)\//)
    return match?.[1] ?? null
  }, [location.pathname])
  const hasProjetosModule = modules.some((m) => m.slug === "projetos")
  const basicNewRequestRoute = hasProjetosModule ? "/app/modules/projetos/solicitacoes" : "/app/modules/crm/attendances/new"
  const basicMyRequestsRoute = hasProjetosModule ? "/app/modules/projetos/minhas" : "/app/modules/crm/kanban"
  // Abrir/acompanhar solicitações é funcionalidade básica de TODO usuário. Quem já enxerga o
  // módulo Processos acessa pelos itens do próprio módulo; quem NÃO enxerga ganha um atalho
  // dedicado "Solicitações" no rail (com uma sidebar mínima: Nova + Minhas).
  // Coordenadores (cargo TeamOps) sempre ganham o atalho, mantendo seus demais módulos.
  const isCoordenador = (user?.position_slug ?? "") === "coordenador"
  const canSeeProjetos = isAdmin || canSeeModule(user?.permissions, "projetos")
  const needsSolicitacoesShortcut = !isBasicUser && hasProjetosModule && (!canSeeProjetos || isCoordenador)
  const inSolicitacoes =
    location.pathname.startsWith(basicNewRequestRoute) || location.pathname.startsWith(basicMyRequestsRoute)
  const activeFunnelIdFromQuery = searchParams.get("funnel")
  const activeKanban = useMemo(() => {
    if (activeFunnelIdFromQuery) {
      return kanbanItems.find((k) => k.id === activeFunnelIdFromQuery) ?? null
    }
    if (activeProjectIdFromPath) {
      return kanbanItems.find((k) => k.projectId === activeProjectIdFromPath) ?? null
    }
    return null
  }, [kanbanItems, activeFunnelIdFromQuery, activeProjectIdFromPath])

  // Chave ativa do rail
  const activeKey = isBasicUser
    ? "home"
    : needsSolicitacoesShortcut && inSolicitacoes
      ? "solicitacoes"
      : (activeModuleSlug ?? (inSettings ? "settings" : "home"))

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

  useEffect(() => {
    if (activeModuleSlug !== "projetos") return
    async function loadActiveKanbans() {
      try {
        const projects = await projetosApi.listProjects(true)
        const rows = await Promise.all(
          projects.map(async (project) => {
            const funnels = await projetosApi.listFunnels(project.id, true)
            return [...funnels]
              .sort((a, b) => a.order - b.order)
              .map((funnel) => ({
                id: funnel.id,
                name: funnel.name,
                color: funnel.color,
                projectId: project.id,
              }))
          })
        )
        setKanbanItems(rows.flat())
      } catch {
        setKanbanItems([])
      }
    }
    loadActiveKanbans()
  }, [activeModuleSlug])


  function handleLogout() {
    logout()
    navigate("/login", { replace: true })
  }

  const closeSidebar = () => setSidebarOpen(false)

  // Itens do rail: Visão geral + módulos da API + Configurações (rodapé)
  const railItems: RailItem[] = useMemo(() => {
    if (isBasicUser) {
      return [
        { key: "home", label: "Solicitações", icon: ClipboardList, to: basicMyRequestsRoute },
      ]
    }

    // Admin vê tudo (["*"]); demais só os módulos onde o cargo tem ≥1 permissão.
    const visibleModules = isAdmin
      ? modules
      : modules.filter((m) => canSeeModule(user?.permissions, m.slug))

    const items: RailItem[] = [
      { key: "home", label: "Visão geral", icon: LayoutDashboard, to: "/app/dashboard" },
      ...(needsSolicitacoesShortcut
        ? [{ key: "solicitacoes", label: "Solicitações", icon: ClipboardList, to: basicMyRequestsRoute }]
        : []),
      ...visibleModules.map(m => ({
        key: m.slug,
        label: m.name,
        icon: resolveIcon(m.icon),
        to: firstAccessibleModuleRoute(m.slug, user?.permissions, isAdmin),
        color: m.color,
      })),
      { key: "settings", label: "Configurações", icon: Settings, to: "/app/settings", pinBottom: true },
    ]
    return items
  }, [isBasicUser, isAdmin, modules, user?.permissions, basicMyRequestsRoute, needsSolicitacoesShortcut])

  // Cabeçalho + seções da sidebar conforme o contexto ativo
  const { sidebarTitle, sidebarIcon, sidebarColor, sections } = useMemo(() => {
    if (isBasicUser) {
      return {
        sidebarTitle: "Solicitações",
        sidebarIcon: ClipboardList as React.ElementType,
        sidebarColor: undefined,
        sections: [
          { to: basicNewRequestRoute, icon: CirclePlus, label: "Nova Solicitação" },
          { to: basicMyRequestsRoute, icon: ClipboardList, label: "Minhas Solicitações" },
        ],
      }
    }

    // Usuário sem o módulo Processos, mas acessando o fluxo básico de Solicitações:
    // sidebar mínima (Nova + Minhas), sem o restante do módulo.
    if (needsSolicitacoesShortcut && inSolicitacoes) {
      return {
        sidebarTitle: "Solicitações",
        sidebarIcon: ClipboardList as React.ElementType,
        sidebarColor: undefined,
        sections: [
          { to: basicNewRequestRoute, icon: CirclePlus, label: "Nova Solicitação" },
          { to: basicMyRequestsRoute, icon: ClipboardList, label: "Minhas Solicitações" },
        ],
      }
    }

    if (activeModuleSlug) {
      const navItems = (moduleNavConfig[activeModuleSlug] ?? []).filter((item) => {
        if (isConfigNavPath(item.to)) {
          return isAdmin || canAccessModuleConfig(user?.permissions, activeModuleSlug)
        }
        // Itens com permissão exigida só aparecem se a função tiver alguma delas.
        if (item.requiredAnyPermission && !isAdmin) {
          return hasAnyPermission(user?.permissions, item.requiredAnyPermission)
        }
        return true
      })
      return {
        sidebarTitle: activeModule?.name ?? activeModuleSlug,
        sidebarIcon: resolveIcon(activeModule?.icon),
        sidebarColor: activeModule?.color as string | undefined,
        sections: navItems,
      }
    }
    if (inSettings) {
      return {
        sidebarTitle: "Configurações",
        sidebarIcon: Settings as React.ElementType,
        sidebarColor: undefined,
        sections: settingsNav
          .filter(t => !t.adminOnly || isAdmin)
          .map(t => ({ ...t, end: t.to === "/app/settings" })),
      }
    }
    return {
      sidebarTitle: "Visão geral",
      sidebarIcon: LayoutDashboard as React.ElementType,
      sidebarColor: undefined,
      sections: homeSections,
    }
  }, [activeModuleSlug, activeModule, inSettings, isAdmin, isBasicUser, basicNewRequestRoute, basicMyRequestsRoute, user?.permissions, needsSolicitacoesShortcut, inSolicitacoes])

  // Seção atual (para o breadcrumb) — match mais específico vence
  const currentSectionLabel = useMemo(() => {
    const normalizedPath = location.pathname.replace(/^\/app\/modules\/projetos\/[^/]+\//, "/app/modules/projetos/")
    const match = [...sections]
      .sort((a, b) => b.to.length - a.to.length)
      .find(s => normalizedPath === s.to || normalizedPath.startsWith(s.to + "/"))
    return match?.label
  }, [sections, location.pathname])

  const initials = user?.full_name
    ?.split(" ")
    .slice(0, 2)
    .map(n => n[0])
    .join("")
    .toUpperCase() ?? "?"

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={closeSidebar} />
      )}

      {/* Rail + sidebar: drawer único no mobile, lado a lado no desktop */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex transition-transform duration-200 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <ModuleRail items={railItems} activeKey={activeKey} onNavigate={closeSidebar} />
        <ContextualSidebar
          title={sidebarTitle}
          icon={sidebarIcon}
          color={sidebarColor}
          sections={sections}
          kanbanItems={activeModuleSlug === "projetos" ? kanbanItems : undefined}
          activeKanbanId={activeKanban?.id}
          onKanbanSelect={(kanban) =>
            navigate(`/app/modules/projetos/${kanban.projectId}/board?funnel=${kanban.id}`)
          }
          user={{ name: user?.full_name ?? "", email: user?.email ?? "", initials }}
          onLogout={handleLogout}
          onNavigate={closeSidebar}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="lg:hidden">
            <Menu size={18} />
          </Button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{sidebarTitle}</span>
            {activeModuleSlug === "projetos" && activeKanban?.name && (
              <>
                <ChevronRight size={15} className="text-muted-foreground" />
                <span className="font-medium">{activeKanban.name}</span>
              </>
            )}
            {currentSectionLabel && (
              <>
                <ChevronRight size={15} className="text-muted-foreground" />
                <span className="font-medium">{currentSectionLabel}</span>
              </>
            )}
          </div>

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

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
