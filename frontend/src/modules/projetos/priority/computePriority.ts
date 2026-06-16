import type {
  PriorityCriterion,
  PriorityConfidenceLevel,
  PriorityPillar,
  PrioritySettings,
  QuadrantCode,
} from "@/api/projetos"

export interface PriorityComputeInput {
  impactScores: Record<string, number>
  effortScores: Record<string, number>
  pillarIds: string[]
}

export interface PriorityComputeOutput {
  impactoBruto: number
  modulador: number
  divisor: number
  impactoEfetivo: number
  esforco: number
  quadrantCode: QuadrantCode
}

const round = (v: number, d: number) => {
  const f = 10 ** d
  return Math.round((v + Number.EPSILON) * f) / f
}

/**
 * Porta TS do motor `compute_priority` do backend. Corte aplicado sobre o
 * impacto EFETIVO (já modulado). Mantém a metodologia idêntica para cálculo ao vivo.
 */
export function computePriority(
  input: PriorityComputeInput,
  criteria: PriorityCriterion[],
  pillars: PriorityPillar[],
  confidence: PriorityConfidenceLevel[],
  settings: Pick<PrioritySettings, "impact_cut" | "effort_cut" | "confidence_id">,
): PriorityComputeOutput {
  const impactCriteria = criteria.filter((c) => c.axis === "impact" && c.is_active)
  const effortCriteria = criteria.filter((c) => c.axis === "effort" && c.is_active)

  const impactoBruto = impactCriteria.reduce(
    (acc, c) => acc + c.weight * (input.impactScores[c.code] ?? 0),
    0,
  )
  const esforco = effortCriteria.reduce(
    (acc, c) => acc + c.weight * (input.effortScores[c.code] ?? 0),
    0,
  )

  // Vários pilares → usa o MAIOR modificador entre os selecionados.
  const selectedMods = input.pillarIds
    .map((id) => pillars.find((p) => p.id === id)?.modifier)
    .filter((m): m is number => typeof m === "number")
  const modulador = selectedMods.length > 0 ? Math.max(...selectedMods) : 1
  // Fator de Confiança é global (config), não por demanda.
  const conf = confidence.find((c) => c.id === settings.confidence_id)
  const divisor = conf && conf.divisor ? conf.divisor : 1

  const impactoEfetivo = (impactoBruto * modulador) / divisor
  const quadrantCode = classifyQuadrant(impactoEfetivo, esforco, settings.impact_cut, settings.effort_cut)

  return {
    impactoBruto: round(impactoBruto, 3),
    modulador: round(modulador, 2),
    divisor: round(divisor, 2),
    impactoEfetivo: round(impactoEfetivo, 3),
    esforco: round(esforco, 3),
    quadrantCode,
  }
}

export function classifyQuadrant(
  impact: number,
  effort: number,
  impactCut: number,
  effortCut: number,
): QuadrantCode {
  if (impact >= impactCut && effort < effortCut) return "quick_win"
  if (impact >= impactCut && effort >= effortCut) return "big_bet"
  if (impact < impactCut && effort < effortCut) return "fill_in"
  return "money_pit"
}
