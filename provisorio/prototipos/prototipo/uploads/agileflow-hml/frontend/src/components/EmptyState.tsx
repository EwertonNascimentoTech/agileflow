import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    variant?: "default" | "outline"
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  compact?: boolean
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-4 ${compact ? "py-10" : "py-16"}`}>
      <div className={`rounded-2xl bg-muted flex items-center justify-center mb-4 ${compact ? "h-12 w-12" : "h-16 w-16"}`}>
        <Icon size={compact ? 22 : 28} className="text-muted-foreground/50" />
      </div>
      <p className={`font-semibold text-foreground ${compact ? "text-sm" : "text-base"}`}>{title}</p>
      {description && (
        <p className={`text-muted-foreground mt-1 max-w-xs ${compact ? "text-xs" : "text-sm"}`}>
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
          {action && (
            <Button
              size="sm"
              variant={action.variant ?? "default"}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button size="sm" variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
