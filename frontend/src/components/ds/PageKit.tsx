import { createElement, type ElementType, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"

import { Card, IconTile } from "@/modules/portal/portfolioUi"
import { fmtDateTime } from "@/modules/portal/portfolioMeta"

// Peças de página no padrão visual do Portal do Cliente para telas que não são de detalhe
// (o detalhe usa DetailHeader/KpiRow/DetailTabs). Ver components/ds/index.ts.

export type PageCrumb = { label: string; to?: string }

/** Cabeçalho de tela: trilha opcional, ícone opcional, título grande, descrição, ações à direita
 *  e "Última atualização" (mesmo layout de Ocorrências e Soluções com IA no Portal). */
export function PageHeader({
  crumbs,
  icon,
  color = "#2563EB",
  title,
  description,
  actions,
  updatedAt,
  children,
}: {
  crumbs?: PageCrumb[]
  /** Ícone do quadrado colorido: componente lucide (ex.: Gauge) ou nome do mapa de ícones do
   *  Portal (texto, ex.: "Package"). Sem ícone, só o título. */
  icon?: string | ElementType
  color?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  updatedAt?: string | null
  /** Linha extra abaixo do título (selos, metadados). */
  children?: ReactNode
}) {
  return (
    <div className="space-y-3">
      {crumbs && crumbs.length > 0 && (
        <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Trilha">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight size={14} />}
              {c.to ? <Link to={c.to} className="hover:text-foreground">{c.label}</Link> : <span className="font-medium text-foreground">{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          {icon && (typeof icon === "string" ? <IconTile icon={icon} color={color} size={56} /> : <ComponentTile icon={icon} color={color} />)}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
            {children && <div className="mt-2">{children}</div>}
          </div>
        </div>
        {(actions || updatedAt !== undefined) && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
            {updatedAt !== undefined && (
              <p className="text-right text-xs leading-snug text-muted-foreground">
                Última atualização
                <br />
                <span className="text-foreground">{fmtDateTime(updatedAt)}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Mesmo quadrado do IconTile do Portal, com o componente do ícone direto (o mapa de nomes do
 *  Portal é a lista oferecida no cadastro de Programas/Pilares e não deve crescer por causa daqui). */
function ComponentTile({ icon, color, size = 56 }: { icon: ElementType; color: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, backgroundColor: `${color}1f`, color }}
      aria-hidden
    >
      {createElement(icon, { size: Math.round(size * 0.5) })}
    </span>
  )
}

/** Cartão com cabeçalho (título, subtítulo, ações) e corpo — como as seções do detalhe da
 *  ocorrência no Portal. `flush` tira o padding do corpo (tabelas e listas de borda a borda). */
export function SectionCard({
  title,
  subtitle,
  icon: Icon,
  right,
  children,
  flush = false,
  className = "",
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ElementType
  right?: ReactNode
  children: ReactNode
  flush?: boolean
  className?: string
}) {
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {Icon && <Icon size={17} className="shrink-0 text-muted-foreground" />}
            {title}
          </h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className={flush ? "" : "p-5"}>{children}</div>
    </Card>
  )
}

export type Tone = "amber" | "red" | "emerald" | "blue" | "violet" | "slate" | "teal"

const NOTICE: Record<Tone, string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  red: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  blue: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
  violet: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200",
  slate: "border-border bg-muted text-muted-foreground",
  teal: "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200",
}

/** Faixa de aviso (mesma do Portal: impedimento, Operação Assistida, pendências). */
export function Notice({ tone = "amber", icon: Icon, children }: { tone?: Tone; icon?: ElementType; children: ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${NOTICE[tone]}`}>
      {Icon && <Icon size={16} className="shrink-0" />}
      {children}
    </div>
  )
}

const PILL: Record<Tone, string> = {
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800",
  red: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800",
  blue: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800",
  violet: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-800",
  slate: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
  teal: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-800",
}
const DOT: Record<Tone, string> = {
  amber: "bg-amber-500", red: "bg-red-500", emerald: "bg-emerald-500", blue: "bg-blue-500",
  violet: "bg-violet-500", slate: "bg-slate-400", teal: "bg-teal-500",
}

/** Selo com contorno (status, ciclo de vida, criticidade), como o selo de status do Portal. */
export function Pill({ tone = "slate", dot = false, className = "", children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PILL[tone]} ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden />}
      {children}
    </span>
  )
}

/** Rótulo + valor das fichas de cadastro (em vez de rótulo em caixa alta miúda). */
export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children}</dd>
    </div>
  )
}
