import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, ChevronsDownUp, ChevronsUpDown, FolderKanban, Hourglass, Info, Search } from "lucide-react"

import { portalOccurrencesApi, type OccurrenceSummary } from "@/api/clientes"
import type { PortalPortfolio, PortalStatus, QuadrantCode } from "@/api/portalPortfolio"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/EmptyState"
import { useAuth } from "@/contexts/AuthContext"
import { apiErrorDetail, needsMyAction, plural } from "@/modules/portal/occurrenceUi"
import { PortfolioTable } from "@/modules/portal/PortfolioTable"
import { StrategicMap, type MapItem } from "@/modules/portal/StrategicMap"
import { Card, FilterSelect, Segmented } from "@/modules/portal/portfolioUi"
import { fmtDateTime, groupKey, loadPortfolio, STATUS, usePortalBase } from "@/modules/portal/portfolioMeta"

const ALL = "__all__"
const DIRECT = "__direct__"
const QUADRANT_ORDER: QuadrantCode[] = ["big_bet", "quick_win", "money_pit", "fill_in"]

function CriteriaDialog({ data, open, onOpenChange }: { data: PortalPortfolio; open: boolean; onOpenChange: (v: boolean) => void }) {
  const block = (title: string, items: PortalPortfolio["criteria"]["impact"]) => (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="space-y-2">
        {items.map((c) => (
          <li key={c.label} className="rounded-lg border p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{c.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">peso {Math.round(c.weight * 100)}%</span>
            </div>
            {c.scale.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                {c.scale.map((s) => (
                  <li key={s.value}><strong className="text-foreground">{s.value}</strong> — {s.description}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Como os projetos são classificados</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Cada projeto recebe uma nota de impacto e uma de esforço na priorização. Impacto a partir de{" "}
          <strong className="text-foreground">{data.cuts.impact}</strong> é alto; esforço a partir de{" "}
          <strong className="text-foreground">{data.cuts.effort}</strong> é alto. O cruzamento define o quadrante.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          {block("Impacto", data.criteria.impact)}
          {block("Esforço", data.criteria.effort)}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Visão geral do cliente: mapa Impacto × Esforço, classificação e projetos por programa. */
export default function ClientPortfolioPage() {
  const base = usePortalBase()
  const { user } = useAuth()
  const [data, setData] = useState<PortalPortfolio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<OccurrenceSummary[]>([])
  const [mapMode, setMapMode] = useState<"projetos" | "programas">("projetos")
  const [scope, setScope] = useState(ALL)
  const [area, setArea] = useState(ALL)
  const [status, setStatus] = useState<string>(ALL)
  const [grouped, setGrouped] = useState(true)
  const [q, setQ] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [criteriaOpen, setCriteriaOpen] = useState(false)

  useEffect(() => {
    loadPortfolio(true)
      .then((d) => {
        setData(d)
        // Abre o primeiro grupo para a tabela não nascer vazia.
        const first = d.projects[0]
        if (first) setExpanded(new Set([groupKey(first, d.programs)]))
      })
      .catch((err) => setError(apiErrorDetail(err, "Não foi possível carregar o portfólio.")))
      .finally(() => setLoading(false))
    if (user?.is_client || user?.has_client_portal) {
      portalOccurrencesApi.list().then((os) => setPending(os.filter(needsMyAction))).catch(() => setPending([]))
    }
  }, [user?.is_client, user?.has_client_portal])

  const filtered = useMemo(() => {
    if (!data) return []
    const term = q.trim().toLowerCase()
    return data.projects.filter((p) => {
      if (scope === DIRECT && p.access !== "projeto") return false
      if (scope !== ALL && scope !== DIRECT && p.program_id !== scope) return false
      if (area !== ALL && p.area !== area) return false
      if (status !== ALL && p.status !== status) return false
      if (term && !`${p.title} ${p.subtitle ?? ""} ${p.program_name ?? ""}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [data, scope, area, status, q])

  // Mapa e resumo ignoram a busca da tabela (só os filtros do topo).
  const mapProjects = useMemo(() => {
    if (!data) return []
    return data.projects.filter((p) => {
      if (scope === DIRECT && p.access !== "projeto") return false
      if (scope !== ALL && scope !== DIRECT && p.program_id !== scope) return false
      if (area !== ALL && p.area !== area) return false
      if (status !== ALL && p.status !== status) return false
      return true
    })
  }, [data, scope, area, status])

  const mapItems = useMemo<MapItem[]>(() => {
    if (!data) return []
    if (mapMode === "projetos") {
      return mapProjects
        .filter((p) => p.impact != null && p.effort != null)
        .map((p) => ({
          id: p.task_id, label: p.title, impact: p.impact as number, effort: p.effort as number, size: p.hours,
          quadrant: p.quadrant_code, href: `${base}/projetos/${p.task_id}`, hint: p.program_name ?? p.subtitle,
        }))
    }
    const ids = new Set(mapProjects.map((p) => p.program_id))
    return data.programs
      .filter((g) => ids.has(g.id) && g.impact != null && g.effort != null)
      .map((g) => ({
        id: g.id, label: g.name, impact: g.impact as number, effort: g.effort as number, size: g.hours,
        quadrant: g.quadrant_code, href: `${base}/programas/${g.id}`, hint: plural(g.project_count, "projeto", "projetos"),
      }))
  }, [data, mapMode, mapProjects, base])

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-2/3 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-[420px] rounded-2xl" />
          <Skeleton className="h-[420px] rounded-2xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    )
  }
  if (!data) {
    return (
      <Card>
        <EmptyState icon={FolderKanban} title="Portfólio indisponível" description={error ?? "Tente de novo em instantes."} />
      </Card>
    )
  }

  const firstName = (user?.full_name ?? "").trim().split(/\s+/)[0] || "cliente"
  const noun = mapMode === "projetos" ? "projetos" : "programas"
  const counts = new Map<QuadrantCode, number>()
  for (const it of mapItems) if (it.quadrant) counts.set(it.quadrant, (counts.get(it.quadrant) ?? 0) + 1)
  const scored = mapItems.length
  const quadrants = QUADRANT_ORDER.map((code) => data.quadrants.find((x) => x.code === code)).filter(Boolean) as PortalPortfolio["quadrants"]
  const sizes = mapItems.map((i) => i.size).filter((s) => s > 0).sort((a, b) => a - b)
  const statusOptions = (Object.keys(STATUS) as PortalStatus[]).map((k) => ({ value: k, label: STATUS[k].label }))

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const allKeys = Array.from(new Set(filtered.map((p) => groupKey(p, data.programs))))
  const allOpen = allKeys.length > 0 && allKeys.every((k) => expanded.has(k))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Olá, {firstName}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight md:text-3xl">Meu Portfólio de Transformação Digital</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe a posição estratégica dos seus projetos, a evolução, a saúde e os próximos marcos.
          </p>
        </div>
        <p className="text-right text-xs text-muted-foreground">
          Última atualização
          <br />
          <span className="text-foreground">{fmtDateTime(data.updated_at ?? data.generated_at)}</span>
        </p>
      </div>

      {pending.length > 0 && (
        <Link
          to={`${base}/ocorrencias?minhas=1&situacao=acao`}
          className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <Hourglass size={16} className="shrink-0" />
          <span className="flex-1">
            <strong>{plural(pending.length, "ocorrência aguarda", "ocorrências aguardam")}</strong> a sua resposta.
          </span>
          <ArrowRight size={15} />
        </Link>
      )}

      {data.projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="Nenhum projeto vinculado"
            description={
              data.viewer.team && !data.viewer.client
                ? "No modo cliente você vê os projetos em que é PO ou desenvolvedor. Quando tiver algum, ele aparece aqui."
                : "Peça ao Product Owner para vincular o seu cadastro a um projeto ou programa."
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Segmented
              value={mapMode}
              onChange={setMapMode}
              options={[{ value: "projetos", label: "Projetos" }, { value: "programas", label: "Programas" }]}
            />
            <div className="flex w-full flex-wrap gap-3 sm:w-auto">
              <FilterSelect
                label="Escopo"
                value={scope}
                onChange={setScope}
                options={[
                  { value: ALL, label: "Todo o portfólio" },
                  { value: DIRECT, label: "Projetos em que estou" },
                  ...data.programs.map((g) => ({ value: g.id, label: g.name })),
                ]}
              />
              <FilterSelect
                label="Área"
                value={area}
                onChange={setArea}
                options={[{ value: ALL, label: "Todas as áreas" }, ...data.areas]}
              />
              <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: ALL, label: "Todos os status" }, ...statusOptions]} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
            <Card className="p-5">
              <div className="mb-3">
                <h2 className="flex items-center gap-1.5 text-lg font-semibold">
                  Mapa Estratégico dos {mapMode === "projetos" ? "Projetos" : "Programas"}
                  <Info size={15} className="text-muted-foreground" aria-hidden />
                </h2>
                <p className="text-sm text-muted-foreground">
                  Cada {mapMode === "projetos" ? "projeto" : "programa"} fica na posição do impacto estratégico e do esforço de implementação.
                </p>
              </div>
              {mapItems.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Nenhum {mapMode === "projetos" ? "projeto" : "programa"} classificado com esses filtros.</p>
              ) : (
                <StrategicMap items={mapItems} cuts={data.cuts} quadrants={data.quadrants} />
              )}
            </Card>

            <Card className="flex flex-col gap-4 p-5">
              <h2 className="text-lg font-semibold">Resumo da Classificação Estratégica</h2>
              <div className="grid grid-cols-2 gap-3">
                {quadrants.map((qd) => {
                  const n = counts.get(qd.code) ?? 0
                  const pct = scored ? Math.round((100 * n) / scored) : 0
                  return (
                    <div
                      key={qd.code}
                      className="flex items-start gap-3 rounded-xl p-3"
                      style={{ backgroundColor: `${qd.color}14`, boxShadow: `inset 0 0 0 1px ${qd.color}40` }}
                    >
                      <span
                        className="mt-1 h-7 w-7 shrink-0 rounded-full"
                        style={{ background: `conic-gradient(${qd.color} ${pct * 3.6}deg, ${qd.color}33 0deg)` }}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-2xl font-bold leading-none tabular-nums">{n}</p>
                        <p className="mt-1 text-sm font-semibold leading-tight">{qd.label}</p>
                        <p className="text-xs text-muted-foreground">{pct}% dos {noun}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-3">
                  <p className="text-sm font-medium">Tamanho da bolha</p>
                  <div className="mt-2 flex items-end justify-around gap-2 text-center text-[11px] text-muted-foreground">
                    {[
                      { r: 7, label: "Menor esforço", v: sizes[0] },
                      { r: 13, label: "Médio", v: sizes[Math.floor(sizes.length / 2)] },
                      { r: 22, label: "Maior esforço", v: sizes[sizes.length - 1] },
                    ].map((b) => (
                      <div key={b.label} className="flex flex-col items-center gap-1">
                        <span className="rounded-full bg-muted-foreground/30" style={{ width: b.r * 2, height: b.r * 2 }} aria-hidden />
                        <span>{b.label}</span>
                        {b.v != null && <span className="tabular-nums">{Math.round(b.v)} h</span>}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">Horas estimadas das entregas.</p>
                </div>
                <div className="rounded-xl border bg-muted/40 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium"><Info size={14} /> Critérios de classificação</p>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {data.criteria.impact.map((c) => <li key={c.label}>{c.label}</li>)}
                    {data.criteria.effort.length > 0 && <li>Esforço: {data.criteria.effort.map((c) => c.label.toLowerCase()).join(", ")}</li>}
                  </ul>
                  <button type="button" onClick={() => setCriteriaOpen(true)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Saiba mais sobre os critérios <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 md:p-5">
              <div>
                <h2 className="text-lg font-semibold">Projetos do Portfólio</h2>
                <p className="text-sm text-muted-foreground">
                  Seus projetos{grouped ? ", organizados por programa," : ""} com status, evolução, saúde e próximos marcos.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar projeto…"
                    aria-label="Buscar projeto"
                    className="h-9 w-48 rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                {grouped && (
                  <Button
                    variant="outline" size="sm" className="h-9 gap-1.5"
                    onClick={() => setExpanded(allOpen ? new Set() : new Set(allKeys))}
                  >
                    {allOpen ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
                    {allOpen ? "Recolher todos" : "Expandir todos"}
                  </Button>
                )}
                <Segmented
                  size="sm"
                  value={grouped ? "g" : "f"}
                  onChange={(v) => setGrouped(v === "g")}
                  options={[{ value: "g", label: "Agrupado por programa" }, { value: "f", label: "Todos os projetos" }]}
                />
              </div>
            </div>
            <PortfolioTable
              projects={filtered}
              programs={data.programs}
              quadrants={data.quadrants}
              grouped={grouped}
              expanded={q.trim() ? new Set(allKeys) : expanded}
              onToggle={toggle}
            />
          </Card>
          <CriteriaDialog data={data} open={criteriaOpen} onOpenChange={setCriteriaOpen} />
        </>
      )}
    </div>
  )
}
