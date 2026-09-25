import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import type { PortalQuadrant, QuadrantCode } from "@/api/portalPortfolio"

export interface MapItem {
  id: string
  label: string
  impact: number
  effort: number
  /** Horas estimadas: tamanho da bolha. */
  size: number
  quadrant: QuadrantCode | null
  href: string
  hint?: string | null
}

const W = 800
const H = 380
const PAD = 14
// Com muitas bolhas os rótulos se atropelam: acima disso, o nome aparece ao passar o mouse.
const MAX_LABELS = 14

/** Posição do quadrante no mapa (impacto no eixo Y, esforço no X). */
const CORNER: Record<QuadrantCode, { x: "left" | "right"; y: "top" | "bottom" }> = {
  quick_win: { x: "left", y: "top" },
  big_bet: { x: "right", y: "top" },
  fill_in: { x: "left", y: "bottom" },
  money_pit: { x: "right", y: "bottom" },
}

function firstClause(text: string | null | undefined): string {
  if (!text) return ""
  return text.split(".")[0].trim()
}

function radiusFor(size: number, maxSize: number): number {
  if (!maxSize || size <= 0) return 7
  return 7 + 17 * Math.sqrt(size / maxSize)
}

/** Mapa Estratégico: impacto × esforço da priorização; bolha = horas estimadas. */
export function StrategicMap({
  items,
  cuts,
  quadrants,
}: {
  items: MapItem[]
  cuts: { impact: number; effort: number }
  quadrants: PortalQuadrant[]
}) {
  const navigate = useNavigate()
  const [hover, setHover] = useState<string | null>(null)

  const geo = useMemo(() => {
    const ys = items.map((i) => i.impact)
    const xs = items.map((i) => i.effort)
    const yLo = Math.min(1, ...ys, cuts.impact - 1)
    const yHi = Math.max(5, ...ys, cuts.impact + 1)
    const xLo = Math.min(1, ...xs, cuts.effort - 1)
    const xHi = Math.max(5, ...xs, cuts.effort + 1)
    const px = (v: number) => PAD + ((v - xLo) / (xHi - xLo)) * (W - 2 * PAD)
    const py = (v: number) => H - PAD - ((v - yLo) / (yHi - yLo)) * (H - 2 * PAD)
    const maxSize = Math.max(0, ...items.map((i) => i.size))
    // Bolhas no mesmo ponto: espalha em volta para não sumirem uma atrás da outra.
    const seen = new Map<string, number>()
    const placed = [...items]
      .sort((a, b) => b.size - a.size)
      .map((it) => {
        const key = `${it.effort.toFixed(1)}|${it.impact.toFixed(1)}`
        const n = seen.get(key) ?? 0
        seen.set(key, n + 1)
        const ang = n * 2.4
        const dist = n === 0 ? 0 : 10 + 4 * n
        return {
          ...it,
          cx: Math.min(W - PAD, Math.max(PAD, px(it.effort) + Math.cos(ang) * dist)),
          cy: Math.min(H - PAD, Math.max(PAD, py(it.impact) + Math.sin(ang) * dist)),
          r: radiusFor(it.size, maxSize),
        }
      })
    return { cutX: px(cuts.effort), cutY: py(cuts.impact), placed }
  }, [items, cuts])

  const colorOf = (code: QuadrantCode | null) => quadrants.find((q) => q.code === code)?.color ?? "#64748B"
  const showLabels = items.length <= MAX_LABELS
  const hovered = geo.placed.find((p) => p.id === hover) ?? null

  const rects: { code: QuadrantCode; x: number; y: number; w: number; h: number }[] = [
    { code: "quick_win", x: 0, y: 0, w: geo.cutX, h: geo.cutY },
    { code: "big_bet", x: geo.cutX, y: 0, w: W - geo.cutX, h: geo.cutY },
    { code: "fill_in", x: 0, y: geo.cutY, w: geo.cutX, h: H - geo.cutY },
    { code: "money_pit", x: geo.cutX, y: geo.cutY, w: W - geo.cutX, h: H - geo.cutY },
  ]

  return (
    <div className="flex gap-2">
      <div className="hidden w-20 shrink-0 flex-col justify-between py-2 text-xs text-muted-foreground sm:flex">
        <span className="font-medium text-foreground">Alto</span>
        <span className="leading-tight">Impacto estratégico</span>
        <span className="font-medium text-foreground">Baixo</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img"
            aria-label="Mapa estratégico: impacto por esforço">
            {rects.map((r) => {
              const q = quadrants.find((x) => x.code === r.code)
              const c = colorOf(r.code)
              const corner = CORNER[r.code]
              const tx = corner.x === "left" ? r.x + 12 : r.x + r.w - 12
              const ty = corner.y === "top" ? r.y + 22 : r.y + r.h - 26
              const anchor = corner.x === "left" ? "start" : "end"
              return (
                <g key={r.code}>
                  <rect x={r.x} y={r.y} width={Math.max(0, r.w)} height={Math.max(0, r.h)} fill={c} fillOpacity={0.08} />
                  {q && (
                    <>
                      <rect x={corner.x === "left" ? tx : tx - 4} y={ty - 10} width={4} height={26} rx={2} fill={c} />
                      <text x={corner.x === "left" ? tx + 9 : tx - 9} y={ty} textAnchor={anchor}>
                        <tspan fontSize="13" fontWeight="700" className="fill-foreground">{q.label.toUpperCase()}</tspan>
                        <tspan x={corner.x === "left" ? tx + 9 : tx - 9} dy="15" fontSize="11" className="fill-muted-foreground">{firstClause(q.action_hint)}</tspan>
                      </text>
                    </>
                  )}
                </g>
              )
            })}
            <line x1={geo.cutX} x2={geo.cutX} y1={0} y2={H} className="stroke-border" strokeWidth={1.5} />
            <line x1={0} x2={W} y1={geo.cutY} y2={geo.cutY} className="stroke-border" strokeWidth={1.5} />
            <line x1={0} x2={0} y1={0} y2={H} className="stroke-muted-foreground/40" strokeWidth={1.5} />
            <line x1={0} x2={W} y1={H} y2={H} className="stroke-muted-foreground/40" strokeWidth={1.5} />
            {geo.placed.map((p) => {
              const c = colorOf(p.quadrant)
              const labelLeft = p.cx > W - 180
              return (
                <g
                  key={p.id}
                  role="link"
                  tabIndex={0}
                  aria-label={`${p.label}${p.hint ? ` — ${p.hint}` : ""}`}
                  className="cursor-pointer outline-none"
                  onMouseEnter={() => setHover(p.id)}
                  onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
                  onFocus={() => setHover(p.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => navigate(p.href)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(p.href) } }}
                >
                  <circle
                    cx={p.cx} cy={p.cy} r={p.r} fill={c} fillOpacity={hover && hover !== p.id ? 0.35 : 0.85}
                    className="stroke-background" strokeWidth={2}
                  />
                  {showLabels && (
                    <text
                      x={labelLeft ? p.cx - p.r - 5 : p.cx + p.r + 5} y={p.cy + 4}
                      textAnchor={labelLeft ? "end" : "start"} fontSize="12" fontWeight="600"
                      className="pointer-events-none fill-foreground"
                    >
                      {p.label.length > 26 ? `${p.label.slice(0, 25)}…` : p.label}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
          {hovered && (
            <div
              className="pointer-events-none absolute z-10 max-w-[260px] -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
              style={{ left: `${(hovered.cx / W) * 100}%`, top: `calc(${(hovered.cy / H) * 100}% + ${hovered.r + 6}px)` }}
            >
              <p className="font-semibold">{hovered.label}</p>
              {hovered.hint && <p className="text-muted-foreground">{hovered.hint}</p>}
              <p className="text-muted-foreground">
                Impacto {hovered.impact.toFixed(1)} · Esforço {hovered.effort.toFixed(1)}
                {hovered.size > 0 && ` · ${Math.round(hovered.size)} h`}
              </p>
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Baixo</span>
          <span><span className="sm:hidden">Impacto ↑ · </span>Esforço / complexidade →</span>
          <span className="font-medium text-foreground">Alto</span>
        </div>
      </div>
    </div>
  )
}
