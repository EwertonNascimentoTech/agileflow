import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Filter, Gauge, Layers, PackageCheck,
  TrendingUp, Users, X, Zap,
} from "lucide-react"
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts"
import type { TooltipProps } from "recharts"

import {
  projetosApi,
  type CapacityHeatmapResponse,
  type DevAbsenceInfo,
  type DevLoadStatus,
  type DevUsBreakdown,
  type DevPerformanceRow,
  type FreePeopleResponse,
  type PoPerformanceRow,
  type ProjectDefaultFormField,
  type TeamPerfTeamOption,
  type TeamPerformance,
} from "@/api/projetos"
import { EmptyState } from "@/components/EmptyState"
import { KpiCard } from "@/components/KpiCard"
import { SectionCard } from "@/components/SectionCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CapacityDayDetailDialog } from "@/modules/projetos/CapacityDayDetailDialog"
import { parseDefaultFieldOptions } from "@/modules/projetos/defaultFormOptions"
import { WorkloadView } from "@/modules/projetos/WorkloadView"

const ALL = "__all__"

// Paleta de status (tokens institucionais do index.css, em hex para as séries do recharts).
const STATUS_COLOR: Record<DevLoadStatus, string> = {
  livre: "#6AB42F",
  equilibrado: "#008BD2",
  sobrecarregado: "#E84E0F",
  sem_dados: "#94A3B8",
}
const STATUS_LABEL: Record<DevLoadStatus, string> = {
  livre: "Livre",
  equilibrado: "Equilibrado",
  sobrecarregado: "Sobrecarregado",
  sem_dados: "Sem dados",
}

type WindowPreset = "30d" | "60d" | "90d" | "month" | "quarter"
const WINDOW_OPTS: { value: WindowPreset; label: string }[] = [
  { value: "30d", label: "Últimos 30 dias" },
  { value: "60d", label: "Últimos 60 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "month", label: "Mês atual" },
  { value: "quarter", label: "Trimestre atual" },
]

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function windowRange(preset: WindowPreset): { from: string; to: string } {
  const today = new Date()
  const to = iso(today)
  if (preset === "month") {
    return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to }
  }
  if (preset === "quarter") {
    const q = Math.floor(today.getMonth() / 3)
    return { from: iso(new Date(today.getFullYear(), q * 3, 1)), to }
  }
  const days = preset === "30d" ? 30 : preset === "60d" ? 60 : 90
  const start = new Date(today)
  start.setDate(start.getDate() - days)
  return { from: iso(start), to }
}

/** Janela da grade de carga: mantém o passado do período e projeta o futuro (planejamento). */
function capacityWindow(preset: WindowPreset): { from: string; to: string } {
  const hist = windowRange(preset)
  const today = new Date()
  const forwardDays = preset === "30d" ? 30 : preset === "60d" ? 60 : preset === "90d" ? 90 : 56
  const end = new Date(today)
  end.setDate(end.getDate() + forwardDays)
  return { from: hist.from, to: iso(end) }
}

