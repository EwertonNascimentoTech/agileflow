import type { PriorityQuadrant, QuadrantCode } from "@/api/projetos"

/** Badge colorido do quadrante. Usa o label/cor configurados pelo tenant quando disponíveis.
 *  Visual de selo do Portal (Pill): fundo translúcido e contorno na cor do quadrante, com ponto. */
export function QuadrantBadge({
  code,
  quadrants,
  className = "",
}: {
  code: QuadrantCode
  quadrants: PriorityQuadrant[]
  className?: string
}) {
  const q = quadrants.find((x) => x.code === code)
  const label = q?.label ?? code
  const color = q?.color ?? "#6B7280"
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium text-foreground ${className}`}
      style={{ backgroundColor: `${color}1a`, boxShadow: `inset 0 0 0 1px ${color}55` }}
      title={q?.action_hint ?? undefined}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {label}
    </span>
  )
}
