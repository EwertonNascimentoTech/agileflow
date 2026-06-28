import { NavLink, useLocation } from "react-router-dom"
import { useState, type ElementType } from "react"
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "@/lib/utils"

const COLLAPSE_KEY = "shell.sidebar.collapsed"

export type SidebarSection = {
  to: string
  icon: ElementType
  label: string
  /** marca correspondência exata (ex: rota índice de Configurações) */
  end?: boolean
}

export type SidebarKanbanItem = {
  id: string
  name: string
  color?: string
  projectId: string
}

/**
 * Coluna 2 do shell — sidebar contextual (w-60).
 * Mostra o cabeçalho do contexto ativo + suas seções + card do usuário.
 */
export function ContextualSidebar({
  title,
  icon: Icon,
  color,
  sections,
  kanbanItems,
  activeKanbanId,
  onKanbanSelect,
  user,
  onLogout,
  onNavigate,
}: {
  title: string
  icon: ElementType
  color?: string
  sections: SidebarSection[]
  kanbanItems?: SidebarKanbanItem[]
  activeKanbanId?: string
  onKanbanSelect?: (kanban: SidebarKanbanItem) => void
  user: { name: string; email: string; initials: string }
  onLogout: () => void
  onNavigate?: () => void
}) {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1" } catch { return false }
  })
  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0") } catch { /* ignore */ }
      return next
    })
  }

  function isPathActive(to: string, end?: boolean): boolean {
    const path = location.pathname
    const normalizedPath = path.replace(/^\/app\/modules\/projetos\/[^/]+\//, "/app/modules/projetos/")
    const matches = end
      ? normalizedPath === to
      : normalizedPath === to || normalizedPath.startsWith(to + "/")
    if (!matches) return false
    // Se houver outra seção com prefixo mais específico que também combine, esta não fica ativa.
    return !sections.some((other) => {
      if (other.to === to) return false
      if (!other.to.startsWith(to + "/")) return false
      return normalizedPath === other.to || normalizedPath.startsWith(other.to + "/")
    })
  }

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Cabeçalho do contexto */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-border",
          collapsed ? "justify-center px-2" : "gap-2 px-4"
        )}
      >
        {!collapsed && (
          <>
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-primary"
              style={color ? { backgroundColor: `${color}1a`, color } : { backgroundColor: "hsl(var(--primary) / 0.15)" }}
            >
              <Icon size={16} />
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
          </>
        )}
        <button
          onClick={toggleCollapsed}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          title={collapsed ? "Expandir menu" : "Minimizar menu"}
          aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Seções */}
      <nav className={cn("scrollbar-thin flex-1 space-y-0.5 overflow-y-auto py-2", collapsed ? "px-2" : "px-3")}>
        {sections.map(({ to, icon: ItemIcon, label, end }) => {
          const active = isPathActive(to, end)
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={cn(
                "flex w-full items-center rounded-lg text-sm transition",
                collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2",
                active
                  ? "bg-primary/15 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <ItemIcon size={16} className="shrink-0" />
              {!collapsed && label}
            </NavLink>
          )
        })}

        {kanbanItems !== undefined && (
          <>
            <div className="mx-1 my-2 h-px bg-border" />
            {!collapsed && (
              <p className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Kanbans ativos
              </p>
            )}

            {kanbanItems.map((kanban) => (
              <button
                key={kanban.id}
                onClick={() => {
                  onKanbanSelect?.(kanban)
                  onNavigate?.()
                }}
                title={collapsed ? kanban.name : undefined}
                className={cn(
                  "flex w-full items-center rounded-lg text-sm transition",
                  collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2",
                  activeKanbanId === kanban.id
                    ? "bg-primary/15 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[4px]"
                  style={{ backgroundColor: kanban.color ?? "hsl(var(--muted-foreground))" }}
                />
                {!collapsed && <span className="truncate">{kanban.name}</span>}
              </button>
            ))}
          </>
        )}
      </nav>

      {/* Card do usuário */}
      <div className={cn("border-t border-border", collapsed ? "p-2" : "p-3")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
              title={`${user.name} · ${user.email}`}
            >
              {user.initials}
            </span>
            <button
              onClick={onLogout}
              title="Sair"
              aria-label="Sair"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-lg p-1.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {user.initials}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <LogOut size={15} />
              Sair
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