function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—"
  return Number.isInteger(n) ? String(n) : n.toFixed(digits)
}
function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${n.toFixed(0)}%`
}
function monthLabel(m: string): string {
  const [y, mo] = m.split("-")
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  return `${names[Number(mo) - 1] ?? mo}/${y.slice(2)}`
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function fmtDateRange(start: string, end: string): string {
  return `${fmtDate(start)} → ${fmtDate(end)}`
}

const ABSENCE_STATUS_LABEL: Record<string, string> = {
  aprovada: "Aprovada",
  pendente: "Pendente",
}

const BOTTLENECK_LABEL: Record<DevAbsenceInfo["bottleneck"], string> = {
  none: "Sem conflito com o planejado",
  provavel: "Risco de gargalo — US planejadas no período (ausência pendente ou sem datas)",
  confirmado: "Gargalo provável — US com prazo no período e ausência aprovada",
}

function DevAbsenceList({ absences }: { absences: DevAbsenceInfo[] }) {
  if (absences.length === 0) return null
  return (
    <div className="mt-1 space-y-1">
      {absences.map((a, idx) => {
        const statusLabel = ABSENCE_STATUS_LABEL[a.status] ?? a.status
        const hasRisk = a.bottleneck !== "none"
        const partial = a.partial_hours != null ? ` · ${a.partial_hours}h/dia` : ""
        const summary = `${a.type_name} · ${fmtDateRange(a.start_date, a.end_date)}`
        return (
          <div key={`${a.start_date}-${idx}`} className="group/abs relative max-w-[220px]">
            <span
              className={`block cursor-help text-xs leading-snug ${hasRisk ? "text-destructive" : "text-warning"}`}
            >
              {hasRisk ? "⚠ " : ""}
              Ausência: {summary}
            </span>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-[60] mt-1 hidden w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-md border bg-popover px-2.5 py-2 text-left text-[11px] font-normal leading-snug text-popover-foreground shadow-md group-hover/abs:block"
            >
              <span className="block font-semibold">{a.type_name}</span>
              <span className="mt-1 block text-muted-foreground">
                Período: {fmtDateRange(a.start_date, a.end_date)}
                {partial}
              </span>
              <span className="mt-1 block text-muted-foreground">Status: {statusLabel}</span>
              {a.conflicting_tasks > 0 ? (
                <span className="mt-1 block text-muted-foreground">
                  {a.conflicting_tasks} US planejada(s) no período
                  {a.conflicting_hours != null ? ` (~${a.conflicting_hours}h)` : ""}
                </span>
              ) : null}
              {a.undated_wip > 0 ? (
                <span className="mt-1 block text-muted-foreground">
                  {a.undated_wip} US em aberto sem datas definidas
                </span>
              ) : null}
              <span className={`mt-1 block font-medium ${hasRisk ? "text-destructive" : "text-muted-foreground"}`}>
                {BOTTLENECK_LABEL[a.bottleneck]}
              </span>
              {a.conflict_titles.length > 0 ? (
                <ul className="mt-1.5 list-inside list-disc text-muted-foreground">
                  {a.conflict_titles.map((t) => (
                    <li key={t} className="truncate max-w-[18rem]" title={t}>{t}</li>
                  ))}
                </ul>
              ) : null}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function UsBreakdownTooltip({
  count,
  breakdown,
  heading,
  className,
  showStatusAndDue = false,
}: {
  count: number
  breakdown?: DevUsBreakdown
  heading: string
  className?: string
  showStatusAndDue?: boolean
}) {
  const projects = breakdown?.projects ?? []
  const hasDetail = count > 0 && projects.length > 0
  if (!hasDetail) {
    return <span className={className}>{count}</span>
  }
  const totalItems = projects.reduce(
    (n, p) => n + p.features.reduce((m, f) => m + f.items.length, 0),
    0,
  )
  return (
    <span className={`group/ustip relative inline-block ${className ?? ""}`}>
      <span className="cursor-help border-b border-dotted border-muted-foreground/40">{count}</span>
      {/* Wrapper com pt (não mt): o vão entre o número e o card faz parte da área de hover,
          e pointer-events ativo permite rolar o conteúdo do tooltip. */}
      <span
        role="tooltip"
        className="pointer-events-auto absolute left-1/2 top-full z-[60] hidden -translate-x-1/2 pt-1.5 group-hover/ustip:block"
      >
        <span className="block max-h-64 w-max min-w-[14rem] max-w-[min(22rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-md border bg-popover px-2.5 py-2 text-left text-[11px] font-normal leading-snug text-popover-foreground shadow-md">
          <span className="block font-semibold">{heading} ({totalItems})</span>
          <div className="mt-1.5 space-y-2">
            {projects.map((proj) => (
              <div key={proj.project_title}>
                <span className="block font-medium text-foreground">{proj.project_title}</span>
                {proj.features.map((feat) => (
                  <div key={`${proj.project_title}-${feat.feature_title}`} className="mt-1 pl-2">
                    <span className="block text-muted-foreground">{feat.feature_title}</span>
                    <ul className="mt-0.5 list-inside list-disc text-foreground/90">
                      {feat.items.map((item) => (
                        <li key={item.task_id} className="max-w-[20rem]" title={item.title}>
                          <span className="align-middle">{item.title}</span>
                          {showStatusAndDue && (
                            <span className="ml-1 inline-flex items-center gap-1 align-middle whitespace-nowrap">
                              {item.status_name && (
                                <span
                                  className="rounded px-1 py-px text-[10px] font-medium"
                                  style={{
                                    background: `${item.status_color ?? "#6B7280"}22`,
                                    color: item.status_color ?? "#6B7280",
                                  }}
                                >
                                  {item.status_name}
                                </span>
                              )}
                              <span className="text-muted-foreground">
                                {item.due_date ? `prazo ${fmtDate(item.due_date)}` : "sem prazo"}
                              </span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </span>
      </span>
    </span>
  )
}

function StatusBadge({ status }: { status: DevLoadStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${STATUS_COLOR[status]}22`, color: STATUS_COLOR[status] }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {STATUS_LABEL[status]}
    </span>
  )
}

const LOAD_STATUS_ORDER: DevLoadStatus[] = ["livre", "equilibrado", "sobrecarregado", "sem_dados"]

/** Legenda das cores = status de carga (não a quantidade de entregas). */
function LoadStatusLegend({ present }: { present?: Set<DevLoadStatus> }) {
  const items = present
    ? LOAD_STATUS_ORDER.filter((s) => present.has(s))
    : LOAD_STATUS_ORDER
  if (items.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/80">Cor = carga atual:</span>
      {items.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLOR[s] }} />
          {STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  )
}

type LoadHoursInfo = {
  status: DevLoadStatus
  utilization_pct?: number | null
  allocated_hours_total?: number | null
  capacity_hours_total?: number | null
  free_hours_total?: number | null
}

