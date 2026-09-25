import { createElement, type ElementType, type ReactNode } from "react"

import type { PortalHealth, PortalItemStatus, PortalQuadrant, PortalStatus, RoadmapPhase } from "@/api/portalPortfolio"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { HEALTH, ITEM_STATUS, PHASE, STATUS, resolvePortalIcon } from "@/modules/portal/portfolioMeta"

// ── Ícones e cores de Programa/Pilar (texto livre no cadastro) ──────────────

/** Quadrado com o ícone na cor do programa/pilar (fundo translúcido funciona nos dois temas). */
export function IconTile({ icon, color, size = 40 }: { icon: string | null; color: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, backgroundColor: `${color}1f`, color }}
      aria-hidden
    >
      {createElement(resolvePortalIcon(icon), { size: Math.round(size * 0.5) })}
    </span>
  )
}

// ── Saúde, status e fase ────────────────────────────────────────────────────

export function HealthBadge({ value }: { value: PortalHealth }) {
  const h = HEALTH[value]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${h.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${h.dot}`} aria-hidden />
      {h.label}
    </span>
  )
}

export function HealthDot({ value }: { value: PortalHealth }) {
  const h = HEALTH[value]
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${h.dot}`} title={h.label} aria-label={h.label} role="img" />
}

export function StatusLabel({ value }: { value: PortalStatus }) {
  const s = STATUS[value]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  )
}

export function ItemStatusBadge({ value }: { value: PortalItemStatus }) {
  const s = ITEM_STATUS[value]
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  )
}

export function PhaseBadge({ value }: { value: RoadmapPhase }) {
  const p = PHASE[value]
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${p.badge}`}>{p.label}</span>
}

// ── Classificação (quadrante da priorização) ────────────────────────────────

/** Selo com a cor do quadrante (a cor vem da Config → Priorização). */
export function QuadrantBadge({ quadrant }: { quadrant: PortalQuadrant | null }) {
  if (!quadrant) return <span className="text-xs text-muted-foreground">Sem classificação</span>
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium text-foreground"
      style={{ backgroundColor: `${quadrant.color}1a`, boxShadow: `inset 0 0 0 1px ${quadrant.color}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: quadrant.color }} aria-hidden />
      {quadrant.label}
    </span>
  )
}

// ── Progresso ───────────────────────────────────────────────────────────────

export function ProgressBar({
  value,
  color,
  className = "",
  showLabel = true,
}: {
  value: number | null | undefined
  color?: string
  className?: string
  showLabel?: boolean
}) {
  const v = Math.max(0, Math.min(100, Math.round(value ?? 0)))
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-2 min-w-[60px] flex-1 overflow-hidden rounded-full bg-muted dark:bg-white/10" role="progressbar"
        aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`h-full rounded-full ${color ? "" : v >= 100 ? "bg-emerald-500" : "bg-primary"}`}
          style={{ width: `${v}%`, ...(color ? { backgroundColor: color } : {}) }}
        />
      </div>
      {showLabel && <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{v}%</span>}
    </div>
  )
}

export function ProgressRing({ value, size = 72, stroke = 7 }: { value: number | null | undefined; size?: number; stroke?: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value ?? 0)))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted dark:stroke-white/10" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className="stroke-primary" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <span className="absolute text-base font-bold tabular-nums">{v}%</span>
    </span>
  )
}

export function DeltaLabel({ delta, days }: { delta: number | null | undefined; days: number | null | undefined }) {
  if (delta == null) return null
  const up = delta > 0
  const cls = up ? "text-emerald-600 dark:text-emerald-400" : delta < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
  return (
    <span className={`text-xs ${cls}`}>
      {up ? "▲ +" : delta < 0 ? "▼ " : ""}
      {delta} p.p. {days ? "desde o último mês" : ""}
    </span>
  )
}

// ── Datas e textos ──────────────────────────────────────────────────────────

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border bg-card shadow-sm ${className}`}>{children}</section>
}

export function Kpi({ icon: Icon, children, className = "" }: { icon?: ElementType; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      {Icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon size={19} />
        </span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// ── Controles ───────────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  size?: "md" | "sm"
}) {
  return (
    <div className="inline-flex rounded-lg border bg-background p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md font-medium transition-colors ${size === "sm" ? "px-3 py-1.5 text-xs" : "px-6 py-2 text-sm"} ${
            value === o.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="block min-w-[170px] flex-1 space-y-1 sm:flex-none">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 bg-background"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  )
}
