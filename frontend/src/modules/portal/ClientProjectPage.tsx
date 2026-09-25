import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import {
  AlertTriangle, Box, CalendarDays, CalendarRange, FileText, FolderKanban, Headset, Layers, LifeBuoy, ListTree, PauseCircle,
  Plus, ShieldCheck, XCircle,
} from "lucide-react"

import { portalAssistedOpsApi, type PortalAssistedOps } from "@/api/clientes"
import { ProjectAssistedOpsTab } from "@/modules/portal/ProjectAssistedOpsTab"

import {
  portalPortfolioApi,
  type PortalFeature,
  type PortalItemStatus,
  type PortalProjectDetail,
  type RoadmapSegment,
} from "@/api/portalPortfolio"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { apiErrorDetail } from "@/modules/portal/occurrenceUi"
import {
  DetailHeader,
  DetailTabs,
  KpiCount,
  KpiEvolution,
  KpiHealth,
  KpiMilestone,
  KpiPerson,
  KpiRow,
  type Crumb,
  type MenuAction,
  type TabDef,
} from "@/modules/portal/DetailShell"
import { RoadmapGrid, type RoadmapRow } from "@/modules/portal/RoadmapGrid"
import { WorkTree } from "@/modules/portal/WorkTree"
import { Card } from "@/modules/portal/portfolioUi"
import { HEALTH, ITEM_STATUS, PHASE, colorFor, fmtDate, parseDay, readFavorites, treeKeys, writeFavorites, usePortalBase } from "@/modules/portal/portfolioMeta"

type Tab = "entregas" | "roadmap" | "operacao"
const TABS: TabDef<Tab>[] = [
  { value: "entregas", label: "Visão por Features", icon: ListTree },
  { value: "roadmap", label: "Roadmap", icon: CalendarRange },
]
// Só para projeto que passou pela Operação Assistida (indicadores, encerramento e atas).
const TAB_OA: TabDef<Tab> = { value: "operacao", label: "Operação Assistida", icon: Headset }

/** Barra da Feature no roadmap: do início à previsão, na cor da fase dela. */
function featureSegments(f: PortalFeature, today: number): RoadmapSegment[] {
  const start = f.start_date ?? f.due_date
  const end = f.due_date ?? f.start_date
  if (!start || !end) return []
  const [a, b] = parseDay(start) <= parseDay(end) ? [start, end] : [end, start]
  const kind = f.status === "concluida" ? "realizado" : parseDay(a) > today ? "previsto" : "atual"
  return [{ phase: f.phase, start: a, end: b, kind }]
}

