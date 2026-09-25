import { Fragment, useMemo, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ChevronUp, Download } from "lucide-react"

import type { PortalHealth, RoadmapPhase, RoadmapSegment } from "@/api/portalPortfolio"
import { Button } from "@/components/ui/button"
import { Card, FilterSelect, HealthDot, IconTile } from "@/modules/portal/portfolioUi"
import { HEALTH, PHASE, fmtDate, parseDay } from "@/modules/portal/portfolioMeta"

const LEFT = 300 // px da coluna dos nomes
const DAY = 86_400_000
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
const STRIPES = "repeating-linear-gradient(45deg, rgba(255,255,255,.28) 0 6px, transparent 6px 12px)"

export type RoadmapRow = {
  id: string
  title: string
  href?: string
  pct: number
  /** Bolinha à direita do nome: saúde (projeto) ou status (Feature). */
  dot: { className: string; label: string }
  segments: RoadmapSegment[]
  milestones: { date: string; label: string }[]
  strong?: boolean
}

export type RoadmapGroup = {
  key: string
  header?: { title: string; subtitle: string; icon: string | null; color: string; pct: number; health: PortalHealth }
  rows: RoadmapRow[]
}

export type Period = "6m" | "3m6m" | "12m" | "ano" | "tudo"
type Level = "meses" | "trimestres"

function monthStart(y: number, m: number): number {
  return Date.UTC(y + Math.floor(m / 12), ((m % 12) + 12) % 12, 1)
}

function ym(ms: number): [number, number] {
  const d = new Date(ms)
  return [d.getUTCFullYear(), d.getUTCMonth()]
}

function windowFor(period: Period, level: Level, groups: RoadmapGroup[]): { start: number; end: number } {
  const now = new Date()
  const [y, m] = [now.getUTCFullYear(), now.getUTCMonth()]
  let start: number
  let end: number
  if (period === "3m6m") { start = monthStart(y, m - 3); end = monthStart(y, m + 6) }
  else if (period === "12m") { start = monthStart(y, m); end = monthStart(y, m + 12) }
  else if (period === "ano") { start = monthStart(y, 0); end = monthStart(y + 1, 0) }
  else if (period === "tudo") {
    const days = groups.flatMap((g) => g.rows.flatMap((r) => r.segments.flatMap((s) => [parseDay(s.start), parseDay(s.end)])))
    const lo = days.length ? Math.min(...days) : Date.UTC(y, m, 1)
    const hi = days.length ? Math.max(...days) : Date.UTC(y, m + 6, 1)
    const [ly, lm] = ym(lo)
    const [hy, hm] = ym(hi)
    start = monthStart(ly, lm)
    end = monthStart(hy, hm + 1)
  } else { start = monthStart(y, m); end = monthStart(y, m + 6) }
  if (level === "trimestres") {
    const [sy, sm] = ym(start)
    const [ey, em] = ym(end - DAY)
    start = monthStart(sy, sm - (sm % 3))
    end = monthStart(ey, em - (em % 3) + 3)
  }
  return { start, end }
}

function columns(start: number, end: number, level: Level): { start: number; end: number; label: string }[] {
  const out = []
  let [y, m] = ym(start)
  const step = level === "trimestres" ? 3 : 1
  for (let cur = monthStart(y, m); cur < end; ) {
    const next = monthStart(y, m + step)
    out.push({ start: cur, end: next, label: level === "trimestres" ? `T${Math.floor(m / 3) + 1}/${y}` : `${MONTHS[m]}/${y}` })
    ;[y, m] = ym(next)
    cur = next
  }
  return out
}

