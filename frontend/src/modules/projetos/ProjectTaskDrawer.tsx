import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowUpRight, CalendarRange, Check, ChevronDown, Clock, FileText, GitBranch, Link as LinkIcon, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import { formatApiDateTime } from "@/lib/utils"

import { projetosApi, STATUS_HISTORY_SOURCE_LABELS, type CardClassification, type PriorityMode, type ProjectDemandFormField, type ProjectDemandFormSection, type ProjectDemandType, type ProjectFunnel, type ProjectStatus, type ProjectStatusDefaultFormLink, type ProjectStatusSectionLink, type ProjectTask, type ProjectTaskComment, type ProjectTaskStatusHistory, type ProjectUpload, type ScheduleLockState, type UsChecklistItem } from "@/api/projetos"
import { ScheduleLockBanner } from "@/modules/projetos/ScheduleLockBanner"
import { produtosApi } from "@/api/produtos"
import { Badge } from "@/components/ui/badge"
import { teamopsApi } from "@/api/teamops"
import type { User } from "@/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormFieldRenderer, getFieldVisibility, normalizeFieldType, type FieldVisibilityMode } from "@/modules/projetos/FormFieldRenderer"
import { DefaultFormFieldSlot } from "@/modules/projetos/DefaultFormFields"
import { defaultFormPlanningFields, groupDefaultFormFieldsIntoRows } from "@/modules/projetos/defaultFormLayout"
import { defaultFieldMap, validateDefaultFormValues, type DefaultFormValues } from "@/modules/projetos/defaultFormUtils"
import { isDefaultFieldShown } from "@/modules/projetos/defaultFormVisibility"
import { defaultDateToIso, isoToDefaultDateInput, normalizeDefaultFieldType } from "@/modules/projetos/defaultFormFieldTypes"
import { useDefaultFormConfig } from "@/modules/projetos/useDefaultFormConfig"
import { getRowBreak, groupIntoRows } from "@/modules/projetos/layout"
import { formatMissingFieldsMessage, validateRequiredFields } from "@/modules/projetos/validation"
import { BacklogClassificationDialog } from "@/modules/projetos/BacklogClassificationDialog"
import { ProjectPriorityWidget } from "@/modules/projetos/priority/ProjectPriorityWidget"
import { CommentBody, CommentComposer, commentHasContent } from "@/modules/projetos/CommentComposer"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "@/lib/toast"
import { UsChecklistSection } from "@/modules/projetos/UsChecklistSection"
import { UsCommitsSection } from "@/modules/projetos/UsCommitsSection"
import { fmtEstimatedHours, isFeatureOrUsKanbanFunnel, isPlanningRootTask, isProjectOrProgramKanbanFunnel, isUserStoryDemandType, isUserStoryKanbanFunnel } from "@/modules/projetos/kanbanDisplay"

const NO_ASSIGNEE = "__none__"
const EMPTY_US_CHECKLIST: UsChecklistItem[] = []

const CLASSIFICATION_LABELS: Record<CardClassification, string> = {
  desenvolvimento: "Desenvolvimento",
  implantacao: "Implantação",
  melhoria: "Melhoria",
}

