import type { AcompStatus, Indicador } from "@/api/indicadores"

/**
 * Pré-visualização do percentual/status no cliente (espelha o cálculo do backend
 * em service.calc_status). A fonte da verdade continua sendo o backend — isto é só
 * para feedback imediato ao editar meta/realizado.
 */
export function previewStatus(
  ind: Pick<Indicador, "sentido" | "meta_min" | "meta_max" | "tolerancia_pct">,
  meta: number | null,
  realizado: number | null,
): { pct: number | null; status: AcompStatus } {
  if (realizado == null) return { pct: null, status: "pendente" }

  if (ind.sentido === "faixa_ideal") {
    const min = ind.meta_min, max = ind.meta_max
    if (min == null || max == null) return { pct: null, status: "pendente" }
    if (realizado >= min && realizado <= max) return { pct: 100, status: "atingido" }
    const below = realizado < min
    const base = below ? min : max
    const desvio = below ? min - realizado : realizado - max
    const pct = base ? Math.round((1 - desvio / base) * 1000) / 10 : null
    const tol = ind.tolerancia_pct ?? 20
    const limite = base * (tol / 100)
    return { pct, status: desvio <= limite ? "em_atencao" : "nao_atingido" }
  }

  if (meta == null || meta === 0) return { pct: null, status: "pendente" }

  if (ind.sentido === "maior_melhor") {
    const pct = Math.round((realizado / meta) * 1000) / 10
    if (realizado >= meta) return { pct, status: "atingido" }
    if (pct >= 80) return { pct, status: "em_atencao" }
    return { pct, status: "nao_atingido" }
  }

  // menor_melhor
  const pct = realizado ? Math.round((meta / realizado) * 1000) / 10 : null
  if (realizado <= meta) return { pct, status: "atingido" }
  if (realizado <= meta * 1.2) return { pct, status: "em_atencao" }
  return { pct, status: "nao_atingido" }
}
