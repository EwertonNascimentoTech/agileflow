import { useEffect, useState } from "react"

import {
  projetosApi,
  type PriorityMatrixItem,
  type PriorityQuadrant,
  type PrioritySettings,
} from "@/api/projetos"
import { Grid2x2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { PriorityMatrixSvg } from "@/modules/projetos/priority/PriorityMatrixSvg"
import { QuadrantBadge } from "@/modules/projetos/priority/QuadrantBadge"

export default function ProjectPriorityMatrixPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<PriorityMatrixItem[]>([])
  const [quadrants, setQuadrants] = useState<PriorityQuadrant[]>([])
  const [settings, setSettings] = useState<PrioritySettings | null>(null)

  useEffect(() => {
    Promise.all([
      projetosApi.priorityMatrix(),
      projetosApi.listPriorityQuadrants(),
      projetosApi.getPrioritySettings(),
    ])
      .then(([mx, qd, st]) => {
        setItems(mx)
        setQuadrants(qd)
        setSettings(st)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton className="h-[560px] w-full" />

  const impactCut = settings?.impact_cut ?? 3
  const effortCut = settings?.effort_cut ?? 3

  return (
    <div className="w-full space-y-4">
      <div>
        <h2 className="text-lg font-bold">Matriz de Priorização</h2>
        <p className="text-sm text-muted-foreground">
          Impacto efetivo × Esforço das demandas pontuadas. Linhas de corte em {impactCut} (impacto) e {effortCut} (esforço).
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Grid2x2} title="Nenhuma demanda pontuada" description="Pontue demandas na triagem para vê-las aqui." />
      ) : (
        <>
          <PriorityMatrixSvg items={items} quadrants={quadrants} settings={settings} />
          <RankedBacklog items={items} quadrants={quadrants} />
        </>
      )}
    </div>
  )
}

/**
 * Lista ranqueada por quadrante: resolve o desempate quando várias demandas caem na
 * mesma categoria. Dentro de cada quadrante ordena pela densidade de valor
 * (impacto ÷ esforço, estilo RICE) — maior densidade, mais cedo fazer.
 */
function RankedBacklog({
  items,
  quadrants,
}: {
  items: PriorityMatrixItem[]
  quadrants: PriorityQuadrant[]
}) {
  // `items` já vem ordenado globalmente do backend; agrupar preserva a ordem relativa.
  const order: PriorityQuadrant[] = [...quadrants].sort((a, b) => a.order - b.order)
  const groups = order
    .map((q) => ({ q, rows: items.filter((i) => i.quadrant_code === q.code) }))
    .filter((g) => g.rows.length > 0)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold">Ordem de execução</h3>
        <p className="text-sm text-muted-foreground">
          Desempate dentro de cada quadrante pela densidade de valor (impacto ÷ esforço): maior densidade, mais cedo fazer.
        </p>
      </div>
      {groups.map(({ q, rows }) => (
        <div key={q.code} className="space-y-2">
          <div className="flex items-center gap-2">
            <QuadrantBadge code={q.code} quadrants={quadrants} />
            {q.action_hint && (
              <span className="text-xs text-muted-foreground">{q.action_hint}</span>
            )}
          </div>
          <ol className="space-y-1">
            {rows.map((i, idx) => (
              <li
                key={i.task_id}
                className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm"
              >
                <span className="w-6 shrink-0 text-right font-mono text-muted-foreground">
                  {idx + 1}
                </span>
                {i.color && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: i.color }}
                    title={i.perspective ?? undefined}
                  />
                )}
                <span className="flex-1 truncate font-medium">{i.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  I {i.impacto_efetivo.toFixed(2)} · E {i.esforco.toFixed(2)}
                </span>
                {i.priority_rank !== null && (
                  <span
                    className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold"
                    title="Valor por unidade de esforço (impacto ÷ esforço)"
                  >
                    {i.priority_rank.toFixed(2)}×
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
