import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CalendarX,
  CheckCircle2,
  Clock,
  FolderKanban,
  HelpCircle,
  Layers,
  Lock,
  Users,
  X,
} from "lucide-react"

import {
  projetosApi,
  type PoSyncFase,
  type PoSyncKpis,
  type PoSyncProjeto,
  type PoSyncResponse,
} from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Card, FilterSelect, Pill, SectionCard, TABLE, type Tone } from "@/components/ds"

const ALL = "__all__" // sentinela: sem filtro (Radix proíbe value="")

// Ordem canônica das fases (planejamento → produção → concluído, impedimento à parte).
const FASES: PoSyncFase[] = [
  "planejamento", "desenvolvimento", "homologacao", "producao", "concluido", "impedimento",
]
const FASE_LABEL: Record<PoSyncFase, string> = {
  planejamento: "Planejamento",
  desenvolvimento: "Desenvolvimento",
  homologacao: "Homologação",
  producao: "Produção",
  concluido: "Concluído",
  impedimento: "Impedimento",
}
// Tom do selo (Pill) de cada fase — mesmo mapa do PO Sync. Impedimento = VERMELHO de verdade (o
// "destructive" do tema é o laranja da marca, #E84E0F); Operação Assistida usa teal, como no Portal.
const FASE_TONE: Record<PoSyncFase, Tone> = {
  planejamento: "slate",
  desenvolvimento: "blue",
  homologacao: "violet",
  producao: "teal",
  concluido: "emerald",
  impedimento: "red",
}
const MESES_NOME = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

// Rótulo dos contadores ("N em desenvolvimento" / "N concluído(s)").
const FASE_KPI_LABEL: Record<PoSyncFase, string> = {
  planejamento: "em planejamento",
  desenvolvimento: "em desenvolvimento",
  homologacao: "em homologação",
  producao: "em produção",
  concluido: "concluído(s)",
  impedimento: "em impedimento",
}
// Abreviação para chips compactos nas tabelas de agregação.
const FASE_ABBR: Record<PoSyncFase, string> = {
  planejamento: "Plan",
  desenvolvimento: "Desenv",
  homologacao: "Homol",
  producao: "Prod",
  concluido: "Concl",
  impedimento: "Imped",
}

