import { NavLink } from "react-router-dom"
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
  user,
  onLogout,
  onNavigate,
}: {
  title: string
  icon: ElementType
  color?: string
  sections: SidebarSection[]
  user: { name: string; email: string; initials: string }
  onLogout: () => void
  onNavigate?: () => void
}) {
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
        {sections.map(({ to, icon: ItemIcon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                isActive
                  ? "bg-primary/15 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )
            }
          >
            <ItemIcon size={16} />
            {label}
          </NavLink>
        ))}
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
