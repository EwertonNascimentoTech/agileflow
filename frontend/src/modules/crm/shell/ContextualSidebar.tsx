import { NavLink, useLocation } from "react-router-dom"
import type { ElementType } from "react"
import { LogOut } from "lucide-react"
import { cn } from "@/lib/utils"

export type SidebarSection = {
  to: string
  icon: ElementType
  label: string
  /** marca correspondência exata (ex: rota índice de Configurações) */
  end?: boolean
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
  projectItems,
  activeProjectId,
  onProjectSelect,
  onCreateProject,
  user,
  onLogout,
  onNavigate,
}: {
  title: string
  icon: ElementType
  color?: string
  sections: SidebarSection[]
  projectItems?: Array<{ id: string; name: string; color?: string }>
  activeProjectId?: string
  onProjectSelect?: (projectId: string) => void
  onCreateProject?: () => void
  user: { name: string; email: string; initials: string }
  onLogout: () => void
  onNavigate?: () => void
}) {
  const location = useLocation()

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
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
      {/* Cabeçalho do contexto */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg text-primary"
          style={color ? { backgroundColor: `${color}1a`, color } : { backgroundColor: "hsl(var(--primary) / 0.15)" }}
        >
          <Icon size={16} />
        </span>
        <span className="truncate font-semibold">{title}</span>
      </div>

      {/* Seções */}
      <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {sections.map(({ to, icon: ItemIcon, label, end }) => {
          const active = isPathActive(to, end)
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                active
                  ? "bg-primary/15 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <ItemIcon size={16} />
              {label}
            </NavLink>
          )
        })}

        {projectItems && projectItems.length > 0 && (
          <>
            <div className="mx-1 my-2 h-px bg-border" />
            <p className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Processos ativos
            </p>

            {projectItems.map((project) => (
              <button
                key={project.id}
                onClick={() => {
                  onProjectSelect?.(project.id)
                  onNavigate?.()
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                  activeProjectId === project.id
                    ? "bg-primary/15 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[4px]"
                  style={{ backgroundColor: project.color ?? "hsl(var(--muted-foreground))" }}
                />
                <span className="truncate">{project.name}</span>
              </button>
            ))}

            <button
              onClick={() => {
                onCreateProject?.()
                onNavigate?.()
              }}
              className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <span className="text-base leading-none">+</span>
              Novo processo
            </button>
          </>
        )}
      </nav>

      {/* Card do usuário */}
      <div className="border-t border-border p-3">
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
      </div>
    </aside>
  )
}
