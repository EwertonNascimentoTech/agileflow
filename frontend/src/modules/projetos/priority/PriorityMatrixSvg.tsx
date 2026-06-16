import { useMemo, useState } from "react"

import type { PriorityQuadrant, PrioritySettings } from "@/api/projetos"

const W = 720
const H = 560
const PAD = 48

/** Ponto plotável na matriz Impacto × Esforço. */
export interface MatrixPoint {
  task_id: string
  title: string
  impacto_efetivo: number
  esforco: number
  pillar_code?: string | null
  perspective?: string | null
  color?: string | null
}

/**
 * Matriz Impacto × Esforço (SVG desenhado à mão). Extraído de ProjectPriorityMatrixPage
 * para reuso no Painel do PO. Pontos clicáveis via `onPointClick`.
 */
export function PriorityMatrixSvg({
  items,
  quadrants,
  settings,
  onPointClick,
}: {
  items: MatrixPoint[]
  quadrants: PriorityQuadrant[]
  settings: PrioritySettings | null
  onPointClick?: (taskId: string) => void
}) {
  const [hover, setHover] = useState<MatrixPoint | null>(null)

  const geom = useMemo(() => {
    const xMax = Math.max(5, ...items.map((i) => Math.ceil(i.esforco)))
    const yMax = Math.max(5, ...items.map((i) => Math.ceil(i.impacto_efetivo)))
    const sx = (v: number) => PAD + (v / xMax) * (W - 2 * PAD)
    const sy = (v: number) => H - PAD - (v / yMax) * (H - 2 * PAD)
    return { xMax, yMax, sx, sy }
  }, [items])

  const perspectives = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) if (i.perspective && i.color) m.set(i.perspective, i.color)
    return [...m.entries()]
  }, [items])

  // Posições plotadas com tratamento de SOBREPOSIÇÃO: pontos com mesma coordenada
  // (mesmo impacto×esforço) são espalhados em círculo para que todos fiquem visíveis.
  const placed = useMemo(() => {
    const groups = new Map<string, { item: MatrixPoint; bx: number; by: number }[]>()
    for (const i of items) {
      const bx = geom.sx(i.esforco)
      const by = geom.sy(i.impacto_efetivo)
      const key = `${Math.round(bx)},${Math.round(by)}`
      const arr = groups.get(key) ?? []
      arr.push({ item: i, bx, by })
      groups.set(key, arr)
    }
    const out: { item: MatrixPoint; cx: number; cy: number }[] = []
    for (const arr of groups.values()) {
      if (arr.length === 1) {
        out.push({ item: arr[0].item, cx: arr[0].bx, cy: arr[0].by })
        continue
      }
      const r = 7
      arr.forEach((p, idx) => {
        const ang = (2 * Math.PI * idx) / arr.length
        out.push({ item: p.item, cx: p.bx + r * Math.cos(ang), cy: p.by + r * Math.sin(ang) })
      })
    }
    return out
  }, [items, geom])

  const impactCut = settings?.impact_cut ?? 3
  const effortCut = settings?.effort_cut ?? 3
  const cutX = geom.sx(effortCut)
  const cutY = geom.sy(impactCut)
  const ql = (code: string) => quadrants.find((q) => q.code === code)?.label ?? code

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-full rounded-md border bg-card">
          {/* fundo dos quadrantes — posição casa com os eixos (X=esforço, Y=impacto) */}
          {/* cima-esquerda: alto impacto, baixo esforço → quick_win (verde) */}
          <rect x={PAD} y={PAD} width={cutX - PAD} height={cutY - PAD} fill="#16A34A" opacity={0.06} />
          {/* cima-direita: alto impacto, alto esforço → big_bet (azul) */}
          <rect x={cutX} y={PAD} width={W - PAD - cutX} height={cutY - PAD} fill="#2563EB" opacity={0.06} />
          {/* baixo-esquerda: baixo impacto, baixo esforço → fill_in (âmbar) */}
          <rect x={PAD} y={cutY} width={cutX - PAD} height={H - PAD - cutY} fill="#CA8A04" opacity={0.06} />
          {/* baixo-direita: baixo impacto, alto esforço → money_pit (vermelho) */}
          <rect x={cutX} y={cutY} width={W - PAD - cutX} height={H - PAD - cutY} fill="#DC2626" opacity={0.06} />

          {/* eixos */}
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="currentColor" strokeOpacity={0.3} />
          <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="currentColor" strokeOpacity={0.3} />

          {/* linhas de corte */}
          <line x1={cutX} y1={PAD} x2={cutX} y2={H - PAD} stroke="currentColor" strokeDasharray="4 4" strokeOpacity={0.5} />
          <line x1={PAD} y1={cutY} x2={W - PAD} y2={cutY} stroke="currentColor" strokeDasharray="4 4" strokeOpacity={0.5} />

          {/* rótulos dos quadrantes — alinhados às regiões corretas */}
          <text x={(PAD + cutX) / 2} y={PAD + 16} textAnchor="middle" className="fill-current text-[11px] font-semibold" opacity={0.6}>{ql("quick_win")}</text>
          <text x={(cutX + W - PAD) / 2} y={PAD + 16} textAnchor="middle" className="fill-current text-[11px] font-semibold" opacity={0.6}>{ql("big_bet")}</text>
          <text x={(PAD + cutX) / 2} y={H - PAD - 8} textAnchor="middle" className="fill-current text-[11px] font-semibold" opacity={0.6}>{ql("fill_in")}</text>
          <text x={(cutX + W - PAD) / 2} y={H - PAD - 8} textAnchor="middle" className="fill-current text-[11px] font-semibold" opacity={0.6}>{ql("money_pit")}</text>

          {/* títulos dos eixos */}
          <text x={W / 2} y={H - 10} textAnchor="middle" className="fill-current text-xs" opacity={0.7}>Esforço →</text>
          <text x={14} y={H / 2} textAnchor="middle" transform={`rotate(-90 14 ${H / 2})`} className="fill-current text-xs" opacity={0.7}>Impacto efetivo →</text>

          {/* pontos */}
          {placed.map(({ item: i, cx, cy }) => (
            <circle
              key={i.task_id}
              cx={cx}
              cy={cy}
              r={hover?.task_id === i.task_id ? 8 : 6}
              fill={i.color ?? "#6B7280"}
              stroke="white"
              strokeWidth={1.5}
              className={onPointClick ? "cursor-pointer transition-all" : "transition-all"}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPointClick?.(i.task_id)}
            />
          ))}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
            <p className="font-semibold">{hover.title}</p>
            <p className="text-muted-foreground">
              Impacto {hover.impacto_efetivo.toFixed(2)} · Esforço {hover.esforco.toFixed(2)}
            </p>
            {hover.perspective && (
              <p className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hover.color ?? "#6B7280" }} />
                {hover.perspective}
                {hover.pillar_code ? ` · ${hover.pillar_code}` : ""}
              </p>
            )}
          </div>
        )}
      </div>

      {perspectives.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Perspectiva</span>
          {perspectives.map(([name, color]) => (
            <span key={name} className="flex items-center gap-1.5 text-xs">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
