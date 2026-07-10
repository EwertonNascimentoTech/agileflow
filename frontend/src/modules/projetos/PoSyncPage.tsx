import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CalendarX,
  CheckCircle2,
  Clock,
  Filter,
  FolderKanban,
  HeartPulse,
  Layers,
  ListChecks,
  Package,
  Users,
  X,
} from "lucide-react"

import {
  projetosApi,
  type PoSyncFase,
  type PoSyncKpis,
  type PoSyncPrazoBlock,
  type PoSyncProjeto,
  type PoSyncResponse,
  type PoSyncSaudeProdutosFaixa,
  type PoSyncSaudeProdutosPo,
} from "@/api/projetos"
import { KpiCard } from "@/components/KpiCard"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"

const ALL = "__all__" // sentinela: sem filtro (Radix proíbe value="")

const FASE_LABEL: Record<PoSyncFase, string> = {
  planejamento: "Planejamento",
  execucao: "Execução",
  encerramento: "Encerramento",
}
const FASE_VARIANT: Record<PoSyncFase, "warning" | "default" | "success"> = {
  planejamento: "warning",
  execucao: "default",
  encerramento: "success",
}

function fmtScore(score: number | null | undefined): string {
  if (score == null) return "—"
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function scoreTone(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground"
  if (score >= 75) return "text-emerald-600 font-semibold"
  if (score >= 40) return "text-amber-600 font-semibold"
  return "text-red-600 font-semibold"
}

function FaixaScoreCell({ faixa, label }: { faixa: PoSyncSaudeProdutosFaixa; label: string }) {
  return (
    <td className="py-2.5 px-2 align-top">
      <div className={`tabular-nums ${scoreTone(faixa.score_medio)}`}>{fmtScore(faixa.score_medio)}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{faixa.total} {label}</div>
    </td>
  )
}

function SaudeDistribuicaoBar({ saudavel, atencao, critico }: { saudavel: number; atencao: number; critico: number }) {
  const total = saudavel + atencao + critico
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>
  const pct = (n: number) => Math.round((n / total) * 100)
  return (
    <div className="space-y-1">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {saudavel > 0 && <div className="h-full bg-emerald-500" style={{ width: `${pct(saudavel)}%` }} />}
        {atencao > 0 && <div className="h-full bg-amber-500" style={{ width: `${pct(atencao)}%` }} />}
        {critico > 0 && <div className="h-full bg-red-500" style={{ width: `${pct(critico)}%` }} />}
      </div>
      <div className="flex gap-2 text-[10px] text-muted-foreground">
        <span className="text-emerald-600">{saudavel} ok</span>
        <span className="text-amber-600">{atencao} aten.</span>
        <span className="text-red-600">{critico} crít.</span>
      </div>
    </div>
  )
}

function SaudeProdutosPoRow({ po }: { po: PoSyncSaudeProdutosPo }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30">
      <td className="py-2.5 pr-3 font-medium">
        {po.po_id === null ? (
          <span className="italic text-muted-foreground">{po.full_name}</span>
        ) : (
          po.full_name
        )}
      </td>
      <td className="py-2.5 px-2 tabular-nums text-center">{po.total}</td>
      <FaixaScoreCell faixa={po.producao} label="em prod." />
      <FaixaScoreCell faixa={po.desenvolvimento} label="em dev." />
      <td className="py-2.5 px-2 tabular-nums text-center text-muted-foreground">{po.outros.total || "—"}</td>
      <td className="py-2.5 px-2 min-w-[120px]">
        <SaudeDistribuicaoBar saudavel={po.saudavel} atencao={po.atencao} critico={po.critico} />
      </td>
      <td className="py-2.5 pl-2 text-right">
        {po.critico > 0 ? <Badge variant="destructive">{po.critico}</Badge> : <span className="text-muted-foreground">0</span>}
      </td>
    </tr>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

function execLabel(p: PoSyncProjeto): string {
  // Projeto em Planejamento aparece como "—" (não iniciado), nunca 0%.
  return p.exec_pct === null ? "—" : `${p.exec_pct}%`
}

/** Mini barra de proporção (mesmo padrão visual do ReportsPage). */
function MiniBar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color ?? "hsl(var(--primary))" }} />
    </div>
  )
}

