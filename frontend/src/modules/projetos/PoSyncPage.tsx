import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  CalendarX,
  CheckCircle2,
  Clock,
  Filter,
  FolderKanban,
  HeartPulse,
  HelpCircle,
  Layers,
  Lock,
  ListChecks,
  Package,
  Target,
  TrendingDown,
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
  type PoSyncSaudeProdutoCritico,
  type PoSyncSaudeProdutoStatus,
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
type BadgeVariant = "warning" | "default" | "success" | "secondary" | "outline" | "destructive"
const FASE_VARIANT: Record<PoSyncFase, BadgeVariant> = {
  planejamento: "warning",
  desenvolvimento: "default",
  homologacao: "secondary",
  producao: "outline",
  concluido: "success",
  impedimento: "destructive",
}
// Impedimento = VERMELHO de verdade. O "destructive" do tema é o laranja da marca (#E84E0F),
// então forçamos um vermelho explícito (o twMerge do Badge sobrepõe o bg da variante).
const FASE_CLASS: Record<PoSyncFase, string> = {
  planejamento: "",
  desenvolvimento: "",
  homologacao: "",
  producao: "",
  concluido: "",
  impedimento: "border-transparent bg-red-600 text-white hover:bg-red-600",
}
const MESES_NOME = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

// Tipos de projeto (classificação do card-raiz) — sempre exibidos no panorama por tipo.
const CLASS_TILES: Array<{ key: "implantacao" | "desenvolvimento" | "melhoria"; label: string }> = [
  { key: "implantacao", label: "Implantação" },
  { key: "desenvolvimento", label: "Desenvolvimento" },
  { key: "melhoria", label: "Melhoria" },
]

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
function FaseChips({
  fases,
  bloqueados = 0,
}: {
  fases: Record<PoSyncFase, number>
  /** Projetos fora da regra de cronograma — atravessam as fases, por isso vêm
   *  separados por um divisor em vez de virar mais uma fase. */
  bloqueados?: number
}) {
  const items = FASES.filter((f) => (fases[f] ?? 0) > 0)
  if (items.length === 0 && bloqueados <= 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((f) => (
        <Badge key={f} variant={FASE_VARIANT[f]} className={`font-normal ${FASE_CLASS[f]}`} title={FASE_LABEL[f]}>
          {FASE_ABBR[f]} {fases[f]}
        </Badge>
      ))}
      {bloqueados > 0 && (
        <>
          {items.length > 0 && <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />}
          <span className="group/bl relative inline-flex">
            <Badge variant="destructive" className="cursor-help gap-1 font-normal">
              <Lock className="h-3 w-3" />{bloqueados}
            </Badge>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-[60] mb-1.5 hidden w-max max-w-[280px] -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-left text-[11px] leading-snug text-popover-foreground shadow-md group-hover/bl:block">
              {bloqueados} projeto(s) bloqueado(s): {FORA_DA_REGRA_TIP}
            </span>
          </span>
        </>
      )}
    </div>
  )
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

function classeScoreTone(classe: string): string {
  if (classe === "saudavel") return "text-emerald-600"
  if (classe === "atencao") return "text-amber-600"
  if (classe === "critico") return "text-red-600"
  return "text-muted-foreground"
}

/**
 * Painel de hover CENTRALIZADO na tela (position: fixed) — escapa do recorte das tabelas
 * (overflow) e do viewport, então nunca corta. Mostrado no hover do gatilho.
 * pointer-events-none: some ao sair do gatilho (não é interativo/rolável).
 */
function HoverPanel({ trigger, children, className }: { trigger: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={`group/hp relative cursor-help ${className ?? "inline-flex"}`}>
      {trigger}
      <span className="pointer-events-none fixed left-1/2 top-1/2 z-[100] hidden max-h-[85vh] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border bg-popover px-4 py-3 text-left text-xs leading-snug text-popover-foreground shadow-2xl group-hover/hp:block">
        {children}
      </span>
    </span>
  )
}

