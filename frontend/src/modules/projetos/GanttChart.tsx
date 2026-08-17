import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import {
  DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { Calendar, ChevronRight, Clock, GripVertical, Plus, Trash2 } from "lucide-react"
import type { ProjectTask, ProjectTaskDependency, ScheduleOverloadRow } from "@/api/projetos"
import type { User } from "@/types"

// ── Constantes de layout (do protótipo prototipo2) ──────────────────────────
const ROW_H = 52
const HEAD_H = 64
const BAR_H = 22
const IND = 14
const STEP = 18
const LABEL_W = 376
const DAY_MS = 24 * 60 * 60 * 1000

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const MONTHS_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
const WD_LETTER = ["D", "S", "T", "Q", "Q", "S", "S"]

const AVATAR_PALETTE = ["#7C3AED", "#008BD2", "#6AB42F", "#E84E0F", "#014898", "#DB2777", "#0F766E", "#64748B"]

// ── Zoom ────────────────────────────────────────────────────────────────────
// Largura de um dia em px. O mínimo cobre cronogramas de vários anos numa tela só;
// o máximo dá espaço para arrastar barras com precisão de horas.
export const MIN_DAY_W = 1.5
export const MAX_DAY_W = 120
export const DEFAULT_DAY_W = 44
export const ZOOM_STEP = 1.35

export function clampDayWidth(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_DAY_W
  return Math.max(MIN_DAY_W, Math.min(MAX_DAY_W, px))
}

/** Nome legível da densidade atual, para rotular o controle de zoom. */
export function zoomLabel(dayWidth: number): string {
  if (dayWidth >= 30) return "Dia"
  if (dayWidth >= 12) return "Semana"
  if (dayWidth >= 4) return "Mês"
  return "Trimestre"
}

type Status = { key: "done" | "risk" | "ontrack"; color: string; soft: string; label: string }
function statusOf(task: ProjectTask): Status {
  if (task.completed_at) return { key: "done", color: "#6AB42F", soft: "#eef7e6", label: "Concluída" }
  if (task.sla_state === "breached" || task.sla_state === "warning")
    return { key: "risk", color: "#E84E0F", soft: "#fdece4", label: "Em risco" }
  return { key: "ontrack", color: "#014898", soft: "#eaf1fa", label: "No prazo" }
}
// Status considerando o progresso consolidado: 100% ⇒ concluída (verde), mesmo sem `completed_at`
// (ex.: feature cujos filhos estão todos 100%, mas que não tem data de conclusão própria).
function statusForProgress(task: ProjectTask, pct: number): Status {
  if (pct >= 100) return { key: "done", color: "#6AB42F", soft: "#eef7e6", label: "Concluída" }
  return statusOf(task)
}

function isoFromDateStr(s: string): string {
  const d = new Date(`${s}T00:00:00`)
  return isNaN(d.getTime()) ? "" : d.toISOString() // tolera datas corrompidas sem derrubar a tela
}
// Soma `days` à parte YYYY-MM-DD do ISO, sem deriva de fuso/horário de verão.
function addDaysToIso(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const ny = dt.getUTCFullYear()
  const nm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const nd = String(dt.getUTCDate()).padStart(2, "0")
  return isoFromDateStr(`${ny}-${nm}-${nd}`)
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS)
}
function dateFromIso(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`)
}
function fmtShortIso(iso: string): string {
  const d = dateFromIso(iso)
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getMonth()]}`
}
// Formata horas estimadas: inteiro vira "8h"; com fração, "8.5h". 0/null → nada.
function fmtHours(h: number | null | undefined): string | null {
  if (h == null) return null
  const n = Number(h)
  if (!Number.isFinite(n) || n <= 0) return null
  return `${n % 1 === 0 ? n : n.toFixed(1)}h`
}
// Data + hora (omite a hora quando 00:00). Usado nos tooltips com precisão de hora.
function fmtDateTimeIso(iso: string): string {
  const base = fmtShortIso(iso)
  const tp = iso.slice(11, 16)
  return tp && tp !== "00:00" ? `${base} ${tp}` : base
}
function ganttInitials(name: string | undefined): string {
  if (!name) return "?"
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return "?"
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}
function colorForUser(id: string | null | undefined): string {
  if (!id) return "#94a3b8"
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

type DragState = { taskId: string; mode: "move" | "start" | "end"; startX: number; deltaDays: number }
type Row = { task: ProjectTask; level: number; hasKids: boolean; isLast: boolean; ancestorLines: boolean[] }
type TipData = { task: ProjectTask; x: number; y: number }

// Texto do tooltip de sobrecarga: quantos dias estouram, o pior dia e o que o ocupa.
function overloadTitle(row: ScheduleOverloadRow): string {
  const h = (v: number) => `${v.toFixed(1).replace(".", ",")}h`
  const d = new Date(row.worst_date + "T00:00:00")
  const worst = `${String(d.getDate()).padStart(2, "0")}/${MONTHS_SHORT[d.getMonth()]}`
  const lines = [
    `⚠ ${row.person_name ?? "Responsável"} superlotado neste período`,
    `${row.over_days} de ${row.total_days} dia(s) úteis acima da capacidade`,
    `Pior dia: ${worst} — ${h(row.worst_allocated_hours)} de ${h(row.worst_capacity_hours)}`,
  ]
  if (row.conflicts.length) {
    lines.push("Ocupam esse dia:")
    for (const c of row.conflicts) lines.push(`• ${c.project_name} · ${c.task_title} — ${h(c.hours)}`)
  }
  return lines.join("\n")
}

// ── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ user, size = 26, overload }: { user: User | null; size?: number; overload?: ScheduleOverloadRow | null }) {
  const dot = Math.max(8, Math.round(size * 0.38))
  const avatar = (
    <span
      className="gx-avatar"
      title={overload ? undefined : (user?.full_name ?? "Sem responsável")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: colorForUser(user?.id ?? null) }}
    >
      {ganttInitials(user?.full_name)}
    </span>
  )
  if (!overload) return avatar
  // Superlotado: bolinha vermelha no canto do avatar + detalhe no hover.
  return (
    <span style={{ position: "relative", display: "inline-flex", flex: "0 0 auto" }} title={overloadTitle(overload)}>
      {avatar}
      <i
        aria-label="Responsável superlotado"
        style={{
          position: "absolute", top: -1, right: -1, width: dot, height: dot, borderRadius: "50%",
          background: "var(--af-destructive, #ef4444)", boxShadow: "0 0 0 1.5px var(--af-bg, #fff)",
        }}
      />
    </span>
  )
}