function Bar({ seg, frac }: { seg: RoadmapSegment; frac: (ms: number) => number }) {
  const l = frac(parseDay(seg.start))
  const r = frac(parseDay(seg.end))
  if (r <= 0 || l >= 1 || r - l < 0) return null
  const meta = PHASE[seg.phase]
  const cls = seg.kind === "previsto"
    ? `${meta.light} border border-dashed border-black/25 dark:border-white/30`
    : `${meta.bar} ${seg.kind === "realizado" ? "opacity-80" : "shadow-sm"}`
  const width = Math.max(r - l, 0.004)
  const tip = `${meta.label} · ${seg.kind === "previsto" ? "previsto" : seg.kind === "atual" ? "atual" : "realizado"} · ${fmtDate(seg.start)} a ${fmtDate(seg.end)}`
  return (
    <div
      className={`absolute top-1/2 flex h-6 -translate-y-1/2 items-center justify-center overflow-hidden rounded-md px-1.5 text-[11px] font-medium ${cls}`}
      style={{
        left: `${Math.max(l, 0) * 100}%`,
        width: `${Math.max(Math.min(r, 1) - Math.max(l, 0), 0.004) * 100}%`,
        ...(seg.phase === "impedimento" ? { backgroundImage: STRIPES } : {}),
      }}
      title={tip}
    >
      {width > 0.07 && <span className="truncate">{meta.label}</span>}
    </div>
  )
}

