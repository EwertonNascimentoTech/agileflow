import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { AlertTriangle, ArrowUpRight, BarChart3, Bot, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Eye, GitBranch, KanbanSquare, List as ListIcon, Loader2, Plus, Search, X } from "lucide-react"
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"

import { teamopsApi, type Person } from "@/api/teamops"
import { projetosApi, type CardClassification, type Project, type ProjectCardField, type ProjectDefaultFormField, type ProjectDemandFormField, type ProjectDemandFormSection, type ProjectDemandType, type ProjectFunnel, type ProjectStatus, type ProjectStatusSectionLink, type ProjectTask, type PriorityQuadrant, type QuadrantCode } from "@/api/projetos"
import {
  formatCardCustomFieldValue,
  formatDiretoriaAreaLabel,
  groupFilterValuesByLabel,
  groupedFilterChecked,
  toggleGroupedFilterSelection,
} from "@/modules/projetos/cardFieldDisplay"
import { parseDefaultFieldOptions } from "@/modules/projetos/defaultFormOptions"
import { defaultSelectOptions } from "@/modules/projetos/defaultFormUtils"
import { normalizeFieldType, parseFieldOptions } from "@/modules/projetos/FormFieldRenderer"
import {
  productOwnerPersons,
  filterPlanningRootsByPo,
  planningRootTasks,
  buildEffectivePoByTaskId,
  buildPoByOriginTaskId,
  buildPoMatchByFormDimensions,
  taskMatches,
  usePersistedTaskFilters,
  type BoardFilterState,
} from "@/modules/projetos/projectTaskFilters"
import { useAuth } from "@/contexts/AuthContext"
import type { User } from "@/types"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ProjectTaskDrawer } from "@/modules/projetos/ProjectTaskDrawer"
import { BacklogClassificationDialog } from "@/modules/projetos/BacklogClassificationDialog"
import { FormFieldRenderer, applyAutoFillCurrentFields } from "@/modules/projetos/FormFieldRenderer"
import { formatMissingFieldsMessage, resolveFieldMode, resolveSectionMode, validateRequiredFields } from "@/modules/projetos/validation"
import { getRowBreak, groupIntoRows } from "@/modules/projetos/layout"
import { toast } from "@/lib/toast"
import { funnelAccessLevel } from "@/lib/permissions"
import {
  buildTaskProgressById,
  fmtEstimatedHours,
  isFeatureKanbanFunnel,
  isFeatureOrUsKanbanFunnel,
  isUserStoryKanbanFunnel,
  shouldShowUsChecklistProgress,
  usChecklistProgressPct,
} from "@/modules/projetos/kanbanDisplay"
import { UsCardProgressBar } from "@/modules/projetos/UsChecklistSection"
import { canEditTaskOnBoard, canMoveTaskOnBoard } from "@/modules/projetos/taskMovePermissions"

function personToUser(p: Person): User {
  return { id: p.id, full_name: p.full_name, email: p.email } as unknown as User
}

