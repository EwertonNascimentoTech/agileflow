import { useCallback, useState, type ElementType, type ReactNode } from "react"
import { ChevronDown, type LucideIcon } from "lucide-react"

import { Card } from "@/components/ds"
import { cn } from "@/lib/utils"

const STORAGE_PREFIX = "agileflow.form-section."

function readStoredExpanded(sectionId: string, defaultExpanded: boolean): boolean {
  try {
    const v = localStorage.getItem(`${STORAGE_PREFIX}${sectionId}`)
    if (v === "0") return false
    if (v === "1") return true
  } catch {
    /* ignore */
  }
  return defaultExpanded
}

export function useFormSectionExpanded(sectionId: string, defaultExpanded = true) {
  const [expanded, setExpanded] = useState(() => readStoredExpanded(sectionId, defaultExpanded))

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${sectionId}`, next ? "1" : "0")
      } catch {
        /* ignore */
      }
      return next
    })
  }, [sectionId])

  return { expanded, toggle, setExpanded }
}

/** Bloco de seção do drawer do card no padrão do Portal, em escala compacta: cartão com
 *  cabeçalho (ícone, título em text-sm, selos, subtítulo e ações à direita) e corpo.
 *  `flush` tira o padding do corpo (listas de borda a borda). */
export function DrawerSection({
  title,
  icon: Icon,
  iconClassName,
  subtitle,
  badges,
  right,
  children,
  flush = false,
  className,
}: {
  title: ReactNode
  icon?: ElementType
  /** Cor do ícone (padrão: text-muted-foreground). */
  iconClassName?: string
  subtitle?: ReactNode
  /** Selos logo depois do título. */
  badges?: ReactNode
  right?: ReactNode
  children: ReactNode
  flush?: boolean
  className?: string
}) {
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {Icon && <Icon size={15} className={cn("shrink-0", iconClassName ?? "text-muted-foreground")} />}
            <span className="min-w-0">{title}</span>
            {badges}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {right && <div className="flex shrink-0 flex-wrap items-center gap-1">{right}</div>}
      </div>
      <div className={flush ? "" : "space-y-3 p-4"}>{children}</div>
    </Card>
  )
}

export function CollapsibleFormSection({
  sectionId,
  title,
  icon: Icon,
  defaultExpanded = true,
  headerEnd,
  badges,
  children,
  className,
}: {
  sectionId: string
  title: string
  icon?: LucideIcon
  defaultExpanded?: boolean
  headerEnd?: ReactNode
  badges?: ReactNode
  children: ReactNode
  className?: string
}) {
  const { expanded, toggle } = useFormSectionExpanded(sectionId, defaultExpanded)

  return (
    <Card className={className}>
      <div className={cn("flex items-center justify-between gap-2 px-4 py-3", expanded && "border-b")}>
        <button
          type="button"
          onClick={toggle}
          className="inline-flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-md text-left text-sm font-semibold transition-colors hover:text-primary"
          aria-expanded={expanded}
          title={expanded ? "Minimizar seção" : "Expandir seção"}
        >
          {Icon && <Icon size={15} className="shrink-0 text-muted-foreground" />}
          <span className="min-w-0">{title}</span>
          {badges}
          <ChevronDown
            size={15}
            className={cn("shrink-0 text-muted-foreground transition-transform", !expanded && "-rotate-90")}
          />
        </button>
        {headerEnd}
      </div>
      {expanded && <div className="space-y-3 p-4">{children}</div>}
    </Card>
  )
}