/** Contagem por fase, compacta: só fases com valor > 0, como mini-badges. */
function FaseChips({ fases }: { fases: Record<PoSyncFase, number> }) {
  const items = FASES.filter((f) => (fases[f] ?? 0) > 0)
  if (items.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((f) => (
        <span key={f} title={FASE_LABEL[f]} className="inline-flex">
          <Pill tone={FASE_TONE[f]}>{FASE_ABBR[f]} {fases[f]}</Pill>
        </span>
      ))}
    </div>
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

/** % de conclusão = itens concluídos / itens da subárvore (base de contagem, não de horas). */
function conclPct(p: PoSyncProjeto): number | null {
  if (p.subtree_total <= 0) return null
  return Math.round((p.subtree_completed / p.subtree_total) * 100)
}

function conclLabel(p: PoSyncProjeto): string {
  const pct = conclPct(p)
  return pct === null ? "—" : `${pct}%`
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
  // Referência é SEMPRE o prazo planejado (Data fim planejada):
  //  - Concluído: conclusão ≤ planejada → "No prazo"; senão "+Nd" (atraso na entrega).
  //  - Não concluído: planejada < hoje → "+Nd" (atraso corrente, hoje − planejada);
  //    planejada no futuro → "No prazo".
  //  - Sem data planejada → "sem baseline".
  if (!p.due_date) {
    return (
      <span className="text-xs text-muted-foreground" title="Sem Data Fim Planejada para comparar">
        sem baseline
      </span>
    )
  }
  if (p.completed_at) {
    if (p.prazo_status === "atrasado") {
      return (
        <span className="inline-flex" title={`Projeto entregue com atraso de ${p.atraso_dias}d em relação ao prazo planejado`}>
          <Pill tone="red">+{p.atraso_dias}d</Pill>
        </span>
      )
    }
    return <span className="inline-flex" title="Concluído dentro do prazo planejado"><Pill tone="emerald" dot>No prazo</Pill></span>
  }
  // Em andamento: atraso corrente vem do backend; fallback calcula pela data planejada.
  const diasCorrente =
    p.atraso_corrente_dias ??
    Math.max(0, Math.floor((Date.now() - new Date(p.due_date).getTime()) / 86_400_000))
  if (diasCorrente > 0) {
    return (
      <span
        className="inline-flex"
        title={`Em andamento com prazo estourado há ${diasCorrente}d (hoje − planejada) — o atraso cresce até a entrega`}
      >
        <Pill tone="red">+{diasCorrente}d</Pill>
      </span>
    )
  }
  return <span className="inline-flex" title="Em andamento com prazo planejado ainda no futuro"><Pill tone="emerald" dot>No prazo</Pill></span>
}

type RiskIcon = {
  key: string
  Icon: typeof AlertTriangle
  tip: string
  className: string
}

/** Ícones de risco por projeto — cada um com tooltip explicando o motivo. */
function projectRiskIcons(p: PoSyncProjeto): RiskIcon[] {
  const out: RiskIcon[] = []
  if (p.fora_da_regra) {
    // Primeiro da lista: é o único que impede o time de trabalhar agora.
    out.push({
      key: "regra-cronograma",
      Icon: Lock,
      tip: p.regra_motivo === "schedule_incomplete"
        ? `Fora da regra: ${p.regra_etapas_pendentes} etapa(s) do cronograma sem responsável, `
          + "horas ou datas. Features e User Stories não avançam até corrigir."
        : `Fora da regra: ${p.regra_motivo_label}. Features e User Stories não avançam até corrigir.`,
      className: "text-destructive",
    })
  }
  if (p.overdue) {
    out.push({
      key: "overdue",
      Icon: AlertTriangle,
      tip: "Em risco: há itens atrasados ou com SLA estourado",
      className: "text-destructive",
    })
  }
  if (p.prazo_status === "atrasado") {
    out.push({
      key: "atraso",
      Icon: Clock,
      tip: `Entregue com atraso de ${p.atraso_dias}d em relação ao prazo planejado`,
      className: "text-destructive",
    })
  }
  if (p.backlog_montado) {
    out.push({
      key: "backlog",
      Icon: Layers,
      tip: "Backlog montado, execução ainda não iniciada",
      className: "text-amber-600 dark:text-amber-400",
    })
  }
  if (p.sem_datas_planejadas) {
    out.push({
      key: "sem-datas",
      Icon: CalendarX,
      tip: "Sem datas planejadas (início e fim) — saúde de prazo não avaliável",
      className: "text-amber-600 dark:text-amber-400",
    })
  }
  if (p.baseline_inconsistente) {
    out.push({
      key: "baseline",
      Icon: AlertTriangle,
      tip: "Baseline inconsistente (fim antes do início ou data inválida)",
      className: "text-amber-600 dark:text-amber-400",
    })
  }
  if (p.sem_diretoria) {
    out.push({
      key: "diretoria",
      Icon: FolderKanban,
      tip: "Sem diretoria cadastrada — não entra na visão por diretoria",
      className: "text-muted-foreground",
    })
  }
  return out
}

function ProjectRiskIcons({ p }: { p: PoSyncProjeto }) {
  const icons = projectRiskIcons(p)
  if (icons.length === 0) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {icons.map(({ key, Icon, tip, className }) => (
        <span key={key} className={`group/ri relative inline-flex ${className}`}>
          <span
            aria-label={tip}
            className="inline-flex cursor-help rounded p-0.5 hover:bg-muted"
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="pointer-events-none absolute bottom-full left-1/2 z-[60] mb-1.5 hidden w-max max-w-[260px] -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-left text-[11px] leading-snug text-popover-foreground shadow-md group-hover/ri:block">
            {tip}
          </span>
        </span>
      ))}
    </span>
  )
}

