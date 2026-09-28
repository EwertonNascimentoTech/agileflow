import { useEffect, useState } from "react"

import {
  projetosApi,
  type PriorityMatrixItem,
  type PriorityQuadrant,
  type PrioritySettings,
  type QuadrantCode,
} from "@/api/projetos"
import { Grid2x2, ListOrdered, Rocket, Target, TrendingDown, Zap, type LucideIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Card, KpiCount, KpiRow, PageHeader, SectionCard, type KpiTone } from "@/components/ds"
import { PriorityMatrixSvg } from "@/modules/projetos/priority/PriorityMatrixSvg"
import { QuadrantBadge } from "@/modules/projetos/priority/QuadrantBadge"

// Tom e ícone dos cartões por quadrante — mesmas cores do fundo da matriz (PriorityMatrixSvg:
// quick_win verde, big_bet azul, fill_in âmbar, money_pit vermelho). O nome vem da Config.
const QUADRANT_KPI: Record<QuadrantCode, { tone: KpiTone; icon: LucideIcon }> = {
  quick_win: { tone: "emerald", icon: Zap },
  big_bet: { tone: "primary", icon: Rocket },
  fill_in: { tone: "amber", icon: Target },
  money_pit: { tone: "red", icon: TrendingDown },
}

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

  if (loading) {
    return (
      <div className="w-full space-y-5 p-1">
        <Skeleton className="h-16 w-2/3 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
        <Skeleton className="h-[560px] w-full rounded-2xl" />
      </div>
    )
  }

  const impactCut = settings?.impact_cut ?? 3
  const effortCut = settings?.effort_cut ?? 3
  const orderedQuadrants = [...quadrants].sort((a, b) => a.order - b.order)

  return (
    <div className="w-full space-y-5 p-1">
      <PageHeader
        icon={Grid2x2}
        color="#2563EB"
        title="Matriz de Priorização"
        description={`Impacto efetivo × Esforço das demandas pontuadas. Linhas de corte em ${impactCut} (impacto) e ${effortCut} (esforço).`}
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState icon={Grid2x2} title="Nenhuma demanda pontuada" description="Pontue demandas na triagem para vê-las aqui." />
        </Card>
      ) : (
        <>
          {/* Quantas demandas caem em cada quadrante (só leitura). */}
          <KpiRow className="sm:grid-cols-2 lg:grid-cols-5">
            <KpiCount icon={Grid2x2} value={items.length} label="Demandas pontuadas" />
            {orderedQuadrants.map((q) => {
              const meta = QUADRANT_KPI[q.code] ?? { tone: "slate" as KpiTone, icon: Target }
              return (
                <KpiCount
                  key={q.code}
                  icon={meta.icon}
                  tone={meta.tone}
                  value={items.filter((i) => i.quadrant_code === q.code).length}
                  label={q.label}
                />
              )
            })}
          </KpiRow>

          <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <SectionCard
              title="Impacto × Esforço"
              icon={Grid2x2}
              subtitle="Cada ponto é uma demanda; a cor indica a perspectiva do pilar estratégico."
            >
              <PriorityMatrixSvg items={items} quadrants={quadrants} settings={settings} />
            </SectionCard>
            <RankedBacklog items={items} quadrants={quadrants} />
          </div>
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
    <SectionCard
      flush
      title="Ordem de execução"
      icon={ListOrdered}
      subtitle="Desempate dentro de cada quadrante pela densidade de valor (impacto ÷ esforço): maior densidade, mais cedo fazer."
    >
      {groups.map(({ q, rows }, gi) => (
        <div key={q.code} className={gi > 0 ? "border-t" : ""}>
          <div className="flex flex-wrap items-center gap-2 bg-muted/60 px-5 py-2.5">
            <QuadrantBadge code={q.code} quadrants={quadrants} />
            {q.action_hint && (
              <span className="text-xs text-muted-foreground">{q.action_hint}</span>
            )}
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">{rows.length}</span>
          </div>
          <ol className="divide-y">
            {rows.map((i, idx) => (
              <li
                key={i.task_id}
                className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-muted/40"
              >
                <span className="w-6 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                  {idx + 1}
                </span>
                {i.color && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: i.color }}
                    title={i.perspective ?? undefined}
                  />
                )}
                <span className="flex-1 truncate font-medium" title={i.title}>{i.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  I {i.impacto_efetivo.toFixed(2)} · E {i.esforco.toFixed(2)}
                </span>
                {i.priority_rank !== null && (
                  <span
                    className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold tabular-nums"
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
    </SectionCard>
  )
}
