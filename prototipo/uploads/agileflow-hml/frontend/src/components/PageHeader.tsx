import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Cabeçalho padrão de página: título + subtítulo opcional + ações à direita.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