function Notice({ tone, icon: Icon, children }: { tone: "amber" | "slate" | "teal"; icon: typeof AlertTriangle; children: ReactNode }) {
  const cls = {
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    slate: "border-border bg-muted text-muted-foreground",
    teal: "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200",
  }[tone]
  return <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-sm ${cls}`}><Icon size={16} className="shrink-0" />{children}</div>
}

/** Projeto no Portal: mesmo layout do programa — indicadores, árvore Feature → User Story e roadmap. */
export default function ClientProjectPage() {
  const base = usePortalBase()
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  // Operação Assistida do projeto (aba própria): 404 = não passou pela raia.
  const [oa, setOa] = useState<{ id: string; data: PortalAssistedOps | null } | null>(null)
  const oaData = oa && oa.id === id ? oa.data : null
  const tabs = oaData ? [...TABS, TAB_OA] : TABS
  const tab = (tabs.some((t) => t.value === params.get("aba")) ? params.get("aba") : "entregas") as Tab
  // Resultado guardado com o id: trocar de projeto volta ao "carregando" sem setState no efeito.
  const [result, setResult] = useState<{ id: string; data: PortalProjectDetail | null; error: string | null } | null>(null)
  const [favorites, setFavorites] = useState<string[]>(readFavorites)
  const [q, setQ] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!id) return
    let alive = true
    portalPortfolioApi
      .project(id)
      .then((d) => {
        if (!alive) return
        setResult({ id, data: d, error: null })
        setExpanded(new Set(treeKeys([d.project], false)))
      })
      .catch((err) => {
        if (alive) setResult({ id, data: null, error: apiErrorDetail(err, "Não foi possível carregar o projeto.") })
      })
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    if (!id) return
    let alive = true
    portalAssistedOpsApi
      .get(id)
      .then((d) => { if (alive) setOa({ id, data: d }) })
      .catch(() => { if (alive) setOa({ id, data: null }) })
    return () => { alive = false }
  }, [id])

  const loading = !result || result.id !== id
  const data = loading ? null : result.data
  const error = loading ? null : result.error
  const fav = !!id && favorites.includes(id)

  const roadmapRows = useMemo<RoadmapRow[]>(() => {
    if (!data) return []
    const p = data.project
    const now = new Date()
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    return [
      {
        id: p.task_id,
        title: "Fases do projeto",
        pct: p.exec_pct,
        dot: { className: HEALTH[p.health].dot, label: HEALTH[p.health].label },
        segments: p.roadmap.segments,
        milestones: p.roadmap.milestones,
        strong: true,
      },
      ...p.features.map((f) => ({
        id: f.id,
        title: f.code ? `${f.code} ${f.title}` : f.title,
        pct: f.exec_pct,
        dot: { className: ITEM_STATUS[f.status].dot, label: ITEM_STATUS[f.status].label },
        segments: featureSegments(f, today),
        milestones: f.status !== "concluida" && f.due_date ? [{ date: f.due_date, label: `Previsão: ${f.title}` }] : [],
      })),
    ]
  }, [data])

  function toggleFav() {
    if (!id) return
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id]
    writeFavorites(next)
    setFavorites(next)
  }
  function toggle(key: string) {
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 w-2/3 rounded-xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }
  if (!data) {
    return (
      <Card>
        <EmptyState icon={FolderKanban} title="Projeto indisponível" description={error ?? "Projeto não encontrado."} />
      </Card>
    )
  }

  const p = data.project
  const sponsor = p.sponsors[0]
  const others = p.sponsors.length > 1 ? `+${p.sponsors.length - 1}` : null
  const crumbs: Crumb[] = p.program
    ? [{ label: "Portfólio", to: base }, { label: p.program.name, to: `${base}/programas/${p.program.id}` }, { label: p.title }]
    : [{ label: "Portfólio", to: base }, { label: "Projetos", to: `${base}/projetos` }, { label: p.title }]
  const actions: MenuAction[] = [
    ...(p.accepts_occurrences ? [{ label: "Abrir ocorrência", icon: Plus, to: `${base}/ocorrencias/nova?projeto=${p.task_id}` }] : []),
    ...(p.occurrences_link ? [{ label: "Ver ocorrências", icon: LifeBuoy, to: `${base}/ocorrencias?projeto=${p.task_id}` }] : []),
    ...(p.program ? [{ label: "Ver o programa", icon: Layers, to: `${base}/programas/${p.program.id}` }] : []),
  ]
  const phaseLabel = PHASE[p.roadmap_phase]?.label ?? p.stage_name
  const itemStatus: PortalItemStatus[] = ["no_prazo", "andamento", "atrasado", "impedimento", "nao_iniciada", "concluida"]

  return (
    <div className="space-y-5">
      <DetailHeader
        crumbs={crumbs}
        icon={p.pillar?.icon ?? p.program?.icon ?? "FileText"}
        color={colorFor(p.pillar?.color ?? p.program?.color, p.pillar?.id ?? p.program?.id ?? p.task_id)}
        title={p.title}
        status={p.status}
        description={p.subtitle}
        meta={
          <>
            Fase atual: <span className="text-foreground">{phaseLabel}</span>
            {p.stage_name && <> · Etapa: <span className="text-foreground">{p.stage_name}</span></>}
            {p.pillar && <> · Pilar: <span className="text-foreground">{p.pillar.name}</span></>}
            {" "}· Início {fmtDate(p.start_date)} · Previsão {fmtDate(p.delivered_at ?? p.due_date)}
            {p.role_label && <> · Você é <span className="text-foreground">{p.role_label}</span></>}
          </>
        }
        updatedAt={p.updated_at ?? data.generated_at}
        favorite={fav}
        onToggleFavorite={toggleFav}
        actions={actions}
      />

      <KpiRow>
        <KpiEvolution value={p.exec_pct} delta={p.exec_delta} days={data.delta_days} />
        <KpiCount icon={Box} value={p.feature_count} label={p.feature_count ? `Features (${p.feature_done} concluídas)` : "Features"} />
        <KpiCount icon={FileText} value={p.story_count} label={p.story_count ? `User Stories (${p.story_done} concl.)` : "User Stories"} />
        <KpiHealth value={p.health} label="Saúde do projeto" override={p.cancelled ? "Cancelado" : undefined} />
        <KpiPerson name={sponsor?.name} role="Patrocinador" extra={[sponsor?.job_title, others].filter(Boolean).join(" · ") || null} />
        <KpiPerson name={p.po?.name ?? p.po_name} role="Product Owner" extra={p.po?.position} />
        <KpiMilestone
          icon={CalendarDays}
          date={p.next_milestone ? fmtDate(p.next_milestone.date) : null}
          title={p.next_milestone?.title ?? (p.status === "concluido" ? "Projeto concluído" : null)}
        />
      </KpiRow>

      {p.cancelled && <Notice tone="slate" icon={XCircle}>Este projeto foi cancelado.</Notice>}
      {!p.cancelled && p.status === "pausado" && <Notice tone="slate" icon={PauseCircle}>O projeto está pausado no momento.</Notice>}
      {!p.cancelled && p.status === "impedimento" && (
        <Notice tone="amber" icon={AlertTriangle}>O projeto está com um impedimento. O Product Owner está tratando.</Notice>
      )}
      {p.in_assisted_operation && (
        <Notice tone="teal" icon={Headset}>
          <span className="flex-1">
            Entregue e em Operação Assistida{p.accepts_occurrences ? ": você pode abrir ocorrências deste projeto." : "."}
          </span>
          {p.accepts_occurrences && (
            <Button asChild size="sm" className="gap-1.5">
              <Link to={`${base}/ocorrencias/nova?projeto=${p.task_id}`}><Plus size={14} /> Abrir ocorrência</Link>
            </Button>
          )}
        </Notice>
      )}

      {oaData?.closure.can_accept && tab !== "operacao" && (
        <Notice tone="amber" icon={ShieldCheck}>
          <span className="flex-1">O encerramento da Operação Assistida aguarda o seu aceite como Dono do Processo.</span>
          <Button size="sm" onClick={() => setParams((prev) => { const n = new URLSearchParams(prev); n.set("aba", "operacao"); return n }, { replace: true })}>
            Ver e responder
          </Button>
        </Notice>
      )}

      <DetailTabs
        tabs={tabs}
        value={tab}
        onChange={(v) => setParams((prev) => { const n = new URLSearchParams(prev); n.set("aba", v); return n }, { replace: true })}
        {...(tab === "entregas"
          ? {
              search: q,
              onSearch: setQ,
              placeholder: "Buscar feature ou user story…",
              onExpandAll: () => setExpanded(new Set(treeKeys([p], false))),
              onCollapseAll: () => setExpanded(new Set()),
            }
          : {})}
      />

      {tab === "entregas" && <WorkTree mode="project" projects={[p]} q={q} expanded={expanded} onToggle={toggle} />}
      {tab === "operacao" && oaData && id && (
        <ProjectAssistedOpsTab projectTaskId={id} data={oaData} onChange={(d) => setOa({ id, data: d })} />
      )}
      {tab === "roadmap" && (
        <RoadmapGrid
          groups={[{ key: "projeto", rows: roadmapRows }]}
          leftTitle="Projeto e Features"
          defaultPeriod="tudo"
          phases={["planejamento", "desenvolvimento", "homologacao", "producao", "operacao_assistida", "concluido", "impedimento"]}
          legendExtra={
            <>
              <span className="font-medium text-foreground">Status:</span>
              {itemStatus.map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${ITEM_STATUS[k].dot}`} aria-hidden /> {ITEM_STATUS[k].label}
                </span>
              ))}
            </>
          }
          footnote={
            <>
              A primeira linha mostra as fases do projeto: o realizado vem das mudanças de etapa e o previsto sai do cronograma
              (Desenvolvimento até o último prazo das histórias, Homologação até a previsão do projeto e Operação Assistida depois
              da entrega). Cada Feature aparece do início à previsão, na cor da fase em que está.
            </>
          }
        />
      )}
    </div>
  )
}