/** Linha do tempo com fases realizadas/previstas, marcos e a linha de hoje. */
export function RoadmapGrid({
  groups,
  leftTitle,
  legendExtra,
  footnote,
  phases,
  defaultPeriod = "6m",
}: {
  groups: RoadmapGroup[]
  leftTitle: string
  legendExtra: ReactNode
  footnote: ReactNode
  phases: RoadmapPhase[]
  defaultPeriod?: Period
}) {
  const [period, setPeriod] = useState<Period>(defaultPeriod)
  const [level, setLevel] = useState<Level>("meses")
  const [closed, setClosed] = useState<Set<string>>(new Set())

  const win = useMemo(() => windowFor(period, level, groups), [period, level, groups])
  const cols = useMemo(() => columns(win.start, win.end, level), [win, level])
  const span = win.end - win.start
  const frac = (ms: number) => (ms - win.start) / span
  const now = new Date()
  const todayFrac = frac(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const minWidth = LEFT + cols.length * (level === "meses" ? 110 : 170)
  const periodLabel = `${cols[0]?.label ?? ""} – ${cols[cols.length - 1]?.label ?? ""}`
  const pos = (f: number) => `calc(${LEFT}px + (100% - ${LEFT}px) * ${f})`
  const grid = { gridTemplateColumns: `${LEFT}px minmax(0,1fr)` }

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4 print:hidden">
        <div className="flex flex-wrap gap-3">
          <FilterSelect
            label="Período" value={period} onChange={(v) => setPeriod(v as Period)}
            options={[
              { value: "6m", label: "Próximos 6 meses" },
              { value: "3m6m", label: "3 meses atrás a 6 à frente" },
              { value: "12m", label: "Próximos 12 meses" },
              { value: "ano", label: `Ano de ${now.getFullYear()}` },
              { value: "tudo", label: "Todo o período" },
            ]}
          />
          <FilterSelect
            label="Nível de visualização" value={level} onChange={(v) => setLevel(v as Level)}
            options={[{ value: "meses", label: "Meses" }, { value: "trimestres", label: "Trimestres" }]}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{periodLabel}</span>
          <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Download size={15} /> Exportar
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="relative text-sm" style={{ minWidth }}>
          {/* Grade e linha de hoje: um elemento por coluna, nunca por linha. */}
          {cols.slice(1).map((c) => (
            <span key={c.start} className="pointer-events-none absolute inset-y-0 w-px bg-border" style={{ left: pos(frac(c.start)) }} aria-hidden />
          ))}
          {todayFrac >= 0 && todayFrac <= 1 && (
            <span className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-dashed border-blue-600 dark:border-sky-400" style={{ left: pos(todayFrac) }}>
              <span className="absolute -left-5 top-7 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-sky-500">Hoje</span>
            </span>
          )}

          <div className="grid border-b bg-muted/40 text-xs text-muted-foreground" style={grid}>
            <div className="sticky left-0 z-10 bg-muted px-4 py-2.5 font-medium">{leftTitle}</div>
            <div className="relative flex">
              {cols.map((c) => (
                <div key={c.start} className="py-2.5 text-center font-medium" style={{ width: `${((c.end - c.start) / span) * 100}%` }}>
                  {c.label}
                </div>
              ))}
            </div>
          </div>

          {groups.map((g) => {
            const open = !closed.has(g.key)
            const h = g.header
            const tint = h ? `linear-gradient(${h.color}17, ${h.color}17), hsl(var(--card))` : undefined
            return (
              <Fragment key={g.key}>
                {h && (
                  <div className="grid border-b" style={grid}>
                    <div className="sticky left-0 z-10 flex items-center gap-3 px-4 py-2.5" style={{ background: tint }}>
                      <IconTile icon={h.icon} color={h.color} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{h.title}</p>
                        <p className="text-xs text-muted-foreground">{h.subtitle}</p>
                      </div>
                      <span className="font-semibold tabular-nums">{h.pct}%</span>
                      <HealthDot value={h.health} />
                    </div>
                    <div className="flex items-center justify-end pr-3" style={{ background: tint }}>
                      <button
                        type="button"
                        onClick={() => setClosed((prev) => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n })}
                        className="rounded p-1 text-muted-foreground hover:bg-background/60 print:hidden"
                        aria-expanded={open} aria-label={open ? "Recolher grupo" : "Expandir grupo"}
                      >
                        <ChevronUp size={16} className={`transition-transform ${open ? "" : "rotate-180"}`} />
                      </button>
                    </div>
                  </div>
                )}
                {open && g.rows.map((r) => (
                  <div key={r.id} className={`grid border-b last:border-b-0 ${r.strong ? "bg-muted/30" : ""}`} style={grid}>
                    <div className={`sticky left-0 z-10 flex items-center gap-3 px-4 py-2 ${r.strong ? "bg-muted" : "bg-card"}`}>
                      {r.href ? (
                        <Link to={r.href} className={`min-w-0 flex-1 truncate hover:underline ${r.strong ? "font-semibold" : ""}`} title={r.title}>{r.title}</Link>
                      ) : (
                        <span className={`min-w-0 flex-1 truncate ${r.strong ? "font-semibold" : ""}`} title={r.title}>{r.title}</span>
                      )}
                      <span className="tabular-nums text-muted-foreground">{r.pct}%</span>
                      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${r.dot.className}`} title={r.dot.label} aria-label={r.dot.label} role="img" />
                    </div>
                    <div className="relative h-11">
                      {r.segments.map((s, i) => <Bar key={`${s.phase}-${s.start}-${i}`} seg={s} frac={frac} />)}
                      {r.milestones.map((m) => {
                        const f = frac(parseDay(m.date))
                        if (f < 0 || f > 1) return null
                        return (
                          <span
                            key={`${m.label}-${m.date}`}
                            className="absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-blue-700 bg-white dark:border-sky-400 dark:bg-background"
                            style={{ left: `${f * 100}%` }}
                            title={`${m.label} · ${fmtDate(m.date)}`}
                          />
                        )
                      })}
                      {r.segments.length === 0 && (
                        <span className="absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">Sem datas no cronograma</span>
                      )}
                    </div>
                  </div>
                ))}
              </Fragment>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-4 py-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Fases:</span>
        {phases.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${PHASE[k].dot}`} aria-hidden /> {PHASE[k].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm border border-dashed border-sky-500 bg-sky-100 dark:bg-sky-900/60" aria-hidden /> Previsto
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 border-2 border-blue-700 bg-white dark:border-sky-400 dark:bg-background" aria-hidden /> Marco
        </span>
        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
        {legendExtra}
      </div>
      <p className="px-4 pb-4 text-xs text-muted-foreground">{footnote}</p>
    </Card>
  )
}

export function HealthLegend() {
  return (
    <>
      <span className="font-medium text-foreground">Saúde:</span>
      {(["no_prazo", "atencao", "critico"] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${HEALTH[k].dot}`} aria-hidden /> {HEALTH[k].label}
        </span>
      ))}
    </>
  )
}