/** Descrições de cada coluna — o que é e como é computado (exibidas no tooltip do cabeçalho). */
const COLUNA_TIPS: Record<string, string> = {
  projeto:
    "Card-raiz do projeto (o topo da árvore de planejamento). O subtítulo mostra a etapa atual (stage) do card. Ícones ao lado sinalizam riscos.",
  fase:
    "Fase do projeto pela ETAPA atual do card-raiz no Kanban: Planejamento (backlog, requisitos, refinamento, pronto p/ dev), Desenvolvimento, Homologação, Produção, Concluído (etapa final) ou Impedimento (card parado na coluna de impedimento). Deriva do nome da etapa, não da subárvore.",
  execucao:
    "Andamento das histórias (US) no fluxo do Kanban. Cada US ganha um peso pela POSIÇÃO da sua etapa no funil, calculado dinamicamente: 1ª etapa produtiva (Backlog) = 0%, última (Concluído) = 100%, e as intermediárias distribuídas linearmente pela ordem das colunas — então criar/remover etapas reajusta os pesos sozinho. Impedimento não é etapa produtiva: a US herda o peso da etapa produtiva imediatamente ANTERIOR à coluna de Impedimento no funil (não há histórico de status para saber de onde veio). Histórias em \"Não realizado\" (Cancelado/Rejeitado) ficam fora do cálculo. Execução = média dos pesos das US = soma dos pesos ÷ nº de histórias. Recalcula a cada mudança de status. Em Planejamento aparece \"—\".",
  conclusao:
    "Proporção de itens efetivamente concluídos: itens no estágio final ÷ total de itens vivos da subárvore (contagem, não horas). Sem itens vivos aparece \"—\".",
  diretoria:
    "Diretoria vinculada ao projeto. \"sem diretoria\" indica que o card-raiz não tem diretoria cadastrada e não entra nas visões por diretoria.",
  prazo_plan:
    "Data-fim planejada (baseline) do card-raiz. \"—\" quando não há data-fim planejada.",
  prazo:
    "Aderência ao prazo, comparando a data real de conclusão com o prazo planejado: \"No prazo\", \"+Nd\" (dias de atraso) ou \"sem baseline\" quando falta data planejada ou data real para comparar.",
}

/** Cabeçalho de coluna com tooltip explicando o que é e como é computado. */
function ThTip({
  label,
  tip,
  className,
}: {
  label: string
  tip: string
  className?: string
}) {
  return (
    <th className={className}>
      <span className="group/th relative inline-flex cursor-help items-center gap-1">
        {label}
        <HelpCircle className="h-3 w-3 opacity-50" />
        <span className="pointer-events-none absolute top-full left-0 z-[60] mt-1.5 hidden w-max max-w-[320px] whitespace-normal rounded-md border bg-popover px-2.5 py-1.5 text-left text-[11px] normal-case leading-snug tracking-normal text-popover-foreground shadow-md group-hover/th:block">
          {tip}
        </span>
      </span>
    </th>
  )
}

