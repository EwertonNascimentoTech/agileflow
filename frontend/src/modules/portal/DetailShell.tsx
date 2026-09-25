import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { Activity, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Link2, Printer, Search, Star, User } from "lucide-react"

import type { PortalHealth, PortalStatus } from "@/api/portalPortfolio"
import { Button } from "@/components/ui/button"
import { toast } from "@/lib/toast"
import { HEALTH, STATUS, fmtDateTime } from "@/modules/portal/portfolioMeta"
import { DeltaLabel, IconTile, ProgressRing } from "@/modules/portal/portfolioUi"

// Casca das telas de Programa e de Projeto no Portal (mesmo layout para os dois).

export type Crumb = { label: string; to?: string }

export type MenuAction = { label: string; icon: ElementType; onClick?: () => void; to?: string }

function ActionsMenu({ extra }: { extra: MenuAction[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success("Link copiado.")
    } catch {
      toast.error("Não foi possível copiar o link.")
    }
  }
  const actions: MenuAction[] = [
    ...extra,
    { label: "Exportar (PDF)", icon: Printer, onClick: () => window.print() },
    { label: "Copiar link", icon: Link2, onClick: () => void copyLink() },
  ]
  const item = "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
  return (
    <div ref={ref} className="relative">
      <Button variant="outline" className="h-10 gap-2" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        Mais ações <ChevronDown size={15} />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border bg-popover py-1 text-sm text-popover-foreground shadow-lg">
          {actions.map((a) =>
            a.to ? (
              <Link key={a.label} role="menuitem" to={a.to} className={item} onClick={() => setOpen(false)}>
                <a.icon size={15} /> {a.label}
              </Link>
            ) : (
              <button key={a.label} role="menuitem" type="button" className={item} onClick={() => { setOpen(false); a.onClick?.() }}>
                <a.icon size={15} /> {a.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

const STATUS_PILL: Record<PortalStatus, string> = {
  planejamento: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
  execucao: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800",
  concluido: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800",
  impedimento: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-800",
  pausado: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  cancelado: "bg-slate-200 text-slate-600 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
}

/** Trilha, ícone, título com o status, favorito, "Mais ações" e última atualização. */
export function DetailHeader({
  crumbs,
  icon,
  color,
  title,
  status,
  badge,
  description,
  meta,
  updatedAt,
  favorite = false,
  onToggleFavorite,
  actions = [],
}: {
  crumbs: Crumb[]
  icon: string | null
  color: string
  title: string
  /** Status do projeto/programa; outras telas passam o próprio selo em `badge`. */
  status?: PortalStatus
  badge?: ReactNode
  description?: ReactNode
  meta?: ReactNode
  updatedAt: string | null
  /** Sem `onToggleFavorite`, a estrela não aparece. */
  favorite?: boolean
  onToggleFavorite?: () => void
  actions?: MenuAction[]
}) {
  return (
    <div className="space-y-3">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Trilha">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} />}
            {c.to ? <Link to={c.to} className="hover:text-foreground">{c.label}</Link> : <span className="font-medium text-foreground">{c.label}</span>}
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <IconTile icon={icon} color={color} size={56} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
              {badge ?? (status && (
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset ${STATUS_PILL[status]}`}>
                  <span className={`h-2 w-2 rounded-full ${STATUS[status].dot}`} aria-hidden />
                  {STATUS[status].label}
                </span>
              ))}
            </div>
            {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
            {meta && <div className="mt-1 text-xs text-muted-foreground">{meta}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 print:hidden">
            {onToggleFavorite && (
              <Button
                variant="outline" size="icon" className="h-10 w-10" onClick={onToggleFavorite}
                aria-pressed={favorite} aria-label={favorite ? "Tirar dos favoritos" : "Favoritar"} title={favorite ? "Tirar dos favoritos" : "Favoritar"}
              >
                <Star size={17} className={favorite ? "fill-amber-400 text-amber-500" : ""} />
              </Button>
            )}
            <ActionsMenu extra={actions} />
          </div>
          <p className="text-right text-xs leading-snug text-muted-foreground">
            Última atualização
            <br />
            <span className="text-foreground">{fmtDateTime(updatedAt)}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function Box({
  children,
  className = "",
  onClick,
  active = false,
  label,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  active?: boolean
  label?: string
}) {
  const base = `flex min-w-0 items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm ${className}`
  if (!onClick) return <div className={base}>{children}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`${base} transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "border-primary ring-1 ring-primary/30" : ""
      }`}
    >
      {children}
    </button>
  )
}

export function KpiEvolution({ value, delta, days }: { value: number | null; delta: number | null; days: number | null }) {
  return (
    <Box>
      <ProgressRing value={value} size={64} stroke={6} />
      <div>
        <p className="font-semibold">Evolução geral</p>
        <DeltaLabel delta={delta} days={days} />
      </div>
    </Box>
  )
}


/** Cor do ícone dos cartões de indicador. */
const TONE: Record<KpiTone, string> = {
  primary: "bg-primary/10 text-primary",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  slate: "bg-muted text-muted-foreground",
}

export type KpiTone = "primary" | "amber" | "emerald" | "red" | "violet" | "slate"

export function KpiCount({
  icon: Icon,
  value,
  label,
  tone = "primary",
  onClick,
  active,
  highlight = false,
}: {
  icon: ElementType
  value: number | string
  label: string
  tone?: KpiTone
  onClick?: () => void
  active?: boolean
  /** Destaque de "precisa de você" (borda âmbar). */
  highlight?: boolean
}) {
  return (
    <Box onClick={onClick} active={active} label={onClick ? `${label}: ${value}` : undefined}
      className={highlight ? "border-amber-300 dark:border-amber-800" : ""}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[tone]}`}><Icon size={19} /></span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none tabular-nums">{value}</p>
        <p className="mt-1 line-clamp-2 text-sm leading-tight text-muted-foreground">{label}</p>
      </div>
    </Box>
  )
}

/** Cartão com um valor em texto (ex.: Prioridade "P2 · Alta", Impacto). */
export function KpiText({ icon: Icon, value, label, tone = "primary" }: { icon: ElementType; value: ReactNode; label: string; tone?: KpiTone }) {
  return (
    <Box>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[tone]}`}><Icon size={19} /></span>
      <div className="min-w-0">
        <div className="truncate font-semibold">{value}</div>
        <p className="line-clamp-2 text-sm leading-tight text-muted-foreground">{label}</p>
      </div>
    </Box>
  )
}

const HEALTH_TEXT: Record<PortalHealth, string> = {
  no_prazo: "text-emerald-600 dark:text-emerald-400",
  atencao: "text-amber-600 dark:text-amber-400",
  critico: "text-red-600 dark:text-red-400",
  concluido: "text-teal-600 dark:text-teal-400",
}

export function KpiHealth({ value, label, override }: { value: PortalHealth; label: string; override?: string }) {
  return (
    <Box>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${HEALTH[value].dot} text-white`}>
        <Activity size={19} />
      </span>
      <div className="min-w-0">
        <p className={`font-semibold ${override ? "text-muted-foreground" : HEALTH_TEXT[value]}`}>{override ?? HEALTH[value].label}</p>
        <p className="truncate text-sm text-muted-foreground">{label}</p>
      </div>
    </Box>
  )
}

export function KpiPerson({ name, role, extra }: { name: string | null | undefined; role: string; extra?: string | null }) {
  // Cargo igual ao papel ("Product Owner · Product Owner") não se repete.
  if (extra && extra.trim().toLowerCase() === role.toLowerCase()) extra = null
  return (
    <Box>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><User size={18} /></span>
      <div className="min-w-0">
        <p className="truncate font-semibold" title={name ?? undefined}>{name ?? "Não informado"}</p>
        <p className="line-clamp-2 text-sm leading-tight text-muted-foreground" title={extra ?? undefined}>{role}{extra ? ` · ${extra}` : ""}</p>
      </div>
    </Box>
  )
}

export function KpiMilestone({ icon: Icon, date, title }: { icon: ElementType; date: string | null; title: string | null }) {
  return (
    <Box className="sm:col-span-2 2xl:col-span-1">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={19} /></span>
      <div className="min-w-0">
        <p className="font-semibold tabular-nums">{date ?? "Sem marco previsto"}</p>
        <p className="text-sm text-muted-foreground">Próximo marco relevante</p>
        {title && <p className="truncate text-xs text-muted-foreground" title={title}>{title}</p>}
      </div>
    </Box>
  )
}

/** Padrão: 4 + 3 cartões (o marco ocupa duas colunas); uma linha só a partir de 1536 px.
 *  Outras telas passam a própria grade em `className`. */
export function KpiRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid gap-3 ${className ?? "sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[1.35fr_0.85fr_0.85fr_1fr_1.1fr_1.1fr_1.15fr]"}`}>
      {children}
    </div>
  )
}

export type TabDef<T extends string> = { value: T; label: string; icon: ElementType }

/** Abas sublinhadas; à direita, busca e expandir/colapsar (só quando a aba usa a árvore). */
export function DetailTabs<T extends string>({
  tabs,
  value,
  onChange,
  search,
  onSearch,
  placeholder,
  onExpandAll,
  onCollapseAll,
}: {
  tabs: TabDef<T>[]
  value: T
  onChange: (v: T) => void
  search?: string
  onSearch?: (v: string) => void
  placeholder?: string
  onExpandAll?: () => void
  onCollapseAll?: () => void
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b print:hidden">
      <div className="-mb-px flex overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              value === t.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      {onSearch && (
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search" value={search ?? ""} onChange={(e) => onSearch(e.target.value)}
              placeholder={placeholder} aria-label={placeholder}
              className="h-10 w-72 max-w-full rounded-md border bg-background pl-9 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {onExpandAll && (
            <Button variant="outline" className="h-10 gap-1.5" onClick={onExpandAll}>
              <ChevronsUpDown size={15} /> Expandir todos
            </Button>
          )}
          {onCollapseAll && (
            <Button variant="outline" className="h-10 gap-1.5" onClick={onCollapseAll}>
              <ChevronsDownUp size={15} /> Colapsar todos
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
