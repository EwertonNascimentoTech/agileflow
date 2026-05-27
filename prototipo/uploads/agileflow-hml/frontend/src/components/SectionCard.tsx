import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Card de seção: wrapper fino do Card shadcn com cabeçalho opcional (título + ação).
 */
export function SectionCard({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Card className={cn("p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <p className="font-semibold">{title}</p>}
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Card>
  )
}
