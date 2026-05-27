import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { ArrowUpRight, BarChart3, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, GitBranch, KanbanSquare, List as ListIcon, Loader2, Plus, Search, X } from "lucide-react"
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

import { teamopsApi } from "@/api/teamops"
import { projetosApi, type Project, type ProjectDemandFormField, type ProjectDemandFormSection, type ProjectDemandType, type ProjectFunnel, type ProjectStatus, type ProjectStatusSectionLink, type ProjectTask } from "@/api/projetos"
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
import { FormFieldRenderer, applyAutoFillCurrentFields } from "@/modules/projetos/FormFieldRenderer"
import { formatMissingFieldsMessage, resolveFieldMode, resolveSectionMode, validateRequiredFields } from "@/modules/projetos/validation"
import { getRowBreak, groupIntoRows } from "@/modules/projetos/layout"
import { toast } from "@/lib/toast"

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

// Filtros do board persistidos entre navegações (limpos só pelo botão "Limpar").
const FILTERS_KEY = "projetos.board.filters"
type BoardFilters = { q?: string; assignees?: string[]; types?: string[]; slas?: string[] }
function loadFilters(): BoardFilters {
  try {
    return JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}") as BoardFilters
  } catch {
    return {}
  }
}

type BoardFilterState = { q: string; assignees: string[]; types: string[]; slas: string[] }

// Filtro compartilhado pelas visões (board, lista, calendário).
function taskMatches(t: ProjectTask, f: BoardFilterState): boolean {
  const q = f.q.trim().toLowerCase()
  if (q && !t.title.toLowerCase().includes(q)) return false
  if (f.assignees.length && !f.assignees.includes(t.assigned_to ?? "__none__")) return false
  if (f.types.length && !(t.demand_type_id ? f.types.includes(t.demand_type_id) : false)) return false
  if (f.slas.length && !f.slas.includes(t.sla_state)) return false
  return true
}

function SlaChip({ state }: { state: ProjectTask["sla_state"] }) {
  if (state === "warning") return <span className="chip warning">SLA: alerta</span>
  if (state === "breached") return <span className="chip destructive">SLA: atrasado</span>
  return null
}

// ─────────── Task card (estilo do protótipo) ───────────
function BoardCard({
  task,
  users,
  demandTypeName,
  parentName,
  onOpen,
}: {
  task: ProjectTask
  users: User[]
  demandTypeName: (id: string | null) => string | null
  parentName: (id: string | null) => string | null
  onOpen: (task: ProjectTask) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `task-${task.id}` })
  const style = { transform: CSS.Translate.toString(transform) }
  const assignee = users.find((u) => u.id === task.assigned_to) ?? null
  const isOverdue = task.due_date && !task.completed_at
    ? new Date(task.due_date) < new Date(new Date().toDateString())
    : false
  const typeName = demandTypeName(task.demand_type_id)
  const parent = task.parent_task_id ? parentName(task.parent_task_id) : null
  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`task-card ${isDragging ? "dragging" : ""}`}
      onClick={() => onOpen(task)}
      {...attributes}
      {...listeners}
    >
      {(typeName || task.completed_at || task.sla_state === "warning" || task.sla_state === "breached") && (
        <div className="top-row">
          {typeName && <span className="chip">{typeName}</span>}
          <SlaChip state={task.sla_state} />
          {task.completed_at && (
            <span className="chip success"><Check size={10} /> Concluída</span>
          )}
          <span className="task-id">{task.id.slice(0, 8).toUpperCase()}</span>
        </div>
      )}
      {!typeName && !task.completed_at && task.sla_state !== "warning" && task.sla_state !== "breached" && (
        <div className="top-row">
          <span className="task-id">{task.id.slice(0, 8).toUpperCase()}</span>
        </div>
      )}

      <h4 className="title">{task.title}</h4>

      {(parent || task.origin_task_id) && (
        <div className="meta-chips">
          {parent && (
            <span className="chip muted"><GitBranch size={10} />
              <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{parent}</span>
            </span>
          )}
          {task.origin_task_id && <span className="chip info"><ArrowUpRight size={10} /> origem</span>}
        </div>
      )}

      <div className="meta-row">
        {task.due_date && (
          <span className={`due-pill ${isOverdue ? "overdue" : ""}`}>
            <span className="dot" />
            {new Date(task.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          </span>
        )}
        <span className="spacer" />
        <span
          className="assignee-avatar"
          style={{ background: colorForUser(assignee?.id ?? null), width: 22, height: 22, fontSize: 9 }}
          title={assignee?.full_name ?? "Sem responsável"}
        >
          {assignee ? initialsOf(assignee.full_name) : "?"}
        </span>
      </div>
    </article>
  )
}

