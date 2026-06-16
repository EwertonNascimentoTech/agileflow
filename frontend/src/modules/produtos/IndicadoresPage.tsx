import { useEffect, useState } from "react"
import { FileText, Workflow, Wrench } from "lucide-react"

import { produtosApi, type GroupBy, type IndicadorResponse, type IndicadorSeriesPoint, type ProcessoConsolidacaoNode } from "@/api/produtos"
import { KpiCard } from "@/components/KpiCard"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const YEAR = new Date().getFullYear()
const YEARS = [YEAR, YEAR - 1, YEAR - 2]
const GROUP_LABEL: Record<GroupBy, string> = { produto: "Produto", area: "Área", setor: "Setor", portfolio: "Portfólio" }

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{label}</span><span className="shrink-0 tabular-nums text-muted-foreground">{value}</span></div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color ?? "hsl(var(--primary))" }} /></div>
    </div>
  )
}

export default function IndicadoresPage() {
  const [ano, setAno] = useState(YEAR)
  const [groupBy, setGroupBy] = useState<GroupBy>("area")
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

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-lg font-bold">Indicadores</h2><p className="text-sm text-muted-foreground">Serviços digitais, documentos natos e processos automatizados.</p></div>
        <div className="flex gap-2">
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{(["produto", "area", "setor", "portfolio"] as GroupBy[]).map((g) => <SelectItem key={g} value={g}>{GROUP_LABEL[g]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {loading ? <Skeleton className="h-80 w-full" /> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard label={`Serviços digitais (${ano})`} value={data?.total.servicos ?? 0} icon={Wrench} />
            <KpiCard label={`Documentos natos (${ano})`} value={data?.total.documentos ?? 0} icon={FileText} />
            <KpiCard label={`Processos automatizados (${ano})`} value={data?.total.processos_automatizados ?? 0} icon={Workflow} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Por {GROUP_LABEL[groupBy].toLowerCase()}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(data?.grupos.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">Sem dados para {ano}.</p> : data!.grupos.map((g) => {
                  const max = Math.max(1, ...data!.grupos.map((x) => x.counts.servicos + x.counts.documentos + x.counts.processos_automatizados))
                  return (
                    <div key={g.key}>
                      <BarRow label={g.label} value={g.counts.servicos + g.counts.documentos + g.counts.processos_automatizados} max={max} />
                      <div className="mt-0.5 flex gap-3 text-[10px] text-muted-foreground"><span>Serv {g.counts.servicos}</span><span>Doc {g.counts.documentos}</span><span>Autom {g.counts.processos_automatizados}</span></div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Comparativo entre anos (portfólio)</CardTitle><CardDescription>Total por ano.</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {series.map((s) => {
                    const max = Math.max(1, ...series.map((x) => x.counts.servicos + x.counts.documentos + x.counts.processos_automatizados))
                    return <BarRow key={s.ano} label={String(s.ano)} value={s.counts.servicos + s.counts.documentos + s.counts.processos_automatizados} max={max} color="#2563EB" />
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Processos automatizados na árvore ({ano})</CardTitle><CardDescription>Consolidação: macroprocesso = soma dos processos = soma dos subprocessos.</CardDescription></CardHeader>
            <CardContent>
              {cons.length === 0 ? <p className="text-sm text-muted-foreground">Catálogo de processos vazio.</p> : <div className="space-y-1">{cons.map((n) => <ConsNode key={n.id} node={n} />)}</div>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function ConsNode({ node, depth = 0 }: { node: ProcessoConsolidacaoNode; depth?: number }) {
  return (
    <div>
      <div className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm" style={{ marginLeft: depth * 18 }}>
        <span className="truncate">{node.name} <span className="text-[10px] uppercase text-muted-foreground">({node.nivel})</span></span>
        <span className="shrink-0 font-semibold tabular-nums">{node.automatizados}</span>
      </div>
      {node.children.length > 0 && <div className="mt-1 space-y-1">{node.children.map((c) => <ConsNode key={c.id} node={c} depth={depth + 1} />)}</div>}
    </div>
  )
}
