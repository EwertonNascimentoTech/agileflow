import type { ElementType, ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Card de indicador (KPI) para dashboards: ícone + valor + label + delta opcional.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaTone = "neutral",
  sub,
  className,
}: {
  label: string
  value: ReactNode
  icon?: ElementType
  delta?: ReactNode
  deltaTone?: "up" | "down" | "neutral"
  sub?: ReactNode
  className?: string
}) {
  const deltaClasses =
    deltaTone === "up"
      ? "bg-emerald-500/15 text-emerald-500"
      : deltaTone === "down"
        ? "bg-rose-500/15 text-rose-500"
        : "bg-muted text-muted-foreground"

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center justify-between">
        {Icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Icon size={18} />
          </span>
        )}
        {delta != null && (
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", deltaClasses)}>
            {delta}
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground/80">{sub}</p>}
    </Card>
  )
}