// Cluster de responsáveis (Feature agregada): até 3 avatares sobrepostos + "+N".
// `overloadByPerson` marca quais dos membros estão superlotados nas US filhas.
function AvatarCluster({ users, size = 26, overloadByPerson }: { users: User[]; size?: number; overloadByPerson?: Map<string, ScheduleOverloadRow> }) {
  const overOf = (id: string) => overloadByPerson?.get(id) ?? null
  if (users.length === 0) return <Avatar user={null} size={size} />
  if (users.length === 1) return <Avatar user={users[0]} size={size} overload={overOf(users[0].id)} />
  const shown = users.slice(0, 3)
  const extra = users.length - shown.length
  const overlap = -Math.round(size * 0.38)
  const over = users.map((u) => overOf(u.id)).filter((r): r is ScheduleOverloadRow => !!r)
  const clusterTitle = over.length
    ? `⚠ ${over.length} responsável(is) superlotado(s) nas US:\n${over.map((r) => `• ${r.person_name ?? "—"} — ${r.over_days} dia(s) acima da capacidade`).join("\n")}\n\nEquipe: ${users.map((u) => u.full_name).join(", ")}`
    : users.map((u) => u.full_name).join(", ")
  return (
    <span className="gx-avatar-cluster" title={clusterTitle} style={{ display: "inline-flex", alignItems: "center" }}>
      {shown.map((u, i) => (
        <span key={u.id} style={{ marginLeft: i === 0 ? 0 : overlap, zIndex: shown.length - i, borderRadius: "50%", boxShadow: "0 0 0 1.5px var(--af-bg, #fff)" }}>
          <Avatar user={u} size={size} overload={overOf(u.id)} />
        </span>
      ))}
      {extra > 0 && (
        <span className="gx-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.36), marginLeft: overlap, background: "var(--af-muted-3)", boxShadow: "0 0 0 1.5px var(--af-bg, #fff)" }}>
          +{extra}
        </span>
      )}
    </span>
  )
}

// ── Linha (left list) — droppable para reorder via @dnd-kit ──────────────────
function GanttRow({
  task, canDrop, selected, registerRow, children,
}: {
  task: ProjectTask
  canDrop: boolean
  selected: boolean
  registerRow: (id: string, el: HTMLDivElement | null) => void
  children: (dragHandle: ReactNode) => ReactNode
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `task-${task.id}` })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop-${task.id}`, disabled: !canDrop })

  const handle = (
    <button
      ref={setDragRef}
      {...attributes}
      {...listeners}
      type="button"
      className="grip"
      title="Arraste para reordenar (mesmo nível)"
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical size={14} />
    </button>
  )

  return (
    <div
      ref={(el) => { setDropRef(el); registerRow(task.id, el) }}
      className={`gx-row${selected ? " sel" : ""}`}
      style={{ height: ROW_H, opacity: isDragging ? 0.5 : 1, boxShadow: isOver && canDrop ? "inset 0 0 0 2px var(--af-primary)" : undefined }}
    >
      {children(handle)}
    </div>
  )
}

export function GanttChart({
  rootId,
  tasks,
  users = [],
  dependencies = [],
  scale = "day",
  dayWidth: dayWidthProp,
  onDayWidthChange,
  fitSignal,
  progressById,
  criticalById,
  calendar,
  absencesByUser,
  overloadByTask,
  onOpenTask,
  onAddChild,
  canAddChild,
  typeBadge,
  onDelete,
  onUpdateDates,
  onReorder,
  baselineById,
  markById,
}: {
  rootId: string
  tasks: ProjectTask[]
  users?: User[]
  dependencies?: ProjectTaskDependency[]
  scale?: "day" | "week"
  // Zoom: largura de um dia em px. Manda no lugar de `scale` quando informado — o
  // cabeçalho (dia/semana/mês) se adapta sozinho à densidade resultante.
  dayWidth?: number
  onDayWidthChange?: (px: number) => void
  // Trocar este número dispara "ajustar à tela" (só o gráfico sabe o span total).
  fitSignal?: number
  progressById?: Map<string, number>
  criticalById?: Map<string, { is_critical: boolean; total_float_hours: number }>
  calendar?: { day_start: string; day_end: string; lunch_start: string | null; lunch_end: string | null } | null
  absencesByUser?: Record<string, { start_date: string; end_date: string; type_name: string; status: string; partial_hours: number | null }[]>
  // task_id → sobrecarga do responsável no período daquela tarefa (marcador no avatar).
  overloadByTask?: Map<string, ScheduleOverloadRow>
  onOpenTask?: (t: ProjectTask) => void
  onAddChild?: (t: ProjectTask) => void
  canAddChild?: (t: ProjectTask) => boolean
  typeBadge?: (t: ProjectTask) => string | null
  onDelete?: (t: ProjectTask) => void
  onUpdateDates?: (t: ProjectTask, patch: { start_date?: string | null; due_date?: string | null }) => void
  onReorder?: (items: Array<{ id: string; order: number }>) => void
  // Linha de base (baseline) para comparação: task_id → datas planejadas do snapshot selecionado.
  baselineById?: Map<string, { start: string | null; due: string | null }>
  // Destaque das tarefas que mudaram vs o baseline em comparação.
  markById?: Map<string, "changed" | "inserted">
}) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [tip, setTip] = useState<TipData | null>(null)
  const movedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const root = tasks.find((t) => t.id === rootId)
  const dayWidth = clampDayWidth(dayWidthProp ?? (scale === "week" ? 20 : 44))
  // Densidade do sub-cabeçalho conforme o zoom: dias legíveis → semanas → só meses.
  const subMode: "day" | "week" | "month" = dayWidth >= 18 ? "day" : dayWidth * 7 >= 26 ? "week" : "month"

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const progressOf = (task: ProjectTask): number => progressById?.get(task.id) ?? (task.completed_at ? 100 : 0)
  const isCritical = (id: string): boolean => criticalById?.get(id)?.is_critical ?? false
  // Ausências do responsável (aprovada/pendente) que sobrepõem o período da etapa.
  function taskAbsences(task: ProjectTask): { start_date: string; end_date: string; type_name: string; status: string; partial_hours: number | null }[] {
    if (!absencesByUser || !task.assigned_to || !task.start_date || !task.due_date) return []
    const a = task.start_date.slice(0, 10), b = task.due_date.slice(0, 10)
    const lo = a <= b ? a : b, hi = a <= b ? b : a
    return (absencesByUser[task.assigned_to] ?? []).filter((x) => x.end_date >= lo && x.start_date <= hi)
  }

  const byParent = useMemo(() => {
    const m = new Map<string, ProjectTask[]>()
    for (const t of tasks) {
      if (!t.parent_task_id) continue
      const list = m.get(t.parent_task_id) ?? []
      list.push(t)
      m.set(t.parent_task_id, list)
    }
    return m
  }, [tasks])

  // Responsáveis distintos de TODOS os descendentes (Feature agregada = conjunto das US).
  const subtreeAssignees = useMemo(() => {
    const collectIds = (id: string): string[] => {
      const out: string[] = []
      for (const k of byParent.get(id) ?? []) {
        if (k.assigned_to) out.push(k.assigned_to)
        out.push(...collectIds(k.id))
      }
      return out
    }
    return (id: string): User[] =>
      Array.from(new Set(collectIds(id)))
        .map((uid) => usersById.get(uid))
        .filter((u): u is User => !!u)
  }, [byParent, usersById])

  // Sobrecarga dos descendentes (Feature agregada), por pessoa — a pior linha de cada um.
  const subtreeOverload = useMemo(() => {
    return (id: string): Map<string, ScheduleOverloadRow> => {
      const out = new Map<string, ScheduleOverloadRow>()
      if (!overloadByTask) return out
      const walk = (pid: string) => {
        for (const k of byParent.get(pid) ?? []) {
          const row = overloadByTask.get(k.id)
          if (row) {
            const cur = out.get(row.person_id)
            if (!cur || row.over_days > cur.over_days) out.set(row.person_id, row)
          }
          walk(k.id)
        }
      }
      walk(id)
      return out
    }
  }, [byParent, overloadByTask])

  const sortSiblings = (list: ProjectTask[]): ProjectTask[] =>
    list.slice().sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      const sa = a.start_date ?? a.due_date ?? ""
      const sb = b.start_date ?? b.due_date ?? ""
      return sa.localeCompare(sb) || a.created_at.localeCompare(b.created_at)
    })

  // Achata a subárvore com metadados de guia de árvore, honrando o colapso.
  const rows = useMemo<Row[]>(() => {
    if (!root) return []
    const out: Row[] = []
    const rootKids = byParent.get(rootId) ?? []
    out.push({ task: root, level: 0, hasKids: rootKids.length > 0, isLast: true, ancestorLines: [] })
    const walk = (list: ProjectTask[], level: number, ancestorLines: boolean[]) => {
      const sorted = sortSiblings(list)
      sorted.forEach((n, i) => {
        const isLast = i === sorted.length - 1
        const kids = byParent.get(n.id) ?? []
        out.push({ task: n, level, hasKids: kids.length > 0, isLast, ancestorLines })
        if (kids.length > 0 && !collapsed.has(n.id)) walk(kids, level + 1, [...ancestorLines, !isLast])
      })
    }
    if (rootKids.length > 0 && !collapsed.has(rootId)) walk(rootKids, 1, [])
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, rootId, byParent, collapsed])

  const rowIndex = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r, i) => m.set(r.task.id, i))
    return m
  }, [rows])

  // Janela de tempo e cabeçalho de meses.
  const { rangeStart, totalDays, months } = useMemo(() => {
    const dates: Date[] = []
    const pushIfValid = (iso: string | null | undefined) => {
      if (!iso) return
      const d = dateFromIso(iso)
      if (!isNaN(d.getTime())) dates.push(d) // ignora datas corrompidas para não invalidar a janela
    }
    for (const r of rows) {
      pushIfValid(r.task.start_date)
      pushIfValid(r.task.due_date)
    }
    // Inclui as datas do baseline em comparação, para barras-fantasma fora da janela atual caberem.
    if (baselineById) {
      for (const b of baselineById.values()) { pushIfValid(b.start); pushIfValid(b.due) }
    }
    if (dates.length === 0) {
      const today = startOfDay(new Date())
      const start = startOfDay(new Date(today.getTime() - 7 * DAY_MS))
      const days = 35
      const ms = [{
        label: `${MONTHS_FULL[start.getMonth()]} ${start.getFullYear()}`,
        short: `${MONTHS_SHORT[start.getMonth()]}/${String(start.getFullYear()).slice(2)}`,
        days,
      }]
      return { rangeStart: start, totalDays: days, months: ms }
    }
    let min = dates[0], max = dates[0]
    for (const d of dates) { if (d < min) min = d; if (d > max) max = d }
    const start = startOfDay(new Date(min.getTime() - 2 * DAY_MS))
    const end = startOfDay(new Date(max.getTime() + 2 * DAY_MS))
    const days = Math.max(1, daysBetween(start, end) + 1)
    const ms: { label: string; short: string; days: number }[] = []
    let cursor = new Date(start)
    while (cursor <= end) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      const segEnd = monthEnd < end ? monthEnd : end
      ms.push({
        label: `${MONTHS_FULL[cursor.getMonth()]} ${cursor.getFullYear()}`,
        short: `${MONTHS_SHORT[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`,
        days: daysBetween(cursor, segEnd) + 1,
      })
      cursor = new Date(monthEnd.getTime() + DAY_MS)
    }
    return { rangeStart: start, totalDays: days, months: ms }
  }, [rows, baselineById])

  const timelineWidth = totalDays * dayWidth
  const bodyH = rows.length * ROW_H

  // Sub-cabeçalho (dias ou semanas).
  const subs = useMemo(() => {
    const out: { left: number; width: number; label: string; wd?: string; we?: boolean; day?: boolean }[] = []
    const end = new Date(rangeStart.getTime() + (totalDays - 1) * DAY_MS)
    if (subMode === "month") {
      // Zoom bem afastado: o mês vira o sub-cabeçalho (o topo já mostra mês/ano).
      const cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
      while (cur <= end) {
        const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
        const from = cur < rangeStart ? rangeStart : cur
        const to = monthEnd > end ? end : monthEnd
        const off = daysBetween(rangeStart, from)
        out.push({
          left: off * dayWidth,
          width: (daysBetween(from, to) + 1) * dayWidth,
          label: `${MONTHS_SHORT[cur.getMonth()]}/${String(cur.getFullYear()).slice(2)}`,
        })
        cur.setMonth(cur.getMonth() + 1)
      }
    } else if (subMode === "week") {
      const cur = new Date(rangeStart)
      while (cur.getDay() !== 1) cur.setDate(cur.getDate() - 1) // volta até segunda
      while (cur <= end) {
        const off = daysBetween(rangeStart, cur)
        out.push({ left: off * dayWidth, width: 7 * dayWidth, label: fmtShortIso(cur.toISOString()) })
        cur.setDate(cur.getDate() + 7)
      }
    } else {
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(rangeStart.getTime() + i * DAY_MS)
        const we = d.getDay() === 0 || d.getDay() === 6
        out.push({ left: i * dayWidth, width: dayWidth, label: String(d.getDate()), wd: WD_LETTER[d.getDay()], we, day: true })
      }
    }
    return out
  }, [subMode, rangeStart, totalDays, dayWidth])

  // Faixas de fim de semana: só fazem sentido (e valem o custo) com o dia visível.
  const bands = useMemo(() => {
    const out: { left: number; width: number }[] = []
    if (dayWidth < 5) return out
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(rangeStart.getTime() + i * DAY_MS)
      if (d.getDay() === 0 || d.getDay() === 6) out.push({ left: i * dayWidth, width: dayWidth })
    }
    return out
  }, [totalDays, rangeStart, dayWidth])

  // Uma linha vertical por coluna do sub-cabeçalho — acompanha o zoom sem poluir.
  const glines = useMemo(() => {
    const out = subs.map((s) => s.left)
    out.push(totalDays * dayWidth)
    return out
  }, [subs, totalDays, dayWidth])

  const today = startOfDay(new Date())
  const todayX = daysBetween(rangeStart, today) * dayWidth

  // Geometria das barras (px na faixa de tempo).
  // Posição fracionária dentro do dia, conforme a janela de trabalho (expediente/almoço): a fração
  // do dia "consumida" até um horário. Permite barras sub-diárias (precisão de hora).
  const dayFrac = useMemo(() => {
    const toMin = (s: string | null | undefined, fb: number) => {
      if (!s) return fb
      const [h, m] = s.slice(0, 5).split(":").map(Number)
      return (h || 0) * 60 + (m || 0)
    }
    const ds = toMin(calendar?.day_start, 480), de = toMin(calendar?.day_end, 1020)
    const ls = toMin(calendar?.lunch_start ?? null, 720), le = toMin(calendar?.lunch_end ?? null, 780)
    const segs: Array<[number, number]> = ds < ls && ls < le && le < de ? [[ds, ls], [le, de]] : [[ds, de]]
    const perDay = segs.reduce((a, [s, e]) => a + (e - s), 0) || 1
    return (iso: string): number => {
      const tp = iso.slice(11, 16)
      if (!tp) return 0
      const [h, m] = tp.split(":").map(Number)
      const t = (h || 0) * 60 + (m || 0)
      let acc = 0
      for (const [s, e] of segs) {
        if (t <= s) break
        acc += Math.min(t, e) - s
        if (t < e) break
      }
      return Math.max(0, Math.min(1, acc / perDay))
    }
  }, [calendar])

  const geomById = useMemo(() => {
    const m = new Map<string, { left: number; width: number; hasDates: boolean }>()
    for (const r of rows) {
      const t = r.task
      const sIso = t.start_date ?? t.due_date
      const eIso = t.due_date ?? t.start_date
      if (sIso && eIso) {
        const s = dateFromIso(sIso), e = dateFromIso(eIso)
        const left = (daysBetween(rangeStart, s) + dayFrac(sIso)) * dayWidth
        const right = (daysBetween(rangeStart, e) + dayFrac(eIso)) * dayWidth
        const width = Math.max(right - left, 6)
        m.set(t.id, { left, width, hasDates: true })
      } else {
        m.set(t.id, { left: 0, width: 0, hasDates: false })
      }
    }
    return m
  }, [rows, rangeStart, dayWidth, dayFrac])

  // Geometria das barras-fantasma do baseline (mesma fórmula da barra atual), por task_id.
  // Inclui o delta (due atual − due baseline, em dias) para mostrar o desvio.
  const baselineGeomById = useMemo(() => {
    const m = new Map<string, { left: number; width: number; sIso: string; eIso: string; deltaDays: number | null }>()
    if (!baselineById) return m
    for (const r of rows) {
      const b = baselineById.get(r.task.id)
      if (!b) continue
      const sIso = b.start ?? b.due
      const eIso = b.due ?? b.start
      if (!sIso || !eIso) continue
      const s = dateFromIso(sIso), e = dateFromIso(eIso)
      if (isNaN(s.getTime()) || isNaN(e.getTime())) continue
      const left = (daysBetween(rangeStart, s) + dayFrac(sIso)) * dayWidth
      const right = (daysBetween(rangeStart, e) + dayFrac(eIso)) * dayWidth
      const width = Math.max(right - left, 6)
      const curDue = r.task.due_date ?? r.task.start_date
      const deltaDays = (curDue && b.due) ? daysBetween(startOfDay(dateFromIso(b.due)), startOfDay(dateFromIso(curDue))) : null
      m.set(r.task.id, { left, width, sIso, eIso, deltaDays })
    }
    return m
  }, [rows, baselineById, rangeStart, dayWidth, dayFrac])

  // Auto-scroll até "hoje" ao montar / trocar de projeto. O zoom NÃO reposiciona aqui:
  // ele preserva o ponto sob o cursor (ver onWheel) ou o começo (ajustar à tela).
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, todayX - dayWidth * 4)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootId])

  // "Ajustar à tela": só o gráfico conhece o span total, então o botão vira um sinal.
  const fitRef = useRef(fitSignal)
  useEffect(() => {
    if (fitSignal === fitRef.current) return
    fitRef.current = fitSignal
    const el = scrollRef.current
    if (!el || !onDayWidthChange || totalDays <= 0) return
    onDayWidthChange(clampDayWidth((el.clientWidth - LABEL_W - 24) / totalDays))
    el.scrollLeft = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal, totalDays])

  // Ctrl/⌘ + roda = zoom ancorado no ponto sob o cursor (a data sob o mouse não sai do lugar).
  // Listener nativo com passive:false — o onWheel do React é passivo e não deixaria
  // cancelar o zoom do navegador.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onDayWidthChange) return
    const onWheel = (e: globalThis.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const next = clampDayWidth(dayWidth * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP))
      if (next === dayWidth) return
      const cursorInView = e.clientX - el.getBoundingClientRect().left
      const dayAtCursor = (el.scrollLeft + cursorInView - LABEL_W) / dayWidth
      onDayWidthChange(next)
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, dayAtCursor * next + LABEL_W - cursorInView)
      })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [dayWidth, onDayWidthChange])

  function toggleCollapse(id: string) {
    setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── Drag/resize das barras ────────────────────────────────────────────────
  function startDrag(e: ReactPointerEvent, task: ProjectTask, mode: DragState["mode"]) {
    if (!onUpdateDates || !task.start_date || !task.due_date) return
    e.preventDefault(); e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    movedRef.current = false
    setDrag({ taskId: task.id, mode, startX: e.clientX, deltaDays: 0 })
  }
  function moveDrag(e: ReactPointerEvent, taskId: string) {
    setDrag((d) => {
      if (!d || d.taskId !== taskId) return d
      const dd = Math.round((e.clientX - d.startX) / dayWidth)
      if (dd !== 0) movedRef.current = true
      return dd === d.deltaDays ? d : { ...d, deltaDays: dd }
    })
  }
  function endDrag(e: ReactPointerEvent, task: ProjectTask) {
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
    if (!drag || drag.taskId !== task.id) { setDrag(null); return }
    const dd = drag.deltaDays, mode = drag.mode
    setDrag(null)
    if (dd === 0 || !onUpdateDates || !task.start_date || !task.due_date) return
    if (mode === "move") {
      onUpdateDates(task, { start_date: addDaysToIso(task.start_date, dd), due_date: addDaysToIso(task.due_date, dd) })
    } else if (mode === "start") {
      // Ao puxar o início: só envia start_date — o backend recalcula o vencimento
      // com base nas horas estimadas (dias úteis). Sem horas, mantém o due atual
      // (com clamp para não passar do fim).
      let ns = addDaysToIso(task.start_date, dd)
      const hours = Number(task.estimated_hours)
      if (!Number.isFinite(hours) || hours <= 0) {
        if (ns.slice(0, 10) > task.due_date.slice(0, 10)) ns = isoFromDateStr(task.due_date.slice(0, 10))
      }
      onUpdateDates(task, { start_date: ns })
    } else {
      let nd = addDaysToIso(task.due_date, dd)
      if (nd.slice(0, 10) < task.start_date.slice(0, 10)) nd = isoFromDateStr(task.start_date.slice(0, 10))
      onUpdateDates(task, { due_date: nd })
    }
  }

  // Setas de dependência precisam re-medir junto às mudanças; usamos registerRow só p/ @dnd-kit.
  const rowEls = useRef<Map<string, HTMLDivElement>>(new Map())
  const registerRow = (id: string, el: HTMLDivElement | null) => {
    if (el) rowEls.current.set(id, el); else rowEls.current.delete(id)
  }

  function handleDragEnd(ev: DragEndEvent) {
    if (!onReorder) return
    const activeId = String(ev.active.id).replace("task-", "")
    const overId = ev.over ? String(ev.over.id).replace("drop-", "") : null
    if (!overId || activeId === overId) return
    const moved = tasks.find((t) => t.id === activeId)
    const target = tasks.find((t) => t.id === overId)
    if (!moved || !target || moved.parent_task_id !== target.parent_task_id) return
    const ids = sortSiblings(byParent.get(moved.parent_task_id ?? "") ?? []).map((s) => s.id).filter((id) => id !== activeId)
    const overIdx = ids.indexOf(overId)
    if (overIdx < 0) return
    ids.splice(overIdx, 0, activeId)
    onReorder(ids.map((id, i) => ({ id, order: i })))
  }

  function showTip(e: ReactPointerEvent, task: ProjectTask) {
    setTip({ task, x: Math.min(e.clientX + 16, window.innerWidth - 244), y: Math.max(e.clientY - 150, 12) })
  }

  if (!root) return <p className="text-sm text-muted-foreground">Selecione um item para ver o cronograma.</p>

  const visibleIds = new Set(rows.map((r) => r.task.id))
  const depLinks = dependencies.filter((d) => visibleIds.has(d.predecessor_id) && visibleIds.has(d.successor_id))

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="gx-gantt">
        <div className="gx-scroll" ref={scrollRef}>
          <div className="gx-inner" style={{ width: LABEL_W + timelineWidth, height: HEAD_H + bodyH }}>
            {/* Cabeçalho */}
            <div className="gx-hrow" style={{ height: HEAD_H }}>
              <div className="gx-corner" style={{ width: LABEL_W, height: HEAD_H }}><span className="lbl">Item / Etapa</span></div>
              <div className="gx-thead" style={{ width: timelineWidth, height: HEAD_H }}>
                <div className="months">
                  {/* Rótulo do mês encolhe (e some) conforme o zoom, para não transbordar a coluna. */}
                  {months.map((m, i) => {
                    const w = m.days * dayWidth
                    return <div key={i} className="mo" style={{ width: w }}>{w < 30 ? "" : w < 96 ? m.short : m.label}</div>
                  })}
                </div>
                <div className="subs">
                  {subMode === "day"
                    ? subs.map((s, i) => (
                      <div key={i} className={`day${s.we ? " we" : ""}`} style={{ left: s.left, width: s.width }}>
                        <span>{s.label}</span><span className="wd">{s.wd}</span>
                      </div>
                    ))
                    : subs.map((s, i) => <div key={i} className="wk" style={{ left: s.left, width: s.width }}>{s.label}</div>)}
                </div>
              </div>
            </div>

            {/* Linhas (lista à esquerda; faixa de tempo é espaçador — as barras ficam no overlay) */}
            {rows.map((r) => {
              const node = r.task
              const g = geomById.get(node.id) ?? { hasDates: false }
              const assignee = usersById.get(node.assigned_to ?? "") ?? null
              // Feature/grupo (parent que não é projeto/programa): responsável = agregado das US.
              const aggregated = r.hasKids && node.planning_kind !== "projeto" && node.planning_kind !== "programa"
              const clusterUsers = aggregated ? subtreeAssignees(node.id) : null
              const st = statusForProgress(node, progressOf(node))
              const pl = IND + r.level * STEP + (r.level > 0 ? 18 : 4)
              const badge = typeBadge?.(node)
              const absences = taskAbsences(node)
              return (
                <GanttRow key={node.id} task={node} canDrop={!!onReorder} selected={false} registerRow={registerRow}>
                  {(dragHandle) => (
                    <>
                      <div className={`gx-lcell${r.hasKids ? " " : ""}`} style={{ width: LABEL_W, height: ROW_H }}>
                        <div className={`gx-lrow${r.hasKids ? " epic" : ""}`} style={{ height: ROW_H }}>
                          <span className="sla" style={{ background: st.color }} />
                          <div className="guides">
                            {r.ancestorLines.map((show, d) => show ? <i key={d} className="g-v" style={{ left: IND + d * STEP + 6 }} /> : null)}
                            {r.level > 0 && <i className="g-elbow" style={{ left: IND + (r.level - 1) * STEP + 6, height: ROW_H / 2 }} />}
                          </div>
                          {onReorder && r.level > 0 ? dragHandle : null}
                          <div style={{ display: "flex", alignItems: "center", paddingLeft: pl, width: "100%", minWidth: 0 }}>
                            <button
                              className={`chev${r.hasKids ? "" : " leaf"}${!collapsed.has(node.id) ? " open" : ""}`}
                              onClick={() => toggleCollapse(node.id)}
                              title={collapsed.has(node.id) ? "Expandir" : "Recolher"}
                            >
                              <ChevronRight size={14} />
                            </button>
                            {aggregated
                              ? <AvatarCluster users={clusterUsers ?? []} size={26} overloadByPerson={subtreeOverload(node.id)} />
                              : <Avatar user={assignee} size={26} overload={overloadByTask?.get(node.id) ?? null} />}
                            <div className="lmain">
                              <div className="tline">
                                <button className="title" title={node.title} onClick={() => onOpenTask?.(node)}>{node.title}</button>
                                {badge && <span className="gx-badge" style={{ background: "var(--af-muted-2)", color: "var(--af-muted-fg)" }} title="Tipo de card">{badge}</span>}
                                {absences.length > 0 && (
                                  <span
                                    className="gx-badge"
                                    style={{ background: "#fdece4", color: absences.some((a) => a.status === "aprovada") ? "var(--af-destructive)" : "var(--af-warning)" }}
                                    title={`Responsável com ausência no período:\n${absences.map((a) => `${a.type_name} (${a.status}): ${a.start_date} → ${a.end_date}${a.partial_hours != null ? " (parcial)" : ""}`).join("\n")}`}
                                  >
                                    ⚠
                                  </span>
                                )}
                              </div>
                              <div className="dates">
                                <Calendar size={12} style={{ color: "var(--af-muted-3)" }} />
                                {g.hasDates ? (
                                  <>
                                    <button className="chip" onClick={() => onOpenTask?.(node)}>{node.start_date ? fmtShortIso(node.start_date) : "—"}</button>
                                    <span className="ar">→</span>
                                    <button className="chip" onClick={() => onOpenTask?.(node)}>{node.due_date ? fmtShortIso(node.due_date) : "—"}</button>
                                  </>
                                ) : <span className="nodate">sem datas</span>}
                                {fmtHours(node.estimated_hours) && (
                                  <span className="chip" title="Horas estimadas" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                                    <Clock size={11} style={{ color: "var(--af-muted-3)" }} />
                                    {fmtHours(node.estimated_hours)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="acts">
                            {onAddChild && (!canAddChild || canAddChild(node)) && (
                              <button className="act add" title="Adicionar sub-etapa" onClick={() => onAddChild(node)}><Plus size={15} /></button>
                            )}
                            {onDelete && r.level > 0 && !r.hasKids && (
                              <button className="act del" title="Excluir" onClick={() => onDelete(node)}><Trash2 size={14} /></button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="gx-tcell" style={{ width: timelineWidth, height: ROW_H }} />
                    </>
                  )}
                </GanttRow>
              )
            })}

            {/* Overlay: grade + setas + barras + hoje */}
            <div className="gx-overlay" style={{ left: LABEL_W, top: HEAD_H, width: timelineWidth, height: bodyH }}>
              <div className="gx-gridbg">
                {bands.map((b, i) => <div key={"b" + i} className="we" style={{ left: b.left, width: b.width }} />)}
                {glines.map((x, i) => <div key={"g" + i} className="gl" style={{ left: x }} />)}
                {rows.map((_, i) => <div key={"r" + i} className="rl" style={{ top: (i + 1) * ROW_H }} />)}
              </div>

              {depLinks.length > 0 && (
                <svg className="gx-arrows" width={timelineWidth} height={bodyH}>
                  {depLinks.map((dep) => {
                    const pIdx = rowIndex.get(dep.predecessor_id); const sIdx = rowIndex.get(dep.successor_id)
                    const pg = geomById.get(dep.predecessor_id); const sg = geomById.get(dep.successor_id)
                    if (pIdx === undefined || sIdx === undefined || !pg || !sg || !pg.hasDates || !sg.hasDates) return null
                    const x2 = pg.left + pg.width, yp = pIdx * ROW_H + ROW_H / 2
                    const x1 = sg.left, ys = sIdx * ROW_H + ROW_H / 2
                    const d = x1 > x2 + 14
                      ? `M${x2} ${yp} H${x2 + 9} V${ys} H${x1 - 3}`
                      : `M${x2} ${yp} H${x2 + 9} V${(yp + ys) / 2} H${x1 - 12} V${ys} H${x1 - 3}`
                    return (
                      <g key={dep.id}>
                        <path d={d} fill="none" stroke="#aab2bf" strokeWidth={1.5} />
                        <path d={`M${x1 - 3} ${ys} l-5 -3.2 v6.4 z`} fill="#8b95a3" />
                      </g>
                    )
                  })}
                </svg>
              )}

              {/* Barras-fantasma do baseline (planejado), sob as barras atuais — comparação. */}
              {baselineById && rows.map((r) => {
                const bg = baselineGeomById.get(r.task.id)
                if (!bg) return null
                const idx = rowIndex.get(r.task.id) ?? 0
                const dl = bg.deltaDays
                const deltaTxt = dl === null ? "" : dl > 0 ? ` · +${dl}d` : dl < 0 ? ` · ${dl}d` : " · no prazo"
                return (
                  <div
                    key={"bl" + r.task.id}
                    className="gx-bar-baseline"
                    style={{ left: bg.left + 1, top: idx * ROW_H + (ROW_H + BAR_H) / 2 + 2, width: Math.max(bg.width - 2, 6), height: 9 }}
                    title={`Baseline: ${fmtShortIso(bg.sIso)} → ${fmtShortIso(bg.eIso)}${deltaTxt}`}
                  />
                )
              })}

              {rows.map((r) => {
                const node = r.task
                const g = geomById.get(node.id)
                if (!g || !g.hasDates) return null
                const idx = rowIndex.get(node.id) ?? 0
                const pct = progressOf(node)
                const st = statusForProgress(node, pct)
                const crit = isCritical(node.id)
                const CRIT = "#E11D48"
                const mark = markById?.get(node.id)
                const markCls = mark === "inserted" ? " gx-bar--inserted" : mark === "changed" ? " gx-bar--changed" : ""
                if (r.hasKids) {
                  return (
                    <div key={node.id} className={`gx-ebar${crit ? " crit" : ""}${markCls}`} style={{ left: g.left, top: idx * ROW_H, width: g.width, height: ROW_H }}
                      onClick={() => onOpenTask?.(node)} onPointerMove={(e) => showTip(e, node)} onPointerLeave={() => setTip(null)}>
                      <div className="track" />
                      <div className="efill" style={{ width: pct + "%", background: crit ? CRIT : st.color }} />
                      <div className="cap l" style={crit ? { background: CRIT } : undefined} /><div className="cap r" style={crit ? { background: CRIT } : undefined} />
                    </div>
                  )
                }
                const draggable = !!onUpdateDates && !!node.start_date && !!node.due_date
                let bl = g.left, bw = g.width
                if (drag && drag.taskId === node.id) {
                  const dd = drag.deltaDays * dayWidth
                  if (drag.mode === "move") bl = g.left + dd
                  else if (drag.mode === "start") { bl = g.left + dd; bw = Math.max(dayWidth, g.width - dd) }
                  else bw = Math.max(dayWidth, g.width + dd)
                }
                const top = idx * ROW_H + (ROW_H - BAR_H) / 2
                return (
                  <div key={node.id}>
                    <div
                      className={`gx-bar${drag?.taskId === node.id ? " dragging" : ""}${markCls}`}
                      style={{ left: bl + 1, top, width: Math.max(bw - 2, 10), height: BAR_H, background: st.soft, boxShadow: crit ? `inset 0 0 0 1.5px ${st.color}33, 0 0 0 2px ${CRIT}` : `inset 0 0 0 1.5px ${st.color}33` }}
                      onPointerDown={draggable ? (e) => startDrag(e, node, "move") : undefined}
                      onPointerMove={draggable ? (e) => { moveDrag(e, node.id); showTip(e, node) } : (e) => showTip(e, node)}
                      onPointerUp={draggable ? (e) => endDrag(e, node) : undefined}
                      onPointerLeave={() => setTip(null)}
                      onClick={() => { if (!movedRef.current) onOpenTask?.(node) }}
                    >
                      <div className="fill" style={{ width: pct + "%", background: st.color }} />
                      {/* Com zoom afastado a barra não comporta o rótulo — o % segue no tooltip. */}
                      {bw >= 34 && <span className="blabel" style={{ color: pct > 55 ? "#fff" : st.color }}>{pct}%</span>}
                      {draggable && <>
                        <div className="hnd l" onPointerDown={(e) => startDrag(e, node, "start")} />
                        <div className="hnd r" onPointerDown={(e) => startDrag(e, node, "end")} />
                      </>}
                    </div>
                    <div className="gx-barside" style={{ left: bl + bw + 9, top, height: BAR_H }}>
                      <Avatar user={usersById.get(node.assigned_to ?? "") ?? null} size={20} overload={overloadByTask?.get(node.id) ?? null} />
                    </div>
                  </div>
                )
              })}

              {todayX >= 0 && todayX <= timelineWidth && (
                <div className="gx-today" style={{ left: todayX }}><span className="flag">HOJE</span></div>
              )}
            </div>
          </div>
        </div>
      </div>

      {tip && (() => {
        const pct = progressOf(tip.task)
        const st = statusForProgress(tip.task, pct)
        const u = usersById.get(tip.task.assigned_to ?? "") ?? null
        const tipAggregated = (byParent.get(tip.task.id)?.length ?? 0) > 0 && tip.task.planning_kind !== "projeto" && tip.task.planning_kind !== "programa"
        const tipAssignees = tipAggregated ? subtreeAssignees(tip.task.id) : []
        const cp = criticalById?.get(tip.task.id)
        return (
          <div className="gx-tip" style={{ left: tip.x, top: tip.y }}>
            <div className="th">
              <span className="slatag" style={{ background: st.color + "26", color: st.color }}>
                <span className="gx-sla-dot" style={{ background: st.color }} />{st.label}
              </span>
              {cp?.is_critical && (
                <span className="slatag" style={{ background: "#E11D4826", color: "#E11D48" }}>⚡ Crítico</span>
              )}
            </div>
            <div className="th" style={{ marginBottom: 6 }}><span className="t">{tip.task.title}</span></div>
            <div className="trow"><span>Período</span><b>{tip.task.start_date ? fmtDateTimeIso(tip.task.start_date) : "—"} → {tip.task.due_date ? fmtDateTimeIso(tip.task.due_date) : "—"}</b></div>
            <div className="trow"><span>{tipAggregated ? "Responsáveis (US)" : "Responsável"}</span><b>{tipAggregated ? (tipAssignees.length ? tipAssignees.map((x) => x.full_name).join(", ") : "—") : (u?.full_name ?? "—")}</b></div>
            {(() => {
              const ov = overloadByTask?.get(tip.task.id)
              if (!ov) return null
              return (
                <div className="trow">
                  <span>Carga</span>
                  <b style={{ color: "var(--af-destructive, #ef4444)" }}>
                    ⚠ {ov.over_days} de {ov.total_days} dia(s) acima da capacidade
                  </b>
                </div>
              )
            })()}
            {cp && !cp.is_critical && <div className="trow"><span>Folga</span><b>{cp.total_float_hours}h</b></div>}
            <div className="trow"><span>Concluído</span><b>{pct}%</b></div>
            <div className="pbar"><i style={{ width: pct + "%", background: st.color }} /></div>
          </div>
        )
      })()}
    </DndContext>
  )
}
