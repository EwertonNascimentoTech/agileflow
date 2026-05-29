import { useCallback, useState, type ReactNode } from "react"
import { ChevronDown, type LucideIcon } from "lucide-react"

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
    <div className={cn("space-y-3 border-t border-border pt-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 text-left hover:bg-muted/60"
          aria-expanded={expanded}
          title={expanded ? "Minimizar seção" : "Expandir seção"}
        >
          <span className="h-4 w-1 shrink-0 rounded-full bg-primary" />
          {Icon && <Icon size={14} className="shrink-0 text-primary" />}
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">{title}</p>
          {badges}
          <ChevronDown
            size={14}
            className={cn("ml-1 shrink-0 text-muted-foreground transition-transform", !expanded && "-rotate-90")}
          />
        </button>
        {headerEnd}
      </div>
      {expanded && <div className="space-y-3">{children}</div>}
    </div>
  )
}