function PrazoBadge({ p }: { p: PoSyncProjeto }) {
  if (p.prazo_status === "atrasado") {
    return <Badge variant="destructive">+{p.atraso_dias}d</Badge>
  }
  if (p.prazo_status === "no_prazo") {
    return <Badge variant="success">No prazo</Badge>
  }
  return <span className="text-xs text-muted-foreground">sem baseline</span>
}

/** Tabela com TODOS os projetos de um recorte (PO). Nunca trunca em "+N". */
function ProjetosTable({ projetos }: { projetos: PoSyncProjeto[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Projeto</th>
            <th className="py-2 px-2 font-medium">Fase</th>
            <th className="py-2 px-2 font-medium">Execução</th>
            <th className="py-2 px-2 font-medium">Diretoria</th>
            <th className="py-2 px-2 font-medium">Prazo plan.</th>
            <th className="py-2 pl-2 font-medium">Prazo</th>
          </tr>
        </thead>
        <tbody>
          {projetos.map((p) => (
            <tr key={p.task_id} className="border-b last:border-0 align-top">
              <td className="py-2 pr-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium" title={p.title}>{p.title}</span>
                  {p.backlog_montado && (
                    <Badge variant="warning" className="shrink-0" title="Backlog montado, execução não iniciada">
                      backlog
                    </Badge>
                  )}
                </div>
                {p.stage_name && (
                  <span className="text-xs text-muted-foreground">{p.stage_name}</span>
                )}
              </td>
              <td className="py-2 px-2">
                <Badge variant={FASE_VARIANT[p.fase]}>{FASE_LABEL[p.fase]}</Badge>
              </td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-2">
                  <span className="tabular-nums w-9 shrink-0">{execLabel(p)}</span>
                  {p.exec_pct !== null && <MiniBar value={p.exec_pct} max={100} />}
                </div>
              </td>
              <td className="py-2 px-2">
                <span className="text-xs" title={p.diretoria_label ?? ""}>
                  {p.diretoria_label ?? <span className="text-muted-foreground italic">sem diretoria</span>}
                </span>
              </td>
              <td className="py-2 px-2 tabular-nums text-xs text-muted-foreground">{fmtDate(p.due_date)}</td>
              <td className="py-2 pl-2"><PrazoBadge p={p} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PoKpiStrip({ kpis }: { kpis: PoSyncKpis }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Badge variant="secondary">{kpis.total} projeto(s)</Badge>
      <Badge variant="warning">{kpis.planejamento} em planejamento</Badge>
      <Badge variant="default">{kpis.execucao} em execução</Badge>
      <Badge variant="success">{kpis.encerramento} encerrado(s)</Badge>
      <Badge variant="secondary">
        exec. média {kpis.avg_exec_pct === null ? "—" : `${kpis.avg_exec_pct}%`}
      </Badge>
      {kpis.em_risco > 0 && <Badge variant="destructive">{kpis.em_risco} em risco</Badge>}
    </div>
  )
}

function PrazoResumo({ block, escopo }: { block: PoSyncPrazoBlock | null; escopo: string }) {
  if (!block || block.avaliaveis === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        Sem {escopo} com data planejada <b>e</b> data real para comparar.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-destructive">{block.pct_atrasados ?? 0}%</span>
        <span className="text-sm text-muted-foreground">
          {escopo} atrasados ({block.atrasados}/{block.avaliaveis} avaliáveis)
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div><span className="text-muted-foreground">No prazo: </span><b>{block.no_prazo}</b></div>
        <div><span className="text-muted-foreground">Atrasados: </span><b>{block.atrasados}</b></div>
        <div><span className="text-muted-foreground">Atraso médio: </span><b>{block.atraso_medio ?? 0}d</b></div>
        <div><span className="text-muted-foreground">Mediana: </span><b>{block.atraso_mediana ?? 0}d</b></div>
      </div>
    </div>
  )
}

export default function PoSyncPage() {
  const [data, setData] = useState<PoSyncResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [diretoria, setDiretoria] = useState<string>(ALL)
  const [area, setArea] = useState<string>(ALL)

  useEffect(() => {
    let active = true
    setLoading(true)
    projetosApi
      .getPoSync({
        diretoria: diretoria === ALL ? null : diretoria,
        area: area === ALL ? null : area,
      })
      .then((r) => {
        if (active) setData(r)
      })
      .catch(() => {
        if (active) setData(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [diretoria, area])

  const fasesMax = useMemo(() => {
    if (!data) return 0
    const f = data.panorama.fases
    return Math.max(f.planejamento, f.execucao, f.encerramento, 1)
  }, [data])

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!data || data.capa.total_projetos === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Sem projetos para a PO Sync"
        description="Nenhum projeto/programa atribuído a um PO neste recorte. Ajuste os filtros ou cadastre o portfólio."
      />
    )
  }

  const hasFilter = diretoria !== ALL || area !== ALL

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={diretoria} onValueChange={setDiretoria}>
          <SelectTrigger className="h-8 w-[260px] text-sm"><SelectValue placeholder="Diretoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as diretorias</SelectItem>
            {data.available_diretorias.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="h-8 w-[220px] text-sm"><SelectValue placeholder="Área" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as áreas</SelectItem>
            {data.available_areas.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilter && (
          <button
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setDiretoria(ALL); setArea(ALL) }}
          >
            <X className="h-3 w-3" /> limpar
          </button>
        )}
      </div>

      {/* 1. Capa */}
      <section className="space-y-2">
        <div>
          <h3 className="text-base font-semibold">PO Sync — Portfólio</h3>
          <p className="text-sm text-muted-foreground">
            Visão consolidada para a cerimônia, liderada por Product Owner. Fase derivada da situação
            real dos itens; execução desconta itens despriorizados.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Projetos" value={data.capa.total_projetos} icon={FolderKanban} />
          <KpiCard label="Product Owners" value={data.capa.total_pos} icon={Users} />
          <KpiCard label="Itens analisados" value={data.capa.total_itens} icon={Layers} />
          <KpiCard label="Concluídos" value={data.capa.total_concluidos} icon={CheckCircle2} />
          <KpiCard
            label="Execução média"
            value={data.panorama.avg_exec_pct === null ? "—" : `${data.panorama.avg_exec_pct}%`}
            icon={ListChecks}
            sub="projetos em execução/encerramento"
          />
        </div>
      </section>

      {/* 2. Panorama (3 fases) */}
      <Card>
        <CardHeader>
          <CardTitle>Panorama por fase</CardTitle>
          <CardDescription>
            Um projeto só é <b>Execução</b> quando ao menos um item entrou em desenvolvimento/homologação/conclusão.
            Caso contrário, segue em <b>Planejamento</b> (backlog montado, nada iniciado).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {(["planejamento", "execucao", "encerramento"] as PoSyncFase[]).map((f) => (
              <div key={f} className="space-y-1.5 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Badge variant={FASE_VARIANT[f]}>{FASE_LABEL[f]}</Badge>
                  <span className="text-2xl font-bold tabular-nums">{data.panorama.fases[f]}</span>
                </div>
                <MiniBar value={data.panorama.fases[f]} max={fasesMax} />
              </div>
            ))}
          </div>
          {data.panorama.backlog_sem_execucao > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                <b>{data.panorama.backlog_sem_execucao}</b> projeto(s) com <b>backlog montado mas execução não iniciada</b> —
                achado próprio: há escopo priorizado parado, esperando arranque.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Saúde de prazo */}
      <Card>
        <CardHeader>
          <CardTitle>Saúde de prazo</CardTitle>
          <CardDescription>
            Compara Data Fim Real vs Planejada apenas onde ambas existem.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.prazo.sem_datas_comparaveis > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <CalendarX className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                <b>{data.prazo.sem_datas_comparaveis}</b> projeto(s) sem datas comparáveis — a avaliação no nível
                projeto é frágil. O sinal real está nas <b>entregas</b> (itens) abaixo.
              </span>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Nível projeto</p>
              <PrazoResumo block={data.prazo.projetos} escopo="projetos" />
            </div>
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Nível entrega (itens)</p>
              <PrazoResumo block={data.prazo.itens} escopo="entregas" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Ranking por PO */}
      <Card>
        <CardHeader>
          <CardTitle>Ranking por PO</CardTitle>
          <CardDescription>Todos os POs com portfólio, do maior para o menor.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Product Owner</th>
                <th className="py-2 px-2 font-medium">Projetos</th>
                <th className="py-2 px-2 font-medium">Em planejamento</th>
                <th className="py-2 px-2 font-medium">Em execução</th>
                <th className="py-2 px-2 font-medium">Encerrados</th>
                <th className="py-2 px-2 font-medium">Exec. média</th>
                <th className="py-2 pl-2 font-medium">Em risco</th>
              </tr>
            </thead>
            <tbody>
              {data.ranking_pos.map((po) => (
                <tr key={po.po_id ?? po.full_name} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{po.full_name ?? "—"}</td>
                  <td className="py-2 px-2 tabular-nums">{po.total}</td>
                  <td className="py-2 px-2 tabular-nums">{po.planejamento}</td>
                  <td className="py-2 px-2 tabular-nums">{po.execucao}</td>
                  <td className="py-2 px-2 tabular-nums">{po.encerramento}</td>
                  <td className="py-2 px-2 tabular-nums">{po.avg_exec_pct === null ? "—" : `${po.avg_exec_pct}%`}</td>
                  <td className="py-2 pl-2">
                    {po.em_risco > 0 ? <Badge variant="destructive">{po.em_risco}</Badge> : <span className="text-muted-foreground">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 4b. Saúde do portfólio de PRODUTOS por PO */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Saúde do portfólio de produtos por PO</CardTitle>
          <CardDescription>
            Índice de Saúde agregado por Responsável (PO). Scores de <strong>produção</strong> consideram produtos em
            Produção, Sustentação ou Evolução; scores de <strong>desenvolvimento</strong> consideram Ideia, Discovery,
            Desenvolvimento ou Homologação. Produtos corporativos contam para cada PO dos serviços. Visão de todo o portfólio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.saude_produtos.resumo.total_produtos === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto ativo cadastrado.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Portfólio</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{data.saude_produtos.resumo.total_produtos}</p>
                  <p className="text-xs text-muted-foreground">produtos ativos</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Score — Produção</p>
                  <p className={`mt-1 text-2xl tabular-nums ${scoreTone(data.saude_produtos.resumo.producao.score_medio)}`}>
                    {fmtScore(data.saude_produtos.resumo.producao.score_medio)}
                  </p>
                  <p className="text-xs text-muted-foreground">{data.saude_produtos.resumo.producao.total} em produção</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Score — Desenvolvimento</p>
                  <p className={`mt-1 text-2xl tabular-nums ${scoreTone(data.saude_produtos.resumo.desenvolvimento.score_medio)}`}>
                    {fmtScore(data.saude_produtos.resumo.desenvolvimento.score_medio)}
                  </p>
                  <p className="text-xs text-muted-foreground">{data.saude_produtos.resumo.desenvolvimento.total} em desenvolvimento</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Distribuição geral</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="success">{data.saude_produtos.resumo.distribuicao.saudavel} saudável</Badge>
                    <Badge variant="warning">{data.saude_produtos.resumo.distribuicao.atencao} atenção</Badge>
                    <Badge variant="destructive">{data.saude_produtos.resumo.distribuicao.critico} crítico</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Média geral {data.saude_produtos.resumo.media_score}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2.5 pr-3 pl-3 font-medium">Product Owner</th>
                      <th className="py-2.5 px-2 font-medium text-center">Total</th>
                      <th className="py-2.5 px-2 font-medium">Score produção</th>
                      <th className="py-2.5 px-2 font-medium">Score desenvolvimento</th>
                      <th className="py-2.5 px-2 font-medium text-center">Outros</th>
                      <th className="py-2.5 px-2 font-medium min-w-[120px]">Distribuição</th>
                      <th className="py-2.5 pl-2 pr-3 font-medium text-right">Críticos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.saude_produtos.por_po.map((po) => (
                      <SaudeProdutosPoRow key={po.po_id ?? po.full_name} po={po} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 4c. Saúde dos PROJETOS por PO */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HeartPulse className="h-4 w-4" /> Saúde dos projetos por PO</CardTitle>
          <CardDescription>Saúde de prazo dos projetos deste recorte por Product Owner — saudável (verde) vs. em risco/atrasado (vermelho).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Product Owner</th>
                <th className="py-2 px-2 font-medium">Projetos</th>
                <th className="py-2 px-2 font-medium">Saudáveis</th>
                <th className="py-2 px-2 font-medium">Em risco</th>
                <th className="py-2 pl-2 font-medium">Atrasados</th>
              </tr>
            </thead>
            <tbody>
              {data.ranking_pos.map((po) => (
                <tr key={po.po_id ?? po.full_name} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{po.full_name ?? "—"}</td>
                  <td className="py-2 px-2 tabular-nums">{po.total}</td>
                  <td className="py-2 px-2 tabular-nums">{po.total - po.em_risco}</td>
                  <td className="py-2 px-2">
                    {po.em_risco > 0 ? <Badge variant="destructive">{po.em_risco}</Badge> : <span className="text-muted-foreground">0</span>}
                  </td>
                  <td className="py-2 pl-2 tabular-nums">{po.atrasados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 5. Uma "página" por PO */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold">Detalhe por PO</h3>
        {data.por_po.map((po) => (
          <Card key={po.po_id ?? po.full_name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" /> {po.full_name ?? "—"}
              </CardTitle>
              <div className="pt-1"><PoKpiStrip kpis={po.kpis} /></div>
            </CardHeader>
            <CardContent>
              <ProjetosTable projetos={po.projetos} />
            </CardContent>
          </Card>
        ))}
      </section>

      {/* 6. Visão por Diretoria */}
      <Card>
        <CardHeader>
          <CardTitle>Visão por Diretoria</CardTitle>
          <CardDescription>Concentração do portfólio e quais diretorias puxam a execução para baixo.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Diretoria</th>
                <th className="py-2 px-2 font-medium">Projetos</th>
                <th className="py-2 px-2 font-medium">Planejamento</th>
                <th className="py-2 px-2 font-medium">Execução</th>
                <th className="py-2 px-2 font-medium">Encerramento</th>
                <th className="py-2 px-2 font-medium">Exec. média</th>
                <th className="py-2 pl-2 font-medium">Em risco</th>
              </tr>
            </thead>
            <tbody>
              {data.por_diretoria.map((d) => (
                <tr key={d.diretoria_label} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">
                    {d.sem_baseline ? <span className="italic text-muted-foreground">{d.diretoria_label}</span> : d.diretoria_label}
                  </td>
                  <td className="py-2 px-2 tabular-nums">{d.total}</td>
                  <td className="py-2 px-2 tabular-nums">{d.planejamento}</td>
                  <td className="py-2 px-2 tabular-nums">{d.execucao}</td>
                  <td className="py-2 px-2 tabular-nums">{d.encerramento}</td>
                  <td className="py-2 px-2 tabular-nums">{d.avg_exec_pct === null ? "—" : `${d.avg_exec_pct}%`}</td>
                  <td className="py-2 pl-2">
                    {d.em_risco > 0 ? <Badge variant="destructive">{d.em_risco}</Badge> : <span className="text-muted-foreground">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 7. Maiores atrasos */}
      {data.maiores_atrasos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Maiores atrasos</CardTitle>
            <CardDescription>A média esconde casos extremos — estes são os outliers que precisam de ação.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Entrega / Projeto</th>
                  <th className="py-2 px-2 font-medium">Nível</th>
                  <th className="py-2 px-2 font-medium">PO</th>
                  <th className="py-2 px-2 font-medium">Planejada</th>
                  <th className="py-2 px-2 font-medium">Real</th>
                  <th className="py-2 pl-2 font-medium">Atraso</th>
                </tr>
              </thead>
              <tbody>
                {data.maiores_atrasos.map((o, i) => (
                  <tr key={`${o.title}-${i}`} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{o.title}</span>
                      {o.nivel === "item" && o.projeto !== o.title && (
                        <span className="block text-xs text-muted-foreground">{o.projeto}</span>
                      )}
                    </td>
                    <td className="py-2 px-2"><Badge variant="secondary">{o.nivel}</Badge></td>
                    <td className="py-2 px-2 text-xs">{o.po ?? "—"}</td>
                    <td className="py-2 px-2 tabular-nums text-xs text-muted-foreground">{fmtDate(o.planejada)}</td>
                    <td className="py-2 px-2 tabular-nums text-xs text-muted-foreground">{fmtDate(o.real)}</td>
                    <td className="py-2 pl-2"><Badge variant="destructive">+{o.atraso_dias}d</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* 8. Próximos passos */}
      {data.proximos_passos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Próximos passos</CardTitle>
            <CardDescription>Ações sugeridas a partir dos achados acima.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {data.proximos_passos.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.meta.generated_at && (
        <p className="text-right text-xs text-muted-foreground">
          Gerado em {new Date(data.meta.generated_at).toLocaleString("pt-BR")}
        </p>
      )}
    </div>
  )
}