/** Tabela com TODOS os projetos de um recorte (PO). Nunca trunca em "+N". */
function ProjetosTable({ projetos }: { projetos: PoSyncProjeto[] }) {
  return (
    <div className={TABLE.wrap}>
      <table className={TABLE.table}>
        <thead className={TABLE.thead}>
          <tr>
            <ThTip label="Projeto" tip={COLUNA_TIPS.projeto} className={TABLE.thFirst} />
            <ThTip label="Fase" tip={COLUNA_TIPS.fase} className={TABLE.th} />
            <ThTip label="Execução" tip={COLUNA_TIPS.execucao} className={TABLE.th} />
            <ThTip label="Conclusão" tip={COLUNA_TIPS.conclusao} className={TABLE.th} />
            <ThTip label="Diretoria" tip={COLUNA_TIPS.diretoria} className={TABLE.th} />
            <ThTip label="Prazo plan." tip={COLUNA_TIPS.prazo_plan} className={TABLE.th} />
            <ThTip label="Prazo" tip={COLUNA_TIPS.prazo} className={`${TABLE.th} pr-4`} />
          </tr>
        </thead>
        <tbody>
          {projetos.map((p) => (
            <tr key={p.task_id} className={`${TABLE.tr} align-top`}>
              <td className={TABLE.tdFirst}>
                <div className="flex items-center gap-1.5">
                  <span className="font-medium" title={p.title}>{p.title}</span>
                  <ProjectRiskIcons p={p} />
                </div>
                {p.stage_name && (
                  <span className="text-xs text-muted-foreground">{p.stage_name}</span>
                )}
              </td>
              <td className={TABLE.td}>
                <div className="flex flex-wrap items-center gap-1">
                  <Pill tone={FASE_TONE[p.fase]} dot>{FASE_LABEL[p.fase]}</Pill>
                  {p.em_operacao_assistida && <Pill tone="teal">Operação Assistida</Pill>}
                </div>
              </td>
              <td className={TABLE.td}>
                <div className="flex min-w-[110px] items-center gap-2">
                  <span className="tabular-nums w-9 shrink-0">{execLabel(p)}</span>
                  {p.exec_pct !== null && <MiniBar value={p.exec_pct} max={100} />}
                </div>
              </td>
              <td className={TABLE.td}>
                <div
                  className="flex min-w-[110px] items-center gap-2"
                  title={`${p.subtree_completed} de ${p.subtree_total} itens concluídos`}
                >
                  <span className="tabular-nums w-9 shrink-0">{conclLabel(p)}</span>
                  {conclPct(p) !== null && (
                    <MiniBar value={conclPct(p)!} max={100} color="hsl(142 71% 45%)" />
                  )}
                </div>
              </td>
              <td className={TABLE.td}>
                <span className="text-xs" title={p.diretoria_label ?? "Sem diretoria cadastrada"}>
                  {p.diretoria_label ?? <span className="text-muted-foreground italic">sem diretoria</span>}
                </span>
              </td>
              <td className={`${TABLE.td} tabular-nums text-xs text-muted-foreground`}>{fmtDate(p.due_date)}</td>
              <td className={`${TABLE.td} pr-4`}><PrazoBadge p={p} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const FORA_DA_REGRA_TIP =
  "Projetos cujo cronograma impede Features e User Stories de avançarem: projeto que não "
  + "entrou em desenvolvimento, sem cronograma cadastrado, ou com etapas sem responsável, "
  + "horas ou datas"

const EM_RISCO_TIP =
  "Projetos com itens atrasados, SLA estourado ou entregues fora do prazo planejado"

function EmRiscoBadge({ count }: { count: number }) {
  if (count <= 0) return <span className="text-muted-foreground">0</span>
  return (
    <span className="group/er relative inline-flex">
      <Pill tone="red" dot className="cursor-help">{count}</Pill>
      <span className="pointer-events-none absolute bottom-full left-0 z-[60] mb-1.5 hidden w-max max-w-[260px] rounded-md border bg-popover px-2.5 py-1.5 text-left text-[11px] leading-snug text-popover-foreground shadow-md group-hover/er:block">
        {EM_RISCO_TIP}
      </span>
    </span>
  )
}

function PoKpiStrip({ kpis }: { kpis: PoSyncKpis }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Pill tone="slate">{kpis.total} projeto(s)</Pill>
      {FASES.filter((f) => (kpis.fases[f] ?? 0) > 0).map((f) => (
        <Pill key={f} tone={FASE_TONE[f]} dot>
          {kpis.fases[f]} {FASE_KPI_LABEL[f]}
        </Pill>
      ))}
      <Pill tone="slate">
        exec. média {kpis.avg_exec_pct === null ? "—" : `${kpis.avg_exec_pct}%`}
      </Pill>
      {kpis.fora_da_regra > 0 && (
        <span className="group/fr relative inline-flex">
          <Pill tone="red" className="cursor-help">
            <Lock className="h-3 w-3" />{kpis.fora_da_regra} fora da regra
          </Pill>
          <span className="pointer-events-none absolute bottom-full left-0 z-[60] mb-1.5 hidden w-max max-w-[280px] rounded-md border bg-popover px-2.5 py-1.5 text-left text-[11px] leading-snug text-popover-foreground shadow-md group-hover/fr:block">
            {FORA_DA_REGRA_TIP}
          </span>
        </span>
      )}
      {kpis.em_risco > 0 && (
        <span className="group/er relative inline-flex">
          <Pill tone="red" className="cursor-help">{kpis.em_risco} em risco</Pill>
          <span className="pointer-events-none absolute bottom-full left-0 z-[60] mb-1.5 hidden w-max max-w-[260px] rounded-md border bg-popover px-2.5 py-1.5 text-left text-[11px] leading-snug text-popover-foreground shadow-md group-hover/er:block">
            {EM_RISCO_TIP}
          </span>
        </span>
      )}
    </div>
  )
}

export default function StatusReportsPage() {
  const [data, setData] = useState<PoSyncResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [diretoria, setDiretoria] = useState<string>(ALL)
  const [area, setArea] = useState<string>(ALL)
  const [monthValue, setMonthValue] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${d.getMonth() + 1}`
  })
  const [anoSel, mesSel] = monthValue.split("-").map(Number)

  const monthOpts = useMemo(() => {
    const base = new Date()
    const out: { value: string; label: string }[] = []
    for (let off = -6; off <= 6; off++) {
      const d = new Date(base.getFullYear(), base.getMonth() + off, 1)
      const m = d.getMonth() + 1
      const y = d.getFullYear()
      out.push({ value: `${y}-${m}`, label: `${MESES_NOME[m]}/${y}` })
    }
    return out
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    projetosApi
      .getPoSync({
        diretoria: diretoria === ALL ? null : diretoria,
        area: area === ALL ? null : area,
        mes: mesSel,
        ano: anoSel,
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
  }, [diretoria, area, monthValue])

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <EmptyState
          icon={Users}
          title="Sem projetos para o Status Report"
          description="Nenhum projeto/programa atribuído a um PO neste recorte. Ajuste os filtros ou cadastre o portfólio."
        />
      </Card>
    )
  }

  const hasFilter = diretoria !== ALL || area !== ALL

  const filters = (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Diretoria"
          value={diretoria}
          onChange={setDiretoria}
          options={[{ value: ALL, label: "Todas as diretorias" }, ...data.available_diretorias]}
        />
        <FilterSelect
          label="Área"
          value={area}
          onChange={setArea}
          options={[{ value: ALL, label: "Todas as áreas" }, ...data.available_areas]}
        />
        {hasFilter && (
          <Button variant="ghost" className="h-10 gap-1" onClick={() => { setDiretoria(ALL); setArea(ALL) }}>
            <X size={15} /> Limpar filtros
          </Button>
        )}
      </div>
    </Card>
  )

  // Recorte sem projetos: os filtros continuam na tela — sem eles não havia como desfazer.
  if (data.capa.total_projetos === 0) {
    return (
      <div className="space-y-5">
        {filters}
        <Card>
          <EmptyState
            icon={Users}
            title="Sem projetos para o Status Report"
            description={
              hasFilter
                ? "Nenhum projeto/programa neste recorte de diretoria/área."
                : "Nenhum projeto/programa atribuído a um PO. Cadastre o portfólio."
            }
            {...(hasFilter ? { action: { label: "Limpar filtros", onClick: () => { setDiretoria(ALL); setArea(ALL) } } } : {})}
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      {filters}

      <div>
        <h2 className="text-lg font-semibold">Status Report — Portfólio</h2>
        <p className="text-sm text-muted-foreground">
          Visão consolidada do status dos projetos, liderada por Product Owner. Fase derivada da situação
          real dos itens; execução desconta itens despriorizados.
        </p>
      </div>

      {/* Visão por Diretoria */}
      <SectionCard
        title="Visão por Diretoria"
        subtitle="Concentração do portfólio e quais diretorias puxam a execução para baixo."
        flush
      >
        <div className={TABLE.wrap}>
          <table className={TABLE.table}>
            <thead className={TABLE.thead}>
              <tr>
                <th className={TABLE.thFirst}>Diretoria</th>
                <th className={TABLE.th}>Projetos</th>
                <th className={TABLE.th}>Distribuição por fase</th>
                <th className={TABLE.th}>Exec. média</th>
                <th className={`${TABLE.th} pr-4`}>Em risco</th>
              </tr>
            </thead>
            <tbody>
              {data.por_diretoria.map((d) => (
                <tr key={d.diretoria_label} className={`${TABLE.tr} align-top`}>
                  <td className={`${TABLE.tdFirst} font-medium`}>
                    {d.sem_baseline ? <span className="italic text-muted-foreground">{d.diretoria_label}</span> : d.diretoria_label}
                  </td>
                  <td className={`${TABLE.td} tabular-nums`}>{d.total}</td>
                  <td className={TABLE.td}><FaseChips fases={d.fases} /></td>
                  <td className={`${TABLE.td} tabular-nums`}>{d.avg_exec_pct === null ? "—" : `${d.avg_exec_pct}%`}</td>
                  <td className={`${TABLE.td} pr-4`}>
                    <EmRiscoBadge count={d.em_risco} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Entregas a nível de projeto (com filtro de mês) */}
      <SectionCard
        title="Entregas por projeto"
        subtitle="Concluídas no mês selecionado · previstas para o mês seguinte · impedimentos — a nível de projeto (card-raiz)."
        right={<FilterSelect label="Mês" value={monthValue} onChange={setMonthValue} options={monthOpts} />}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Concluídas — {data.entregas_projeto.mes_label}
              <span className="text-xs font-normal text-muted-foreground">({data.entregas_projeto.concluidas.length})</span>
            </p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {data.entregas_projeto.concluidas.length === 0
                ? <p className="text-xs text-muted-foreground">Nenhum projeto concluído no mês.</p>
                : data.entregas_projeto.concluidas.map((p) => (
                  <div key={p.task_id} className="border-b pb-1.5 text-xs last:border-0">
                    <div className="font-medium">{p.title}</div>
                    <div className="text-muted-foreground">
                      {p.po ?? "—"} · {fmtDate(p.completed_at)}
                      {p.em_operacao_assistida && <span className="ml-1 text-teal-600 dark:text-teal-400">· em operação assistida</span>}
                      {p.prazo_status === "atrasado" && <Pill tone="red" className="ml-1">+{p.atraso_dias}d</Pill>}
                      {p.prazo_status === "no_prazo" && <span className="ml-1 text-emerald-600 dark:text-emerald-400">no prazo</span>}
                    </div>
                  </div>
                ))}
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" /> Previstas — {data.entregas_projeto.proximo_mes_label}
              <span className="text-xs font-normal text-muted-foreground">({data.entregas_projeto.previstas.length})</span>
            </p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {data.entregas_projeto.previstas.length === 0
                ? <p className="text-xs text-muted-foreground">Nada previsto para o próximo mês.</p>
                : data.entregas_projeto.previstas.map((p) => (
                  <div key={p.task_id} className="border-b pb-1.5 text-xs last:border-0">
                    <div className="font-medium">{p.title}</div>
                    <div className="text-muted-foreground">{p.po ?? "—"} · prazo {fmtDate(p.due_date)}</div>
                  </div>
                ))}
            </div>
          </div>
          <div className="rounded-xl border border-red-200 p-3 dark:border-red-900">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" /> Impedimentos
              <span className="text-xs font-normal text-muted-foreground">({data.entregas_projeto.riscos.length})</span>
            </p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {data.entregas_projeto.riscos.length === 0
                ? <p className="text-xs text-muted-foreground">Sem impedimentos.</p>
                : data.entregas_projeto.riscos.map((p) => (
                  <div key={p.task_id} className="border-b pb-1.5 text-xs last:border-0">
                    <div className="font-medium">{p.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className="text-muted-foreground">{p.po ?? "—"}</span>
                      {p.motivos.map((m, i) => (
                        <Pill key={i} tone={m.startsWith("Impedimento") ? "red" : "amber"}>
                          {m}
                        </Pill>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Detalhe por PO */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Detalhe por PO</h2>
        {data.por_po.map((po) => (
          <SectionCard key={po.po_id ?? po.full_name} title={po.full_name ?? "—"} icon={Users} flush>
            <div className="border-b px-5 py-3"><PoKpiStrip kpis={po.kpis} /></div>
            <ProjetosTable projetos={po.projetos} />
          </SectionCard>
        ))}
      </section>

      {data.meta.generated_at && (
        <p className="text-right text-xs text-muted-foreground">
          Gerado em {new Date(data.meta.generated_at).toLocaleString("pt-BR")}
        </p>
      )}
    </div>
  )
}