// ─────────── Column (estilo do protótipo) ───────────
function BoardColumn({
  status,
  tasks,
  users,
  demandTypeName,
  parentName,
  onOpen,
  onCreate,
}: {
  status: ProjectStatus
  tasks: ProjectTask[]
  users: User[]
  demandTypeName: (id: string | null) => string | null
  parentName: (id: string | null) => string | null
  onOpen: (task: ProjectTask) => void
  onCreate: (status: ProjectStatus) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status.id}` })
  return (
    <section className={`column ${isOver ? "drag-over" : ""}`}>
      <div className="col-bar" style={{ background: status.color }} />
      <header className="column-head">
        <div className="left">
          <h3>{status.name}</h3>
          <span className="col-count">{tasks.length}</span>
        </div>
        <button className="col-plus" title="Nova demanda nesta etapa" onClick={() => onCreate(status)}>
          <Plus size={13} />
        </button>
      </header>
      <div ref={setNodeRef} className="col-body">
        {tasks.length === 0 ? (
          <div className="col-empty">Nenhuma demanda</div>
        ) : tasks.map((task) => (
          <BoardCard
            key={task.id}
            task={task}
            users={users}
            demandTypeName={demandTypeName}
            parentName={parentName}
            onOpen={onOpen}
          />
        ))}
      </div>
      <div className="col-foot">
        <button onClick={() => onCreate(status)}>+ Nova demanda</button>
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
  users,
  demandTypeName,
  onOpen,
}: {
  statuses: ProjectStatus[]
  tasks: ProjectTask[]
  users: User[]
  demandTypeName: (id: string | null) => string | null
  onOpen: (task: ProjectTask) => void
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
        <span>SLA</span>
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
              const a = users.find((u) => u.id === t.assigned_to) ?? null
              const due = t.due_date ? new Date(t.due_date) : null
              const overdue = due && !t.completed_at ? due < today : false
              const typeName = demandTypeName(t.demand_type_id)
              return (
                <div key={t.id} className="list-row task" onClick={() => onOpen(t)}>
                  <span />
                  <div className="col-title">
                    <span className="text">{t.title}</span>
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
                  <span><SlaChip state={t.sla_state} /></span>
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
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  selectedCount: number
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <button className={`filter-btn ${selectedCount ? "active" : ""}`} onClick={onToggle}>
        <span>{label}</span>
        {selectedCount > 0 && <span className="filter-count">{selectedCount}</span>}
        <ChevronDown size={12} />
      </button>
      {open && <div className="dd-menu">{children}</div>}
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
  const { projectId } = useParams<{ projectId: string }>()
  const [projects, setProjects] = useState<Project[]>([])
  const [funnels, setFunnels] = useState<ProjectFunnel[]>([])
  const [statuses, setStatuses] = useState<ProjectStatus[]>([])
  const [demandTypes, setDemandTypes] = useState<ProjectDemandType[]>([])
  const [formSections, setFormSections] = useState<ProjectDemandFormSection[]>([])
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, ProjectDemandFormField[]>>({})
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [users, setUsers] = useState<User[]>([])
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
  const [searchQuery, setSearchQuery] = useState<string>(() => loadFilters().q ?? "")
  const [assignees, setAssignees] = useState<string[]>(() => loadFilters().assignees ?? [])
  const [types, setTypes] = useState<string[]>(() => loadFilters().types ?? [])
  const [slas, setSlas] = useState<string[]>(() => loadFilters().slas ?? [])
  const [view, setView] = useState<BoardView>(() => resolveViewFromPath(location.pathname))
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  function toggleMulti(setter: React.Dispatch<React.SetStateAction<string[]>>, current: string[], val: string) {
    setter(current.includes(val) ? current.filter((x) => x !== val) : [...current, val])
  }

  // Persiste os filtros (continuam ao trocar de página; só o botão "Limpar" zera).
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({ q: searchQuery, assignees, types, slas }))
    } catch { /* ignore */ }
  }, [searchQuery, assignees, types, slas])

  function clearFilters() {
    setSearchQuery("")
    setAssignees([])
    setTypes([])
    setSlas([])
  }
  const [createSectionLinks, setCreateSectionLinks] = useState<ProjectStatusSectionLink[]>([])
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({})
  const [conversionPrompt, setConversionPrompt] = useState<{ task: ProjectTask; toStatusId: string; typeName: string; name: string } | null>(null)
  const [savingConversion, setSavingConversion] = useState(false)

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
  const userRoleName = (user?.role_name ?? "").trim().toLowerCase()
  const isBasicUser =
    user?.role === "company_user" &&
    (userRoleName === "basic" || userRoleName === "")

  useEffect(() => {
    setView(resolveViewFromPath(location.pathname))
  }, [location.pathname])

  useEffect(() => {
    Promise.all([
      projetosApi.listProjects(true),
      teamopsApi.listMembers()
        .then((ms) => ms.map((m) => ({ id: m.id, full_name: m.full_name, email: m.email })) as unknown as User[])
        .catch(() => [] as User[]),
      projetosApi.listDemandTypes(true).catch(() => [] as ProjectDemandType[]),
    ])
      .then(([ps, us, dts]) => {
        setProjects(ps)
        setUsers(us)
        setDemandTypes(dts)
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
    Promise.all([
      projetosApi.listFunnels(projectId, true),
      projetosApi.listTasks(projectId),
    ]).then(([fs, ts]) => {
      const orderedFunnels = [...fs].sort((a, b) => a.order - b.order)
      setFunnels(orderedFunnels)
      setTasks(ts)
      const defaultFunnel = orderedFunnels.find((f) => f.is_default) ?? orderedFunnels[0]
      setSelectedFunnelId(defaultFunnel?.id ?? "")
    })
  }, [projectId])

  useEffect(() => {
    if (!projectId || !selectedFunnelId) return
    projetosApi.listStatuses(projectId, selectedFunnelId, true).then((ss) => {
      setStatuses([...ss].sort((a, b) => a.order - b.order))
    })
  }, [projectId, selectedFunnelId])

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

  async function handleMove(task: ProjectTask, toStatusId: string) {
    if (!projectId || task.status_id === toStatusId) return
    const fromStatus = statuses.find((s) => s.id === task.status_id)
    const toStatus = statuses.find((s) => s.id === toStatusId)
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
    if (toStatus?.creates_demand_type_id) {
      const typeName = demandTypes.find((d) => d.id === toStatus.creates_demand_type_id)?.name ?? "Projeto"
      setConversionPrompt({ task, toStatusId, typeName, name: stripProjectPrefix(task.title) })
      return
    }
    await performMove(task, toStatusId)
  }

  async function performMove(task: ProjectTask, toStatusId: string, conversionTitle?: string) {
    if (!projectId) return
    try {
      const payload: Parameters<typeof projetosApi.updateTask>[2] = { status_id: toStatusId }
      if (conversionTitle !== undefined) payload.conversion_title = conversionTitle
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
    setSavingConversion(true)
    try {
      await performMove(conversionPrompt.task, conversionPrompt.toStatusId, name)
      setConversionPrompt(null)
    } finally {
      setSavingConversion(false)
    }
  }

  function initialStatusOf(list: ProjectStatus[]): string {
    const initial = list.find((s) => s.is_initial) ?? list[0]
    return initial?.id ?? ""
  }

  async function handleCreateTask() {
    if (!projectId || !selectedDemandTypeId || !newTaskTitle.trim()) return
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
  const filterState: BoardFilterState = { q: searchQuery, assignees, types, slas }
  const funnelTasks = tasks.filter((t) => taskMatches(t, filterState))
  const hasFilters = !!(searchQuery.trim() || assignees.length || types.length || slas.length)

  return (
    <div className="afx flex h-full min-h-0 w-full min-w-0 flex-col gap-4 overflow-hidden">
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
          navigate(nextPath)
        }}
        onGantt={() => navigate(`${projectRouteBase}/gantt`)}
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
          {[{ id: "__none__", full_name: "Sem responsável" }, ...users].map((m) => {
            const checked = assignees.includes(m.id)
            return (
              <div key={m.id} className="dd-item" onClick={() => toggleMulti(setAssignees, assignees, m.id)}>
                <span className={`check ${checked ? "checked" : ""}`}>{checked && <Check size={11} />}</span>
                <span>{m.full_name}</span>
              </div>
            )
          })}
        </FilterDropdown>

        <FilterDropdown label="Tipo" open={openMenu === "type"} onToggle={() => setOpenMenu(openMenu === "type" ? null : "type")} selectedCount={types.length}>
          <div className="dd-head">Tipo de demanda</div>
          {demandTypes.map((t) => {
            const checked = types.includes(t.id)
            return (
              <div key={t.id} className="dd-item" onClick={() => toggleMulti(setTypes, types, t.id)}>
                <span className={`check ${checked ? "checked" : ""}`}>{checked && <Check size={11} />}</span>
                <span>{t.name}</span>
              </div>
            )
          })}
        </FilterDropdown>

        <FilterDropdown label="SLA" open={openMenu === "sla"} onToggle={() => setOpenMenu(openMenu === "sla" ? null : "sla")} selectedCount={slas.length}>
          <div className="dd-head">SLA</div>
          {[{ id: "ok", label: "No prazo" }, { id: "warning", label: "Em alerta" }, { id: "breached", label: "Atrasado" }, { id: "none", label: "Sem SLA" }].map((o) => {
            const checked = slas.includes(o.id)
            return (
              <div key={o.id} className="dd-item" onClick={() => toggleMulti(setSlas, slas, o.id)}>
                <span className={`check ${checked ? "checked" : ""}`}>{checked && <Check size={11} />}</span>
                <span>{o.label}</span>
              </div>
            )
          })}
        </FilterDropdown>

        <div className="relative">
          <button className="filter-btn" onClick={() => setOpenMenu(openMenu === "funnel" ? null : "funnel")}>
            <GitBranch size={12} /><span>{selectedFunnel?.name ?? "Selecionar funil"}</span><ChevronDown size={12} />
          </button>
          {openMenu === "funnel" && (
            <div className="dd-menu">
              <div className="dd-head">Kanbans deste projeto</div>
              {funnels.map((f) => (
                <div key={f.id} className="dd-item" onClick={() => { setSelectedFunnelId(f.id); setOpenMenu(null) }}>
                  {selectedFunnelId === f.id
                    ? <Check size={13} style={{ color: "var(--af-primary)" }} />
                    : <GitBranch size={13} style={{ color: "var(--af-muted-fg)" }} />}
                  <span>{f.name}</span>
                  {f.is_default && <span className="chip muted" style={{ marginLeft: "auto" }}>Padrão</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {hasFilters && (<button className="btn ghost" onClick={clearFilters}><X size={14} /> Limpar</button>)}
        <button className="btn primary icon" onClick={() => setOpenCreate(true)} title="Nova demanda"><Plus size={16} /></button>
      </div>

      {view === "board" && (
        statuses.length === 0 ? (
          <div className="empty-state">
            <div className="icon-wrap"><KanbanSquare size={24} /></div>
            <h3>Sem colunas</h3>
            <p>Este funil ainda não possui colunas de kanban.</p>
          </div>
        ) : (
          <DndContext sensors={boardSensors} onDragStart={onBoardDragStart} onDragEnd={onBoardDragEnd}>
            <div className="board scrollbar-thin" style={{ flex: 1, minHeight: 0, overflowX: "auto" }}>
              {statuses.map((status) => {
                const columnTasks = funnelTasks
                  .filter((t) => t.status_id === status.id)
                  .sort((a, b) => a.order - b.order)
                return (
                  <BoardColumn
                    key={status.id}
                    status={status}
                    tasks={columnTasks}
                    users={users}
                    demandTypeName={demandTypeName}
                    parentName={parentName}
                    onOpen={(t) => setSelectedTask(t)}
                    onCreate={(s) => { setPendingCreateStatusId(s.id); setOpenCreate(true) }}
                  />
                )
              })}
              <button className="btn ghost" style={{ flexShrink: 0, alignSelf: "flex-start", marginTop: 8 }}>
                <Plus size={14} /> Nova coluna
              </button>
            </div>
          </DndContext>
        )
      )}

      {view === "list" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <ListView statuses={statuses} tasks={funnelTasks} users={users} demandTypeName={demandTypeName} onOpen={(t) => setSelectedTask(t)} />
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
        onSaved={(updated) => {
          setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))
          void reloadTasks()
        }}
        onDeleted={(taskId) => {
          setTasks((prev) => prev.filter((t) => t.id !== taskId))
        }}
      />

      <Dialog open={!!conversionPrompt} onOpenChange={(v) => { if (!v) setConversionPrompt(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar e criar {conversionPrompt?.typeName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ao aprovar esta etapa, o sistema cria um card do tipo{" "}
              <strong>{conversionPrompt?.typeName}</strong> no kanban de destino. Confirme o nome:
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="conversion-name">Nome do {conversionPrompt?.typeName}</Label>
              <Input
                id="conversion-name"
                value={conversionPrompt?.name ?? ""}
                onChange={(e) => setConversionPrompt((p) => (p ? { ...p, name: e.target.value } : p))}
                onKeyDown={(e) => { if (e.key === "Enter") void confirmConversion() }}
                maxLength={200}
                autoFocus
              />
            </div>
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

