import type { PriorityQuadrant, QuadrantCode } from "@/api/projetos"

/** Badge colorido do quadrante. Usa o label/cor configurados pelo tenant quando disponíveis. */
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
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${className}`}
      style={{ backgroundColor: color }}
      title={q?.action_hint ?? undefined}
    >
      {label}
    </span>
  )
}
