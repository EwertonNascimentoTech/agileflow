import { Fragment, useEffect, useState } from "react"
import { CornerDownRight, FileText, GitBranch, Layers, TrendingUp, Workflow, Wrench } from "lucide-react"

import {
  produtosApi,
  type GroupBy, type IndicadorCounts, type IndicadorResponse, type IndicadorSeriesPoint, type ProcessoConsolidacaoNode,
} from "@/api/produtos"
import { Skeleton } from "@/components/ui/skeleton"
import { FilterSelect, KpiCount, KpiRow, PageHeader, Pill, ProgressBar, SectionCard, type Tone } from "@/components/ds"

const YEAR = new Date().getFullYear()
const YEARS = [YEAR, YEAR - 1, YEAR - 2]
const GROUP_LABEL: Record<GroupBy, string> = { produto: "Produto", area: "Área", setor: "Setor", portfolio: "Portfólio" }
const NIVEL_LABEL: Record<string, string> = { macroprocesso: "Macroprocesso", processo: "Processo", subprocesso: "Subprocesso" }
const NIVEL_TONE: Record<string, Tone> = { macroprocesso: "violet", processo: "blue", subprocesso: "slate" }
const PRIMARY = "hsl(var(--primary))"

const totalOf = (c: IndicadorCounts) => c.servicos + c.documentos + c.processos_automatizados

/** Linha de barra: rótulo, total e barra proporcional ao maior valor (mínimo de 2% quando há dado). */
function BarRow({ label, value, max, color, strong = false }: { label: string; value: number; max: number; color?: string; strong?: boolean }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className={`truncate ${strong ? "font-semibold" : "font-medium"}`}>{label}</span>
        <strong className="shrink-0 tabular-nums">{value}</strong>
      </div>
      <ProgressBar value={pct} color={color ?? PRIMARY} showLabel={false} />
    </div>
  )
}

/** Detalhe de um total: serviços, documentos e processos automatizados. */
function Breakdown({ counts }: { counts: IndicadorCounts }) {
  const parts = [
    { label: "Serviços", value: counts.servicos, dot: "bg-primary" },
    { label: "Documentos", value: counts.documentos, dot: "bg-violet-500" },
    { label: "Automatizados", value: counts.processos_automatizados, dot: "bg-emerald-500" },
  ]
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
      {parts.map((p) => (
        <span key={p.label} className="inline-flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} aria-hidden />
          {p.label} <span className="tabular-nums text-foreground">{p.value}</span>
        </span>
      ))}
    </div>
  )
}

export default function IndicadoresPage() {
  const [ano, setAno] = useState(YEAR)
  const [groupBy, setGroupBy] = useState<GroupBy>("produto")
  const [data, setData] = useState<IndicadorResponse | null>(null)
  const [series, setSeries] = useState<IndicadorSeriesPoint[]>([])
  const [cons, setCons] = useState<ProcessoConsolidacaoNode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      produtosApi.getIndicadores(ano, groupBy).catch(() => null),
      produtosApi.getIndicadoresSeries(YEARS).catch(() => []),
      produtosApi.getIndicadoresProcessos(ano).catch(() => []),
    ]).then(([d, s, c]) => { setData(d); setSeries(s); setCons(c) }).finally(() => setLoading(false))
  }, [ano, groupBy])

  const grupos = data?.grupos ?? []
  const maxGrupo = Math.max(1, ...grupos.map((g) => totalOf(g.counts)))
  const maxSerie = Math.max(1, ...series.map((s) => totalOf(s.counts)))

  return (
    <div className="space-y-5">
      <PageHeader
        icon="BarChart3"
        color="#7C3AED"
        title="Indicadores"
        description="Serviços digitais, documentos natos e processos automatizados."
        actions={
          <>
            <FilterSelect
              label="Ano"
              value={String(ano)}
              onChange={(v) => setAno(Number(v))}
              options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
            />
            <FilterSelect
              label="Agrupar por"
              value={groupBy}
              onChange={(v) => setGroupBy(v as GroupBy)}
              options={(["produto", "area", "setor", "portfolio"] as GroupBy[]).map((g) => ({ value: g, label: GROUP_LABEL[g] }))}
            />
          </>
        }
      />

      {loading ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <>
          <KpiRow className="sm:grid-cols-3">
            <KpiCount icon={Wrench} value={data?.total.servicos ?? 0} label={`Serviços digitais (${ano})`} />
            <KpiCount icon={FileText} value={data?.total.documentos ?? 0} label={`Documentos natos (${ano})`} tone="violet" />
            <KpiCount icon={Workflow} value={data?.total.processos_automatizados ?? 0} label={`Processos automatizados (${ano})`} tone="emerald" />
          </KpiRow>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              title={`Por ${GROUP_LABEL[groupBy].toLowerCase()}`}
              subtitle={`Serviços, documentos e processos automatizados em ${ano}.`}
              icon={Layers}
            >
              {grupos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sem dados para {ano}.</p>
              ) : (
                <ul className="space-y-4">
                  {grupos.map((g) => (
                    <li key={g.key}>
                      <BarRow label={g.label} value={totalOf(g.counts)} max={maxGrupo} />
                      <Breakdown counts={g.counts} />
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Comparativo entre anos (portfólio)" subtitle="Total por ano." icon={TrendingUp}>
              {series.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                <ul className="space-y-4">
                  {series.map((s) => (
                    <li key={s.ano}>
                      <BarRow label={String(s.ano)} value={totalOf(s.counts)} max={maxSerie} color="#2563EB" strong={s.ano === ano} />
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard
            title={`Processos automatizados na árvore (${ano})`}
            subtitle="Consolidação: macroprocesso = soma dos processos = soma dos subprocessos."
            icon={GitBranch}
            flush
          >
            {cons.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Catálogo de processos vazio.</p>
            ) : (
              <div className="divide-y">{cons.map((n) => <ConsNode key={n.id} node={n} />)}</div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}

/** Nó da árvore de processos; os filhos saem como linhas irmãs (recuadas) para a lista ficar contínua. */
function ConsNode({ node, depth = 0 }: { node: ProcessoConsolidacaoNode; depth?: number }) {
  return (
    <Fragment>
      <div
        className="flex items-center justify-between gap-3 py-2.5 pr-5 text-sm transition-colors hover:bg-muted/40"
        style={{ paddingLeft: 20 + depth * 24 }}
      >
        <span className="flex min-w-0 items-center gap-2">
          {depth > 0 && <CornerDownRight size={14} className="shrink-0 text-muted-foreground" aria-hidden />}
          <span className={`truncate ${depth === 0 ? "font-semibold" : "font-medium"}`}>{node.name}</span>
          <Pill tone={NIVEL_TONE[node.nivel] ?? "slate"}>{NIVEL_LABEL[node.nivel] ?? node.nivel}</Pill>
        </span>
        <Pill tone={node.automatizados > 0 ? "emerald" : "slate"} className="font-semibold tabular-nums">{node.automatizados}</Pill>
      </div>
      {node.children.map((c) => <ConsNode key={c.id} node={c} depth={depth + 1} />)}
    </Fragment>
  )
}
