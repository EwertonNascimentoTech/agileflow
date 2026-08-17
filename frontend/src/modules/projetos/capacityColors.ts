import type { CSSProperties } from "react"

/**
 * Paleta única de carga×capacidade (inspirada no MS Planner), compartilhada pelo
 * heatmap do cockpit e pelo painel de capacidade do cronograma — para as duas telas
 * nunca pintarem a mesma sobrecarga de cores diferentes.
 *
 *   ≤80% verde · >80% âmbar · >100% vermelho · capacidade 0 com carga = rosa
 */
export function capacityRatioColors(allocated: number, capacity: number): { bg: string; fg: string } | null {
  if (capacity <= 0) {
    return allocated > 0 ? { bg: "#fecaca", fg: "#7f1d1d" } : null
  }
  const ratio = allocated / capacity
  if (ratio > 1.0001) return { bg: "#ef4444", fg: "#fff" }
  if (ratio > 0.8) return { bg: "#fde68a", fg: "#78350f" }
  if (ratio > 0) return { bg: "#bbf7d0", fg: "#14532d" }
  return null
}

/** Mesmo mapeamento, já em CSSProperties (célula do heatmap). */
export function capacityCellStyle(allocated: number, capacity: number): CSSProperties {
  const c = capacityRatioColors(allocated, capacity)
  return c ? { background: c.bg, color: c.fg } : {}
}
