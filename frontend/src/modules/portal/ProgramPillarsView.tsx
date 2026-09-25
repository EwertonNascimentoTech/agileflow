import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronUp } from "lucide-react"

import type { PortalPillar, PortalProgramDetail, PortalPhase } from "@/api/portalPortfolio"
import { Card, HealthBadge, HealthDot, IconTile, PhaseBadge, ProgressBar } from "@/modules/portal/portfolioUi"
import { colorFor, fmtDate, PHASE, usePortalBase } from "@/modules/portal/portfolioMeta"

/** Contadores por fase do card do pilar (homologação inclui produção). */
const COUNTERS: { label: string; phases: PortalPhase[]; dot: string; always: boolean }[] = [
  { label: "Planejamento", phases: ["planejamento"], dot: PHASE.planejamento.dot, always: true },
  { label: "Desenvolvimento", phases: ["desenvolvimento"], dot: PHASE.desenvolvimento.dot, always: true },
  { label: "Homologação", phases: ["homologacao", "producao"], dot: PHASE.homologacao.dot, always: true },
  { label: "Concluídos", phases: ["concluido"], dot: PHASE.concluido.dot, always: true },
  { label: "Impedimento", phases: ["impedimento"], dot: PHASE.impedimento.dot, always: false },
]

function PillarCard({ pillar, data }: { pillar: PortalPillar; data: PortalProgramDetail }) {
  const base = usePortalBase()
  const navigate = useNavigate()
  const [open, setOpen] = useState(true)
  const color = colorFor(pillar.color, pillar.id ?? "sem-pilar")
  const projects = data.projects.filter((p) => p.pillar_id === pillar.id)
  const counters = COUNTERS.map((c) => ({ ...c, n: c.phases.reduce((s, ph) => s + (pillar.phase_counts[ph] ?? 0), 0) }))
    .filter((c) => c.always || c.n > 0)

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b p-4" style={{ backgroundColor: `${color}0f`, borderColor: `${color}33` }}>
        <IconTile icon={pillar.icon} color={color} size={48} />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold leading-tight">{pillar.name}</h3>
          {pillar.description && <p className="line-clamp-2 text-sm text-muted-foreground">{pillar.description}</p>}
        </div>
        <HealthBadge value={pillar.health} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-md p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
          aria-expanded={open}
          aria-label={open ? "Recolher pilar" : "Expandir pilar"}
        >
          <ChevronUp size={18} className={`transition-transform ${open ? "" : "rotate-180"}`} />
        </button>
      </div>
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-4">
          <span className="shrink-0 font-semibold">{pillar.project_count} {pillar.project_count === 1 ? "projeto" : "projetos"}</span>
          <ProgressBar value={pillar.exec_avg} color={color} className="flex-1" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {counters.map((c) => (
            <div key={c.label} className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
              <span className={`h-3 w-3 shrink-0 rounded-full ${c.dot}`} aria-hidden />
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-none tabular-nums">{c.n}</span>
                <span className="block truncate text-xs text-muted-foreground">{c.label}</span>
              </span>
            </div>
          ))}
        </div>
        {open && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] table-fixed text-sm">
              <colgroup>
                <col style={{ width: "36%" }} />
                <col style={{ width: "19%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "26%" }} />
              </colgroup>
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Projeto</th>
                  <th className="px-3 py-2 font-medium">Fase atual</th>
                  <th className="px-3 py-2 font-medium">Evolução</th>
                  <th className="px-3 py-2 font-medium">Saúde</th>
                  <th className="px-3 py-2 font-medium">Próximo marco</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr
                    key={p.task_id}
                    className="cursor-pointer border-t hover:bg-muted/40"
                    onClick={() => navigate(`${base}/projetos/${p.task_id}`)}
                  >
                    <td className="px-3 py-2.5">
                      <span className="block truncate font-medium" title={p.title}>{p.title}</span>
                      {p.subtitle && <span className="block truncate text-xs text-muted-foreground">{p.subtitle}</span>}
                    </td>
                    <td className="px-3 py-2.5"><PhaseBadge value={p.roadmap_phase} /></td>
                    <td className="px-3 py-2.5 tabular-nums">{p.exec_pct}%</td>
                    <td className="px-3 py-2.5"><HealthDot value={p.health} /></td>
                    <td className="px-3 py-2.5">
                      {p.next_milestone ? (
                        <>
                          <span className="block truncate" title={p.next_milestone.title}>{p.next_milestone.title}</span>
                          <span className="block text-xs text-muted-foreground">{fmtDate(p.next_milestone.date)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{p.status === "concluido" ? "Projeto concluído" : "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  )
}

export function ProgramPillarsView({ data }: { data: PortalProgramDetail }) {
  if (data.pillars.length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum projeto neste programa.</Card>
  }
  const onlyUnassigned = data.pillars.length === 1 && data.pillars[0].id === null
  return (
    <div className="space-y-3">
      {onlyUnassigned && (
        <p className="text-sm text-muted-foreground">Os pilares deste programa ainda não foram definidos pelo time.</p>
      )}
      <div className="grid gap-4 2xl:grid-cols-2">
        {data.pillars.map((pl) => <PillarCard key={pl.id ?? "sem-pilar"} pillar={pl} data={data} />)}
      </div>
    </div>
  )
}
