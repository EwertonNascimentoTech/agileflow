import { useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { CalendarDays, CalendarRange, LayoutDashboard, LayoutGrid, Layers, ListTree, Waypoints } from "lucide-react"

import { portalPortfolioApi, type PortalProgramDetail } from "@/api/portalPortfolio"
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
  type TabDef,
} from "@/modules/portal/DetailShell"
import { ProgramPillarsView } from "@/modules/portal/ProgramPillarsView"
import { HealthLegend, RoadmapGrid, type RoadmapGroup } from "@/modules/portal/RoadmapGrid"
import { WorkTree } from "@/modules/portal/WorkTree"
import { Card } from "@/modules/portal/portfolioUi"
import { HEALTH, colorFor, fmtDate, readFavorites, treeKeys, writeFavorites, usePortalBase } from "@/modules/portal/portfolioMeta"

type Tab = "pilares" | "projetos" | "roadmap"
const TABS: TabDef<Tab>[] = [
  { value: "pilares", label: "Visão por Pilares", icon: LayoutGrid },
  { value: "projetos", label: "Visão por Projetos", icon: ListTree },
  { value: "roadmap", label: "Roadmap", icon: CalendarRange },
]

/** Árvore abre no primeiro projeto que tem entregas, com as Features dele abertas. */
function defaultExpanded(d: PortalProgramDetail): Set<string> {
  const first = d.projects.find((p) => p.features.length > 0 || p.orphan_stories.length > 0)
  return new Set(first ? [`p:${first.task_id}`, ...treeKeys([first], false)] : [])
}

/** Programa no Portal: indicadores e as visões por pilares, por projetos e roadmap. */
export default function ClientProgramPage() {
  const base = usePortalBase()
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.value === params.get("aba")) ? params.get("aba") : "pilares") as Tab
  // Resultado guardado com o id: trocar de programa volta ao "carregando" sem setState no efeito.
  const [result, setResult] = useState<{ id: string; data: PortalProgramDetail | null; error: string | null } | null>(null)
  const [favorites, setFavorites] = useState<string[]>(readFavorites)
  const [q, setQ] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!id) return
    let alive = true
    portalPortfolioApi
      .program(id)
      .then((d) => {
        if (!alive) return
        setResult({ id, data: d, error: null })
        setExpanded(defaultExpanded(d))
      })
      .catch((err) => {
        if (alive) setResult({ id, data: null, error: apiErrorDetail(err, "Não foi possível carregar o programa.") })
      })
    return () => { alive = false }
  }, [id])

  const loading = !result || result.id !== id
  const data = loading ? null : result.data
  const error = loading ? null : result.error
  const fav = !!id && favorites.includes(id)

  const roadmapGroups = useMemo<RoadmapGroup[]>(() => {
    if (!data) return []
    return data.pillars.map((pl) => {
      const projects = data.projects.filter((p) => p.pillar_id === pl.id)
      return {
        key: pl.id ?? "sem-pilar",
        header: {
          title: pl.name,
          subtitle: `${projects.length} ${projects.length === 1 ? "projeto" : "projetos"}`,
          icon: pl.icon,
          color: colorFor(pl.color, pl.id ?? "sem-pilar"),
          pct: pl.exec_avg ?? 0,
          health: pl.health,
        },
        rows: projects.map((p) => ({
          id: p.task_id,
          title: p.title,
          href: `${base}/projetos/${p.task_id}`,
          pct: p.exec_pct,
          dot: { className: HEALTH[p.health].dot, label: HEALTH[p.health].label },
          segments: p.roadmap.segments,
          milestones: p.roadmap.milestones,
        })),
      }
    })
  }, [data, base])

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
      <Card><EmptyState icon={Layers} title="Programa indisponível" description={error ?? "Programa não encontrado."} /></Card>
    )
  }

  const p = data.program
  const sponsor = p.sponsors[0]
  const others = p.sponsors.length > 1 ? `+${p.sponsors.length - 1}` : null

  return (
    <div className="space-y-5">
      <DetailHeader
        crumbs={[{ label: "Portfólio", to: base }, { label: "Programas", to: `${base}/programas` }, { label: p.name }]}
        icon={p.icon}
        color={colorFor(p.color, p.id)}
        title={p.name}
        status={p.status}
        description={p.description}
        meta={p.role_label ? <>Você é <span className="text-foreground">{p.role_label}</span></> : null}
        updatedAt={p.updated_at ?? data.generated_at}
        favorite={fav}
        onToggleFavorite={toggleFav}
        actions={[{ label: "Ver no portfólio", icon: LayoutDashboard, to: base }]}
      />

      <KpiRow>
        <KpiEvolution value={p.exec_avg} delta={p.exec_delta} days={data.delta_days} />
        <KpiCount icon={Waypoints} value={p.pillar_count} label="Pilares" />
        <KpiCount icon={Layers} value={p.project_count} label="Projetos" />
        <KpiHealth value={p.health} label="Saúde do programa" />
        <KpiPerson name={sponsor?.name} role="Patrocinador" extra={[sponsor?.job_title, others].filter(Boolean).join(" · ") || null} />
        <KpiPerson name={p.owner?.name} role="Product Owner" extra={p.owner?.position} />
        <KpiMilestone
          icon={CalendarDays}
          date={p.next_milestone ? fmtDate(p.next_milestone.date) : null}
          title={p.next_milestone ? `${p.next_milestone.title}${p.next_milestone.project_title ? ` · ${p.next_milestone.project_title}` : ""}` : null}
        />
      </KpiRow>

      {p.partial && (
        <p className="rounded-lg border bg-card px-4 py-2.5 text-sm text-muted-foreground">
          Você acompanha alguns projetos deste programa. Os números acima e as visões abaixo consideram só esses projetos.
        </p>
      )}

      <DetailTabs
        tabs={TABS}
        value={tab}
        onChange={(v) => setParams((prev) => { const n = new URLSearchParams(prev); n.set("aba", v); return n }, { replace: true })}
        {...(tab === "projetos"
          ? {
              search: q,
              onSearch: setQ,
              placeholder: "Buscar projeto, feature ou user story…",
              onExpandAll: () => setExpanded(new Set(treeKeys(data.projects, true))),
              onCollapseAll: () => setExpanded(new Set()),
            }
          : {})}
      />

      {tab === "pilares" && <ProgramPillarsView data={data} />}
      {tab === "projetos" && (
        <WorkTree mode="program" projects={data.projects} pillars={data.pillars} q={q} expanded={expanded} onToggle={toggle} />
      )}
      {tab === "roadmap" && (
        <RoadmapGrid
          groups={roadmapGroups}
          leftTitle="Pilares e Projetos"
          phases={["planejamento", "desenvolvimento", "homologacao", "producao", "operacao_assistida", "concluido", "impedimento"]}
          legendExtra={<HealthLegend />}
          footnote={
            <>
              O realizado vem das mudanças de etapa de cada projeto. O previsto sai do cronograma: Desenvolvimento até o último prazo das
              histórias, Homologação até a previsão do projeto e Operação Assistida por {p.oa_days} dias depois da entrega.
            </>
          }
        />
      )}
    </div>
  )
}