function initialsOf(name: string | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Sugere o nome do card a ser criado na conversão, removendo um prefixo do tipo
// "Projeto:" / "Programa:" / "Demanda:" do título da demanda de origem.
function stripProjectPrefix(title: string): string {
  return title.replace(/^\s*(projeto|programa|demanda)\s*:\s*/i, "").trim() || title
}

function colorForUser(id: string | null | undefined): string {
  if (!id) return "#94a3b8"
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  const palette = ["#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#6366f1"]
  return palette[Math.abs(hash) % palette.length]
}

const REQUESTER_FIELD_KEY = "requisitante"

function resolveRequesterField(meta: Map<string, ProjectDemandFormField>): ProjectDemandFormField | null {
  const direct = meta.get(REQUESTER_FIELD_KEY)
  if (direct) return direct
  for (const field of meta.values()) {
    if (field.label.trim().toLowerCase() === "requisitante") return field
  }
  return null
}

const CLASSIFICATION_LABELS: Record<NonNullable<ProjectTask["card_classification"]>, string> = {
  desenvolvimento: "Desenvolvimento",
  implantacao: "Implantação",
  melhoria: "Melhoria",
}

const CLASSIFICATION_COLORS: Record<NonNullable<ProjectTask["card_classification"]>, { bg: string; color: string }> = {
  desenvolvimento: { bg: "#2563eb", color: "#fff" },
  implantacao: { bg: "#0891b2", color: "#fff" },
  melhoria: { bg: "#7c3aed", color: "#fff" },
}

function ClassificationChip({ value }: { value: ProjectTask["card_classification"] }) {
  if (!value) return null
  const colors = CLASSIFICATION_COLORS[value]
  return (
    <span
      className="chip"
      style={{ background: colors.bg, color: colors.color }}
      title="Classificação do portfólio de produtos"
    >
      {CLASSIFICATION_LABELS[value]}
    </span>
  )
}

function SlaChip({ state }: { state: ProjectTask["sla_state"] }) {
  if (state === "warning") return <span className="chip warning">SLA: alerta</span>
  if (state === "breached") return <span className="chip destructive">SLA: atrasado</span>
  return null
}

const CARD_FIELD_FULL_WIDTH = new Set(["title", "description", "children_progress"])
const CARD_CUSTOM_PREFIX = "form:"

// ─────────── Task card (layout configurável) ───────────
type CardCtx = {
  fields: ProjectCardField[]
  demandTypeName: (id: string | null) => string | null
  parentName: (id: string | null) => string | null
  quadrantInfo: (taskId: string) => { label: string; color: string } | null
  childrenProgress: (taskId: string) => { done: number; total: number; pct: number } | null
  childrenDates: (taskId: string) => { start: string | null; due: string | null } | null
  users: User[]
  /** assigned_to é person_id; fallback por user_id legado. */
  resolveAssignee: (id: string | null | undefined) => User | null
  formValuesByTask: Record<string, Record<string, unknown>>
  formFieldMeta: Map<string, ProjectDemandFormField>
  defaultFormFields: ProjectDefaultFormField[]
  /** Kanban Feature/US: exibe horas estimadas no lugar de SLA/cronograma. */
  useEstimatedHoursOnCard: boolean
  /** Kanban User Story: exibe barra de progresso do checklist. */
  isUsKanban: boolean
  /** Kanban Feature: barra de progresso agregada das US filhas. */
  isFeatureKanban: boolean
  featureUsProgress: (taskId: string) => { pct: number; total: number } | null
  /** Nome do programa vinculado (planning_kind = 'programa'). */
  programName: (id: string | null) => string | null
  /** Etiqueta Projeto/Programa efetiva do card: próprio (planning_kind) ou herdada do card
   * convertido a partir dele (origin_task_id). Ex.: card "Concluído" da prospecção. */
  planningTag: (task: ProjectTask) => { kind: "projeto" | "programa"; programName: string | null } | null
}

function BoardCard({
  task,
  ctx,
  onOpen,
}: {
  task: ProjectTask
  ctx: CardCtx
  onOpen: (task: ProjectTask) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `task-${task.id}` })
  const style = { transform: CSS.Translate.toString(transform) }
  const assignee = ctx.resolveAssignee(task.assigned_to)
  const isOverdue = task.due_date && !task.completed_at
    ? new Date(task.due_date) < new Date(new Date().toDateString())
    : false

  function renderField(key: string, label: string) {
    switch (key) {
      case "demand_type": {
        const name = ctx.demandTypeName(task.demand_type_id)
        return name ? <span className="chip">{name}</span> : null
      }
      case "priority_quadrant": {
        const q = ctx.quadrantInfo(task.id)
        return q ? (
          <span className="chip" style={{ background: q.color, color: "#fff" }}>{q.label}</span>
        ) : null
      }
      case "card_classification":
        return task.card_classification ? (
          <ClassificationChip value={task.card_classification} />
        ) : null
      case "schedule_sla": {
        if (ctx.useEstimatedHoursOnCard) {
          const text = fmtEstimatedHours(task.estimated_hours)
          return (
            <span className="chip muted" title="Horas estimadas">
              <Clock size={10} />
              {text ?? "—"}
            </span>
          )
        }
        if (task.completed_at) return <span className="chip success"><Check size={10} /> Concluída</span>
        if (task.sla_state === "breached") return <span className="chip destructive">Atrasado</span>
        if (task.sla_state === "warning") return <span className="chip warning">Alerta</span>
        if (isOverdue) return <span className="chip destructive">Atrasado</span>
        return <span className="chip success">Em dia</span>
      }
      case "code":
        return <span className="task-id">{task.id.slice(0, 8).toUpperCase()}</span>
      case "title":
        return <h4 className="title" style={{ width: "100%" }}>{task.title}</h4>
      case "description":
        return task.description ? (
          <p style={{ width: "100%", fontSize: 12, color: "var(--af-muted-foreground, #6b7280)", margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {task.description}
          </p>
        ) : null
      case "parent": {
        const parent = task.parent_task_id ? ctx.parentName(task.parent_task_id) : null
        return parent ? (
          <span className="chip muted"><GitBranch size={10} />
            <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{parent}</span>
          </span>
        ) : null
      }
      case "children_progress": {
        const p = ctx.childrenProgress(task.id)
        return p ? (
          <div style={{ width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b7280" }}>
              <span>{label}</span><span>{p.done}/{p.total} · {p.pct}%</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: "#e5e7eb", overflow: "hidden", marginTop: 2 }}>
              <div style={{ width: `${p.pct}%`, height: "100%", background: "var(--af-primary, #2563eb)" }} />
            </div>
          </div>
        ) : null
      }
      case "diretoria": {
        const text = formatDiretoriaAreaLabel(ctx.defaultFormFields, "diretoria", task.diretoria)
        return text ? <span className="chip muted">{text}</span> : null
      }
      case "area": {
        const text = formatDiretoriaAreaLabel(ctx.defaultFormFields, "area", task.area)
        return text ? <span className="chip muted">{text}</span> : null
      }
      case "due_date":
        return task.due_date ? (
          <span className={`due-pill ${isOverdue ? "overdue" : ""}`}>
            <span className="dot" />
            {new Date(task.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          </span>
        ) : null
      case "assignee":
        return (
          <span
            className="assignee-avatar"
            style={{ background: colorForUser(assignee?.id ?? null), width: 22, height: 22, fontSize: 9 }}
            title={assignee?.full_name ?? "Sem responsável"}
          >
            {assignee ? initialsOf(assignee.full_name) : "?"}
          </span>
        )
      default: {
        if (!key.startsWith(CARD_CUSTOM_PREFIX)) return null
        const fieldKey = key.slice(CARD_CUSTOM_PREFIX.length)
        const raw = ctx.formValuesByTask[task.id]?.[fieldKey]
        const meta = ctx.formFieldMeta.get(fieldKey)
        const text = formatCardCustomFieldValue(
          meta,
          raw,
          (id) => ctx.resolveAssignee(id)?.full_name ?? null,
        )
        return text ? <span className="chip muted">{text}</span> : null
      }
    }
  }

  const rendered = ctx.fields.flatMap((f) => {
    const node = renderField(f.field_key, f.label)
    if (!node) return []
    return [{
      key: f.field_key,
      node,
      fullWidth: CARD_FIELD_FULL_WIDTH.has(f.field_key),
    }]
  })

  // Indicador de Programa/agrupador: sempre visível quando o card tem itens-filhos.
  const childAgg = ctx.childrenProgress(task.id)
  const childDates = ctx.childrenDates(task.id)
  const lastDelivery = childDates?.due
    ? new Date(childDates.due).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : null
  // Etiqueta Projeto/Programa: do próprio card-raiz ou herdada do card convertido
  // a partir desta origem (ex.: card "Concluído" do kanban de prospecção).
  const planningTag = ctx.planningTag(task)

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`task-card ${isDragging ? "dragging" : ""}`}
      onClick={() => onOpen(task)}
      {...attributes}
      {...listeners}
    >
      {planningTag && (
        <div style={{ marginBottom: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
          <span
            className="chip"
            style={
              planningTag.kind === "programa"
                ? { background: "#7c3aed", color: "#fff" }
                : { background: "#0ea5e9", color: "#fff" }
            }
          >
            {planningTag.kind === "programa" ? "Programa" : "Projeto"}
          </span>
          {planningTag.kind === "programa" && planningTag.programName && (
            <span className="chip muted" title="Programa vinculado">{planningTag.programName}</span>
          )}
        </div>
      )}
      {childAgg && !ctx.isFeatureKanban && (
        <div style={{ marginBottom: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
          <span
            className="chip"
            style={{ background: "var(--af-primary, #2563eb)", color: "#fff" }}
            title="Abra o card para ver/gerenciar os itens"
          >
            {childAgg.total} {childAgg.total === 1 ? "item" : "itens"} · {childAgg.pct}%
          </span>
          {lastDelivery && <span className="chip muted">Última entrega: {lastDelivery}</span>}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        {rendered.length > 0
          ? rendered.map((x) => (
            <Fragment key={x.key}>
              {x.fullWidth ? <div style={{ width: "100%" }}>{x.node}</div> : x.node}
            </Fragment>
          ))
          : <h4 className="title" style={{ width: "100%" }}>{task.title}</h4>}
      </div>
      {shouldShowUsChecklistProgress(task, ctx.isUsKanban) && (
        <UsCardProgressBar percent={usChecklistProgressPct(task)} />
      )}
      {ctx.isFeatureKanban && (() => {
        const fp = ctx.featureUsProgress(task.id)
        if (!fp) return null
        const usLabel = `${fp.total} User ${fp.total === 1 ? "Story" : "Stories"}`
        return <UsCardProgressBar percent={fp.pct} label={usLabel} />
      })()}
      {ctx.isFeatureKanban && task.us_impediment_active && (
        <span
          className="chip"
          title="Alguma User Story desta Feature está com impedimento"
          style={{ color: "#b91c1c", borderColor: "#fecaca", background: "#fef2f2" }}
        >
          <AlertTriangle size={10} /> Impedimento
        </span>
      )}
      {ctx.isFeatureKanban && task.us_codereview_active && (
        <span
          className="chip"
          title="Alguma User Story desta Feature está em Code Review"
          style={{ color: "#6d28d9", borderColor: "#ddd6fe", background: "#f5f3ff" }}
        >
          <Eye size={10} /> Code Review
        </span>
      )}
    </article>
  )
}

// ─────────── Column (estilo do protótipo) ───────────
function BoardColumn({
  status,
  tasks,
  ctx,
  hasAgent,
  onOpen,
}: {
  status: ProjectStatus
  tasks: ProjectTask[]
  ctx: CardCtx
  hasAgent?: boolean
  onOpen: (task: ProjectTask) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status.id}` })
  return (
    <section className={`column ${isOver ? "drag-over" : ""}`}>
      <div className="col-bar" style={{ background: status.color }} />
      <header className="column-head">
        <div className="left">
          <h3>{status.name}</h3>
          {hasAgent && (
            <span
              className="inline-flex items-center text-violet-600"
              title="Esta raia é executada por um agente de IA"
            >
              <Bot size={15} />
            </span>
          )}
          <span className="col-count">{tasks.length}</span>
        </div>
      </header>
      <div ref={setNodeRef} className="col-body">
        {tasks.length === 0 ? (
          <div className="col-empty">Nenhuma demanda</div>
        ) : tasks.map((task) => (
          <BoardCard key={task.id} task={task} ctx={ctx} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

// ─────────── View tabs (Quadro / Lista / Gantt / Calendário) ───────────
type BoardView = "board" | "list" | "cal"
function resolveViewFromPath(pathname: string): BoardView {
  if (pathname.endsWith("/lista")) return "list"
  if (pathname.endsWith("/calendario")) return "cal"
  return "board"
}

function ViewTabs({
  active,
  onChange,
  onGantt,
  count,
}: {
  active: BoardView
  onChange: (v: BoardView) => void
  onGantt: () => void
  count: number
}) {
  return (
    <div className="view-tabs">
      <button className={`view-tab ${active === "board" ? "active" : ""}`} onClick={() => onChange("board")}>
        <KanbanSquare size={14} /> Quadro <span className="pill">{count}</span>
      </button>
      <button className={`view-tab ${active === "list" ? "active" : ""}`} onClick={() => onChange("list")}>
        <ListIcon size={14} /> Lista
      </button>
      <button className="view-tab" onClick={onGantt}>
        <BarChart3 size={14} /> Gantt
      </button>
      <button className={`view-tab ${active === "cal" ? "active" : ""}`} onClick={() => onChange("cal")}>
        <CalendarRange size={14} /> Calendário
      </button>
    </div>
  )
}

// ─────────── List view (agrupada por etapa) ───────────
function ListView({
  statuses,
  tasks,
  resolveAssignee,
  demandTypeName,
  onOpen,
  onSendToDev,
  canSendToDev,
  childrenProgress,
  childrenDates,
  useEstimatedHoursOnCard,
}: {
  statuses: ProjectStatus[]
  tasks: ProjectTask[]
  resolveAssignee: (id: string | null | undefined) => User | null
  demandTypeName: (id: string | null) => string | null
  onOpen: (task: ProjectTask) => void
  onSendToDev: (task: ProjectTask) => void
  canSendToDev: boolean
  childrenProgress: (taskId: string) => { done: number; total: number; pct: number } | null
  childrenDates: (taskId: string) => { start: string | null; due: string | null } | null
  useEstimatedHoursOnCard: boolean
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }))
  const today = new Date(new Date().toDateString())
  return (
    <div className="list-card">
      <div className="list-row header">
        <span />
        <span>Demanda</span>
        <span>Tipo</span>
        <span>Status</span>
        <span>Responsável</span>
        <span>{useEstimatedHoursOnCard ? "Horas est." : "SLA"}</span>
        <span>Prazo</span>
      </div>
      {statuses.map((s) => {
        const stTasks = tasks.filter((t) => t.status_id === s.id)
        if (stTasks.length === 0) return null
        return (
          <div key={s.id}>
            <div className="list-row group" onClick={() => toggle(s.id)}>
              {collapsed[s.id] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              <span className="status-dot" style={{ background: s.color }} />
              <span>{s.name}</span>
              <span style={{ color: "var(--af-muted-fg)", fontWeight: 500 }}>{stTasks.length}</span>
            </div>
            {!collapsed[s.id] && stTasks.map((t) => {
              const a = resolveAssignee(t.assigned_to)
              const due = t.due_date ? new Date(t.due_date) : null
              const overdue = due && !t.completed_at ? due < today : false
              const typeName = demandTypeName(t.demand_type_id)
              const childAgg = childrenProgress(t.id)
              const lastDue = childAgg ? childrenDates(t.id)?.due : null
              const groupLabel = t.planning_kind === "programa" ? "Programa" : null
              return (
                <div key={t.id} className="list-row task" onClick={() => onOpen(t)}>
                  <span />
                  <div className="col-title" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="text">{t.title}</span>
                    {childAgg && (
                      <span className="chip" style={{ background: "var(--af-primary, #2563eb)", color: "#fff" }} title="Abra o card para ver/gerenciar os itens">
                        {groupLabel ? `${groupLabel} · ` : ""}{childAgg.total} {childAgg.total === 1 ? "item" : "itens"} · {childAgg.pct}%
                      </span>
                    )}
                    {lastDue && (
                      <span className="chip muted">Última entrega: {new Date(lastDue).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
                    )}
                    {t.card_classification && <ClassificationChip value={t.card_classification} />}
                    {canSendToDev && t.parent_task_id && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onSendToDev(t) }}
                        className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        title="Enviar este projeto para o kanban de desenvolvimento"
                      >
                        <ArrowUpRight size={12} /> Enviar p/ dev
                      </button>
                    )}
                  </div>
                  <span>{typeName && <span className="chip">{typeName}</span>}</span>
                  <span>
                    <span className="chip" style={{ background: s.color + "22", color: s.color }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: s.color }} />
                      {s.name}
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="assignee-avatar" style={{ background: colorForUser(a?.id ?? null), width: 22, height: 22, fontSize: 9 }}>
                      {a ? initialsOf(a.full_name) : "?"}
                    </span>
                    <span style={{ fontSize: 12 }}>{a?.full_name?.split(" ")[0] ?? "—"}</span>
                  </span>
                  <span>
                    {useEstimatedHoursOnCard ? (
                      <span className="chip muted" title="Horas estimadas">
                        <Clock size={10} />
                        {fmtEstimatedHours(t.estimated_hours) ?? "—"}
                      </span>
                    ) : (
                      <SlaChip state={t.sla_state} />
                    )}
                  </span>
                  <span>{due && (
                    <span className={`due-pill ${overdue ? "overdue" : ""}`}>
                      <span className="dot" />{due.toLocaleDateString("pt-BR")}
                    </span>
                  )}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ─────────── Calendar view (mês) ───────────
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
const DOWS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"]
function CalendarView({
  tasks,
  demandTypeName,
  onOpen,
}: {
  tasks: ProjectTask[]
  demandTypeName: (id: string | null) => string | null
  onOpen: (task: ProjectTask) => void
}) {
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const today = new Date()
  const first = new Date(cursor.y, cursor.m, 1)
  const startDow = (first.getDay() + 6) % 7
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(i)
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{MONTHS[cursor.m]} {cursor.y}</h2>
        <button className="btn ghost icon" onClick={() => setCursor((c) => { const d = new Date(c.y, c.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() } })}>
          <ChevronLeft size={14} />
        </button>
        <button className="btn ghost icon" onClick={() => setCursor((c) => { const d = new Date(c.y, c.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() } })}>
          <ChevronRight size={14} />
        </button>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>Hoje</button>
      </div>
      <div className="cal-grid" style={{ marginBottom: 6 }}>
        {DOWS.map((d) => (
          <div key={d} style={{ padding: "6px 8px", fontSize: 11, fontWeight: 600, color: "var(--af-muted-fg)" }}>{d}</div>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dayDate = new Date(cursor.y, cursor.m, day)
          const isToday = dayDate.toDateString() === today.toDateString()
          const dayTasks = tasks.filter((t) => t.due_date && new Date(t.due_date).toDateString() === dayDate.toDateString())
          return (
            <div key={i} className={`cal-day ${isToday ? "today" : ""}`}>
              <div className="num">{day}</div>
              {dayTasks.slice(0, 3).map((t) => (
                <div key={t.id} className="cal-tag" onClick={() => onOpen(t)} title={t.title}>
                  {demandTypeName(t.demand_type_id) ? `${demandTypeName(t.demand_type_id)}: ` : ""}{t.title}
                </div>
              ))}
              {dayTasks.length > 3 && <div style={{ fontSize: 10, color: "var(--af-muted-fg)" }}>+{dayTasks.length - 3}</div>}
            </div>
          )
        })}
      </div>
    </>
  )
}

// Dropdown de filtro multi-seleção no estilo do protótipo (usado na toolbar).
function FilterDropdown({
  label,
  open,
  onToggle,
  selectedCount,
  align = "start",
  menuClassName,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  selectedCount: number
  align?: "start" | "end"
  menuClassName?: string
  children: React.ReactNode
}) {
  return (
    <div className={`relative${align === "end" ? " filter-dropdown-end" : ""}`}>
      <button type="button" className={`filter-btn ${selectedCount ? "active" : ""}`} onClick={onToggle}>
        <span>{label}</span>
        {selectedCount > 0 && <span className="filter-count">{selectedCount}</span>}
        <ChevronDown size={12} />
      </button>
      {open && <div className={`dd-menu${menuClassName ? ` ${menuClassName}` : ""}`}>{children}</div>}
    </div>
  )
}

export default function ProjectBoardPage() {
  function getApiError(err: unknown): string {
    const e = err as { response?: { data?: { detail?: unknown } } }
    const d = e.response?.data?.detail
    if (typeof d === "string") return d
    return "Não foi possível concluir a ação."
  }

  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { projectId } = useParams<{ projectId: string }>()
  const funnelFromQuery = searchParams.get("funnel")
  const taskFromQuery = searchParams.get("task")
  const [projects, setProjects] = useState<Project[]>([])
  const [funnels, setFunnels] = useState<ProjectFunnel[]>([])
  const [statuses, setStatuses] = useState<ProjectStatus[]>([])
  // status_ids que têm um agente de IA ativo vinculado (ícone de robô na raia).
  const [agentStatusIds, setAgentStatusIds] = useState<Set<string>>(new Set())
  const [demandTypes, setDemandTypes] = useState<ProjectDemandType[]>([])
  const [formSections, setFormSections] = useState<ProjectDemandFormSection[]>([])
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, ProjectDemandFormField[]>>({})
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [persons, setPersons] = useState<Person[]>([])
  // Subconjunto de usuários com cargo PO (Product Owner) — para o campo de responsável na conversão.
  const [poUsers, setPoUsers] = useState<User[]>([])
  const [cardFields, setCardFields] = useState<ProjectCardField[]>([])
  const [statusFunnel, setStatusFunnel] = useState<Record<string, string>>({})
  const [quadrants, setQuadrants] = useState<PriorityQuadrant[]>([])
  const [quadrantByTask, setQuadrantByTask] = useState<Record<string, QuadrantCode>>({})
  const [loading, setLoading] = useState(true)
  const [openCreate, setOpenCreate] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null)
  const [selectedFunnelId, setSelectedFunnelId] = useState("")
  const [selectedDemandTypeId, setSelectedDemandTypeId] = useState("")
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskDescription, setNewTaskDescription] = useState("")
  const [pendingCreateStatusId, setPendingCreateStatusId] = useState<string | null>(null)
  const [defaultFormFields, setDefaultFormFields] = useState<ProjectDefaultFormField[]>([])
  const [formValuesByTask, setFormValuesByTask] = useState<Record<string, Record<string, unknown>>>({})
  const [formFieldMeta, setFormFieldMeta] = useState<Map<string, ProjectDemandFormField>>(new Map())
  const [view, setView] = useState<BoardView>(() => resolveViewFromPath(location.pathname))
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [createSectionLinks, setCreateSectionLinks] = useState<ProjectStatusSectionLink[]>([])
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({})
  const [conversionPrompt, setConversionPrompt] = useState<{
    task: ProjectTask
    toStatusId: string
    typeName: string
    name: string
    kind: "projeto" | "programa"
    description: string
    assignedTo: string
    items: Array<{ title: string; description: string; start_date: string; due_date: string }>
    // Programa (obrigatório): selecionar um existente ou cadastrar um novo inline.
    programMode: "select" | "new"
    programId: string
    newProgramName: string
    newProgramDesc: string
  } | null>(null)
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([])
  const [savingConversion, setSavingConversion] = useState(false)
  // Gate de saída do backlog: classificar o card + vincular ao portfólio de Produtos.
  const [classificationPrompt, setClassificationPrompt] = useState<{
    task: ProjectTask
    toStatusId?: string
    mode: "backlog_exit" | "late"
  } | null>(null)

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  )
  const projectRouteBase = selectedProject ? `/app/modules/projetos/${selectedProject.id}` : "/app/modules/projetos"
  // Tipos que são "filhos" de algum outro tipo: criados pela hierarquia (dentro do card pai),
  // não diretamente pelo "Nova Demanda".
  const childTypeIds = useMemo(
    () => new Set(demandTypes.flatMap((d) => d.allowed_child_type_ids ?? [])),
    [demandTypes]
  )
  const availableDemandTypes = useMemo(
    () => demandTypes.filter(
      (t) => (t.funnel_id === selectedFunnelId || !t.funnel_id) && !childTypeIds.has(t.id)
    ),
    [demandTypes, selectedFunnelId, childTypeIds]
  )
  const demandTypeName = useMemo(() => {
    const byId = new Map(demandTypes.map((t) => [t.id, t.name]))
    return (id: string | null) => (id ? byId.get(id) ?? null : null)
  }, [demandTypes])
  const parentName = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t.title]))
    return (id: string | null) => (id ? byId.get(id) ?? null : null)
  }, [tasks])
  const visibleCardFields = useMemo(
    () => [...cardFields].filter((f) => f.is_visible).sort((a, b) => a.order - b.order),
    [cardFields],
  )
  const quadrantInfo = useMemo(() => {
    const byCode = new Map(quadrants.map((q) => [q.code, q]))
    return (taskId: string) => {
      const code = quadrantByTask[taskId]
      if (!code) return null
      const q = byCode.get(code)
      return { label: q?.label ?? code, color: q?.color ?? "#6B7280" }
    }
  }, [quadrants, quadrantByTask])
  const childrenProgress = useMemo(() => {
    const agg = new Map<string, { done: number; total: number }>()
    for (const t of tasks) {
      if (!t.parent_task_id) continue
      const a = agg.get(t.parent_task_id) ?? { done: 0, total: 0 }
      a.total += 1
      if (t.completed_at) a.done += 1
      agg.set(t.parent_task_id, a)
    }
    return (taskId: string) => {
      const a = agg.get(taskId)
      if (!a || a.total === 0) return null
      return { ...a, pct: Math.round((a.done / a.total) * 100) }
    }
  }, [tasks])

  // Datas agregadas dos filhos (Programa): início = menor start, última entrega = maior due.
  const childrenDates = useMemo(() => {
    const agg = new Map<string, { start: string | null; due: string | null }>()
    for (const t of tasks) {
      if (!t.parent_task_id) continue
      const a = agg.get(t.parent_task_id) ?? { start: null, due: null }
      if (t.start_date && (!a.start || t.start_date < a.start)) a.start = t.start_date
      if (t.due_date && (!a.due || t.due_date > a.due)) a.due = t.due_date
      agg.set(t.parent_task_id, a)
    }
    return (taskId: string) => agg.get(taskId) ?? null
  }, [tasks])

  // Filhos agrupados sob o pai NO MESMO funil (escondidos por padrão no quadro).
  const groupedChildIds = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]))
    const set = new Set<string>()
    for (const t of tasks) {
      if (!t.parent_task_id) continue
      const parent = byId.get(t.parent_task_id)
      if (!parent) continue
      const childFunnel = statusFunnel[t.status_id]
      const parentFunnel = statusFunnel[parent.status_id]
      if (childFunnel && parentFunnel && childFunnel === parentFunnel) set.add(t.id)
    }
    return set
  }, [tasks, statusFunnel])

  const resolveAssignee = useMemo(() => {
    const byId = new Map<string, User>()
    for (const p of persons) {
      const u = personToUser(p)
      byId.set(p.id, u)
      if (p.user_id) byId.set(p.user_id, u)
    }
    return (id: string | null | undefined) => (id ? byId.get(id) ?? null : null)
  }, [persons])

  const {
    searchQuery,
    setSearchQuery,
    assignees,
    setAssignees,
    productOwners,
    setProductOwners,
    requisitantes,
    setRequisitantes,
    diretorias,
    setDiretorias,
    planningCards,
    setPlanningCards,
    areas,
    setAreas,
    planningScopeIds,
    hasFilters,
    clearFilters,
    toggleMulti,
  } = usePersistedTaskFilters(groupedChildIds, tasks)

  const dimLabelMaps = useMemo(() => {
    const build = (key: "diretoria" | "area") => {
      const field = defaultFormFields.find((f) => f.field_key === key)
      const map = new Map<string, string>()
      if (field) parseDefaultFieldOptions(field).forEach((o) => map.set(o.value, o.label))
      return map
    }
    return { diretoria: build("diretoria"), area: build("area") }
  }, [defaultFormFields])

  const availDiretorias = useMemo(() => {
    const fromForm = defaultSelectOptions(defaultFormFields, "diretoria").map((o) => o.value)
    const fromTasks = [...new Set(tasks.map((t) => t.diretoria).filter(Boolean))] as string[]
    return [...new Set([...fromForm, ...fromTasks])].sort((a, b) =>
      (dimLabelMaps.diretoria.get(a) ?? a).localeCompare(dimLabelMaps.diretoria.get(b) ?? b, "pt-BR"),
    )
  }, [defaultFormFields, tasks, dimLabelMaps])

  const availAreas = useMemo(() => {
    const fromForm = defaultSelectOptions(defaultFormFields, "area").map((o) => o.value)
    const fromTasks = [...new Set(tasks.map((t) => t.area).filter(Boolean))] as string[]
    return [...new Set([...fromForm, ...fromTasks])].sort((a, b) =>
      (dimLabelMaps.area.get(a) ?? a).localeCompare(dimLabelMaps.area.get(b) ?? b, "pt-BR"),
    )
  }, [defaultFormFields, tasks, dimLabelMaps])

  const requesterField = useMemo(() => resolveRequesterField(formFieldMeta), [formFieldMeta])
  const requesterFieldKey = requesterField?.field_key ?? REQUESTER_FIELD_KEY

  const requesterLabel = useMemo(() => {
    return (value: string) => {
      if (value === "__none__") return "Sem requisitante"
      return formatCardCustomFieldValue(
        requesterField ?? undefined,
        value,
        (id) => resolveAssignee(id)?.full_name ?? null,
      ) ?? value
    }
  }, [requesterField, resolveAssignee])

  const availRequisitantes = useMemo(() => {
    const fromForm = requesterField && normalizeFieldType(requesterField.field_type) === "select"
      ? parseFieldOptions(requesterField).map((o) => o.value)
      : []
    const fromTasks = [...new Set(
      Object.values(formValuesByTask)
        .map((values) => values[requesterFieldKey])
        .flatMap((raw) => {
          if (raw === null || raw === undefined || raw === "") return []
          if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string" && x.trim() !== "")
          return [String(raw)]
        }),
    )]
    return [...new Set([...fromForm, ...fromTasks])].sort((a, b) =>
      requesterLabel(a).localeCompare(requesterLabel(b), "pt-BR"),
    )
  }, [formValuesByTask, requesterField, requesterFieldKey, requesterLabel])

  const requisitanteOptionGroups = useMemo(
    () => groupFilterValuesByLabel(availRequisitantes, requesterLabel),
    [availRequisitantes, requesterLabel],
  )

  const planningCardOptions = useMemo(
    () => filterPlanningRootsByPo(planningRootTasks(tasks), productOwners)
      .sort((a, b) => a.title.localeCompare(b.title, "pt-BR")),
    [tasks, productOwners],
  )

  const effectivePoByTaskId = useMemo(() => buildEffectivePoByTaskId(tasks), [tasks])

  const poByOriginTaskId = useMemo(() => buildPoByOriginTaskId(tasks), [tasks])

  const matchPoIdsByForm = useMemo(
    () => buildPoMatchByFormDimensions(
      productOwnerPersons(persons),
      defaultFormFields,
    ),
    [persons, defaultFormFields],
  )

  // Remove seleções de projeto/programa que não pertencem ao PO filtrado.
  useEffect(() => {
    if (productOwners.length === 0) return
    const allowed = new Set(planningCardOptions.map((c) => c.id))
    setPlanningCards((prev) => {
      const next = prev.filter((id) => allowed.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [productOwners, planningCardOptions, setPlanningCards])

  const assigneeOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const t of tasks) ids.add(t.assigned_to ?? "__none__")
    return [...ids]
      .map((id) => {
        if (id === "__none__") return { id, full_name: "Sem responsável" }
        const u = resolveAssignee(id)
        return { id, full_name: u?.full_name ?? id }
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"))
  }, [tasks, resolveAssignee])

  const selectedFunnelName = funnels.find((f) => f.id === selectedFunnelId)?.name ?? null

  const taskProgressById = useMemo(() => buildTaskProgressById(tasks), [tasks])

  const programNameById = useMemo(
    () => new Map(programs.map((p) => [p.id, p.name])),
    [programs],
  )

  // Card de planejamento (projeto/programa) criado por conversão, indexado pela origem.
  // Permite exibir a etiqueta Projeto/Programa também no card de origem (ex.: "Concluído"
  // do kanban de prospecção), que não carrega planning_kind próprio.
  const plannedByOrigin = useMemo(() => {
    const m = new Map<string, ProjectTask>()
    for (const t of tasks) {
      if (t.origin_task_id && (t.planning_kind === "projeto" || t.planning_kind === "programa")) {
        m.set(t.origin_task_id, t)
      }
    }
    return m
  }, [tasks])

  const cardCtx = useMemo<CardCtx>(() => ({
    fields: visibleCardFields,
    demandTypeName,
    parentName,
    quadrantInfo,
    childrenProgress,
    childrenDates,
    users,
    resolveAssignee,
    formValuesByTask,
    formFieldMeta,
    defaultFormFields,
    useEstimatedHoursOnCard: isFeatureOrUsKanbanFunnel(selectedFunnelName),
    isUsKanban: isUserStoryKanbanFunnel(selectedFunnelName),
    isFeatureKanban: isFeatureKanbanFunnel(selectedFunnelName),
    featureUsProgress: (taskId: string) => {
      const total = tasks.filter((t) => t.parent_task_id === taskId).length
      if (total === 0) return null
      return { pct: taskProgressById.get(taskId) ?? 0, total }
    },
    programName: (id: string | null) => (id ? programNameById.get(id) ?? null : null),
    planningTag: (task: ProjectTask) => {
      const src =
        task.planning_kind === "projeto" || task.planning_kind === "programa"
          ? task
          : plannedByOrigin.get(task.id) ?? null
      if (!src) return null
      const kind = src.planning_kind as "projeto" | "programa"
      return {
        kind,
        programName: kind === "programa" ? (src.linked_program_id ? programNameById.get(src.linked_program_id) ?? null : null) : null,
      }
    },
  }), [
    visibleCardFields,
    demandTypeName,
    parentName,
    quadrantInfo,
    childrenProgress,
    childrenDates,
    users,
    resolveAssignee,
    formValuesByTask,
    formFieldMeta,
    defaultFormFields,
    selectedFunnelName,
    taskProgressById,
    tasks,
    programNameById,
    plannedByOrigin,
  ])
  const userRoleName = (user?.role_name ?? "").trim().toLowerCase()
  const isBasicUser =
    user?.role === "company_user" &&
    (userRoleName === "basic" || userRoleName === "")

  function isUserAssignee(task: ProjectTask): boolean {
    const authPersonId = persons.find((p) => p.user_id === user?.id)?.id
    return Boolean(
      task.assigned_to &&
      (task.assigned_to === authPersonId || task.assigned_to === user?.id),
    )
  }

  function funnelAccessForTask(task: ProjectTask) {
    const status = statuses.find((s) => s.id === task.status_id)
    const funnelId = status?.funnel_id ?? selectedFunnelId
    return funnels.find((f) => f.id === funnelId)?.access_control
  }

  useEffect(() => {
    setView(resolveViewFromPath(location.pathname))
  }, [location.pathname])

  useEffect(() => {
    Promise.all([
      projetosApi.listProjects(true),
      teamopsApi.listPersons().catch(() => [] as Person[]),
      projetosApi.listDemandTypes(true).catch(() => [] as ProjectDemandType[]),
      projetosApi.listPriorityQuadrants().catch(() => [] as PriorityQuadrant[]),
      projetosApi.getDefaultFormFields().catch(() => [] as ProjectDefaultFormField[]),
    ])
      .then(([ps, personsList, dts, qd, df]) => {
        setProjects(ps)
        setPersons(personsList)
        setUsers(personsList.map(personToUser))
        setPoUsers(productOwnerPersons(personsList).map(personToUser))
        setDemandTypes(dts)
        setQuadrants(qd)
        setDefaultFormFields(df)
        if (!projectId && ps[0]) {
          navigate(`/app/modules/projetos/${ps[0].id}/board`, { replace: true })
        }
      })
      .finally(() => setLoading(false))
  }, [navigate, projectId])

  useEffect(() => {
    if (availableDemandTypes.length === 0) {
      setSelectedDemandTypeId("")
      return
    }
    const stillEligible = availableDemandTypes.some((t) => t.id === selectedDemandTypeId)
    if (!stillEligible) setSelectedDemandTypeId(availableDemandTypes[0].id)
  }, [availableDemandTypes, selectedDemandTypeId])

  useEffect(() => {
    if (!projectId) return
    projetosApi.priorityMatrix()
      .then((mx) => setQuadrantByTask(Object.fromEntries(mx.map((m) => [m.task_id, m.quadrant_code]))))
      .catch(() => setQuadrantByTask({}))
    // Mapa status→funil de TODOS os funis (para agrupar filhos pelo funil do pai).
    projetosApi.listStatuses(projectId)
      .then((all) => {
        setStatusFunnel(Object.fromEntries(all.map((s) => [s.id, s.funnel_id])))
      })
      .catch(() => {
        setStatusFunnel({})
      })
    // Catálogo de programas — resolve o nome exibido nos cards do tipo "Programa".
    projetosApi.listPrograms(projectId)
      .then(setPrograms)
      .catch(() => setPrograms([]))
    Promise.all([
      projetosApi.listFunnels(projectId, true),
      projetosApi.listTasks(projectId),
      projetosApi.getProjectFormValues(projectId).catch(() => ({})),
    ]).then(([fs, ts, formVals]) => {
      const orderedFunnels = [...fs].sort((a, b) => a.order - b.order)
      setFunnels(orderedFunnels)
      setTasks(ts)
      setFormValuesByTask(formVals)
      const fromQuery =
        funnelFromQuery && orderedFunnels.some((f) => f.id === funnelFromQuery)
          ? funnelFromQuery
          : null
      const defaultFunnel = orderedFunnels.find((f) => f.is_default) ?? orderedFunnels[0]
      setSelectedFunnelId(fromQuery ?? defaultFunnel?.id ?? "")
    })
  }, [projectId, funnelFromQuery])

  useEffect(() => {
    if (!projectId || !selectedFunnelId) return
    projetosApi.listStatuses(projectId, selectedFunnelId, true).then((ss) => {
      setStatuses([...ss].sort((a, b) => a.order - b.order))
    })
  }, [projectId, selectedFunnelId])

  // Raias com agente de IA ativo (para exibir o ícone de robô no cabeçalho da coluna).
  useEffect(() => {
    if (!projectId) { setAgentStatusIds(new Set()); return }
    projetosApi.listStageAgents(projectId)
      .then((ags) => setAgentStatusIds(new Set(ags.filter((a) => a.is_active).map((a) => a.status_id))))
      .catch(() => setAgentStatusIds(new Set()))
  }, [projectId])

  // Layout do card é por kanban: recarrega ao trocar de funil.
  useEffect(() => {
    if (!selectedFunnelId) {
      setCardFields([])
      return
    }
    projetosApi.listCardFields(selectedFunnelId)
      .then(setCardFields)
      .catch(() => setCardFields([]))
  }, [selectedFunnelId])

  useEffect(() => {
    if (!selectedFunnelId) {
      setFormFieldMeta(new Map())
      return
    }
    const typeIds = demandTypes
      .filter((t) => t.is_active && (t.funnel_id === selectedFunnelId || !t.funnel_id))
      .map((t) => t.id)
    if (typeIds.length === 0) {
      setFormFieldMeta(new Map())
      return
    }
    Promise.all(typeIds.map(async (demandTypeId) => {
      const sections = await projetosApi.listDemandSections(demandTypeId, true).catch(() => [])
      const fieldGroups = await Promise.all(
        sections.map((s) => projetosApi.listDemandFields(demandTypeId, s.id, true).catch(() => [])),
      )
      return fieldGroups.flat()
    })).then((groups) => {
      const map = new Map<string, ProjectDemandFormField>()
      for (const field of groups.flat()) {
        if (!map.has(field.field_key)) map.set(field.field_key, field)
      }
      setFormFieldMeta(map)
    })
  }, [selectedFunnelId, demandTypes])

  // Deep-link: abrir um card vindo de "Trabalho relacionado" (?task=<id>).
  useEffect(() => {
    if (!taskFromQuery || tasks.length === 0) return
    const t = tasks.find((x) => x.id === taskFromQuery)
    if (t) setSelectedTask(t)
    const params = new URLSearchParams(searchParams)
    params.delete("task")
    setSearchParams(params, { replace: true })
  }, [taskFromQuery, tasks])

  useEffect(() => {
    if (!openCreate) return
    const allFields = Object.values(fieldsBySection).flat()
    if (allFields.length === 0) return
    setFormValues((prev) => applyAutoFillCurrentFields(allFields, prev))
  }, [openCreate, fieldsBySection])

  useEffect(() => {
    if (!openCreate || !projectId || statuses.length === 0) {
      setCreateSectionLinks([])
      return
    }
    const targetStatusId = pendingCreateStatusId ?? initialStatusOf(statuses)
    if (!targetStatusId) {
      setCreateSectionLinks([])
      return
    }
    projetosApi.listStatusSectionLinks(projectId, targetStatusId)
      .then(setCreateSectionLinks)
      .catch(() => setCreateSectionLinks([]))
  }, [openCreate, projectId, pendingCreateStatusId, statuses])

  useEffect(() => {
    if (!selectedDemandTypeId) {
      setFormSections([])
      setFieldsBySection({})
      return
    }
    projetosApi.listDemandSections(selectedDemandTypeId, true).then(async (sections) => {
      setFormSections(sections.sort((a, b) => a.order - b.order))
      const rows = await Promise.all(
        sections.map(async (section) => ({
          sectionId: section.id,
          fields: await projetosApi.listDemandFields(selectedDemandTypeId, section.id, true),
        }))
      )
      const mapped: Record<string, ProjectDemandFormField[]> = {}
      const allFields: ProjectDemandFormField[] = []
      rows.forEach((row) => {
        const ordered = [...row.fields].sort((a, b) => a.order - b.order)
        mapped[row.sectionId] = ordered
        allFields.push(...ordered)
      })
      setFieldsBySection(mapped)
      setFormValues((prev) => applyAutoFillCurrentFields(allFields, prev))
    }).catch(() => {
      setFormSections([])
      setFieldsBySection({})
    })
  }, [selectedDemandTypeId])

  const demandFormCache = useRef<Map<string, { sections: ProjectDemandFormSection[]; fieldsBySection: Record<string, ProjectDemandFormField[]> }>>(new Map())
  const sectionLinksCache = useRef<Map<string, ProjectStatusSectionLink[]>>(new Map())
  const formValuesCache = useRef<Map<string, Record<string, unknown>>>(new Map())
  const [, setActiveDragTaskId] = useState<string | null>(null)

  async function loadDemandForm(demandTypeId: string) {
    const cached = demandFormCache.current.get(demandTypeId)
    if (cached) return cached
    const sections = (await projetosApi.listDemandSections(demandTypeId, true)).sort((a, b) => a.order - b.order)
    const rows = await Promise.all(
      sections.map(async (s) => ({
        sectionId: s.id,
        fields: (await projetosApi.listDemandFields(demandTypeId, s.id, true)).sort((a, b) => a.order - b.order),
      })),
    )
    const fieldsBySection: Record<string, ProjectDemandFormField[]> = {}
    rows.forEach((r) => { fieldsBySection[r.sectionId] = r.fields })
    const entry = { sections, fieldsBySection }
    demandFormCache.current.set(demandTypeId, entry)
    return entry
  }

  async function loadSectionLinks(statusId: string) {
    const cached = sectionLinksCache.current.get(statusId)
    if (cached) return cached
    if (!projectId) return []
    const links = await projetosApi.listStatusSectionLinks(projectId, statusId)
    sectionLinksCache.current.set(statusId, links)
    return links
  }

  async function loadFormValues(task: ProjectTask) {
    const cached = formValuesCache.current.get(task.id)
    if (cached) return cached
    if (!projectId) return {}
    const submission = await projetosApi.getTaskFormSubmission(projectId, task.id).catch(() => null)
    const values = submission?.values ?? {}
    formValuesCache.current.set(task.id, values)
    return values
  }

  async function reloadTasks() {
    if (!projectId) return
    const next = await projetosApi.listTasks(projectId)
    setTasks(next)
  }

  // Etapa do funil atual que transita para outro kanban (= "ir para desenvolvimento").
  const devMoveStageId = statuses.find((s) => s.moves_to_funnel_id)?.id ?? null

  async function sendToDev(task: ProjectTask) {
    if (!projectId || !devMoveStageId) {
      toast.error("Configure uma etapa que mova para o kanban de desenvolvimento (Etapas Kanban → 'mover para o kanban').")
      return
    }
    try {
      await projetosApi.updateTask(projectId, task.id, { status_id: devMoveStageId })
      toast.success("Projeto enviado para o desenvolvimento.")
      await reloadTasks()
    } catch (err) {
      alert(getApiError(err))
    }
  }

  async function handleMove(task: ProjectTask, toStatusId: string) {
    if (!projectId || task.status_id === toStatusId) return
    const fromStatus = statuses.find((s) => s.id === task.status_id)
    const toStatus = statuses.find((s) => s.id === toStatusId)
    const isAssignee = isUserAssignee(task)
    if (!canMoveTaskOnBoard(
      user,
      fromStatus,
      toStatus,
      funnelAccessForTask(task),
      isAssignee,
    )) {
      toast.error("Você não tem permissão para mover este card para essa etapa.")
      return
    }
    const moveFunnelName = funnels.find((f) => f.id === (fromStatus?.funnel_id ?? selectedFunnelId))?.name ?? selectedFunnelName
    if (isFeatureOrUsKanbanFunnel(moveFunnelName) && !task.assigned_to) {
      toast.error("Defina um responsável no card antes de movê-lo.")
      setSelectedTask(task)
      return
    }
    const isForward = !!(fromStatus && toStatus && toStatus.order > fromStatus.order)
    if (task.demand_type_id && isForward) {
      try {
        const [form, links, values] = await Promise.all([
          loadDemandForm(task.demand_type_id),
          loadSectionLinks(task.status_id),
          loadFormValues(task),
        ])
        const { missingLabels } = validateRequiredFields({
          statusId: task.status_id,
          formSections: form.sections,
          fieldsBySection: form.fieldsBySection,
          sectionLinks: links,
          formValues: values,
        })
        if (missingLabels.length > 0) {
          toast.error(formatMissingFieldsMessage(missingLabels))
          setSelectedTask(task)
          return
        }
      } catch {
        // Falha ao carregar metadados de validação — segue para o backend decidir.
      }
    }
    // Saída do backlog: exige classificar quando enforcement ativo no funil.
    const activeFunnel = funnels.find((f) => f.id === (fromStatus?.funnel_id ?? selectedFunnelId))
    if (
      fromStatus?.is_initial
      && fromStatus?.classification_required
      && activeFunnel?.classification_enforcement_enabled
      && isForward
    ) {
      setClassificationPrompt({ task, toStatusId, mode: "backlog_exit" })
      return
    }
    if (toStatus?.creates_demand_type_id) {
      const typeName = demandTypes.find((d) => d.id === toStatus.creates_demand_type_id)?.name ?? "Projeto"
      if (projectId) {
        projetosApi.listPrograms(projectId).then(setPrograms).catch(() => setPrograms([]))
      }
      setConversionPrompt({
        task, toStatusId, typeName, name: stripProjectPrefix(task.title),
        kind: "projeto", description: task.description ?? "",
        assignedTo: poUsers.some((u) => u.id === task.assigned_to) ? (task.assigned_to ?? "") : "",
        items: [{ title: "", description: "", start_date: "", due_date: "" }],
        programMode: "select", programId: "", newProgramName: "", newProgramDesc: "",
      })
      return
    }
    await performMove(task, toStatusId)
  }

  async function performMove(
    task: ProjectTask,
    toStatusId: string,
    conversionTitle?: string,
    conversion?: {
      kind: "projeto" | "programa"
      description: string
      assignedTo: string
      items: Array<{ title: string; description: string; start_date: string; due_date: string }>
      programId?: string | null
    },
    classification?: { value: CardClassification; productId: string; releaseId: string | null },
  ) {
    if (!projectId) return
    try {
      const payload: Parameters<typeof projetosApi.updateTask>[2] = { status_id: toStatusId }
      if (classification) {
        payload.card_classification = classification.value
        payload.linked_product_id = classification.productId
        payload.linked_release_id = classification.releaseId
      }
      if (conversionTitle !== undefined) payload.conversion_title = conversionTitle
      if (conversion) {
        // A conversão sempre cria um Projeto; opcionalmente vincula a um programa do cadastro.
        payload.conversion_kind = "projeto"
        payload.conversion_description = conversion.description.trim() || null
        payload.conversion_assigned_to = conversion.assignedTo || null
        payload.conversion_program_id = conversion.programId || null
      }
      const updated = await projetosApi.updateTask(projectId, task.id, payload)
      formValuesCache.current.delete(task.id)
      // Se a etapa de destino transita o card para outro kanban (moves_to_funnel_id),
      // o status retornado não pertence ao funil atual: o card sai desta visão.
      const leftFunnel = !statuses.some((s) => s.id === updated.status_id)
      if (leftFunnel) {
        setTasks((prev) => prev.filter((t) => t.id !== updated.id))
        toast.success("Card enviado para o próximo kanban.")
        await reloadTasks()
      } else {
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
        // Conversão cria um card novo em outro funil — recarrega para refletir.
        if (conversionTitle !== undefined) await reloadTasks()
      }
    } catch (err) {
      alert(getApiError(err))
    }
  }

  async function confirmConversion() {
    if (!conversionPrompt) return
    const name = conversionPrompt.name.trim()
    if (name.length < 2) {
      toast.error("Informe um nome com ao menos 2 caracteres.")
      return
    }
    // Programa só é OBRIGATÓRIO quando o tipo escolhido é "Programa".
    const requiresProgram = conversionPrompt.kind === "programa"
    if (requiresProgram && conversionPrompt.programMode === "select" && !conversionPrompt.programId) {
      toast.error("Vincule a um programa (selecione um existente ou cadastre um novo).")
      return
    }
    if (requiresProgram && conversionPrompt.programMode === "new" && conversionPrompt.newProgramName.trim().length < 2) {
      toast.error("Informe o nome do novo programa (mín. 2 caracteres).")
      return
    }
    setSavingConversion(true)
    try {
      let programId = conversionPrompt.programId
      if (requiresProgram && conversionPrompt.programMode === "new") {
        const created = await projetosApi.createProgram({
          name: conversionPrompt.newProgramName.trim(),
          description: conversionPrompt.newProgramDesc.trim() || null,
          responsavel_person_id: conversionPrompt.assignedTo || null,
        })
        programId = created.id
        setPrograms((prev) => [...prev, { id: created.id, name: created.name }])
      }
      await performMove(conversionPrompt.task, conversionPrompt.toStatusId, name, {
        kind: "projeto",
        description: conversionPrompt.description,
        assignedTo: conversionPrompt.assignedTo,
        items: conversionPrompt.items,
        programId: requiresProgram ? (programId || null) : null,
      })
      setConversionPrompt(null)
    } catch {
      toast.error("Não foi possível concluir (verifique o programa).")
    } finally {
      setSavingConversion(false)
    }
  }

  async function confirmClassification(result: { classification: CardClassification; productId: string; releaseId: string | null }) {
    if (!classificationPrompt) return
    if (classificationPrompt.mode === "late" || !classificationPrompt.toStatusId) {
      if (!projectId) return
      try {
        const updated = await projetosApi.updateTask(projectId, classificationPrompt.task.id, {
          card_classification: result.classification,
          linked_product_id: result.productId,
          linked_release_id: result.releaseId,
        })
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
        if (selectedTask?.id === updated.id) setSelectedTask(updated)
        toast.success("Projeto classificado.")
      } catch (err) {
        toast.error(getApiError(err))
      }
      setClassificationPrompt(null)
      return
    }
    await performMove(classificationPrompt.task, classificationPrompt.toStatusId, undefined, undefined, {
      value: result.classification,
      productId: result.productId,
      releaseId: result.releaseId,
    })
    setClassificationPrompt(null)
  }

  function initialStatusOf(list: ProjectStatus[]): string {
    const initial = list.find((s) => s.is_initial) ?? list[0]
    return initial?.id ?? ""
  }

  async function handleCreateTask() {
    if (!projectId || !selectedDemandTypeId || !newTaskTitle.trim()) return
    if (!canManageFunnel) {
      toast.error("Você só pode visualizar este kanban — sem permissão para criar cards.")
      return
    }
    const targetStatusId = pendingCreateStatusId ?? initialStatusOf(statuses)
    if (!targetStatusId) {
      alert("Configure ao menos um status neste kanban antes de criar demandas.")
      return
    }
    const { errors, missingLabels } = validateRequiredFields({
      statusId: targetStatusId,
      formSections,
      fieldsBySection,
      sectionLinks: createSectionLinks,
      formValues,
    })
    if (missingLabels.length > 0) {
      setCreateFieldErrors(errors)
      toast.error(formatMissingFieldsMessage(missingLabels))
      return
    }
    setCreateFieldErrors({})
    setSavingCreate(true)
    try {
      const created = await projetosApi.createTask(projectId, {
        demand_type_id: selectedDemandTypeId,
        title: newTaskTitle.trim().slice(0, 200),
        description: newTaskDescription.trim() || null,
        status_id: targetStatusId,
        assigned_to: null,
        due_date: null,
        form_values: formValues,
      })
      setTasks((prev) => [...prev, created])
      setOpenCreate(false)
      setNewTaskTitle("")
      setNewTaskDescription("")
      setFormValues({})
      setPendingCreateStatusId(null)
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setSavingCreate(false)
    }
  }

  const boardSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function onBoardDragStart(event: DragStartEvent) {
    const id = String(event.active.id)
    if (id.startsWith("task-")) setActiveDragTaskId(id.slice(5))
  }

  function onBoardDragEnd(event: DragEndEvent) {
    setActiveDragTaskId(null)
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (!activeId.startsWith("task-") || !overId.startsWith("column-")) return
    const taskId = activeId.slice(5)
    const toStatusId = overId.slice(7)
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    void handleMove(task, toStatusId)
  }

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
      </div>
    )
  }

  if (!selectedProject || !projectId) {
    return (
      <div className="text-sm text-muted-foreground">
        Não foi possível carregar o kanban. Recarregue a página em instantes.
      </div>
    )
  }

  const selectedFunnel = funnels.find((f) => f.id === selectedFunnelId) ?? null
  const canManageFunnel = funnelAccessLevel(selectedFunnel?.access_control, user) === "manage"
  const selectedTaskStatus = selectedTask
    ? statuses.find((s) => s.id === selectedTask.status_id)
    : undefined
  const canEditSelectedTask = selectedTask
    ? canEditTaskOnBoard(user, selectedTaskStatus, funnelAccessForTask(selectedTask), isUserAssignee(selectedTask))
    : false
  const filterState: BoardFilterState = {
    q: searchQuery,
    assignees,
    productOwners,
    requisitantes,
    requesterFieldKey,
    formValuesByTask,
    resolveRequisitanteLabel: requesterLabel,
    diretorias,
    areas,
    planningScopeIds,
    groupedChildIds,
    effectivePoByTaskId,
    poByOriginTaskId,
    matchPoIdsByForm,
  }
  const funnelTasks = tasks.filter((t) => taskMatches(t, filterState))

  return (
    <div className="afx kanban-page-root flex min-h-0 w-full min-w-0 flex-col gap-4 overflow-hidden">
      {openMenu && <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setOpenMenu(null)} />}

      <ViewTabs
        active={view}
        onChange={(nextView) => {
          setView(nextView)
          const nextPath = nextView === "list"
            ? `${projectRouteBase}/lista`
            : nextView === "cal"
              ? `${projectRouteBase}/calendario`
              : `${projectRouteBase}/board`
          // Preserva o kanban selecionado (?funnel=) e demais filtros ao trocar de visão.
          navigate(`${nextPath}${location.search}`)
        }}
        onGantt={() => navigate(`${projectRouteBase}/gantt${location.search}`)}
        count={funnelTasks.length}
      />

      <div className="board-toolbar" style={{ position: "relative", zIndex: 25 }}>
        <div className="board-title">
          <h1>Kanban</h1>
          {selectedFunnel && (<><span className="slash">/</span><span className="funnel-name">{selectedFunnel.name}</span></>)}
          <span className="count-pill">{funnelTasks.length}</span>
        </div>

        <div className="tb-search">
          <Search size={14} />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar demandas pelo título..." />
        </div>

        <FilterDropdown label="Responsável" open={openMenu === "assignee"} onToggle={() => setOpenMenu(openMenu === "assignee" ? null : "assignee")} selectedCount={assignees.length}>
          <div className="dd-head">Filtrar por responsável</div>
          {assigneeOptions.length === 0 ? (
            <div className="dd-item" style={{ opacity: 0.6, pointerEvents: "none" }}>Nenhum responsável nos cards</div>
          ) : assigneeOptions.map((m) => {
            const checked = assignees.includes(m.id)
            return (
              <div key={m.id} className="dd-item" onClick={() => toggleMulti(setAssignees, assignees, m.id)}>
                <span className={`check ${checked ? "checked" : ""}`}>{checked && <Check size={11} />}</span>
                <span>{m.full_name}</span>
              </div>
            )
          })}
        </FilterDropdown>

        <FilterDropdown label="Product Owner" open={openMenu === "po"} onToggle={() => setOpenMenu(openMenu === "po" ? null : "po")} selectedCount={productOwners.length}>
          <div className="dd-head">Filtrar por Product Owner</div>
          {[{ id: "__none__", full_name: "Sem PO" }, ...poUsers].map((m) => {
            const checked = productOwners.includes(m.id)
            return (
              <div key={m.id} className="dd-item" onClick={() => toggleMulti(setProductOwners, productOwners, m.id)}>
                <span className={`check ${checked ? "checked" : ""}`}>{checked && <Check size={11} />}</span>
                <span>{m.full_name}</span>
              </div>
            )
          })}
          {poUsers.length === 0 && <div className="dd-item" style={{ opacity: 0.6 }}>Nenhum PO cadastrado no TeamOps</div>}
        </FilterDropdown>

        <FilterDropdown label="Requisitante" open={openMenu === "requisitante"} onToggle={() => setOpenMenu(openMenu === "requisitante" ? null : "requisitante")} selectedCount={requisitantes.length}>
          <div className="dd-head">Filtrar por requisitante</div>
          {[
            { label: "Sem requisitante", values: ["__none__"] as string[] },
            ...requisitanteOptionGroups,
          ].map((opt) => (
            <div
              key={opt.label}
              className="dd-item"
              onClick={() => setRequisitantes((prev) => toggleGroupedFilterSelection(prev, opt.values))}
            >
              <span className={`check ${groupedFilterChecked(requisitantes, opt.values) ? "checked" : ""}`}>
                {groupedFilterChecked(requisitantes, opt.values) && <Check size={11} />}
              </span>
              <span>{opt.label}</span>
            </div>
          ))}
        </FilterDropdown>

        <FilterDropdown label="Diretoria" open={openMenu === "diretoria"} onToggle={() => setOpenMenu(openMenu === "diretoria" ? null : "diretoria")} selectedCount={diretorias.length} align="end">
          <div className="dd-head">Filtrar por diretoria</div>
          {[
            { label: "Sem diretoria", values: ["__none__"] as string[] },
            ...groupFilterValuesByLabel(availDiretorias, (v) => dimLabelMaps.diretoria.get(v) ?? v),
          ].map((opt) => (
            <div
              key={opt.label}
              className="dd-item"
              onClick={() => setDiretorias((prev) => toggleGroupedFilterSelection(prev, opt.values))}
            >
              <span className={`check ${groupedFilterChecked(diretorias, opt.values) ? "checked" : ""}`}>
                {groupedFilterChecked(diretorias, opt.values) && <Check size={11} />}
              </span>
              <span>{opt.label}</span>
            </div>
          ))}
        </FilterDropdown>

        <FilterDropdown label="Área" open={openMenu === "area"} onToggle={() => setOpenMenu(openMenu === "area" ? null : "area")} selectedCount={areas.length} align="end">
          <div className="dd-head">Filtrar por área</div>
          {[
            { label: "Sem área", values: ["__none__"] as string[] },
            ...availAreas.map((v) => ({ label: dimLabelMaps.area.get(v) ?? v, values: [v] })),
          ].map((opt) => (
            <div key={opt.label} className="dd-item" onClick={() => toggleMulti(setAreas, areas, opt.values[0])}>
              <span className={`check ${areas.includes(opt.values[0]) ? "checked" : ""}`}>
                {areas.includes(opt.values[0]) && <Check size={11} />}
              </span>
              <span>{opt.label}</span>
            </div>
          ))}
        </FilterDropdown>

        <FilterDropdown label="Projeto / Programa" open={openMenu === "planning"} onToggle={() => setOpenMenu(openMenu === "planning" ? null : "planning")} selectedCount={planningCards.length} menuClassName="dd-menu-wide">
          <div className="dd-head">Projetos e programas criados</div>
          {productOwners.length > 0 && (
            <div className="dd-item" style={{ opacity: 0.75, pointerEvents: "none", fontSize: 12 }}>
              Filtrado pelo Product Owner selecionado
            </div>
          )}
          {planningCardOptions.length === 0 ? (
            <div className="dd-item" style={{ opacity: 0.6, pointerEvents: "none" }}>
              {productOwners.length > 0 ? "Nenhum projeto/programa deste PO" : "Nenhum projeto ou programa"}
            </div>
          ) : planningCardOptions.map((c) => {
            const checked = planningCards.includes(c.id)
            return (
              <div key={c.id} className="dd-item" onClick={() => toggleMulti(setPlanningCards, planningCards, c.id)}>
                <span className={`check ${checked ? "checked" : ""}`}>{checked && <Check size={11} />}</span>
                <span className="chip muted" style={{ fontSize: 9, flexShrink: 0 }}>
                  {c.planning_kind === "programa" ? "Programa" : "Projeto"}
                </span>
                <span className="dd-item-label">{c.title}</span>
              </div>
            )
          })}
        </FilterDropdown>

        {hasFilters && (<button className="btn ghost" onClick={clearFilters}><X size={14} /> Limpar</button>)}
        {canManageFunnel && (
          <button className="btn primary icon" onClick={() => setOpenCreate(true)} title="Nova demanda"><Plus size={16} /></button>
        )}
      </div>

      {view === "board" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {statuses.length === 0 ? (
          <div className="empty-state">
            <div className="icon-wrap"><KanbanSquare size={24} /></div>
            <h3>Sem colunas</h3>
            <p>Este funil ainda não possui colunas de kanban.</p>
          </div>
        ) : (
          <DndContext sensors={boardSensors} onDragStart={onBoardDragStart} onDragEnd={onBoardDragEnd}>
            <div className="kanban-board-shell">
            <div className="board board-viewport-height scrollbar-thin">
              {statuses.map((status) => {
                const columnTasks = funnelTasks
                  .filter((t) => t.status_id === status.id)
                  .sort((a, b) => a.order - b.order)
                return (
                  <BoardColumn
                    key={status.id}
                    status={status}
                    tasks={columnTasks}
                    ctx={cardCtx}
                    hasAgent={agentStatusIds.has(status.id)}
                    onOpen={(t) => setSelectedTask(t)}
                  />
                )
              })}
              <button className="btn ghost" style={{ flexShrink: 0, alignSelf: "flex-start", marginTop: 8 }}>
                <Plus size={14} /> Nova coluna
              </button>
            </div>
            </div>
          </DndContext>
        )}
        </div>
      )}

      {view === "list" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <ListView statuses={statuses} tasks={funnelTasks} resolveAssignee={resolveAssignee} demandTypeName={demandTypeName} onOpen={(t) => setSelectedTask(t)} onSendToDev={(t) => void sendToDev(t)} canSendToDev={!!devMoveStageId} childrenProgress={childrenProgress} childrenDates={childrenDates} useEstimatedHoursOnCard={cardCtx.useEstimatedHoursOnCard} />
        </div>
      )}

      {view === "cal" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <CalendarView tasks={funnelTasks} demandTypeName={demandTypeName} onOpen={(t) => setSelectedTask(t)} />
        </div>
      )}

      <Dialog open={openCreate} onOpenChange={(v) => { setOpenCreate(v); if (!v) { setPendingCreateStatusId(null); setCreateFieldErrors({}) } }}>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Demanda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {availableDemandTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum tipo de demanda está vinculado a este kanban. Configure em <span className="font-medium">Configurações → Tipos de Demanda</span>.
              </p>
            ) : availableDemandTypes.length > 1 ? (
              <div className="space-y-1.5">
                <Label>Tipo de demanda</Label>
                <Select value={selectedDemandTypeId} onValueChange={setSelectedDemandTypeId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar tipo" /></SelectTrigger>
                  <SelectContent>
                    {availableDemandTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {!selectedDemandTypeId ? null : (
              <>
                <div className="space-y-1.5">
                  <Label>Título</Label>
                  <Input
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Ex: Ajustar fluxo de aprovação"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Textarea
                    rows={3}
                    value={newTaskDescription}
                    onChange={(e) => setNewTaskDescription(e.target.value)}
                    placeholder="Detalhes adicionais (opcional)"
                  />
                </div>
              </>
            )}

            {!selectedDemandTypeId || formSections.length === 0 ? null : (() => {
              const targetStatusId = pendingCreateStatusId ?? initialStatusOf(statuses)
              return (
                <div className="space-y-6">
                  {formSections.map((section) => {
                    const secMode = resolveSectionMode(section.id, createSectionLinks)
                    const visibleFields = (fieldsBySection[section.id] ?? [])
                      .filter((f) => f.is_active)
                      .filter((f) => resolveFieldMode(f, targetStatusId, secMode) !== "hidden")
                    if (visibleFields.length === 0) return null
                    return (
                      <div key={section.id} className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
                        <div className="flex items-center gap-2">
                          <span className="h-4 w-1 rounded-full bg-primary" />
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                            {section.title}
                          </p>
                          {secMode === "visible" && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">somente leitura</span>
                          )}
                          {secMode === "required" && (
                            <span className="text-[10px] uppercase tracking-wide text-destructive">obrigatória</span>
                          )}
                        </div>
                        <div className="space-y-3">
                          {groupIntoRows(
                            visibleFields,
                            (f) => getRowBreak(f.validation),
                          ).map((row, rowIdx) => (
                            <div key={rowIdx} className="flex flex-col md:flex-row gap-3">
                              {row.items.map((field) => {
                                const mode = resolveFieldMode(field, targetStatusId, secMode)
                                const isReadOnly = mode === "visible"
                                const isRequired = mode === "required" || (mode === "editable" && field.is_required)
                                const fieldError = createFieldErrors[field.id]
                                return (
                                  <div key={field.id} className="space-y-1 flex-1 min-w-0">
                                    <Label>
                                      {field.label}
                                      {isRequired && <span className="text-destructive ml-0.5">*</span>}
                                      {isReadOnly && (
                                        <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">só leitura</span>
                                      )}
                                    </Label>
                                    <div className={fieldError ? "rounded-md ring-2 ring-destructive/60" : ""}>
                                      <FormFieldRenderer
                                        field={field}
                                        value={formValues[field.field_key]}
                                        onChange={(v) => {
                                          setFormValues((prev) => ({ ...prev, [field.field_key]: v }))
                                          if (createFieldErrors[field.id]) {
                                            setCreateFieldErrors((prev) => {
                                              const next = { ...prev }
                                              delete next[field.id]
                                              return next
                                            })
                                          }
                                        }}
                                        users={users}
                                        disabled={isReadOnly}
                                      />
                                    </div>
                                    {fieldError && (
                                      <p className="text-[11px] text-destructive">{fieldError}</p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>Cancelar</Button>
            <Button type="button" onClick={handleCreateTask} disabled={savingCreate || !selectedDemandTypeId || !newTaskTitle.trim()}>
              {savingCreate && <Loader2 size={13} className="animate-spin mr-1.5" />}
              Criar Demanda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectTaskDrawer
        open={!!selectedTask}
        onOpenChange={(v) => !v && setSelectedTask(null)}
        projectId={projectId}
        task={selectedTask}
        isBasicUser={isBasicUser}
        canEditTask={canEditSelectedTask}
        kanbanFunnelName={selectedFunnelName}
        onSaved={(updated) => {
          setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))
          void reloadTasks()
        }}
        onDeleted={(taskId) => {
          setTasks((prev) => prev.filter((t) => t.id !== taskId))
        }}
      />

      <BacklogClassificationDialog
        open={!!classificationPrompt}
        task={classificationPrompt?.task ?? null}
        mode={classificationPrompt?.mode ?? "backlog_exit"}
        onCancel={() => setClassificationPrompt(null)}
        onConfirm={confirmClassification}
      />

      <Dialog open={!!conversionPrompt} onOpenChange={(v) => { if (!v) setConversionPrompt(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar e criar {conversionPrompt?.typeName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ao aprovar esta etapa, o sistema cria um card do tipo{" "}
              <strong>{conversionPrompt?.typeName}</strong> no kanban de destino.
            </p>

            {/* Tipo: Projeto x Programa — em "Programa" é obrigatório vincular a um programa. */}
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <div className="flex gap-2">
                {(["projeto", "programa"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setConversionPrompt((p) => (p ? { ...p, kind: k } : p))}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                      conversionPrompt?.kind === k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {k === "projeto" ? "Projeto" : "Programa"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Em <strong>Programa</strong>, é obrigatório vincular o card a um programa existente (ou cadastrar um novo).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="conversion-name">Nome do Projeto</Label>
              <Input
                id="conversion-name"
                value={conversionPrompt?.name ?? ""}
                onChange={(e) => setConversionPrompt((p) => (p ? { ...p, name: e.target.value } : p))}
                maxLength={200}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>PO responsável</Label>
              <Select
                value={conversionPrompt?.assignedTo ? conversionPrompt.assignedTo : "__none__"}
                onValueChange={(v) => setConversionPrompt((p) => (p ? { ...p, assignedTo: v === "__none__" ? "" : v } : p))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o PO responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem responsável</SelectItem>
                  {poUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {poUsers.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Nenhum usuário com cargo PO (Product Owner) cadastrado.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="conversion-desc">Descrição</Label>
              <Textarea
                id="conversion-desc"
                value={conversionPrompt?.description ?? ""}
                onChange={(e) => setConversionPrompt((p) => (p ? { ...p, description: e.target.value } : p))}
                rows={3}
              />
            </div>

            {/* Vínculo de programa — obrigatório só no tipo Programa; UI estilo vínculo de produto */}
            {conversionPrompt?.kind === "programa" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Programa</Label>
                <button
                  type="button"
                  onClick={() => setConversionPrompt((p) => (p ? { ...p, programMode: p.programMode === "new" ? "select" : "new" } : p))}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {conversionPrompt?.programMode === "new" ? (<><X size={13} /> Usar existente</>) : (<><Plus size={13} /> Novo programa</>)}
                </button>
              </div>

              {conversionPrompt?.programMode === "select" ? (
                <>
                  <Select
                    value={conversionPrompt?.programId || "__none__"}
                    onValueChange={(v) => setConversionPrompt((p) => (p ? { ...p, programId: v === "__none__" ? "" : v } : p))}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione um programa" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Selecione um programa</SelectItem>
                      {programs.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {programs.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Nenhum programa cadastrado — use “Novo programa”.</p>
                  )}
                </>
              ) : (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="conversion-new-program">Nome do programa</Label>
                    <Input
                      id="conversion-new-program"
                      value={conversionPrompt?.newProgramName ?? ""}
                      onChange={(e) => setConversionPrompt((p) => (p ? { ...p, newProgramName: e.target.value } : p))}
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="conversion-new-program-desc">Descrição do programa</Label>
                    <Textarea
                      id="conversion-new-program-desc"
                      value={conversionPrompt?.newProgramDesc ?? ""}
                      onChange={(e) => setConversionPrompt((p) => (p ? { ...p, newProgramDesc: e.target.value } : p))}
                      rows={2}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    O programa será cadastrado (menu “Programa”) e vinculado a este projeto. O PO acima é herdado.
                  </p>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Obrigatório — vincule este projeto a um programa.</p>
            </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConversionPrompt(null)} disabled={savingConversion}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmConversion()} disabled={savingConversion}>
              {savingConversion && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aprovar e criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

