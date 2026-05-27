import { useNavigate } from "react-router-dom"
import type { ElementType } from "react"
import { cn } from "@/lib/utils"

export type RailItem = {
  key: string
  label: string
  icon: ElementType
  to: string
  /** cor (hex) do módulo vinda da API; quando ausente usa o tom padrão */
  color?: string
  /** fixa o item no rodapé do rail (ex: Configurações) */
  pinBottom?: boolean
}

/**
 * Coluna 1 do shell — rail vertical de ícones (w-16).
 * Presentational: recebe os itens já montados e a chave ativa.
 */
export function ModuleRail({
  items,
  activeKey,
  onNavigate,
}: {
  items: RailItem[]
  activeKey: string
  onNavigate?: () => void
}) {
  const navigate = useNavigate()
  const top = items.filter(i => !i.pinBottom)
  const bottom = items.filter(i => i.pinBottom)

  function go(to: string) {
    navigate(to)
    onNavigate?.()
  }

  function renderItem(item: RailItem) {
    const active = item.key === activeKey
    return (
      <button
        key={item.key}
        onClick={() => go(item.to)}
        title={item.label}
        aria-label={item.label}
        className={cn(
          "group relative flex h-11 w-11 items-center justify-center rounded-xl transition",
          active ? "bg-white/10 text-white" : "text-current hover:bg-white/5 hover:text-white"
        )}
      >
        {active && <span className="absolute -left-3 h-6 w-1 rounded-full bg-primary" />}
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={item.color ? { backgroundColor: `${item.color}1a`, color: item.color } : undefined}
        >
          <item.icon size={18} />
        </span>
        <span className="af-rail-tooltip">{item.label}</span>
      </button>
    )
  }

  return (
    <nav className="rail-surface flex w-16 shrink-0 flex-col items-center gap-1 py-3">
      <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">
        A
      </span>
      {top.map(renderItem)}
      <div className="flex-1" />
      {bottom.map(renderItem)}
    </nav>
  )
}
