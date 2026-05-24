import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { GripVertical, Loader2, Plus, Search, GitBranch, ArrowUpRight } from "lucide-react"
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

import { companyApi } from "@/api/crm"
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
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  }
  const assignee = users.find((u) => u.id === task.assigned_to) ?? null
  const isOverdue = task.due_date ? new Date(task.due_date) < new Date(new Date().toDateString()) : false
  const typeName = demandTypeName(task.demand_type_id)
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative rounded-xl border border-border bg-card p-3 cursor-pointer transition hover:border-primary/50 hover:shadow-sm"
      onClick={() => onOpen(task)}
    >
      <button
        type="button"
        className="absolute left-1 top-2 cursor-grab touch-none rounded p-0.5 text-muted-foreground/0 hover:text-foreground active:cursor-grabbing group-hover:text-muted-foreground"
        aria-label="Arrastar para outra etapa"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>

      <div className="flex items-start gap-2 pl-3">
        <p className="text-sm font-semibold text-foreground line-clamp-2 flex-1">{task.title}</p>
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ backgroundColor: colorForUser(assignee?.id ?? null) }}
          title={assignee?.full_name ?? "Sem responsável"}
        >
          {initialsOf(assignee?.full_name)}
        </div>
      </div>

      {(typeName || task.parent_task_id || task.origin_task_id || task.sla_state === "warning" || task.sla_state === "breached") && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-3">
          {typeName && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {typeName}
            </span>
          )}
          {task.sla_state === "warning" && (
            <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning" title="SLA em alerta">
              SLA: alerta
            </span>
          )}
          {task.sla_state === "breached" && (
            <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive" title="SLA estourado">
              SLA: atrasado
            </span>
          )}
          {task.parent_task_id && (
            <span
              className="inline-flex max-w-[170px] items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title={`Filho de: ${parentName(task.parent_task_id) ?? "card pai"}`}
            >
              <GitBranch size={10} className="shrink-0" />
              <span className="truncate">{parentName(task.parent_task_id) ?? "filho"}</span>
            </span>
          )}
          {task.origin_task_id && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-info/10 px-1.5 py-0.5 text-[10px] text-info" title="Criado a partir de uma demanda">
              <ArrowUpRight size={10} /> origem
            </span>
          )}
        </div>
      )}

      {task.due_date && (
        <div
          className={`mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isOverdue
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {new Date(task.due_date).toLocaleDateString("pt-BR")}
        </div>
      )}
    </div>
  )
}

function BoardColumn({
  status,
  tasks,
  users,
  demandTypeName,
  parentName,
  isDragging,
  onOpen,
  onCreate,
}: {
  status: ProjectStatus
  tasks: ProjectTask[]
  users: User[]
  demandTypeName: (id: string | null) => string | null
  parentName: (id: string | null) => string | null
  isDragging: boolean
  onOpen: (task: ProjectTask) => void
  onCreate: (status: ProjectStatus) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status.id}` })
  return (
    <div className="w-80 shrink-0 rounded-2xl bg-muted/30 overflow-hidden">
      <div className="h-1" style={{ backgroundColor: status.color }} />
      <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{status.name}</p>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border bg-background px-1.5 text-[11px] font-medium text-muted-foreground">
            {tasks.length}
          </span>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground transition"
          title="Nova demanda nesta etapa"
          onClick={() => onCreate(status)}
        >
          <Plus size={14} />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[160px] space-y-2 px-2 pb-2 transition-colors ${
          isDragging && isOver ? "bg-primary/10 ring-2 ring-inset ring-primary/40" : ""
        }`}
      >
        {tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground/70 px-2 py-3 text-center italic">Nenhuma demanda</p>
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
      <button
        type="button"
        className="w-full px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 hover:bg-background hover:text-foreground transition"
        onClick={() => onCreate(status)}
      >
        + Nova demanda
      </button>
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
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([])
  const [selectedFunnelId, setSelectedFunnelId] = useState("")
  const [selectedDemandTypeId, setSelectedDemandTypeId] = useState("")
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskDescription, setNewTaskDescription] = useState("")
  const [pendingCreateStatusId, setPendingCreateStatusId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [assigneeFilter, setAssigneeFilter] = useState("__all__")
  const [typeFilter, setTypeFilter] = useState("__all__")
  const [slaFilter, setSlaFilter] = useState("__all__")
  const [createSectionLinks, setCreateSectionLinks] = useState<ProjectStatusSectionLink[]>([])
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({})
  const [conversionPrompt, setConversionPrompt] = useState<{ task: ProjectTask; toStatusId: string; typeName: string; name: string } | null>(null)
  const [savingConversion, setSavingConversion] = useState(false)

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  )
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
  const userRoleName = roles.find((r) => r.id === user?.role_id)?.name?.trim().toLowerCase() ?? ""
  const isBasicUser =
    user?.role === "company_user" &&
    (userRoleName === "basic" || userRoleName === "")

  useEffect(() => {
    Promise.all([
      projetosApi.listProjects(true),
      companyApi.listUsers({ active_only: true }).catch(() => [] as User[]),
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
    if (user?.role !== "company_user" || !user.role_id) return
    companyApi.listRoles().then(setRoles).catch(() => setRoles([]))
  }, [user?.role, user?.role_id])

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
  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null)

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
  const totalTasks = tasks.length

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-4 overflow-hidden">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="text-xl font-bold shrink-0">Kanban</h1>
          {selectedFunnel && (
            <>
              <span className="text-muted-foreground shrink-0">/</span>
              <p className="text-sm font-medium text-muted-foreground truncate min-w-0">{selectedFunnel.name}</p>
            </>
          )}
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground shrink-0">
            {totalTasks}
          </span>
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xl">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar demandas pelo título..."
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos responsáveis</SelectItem>
              <SelectItem value="__none__">Sem responsável</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os tipos</SelectItem>
              {demandTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={slaFilter} onValueChange={setSlaFilter}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="SLA" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos (SLA)</SelectItem>
              <SelectItem value="ok">No prazo</SelectItem>
              <SelectItem value="warning">Em alerta</SelectItem>
              <SelectItem value="breached">Atrasado</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={selectedFunnelId || undefined}
            onValueChange={setSelectedFunnelId}
          >
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Selecionar funil" />
            </SelectTrigger>
            <SelectContent>
              {funnels.map((funnel) => (
                <SelectItem key={funnel.id} value={funnel.id}>{funnel.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="gap-1.5 h-9 shrink-0" onClick={() => setOpenCreate(true)}>
            <Plus size={14} />
            Nova Demanda
          </Button>
        </div>
      </div>

      {statuses.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este funil ainda não possui colunas de kanban.</p>
      ) : (
        <DndContext
          sensors={boardSensors}
          onDragStart={onBoardDragStart}
          onDragEnd={onBoardDragEnd}
        >
          <div className="scrollbar-thin flex flex-1 min-h-0 gap-4 overflow-x-auto pb-3 items-start">
            {statuses.map((status) => {
              const q = searchQuery.trim().toLowerCase()
              const columnTasks = tasks
                .filter((t) => t.status_id === status.id)
                .filter((t) => !q || t.title.toLowerCase().includes(q))
                .filter((t) => assigneeFilter === "__all__"
                  || (assigneeFilter === "__none__" ? !t.assigned_to : t.assigned_to === assigneeFilter))
                .filter((t) => typeFilter === "__all__" || t.demand_type_id === typeFilter)
                .filter((t) => slaFilter === "__all__" || t.sla_state === slaFilter)
                .sort((a, b) => a.order - b.order)
              return (
                <BoardColumn
                  key={status.id}
                  status={status}
                  tasks={columnTasks}
                  users={users}
                  demandTypeName={demandTypeName}
                  parentName={parentName}
                  isDragging={activeDragTaskId !== null}
                  onOpen={(t) => setSelectedTask(t)}
                  onCreate={(s) => { setPendingCreateStatusId(s.id); setOpenCreate(true) }}
                />
              )
            })}
          </div>
        </DndContext>
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