function ClassificationReadonlyField({
  label,
  value,
  href,
  onOpen,
}: {
  label: string
  value: string | null
  href?: string | null
  onOpen?: (href: string) => void
}) {
  const canOpen = !!href && !!value
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex items-center gap-1 rounded-md border bg-muted/30 pl-3 pr-1 py-1 text-sm text-foreground">
        <span className="min-w-0 flex-1 truncate py-1">{value ?? "—"}</span>
        {canOpen && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
            title={`Abrir ${label.toLowerCase()}`}
            onClick={() => onOpen?.(href!)}
          >
            <ArrowUpRight size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return "?"
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

export function ProjectTaskDrawer({
  open,
  onOpenChange,
  projectId,
  task,
  isBasicUser,
  canEditTask = true,
  kanbanFunnelName = null,
  onSaved,
  onDeleted,
  onOpenTask,
  boardTasks,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  task: ProjectTask | null
  isBasicUser: boolean
  /** false = somente leitura (funil view sem permissão na etapa). */
  canEditTask?: boolean
  /** Funil de origem no quadro (Feature/US → horas no lugar do ícone de cronograma). */
  kanbanFunnelName?: string | null
  onSaved: (task: ProjectTask) => void
  onDeleted: (taskId: string) => void
  /** Abre outro card do mesmo processo (atalho contratação). */
  onOpenTask?: (taskId: string) => void
  /** Lista de cards que o chamador já tem em memória. Quando vem preenchida, o drawer
   *  NÃO rebaixa a lista do projeto — abrir um card custava outro download completo
   *  (~2,8 MB no portfólio medido) só para resolver pai/origem/convertidos. */
  boardTasks?: ProjectTask[]
}) {
  const readOnly = isBasicUser || !canEditTask
  const showEstimatedHoursHeader = isFeatureOrUsKanbanFunnel(kanbanFunnelName)
  const navigate = useNavigate()
  const { user: authUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  // Rótulos do vínculo com o portfólio de Produtos (resolução tolerante a falha).
  const [linkedProductName, setLinkedProductName] = useState<string | null>(null)
  const [linkedReleaseVersao, setLinkedReleaseVersao] = useState<string | null>(null)
  const [comments, setComments] = useState<ProjectTaskComment[]>([])
  const [statusHistory, setStatusHistory] = useState<ProjectTaskStatusHistory[]>([])
  const [selectedDemandTypeId, setSelectedDemandTypeId] = useState("")
  const [formSections, setFormSections] = useState<ProjectDemandFormSection[]>([])
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, ProjectDemandFormField[]>>({})
  const [sectionLinks, setSectionLinks] = useState<ProjectStatusSectionLink[]>([])
  const [defaultFormLinks, setDefaultFormLinks] = useState<ProjectStatusDefaultFormLink[]>([])
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [anexos, setAnexos] = useState<ProjectUpload[]>([])
  const [assignedTo, setAssignedTo] = useState<string>(NO_ASSIGNEE)
  const [startDate, setStartDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [scheduleLock, setScheduleLock] = useState<ScheduleLockState | null>(null)
  const [diretoria, setDiretoria] = useState<string | null>(null)
  const [area, setArea] = useState<string | null>(null)
  const [parentTaskId, setParentTaskId] = useState<string>(NO_ASSIGNEE)
  const [demandTypes, setDemandTypes] = useState<ProjectDemandType[]>([])
  const [fetchedTasks, setFetchedTasks] = useState<ProjectTask[]>([])
  // Prefere a lista que o board já tem; só busca quando o chamador não passou nada.
  const allTasks = boardTasks ?? fetchedTasks
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([])
  // Editor de classificação Projeto/Programa (propaga ao card convertido).
  const [planningEditOpen, setPlanningEditOpen] = useState(false)
  const [planningKindDraft, setPlanningKindDraft] = useState<"projeto" | "programa">("projeto")
  const [planningProgramMode, setPlanningProgramMode] = useState<"select" | "new">("select")
  const [planningProgramId, setPlanningProgramId] = useState("")
  const [planningNewProgramName, setPlanningNewProgramName] = useState("")
  const [planningNewProgramDesc, setPlanningNewProgramDesc] = useState("")
  const [savingPlanning, setSavingPlanning] = useState(false)
  const [children, setChildren] = useState<ProjectTask[]>([])
  const [childTitle, setChildTitle] = useState("")
  const [childTypeId, setChildTypeId] = useState("")
  const [statusMap, setStatusMap] = useState<Record<string, { name: string; color: string; priority_mode: PriorityMode }>>({})
  const [allStatuses, setAllStatuses] = useState<ProjectStatus[]>([])
  const [funnels, setFunnels] = useState<ProjectFunnel[]>([])
  const [statusId, setStatusId] = useState("")
  const [changingStatus, setChangingStatus] = useState(false)
  const [classifyOpen, setClassifyOpen] = useState(false)
  const [statusConvPrompt, setStatusConvPrompt] = useState<{ newStatusId: string; typeName: string; name: string } | null>(null)
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false)
  const [assigneeSearch, setAssigneeSearch] = useState("")
  const [savingChecklist, setSavingChecklist] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [linkMenuOpen, setLinkMenuOpen] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkMode, setLinkMode] = useState<"existing" | "new">("existing")
  const [linkType, setLinkType] = useState<"child" | "parent">("child")
  const [linkSearch, setLinkSearch] = useState("")
  const [linkSelectedId, setLinkSelectedId] = useState("")
  const [savingLink, setSavingLink] = useState(false)
  const [newComment, setNewComment] = useState("")
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [sendingComment, setSendingComment] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const { fields: defaultFormFields } = useDefaultFormConfig()
  const defaultFieldsByKey = defaultFieldMap(defaultFormFields)

  useEffect(() => {
    if (!open || !task) return
    setFieldErrors({})
    setChildTitle("")
    setChildTypeId("")
    setLinkMenuOpen(false)
    setLinkDialogOpen(false)
    setStatusConvPrompt(null)
    setAssigneeMenuOpen(false)
    setAssigneeSearch("")
    setStatusMenuOpen(false)
    const cfg = defaultFieldMap(defaultFormFields)
    const timer = setTimeout(() => {
      setTitle(task.title)
      setDescription(task.description ?? "")
      setAnexos(task.anexos ?? [])
      setAssignedTo(task.assigned_to ?? NO_ASSIGNEE)
      setDiretoria(task.diretoria ?? null)
      setArea(task.area ?? null)
      const startType = normalizeDefaultFieldType("start_date", cfg.get("start_date")?.field_type)
      const dueType = normalizeDefaultFieldType("due_date", cfg.get("due_date")?.field_type)
      setStartDate(isoToDefaultDateInput(startType, task.start_date))
      setDueDate(isoToDefaultDateInput(dueType, task.due_date))
      setSelectedDemandTypeId(task.demand_type_id ?? "")
      setParentTaskId(task.parent_task_id ?? NO_ASSIGNEE)
      setStatusId(task.status_id)
    }, 0)

    // Vínculo com o portfólio de Produtos — resolução tolerante (módulo pode estar inativo).
    setLinkedProductName(null)
    setLinkedReleaseVersao(null)
    if (task.linked_product_id) {
      const productId = task.linked_product_id
      const releaseId = task.linked_release_id
      produtosApi.getProduct(productId)
        .then((p) => setLinkedProductName(p.name))
        .catch(() => setLinkedProductName(`Produto #${productId.slice(0, 8)}`))
      if (releaseId) {
        produtosApi.listReleases(productId)
          .then((rs) => {
            const r = rs.find((x) => x.id === releaseId)
            setLinkedReleaseVersao(r ? (r.nome ? `${r.versao} · ${r.nome}` : r.versao) : `Release #${releaseId.slice(0, 8)}`)
          })
          .catch(() => setLinkedReleaseVersao(`Release #${releaseId.slice(0, 8)}`))
      }
    }

    // Responsável = Pessoa do teamops (todas, inclusive sem login).
    teamopsApi.listPersons()
      .then((ps) => setUsers(ps.map((p) => ({ id: p.id, full_name: p.full_name, email: p.email })) as unknown as User[]))
      .catch(() => setUsers([]))
    projetosApi.listTaskComments(projectId, task.id).then(setComments).catch(() => setComments([]))
    projetosApi.listTaskStatusHistory(projectId, task.id).then(setStatusHistory).catch(() => setStatusHistory([]))
    projetosApi.getTaskFormSubmission(projectId, task.id).then((submission) => {
      setFormValues({ ...(task.procurement_meta ?? {}), ...(submission?.values ?? {}) })
    }).catch(() => setFormValues({ ...(task.procurement_meta ?? {}) }))
    projetosApi.listDemandTypes().then(setDemandTypes).catch(() => setDemandTypes([]))
    projetosApi.listFunnels(projectId, true).then(setFunnels).catch(() => setFunnels([]))
    if (!boardTasks) {
      projetosApi.listTasks(projectId).then(setFetchedTasks).catch(() => setFetchedTasks([]))
    }
    projetosApi.listPrograms(projectId).then(setPrograms).catch(() => setPrograms([]))
    projetosApi.listTaskChildren(projectId, task.id).then(setChildren).catch(() => setChildren([]))
    projetosApi.listStatuses(projectId).then((sts) => {
      setAllStatuses(sts)
      setStatusMap(Object.fromEntries(sts.map((s) => [s.id, { name: s.name, color: s.color, priority_mode: s.priority_mode }])))
    }).catch(() => { setAllStatuses([]); setStatusMap({}) })
    // Estado da trava de cronograma da raiz a que esta tarefa pertence.
    projetosApi.getScheduleLockForTask(projectId, task.id).then(setScheduleLock).catch(() => setScheduleLock(null))
    return () => clearTimeout(timer)
  }, [open, task, projectId, defaultFormFields])

  async function reloadScheduleLock() {
    if (!task) return
    try { setScheduleLock(await projetosApi.getScheduleLockForTask(projectId, task.id)) } catch { /* mantém */ }
  }

  useEffect(() => {
    if (!open || !projectId || !statusId) {
      setSectionLinks([])
      setDefaultFormLinks([])
      return
    }
    Promise.all([
      projetosApi.listStatusSectionLinks(projectId, statusId),
      projetosApi.listStatusDefaultFormLinks(projectId, statusId),
    ]).then(([links, defaultLinks]) => {
      setSectionLinks(links)
      setDefaultFormLinks(defaultLinks)
    }).catch(() => {
      setSectionLinks([])
      setDefaultFormLinks([])
    })
  }, [open, projectId, statusId])

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
      rows.forEach((row) => { mapped[row.sectionId] = row.fields.sort((a, b) => a.order - b.order) })
      setFieldsBySection(mapped)
    }).catch(() => {
      setFormSections([])
      setFieldsBySection({})
    })
  }, [selectedDemandTypeId])

  const assignedUser = assignedTo !== NO_ASSIGNEE ? users.find((u) => u.id === assignedTo) ?? null : null
  const assigneeLabel = assignedUser?.full_name ?? "Sem responsável"
  const currentStatus = statusMap[statusId]
  const currentStatusConfig = allStatuses.find((s) => s.id === statusId)
  // Classificação pendente OU classificado sem responder a pergunta de IA.
  const missingIaAnswer = !!task?.card_classification && task?.ia_assisted == null
  const canLateClassify =
    !readOnly &&
    (!task?.card_classification || missingIaAnswer) &&
    !!currentStatusConfig &&
    !currentStatusConfig.is_initial &&
    isPlanningRootTask(task?.planning_kind) &&
    isProjectOrProgramKanbanFunnel(kanbanFunnelName)
  const statusLabel = currentStatus?.name ?? "Sem etapa"
  const assigneeCandidates = users.filter((u) => {
    const q = assigneeSearch.trim().toLowerCase()
    return !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  // Card de planejamento associado: o próprio (raiz) ou o card convertido a partir desta
  // origem (ex.: card "Concluído" da prospecção que gerou um Projeto/Programa).
  const planningTarget = useMemo<ProjectTask | null>(() => {
    if (!task) return null
    if (task.planning_kind === "projeto" || task.planning_kind === "programa") return task
    return allTasks.find(
      (t) => t.origin_task_id === task.id && (t.planning_kind === "projeto" || t.planning_kind === "programa"),
    ) ?? null
  }, [task, allTasks])
  const planningProgramName = planningTarget?.linked_program_id
    ? programs.find((p) => p.id === planningTarget.linked_program_id)?.name ?? null
    : null
  const canEditPlanning = !readOnly && !!planningTarget

  function openPlanningEditor() {
    if (!planningTarget) return
    const kind = (planningTarget.planning_kind === "programa" ? "programa" : "projeto") as "projeto" | "programa"
    setPlanningKindDraft(kind)
    setPlanningProgramMode("select")
    setPlanningProgramId(planningTarget.linked_program_id ?? "")
    setPlanningNewProgramName("")
    setPlanningNewProgramDesc("")
    setPlanningEditOpen(true)
  }

  async function handleSavePlanning() {
    if (!task || !planningTarget) return
    if (planningKindDraft === "programa") {
      if (planningProgramMode === "select" && !planningProgramId) {
        toast.error("Selecione um programa ou cadastre um novo.")
        return
      }
      if (planningProgramMode === "new" && planningNewProgramName.trim().length < 2) {
        toast.error("Informe o nome do novo programa.")
        return
      }
    }
    setSavingPlanning(true)
    try {
      const updated = await projetosApi.setPlanningClassification(projectId, task.id, {
        kind: planningKindDraft,
        program_id: planningKindDraft === "programa" && planningProgramMode === "select" ? planningProgramId : null,
        new_program_name: planningKindDraft === "programa" && planningProgramMode === "new" ? planningNewProgramName.trim() : null,
        new_program_desc: planningKindDraft === "programa" && planningProgramMode === "new" ? (planningNewProgramDesc.trim() || null) : null,
      })
      // Atualiza a lista local (o card convertido) e a lista de programas se criou um novo.
      // Quando a lista vem do board (`boardTasks`), quem reconcilia é o `onSaved` abaixo.
      setFetchedTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      if (updated.linked_program_id && !programs.some((p) => p.id === updated.linked_program_id)) {
        try { setPrograms(await projetosApi.listPrograms(projectId)) } catch { /* mantém */ }
      }
      onSaved(updated)
      setPlanningEditOpen(false)
      toast.success("Classificação atualizada e propagada aos demais kanbans.")
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível atualizar a classificação.")
    } finally {
      setSavingPlanning(false)
    }
  }

  async function handleSelectAssignee(uid: string | null) {
    if (!task || readOnly) return
    const prev = assignedTo
    setAssignedTo(uid ?? NO_ASSIGNEE)
    setAssigneeMenuOpen(false)
    setAssigneeSearch("")
    try {
      const updated = await projetosApi.updateTask(projectId, task.id, { assigned_to: uid })
      onSaved(updated)
    } catch (err) {
      setAssignedTo(prev)
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível alterar o responsável.")
    }
  }

  const demandTypeName = (id: string | null | undefined) =>
    id ? (demandTypes.find((t) => t.id === id)?.name ?? null) : null
  const currentDemandType = demandTypes.find((d) => d.id === task?.demand_type_id) ?? null
  const taskFunnelName = (() => {
    if (!task) return kanbanFunnelName
    const st = allStatuses.find((s) => s.id === task.status_id)
    const fromStatus = st ? funnels.find((f) => f.id === st.funnel_id)?.name ?? null : null
    return kanbanFunnelName ?? fromStatus
  })()
  const isUserStoryCard =
    isUserStoryDemandType(
      currentDemandType?.name ?? demandTypeName(task?.demand_type_id),
      currentDemandType?.slug,
    ) || isUserStoryKanbanFunnel(taskFunnelName)
  const checklistItems = useMemo(
    () => task?.us_checklist ?? EMPTY_US_CHECKLIST,
    [task?.us_checklist],
  )

  // Candidatos a pai: tasks cujo tipo aceita o tipo desta task como filho (exclui a própria).
  const parentCandidates = (() => {
    if (!task || !task.demand_type_id) return []
    return allTasks.filter((t) => {
      if (t.id === task.id) return false
      if (!t.demand_type_id) return false
      const pt = demandTypes.find((d) => d.id === t.demand_type_id)
      const allowed = pt?.allowed_child_type_ids ?? []
      return allowed.includes(task.demand_type_id as string)
    })
  })()

  const originTask = task?.origin_task_id
    ? allTasks.find((t) => t.id === task.origin_task_id) ?? null
    : null

  // Tipos que podem ser criados/vinculados como filhos deste card (def. no tipo do card pai).
  const currentType = demandTypes.find((d) => d.id === task?.demand_type_id)
  const childTypeOptions = demandTypes.filter(
    (d) => d.is_active && (currentType?.allowed_child_type_ids ?? []).includes(d.id)
  )

  const parentTask = parentTaskId !== NO_ASSIGNEE ? allTasks.find((t) => t.id === parentTaskId) ?? null : null

  // Cards criados A PARTIR deste por conversão (origin_task_id aponta para este card).
  const convertedCards = task ? allTasks.filter((t) => t.origin_task_id === task.id) : []

  // Itens existentes elegíveis a virar filho: tipo compatível, não a si mesmo e ainda não filho.
  const childExistingCandidates = task
    ? allTasks.filter(
        (t) =>
          t.id !== task.id &&
          t.parent_task_id !== task.id &&
          !!t.demand_type_id &&
          (currentType?.allowed_child_type_ids ?? []).includes(t.demand_type_id as string),
      )
    : []

  const linkCandidates = (linkType === "child" ? childExistingCandidates : parentCandidates).filter(
    (t) => !linkSearch.trim() || t.title.toLowerCase().includes(linkSearch.trim().toLowerCase()),
  )

  function goToCard(t: ProjectTask) {
    const funnelId = allStatuses.find((s) => s.id === t.status_id)?.funnel_id
    onOpenChange(false)
    const params = new URLSearchParams()
    if (funnelId) params.set("funnel", funnelId)
    params.set("task", t.id)
    navigate(`/app/modules/projetos/${t.project_id}/board?${params.toString()}`)
  }

  function relationRow(t: ProjectTask, onRemove?: () => void, clickable = true) {
    const st = statusMap[t.status_id]
    const typeName = demandTypeName(t.demand_type_id)
    const canClick = clickable && t.id !== task?.id
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5">
        <div
          className={`flex min-w-0 items-center gap-2 ${canClick ? "cursor-pointer rounded hover:text-primary" : ""}`}
          {...(canClick
            ? { role: "button", tabIndex: 0, title: "Abrir card no kanban", onClick: () => goToCard(t) }
            : {})}
        >
          <FileText size={14} className="shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className={`truncate text-sm font-medium ${canClick ? "hover:underline" : ""}`}>{t.title}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {typeName && <span>{typeName}</span>}
              {st && (
                <>
                  {typeName && <span>·</span>}
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.color }} />
                    {st.name}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {onRemove && !readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            title="Remover vínculo"
          >
            <X size={13} />
          </Button>
        )}
      </div>
    )
  }

  function openLinkDialog(mode: "existing" | "new") {
    setLinkMode(mode)
    setLinkType("child")
    setLinkSearch("")
    setLinkSelectedId("")
    setChildTitle("")
    setChildTypeId("")
    setLinkMenuOpen(false)
    setLinkDialogOpen(true)
  }

  async function refreshChildren() {
    if (!task) return
    const c = await projetosApi.listTaskChildren(projectId, task.id).catch(() => [] as ProjectTask[])
    setChildren(c)
  }

  // Cria um novo card filho (etapa inicial do kanban do tipo; sem kanban, fica na etapa do pai).
  async function createChild(): Promise<boolean> {
    if (!task) return false
    const typeId = childTypeId || childTypeOptions[0]?.id
    const childType = demandTypes.find((d) => d.id === typeId)
    if (!childType || !childTitle.trim()) {
      toast.error("Informe o título do item.")
      return false
    }
    let statusId = task.status_id
    if (childType.funnel_id) {
      const sts = await projetosApi.listStatuses(projectId, childType.funnel_id, true)
      const initial = sts.find((s) => s.is_initial) ?? [...sts].sort((a, b) => a.order - b.order)[0]
      if (initial) statusId = initial.id
    }
    const created = await projetosApi.createTask(projectId, {
      status_id: statusId,
      demand_type_id: typeId,
      parent_task_id: task.id,
      title: childTitle.trim().slice(0, 200),
      due_date: null,
    })
    setChildren((prev) => [...prev, created])
    return true
  }

  async function handleSubmitLink() {
    if (!task) return
    setSavingLink(true)
    try {
      if (linkMode === "new") {
        const ok = await createChild()
        if (!ok) return
        toast.success("Item filho criado.")
      } else {
        if (!linkSelectedId) {
          toast.error("Selecione um item.")
          return
        }
        if (linkType === "child") {
          await projetosApi.updateTask(projectId, linkSelectedId, { parent_task_id: task.id })
          await refreshChildren()
        } else {
          const updated = await projetosApi.updateTask(projectId, task.id, { parent_task_id: linkSelectedId })
          setParentTaskId(updated.parent_task_id ?? NO_ASSIGNEE)
        }
        toast.success("Vínculo adicionado.")
      }
      onSaved(task)
      setLinkDialogOpen(false)
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível adicionar o vínculo.")
    } finally {
      setSavingLink(false)
    }
  }

  async function handleUnlinkChild(child: ProjectTask) {
    try {
      await projetosApi.updateTask(projectId, child.id, { parent_task_id: null })
      setChildren((prev) => prev.filter((c) => c.id !== child.id))
      if (task) onSaved(task)
    } catch {
      toast.error("Não foi possível remover o vínculo.")
    }
  }

  async function handleUnlinkParent() {
    if (!task) return
    try {
      await projetosApi.updateTask(projectId, task.id, { parent_task_id: null })
      setParentTaskId(NO_ASSIGNEE)
      onSaved(task)
    } catch {
      toast.error("Não foi possível remover o vínculo.")
    }
  }

  // Envia um projeto (item) para o kanban de desenvolvimento: move-o para a etapa do seu funil
  // que transita para outro kanban (moves_to_funnel_id). Mantém o vínculo com o Programa.
  async function handleSendChildToDev(child: ProjectTask) {
    const childFunnel = allStatuses.find((s) => s.id === child.status_id)?.funnel_id
    const moveStage = allStatuses.find((s) => s.funnel_id === childFunnel && s.moves_to_funnel_id)
    if (!moveStage) {
      toast.error("Configure uma etapa que mova para o kanban de desenvolvimento (Etapas Kanban → 'mover para o kanban').")
      return
    }
    try {
      const updated = await projetosApi.updateTask(projectId, child.id, { status_id: moveStage.id })
      setChildren((prev) => prev.map((c) => (c.id === child.id ? updated : c)))
      if (task) onSaved(task)
      toast.success("Projeto enviado para o desenvolvimento.")
    } catch {
      toast.error("Não foi possível enviar o projeto para o desenvolvimento.")
    }
  }

  // ── Mudança de etapa pelo modal (respeita validação, conversão, transição e permissão) ──
  function stripStatusPrefix(t: string): string {
    return t.replace(/^\s*(projeto|programa|demanda)\s*:\s*/i, "").trim() || t
  }

  const currentFunnelStatuses = (() => {
    const cur = allStatuses.find((s) => s.id === statusId)
    if (!cur) return [] as ProjectStatus[]
    return allStatuses
      .filter((s) => s.funnel_id === cur.funnel_id && s.is_active)
      .sort((a, b) => a.order - b.order)
  })()

  async function persistStatus(newStatusId: string, conversionTitle?: string) {
    if (!task) return
    const before = allStatuses.find((s) => s.id === statusId)
    setChangingStatus(true)
    try {
      const updated = await projetosApi.updateTask(projectId, task.id, {
        status_id: newStatusId,
        form_values: formValues,
        ...(conversionTitle !== undefined ? { conversion_title: conversionTitle } : {}),
      })
      setStatusId(updated.status_id)
      onSaved(updated)
      projetosApi.listTaskStatusHistory(projectId, task.id).then(setStatusHistory).catch(() => null)
      const after = allStatuses.find((s) => s.id === updated.status_id)
      toast.success(after && before && after.funnel_id !== before.funnel_id ? "Card movido para outro kanban." : "Etapa atualizada.")
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível mudar a etapa.")
      setStatusId(task.status_id)  // reverte o seletor
    } finally {
      setChangingStatus(false)
    }
  }

  async function handleSelectStatus(newStatusId: string) {
    if (!task || newStatusId === statusId) return
    if (task.procurement_locked) {
      toast.error("Card aguardando contratação — não é possível alterar a etapa.")
      return
    }
    const target = allStatuses.find((s) => s.id === newStatusId)
    const current = allStatuses.find((s) => s.id === statusId)
    if (!target) return
    // Avançar de etapa exige os campos obrigatórios da etapa atual preenchidos.
    const isForward = !!(current && target.funnel_id === current.funnel_id && target.order > current.order)
    if (isForward) {
      const defaultCheck = validateDefaultFormValues(defaultFormFields, {
        title,
        description,
        anexos,
        assigned_to: assignedTo === NO_ASSIGNEE ? null : assignedTo,
        diretoria,
        area,
        start_date: startDate,
        due_date: dueDate,
      }, defaultFormLinks)
      if (defaultCheck.missingLabels.length > 0) {
        toast.error(`Preencha os campos obrigatórios: ${defaultCheck.missingLabels.join(", ")}.`)
        return
      }
      const { errors, missingLabels } = validateRequiredFields({
        statusId: task.status_id, formSections, fieldsBySection, sectionLinks, formValues,
      })
      if (missingLabels.length > 0) {
        setFieldErrors(errors)
        toast.error(formatMissingFieldsMessage(missingLabels))
        return
      }
    }
    // Etapa que gera outro card (conversão): pede o nome antes.
    if (target.creates_demand_type_id) {
      setStatusConvPrompt({
        newStatusId,
        typeName: demandTypeName(target.creates_demand_type_id) ?? "Projeto",
        name: stripStatusPrefix(title),
      })
      return
    }
    await persistStatus(newStatusId)
  }

  async function confirmStatusConversion() {
    if (!statusConvPrompt) return
    if (statusConvPrompt.name.trim().length < 2) {
      toast.error("Informe um nome com ao menos 2 caracteres.")
      return
    }
    await persistStatus(statusConvPrompt.newStatusId, statusConvPrompt.name.trim())
    setStatusConvPrompt(null)
  }

  function sectionMode(sectionId: string): FieldVisibilityMode {
    const link = sectionLinks.find((l) => l.section_id === sectionId)
    return (link?.mode as FieldVisibilityMode | undefined) ?? "hidden"
  }

  function fieldMode(field: ProjectDemandFormField, parentMode: FieldVisibilityMode): FieldVisibilityMode {
    if (!task) return "hidden"
    const entry = getFieldVisibility(field).find((v) => v.status_id === task.status_id)
    return entry?.mode ?? parentMode
  }

  async function handleSave() {
    if (!task || !title.trim()) return
    const defaultCheck = validateDefaultFormValues(defaultFormFields, {
      title,
      description,
      anexos,
      assigned_to: assignedTo === NO_ASSIGNEE ? null : assignedTo,
      diretoria,
      area,
      start_date: startDate,
      due_date: dueDate,
    }, defaultFormLinks)
    if (defaultCheck.missingLabels.length > 0) {
      toast.error(`Preencha os campos obrigatórios: ${defaultCheck.missingLabels.join(", ")}.`)
      return
    }
    const { errors, missingLabels } = validateRequiredFields({
      statusId: task.status_id,
      formSections,
      fieldsBySection,
      sectionLinks,
      formValues,
    })
    if (missingLabels.length > 0) {
      setFieldErrors(errors)
      toast.error(formatMissingFieldsMessage(missingLabels))
      return
    }
    setFieldErrors({})
    setSaving(true)
    try {
      const startType = normalizeDefaultFieldType("start_date", defaultFieldsByKey.get("start_date")?.field_type)
      const dueType = normalizeDefaultFieldType("due_date", defaultFieldsByKey.get("due_date")?.field_type)
      const updated = await projetosApi.updateTask(projectId, task.id, {
        demand_type_id: selectedDemandTypeId || null,
        parent_task_id: parentTaskId === NO_ASSIGNEE ? null : parentTaskId,
        title: title.trim(),
        description: description.trim() || null,
        anexos,
        assigned_to: isBasicUser ? undefined : (assignedTo === NO_ASSIGNEE ? null : assignedTo),
        diretoria,
        area,
        start_date: defaultDateToIso(startType, startDate),
        due_date: defaultDateToIso(dueType, dueDate),
        form_values: formValues,
      })
      onSaved(updated)
      onOpenChange(false)
    } catch (err) {
      // Cronograma travado (423) e demais recusas do servidor: mantém o drawer aberto.
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível salvar a tarefa.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!task) return
    if (!confirm(`Excluir a tarefa "${task.title}"?`)) return
    setRemoving(true)
    try {
      await projetosApi.deleteTask(projectId, task.id)
      onDeleted(task.id)
      onOpenChange(false)
    } finally {
      setRemoving(false)
    }
  }

  async function confirmLateClassification(result: {
    classification: CardClassification
    iaAssisted: boolean
    productId: string
    releaseId: string | null
    procurementRequired: boolean | null
  }) {
    if (!task) return
    try {
      const updated = await projetosApi.updateTask(projectId, task.id, {
        card_classification: result.classification,
        ia_assisted: result.iaAssisted,
        linked_product_id: result.productId,
        linked_release_id: result.releaseId,
        ...(result.procurementRequired !== null
          ? { procurement_required: result.procurementRequired }
          : {}),
      })
      onSaved(updated)
      setClassifyOpen(false)
      toast.success(
        result.procurementRequired
          ? "Classificado — card na Contratação e demanda criada em Contratar."
          : "Projeto classificado.",
      )
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      const d = e.response?.data?.detail
      toast.error(typeof d === "string" ? d : "Não foi possível classificar o projeto.")
    }
  }

  async function handleComment() {
    if (!task || !commentHasContent(newComment)) return
    setSendingComment(true)
    try {
      const created = await projetosApi.createTaskComment(projectId, task.id, newComment.trim())
      setComments((prev) => [...prev, created])
      setNewComment("")
    } finally {
      setSendingComment(false)
    }
  }

  async function handleChecklistSave(next: UsChecklistItem[]) {
    if (!task) return
    if (readOnly) {
      toast.error("Você não tem permissão para editar este card.")
      throw new Error("read-only")
    }
    setSavingChecklist(true)
    try {
      const updated = await projetosApi.updateTask(projectId, task.id, {
        us_checklist: next.length > 0 ? next : null,
      })
      onSaved(updated)
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      const d = e.response?.data?.detail
      if ((err as Error).message !== "read-only") {
        toast.error(typeof d === "string" ? d : "Não foi possível salvar o checklist.")
      }
      throw err
    } finally {
      setSavingChecklist(false)
    }
  }

  return (
    <>
    {open && task && (
      <div className="afx af-drawer-overlay">
        <div className="af-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head">
            <div className="crumb">
              <FileText size={13} style={{ color: "var(--af-muted-fg)" }} />
              <span className="muted">{demandTypeName(task.demand_type_id) ?? "Card"}</span>
            </div>
            <span className="spacer" />
            {showEstimatedHoursHeader ? (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
                title="Horas estimadas"
              >
                <Clock size={14} />
                {fmtEstimatedHours(task.estimated_hours) ?? "—"}
              </span>
            ) : (
              <button
                className="icon-btn"
                title="Abrir no cronograma"
                onClick={() => { const id = task.id; onOpenChange(false); navigate(`/app/modules/projetos/cronograma?root=${id}`) }}
              >
                <CalendarRange size={15} />
              </button>
            )}
            {!readOnly && (
              <button className="icon-btn" title="Excluir" onClick={handleDelete} disabled={removing}>
                {removing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              </button>
            )}
            <div className="divider-v" />
            <button className="icon-btn" title="Fechar" onClick={() => onOpenChange(false)}><X size={16} /></button>
          </div>

          <div className="drawer-body">
          <div className="space-y-5">
            {scheduleLock && task && (
              <ScheduleLockBanner
                projectId={projectId}
                lock={scheduleLock}
                onChanged={() => void reloadScheduleLock()}
                compact
              />
            )}
            {task.procurement_locked && (
              <div className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                <div className="font-medium">Aguardando contratação</div>
                <p className="mt-0.5 text-xs text-orange-800/80">
                  Este card está travado na raia Contratação até o fluxo Contratar ser concluído ou cancelado.
                </p>
                {task.procurement_task_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 border-orange-300 text-orange-900 hover:bg-orange-100"
                    onClick={() => onOpenTask?.(task.procurement_task_id!)}
                  >
                    <ArrowUpRight size={12} className="mr-1" />
                    Abrir card de contratação
                  </Button>
                )}
              </div>
            )}
            {task.origin_task_id && demandTypes.find((d) => d.id === task.demand_type_id)?.is_procurement && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Card de origem</div>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => onOpenTask?.(task.origin_task_id!)}
                >
                  Voltar ao card de origem
                </Button>
              </div>
            )}
            {/* Cabeçalho: tipo, estado, título e meta (estilo Azure DevOps) */}
            <div className="space-y-2 border-b border-border pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1 uppercase tracking-wide">
                  <FileText size={12} />
                  {demandTypeName(task.demand_type_id) ?? "Card"}
                </Badge>
                {task.procurement_locked && (
                  <Badge className="bg-orange-600 text-[10px] text-white hover:bg-orange-600">
                    Aguardando contratação
                  </Badge>
                )}
                {task.sla_state && task.sla_state !== "none" && (
                  <Badge variant={task.sla_state === "breached" ? "destructive" : "secondary"} className="text-[10px]">
                    {task.sla_state === "breached" ? "SLA estourado" : task.sla_state === "warning" ? "SLA em alerta" : "No prazo"}
                  </Badge>
                )}
                {task.card_classification && (
                  <Badge variant="secondary" className="text-[10px]">
                    {CLASSIFICATION_LABELS[task.card_classification]}
                  </Badge>
                )}
                {planningTarget && (
                  <span className="inline-flex items-center gap-1">
                    <Badge
                      className="text-[10px] text-white"
                      style={{ backgroundColor: planningTarget.planning_kind === "programa" ? "#7c3aed" : "#0ea5e9" }}
                    >
                      {planningTarget.planning_kind === "programa" ? "Programa" : "Projeto"}
                    </Badge>
                    {planningTarget.planning_kind === "programa" && planningProgramName && (
                      <Badge variant="outline" className="text-[10px]">{planningProgramName}</Badge>
                    )}
                    {canEditPlanning && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-primary"
                        title="Editar Projeto/Programa"
                        onClick={openPlanningEditor}
                      >
                        <Pencil size={12} />
                      </Button>
                    )}
                  </span>
                )}
                {isUserStoryCard && (task.us_checklist?.length || task.percent_complete > 0) && (
                  <Badge variant="outline" className="text-[10px] tabular-nums">
                    {task.percent_complete}% concluído
                  </Badge>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  Atualizado em {new Date(task.updated_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
              {defaultFieldsByKey.get("title") && isDefaultFieldShown(defaultFieldsByKey.get("title")!, defaultFormLinks) && (
                normalizeFieldType(normalizeDefaultFieldType("title", defaultFieldsByKey.get("title")?.field_type)) === "text_long" ? (
                  <Textarea
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    rows={2}
                    readOnly={readOnly}
                    className="min-h-0 resize-none border-0 px-0 text-lg font-bold shadow-none focus-visible:ring-0"
                    placeholder={defaultFieldsByKey.get("title")?.label ?? "Título do card"}
                  />
                ) : (
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    readOnly={readOnly}
                    className="h-auto border-0 px-0 text-lg font-bold shadow-none focus-visible:ring-0"
                    placeholder={defaultFieldsByKey.get("title")?.label ?? "Título do card"}
                  />
                )
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {defaultFieldsByKey.get("assigned_to") && isDefaultFieldShown(defaultFieldsByKey.get("assigned_to")!, defaultFormLinks) && (readOnly ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                      {assignedUser ? initials(assignedUser.full_name) : "?"}
                    </span>
                    {assigneeLabel}
                  </span>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setAssigneeMenuOpen((o) => !o); setStatusMenuOpen(false) }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-1.5 py-0.5 hover:border-border hover:bg-muted"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                        {assignedUser ? initials(assignedUser.full_name) : "?"}
                      </span>
                      <span className={assignedUser ? "" : "italic"}>{assigneeLabel}</span>
                      <ChevronDown size={12} />
                    </button>
                    {assigneeMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setAssigneeMenuOpen(false)} />
                        <div className="absolute left-0 z-20 mt-1 w-72 rounded-md border bg-popover shadow-md">
                          <div className="border-b p-1.5">
                            <Input
                              value={assigneeSearch}
                              onChange={(e) => setAssigneeSearch(e.target.value)}
                              placeholder="Buscar pessoa por nome ou e-mail..."
                              className="h-8"
                              autoFocus
                            />
                          </div>
                          <div className="max-h-60 overflow-y-auto p-1">
                            <button
                              type="button"
                              onClick={() => void handleSelectAssignee(null)}
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                            >
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground"><X size={12} /></span>
                              <span className="text-sm text-muted-foreground">Sem responsável</span>
                              {assignedTo === NO_ASSIGNEE && <Check size={14} className="ml-auto text-primary" />}
                            </button>
                            {assigneeCandidates.map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => void handleSelectAssignee(u.id)}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                              >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                                  {initials(u.full_name)}
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm text-foreground">{u.full_name}</span>
                                  <span className="block truncate text-[11px] text-muted-foreground">{u.email}</span>
                                </span>
                                {assignedTo === u.id && <Check size={14} className="ml-auto shrink-0 text-primary" />}
                              </button>
                            ))}
                            {assigneeCandidates.length === 0 && (
                              <p className="px-2 py-1.5 text-[11px] italic text-muted-foreground/70">Ninguém encontrado.</p>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {defaultFieldsByKey.get("assigned_to") && isDefaultFieldShown(defaultFieldsByKey.get("assigned_to")!, defaultFormLinks) && currentStatus && (
                  <span>·</span>
                )}

                {currentStatus && (readOnly ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${currentStatus.color}1A` }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: currentStatus.color }} />
                    </span>
                    {statusLabel}
                  </span>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setStatusMenuOpen((o) => !o); setAssigneeMenuOpen(false) }}
                      disabled={changingStatus}
                      className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-1.5 py-0.5 hover:border-border hover:bg-muted disabled:opacity-60"
                    >
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${currentStatus.color}1A` }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: currentStatus.color }} />
                      </span>
                      <span>{statusLabel}</span>
                      <ChevronDown size={12} />
                    </button>
                    {statusMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setStatusMenuOpen(false)} />
                        <div className="absolute left-0 z-20 mt-1 w-64 rounded-md border bg-popover shadow-md">
                          <div className="max-h-60 overflow-y-auto p-1">
                            {currentFunnelStatuses.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => { setStatusMenuOpen(false); void handleSelectStatus(s.id) }}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                              >
                                <span
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                                  style={{ backgroundColor: `${s.color}1A` }}
                                >
                                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                                </span>
                                <span className="text-sm">{s.name}</span>
                                {statusId === s.id && <Check size={14} className="ml-auto shrink-0 text-primary" />}
                              </button>
                            ))}
                            {currentFunnelStatuses.length === 0 && (
                              <p className="px-2 py-1.5 text-[11px] italic text-muted-foreground/70">Nenhuma etapa disponível.</p>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                <span>·</span>
                <span>{comments.length} comentário{comments.length === 1 ? "" : "s"}</span>
              </div>
            </div>

            {isUserStoryCard && task && (
              <UsChecklistSection
                items={checklistItems}
                percentComplete={task.percent_complete}
                readOnly={readOnly}
                saving={savingChecklist}
                onSave={handleChecklistSave}
              />
            )}

            {isUserStoryCard && task && (
              <UsCommitsSection
                projectId={projectId}
                taskId={task.id}
                readOnly={readOnly}
                justificativa={task.commit_justificativa ?? null}
                onSaveJustificativa={async (texto) => {
                  const updated = await projetosApi.updateTask(projectId, task.id, {
                    commit_justificativa: texto,
                  })
                  onSaved(updated)
                }}
              />
            )}

            {(() => {
              const planningFields = defaultFormPlanningFields(defaultFormFields, defaultFormLinks)
              const descriptionField = defaultFieldsByKey.get("description")
              const showDescription = descriptionField && isDefaultFieldShown(descriptionField, defaultFormLinks)
              const anexosField = defaultFieldsByKey.get("anexos")
              const showAnexos = anexosField && isDefaultFieldShown(anexosField, defaultFormLinks)
              const classification = task.card_classification
              const hasClassification = !!classification
              if (planningFields.length === 0 && !showDescription && !showAnexos && !hasClassification && !canLateClassify) return null
              const defaultValues: DefaultFormValues = {
                title,
                description,
                anexos,
                assigned_to: assignedTo === NO_ASSIGNEE ? null : assignedTo,
                diretoria,
                area,
                start_date: startDate,
                due_date: dueDate,
              }
              const onDefaultPatch = (patch: Partial<DefaultFormValues>) => {
                if (patch.diretoria !== undefined) setDiretoria(patch.diretoria)
                if (patch.area !== undefined) setArea(patch.area)
                if (patch.start_date !== undefined) setStartDate(patch.start_date)
                if (patch.due_date !== undefined) setDueDate(patch.due_date)
                if (patch.description !== undefined) setDescription(patch.description)
                if (patch.anexos !== undefined) setAnexos(patch.anexos ?? [])
              }
              return (
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="h-4 w-1 rounded-full bg-primary" />
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                      Dados do Projeto
                    </p>
                  </div>
                  <div className="space-y-4">
                    {canLateClassify && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2">
                        <p className="text-xs text-amber-900">
                          {missingIaAnswer
                            ? "Informe se este projeto será feito com IA ou auxílio de IA."
                            : "Este projeto ainda não foi classificado no portfólio de Produtos."}
                        </p>
                        <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setClassifyOpen(true)}>
                          {missingIaAnswer ? "Responder agora" : "Classificar agora"}
                        </Button>
                      </div>
                    )}
                    {hasClassification && classification && (
                      <div className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <ClassificationReadonlyField
                            label="Tipo"
                            value={CLASSIFICATION_LABELS[classification]}
                          />
                          {(classification === "desenvolvimento" || classification === "implantacao") && (
                            <ClassificationReadonlyField
                              label="Produto vinculado"
                              value={linkedProductName}
                              href={task.linked_product_id ? `/app/modules/produtos/produtos/${task.linked_product_id}` : null}
                              onOpen={(path) => navigate(path)}
                            />
                          )}
                        </div>
                        {classification === "melhoria" && (
                          <div className="grid gap-3 md:grid-cols-2">
                            <ClassificationReadonlyField
                              label="Produto"
                              value={linkedProductName}
                              href={task.linked_product_id ? `/app/modules/produtos/produtos/${task.linked_product_id}` : null}
                              onOpen={(path) => navigate(path)}
                            />
                            <ClassificationReadonlyField
                              label="Release"
                              value={linkedReleaseVersao}
                              href={
                                task.linked_product_id && task.linked_release_id
                                  ? `/app/modules/produtos/produtos/${task.linked_product_id}?tab=releases`
                                  : null
                              }
                              onOpen={(path) => navigate(path)}
                            />
                          </div>
                        )}
                        {task.ia_assisted !== null && task.ia_assisted !== undefined && (
                          <ClassificationReadonlyField
                            label="Com IA ou auxílio de IA"
                            value={task.ia_assisted ? "Sim" : "Não"}
                          />
                        )}
                      </div>
                    )}
                    {groupDefaultFormFieldsIntoRows(planningFields, defaultFormLinks).map((row, rowIdx) => {
                      if (row.length === 1) {
                        const key = row[0].field_key
                        return (
                          <DefaultFormFieldSlot
                            key={key}
                            fields={defaultFormFields}
                            fieldKey={key}
                            defaultFormLinks={defaultFormLinks}
                            values={defaultValues}
                            onChange={onDefaultPatch}
                            users={users}
                            disabled={readOnly}
                          />
                        )
                      }
                      return (
                        <div key={`plan-row-${rowIdx}`} className="grid gap-3 md:grid-cols-2">
                          {row.map((cfg) => (
                            <DefaultFormFieldSlot
                              key={cfg.field_key}
                              fields={defaultFormFields}
                              fieldKey={cfg.field_key}
                              defaultFormLinks={defaultFormLinks}
                              values={defaultValues}
                              onChange={onDefaultPatch}
                              users={users}
                              disabled={readOnly}
                            />
                          ))}
                        </div>
                      )
                    })}
                    {showDescription && (
                      <DefaultFormFieldSlot
                        fields={defaultFormFields}
                        fieldKey="description"
                        defaultFormLinks={defaultFormLinks}
                        values={defaultValues}
                        onChange={onDefaultPatch}
                        users={users}
                        disabled={readOnly}
                      />
                    )}
                    {showAnexos && (
                      <DefaultFormFieldSlot
                        fields={defaultFormFields}
                        fieldKey="anexos"
                        defaultFormLinks={defaultFormLinks}
                        values={defaultValues}
                        onChange={onDefaultPatch}
                        users={users}
                        disabled={readOnly}
                      />
                    )}
                  </div>
                </div>
              )
            })()}

            {formSections.map((section) => {
              const secMode = sectionMode(section.id)
              const visibleFields = (fieldsBySection[section.id] ?? [])
                .filter((f) => f.is_active)
                .filter((f) => fieldMode(f, secMode) !== "hidden")
              if (visibleFields.length === 0) return null
              return (
                <div key={section.id} className="space-y-3 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center gap-2">
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
                      <div key={rowIdx} className="flex flex-col gap-3 md:flex-row">
                        {row.items.map((field) => {
                          const mode = fieldMode(field, secMode)
                          const isReadOnly = mode === "visible"
                          const isRequired = mode === "required" || (mode === "editable" && field.is_required)
                          const fieldError = fieldErrors[field.id]
                          return (
                            <div key={field.id} className="min-w-0 flex-1 space-y-1">
                              <Label>
                                {field.label}
                                {isRequired && <span className="ml-0.5 text-destructive">*</span>}
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
                                    if (fieldErrors[field.id]) {
                                      setFieldErrors((prev) => {
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

            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-primary" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                    Trabalho relacionado
                  </p>
                </div>
                {!readOnly && (
                  <div className="relative">
                    <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setLinkMenuOpen((o) => !o)} title="Adicionar vínculo">
                      <Plus size={14} />
                    </Button>
                    {linkMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setLinkMenuOpen(false)} />
                        <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border bg-popover p-1 shadow-md">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                            onClick={() => openLinkDialog("existing")}
                          >
                            <LinkIcon size={14} /> Item existente
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                            onClick={() => openLinkDialog("new")}
                          >
                            <Pencil size={14} /> Novo item
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {originTask && (
                  <div className="space-y-1.5 rounded-md border p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground">Origem</p>
                    {relationRow(originTask)}
                  </div>
                )}

                <div className="space-y-1.5 rounded-md border p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">Pai</p>
                  {parentTask
                    ? relationRow(parentTask, () => void handleUnlinkParent())
                    : <p className="text-[11px] italic text-muted-foreground/70">Sem card pai.</p>}
                </div>

                <div className="space-y-1.5 rounded-md border p-3 sm:col-span-2">
                  <p className="text-[11px] font-semibold text-muted-foreground">Filhos ({children.length})</p>
                  {children.length === 0 ? (
                    <p className="text-[11px] italic text-muted-foreground/70">Nenhum item filho.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {children.map((c) => {
                        const taskFunnel = allStatuses.find((s) => s.id === statusId)?.funnel_id
                        const childFunnel = allStatuses.find((s) => s.id === c.status_id)?.funnel_id
                        const samePlanningFunnel = !!taskFunnel && childFunnel === taskFunnel
                        return (
                          <div key={c.id} className="space-y-1">
                            {relationRow(c, () => void handleUnlinkChild(c))}
                            {!readOnly && samePlanningFunnel && (
                              <button
                                type="button"
                                onClick={() => void handleSendChildToDev(c)}
                                className="flex items-center gap-1 pl-1 text-[11px] font-medium text-primary hover:underline"
                              >
                                <ArrowUpRight size={12} /> Enviar para desenvolvimento
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {convertedCards.length > 0 && (
                  <div className="space-y-1.5 rounded-md border p-3 sm:col-span-3">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      Criados a partir deste ({convertedCards.length})
                    </p>
                    <div className="space-y-1">
                      {convertedCards.map((c) => (
                        <div key={c.id}>{relationRow(c)}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!readOnly && task && (
              <ProjectPriorityWidget taskId={task.id} mode={currentStatus?.priority_mode ?? "edit"} />
            )}

            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-primary" />
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                  Timeline de raias
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-0 rounded-md border p-2">
                {statusHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 py-2">
                    Nenhum movimento registrado ainda. A partir de agora, cada troca de raia aparece aqui.
                  </p>
                ) : (
                  <ol className="relative ms-2 border-s border-border/70 ps-4">
                    {statusHistory.map((h) => {
                      const fromLabel = h.from_status_name
                        ? `${h.from_funnel_name ? `${h.from_funnel_name} · ` : ""}${h.from_status_name}`
                        : "—"
                      const toLabel = h.to_status_name
                        ? `${h.to_funnel_name ? `${h.to_funnel_name} · ` : ""}${h.to_status_name}`
                        : "—"
                      const who = h.moved_by_name ?? (h.source === "user" ? "Usuário" : "Sistema")
                      const sourceLabel = STATUS_HISTORY_SOURCE_LABELS[h.source] ?? h.source
                      return (
                        <li key={h.id} className="mb-3 last:mb-0">
                          <span className="absolute -start-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                          <div className="rounded bg-muted/40 px-2.5 py-2">
                            <p className="text-sm font-medium leading-snug">
                              <span className="text-muted-foreground">{fromLabel}</span>
                              {" → "}
                              <span>{toLabel}</span>
                            </p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                              <GitBranch className="inline h-3 w-3 shrink-0" />
                              <span className="font-medium text-foreground">{who}</span>
                              <span>·</span>
                              <span>{formatApiDateTime(h.moved_at)}</span>
                              <span>·</span>
                              <span>{sourceLabel}</span>
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-primary" />
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                  Comentários
                </p>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-2 rounded-md border p-2">
                {comments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
                ) : comments.map((c) => (
                  <div key={c.id} className="flex gap-2 rounded bg-muted/40 p-2">
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
                      title={c.author_name ?? "Sistema"}
                    >
                      {c.author_name ? initials(c.author_name) : "•"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <CommentBody content={c.content} />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        <span className="font-medium text-foreground">{c.author_name ?? "Sistema"}</span>
                        {" · "}
                        {formatApiDateTime(c.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <CommentComposer
                value={newComment}
                onChange={setNewComment}
                onSubmit={handleComment}
                submitting={sendingComment}
                authorName={authUser?.full_name ?? authUser?.email ?? "Você"}
              />
            </div>
          </div>
          </div>

          <div className="modal-foot">
            {!readOnly && (
              <button className="btn danger" onClick={handleDelete} disabled={removing}>
                {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Excluir
              </button>
            )}
            <span className="spacer" />
            <button className="btn" onClick={() => onOpenChange(false)}>Fechar</button>
            {!readOnly && (
              <button className="btn primary" onClick={handleSave} disabled={saving || !title.trim()}>
                {saving && <Loader2 size={13} className="animate-spin" />} Salvar
              </button>
            )}
          </div>
        </div>
      </div>
    )}

    {/* Diálogo: adicionar vínculo (item existente ou novo item) */}
    <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar vínculo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {task && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Você está adicionando um vínculo a partir de:</p>
              {relationRow(task, undefined, false)}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Tipo de vínculo</Label>
            {linkMode === "new" ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Item filho — cria um novo card vinculado a este.
              </p>
            ) : (
              <Select value={linkType} onValueChange={(v) => { setLinkType(v as "child" | "parent"); setLinkSelectedId("") }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="child">Item filho</SelectItem>
                  <SelectItem value="parent">Card pai</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {linkMode === "new" ? (
            <>
              <div className="space-y-1.5">
                <Label>Título do novo item</Label>
                <Input
                  value={childTitle}
                  onChange={(e) => setChildTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSubmitLink() } }}
                  placeholder="Ex.: Cadastro de usuário"
                  autoFocus
                />
              </div>
              {childTypeOptions.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={childTypeId || childTypeOptions[0].id} onValueChange={setChildTypeId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {childTypeOptions.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {childTypeOptions.length === 0 && (
                <p className="text-[11px] text-destructive">
                  O tipo deste card não aceita itens filhos. Configure em Tipos de Demanda → "Aceita como filhos".
                </p>
              )}
            </>
          ) : (
            <div className="space-y-1.5">
              <Label>Item de trabalho</Label>
              <Input
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder="Buscar item pelo título..."
              />
              <div className="max-h-48 divide-y overflow-y-auto rounded-md border">
                {linkCandidates.length === 0 ? (
                  <p className="p-2 text-[11px] italic text-muted-foreground/70">
                    {linkType === "child"
                      ? "Nenhum item compatível para ser filho deste card."
                      : "Nenhum item compatível para ser pai deste card."}
                  </p>
                ) : linkCandidates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setLinkSelectedId(t.id)}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted ${linkSelectedId === t.id ? "bg-primary/10" : ""}`}
                  >
                    <FileText size={13} className="shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{t.title}</span>
                    {demandTypeName(t.demand_type_id) && (
                      <Badge variant="secondary" className="text-[10px]">{demandTypeName(t.demand_type_id)}</Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancelar</Button>
          <Button
            type="button"
            onClick={() => void handleSubmitLink()}
            disabled={
              savingLink ||
              (linkMode === "new"
                ? (!childTitle.trim() || childTypeOptions.length === 0)
                : !linkSelectedId)
            }
          >
            {savingLink && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Adicionar vínculo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Diálogo: nomear o card criado pela conversão ao mudar de etapa */}
    <Dialog open={!!statusConvPrompt} onOpenChange={(v) => { if (!v) setStatusConvPrompt(null) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aprovar e criar {statusConvPrompt?.typeName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ao mover para esta etapa, o sistema cria um card do tipo{" "}
            <strong>{statusConvPrompt?.typeName}</strong> no kanban de destino. Confirme o nome:
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="conv-name">Nome do {statusConvPrompt?.typeName}</Label>
            <Input
              id="conv-name"
              value={statusConvPrompt?.name ?? ""}
              onChange={(e) => setStatusConvPrompt((p) => (p ? { ...p, name: e.target.value } : p))}
              onKeyDown={(e) => { if (e.key === "Enter") void confirmStatusConversion() }}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setStatusConvPrompt(null)} disabled={changingStatus}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void confirmStatusConversion()} disabled={changingStatus || !statusConvPrompt?.name.trim()}>
            {changingStatus && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Aprovar e criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <BacklogClassificationDialog
      open={classifyOpen}
      task={task}
      mode="late"
      onCancel={() => setClassifyOpen(false)}
      onConfirm={confirmLateClassification}
    />

    <Dialog open={planningEditOpen} onOpenChange={setPlanningEditOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Projeto / Programa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            A alteração é aplicada ao card de Projeto/Programa e propagada aos demais kanbans.
          </p>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["projeto", "programa"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPlanningKindDraft(k)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                    planningKindDraft === k ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground"
                  }`}
                >
                  {k === "projeto" ? "Projeto" : "Programa"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Em <strong>Programa</strong>, é obrigatório vincular a um programa existente (ou cadastrar um novo).
            </p>
          </div>

          {planningKindDraft === "programa" && (
            <div className="space-y-2">
              <Label>Programa</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPlanningProgramMode("select")}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${planningProgramMode === "select" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                >
                  Vincular existente
                </button>
                <button
                  type="button"
                  onClick={() => setPlanningProgramMode("new")}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${planningProgramMode === "new" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                >
                  Cadastrar novo
                </button>
              </div>
              {planningProgramMode === "select" ? (
                <>
                  <Select value={planningProgramId} onValueChange={setPlanningProgramId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um programa" />
                    </SelectTrigger>
                    <SelectContent>
                      {programs.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {programs.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Nenhum programa cadastrado ainda — use “Cadastrar novo”.</p>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <Input
                    placeholder="Nome do programa"
                    value={planningNewProgramName}
                    onChange={(e) => setPlanningNewProgramName(e.target.value)}
                  />
                  <Textarea
                    placeholder="Descrição (opcional)"
                    value={planningNewProgramDesc}
                    onChange={(e) => setPlanningNewProgramDesc(e.target.value)}
                    rows={2}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setPlanningEditOpen(false)} disabled={savingPlanning}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSavePlanning()} disabled={savingPlanning}>
            {savingPlanning ? <Loader2 size={14} className="animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