/** Linhas de horas que sustentam Livre / Equilibrado / Sobrecarregado. */
function LoadHoursLines({ info }: { info: LoadHoursInfo }) {
  const { status, utilization_pct, allocated_hours_total, capacity_hours_total, free_hours_total } = info
  if (status === "sem_dados" || utilization_pct == null) {
    return <span className="text-muted-foreground">Sem dados de capacidade na janela</span>
  }
  const alloc = allocated_hours_total != null ? fmt(allocated_hours_total, 0) : "—"
  const cap = capacity_hours_total != null ? fmt(capacity_hours_total, 0) : "—"
  const free = free_hours_total != null ? fmt(free_hours_total, 0) : "—"
  return (
    <>
      Carga: <span style={{ color: STATUS_COLOR[status] }}>{STATUS_LABEL[status]}</span>
      {" "}({utilization_pct.toFixed(0)}%)
      <br />
      Alocadas {alloc}h · Capacidade {cap}h
      <br />
      {status === "sobrecarregado"
        ? `Excesso ~${fmt(Math.max(0, (allocated_hours_total ?? 0) - (capacity_hours_total ?? 0)), 0)}h`
        : `Folga ${free}h`}
    </>
  )
}

// Barra de utilização inline (verde→amarelo→vermelho por faixa).
function UtilBar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>
  const clamped = Math.min(value, 130)
  const color = value > 100 ? "#E84E0F" : value >= 60 ? "#008BD2" : "#6AB42F"
  return (
    <div className="flex items-center gap-2" title={`${value.toFixed(0)}% da capacidade`}>
      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${(clamped / 130) * 100}%`, background: color }} />
      </div>
      <span className="tabular-nums text-xs" style={{ color }}>{value.toFixed(0)}%</span>
    </div>
  )
}

function ChartCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">{children}</div>
  )
}

const DEV_COL_TIPS = {
  dev: "Pessoa responsável pelas User Stories no recorte filtrado. Exibe cargo e próxima ausência planejada, quando houver.",
  entregues: "User Stories concluídas no período. Conta pela data de conclusão dentro da janela de datas selecionada.",
  onTime: "Percentual de entregas no prazo. US sem data de prazo contam como no prazo. Mede conclusão ≤ prazo entre as entregas da janela.",
  atrasadas: "User Stories em aberto com prazo vencido ou SLA estourado. É um snapshot atual, independente da janela de datas.",
  wip: "Work in Progress: quantidade de User Stories em aberto atribuídas ao dev neste momento.",
  aging: "Tempo médio (dias) que as US em aberto permanecem na etapa atual do funil. Calculado desde a entrada na etapa até agora.",
  cycle: "Cycle time médio das entregas da janela: dias entre a saída do backlog e a conclusão. Só entra quando a US passou pelo backlog.",
  lead: "Lead time médio das entregas da janela: dias entre o início (data de início ou criação) e a conclusão.",
  carga: "Utilização na janela: horas alocadas ÷ capacidade disponível (já descontando ausências e folgas).",
  status: "Classificação da carga: Livre (<60%), Equilibrado (60–100%), Sobrecarregado (>100%) ou Sem dados quando não há capacidade calculada.",
} as const

function ColumnHeaderTip({
  label,
  tip,
  align = "left",
}: {
  label: string
  tip: string
  align?: "left" | "center"
}) {
  return (
    <span className={`group/cht relative ${align === "center" ? "flex w-full justify-center" : "inline-flex"}`}>
      <span className="cursor-help border-b border-dotted border-muted-foreground/50" aria-label={tip}>
        {label}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-[60] mt-1.5 hidden w-max max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border bg-popover px-2.5 py-2 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-popover-foreground shadow-md group-hover/cht:block"
      >
        <span className="block font-semibold text-foreground">{label}</span>
        <span className="mt-1 block text-muted-foreground">{tip}</span>
      </span>
    </span>
  )
}

/** Multi-seleção de times: nome do time em destaque + contexto (sem truncar). */
function TeamFilterMultiSelect({
  options,
  selected,
  onChange,
  emptyLabel = "Todos os times",
}: {
  options: TeamPerfTeamOption[]
  selected: string[]
  onChange: (next: string[]) => void
  emptyLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const byId = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])

  const triggerLabel = useMemo(() => {
    if (selected.length === 0) return emptyLabel
    if (selected.length === 1) {
      const o = byId.get(selected[0])
      return o?.short_label ?? o?.label ?? "1 time"
    }
    return `${selected.length} times`
  }, [selected, byId, emptyLabel])

  function toggle(value: string) {
    if (selectedSet.has(value)) onChange(selected.filter((v) => v !== value))
    else onChange([...selected, value])
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={selected.length === 1 ? byId.get(selected[0])?.label : undefined}
      >
        <span className="truncate text-left">{triggerLabel}</span>
        <span className="ml-2 shrink-0 text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 max-h-72 w-max min-w-full max-w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
          <button
            type="button"
            className="mb-1 w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
            onClick={() => onChange([])}
          >
            Limpar seleção (todos)
          </button>
          {options.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">Nenhum time com pessoas.</p>
          ) : (
            options.map((o) => {
              const checked = selectedSet.has(o.value)
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-start gap-2 rounded px-2 py-2 hover:bg-accent"
                  title={o.label}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                    checked={checked}
                    onChange={() => toggle(o.value)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug text-foreground">
                      {o.short_label}
                    </span>
                    {o.context ? (
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                        {o.context}
                      </span>
                    ) : null}
                  </span>
                </label>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

/** Multi-seleção com checkboxes. Vazio = todos. */
function FilterMultiSelect({
  options,
  selected,
  onChange,
  emptyLabel,
  clearLabel = "Limpar seleção (todos)",
  noneMessage = "Nenhuma opção disponível.",
}: {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
  emptyLabel: string
  clearLabel?: string
  noneMessage?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const triggerLabel = useMemo(() => {
    if (selected.length === 0) return emptyLabel
    if (selected.length === 1) {
      return options.find((o) => o.value === selected[0])?.label ?? "1 selecionado"
    }
    return `${selected.length} selecionados`
  }, [selected, options, emptyLabel])

  function toggle(value: string) {
    if (selectedSet.has(value)) onChange(selected.filter((v) => v !== value))
    else onChange([...selected, value])
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-left">{triggerLabel}</span>
        <span className="ml-2 shrink-0 text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full min-w-[240px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          <button
            type="button"
            className="mb-1 w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
            onClick={() => onChange([])}
          >
            {clearLabel}
          </button>
          {options.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">{noneMessage}</p>
          ) : (
            options.map((o) => {
              const checked = selectedSet.has(o.value)
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={checked}
                    onChange={() => toggle(o.value)}
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default function TeamPerformancePage() {
  const [preset, setPreset] = useState<WindowPreset>("90d")
  const [diretoria, setDiretoria] = useState(ALL)
  const [area, setArea] = useState(ALL)
  const [positions, setPositions] = useState<string[]>([])
  const [teams, setTeams] = useState<string[]>([])

  const [data, setData] = useState<TeamPerformance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [defaultFields, setDefaultFields] = useState<ProjectDefaultFormField[]>([])

  // Dados da aba Carga (buscados sob demanda pelos endpoints de capacidade já existentes).
  const [heatmap, setHeatmap] = useState<CapacityHeatmapResponse | null>(null)
  const [free, setFree] = useState<FreePeopleResponse | null>(null)
  const [capLoading, setCapLoading] = useState(false)
  // Célula do heatmap aberta no modal de detalhamento do dia.
  const [dayDetail, setDayDetail] = useState<{ personId: string; date: string } | null>(null)

  const range = useMemo(() => windowRange(preset), [preset])
  const capRange = useMemo(() => capacityWindow(preset), [preset])
  const positionsKey = positions.slice().sort().join(",")
  const teamsKey = teams.slice().sort().join(",")

  useEffect(() => {
    projetosApi.getDefaultFormFields()
      .then(setDefaultFields)
      .catch(() => setDefaultFields([]))
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    projetosApi
      .getTeamPerformance({
        from: range.from,
        to: range.to,
        diretoria: diretoria === ALL ? null : diretoria,
        area: area === ALL ? null : area,
        positions: positions.length ? positions : null,
        teams: teams.length ? teams : null,
      })
      .then((r) => {
        if (!alive) return
        setData(r)
        // Cascata: área inválida na diretoria → limpa.
        if (area !== ALL && !r.meta.available_areas.includes(area)) {
          setArea(ALL)
        }
        // Remove cargos que não existem mais na lista com pessoas.
        const posValues = new Set((r.meta.available_positions ?? []).map((p) => p.value))
        const stillValidPos = positions.filter((p) => posValues.has(p))
        if (stillValidPos.length !== positions.length) {
          setPositions(stillValidPos)
        }
        const teamValues = new Set((r.meta.available_teams ?? []).map((t) => t.value))
        const stillValidTeams = teams.filter((t) => teamValues.has(t))
        if (stillValidTeams.length !== teams.length) {
          setTeams(stillValidTeams)
        }
      })
      .catch((err: unknown) => {
        if (!alive) return
        setData(null)
        const status = (err as { response?: { status?: number } })?.response?.status
        const code = (err as { code?: string })?.code
        if (status === 403) {
          setError("Sem permissão para ver o painel de desempenho. Peça a um admin para liberar `projetos.performance.view` no seu cargo.")
        } else if (code === "ECONNABORTED" || status === 504) {
          setError("O painel demorou demais para responder. Tente um período menor ou recarregue a página.")
        } else {
          setError("Não foi possível carregar o painel de desempenho. Tente novamente em instantes.")
        }
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [range.from, range.to, diretoria, area, positionsKey, teamsKey])

  // Carga: API sem filtro de cargo/time (multi no cliente via data.devs).
  useEffect(() => {
    let alive = true
    setCapLoading(true)
    Promise.all([
      projetosApi.getCapacityHeatmap({
        from: capRange.from,
        to: capRange.to,
        unit: "week",
      }),
      projetosApi.getAvailablePeople({
        from: capRange.from,
        to: capRange.to,
      }),
    ])
      .then(([h, f]) => {
        if (!alive) return
        setHeatmap(h)
        setFree(f)
      })
      .catch(() => {
        if (!alive) return
        setHeatmap(null)
        setFree(null)
      })
      .finally(() => alive && setCapLoading(false))
    return () => {
      alive = false
    }
  }, [capRange.from, capRange.to])

  const labelMaps = useMemo(() => {
    const build = (key: string) => {
      const field = defaultFields.find((f) => f.field_key === key)
      const map = new Map<string, string>()
      if (field) parseDefaultFieldOptions(field).forEach((o) => map.set(o.value, o.label))
      return map
    }
    return { diretoria: build("diretoria"), area: build("area") }
  }, [defaultFields])

  const availableDiretorias = data?.meta.available_diretorias ?? []
  const availableAreas = data?.meta.available_areas ?? []
  const availablePositions = data?.meta.available_positions ?? []
  const availableTeams = data?.meta.available_teams ?? []
  const hasFilters = diretoria !== ALL || area !== ALL || positions.length > 0 || teams.length > 0

  // Filtros ativos: restringe carga às pessoas do recorte de desempenho.
  const scopedPersonIds = useMemo(() => {
    if (!data || (diretoria === ALL && area === ALL && positions.length === 0 && teams.length === 0)) {
      return null
    }
    return new Set(data.devs.map((d) => d.person_id))
  }, [data, diretoria, area, positionsKey, teamsKey])

  const scopedHeatmap = useMemo(() => {
    if (!heatmap || !scopedPersonIds) return heatmap
    return {
      ...heatmap,
      cells: heatmap.cells.filter((c) => scopedPersonIds.has(c.user_id)),
      persons: heatmap.persons.filter((p) => scopedPersonIds.has(p.id)),
    }
  }, [heatmap, scopedPersonIds])

  const scopedFree = useMemo(() => {
    if (!free || !scopedPersonIds) return free
    return { ...free, rows: free.rows.filter((r) => scopedPersonIds.has(r.person_id)) }
  }, [free, scopedPersonIds])

  const nameForUser = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of scopedHeatmap?.persons ?? heatmap?.persons ?? []) m.set(p.id, p.full_name)
    return (id: string) => m.get(id) ?? `Sem pessoa (${id.slice(0, 8)})`
  }, [scopedHeatmap, heatmap])

  function clearFilters() {
    setDiretoria(ALL)
    setArea(ALL)
    setPositions([])
    setTeams([])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Desempenho do time</h3>
          <p className="text-sm text-muted-foreground">
            Fluxo de entregas, atrasos e carga por dev e por PO. Janela temporal (não por sprint).
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Período</label>
          <Select value={preset} onValueChange={(v) => setPreset(v as WindowPreset)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WINDOW_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex h-9 items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" /> Filtros
        </div>
        <div className="min-w-[160px] flex-1 sm:max-w-[200px]">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Diretoria</label>
          <Select
            value={diretoria}
            onValueChange={(v) => {
              setDiretoria(v)
              setArea(ALL)
            }}
          >
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as diretorias</SelectItem>
              {availableDiretorias.map((v) => (
                <SelectItem key={v} value={v}>{labelMaps.diretoria.get(v) ?? v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px] flex-1 sm:max-w-[200px]">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Área (card)</label>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as áreas</SelectItem>
              {availableAreas.map((v) => (
                <SelectItem key={v} value={v}>{labelMaps.area.get(v) ?? v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px] flex-1 sm:max-w-[280px]">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Time</label>
          <TeamFilterMultiSelect
            options={availableTeams}
            selected={teams}
            onChange={setTeams}
          />
        </div>
        <div className="min-w-[180px] flex-1 sm:max-w-[240px]">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cargo</label>
          <FilterMultiSelect
            options={availablePositions}
            selected={positions}
            onChange={setPositions}
            emptyLabel="Todos os cargos"
            noneMessage="Nenhum cargo com pessoas."
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!loading && error && <EmptyState icon={AlertTriangle} title="Não foi possível carregar" description={error} />}

      {!loading && !error && data && (
        <>
          {/* ── KPIs de topo ── */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Entregas (throughput)" value={data.kpis.throughput_total} icon={PackageCheck} />
            <KpiCard
              label="On-time delivery" value={pct(data.kpis.on_time_delivery_pct)} icon={CheckCircle2}
              deltaTone={data.kpis.on_time_delivery_pct != null && data.kpis.on_time_delivery_pct >= 80 ? "up" : "down"}
              delta={data.kpis.on_time_delivery_pct != null ? `${data.kpis.on_time_delivery_pct.toFixed(0)}%` : undefined}
            />
            <KpiCard label="Lead time médio" value={`${fmt(data.kpis.avg_lead_time_days)}d`} icon={Clock}
              sub={`Cycle: ${fmt(data.kpis.avg_cycle_time_days)}d`} />
            <KpiCard label="WIP em aberto" value={data.kpis.wip_total} icon={Layers}
              sub={`Aging médio ${fmt(data.kpis.avg_aging_days)}d`} />
            <KpiCard label="Atrasadas" value={data.kpis.overdue_total} icon={AlertTriangle}
              deltaTone={data.kpis.overdue_total > 0 ? "down" : "up"} />
            <KpiCard label="Say/Do" value={data.kpis.say_do_ratio != null ? `${(data.kpis.say_do_ratio * 100).toFixed(0)}%` : "—"} icon={Zap}
              sub={`${data.kpis.devs_livres} livre(s) · ${data.kpis.devs_sobrecarregados} sobrec.`} />
          </div>

          {/* ── Tendências (time todo) ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title={<span className="flex items-center gap-2"><TrendingUp size={16} /> Throughput por mês</span>}>
              {data.series.throughput_by_month.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sem entregas concluídas na janela.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.series.throughput_by_month.map((p) => ({ ...p, label: monthLabel(p.month) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                    <Tooltip content={({ active, payload, label }: TooltipProps<number, string>) =>
                      active && payload?.length ? <ChartCard><b>{label}</b>: {payload[0]?.value} entrega(s)</ChartCard> : null} />
                    <Bar dataKey="count" fill="#014898" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            <SectionCard title={<span className="flex items-center gap-2"><Clock size={16} /> Lead time médio por mês</span>}>
              {data.series.lead_time_trend.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sem dados de lead time na janela.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.series.lead_time_trend.map((p) => ({ ...p, label: monthLabel(p.month) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={32} unit="d" />
                    <Tooltip content={({ active, payload, label }: TooltipProps<number, string>) =>
                      active && payload?.length ? <ChartCard><b>{label}</b>: {fmt(payload[0]?.value as number)}d médios</ChartCard> : null} />
                    <Line type="monotone" dataKey="avg_days" stroke="#008BD2" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>

          {/* ── Abas ── */}
          <Tabs defaultValue="devs">
            <TabsList>
              <TabsTrigger value="devs" className="gap-1.5"><Users className="h-4 w-4" /> Devs</TabsTrigger>
              <TabsTrigger value="pos" className="gap-1.5"><Gauge className="h-4 w-4" /> POs</TabsTrigger>
              <TabsTrigger value="carga" className="gap-1.5"><Activity className="h-4 w-4" /> Carga & Capacidade</TabsTrigger>
            </TabsList>

            <TabsContent value="devs" className="mt-4 space-y-4">
              <DevsTab devs={data.devs} scatter={data.series.load_vs_delivery} />
            </TabsContent>

            <TabsContent value="pos" className="mt-4">
              <PosTab pos={data.pos} />
            </TabsContent>

            <TabsContent value="carga" className="mt-4 space-y-4">
              <SectionCard title="Carga × Capacidade (pessoa × semana)">
                {capLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : scopedHeatmap && scopedHeatmap.cells.length > 0 ? (
                  <WorkloadView
                    cells={scopedHeatmap.cells}
                    nameForUser={nameForUser}
                    dateFrom={capRange.from}
                    dateTo={capRange.to}
                    onCellClick={(personId, date) => setDayDetail({ personId, date })}
                  />
                ) : (
                  <EmptyState icon={Activity} title="Sem dados de carga" description="Nenhuma alocação com horas estimadas na janela." />
                )}
              </SectionCard>
              <div className="grid gap-4 lg:grid-cols-2">
                <FreePeoplePanel free={scopedFree} loading={capLoading} />
                <WipSwimlanes rows={data.swimlanes} />
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      <CapacityDayDetailDialog
        personId={dayDetail?.personId ?? null}
        date={dayDetail?.date ?? null}
        personName={dayDetail ? nameForUser(dayDetail.personId) : undefined}
        onClose={() => setDayDetail(null)}
      />
    </div>
  )
}

// ── Aba Devs ───────────────────────────────────────────────────────────────
function DevsTab({ devs, scatter }: { devs: DevPerformanceRow[]; scatter: TeamPerformance["series"]["load_vs_delivery"] }) {
  if (devs.length === 0) {
    return <EmptyState icon={Users} title="Sem devs no recorte" description="Nenhuma User Story atribuída no filtro escolhido." />
  }
  const topThroughput = [...devs].filter((d) => d.delivered > 0).sort((a, b) => b.delivered - a.delivered).slice(0, 12)
  const barStatuses = new Set(topThroughput.map((d) => d.status))
  const scatterStatuses = new Set(scatter.map((p) => p.status))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Entregas por dev">
          <p className="mb-2 text-xs text-muted-foreground">
            Comprimento da barra = <strong className="font-medium text-foreground">qtd. de User Stories concluídas</strong> na janela
            (top 12). A cor indica a <strong className="font-medium text-foreground">carga atual</strong> do dev, não o volume entregue.
          </p>
          {topThroughput.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem entregas na janela.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(200, topThroughput.length * 26)}>
                <BarChart
                  layout="vertical"
                  data={topThroughput.map((d) => ({
                    name: d.full_name,
                    delivered: d.delivered,
                    status: d.status,
                    utilization_pct: d.utilization_pct,
                    allocated_hours_total: d.allocated_hours_total,
                    capacity_hours_total: d.capacity_hours_total,
                    free_hours_total: d.free_hours_total,
                  }))}
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip content={({ active, payload }: TooltipProps<number, string>) => {
                    if (!active || !payload?.length) return null
                    const r = payload[0]?.payload as {
                      name: string
                      delivered: number
                    } & LoadHoursInfo
                    return (
                      <ChartCard>
                        <b>{r.name}</b><br />
                        {r.delivered} US concluída(s)<br />
                        <LoadHoursLines info={r} />
                      </ChartCard>
                    )
                  }} />
                  <Bar dataKey="delivered" name="US concluídas" radius={[0, 4, 4, 0]}>
                    {topThroughput.map((d) => <Cell key={d.person_id} fill={STATUS_COLOR[d.status]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <LoadStatusLegend present={barStatuses} />
            </>
          )}
        </SectionCard>

        <SectionCard title="Carga × Entregas">
          <p className="mb-2 text-xs text-muted-foreground">
            Eixo X = % de utilização (horas alocadas ÷ capacidade) · Eixo Y = US concluídas. Cor = status de carga.
          </p>
          {scatter.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem dados de carga para plotar.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ left: 4, right: 16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" dataKey="utilization_pct" name="Utilização" unit="%" tick={{ fontSize: 11 }}
                    domain={[0, (max: number) => Math.max(120, Math.ceil(max))]} />
                  <YAxis type="number" dataKey="delivered" name="Entregas" allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <ZAxis range={[60, 60]} />
                  <Tooltip content={({ active, payload }: TooltipProps<number, string>) => {
                    if (!active || !payload?.length) return null
                    const r = payload[0]?.payload as {
                      full_name: string
                      delivered: number
                    } & LoadHoursInfo
                    return (
                      <ChartCard>
                        <b>{r.full_name}</b><br />
                        {r.delivered} US concluída(s)<br />
                        <LoadHoursLines info={r} />
                      </ChartCard>
                    )
                  }} />
                  <Scatter data={scatter} name="Devs">
                    {scatter.map((p) => <Cell key={p.person_id} fill={STATUS_COLOR[p.status]} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <LoadStatusLegend present={scatterStatuses} />
            </>
          )}
        </SectionCard>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium"><ColumnHeaderTip label="Dev" tip={DEV_COL_TIPS.dev} /></th>
              <th className="px-3 py-2 font-medium text-center"><ColumnHeaderTip label="Entregues" tip={DEV_COL_TIPS.entregues} align="center" /></th>
              <th className="px-3 py-2 font-medium text-center"><ColumnHeaderTip label="On-time" tip={DEV_COL_TIPS.onTime} align="center" /></th>
              <th className="px-3 py-2 font-medium text-center"><ColumnHeaderTip label="Atrasadas" tip={DEV_COL_TIPS.atrasadas} align="center" /></th>
              <th className="px-3 py-2 font-medium text-center"><ColumnHeaderTip label="WIP" tip={DEV_COL_TIPS.wip} align="center" /></th>
              <th className="px-3 py-2 font-medium text-center"><ColumnHeaderTip label="Aging" tip={DEV_COL_TIPS.aging} align="center" /></th>
              <th className="px-3 py-2 font-medium text-center"><ColumnHeaderTip label="Cycle" tip={DEV_COL_TIPS.cycle} align="center" /></th>
              <th className="px-3 py-2 font-medium text-center"><ColumnHeaderTip label="Lead" tip={DEV_COL_TIPS.lead} align="center" /></th>
              <th className="px-3 py-2 font-medium"><ColumnHeaderTip label="Carga" tip={DEV_COL_TIPS.carga} /></th>
              <th className="px-3 py-2 font-medium"><ColumnHeaderTip label="Status" tip={DEV_COL_TIPS.status} /></th>
            </tr>
          </thead>
          <tbody>
            {devs.map((d) => (
              <tr key={d.person_id} className="border-b last:border-b-0">
                <td className="px-3 py-2">
                  <div className="flex flex-col">
                    <span className="font-medium">{d.full_name}{!d.is_mapped && <span className="ml-1 text-xs text-muted-foreground">(não mapeado)</span>}</span>
                    {d.position_label && <span className="text-xs text-muted-foreground">{d.position_label}</span>}
                    <DevAbsenceList absences={d.absences ?? []} />
                  </div>
                </td>
                <td className="px-3 py-2 text-center tabular-nums font-medium">
                  <UsBreakdownTooltip
                    count={d.delivered}
                    breakdown={d.delivered_breakdown}
                    heading="Entregues na janela"
                    className="font-medium"
                  />
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{d.on_time_pct == null ? "—" : `${d.on_time_pct.toFixed(0)}%`}</td>
                <td className="px-3 py-2 text-center tabular-nums">
                  <UsBreakdownTooltip
                    count={d.overdue}
                    breakdown={d.overdue_breakdown}
                    heading="Atrasadas (snapshot)"
                    className={d.overdue > 0 ? "font-medium text-destructive" : "text-muted-foreground"}
                    showStatusAndDue
                  />
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{d.wip}</td>
                <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{fmt(d.avg_aging_days)}d</td>
                <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{fmt(d.avg_cycle_time_days)}d</td>
                <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{fmt(d.avg_lead_time_days)}d</td>
                <td className="px-3 py-2"><UtilBar value={d.utilization_pct} /></td>
                <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Aba POs ────────────────────────────────────────────────────────────────
function RagPills({ rag }: { rag: PoPerformanceRow["rag"] }) {
  const cells: { n: number; color: string; label: string }[] = [
    { n: rag.verde, color: "#6AB42F", label: "Saudável" },
    { n: rag.amarelo, color: "#E8A00F", label: "Atenção" },
    { n: rag.vermelho, color: "#E84E0F", label: "Crítico" },
  ]
  return (
    <div className="flex gap-1">
      {cells.map((c) => (
        <span key={c.label} title={`${c.label}: ${c.n}`}
          className="inline-flex min-w-6 items-center justify-center rounded px-1.5 py-0.5 text-xs font-medium tabular-nums"
          style={{ background: `${c.color}22`, color: c.color }}>
          {c.n}
        </span>
      ))}
    </div>
  )
}

function PosTab({ pos }: { pos: PoPerformanceRow[] }) {
  if (pos.length === 0) {
    return <EmptyState icon={Gauge} title="Sem POs no recorte" description="Nenhum PO com projetos/programas no filtro escolhido." />
  }
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">PO</th>
            <th className="px-3 py-2 font-medium text-center">Projetos</th>
            <th className="px-3 py-2 font-medium text-center">On-time</th>
            <th className="px-3 py-2 font-medium text-center">Progresso</th>
            <th className="px-3 py-2 font-medium text-center">Execução</th>
            <th className="px-3 py-2 font-medium text-center">Em risco</th>
            <th className="px-3 py-2 font-medium text-center">Atrasados</th>
            <th className="px-3 py-2 font-medium">Saúde (RAG)</th>
          </tr>
        </thead>
        <tbody>
          {pos.map((p) => (
            <tr key={p.po_id} className="border-b last:border-b-0">
              <td className="px-3 py-2 font-medium">{p.full_name}</td>
              <td className="px-3 py-2 text-center tabular-nums">{p.projetos}</td>
              <td className="px-3 py-2 text-center tabular-nums">{pct(p.on_time_pct)}</td>
              <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{pct(p.avg_progress_pct)}</td>
              <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{pct(p.avg_exec_pct)}</td>
              <td className={`px-3 py-2 text-center tabular-nums ${p.em_risco > 0 ? "font-medium text-destructive" : "text-muted-foreground"}`}>{p.em_risco}</td>
              <td className={`px-3 py-2 text-center tabular-nums ${p.atrasados > 0 ? "font-medium text-warning" : "text-muted-foreground"}`}>{p.atrasados}</td>
              <td className="px-3 py-2"><RagPills rag={p.rag} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Painel "Quem está livre / superlotado" ──────────────────────────────────
function FreePeoplePanel({ free, loading }: { free: FreePeopleResponse | null; loading: boolean }) {
  if (loading) return <SectionCard title="Disponibilidade"><Skeleton className="h-40 w-full" /></SectionCard>
  const rows = free?.rows ?? []
  const livres = rows.filter((r) => r.utilization_pct < 60 && r.free_hours_total > 0)
  const sobre = rows.filter((r) => r.utilization_pct > 100)
  return (
    <SectionCard title="Disponibilidade do time">
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sem pessoas ativas na janela.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-success">
              <CheckCircle2 size={12} /> Com folga ({livres.length})
            </p>
            <ul className="space-y-1">
              {livres.slice(0, 8).map((r) => (
                <li key={r.person_id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{r.full_name}{r.position_label && <span className="text-xs text-muted-foreground"> · {r.position_label}</span>}</span>
                  <Badge variant="secondary" className="shrink-0 font-normal">{r.free_hours_total.toFixed(0)}h livres</Badge>
                </li>
              ))}
              {livres.length === 0 && <li className="text-sm text-muted-foreground">Ninguém com folga relevante.</li>}
            </ul>
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
              <AlertTriangle size={12} /> Superlotados ({sobre.length})
            </p>
            <ul className="space-y-1">
              {sobre.slice(0, 8).map((r) => (
                <li key={r.person_id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{r.full_name}{r.position_label && <span className="text-xs text-muted-foreground"> · {r.position_label}</span>}</span>
                  <Badge variant="destructive" className="shrink-0 font-normal">{r.utilization_pct.toFixed(0)}%</Badge>
                </li>
              ))}
              {sobre.length === 0 && <li className="text-sm text-muted-foreground">Ninguém acima da capacidade.</li>}
            </ul>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ── Raias de WIP/aging por etapa ────────────────────────────────────────────
function WipSwimlanes({ rows }: { rows: TeamPerformance["swimlanes"] }) {
  if (rows.length === 0) {
    return <SectionCard title="WIP por etapa"><p className="py-6 text-center text-sm text-muted-foreground">Sem US em aberto.</p></SectionCard>
  }
  const maxCount = Math.max(1, ...rows.map((r) => r.count))
  return (
    <SectionCard title="WIP por etapa (aging & atrasos)">
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={`${r.funnel_name}-${r.status_name}`} className="flex items-center gap-3">
            <div className="w-40 shrink-0 truncate text-sm" title={`${r.funnel_name} · ${r.status_name}`}>
              <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: r.status_color }} />
              {r.status_name}
            </div>
            <div className="flex-1">
              <div className="h-5 overflow-hidden rounded bg-muted">
                <div className="flex h-full items-center justify-end rounded pr-2 text-[10px] font-medium text-white"
                  style={{ width: `${Math.max(8, (r.count / maxCount) * 100)}%`, background: r.status_color }}>
                  {r.count}
                </div>
              </div>
            </div>
            <div className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {fmt(r.avg_aging_days)}d médio
              {r.overdue > 0 && <span className="ml-1 text-destructive">· {r.overdue} atr.</span>}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
