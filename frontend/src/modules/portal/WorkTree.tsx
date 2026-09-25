import { Fragment, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Box, ChevronDown, ChevronRight, FileText, MoreHorizontal } from "lucide-react"

import type {
  PortalFeature,
  PortalItemStatus,
  PortalPillar,
  PortalProgramProject,
  PortalTreeItem,
  RoadmapPhase,
} from "@/api/portalPortfolio"
import { initials } from "@/modules/portal/occurrenceUi"
import { Card, FilterSelect, IconTile, ItemStatusBadge, PhaseBadge, ProgressBar } from "@/modules/portal/portfolioUi"
import { ITEM_STATUS, ORPHANS, PHASE, colorFor, fmtDate, usePortalBase } from "@/modules/portal/portfolioMeta"

const ALL = "__all__"
const NONE = "__none__"

function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

function Person({ name }: { name: string | null }) {
  if (!name) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary" aria-hidden>
        {initials(name)}
      </span>
      <span className="truncate">{name}</span>
    </span>
  )
}

type Row = { start_date: string | null; due_date: string | null; status: PortalItemStatus; exec_pct: number }

function Cells({ item, phase }: { item: Row; phase?: RoadmapPhase | null }) {
  return (
    <>
      <td className="px-3 py-2">{phase ? <PhaseBadge value={phase} /> : null}</td>
      <td className="px-3 py-2"><ProgressBar value={item.exec_pct} /></td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{fmtDate(item.start_date)}</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{fmtDate(item.due_date)}</td>
      <td className="px-3 py-2"><ItemStatusBadge value={item.status} /></td>
    </>
  )
}

type FeatureView = PortalFeature & { shown: PortalTreeItem[] }
type ProjectView = { project: PortalProgramProject; features: FeatureView[]; orphans: PortalTreeItem[] }

/**
 * Árvore de trabalho no layout do Portal: Projeto → Feature → User Story (programa) ou
 * Feature → User Story (projeto). Busca e expansão vêm da página (ficam na linha das abas).
 */
