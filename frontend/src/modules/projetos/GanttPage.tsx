import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  BarChart3, Calendar, CalendarCheck, Check, ChevronDown, Folder, GitBranch, Loader2, Plus, User as UserIcon, X,
} from "lucide-react"

import { companyApi } from "@/api/crm"
import {
  projetosApi,
  type Project, type ProjectDemandType, type ProjectFunnel, type ProjectScheduleBinding,
  type ProjectStatus, type ProjectTask,
} from "@/api/projetos"
import type { User } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { toast } from "@/lib/toast"

const DOW = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"]
const MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function initials(name: string | undefined): string {
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
  const palette = ["#7C3AED", "#008BD2", "#6AB42F", "#E84E0F", "#014898", "#DB2777", "#0F766E", "#64748B"]
  return palette[Math.abs(hash) % palette.length]
}
function dayOnly(iso: string): Date { return new Date(iso.slice(0, 10) + "T00:00:00") }
function isoFromInput(v: string): string | null { return v ? new Date(v + "T00:00:00").toISOString() : null }

export default function GanttPage() {
  const [searchParams] = useSearchParams()
  const rootParam = searchParams.get("root")

  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState("")
  const [funnels, setFunnels] = useState<ProjectFunnel[]>([])
  const [statuses, setStatuses] = useState<ProjectStatus[]>([])
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [demandTypes, setDemandTypes] = useState<ProjectDemandType[]>([])
  const [bindings, setBindings] = useState<ProjectScheduleBinding[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState<"day" | "week">("day")
  const [projOpen, setProjOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectTask | null>(null)

  useEffect(() => {
    async function load() {
      const [ps, dts, us] = await Promise.all([
        projetosApi.listProjects(true),
        projetosApi.listDemandTypes(true).catch(() => [] as ProjectDemandType[]),
        companyApi.listUsers({ active_only: true }).catch(() => [] as User[]),
      ])
      setProjects(ps)
      setDemandTypes(dts)
      setUsers(us)
      // Pré-seleciona o projeto da tarefa vinda do botão "Cronograma" (?root), senão o primeiro.
      let pid = ps[0]?.id ?? ""
      if (rootParam) {
        const allTasks = await Promise.all(ps.map((p) => projetosApi.listTasks(p.id).catch(() => [])))
        const idx = allTasks.findIndex((ts) => ts.some((t) => t.id === rootParam))
        if (idx >= 0) pid = ps[idx].id
      }
      setProjectId(pid)
    }
    load().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!projectId) return
    Promise.all([
      projetosApi.listFunnels(projectId, true),
      projetosApi.listStatuses(projectId, undefined, true),
      projetosApi.listTasks(projectId),
      projetosApi.listScheduleBindings().catch(() => [] as ProjectScheduleBinding[]),
    ]).then(([fs, sts, ts, bs]) => {
      setFunnels([...fs].sort((a, b) => a.order - b.order))
      setStatuses(sts)
      setTasks(ts)
      setBindings(bs)
    })
  }, [projectId])

  async function handleUpdate(id: string, patch: Partial<Pick<ProjectTask, "title" | "start_date" | "due_date" | "assigned_to">>) {
    if (!projectId) return
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    try {
      await projetosApi.updateTask(projectId, id, patch)
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível salvar.")
      const next = await projetosApi.listTasks(projectId)
      setTasks(next)
    }
  }

  const project = projects.find((p) => p.id === projectId) ?? null
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const showTypeIds = useMemo(() => new Set(demandTypes.filter((d) => d.show_in_schedule).map((d) => d.id)), [demandTypes])
  const boundStatusIds = useMemo(() => new Set(bindings.filter((b) => b.is_active).map((b) => b.status_id)), [bindings])

  // Tarefas visíveis: têm início+prazo, tipo aparece no cronograma e estão numa etapa vinculada.
  const visible = useMemo(
    () => tasks.filter((t) =>
      t.start_date && t.due_date &&
      (!t.demand_type_id || showTypeIds.has(t.demand_type_id)) &&
      (boundStatusIds.size === 0 || boundStatusIds.has(t.status_id))),
    [tasks, showTypeIds, boundStatusIds],
  )

  // Janela de dias a partir dos dados (com folga), ou hoje ±7 se vazio.
  const days = useMemo(() => {
    const today = new Date(new Date().toDateString())
    let start = new Date(today); start.setDate(start.getDate() - 7)
    let end = new Date(today); end.setDate(end.getDate() + 21)
    if (visible.length) {
      const starts = visible.map((t) => dayOnly(t.start_date!).getTime())
      const ends = visible.map((t) => dayOnly(t.due_date!).getTime())
      start = new Date(Math.min(...starts)); start.setDate(start.getDate() - 2)
      end = new Date(Math.max(...ends)); end.setDate(end.getDate() + 2)
      const minToday = new Date(today); minToday.setDate(minToday.getDate() - 2)
      if (start > minToday) start = minToday
    }
    const out: Date[] = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(new Date(d))
    return out
  }, [visible])

  const dayPct = 100 / days.length
  const today = new Date(new Date().toDateString())
  const todayIdx = days.findIndex((d) => d.toDateString() === today.toDateString())
  const todayLeft = todayIdx >= 0 ? (todayIdx + 0.5) * dayPct : -1

  const weeks = useMemo(() => {
    const out: { label: string; cols: number }[] = []
    let cur: { key: string; label: string; cols: number } | null = null
    days.forEach((d) => {
      const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = monday.toDateString()
      if (!cur || cur.key !== key) {
        const sun = new Date(monday); sun.setDate(monday.getDate() + 6)
        cur = { key, label: `${MON[monday.getMonth()]} ${monday.getDate()}–${sun.getDate()}`, cols: 0 }
        out.push(cur)
      }
      cur.cols += 1
    })
    return out
  }, [days])

  const swimlanes = useMemo(() => funnels.map((f) => {
    const statusIds = new Set(statuses.filter((s) => s.funnel_id === f.id).map((s) => s.id))
    const rows = visible
      .filter((t) => statusIds.has(t.status_id))
      .map((t) => {
        const s = dayOnly(t.start_date!); const e = dayOnly(t.due_date!)
        let sIdx = days.findIndex((d) => d.toDateString() === s.toDateString())
        let eIdx = days.findIndex((d) => d.toDateString() === e.toDateString())
        if (sIdx === -1) sIdx = s < days[0] ? 0 : days.length - 1
        if (eIdx === -1) eIdx = e > days[days.length - 1] ? days.length - 1 : 0
        return { task: t, sIdx, eIdx }
      })
    return { funnel: f, rows }
  }), [funnels, statuses, visible, days])

  function barColor(t: ProjectTask): string {
    if (t.completed_at) return "var(--af-success)"
    if (t.sla_state === "breached") return "var(--af-destructive)"
    if (t.sla_state === "warning") return "var(--af-warning)"
    return "var(--af-primary)"
  }

  if (loading) return <div className="p-1"><Skeleton className="h-96 rounded-lg" /></div>

  const isEmpty = swimlanes.every((s) => s.rows.length === 0)

  return (
    <div className="afx w-full">
      {projOpen && <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setProjOpen(false)} />}

      <div className="gantt-toolbar" style={{ position: "relative", zIndex: 25 }}>
        <div className="title">
          <h1>Gantt</h1>
          <span className="slash">/</span>
          <span className="project-name">{project?.name}</span>
          <span className="count-pill">{visible.length}</span>
        </div>

        <div className="relative" style={{ marginLeft: 8 }}>
          <button className="filter-btn" onClick={() => setProjOpen((o) => !o)}>
            <Folder size={13} /><span>{project?.name ?? "Selecionar projeto"}</span><ChevronDown size={12} />
          </button>
          {projOpen && (
            <div className="dd-menu">
              <div className="dd-head">Filtrar por projeto</div>
              {projects.map((p) => (
                <div key={p.id} className="dd-item" onClick={() => { setProjectId(p.id); setProjOpen(false) }}>
                  <Folder size={13} style={{ color: "var(--af-muted-fg)" }} />
                  <span style={{ flex: 1 }}>{p.name}</span>
                  {projectId === p.id && <Check size={13} style={{ color: "var(--af-primary)" }} />}
                </div>
              ))}
            </div>
          )}
        </div>

        <span className="spacer" />

        <div className="scale-toggle">
          <button className={scale === "day" ? "on" : ""} onClick={() => setScale("day")}>Dia</button>
          <button className={scale === "week" ? "on" : ""} onClick={() => setScale("week")}>Semana</button>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={BarChart3}
          title="Nenhuma demanda com prazo neste projeto"
          description="Adicione data de início e prazo às demandas (e configure os vínculos do cronograma) para visualizá-las aqui."
        />
      ) : (
        <div className="gantt">
          {/* Week strip */}
          <div className="gantt-row-grid">
            <div className="gantt-head-cell">Demanda</div>
            <div className="gantt-head-cell right">
              <div className="gantt-weeks">
                {weeks.map((w, i) => <div key={i} className="gantt-week" style={{ flex: w.cols }}>{w.label}</div>)}
              </div>
            </div>
          </div>
          {/* Day strip */}
          <div className="gantt-row-grid">
            <div className="gantt-head-cell" style={{ color: "var(--af-muted-fg)", fontWeight: 500 }}>
              {visible.length} demanda{visible.length !== 1 ? "s" : ""}
            </div>
            <div className="gantt-head-cell right">
              <div className="gantt-days">
                {days.map((d, i) => {
                  const weekend = d.getDay() === 0 || d.getDay() === 6
                  const isToday = d.toDateString() === today.toDateString()
                  return (
                    <div key={i} className={`gantt-day ${weekend ? "weekend" : ""} ${isToday ? "today" : ""}`}>
                      <div className="dow">{DOW[d.getDay()]}</div>
                      <div className="num">{d.getDate()}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {swimlanes.map((sw) => (
            <div key={sw.funnel.id}>
              <div className="gantt-group-row">
                <div className="label">
                  <GitBranch size={13} style={{ color: "var(--af-muted-fg)" }} />
                  <span>{sw.funnel.name}</span>
                  <span className="count">{sw.rows.length}</span>
                </div>
                <div className="right" />
              </div>
              {sw.rows.map((bar) => {
                const left = bar.sIdx * dayPct
                const width = Math.max(dayPct * 0.9, (bar.eIdx - bar.sIdx + 1) * dayPct)
                const color = barColor(bar.task)
                const assignee = users.find((u) => u.id === bar.task.assigned_to) ?? null
                return (
                  <div key={bar.task.id} className="gantt-task-row">
                    <div className="label">
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                      <span className="text" style={{ cursor: "pointer" }} title="Clique para editar" onClick={() => setEditing(bar.task)}>
                        {bar.task.title}
                      </span>
                      <span className="assignee-avatar" style={{ background: colorForUser(assignee?.id ?? null), width: 20, height: 20, fontSize: 9 }}>
                        {assignee ? initials(assignee.full_name) : "?"}
                      </span>
                    </div>
                    <div className="gantt-track" style={{ minHeight: 44 }}>
                      {days.map((d, i) => {
                        const weekend = d.getDay() === 0 || d.getDay() === 6
                        return <div key={i} className={`cell ${weekend ? "weekend" : ""}`} />
                      })}
                      {todayLeft >= 0 && <div className="gantt-today-line" style={{ left: todayLeft + "%" }} />}
                      <div className="gantt-bar" style={{ left: left + "%", width: width + "%", background: color }} onClick={() => setEditing(bar.task)}>
                        <span className="bar-title">{bar.task.title}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <GanttEditModal
          task={editing}
          statusName={statusById.get(editing.status_id)?.name ?? null}
          users={users}
          onClose={() => setEditing(null)}
          onSave={async (patch) => { await handleUpdate(editing.id, patch); setEditing(null) }}
        />
      )}
    </div>
  )
}

function GanttEditModal({
  task,
  statusName,
  users,
  onClose,
  onSave,
}: {
  task: ProjectTask
  statusName: string | null
  users: User[]
  onClose: () => void
  onSave: (patch: Partial<Pick<ProjectTask, "title" | "start_date" | "due_date" | "assigned_to">>) => Promise<void>
}) {
  const [title, setTitle] = useState(task.title)
  const [start, setStart] = useState(task.start_date ? task.start_date.slice(0, 10) : "")
  const [due, setDue] = useState(task.due_date ? task.due_date.slice(0, 10) : "")
  const [assignee, setAssignee] = useState(task.assigned_to ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const inverted = !!(start && due && start > due)

  return (
    <div className="afx af-modal-overlay" onClick={onClose}>
      <div className="af-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h2>Editar demanda</h2>
            <div className="crumb">{statusName ?? "—"}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="form-field">
            <label className="form-label">Título</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label className="form-label"><Calendar size={12} /> Início</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label"><CalendarCheck size={12} /> Vencimento</label>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          {inverted && <div className="form-hint" style={{ color: "var(--af-destructive)" }}>⚠ Início é posterior ao vencimento.</div>}
          <div className="form-field">
            <label className="form-label"><UserIcon size={12} /> Responsável</label>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">— Sem responsável —</option>
              {users.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <span className="spacer" />
          <button
            className="btn primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              await onSave({
                title: title.trim() || task.title,
                start_date: isoFromInput(start),
                due_date: isoFromInput(due),
                assigned_to: assignee || null,
              })
              setSaving(false)
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