/** Agrupa os projetos "backlog montado" por PO, do maior grupo para o menor. */
function groupBacklogByPo(
  projetos: Array<{ title: string; po: string | null }>,
): Array<[string, string[]]> {
  const m = new Map<string, string[]>()
  for (const p of projetos) {
    const po = p.po ?? "Sem PO"
    if (!m.has(po)) m.set(po, [])
    m.get(po)!.push(p.title)
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
}

/** Envolve um elemento e, no hover, mostra a lista de produtos (nome + score) daquela faixa. */
function ProdutosTip({
  produtos,
  titulo,
  children,
}: {
  produtos: PoSyncSaudeProdutosFaixa["produtos"]
  titulo: string
  children: ReactNode
}) {
  if (!produtos || produtos.length === 0) return <>{children}</>
  const MAX = 40
  const shown = produtos.slice(0, MAX)
  const rest = produtos.length - shown.length
  return (
    <HoverPanel trigger={children}>
      <span className="mb-1.5 block font-medium normal-case">{titulo} · {produtos.length} produto(s)</span>
      <span className="block space-y-0.5">
        {shown.map((pr, i) => (
          <span key={`${pr.name}-${i}`} className="flex items-center justify-between gap-3">
            <span className="truncate">{pr.name || "—"}</span>
            <span className={`tabular-nums font-semibold ${classeScoreTone(pr.classe)}`}>{pr.score}</span>
          </span>
        ))}
        {rest > 0 && <span className="block pt-0.5 text-muted-foreground">+{rest} produto(s)…</span>}
      </span>
    </HoverPanel>
  )
}

function FaixaScoreCell({ faixa, label, titulo }: { faixa: PoSyncSaudeProdutosFaixa; label: string; titulo: string }) {
  return (
    <td className="py-2.5 px-2 align-top">
      <ProdutosTip produtos={faixa.produtos} titulo={titulo}>
        <div>
          <div className={`tabular-nums ${scoreTone(faixa.score_medio)}`}>{fmtScore(faixa.score_medio)}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{faixa.total} {label}</div>
        </div>
      </ProdutosTip>
    </td>
  )
}

/** Tooltip que lista os produtos críticos e, para cada um, POR QUE é crítico (checks que falharam). */
function CriticosTip({
  criticos,
  children,
}: {
  criticos: PoSyncSaudeProdutoCritico[]
  children: ReactNode
}) {
  if (!criticos || criticos.length === 0) return <>{children}</>
  const MAX = 22
  const shown = criticos.slice(0, MAX)
  const rest = criticos.length - shown.length
  return (
    <HoverPanel trigger={children}>
      <span className="mb-1.5 block font-medium normal-case">
        {criticos.length} produto(s) crítico(s) — por que
      </span>
      <span className="block space-y-1.5">
        {shown.map((c, i) => (
          <span key={`${c.name}-${i}`} className="block">
            <span className="flex items-center justify-between gap-3">
              <span className="truncate font-medium">{c.name || "—"}</span>
              <span className="tabular-nums font-semibold text-red-600">{c.score}</span>
            </span>
            {c.motivos.length > 0 && (
              <span className="mt-0.5 block text-muted-foreground">Falhou: {c.motivos.join(" · ")}</span>
            )}
          </span>
        ))}
        {rest > 0 && <span className="block pt-0.5 text-muted-foreground">+{rest} produto(s)…</span>}
      </span>
    </HoverPanel>
  )
}

// Classes de saúde na ordem pedida: crítico → atenção → ok.
const CLASSE_ORDER: PoSyncSaudeProdutoStatus["classe"][] = ["critico", "atencao", "saudavel"]
const CLASSE_LABEL: Record<PoSyncSaudeProdutoStatus["classe"], string> = {
  critico: "Crítico", atencao: "Atenção", saudavel: "OK",
}
const CLASSE_DOT: Record<PoSyncSaudeProdutoStatus["classe"], string> = {
  critico: "bg-red-500", atencao: "bg-amber-500", saudavel: "bg-emerald-500",
}
const CLASSE_TEXT: Record<PoSyncSaudeProdutoStatus["classe"], string> = {
  critico: "text-red-600", atencao: "text-amber-600", saudavel: "text-emerald-600",
}

/** Tooltip único da barra de saúde: produtos por classe (crítico → atenção → ok), com o porquê. */
function SaudeDistTip({ itens, children }: { itens: PoSyncSaudeProdutoStatus[]; children: ReactNode }) {
  if (!itens || itens.length === 0) return <>{children}</>
  const porClasse = (cl: PoSyncSaudeProdutoStatus["classe"]) => itens.filter((p) => p.classe === cl)
  const CAP = 10
  return (
    <HoverPanel trigger={children}>
      {CLASSE_ORDER.map((cl) => {
        const arr = porClasse(cl)
        if (arr.length === 0) return null
        const shown = arr.slice(0, CAP)
        const rest = arr.length - shown.length
        return (
          <span key={cl} className="mb-2 block last:mb-0">
            <span className="mb-0.5 flex items-center gap-1.5 font-medium normal-case">
              <span className={`inline-block h-2 w-2 rounded-full ${CLASSE_DOT[cl]}`} />
              <span className={CLASSE_TEXT[cl]}>{CLASSE_LABEL[cl]}</span>
              <span className="text-muted-foreground">· {arr.length}</span>
            </span>
            <span className="block space-y-0.5 pl-3.5">
              {shown.map((p, i) => (
                <span key={`${p.name}-${i}`} className="block">
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate">{p.name || "—"}</span>
                    <span className={`tabular-nums font-semibold ${CLASSE_TEXT[cl]}`}>{p.score}</span>
                  </span>
                  <span className="block text-muted-foreground">
                    {p.motivos.length > 0 ? `Falhou: ${p.motivos.join(" · ")}` : "sem pendências"}
                  </span>
                </span>
              ))}
              {rest > 0 && <span className="block text-muted-foreground">+{rest} produto(s)…</span>}
            </span>
          </span>
        )
      })}
    </HoverPanel>
  )
}

function SaudeDistribuicaoBar({ itens }: { itens: PoSyncSaudeProdutoStatus[] }) {
  const saudavel = itens.filter((p) => p.classe === "saudavel").length
  const atencao = itens.filter((p) => p.classe === "atencao").length
  const critico = itens.filter((p) => p.classe === "critico").length
  const total = saudavel + atencao + critico
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>
  const pct = (n: number) => Math.round((n / total) * 100)
  return (
    <SaudeDistTip itens={itens}>
      <div className="w-full space-y-1">
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
    </SaudeDistTip>
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
      <FaixaScoreCell faixa={po.producao} label="em prod." titulo="Produção" />
      <FaixaScoreCell faixa={po.desenvolvimento} label="em dev." titulo="Desenvolvimento" />
      <td className="py-2.5 px-2 tabular-nums text-center text-muted-foreground">
        <ProdutosTip produtos={po.outros.produtos} titulo="Outros">
          <span>{po.outros.total || "—"}</span>
        </ProdutosTip>
      </td>
      <td className="py-2.5 px-2 min-w-[140px]">
        <SaudeDistribuicaoBar itens={po.itens} />
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
        <Badge
          variant="destructive"
          title={`Projeto entregue com atraso de ${p.atraso_dias}d em relação ao prazo planejado`}
        >
          +{p.atraso_dias}d
        </Badge>
      )
    }
    return <Badge variant="success" title="Concluído dentro do prazo planejado">No prazo</Badge>
  }
  // Em andamento: atraso corrente vem do backend; fallback calcula pela data planejada.
  const diasCorrente =
    p.atraso_corrente_dias ??
    Math.max(0, Math.floor((Date.now() - new Date(p.due_date).getTime()) / 86_400_000))
  if (diasCorrente > 0) {
    return (
      <Badge
        variant="destructive"
        title={`Em andamento com prazo estourado há ${diasCorrente}d (hoje − planejada) — o atraso cresce até a entrega`}
      >
        +{diasCorrente}d
      </Badge>
    )
  }
  return <Badge variant="success" title="Em andamento com prazo planejado ainda no futuro">No prazo</Badge>
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
      className: "text-amber-600",
    })
  }
  if (p.sem_datas_planejadas) {
    out.push({
      key: "sem-datas",
      Icon: CalendarX,
      tip: "Sem datas planejadas (início e fim) — saúde de prazo não avaliável",
      className: "text-amber-600",
    })
  }
  if (p.baseline_inconsistente) {
    out.push({
      key: "baseline",
      Icon: AlertTriangle,
      tip: "Baseline inconsistente (fim antes do início ou data inválida)",
      className: "text-amber-600",
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
    <th className={`py-2 font-medium ${className ?? ""}`}>
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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <ThTip label="Projeto" tip={COLUNA_TIPS.projeto} className="pr-3" />
            <ThTip label="Fase" tip={COLUNA_TIPS.fase} className="px-2" />
            <ThTip label="Execução" tip={COLUNA_TIPS.execucao} className="px-2" />
            <ThTip label="Conclusão" tip={COLUNA_TIPS.conclusao} className="px-2" />
            <ThTip label="Diretoria" tip={COLUNA_TIPS.diretoria} className="px-2" />
            <ThTip label="Prazo plan." tip={COLUNA_TIPS.prazo_plan} className="px-2" />
            <ThTip label="Prazo" tip={COLUNA_TIPS.prazo} className="pl-2" />
          </tr>
        </thead>
        <tbody>
          {projetos.map((p) => (
            <tr key={p.task_id} className="border-b last:border-0 align-top">
              <td className="py-2 pr-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium" title={p.title}>{p.title}</span>
                  <ProjectRiskIcons p={p} />
                </div>
                {p.stage_name && (
                  <span className="text-xs text-muted-foreground">{p.stage_name}</span>
                )}
              </td>
              <td className="py-2 px-2">
                <Badge variant={FASE_VARIANT[p.fase]} className={FASE_CLASS[p.fase]}>{FASE_LABEL[p.fase]}</Badge>
              </td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-2">
                  <span className="tabular-nums w-9 shrink-0">{execLabel(p)}</span>
                  {p.exec_pct !== null && <MiniBar value={p.exec_pct} max={100} />}
                </div>
              </td>
              <td className="py-2 px-2">
                <div
                  className="flex items-center gap-2"
                  title={`${p.subtree_completed} de ${p.subtree_total} itens concluídos`}
                >
                  <span className="tabular-nums w-9 shrink-0">{conclLabel(p)}</span>
                  {conclPct(p) !== null && (
                    <MiniBar value={conclPct(p)!} max={100} color="hsl(142 71% 45%)" />
                  )}
                </div>
              </td>
              <td className="py-2 px-2">
                <span className="text-xs" title={p.diretoria_label ?? "Sem diretoria cadastrada"}>
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
      <Badge variant="destructive" className="cursor-help">{count}</Badge>
      <span className="pointer-events-none absolute bottom-full left-0 z-[60] mb-1.5 hidden w-max max-w-[260px] rounded-md border bg-popover px-2.5 py-1.5 text-left text-[11px] leading-snug text-popover-foreground shadow-md group-hover/er:block">
        {EM_RISCO_TIP}
      </span>
    </span>
  )
}

function PoKpiStrip({ kpis }: { kpis: PoSyncKpis }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Badge variant="secondary">{kpis.total} projeto(s)</Badge>
      {FASES.filter((f) => (kpis.fases[f] ?? 0) > 0).map((f) => (
        <Badge key={f} variant={FASE_VARIANT[f]} className={FASE_CLASS[f]}>
          {kpis.fases[f]} {FASE_KPI_LABEL[f]}
        </Badge>
      ))}
      <Badge variant="secondary">
        exec. média {kpis.avg_exec_pct === null ? "—" : `${kpis.avg_exec_pct}%`}
      </Badge>
      {kpis.fora_da_regra > 0 && (
        <span className="group/fr relative inline-flex">
          <Badge variant="destructive" className="cursor-help gap-1">
            <Lock className="h-3 w-3" />{kpis.fora_da_regra} fora da regra
          </Badge>
          <span className="pointer-events-none absolute bottom-full left-0 z-[60] mb-1.5 hidden w-max max-w-[280px] rounded-md border bg-popover px-2.5 py-1.5 text-left text-[11px] leading-snug text-popover-foreground shadow-md group-hover/fr:block">
            {FORA_DA_REGRA_TIP}
          </span>
        </span>
      )}
      {kpis.em_risco > 0 && (
        <span className="group/er relative inline-flex">
          <Badge variant="destructive" className="cursor-help">{kpis.em_risco} em risco</Badge>
          <span className="pointer-events-none absolute bottom-full left-0 z-[60] mb-1.5 hidden w-max max-w-[260px] rounded-md border bg-popover px-2.5 py-1.5 text-left text-[11px] leading-snug text-popover-foreground shadow-md group-hover/er:block">
            {EM_RISCO_TIP}
          </span>
        </span>
      )}
    </div>
  )
}

// Meta fixa de longo prazo para o % de atrasados (polaridade: quanto MENOR, melhor).
// Ajustar aqui quando a meta de negócio mudar.
const META_LONGO_PRAZO_PCT = 30

// Setinha de polaridade ao lado de cada campo do resumo de prazo.
function Pol({ dir }: { dir: "down" | "up" }) {
  return dir === "down" ? (
    <span className="mr-0.5 text-[10px] text-destructive" title="Polaridade: quanto MENOR, melhor">▼</span>
  ) : (
    <span className="mr-0.5 text-[10px] text-success" title="Polaridade: quanto MAIOR, melhor">▲</span>
  )
}

function PrazoResumo({
  block,
  escopo,
  semBaseline = 0,
}: {
  block: PoSyncPrazoBlock | null
  escopo: string
  semBaseline?: number
}) {
  const corrente = block?.em_atraso_corrente ?? 0
  if (!block || (block.avaliaveis === 0 && corrente === 0)) {
    return (
      <div className="text-sm text-muted-foreground">
        Sem {escopo} avaliáveis na foto deste mês — nenhuma entrega concluída no mês e nenhum
        prazo estourado no fim dele.
      </div>
    )
  }
  const totalAtrasados = block.atrasados + corrente
  const denomComb = block.avaliaveis + corrente
  const pctAtual = block.pct_atrasados_combinado ?? block.pct_atrasados ?? 0
  // Melhor cenário atingível NESTE recorte: entregues atrasados são irreversíveis e os em
  // atraso corrente viram "entregues atrasados" ao concluir (numerador travado). A única
  // alavanca que ainda REDUZ o % é entregar no prazo quem está em "andamento no prazo"
  // (cresce só o denominador).
  const denomMax = denomComb + block.em_andamento_no_prazo
  const metaRecorte = denomMax > 0 ? Math.round((totalAtrasados / denomMax) * 1000) / 10 : null
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className="text-3xl font-bold text-destructive"
          title="Entregues fora do prazo DENTRO do mês selecionado + em andamento com prazo já estourado na foto do fim do mês. Quem está em andamento dentro do prazo fica fora da conta (ainda pode atrasar)."
        >
          {pctAtual}%
        </span>
        <span className="text-sm text-muted-foreground">
          {escopo} atrasados ({totalAtrasados}/{denomComb} avaliáveis)
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          title="Polaridade do indicador: mede atraso, então o objetivo é REDUZIR o percentual — 0% seria o ideal."
        >
          <TrendingDown className="h-3 w-3 text-destructive" /> quanto menor, melhor
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div title="Quanto MAIOR, melhor.">
          <Pol dir="up" /><span className="text-muted-foreground">No prazo: </span><b>{block.no_prazo}</b>
        </div>
        <div title="Quanto MENOR, melhor.">
          <Pol dir="down" /><span className="text-muted-foreground">Entregues atrasados: </span><b>{block.atrasados}</b>
        </div>
        <div title="Quanto MENOR, melhor.">
          <Pol dir="down" /><span className="text-muted-foreground">Atraso médio: </span><b>{block.atraso_medio ?? 0}d</b>
        </div>
        <div title="Quanto MENOR, melhor.">
          <Pol dir="down" /><span className="text-muted-foreground">Mediana: </span><b>{block.atraso_mediana ?? 0}d</b>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t pt-2 text-sm sm:grid-cols-4">
        <div title="Quanto MENOR, melhor. Em andamento com prazo planejado já estourado (hoje − planejada). O atraso ainda cresce até a entrega.">
          <Pol dir="down" /><span className="text-muted-foreground">Em atraso corrente: </span>
          <b className="text-destructive">{corrente}</b>
        </div>
        <div title="Quanto MENOR, melhor. Piso do atraso — só aumenta até a conclusão.">
          <Pol dir="down" /><span className="text-muted-foreground">Atraso corrente médio: </span>
          <b>{block.atraso_corrente_medio ?? 0}d</b>
        </div>
        <div title="Quanto MENOR, melhor. Mediana do atraso corrente.">
          <Pol dir="down" /><span className="text-muted-foreground">Mediana corrente: </span>
          <b>{block.atraso_corrente_mediana ?? 0}d</b>
        </div>
        <div title="Quanto MAIOR, melhor. Em andamento com prazo ainda no futuro — fora do %, pois ainda podem atrasar.">
          <Pol dir="up" /><span className="text-muted-foreground">Andamento no prazo: </span>
          <b>{block.em_andamento_no_prazo}</b>
        </div>
      </div>
      <div className="space-y-2 rounded-md border border-dashed p-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Target className="h-3.5 w-3.5" /> Metas
          </span>
          <span title="Melhor cenário possível neste recorte: os atrasados de hoje não têm mais volta — este é o % se TODOS os itens em andamento no prazo forem entregues sem atrasar.">
            <span className="text-muted-foreground">Recorte: </span>
            <b className="text-warning">{metaRecorte === null ? "—" : `${metaRecorte}%`}</b>
          </span>
          <span title="Meta de negócio para os próximos ciclos — só se atinge com novos itens planejados com prazo realista e entregues no prazo.">
            <span className="text-muted-foreground">Longo prazo: </span>
            <b className="text-success">≤ {META_LONGO_PRAZO_PCT}%</b>
          </span>
        </div>
        <div
          className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
          title={`Atual ${pctAtual}% · meta do recorte ${metaRecorte ?? "—"}% · meta de longo prazo ≤ ${META_LONGO_PRAZO_PCT}%`}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-destructive/70"
            style={{ width: `${Math.min(pctAtual, 100)}%` }}
          />
          {metaRecorte !== null && (
            <div className="absolute inset-y-0 w-0.5 bg-warning" style={{ left: `${Math.min(metaRecorte, 100)}%` }} />
          )}
          <div className="absolute inset-y-0 w-0.5 bg-success" style={{ left: `${META_LONGO_PRAZO_PCT}%` }} />
        </div>
        <ul className="space-y-1 text-xs leading-snug">
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            <span>
              <b>Entregar no prazo</b> os <b>{block.em_andamento_no_prazo}</b> {escopo} em andamento no prazo —
              única alavanca que ainda <b>reduz</b> o % neste recorte (leva a {metaRecorte ?? "—"}%).
            </span>
          </li>
          <li className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <span>
              <b>Estancar</b> os <b>{corrente}</b> em atraso corrente (média {block.atraso_corrente_medio ?? 0}d e
              crescendo) — ao concluir viram &quot;entregues atrasados&quot;: não reduzem o %, mas concluir logo
              limita o atraso médio.
            </span>
          </li>
          {semBaseline > 0 && (
            <li className="flex items-start gap-1.5">
              <CalendarX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <span>
                <b>Registrar Data Fim Planejada</b> nos <b>{semBaseline}</b> projeto(s) sem baseline — hoje ficam
                fora do indicador.
              </span>
            </li>
          )}
          <li className="flex items-start gap-1.5">
            <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            <span>
              <b>Meta de longo prazo (≤ {META_LONGO_PRAZO_PCT}%):</b> cada mês começa com foto nova —
              planejar prazos realistas e entregar no prazo já faz o próximo ciclo nascer dentro da meta.
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default function PoSyncPage() {
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

  const fasesMax = useMemo(() => {
    if (!data) return 0
    const f = data.panorama.fases
    return Math.max(...FASES.map((k) => f[k] ?? 0), 1)
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

      {/* 2. Panorama (fases granulares) */}
      <Card>
        <CardHeader>
          <CardTitle>Panorama por fase</CardTitle>
          <CardDescription>
            Fase de cada projeto pela <b>etapa atual do card-raiz no Kanban</b>: Planejamento → Desenvolvimento →
            Homologação → Produção → Concluído, com <b>Impedimento</b> à parte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {FASES.filter((f) => (data.panorama.fases[f] ?? 0) > 0).map((f) => (
              <div key={f} className="grow basis-[150px] space-y-1.5 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-1">
                  <Badge variant={FASE_VARIANT[f]} className={FASE_CLASS[f]}>{FASE_LABEL[f]}</Badge>
                  <span className="text-2xl font-bold tabular-nums">{data.panorama.fases[f] ?? 0}</span>
                </div>
                <MiniBar value={data.panorama.fases[f] ?? 0} max={fasesMax} />
              </div>
            ))}
          </div>
          {data.panorama.backlog_sem_execucao > 0 && (
            <HoverPanel
              className="block"
              trigger={
                <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <span>
                    <b>{data.panorama.backlog_sem_execucao}</b> projeto(s) com <b>backlog montado mas execução não iniciada</b> —
                    achado próprio: há escopo priorizado parado, esperando arranque.
                  </span>
                </div>
              }
            >
              <span className="mb-1.5 block font-medium normal-case">
                {data.panorama.backlog_sem_execucao} projeto(s) — backlog montado, execução não iniciada
              </span>
              <span className="block space-y-2">
                {groupBacklogByPo(data.panorama.backlog_sem_execucao_projetos).map(([po, titles]) => (
                  <span key={po} className="block">
                    <span className="flex items-center gap-1.5 font-medium normal-case">
                      <Users className="h-3 w-3" /> {po}
                      <span className="text-muted-foreground">· {titles.length}</span>
                    </span>
                    <span className="block space-y-0.5 pl-[18px]">
                      {titles.map((t, i) => (
                        <span key={`${t}-${i}`} className="block truncate">{t}</span>
                      ))}
                    </span>
                  </span>
                ))}
              </span>
            </HoverPanel>
          )}
        </CardContent>
      </Card>

      {/* 2b. Panorama por tipo de projeto (classificação) */}
      <Card>
        <CardHeader>
          <CardTitle>Panorama por tipo de projeto</CardTitle>
          <CardDescription>
            Classificação do card-raiz: <b>Implantação</b>, <b>Desenvolvimento</b> ou <b>Melhoria</b>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const cl = data.panorama.classificacoes
            const clIa = data.panorama.classificacoes_ia
            const clMax = Math.max(cl.implantacao, cl.desenvolvimento, cl.melhoria, cl.sem_classificacao, 1)
            const tiles = [
              ...CLASS_TILES,
              ...(cl.sem_classificacao > 0
                ? [{ key: "sem_classificacao" as const, label: "Sem classificação" }] : []),
            ]
            return (
              <div className="flex flex-wrap gap-3">
                {tiles.map((t) => {
                  const ia = clIa?.[t.key]
                  const tile = (
                    <div className="w-full space-y-1.5 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-medium">{t.label}</span>
                        <span className="text-2xl font-bold tabular-nums">{cl[t.key]}</span>
                      </div>
                      <MiniBar value={cl[t.key]} max={clMax} />
                    </div>
                  )
                  if (!ia) return <div key={t.key} className="grow basis-[160px]">{tile}</div>
                  return (
                    <HoverPanel key={t.key} className="block grow basis-[160px]" trigger={tile}>
                      <p className="mb-1.5 font-semibold">{t.label} — uso de IA</p>
                      <ul className="space-y-0.5">
                        <li className="flex justify-between gap-4"><span>Com auxílio de IA</span><b className="tabular-nums">{ia.com_ia}</b></li>
                        <li className="flex justify-between gap-4"><span>Sem auxílio de IA</span><b className="tabular-nums">{ia.sem_ia}</b></li>
                        <li className="flex justify-between gap-4"><span>Não informado</span><b className="tabular-nums">{ia.nao_informado}</b></li>
                      </ul>
                    </HoverPanel>
                  )
                })}
              </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* 2c. Entregas a nível de projeto (com filtro de mês) */}
      <Card>
        <CardHeader className="flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Entregas por projeto</CardTitle>
            <CardDescription>
              Concluídas no mês selecionado · previstas para o mês seguinte · impedimentos — a nível de projeto (card-raiz).
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">Mês</span>
            <Select value={monthValue} onValueChange={setMonthValue}>
              <SelectTrigger className="h-8 w-[150px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Concluídas no mês */}
            <div className="rounded-lg border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Concluídas — {data.entregas_projeto.mes_label}
                <span className="text-xs text-muted-foreground">({data.entregas_projeto.concluidas.length})</span>
              </p>
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {data.entregas_projeto.concluidas.length === 0
                  ? <p className="text-xs text-muted-foreground">Nenhum projeto concluído no mês.</p>
                  : data.entregas_projeto.concluidas.map((p) => (
                    <div key={p.task_id} className="border-b pb-1.5 text-xs last:border-0">
                      <div className="font-medium">{p.title}</div>
                      <div className="text-muted-foreground">
                        {p.po ?? "—"} · {fmtDate(p.completed_at)}
                        {p.prazo_status === "atrasado" && <Badge variant="destructive" className="ml-1">+{p.atraso_dias}d</Badge>}
                        {p.prazo_status === "no_prazo" && <span className="ml-1 text-emerald-600">no prazo</span>}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
            {/* Previstas para o próximo mês */}
            <div className="rounded-lg border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <Clock className="h-4 w-4 text-sky-600" /> Previstas — {data.entregas_projeto.proximo_mes_label}
                <span className="text-xs text-muted-foreground">({data.entregas_projeto.previstas.length})</span>
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
            {/* Impedimentos (atraso/SLA aparece como badge extra do projeto impedido) */}
            <div className="rounded-lg border border-destructive/30 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Impedimentos
                <span className="text-xs text-muted-foreground">({data.entregas_projeto.riscos.length})</span>
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
                          <Badge key={i} variant="warning"
                            className={m.startsWith("Impedimento") ? "border-transparent bg-red-600 text-white hover:bg-red-600" : ""}>
                            {m}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Saúde de prazo */}
      <Card>
        <CardHeader>
          <CardTitle>Saúde de prazo — {data.entregas_projeto.mes_label}</CardTitle>
          <CardDescription>
            <b>Foto do mês selecionado</b>: entregas concluídas dentro do mês (Data Fim Real vs
            Planejada) + situação de quem estava em andamento no fim do mês — prazo estourado
            conta como <b>atraso corrente</b>. Considera somente projetos em{" "}
            <b>desenvolvimento ou além</b> (exclui planejamento e impedimento). Use o filtro de
            mês no topo para navegar entre ciclos e acompanhar a evolução rumo à meta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.prazo.sem_datas_comparaveis > 0 && (
            <HoverPanel
              className="block"
              trigger={
                <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  <CalendarX className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <span>
                    <b>{data.prazo.sem_datas_comparaveis}</b> projeto(s) sem <b>Data Fim Planejada</b> —
                    impossível avaliar prazo. Registrar o prazo planejado nos cards para entrarem no indicador.
                  </span>
                </div>
              }
            >
              <span className="mb-1.5 block font-medium normal-case">
                {data.prazo.sem_datas_comparaveis} projeto(s) sem Data Fim Planejada — por Product Owner
              </span>
              <span className="block space-y-2">
                {groupBacklogByPo(data.prazo.sem_datas_comparaveis_projetos ?? []).map(([po, titles]) => (
                  <span key={po} className="block">
                    <span className="flex items-center gap-1.5 font-medium normal-case">
                      <Users className="h-3 w-3" /> {po}
                      <span className="text-muted-foreground">· {titles.length}</span>
                    </span>
                    <span className="block space-y-0.5 pl-[18px]">
                      {titles.map((t, i) => (
                        <span key={`${t}-${i}`} className="block truncate">{t}</span>
                      ))}
                    </span>
                  </span>
                ))}
              </span>
            </HoverPanel>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Nível projeto</p>
              <PrazoResumo
                block={data.prazo.projetos}
                escopo="projetos"
                semBaseline={data.prazo.sem_datas_comparaveis}
              />
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
                <th className="py-2 px-2 font-medium">Distribuição por fase</th>
                <th className="py-2 px-2 font-medium">Exec. média</th>
                <th className="py-2 pl-2 font-medium">Em risco</th>
              </tr>
            </thead>
            <tbody>
              {data.ranking_pos.map((po) => (
                <tr key={po.po_id ?? po.full_name} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3 font-medium">{po.full_name ?? "—"}</td>
                  <td className="py-2 px-2 tabular-nums">{po.total}</td>
                  <td className="py-2 px-2"><FaseChips fases={po.fases} bloqueados={po.fora_da_regra} /></td>
                  <td className="py-2 px-2 tabular-nums">{po.avg_exec_pct === null ? "—" : `${po.avg_exec_pct}%`}</td>
                  <td className="py-2 pl-2">
                    <EmRiscoBadge count={po.em_risco} />
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
                  <ProdutosTip produtos={data.saude_produtos.resumo.producao.produtos} titulo="Produção">
                    <div>
                      <p className={`mt-1 text-2xl tabular-nums ${scoreTone(data.saude_produtos.resumo.producao.score_medio)}`}>
                        {fmtScore(data.saude_produtos.resumo.producao.score_medio)}
                      </p>
                      <p className="text-xs text-muted-foreground">{data.saude_produtos.resumo.producao.total} em produção</p>
                    </div>
                  </ProdutosTip>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Score — Desenvolvimento</p>
                  <ProdutosTip produtos={data.saude_produtos.resumo.desenvolvimento.produtos} titulo="Desenvolvimento">
                    <div>
                      <p className={`mt-1 text-2xl tabular-nums ${scoreTone(data.saude_produtos.resumo.desenvolvimento.score_medio)}`}>
                        {fmtScore(data.saude_produtos.resumo.desenvolvimento.score_medio)}
                      </p>
                      <p className="text-xs text-muted-foreground">{data.saude_produtos.resumo.desenvolvimento.total} em desenvolvimento</p>
                    </div>
                  </ProdutosTip>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Distribuição geral</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="success">{data.saude_produtos.resumo.distribuicao.saudavel} saudável</Badge>
                    <Badge variant="warning">{data.saude_produtos.resumo.distribuicao.atencao} atenção</Badge>
                    <CriticosTip criticos={data.saude_produtos.resumo.criticos}>
                      <Badge variant="destructive">{data.saude_produtos.resumo.distribuicao.critico} crítico</Badge>
                    </CriticosTip>
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
                      <th className="py-2.5 px-2 pr-3 font-medium min-w-[140px]">Distribuição</th>
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
                    <EmRiscoBadge count={po.em_risco} />
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
                <th className="py-2 px-2 font-medium">Distribuição por fase</th>
                <th className="py-2 px-2 font-medium">Exec. média</th>
                <th className="py-2 pl-2 font-medium">Em risco</th>
              </tr>
            </thead>
            <tbody>
              {data.por_diretoria.map((d) => (
                <tr key={d.diretoria_label} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3 font-medium">
                    {d.sem_baseline ? <span className="italic text-muted-foreground">{d.diretoria_label}</span> : d.diretoria_label}
                  </td>
                  <td className="py-2 px-2 tabular-nums">{d.total}</td>
                  <td className="py-2 px-2"><FaseChips fases={d.fases} /></td>
                  <td className="py-2 px-2 tabular-nums">{d.avg_exec_pct === null ? "—" : `${d.avg_exec_pct}%`}</td>
                  <td className="py-2 pl-2">
                    <EmRiscoBadge count={d.em_risco} />
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
