import { Fragment } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ChevronDown, ChevronRight, FolderKanban } from "lucide-react"

import type { PortalProgramSummary, PortalProjectSummary, PortalQuadrant } from "@/api/portalPortfolio"
import { HealthBadge, IconTile, ProgressBar, QuadrantBadge, StatusLabel } from "@/modules/portal/portfolioUi"
import { NO_PROGRAM, colorFor, fmtDate, groupKey, quadrantOf, usePortalBase } from "@/modules/portal/portfolioMeta"

function ProjectRow({ p, quadrants, indent }: { p: PortalProjectSummary; quadrants: PortalQuadrant[]; indent: boolean }) {
  const base = usePortalBase()
  const navigate = useNavigate()
  const href = `${base}/projetos/${p.task_id}`
  return (
    <tr
      className="cursor-pointer border-t transition-colors hover:bg-muted/50"
      onClick={() => navigate(href)}
    >
      <td className={`py-2.5 pr-3 ${indent ? "pl-6" : "pl-4"}`}>
        <Link to={href} className="line-clamp-2 font-medium leading-snug hover:underline" title={p.title} onClick={(e) => e.stopPropagation()}>
          {p.title}
        </Link>
        {p.subtitle && <span className="block truncate text-xs text-muted-foreground">{p.subtitle}</span>}
      </td>
      <td className="overflow-hidden px-3 py-2.5"><QuadrantBadge quadrant={quadrantOf(quadrants, p.quadrant_code)} /></td>
      <td className="px-3 py-2.5"><StatusLabel value={p.status} /></td>
      <td className="px-3 py-2.5"><HealthBadge value={p.health} /></td>
      <td className="px-3 py-2.5"><ProgressBar value={p.exec_pct} /></td>
      <td className="px-3 py-2.5">
        {p.next_milestone ? (
          <span className="block truncate" title={p.next_milestone.title}>{p.next_milestone.title}</span>
        ) : (
          <span className="text-muted-foreground">{p.status === "concluido" ? "Projeto concluído" : "—"}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">
        {fmtDate(p.delivered_at ?? p.next_milestone?.date ?? p.due_date)}
      </td>
      <td className="pr-3"><ChevronRight size={16} className="text-muted-foreground" /></td>
    </tr>
  )
}

/** Tabela dos projetos: agrupada por programa (com a linha do programa) ou lista simples. */
export function PortfolioTable({
  projects,
  programs,
  quadrants,
  grouped,
  expanded,
  onToggle,
}: {
  projects: PortalProjectSummary[]
  programs: PortalProgramSummary[]
  quadrants: PortalQuadrant[]
  grouped: boolean
  expanded: Set<string>
  onToggle: (key: string) => void
}) {
  const base = usePortalBase()
  const head = (
    <>
    <colgroup>
      <col style={{ width: "27%" }} />
      <col style={{ width: "14%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "10%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "15%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "2.5%" }} />
    </colgroup>
    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
      <tr>
        <th className="py-2.5 pl-4 pr-3 font-medium">Projeto</th>
        <th className="px-3 py-2.5 font-medium">Classificação</th>
        <th className="px-3 py-2.5 font-medium">Status</th>
        <th className="px-3 py-2.5 font-medium">Saúde</th>
        <th className="px-3 py-2.5 font-medium">Evolução</th>
        <th className="px-3 py-2.5 font-medium">Próximo marco</th>
        <th className="px-3 py-2.5 font-medium">Previsão</th>
        <th />
      </tr>
    </thead>
    </>
  )

  if (projects.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum projeto com esses filtros.</p>
  }

  if (!grouped) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] table-fixed text-sm">
          {head}
          <tbody>
            {projects.map((p) => <ProjectRow key={p.task_id} p={p} quadrants={quadrants} indent={false} />)}
          </tbody>
        </table>
      </div>
    )
  }

  const byGroup = new Map<string, PortalProjectSummary[]>()
  for (const p of projects) {
    const k = groupKey(p, programs)
    byGroup.set(k, [...(byGroup.get(k) ?? []), p])
  }
  const groups = [
    ...programs.filter((g) => byGroup.has(g.id)).map((g) => ({ key: g.id, program: g as PortalProgramSummary | null })),
    ...(byGroup.has(NO_PROGRAM) ? [{ key: NO_PROGRAM, program: null }] : []),
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] table-fixed text-sm">
        {head}
        <tbody>
          {groups.map(({ key, program }) => {
            const rows = byGroup.get(key) ?? []
            const open = expanded.has(key)
            const avg = rows.length ? Math.round(rows.reduce((s, p) => s + p.exec_pct, 0) / rows.length) : 0
            return (
              <Fragment key={key}>
                <tr className="border-t bg-card">
                  <td colSpan={8} className="p-0">
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                      {program ? (
                        <IconTile icon={program.icon} color={colorFor(program.color, program.id)} />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                          <FolderKanban size={19} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {program ? (
                            <Link to={`${base}/programas/${program.id}`} className="font-semibold hover:underline">
                              {program.name}
                            </Link>
                          ) : (
                            <span className="font-semibold">Projetos sem programa</span>
                          )}
                          {program && <QuadrantBadge quadrant={quadrantOf(quadrants, program.quadrant_code)} />}
                        </div>
                        {program?.description && (
                          <p className="line-clamp-1 text-xs text-muted-foreground">{program.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        <strong className="text-sm text-foreground">{rows.length}</strong> {rows.length === 1 ? "projeto" : "projetos"}
                      </span>
                      <span className="border-l pl-3 text-xs text-muted-foreground">
                        <strong className="text-sm text-foreground">{avg}%</strong> evolução média
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggle(key)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-expanded={open}
                        aria-label={open ? "Recolher" : "Expandir"}
                      >
                        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </td>
                </tr>
                {open && rows.map((p) => <ProjectRow key={p.task_id} p={p} quadrants={quadrants} indent />)}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
