import { CheckCircle2, Loader2 } from "lucide-react"

import type { PendingStage } from "@/api/projetos"
import { Pill } from "@/components/ds"

/**
 * Conclusão por ETAPA FINAL (não pelo %). Um projeto só é "Concluído" quando todos os
 * cards da subárvore chegaram a uma etapa final (subtree_completed === subtree_total).
 * `pending` = cards que ainda não chegaram à etapa final.
 */
export function completionOf(input: { subtreeTotal: number; subtreeCompleted: number }): {
  isFinalized: boolean
  pending: number
} {
  const pending = Math.max(0, input.subtreeTotal - input.subtreeCompleted)
  return { isFinalized: input.subtreeTotal > 0 && pending === 0, pending }
}

function daysAgo(iso: string | null): string {
  if (!iso) return "sem data"
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return "hoje"
  if (days === 1) return "há 1 dia"
  return `há ${days} dias`
}

/**
 * Selo de conclusão. "Concluído" (verde) só quando tudo está em etapa final; senão
 * "Em andamento". Quando o progresso parece 100% mas ainda faltam etapas finais, mostra
 * "· faltam N em etapa final" para que 100% nunca seja lido como pronto.
 *
 * Ao passar o mouse, exibe um tooltip listando os kanbans em aberto, em qual etapa e há
 * quanto tempo (ex.: "Solicitação · Desenvolvimento — há 23 dias").
 */
export function CompletionBadge({
  subtreeTotal,
  subtreeCompleted,
  progressPct,
  pendingStages = [],
  className = "",
}: {
  subtreeTotal: number
  subtreeCompleted: number
  progressPct: number
  pendingStages?: PendingStage[]
  className?: string
}) {
  const { isFinalized, pending } = completionOf({ subtreeTotal, subtreeCompleted })

  if (isFinalized) {
    return (
      <Pill tone="emerald" className={className}>
        <CheckCircle2 className="h-3 w-3" /> Concluído
      </Pill>
    )
  }

  const mismatch = pending > 0 && progressPct >= 100
  return (
    <span className={`group/cb relative inline-flex ${className}`}>
      <Pill tone={mismatch ? "amber" : "slate"} className="cursor-default">
        <Loader2 className="h-3 w-3" /> Em andamento
        {mismatch && <span className="font-normal">· faltam {pending} em etapa final</span>}
      </Pill>
      {pendingStages.length > 0 && (
        <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-max max-w-xs flex-col gap-1 rounded-lg border bg-popover p-2 text-left text-xs text-popover-foreground shadow-md group-hover/cb:flex">
          <span className="font-semibold text-foreground">Kanbans em aberto</span>
          {pendingStages.slice(0, 12).map((s, i) => (
            <span key={i} className="text-muted-foreground">
              <span className="font-medium text-foreground">{s.funnel_name}</span>
              {" · "}{s.status_name}{" — "}{daysAgo(s.status_entered_at)}
            </span>
          ))}
          {pendingStages.length > 12 && (
            <span className="text-muted-foreground">+{pendingStages.length - 12} mais…</span>
          )}
        </span>
      )}
    </span>
  )
}