export function WorkTree({
  mode,
  projects,
  pillars = [],
  q,
  expanded,
  onToggle,
}: {
  mode: "program" | "project"
  projects: PortalProgramProject[]
  pillars?: PortalPillar[]
  q: string
  expanded: Set<string>
  onToggle: (key: string) => void
}) {
  const base = usePortalBase()
  const program = mode === "program"
  const [pillar, setPillar] = useState(ALL)
  const [phase, setPhase] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [owner, setOwner] = useState(ALL)

  const pillarById = useMemo(() => new Map(pillars.filter((p) => p.id).map((p) => [p.id as string, p])), [pillars])
  const owners = useMemo(() => {
    const s = new Set<string>()
    for (const p of projects) {
      if (program && p.po_name) s.add(p.po_name)
      for (const f of p.features) {
        if (f.responsavel) s.add(f.responsavel)
        for (const u of f.stories) if (u.responsavel) s.add(u.responsavel)
      }
      for (const u of p.orphan_stories) if (u.responsavel) s.add(u.responsavel)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"))
  }, [projects, program])

  const term = norm(q.trim())
  const views = useMemo<ProjectView[]>(() => {
    const out: ProjectView[] = []
    const hitText = (it: PortalTreeItem) => norm(`${it.code ?? ""} ${it.title}`).includes(term)
    for (const p of projects) {
      if (program) {
        if (pillar !== ALL && (pillar === NONE ? p.pillar_id !== null : p.pillar_id !== pillar)) continue
        if (phase !== ALL && p.roadmap_phase !== phase) continue
        if (status !== ALL && p.item_status !== status) continue
      }
      // Projeto do PO filtrado (ou que casa com a busca) mostra tudo o que tem embaixo.
      const ownerProject = program && owner !== ALL && p.po_name === owner
      const projectHit = program && !!term && norm(`${p.title} ${p.subtitle ?? ""}`).includes(term)
      const features: FeatureView[] = []
      for (const f of p.features) {
        // No projeto, os filtros de fase/status valem para as Features.
        if (!program && phase !== ALL && f.phase !== phase) continue
        if (!program && status !== ALL && f.status !== status) continue
        let shown = f.stories
        if (owner !== ALL && !ownerProject && f.responsavel !== owner) {
          shown = shown.filter((u) => u.responsavel === owner)
          if (!shown.length) continue
        }
        if (term && !projectHit && !hitText(f)) {
          shown = shown.filter(hitText)
          if (!shown.length) continue
        }
        features.push({ ...f, shown })
      }
      const orphans = p.orphan_stories.filter(
        (u) => (owner === ALL || ownerProject || u.responsavel === owner) && (!term || projectHit || hitText(u)),
      )
      const nothing = features.length === 0 && orphans.length === 0
      if (program && owner !== ALL && !ownerProject && nothing) continue
      if (program && term && !projectHit && nothing) continue
      out.push({ project: p, features, orphans })
    }
    return out
  }, [projects, program, pillar, phase, status, owner, term])

  const isOpen = (k: string) => (term ? true : expanded.has(k))
  const phaseKeys: RoadmapPhase[] = program
    ? ["planejamento", "desenvolvimento", "homologacao", "producao", "operacao_assistida", "concluido", "impedimento"]
    : ["planejamento", "desenvolvimento", "homologacao", "concluido"]
  const cols = program ? 9 : 8

  function featureRows(f: FeatureView, indent: string) {
    const fk = `f:${f.id}`
    return (
      <Fragment key={f.id}>
        <tr className="border-t">
          <td className={`py-2.5 pr-3 ${indent}`}>
            <div className="flex items-center gap-2">
              <button
                type="button" onClick={() => onToggle(fk)} disabled={f.shown.length === 0}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:invisible"
                aria-expanded={isOpen(fk)} aria-label={isOpen(fk) ? "Recolher feature" : "Expandir feature"}
              >
                {isOpen(fk) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300" aria-hidden>
                <Box size={15} />
              </span>
              <span className="min-w-0 truncate font-semibold" title={f.title}>
                {f.code && <span className="mr-1.5 font-normal text-muted-foreground">{f.code}</span>}
                {f.title}
              </span>
            </div>
          </td>
          {program && <td className="px-3 py-2" />}
          <td className="px-3 py-2"><Person name={f.responsavel} /></td>
          <Cells item={f} phase={f.phase} />
          <td />
        </tr>
        {isOpen(fk) && f.shown.map((u) => storyRow(u, program ? "pl-[5.75rem]" : "pl-14"))}
      </Fragment>
    )
  }

  function storyRow(u: PortalTreeItem, indent: string) {
    return (
      <tr key={u.id} className="border-t">
        <td className={`py-2 pr-3 ${indent}`}>
          <div className="flex items-center gap-2.5">
            <FileText size={16} className="shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 truncate" title={u.title}>
              {u.code && <span className="mr-2 text-muted-foreground">{u.code}</span>}
              {u.title}
            </span>
          </div>
        </td>
        {program && <td />}
        <td />
        <Cells item={u} />
        <td />
      </tr>
    )
  }

  function orphanRows(p: PortalProgramProject, orphans: PortalTreeItem[], indent: string) {
    if (orphans.length === 0) return null
    const ok = `f:${ORPHANS}:${p.task_id}`
    return (
      <>
        <tr className="border-t">
          <td colSpan={cols} className={`py-2 pr-3 ${indent}`}>
            <button type="button" onClick={() => onToggle(ok)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              {isOpen(ok) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              Histórias sem feature ({orphans.length})
            </button>
          </td>
        </tr>
        {isOpen(ok) && orphans.map((u) => storyRow(u, program ? "pl-[5.75rem]" : "pl-14"))}
      </>
    )
  }

  const empty = program ? views.length === 0 : views.every((v) => v.features.length === 0 && v.orphans.length === 0)

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 p-4">
        <div className="flex flex-wrap gap-3">
          {program && (
            <FilterSelect
              label="Pilar" value={pillar} onChange={setPillar}
              options={[{ value: ALL, label: "Todos" }, ...pillars.map((p) => ({ value: p.id ?? NONE, label: p.name }))]}
            />
          )}
          <FilterSelect
            label="Fase" value={phase} onChange={setPhase}
            options={[{ value: ALL, label: "Todos" }, ...phaseKeys.map((k) => ({ value: k, label: PHASE[k].label }))]}
          />
          <FilterSelect
            label="Status" value={status} onChange={setStatus}
            options={[{ value: ALL, label: "Todos" }, ...(Object.keys(ITEM_STATUS) as PortalItemStatus[]).map((k) => ({ value: k, label: ITEM_STATUS[k].label }))]}
          />
          <FilterSelect
            label="Responsável" value={owner} onChange={setOwner}
            options={[{ value: ALL, label: "Todos" }, ...owners.map((o) => ({ value: o, label: o }))]}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pb-2 text-xs text-muted-foreground">
          {(["no_prazo", "andamento", "atrasado", "impedimento", "nao_iniciada"] as PortalItemStatus[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${ITEM_STATUS[k].dot}`} aria-hidden /> {ITEM_STATUS[k].label}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className={`w-full table-fixed text-sm ${program ? "min-w-[1120px]" : "min-w-[980px]"}`}>
          <colgroup>
            {program ? (
              <>
                <col style={{ width: "26%" }} /><col style={{ width: "11%" }} /><col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col style={{ width: "8.5%" }} />
                <col style={{ width: "8.5%" }} /><col style={{ width: "11.5%" }} /><col style={{ width: "2.5%" }} />
              </>
            ) : (
              <>
                <col style={{ width: "33%" }} /><col style={{ width: "13%" }} /><col style={{ width: "11%" }} />
                <col style={{ width: "11%" }} /><col style={{ width: "9%" }} /><col style={{ width: "9%" }} />
                <col style={{ width: "12%" }} /><col style={{ width: "2%" }} />
              </>
            )}
          </colgroup>
          <thead className="bg-muted/60 text-left text-sm text-foreground">
            <tr>
              <th className="py-3 pl-4 pr-3 font-semibold">Item</th>
              {program && <th className="px-3 py-3 font-semibold">Pilar</th>}
              <th className="px-3 py-3 font-semibold">Responsável</th>
              <th className="px-3 py-3 font-semibold">Fase</th>
              <th className="px-3 py-3 font-semibold">Evolução</th>
              <th className="px-3 py-3 font-semibold">Início</th>
              <th className="px-3 py-3 font-semibold">Previsão</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {empty && (
              <tr><td colSpan={cols} className="px-4 py-10 text-center text-muted-foreground">
                {program ? "Nenhum item com esses filtros." : "Nenhuma entrega com esses filtros — o cronograma pode ainda estar sendo montado."}
              </td></tr>
            )}
            {views.map(({ project: p, features, orphans }) => {
              if (!program) {
                return (
                  <Fragment key={p.task_id}>
                    {features.map((f) => featureRows(f, "pl-3"))}
                    {orphanRows(p, orphans, "pl-4")}
                  </Fragment>
                )
              }
              const pk = `p:${p.task_id}`
              const pl = p.pillar_id ? pillarById.get(p.pillar_id) : undefined
              const color = colorFor(pl?.color, pl?.id ?? "sem-pilar")
              const hasKids = features.length > 0 || orphans.length > 0
              return (
                <Fragment key={p.task_id}>
                  <tr className="border-t bg-card">
                    <td className="py-3 pl-2 pr-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button" onClick={() => onToggle(pk)} disabled={!hasKids}
                          className="rounded p-1 text-muted-foreground hover:bg-muted disabled:invisible"
                          aria-expanded={isOpen(pk)} aria-label={isOpen(pk) ? "Recolher projeto" : "Expandir projeto"}
                        >
                          {isOpen(pk) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        <IconTile icon={pl?.icon ?? "FileText"} color={color} size={34} />
                        <div className="min-w-0">
                          <Link to={`${base}/projetos/${p.task_id}`} className="block truncate font-semibold hover:underline" title={p.title}>{p.title}</Link>
                          {p.subtitle && <p className="truncate text-xs text-muted-foreground">{p.subtitle}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="overflow-hidden px-3 py-3">
                      {pl ? (
                        <span className="inline-block max-w-full truncate rounded-md px-2 py-0.5 text-xs font-medium text-foreground"
                          style={{ backgroundColor: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}40` }}>
                          {pl.name}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3"><Person name={p.po_name} /></td>
                    <Cells item={{ ...p, status: p.item_status }} phase={p.roadmap_phase} />
                    <td className="pr-3">
                      <Link to={`${base}/projetos/${p.task_id}`} className="inline-flex rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Abrir o projeto" aria-label={`Abrir o projeto ${p.title}`}>
                        <MoreHorizontal size={17} />
                      </Link>
                    </td>
                  </tr>
                  {isOpen(pk) && features.map((f) => featureRows(f, "pl-10"))}
                  {isOpen(pk) && orphanRows(p, orphans, "pl-10")}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
