import { useEffect, useState } from "react"
import { Check, ChevronDown, FileText, Link as LinkIcon, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"

import { projetosApi, type ProjectDemandFormField, type ProjectDemandFormSection, type ProjectDemandType, type ProjectStatus, type ProjectStatusSectionLink, type ProjectTask, type ProjectTaskComment } from "@/api/projetos"
import { Badge } from "@/components/ui/badge"
import { GitBranch } from "lucide-react"
import { teamopsApi } from "@/api/teamops"
import type { User } from "@/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormFieldRenderer, getFieldVisibility, type FieldVisibilityMode } from "@/modules/projetos/FormFieldRenderer"
import { getRowBreak, groupIntoRows } from "@/modules/projetos/layout"
import { formatMissingFieldsMessage, validateRequiredFields } from "@/modules/projetos/validation"
import { toast } from "@/lib/toast"

const NO_ASSIGNEE = "__none__"

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
  onSaved,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  task: ProjectTask | null
  isBasicUser: boolean
  onSaved: (task: ProjectTask) => void
  onDeleted: (taskId: string) => void
}) {
  const [users, setUsers] = useState<User[]>([])
  const [comments, setComments] = useState<ProjectTaskComment[]>([])
  const [selectedDemandTypeId, setSelectedDemandTypeId] = useState("")
  const [formSections, setFormSections] = useState<ProjectDemandFormSection[]>([])
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, ProjectDemandFormField[]>>({})
  const [sectionLinks, setSectionLinks] = useState<ProjectStatusSectionLink[]>([])
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [assignedTo, setAssignedTo] = useState<string>(NO_ASSIGNEE)
  const [startDate, setStartDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [parentTaskId, setParentTaskId] = useState<string>(NO_ASSIGNEE)
  const [demandTypes, setDemandTypes] = useState<ProjectDemandType[]>([])
  const [allTasks, setAllTasks] = useState<ProjectTask[]>([])
  const [children, setChildren] = useState<ProjectTask[]>([])
  const [childTitle, setChildTitle] = useState("")
  const [childTypeId, setChildTypeId] = useState("")
  const [statusMap, setStatusMap] = useState<Record<string, { name: string; color: string }>>({})
  const [allStatuses, setAllStatuses] = useState<ProjectStatus[]>([])
  const [statusId, setStatusId] = useState("")
  const [changingStatus, setChangingStatus] = useState(false)
  const [statusConvPrompt, setStatusConvPrompt] = useState<{ newStatusId: string; typeName: string; name: string } | null>(null)
  const [assigneeMenuOpen, setAssigneeMenuOpen] = useState(false)
  const [assigneeSearch, setAssigneeSearch] = useState("")
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
    const timer = setTimeout(() => {
      setTitle(task.title)
      setDescription(task.description ?? "")
      setAssignedTo(task.assigned_to ?? NO_ASSIGNEE)
      setStartDate(task.start_date ? task.start_date.slice(0, 10) : "")
      setDueDate(task.due_date ? task.due_date.slice(0, 10) : "")
      setSelectedDemandTypeId(task.demand_type_id ?? "")
      setParentTaskId(task.parent_task_id ?? NO_ASSIGNEE)
      setStatusId(task.status_id)
    }, 0)

    teamopsApi.listMembers()
      .then((ms) => setUsers(ms.map((m) => ({ id: m.id, full_name: m.full_name, email: m.email })) as unknown as User[]))
      .catch(() => setUsers([]))
    projetosApi.listTaskComments(projectId, task.id).then(setComments).catch(() => setComments([]))
    projetosApi.getTaskFormSubmission(projectId, task.id).then((submission) => {
      setFormValues(submission?.values ?? {})
    }).catch(() => setFormValues({}))
    projetosApi.listStatusSectionLinks(projectId, task.status_id).then(setSectionLinks).catch(() => setSectionLinks([]))
    projetosApi.listDemandTypes().then(setDemandTypes).catch(() => setDemandTypes([]))
    projetosApi.listTasks(projectId).then(setAllTasks).catch(() => setAllTasks([]))
    projetosApi.listTaskChildren(projectId, task.id).then(setChildren).catch(() => setChildren([]))
    projetosApi.listStatuses(projectId).then((sts) => {
      setAllStatuses(sts)
      setStatusMap(Object.fromEntries(sts.map((s) => [s.id, { name: s.name, color: s.color }])))
    }).catch(() => { setAllStatuses([]); setStatusMap({}) })
    return () => clearTimeout(timer)
  }, [open, task, projectId])

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
  const assigneeCandidates = users.filter((u) => {
    const q = assigneeSearch.trim().toLowerCase()
    return !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  async function handleSelectAssignee(uid: string | null) {
    if (!task || isBasicUser) return
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

  function relationRow(t: ProjectTask, onRemove?: () => void) {
    const st = statusMap[t.status_id]
    const typeName = demandTypeName(t.demand_type_id)
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText size={14} className="shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{t.title}</p>
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
        {onRemove && !isBasicUser && (
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
    const target = allStatuses.find((s) => s.id === newStatusId)
    const current = allStatuses.find((s) => s.id === statusId)
    if (!target) return
    // Avançar de etapa exige os campos obrigatórios da etapa atual preenchidos.
    const isForward = !!(current && target.funnel_id === current.funnel_id && target.order > current.order)
    if (isForward) {
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
      const updated = await projetosApi.updateTask(projectId, task.id, {
        demand_type_id: selectedDemandTypeId || null,
        parent_task_id: parentTaskId === NO_ASSIGNEE ? null : parentTaskId,
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: isBasicUser ? undefined : (assignedTo === NO_ASSIGNEE ? null : assignedTo),
        start_date: startDate ? new Date(`${startDate}T00:00:00`).toISOString() : null,
        due_date: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
        form_values: formValues,
      })
      onSaved(updated)
      onOpenChange(false)
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

  async function handleComment() {
    if (!task || !newComment.trim()) return
    setSendingComment(true)
    try {
      const created = await projetosApi.createTaskComment(projectId, task.id, newComment.trim())
      setComments((prev) => [...prev, created])
      setNewComment("")
    } finally {
      setSendingComment(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? `Tarefa — ${task.title}` : "Tarefa"}</DialogTitle>
        </DialogHeader>

        {!task ? null : (
          <div className="space-y-5">
            {/* Cabeçalho: tipo, estado, título e meta (estilo Azure DevOps) */}
            <div className="space-y-2 border-b border-border pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1 uppercase tracking-wide">
                  <FileText size={12} />
                  {demandTypeName(task.demand_type_id) ?? "Card"}
                </Badge>
                {statusMap[statusId] && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${statusMap[statusId].color}1A`, color: statusMap[statusId].color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusMap[statusId].color }} />
                    {statusMap[statusId].name}
                  </span>
                )}
                {task.sla_state && task.sla_state !== "none" && (
                  <Badge variant={task.sla_state === "breached" ? "destructive" : "secondary"} className="text-[10px]">
                    {task.sla_state === "breached" ? "SLA estourado" : task.sla_state === "warning" ? "SLA em alerta" : "No prazo"}
                  </Badge>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  Atualizado em {new Date(task.updated_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-auto border-0 px-0 text-lg font-bold shadow-none focus-visible:ring-0"
                placeholder="Título do card"
              />
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {isBasicUser ? (
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
                      onClick={() => setAssigneeMenuOpen((o) => !o)}
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
                )}
                <span>·</span>
                <span>{comments.length} comentário{comments.length === 1 ? "" : "s"}</span>
              </div>
            </div>

            {/* Corpo em 3 colunas: Descrição | Planejamento | Trabalho relacionado */}
            <div className="grid gap-6 lg:grid-cols-4">
              {/* Coluna 1 — Descrição + formulário do tipo */}
              <div className="space-y-5 lg:col-span-2">
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>

            {formSections.length > 0 && (
              <div className="space-y-6">
                {formSections.map((section) => {
                  const secMode = sectionMode(section.id)
                  const visibleFields = (fieldsBySection[section.id] ?? [])
                    .filter((f) => f.is_active)
                    .filter((f) => fieldMode(f, secMode) !== "hidden")
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
                              const mode = fieldMode(field, secMode)
                              const isReadOnly = mode === "visible"
                              const isRequired = mode === "required" || (mode === "editable" && field.is_required)
                              const fieldError = fieldErrors[field.id]
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
              </div>
            )}
              </div>

              {/* Coluna 2 — Planejamento (campos do nosso modelo) */}
              <div className="space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Planejamento</p>
                <div className="space-y-1.5">
                  <Label>Início</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Prazo</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Etapa</Label>
                  {isBasicUser ? (
                    <p className="text-sm">{statusMap[statusId]?.name ?? "—"}</p>
                  ) : (
                    <Select value={statusId} onValueChange={(v) => void handleSelectStatus(v)} disabled={changingStatus}>
                      <SelectTrigger><SelectValue placeholder="Selecionar etapa" /></SelectTrigger>
                      <SelectContent>
                        {currentFunnelStatuses.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Coluna 3 — Trabalho relacionado (origem, pai e filhos) */}
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <GitBranch size={14} className="text-primary" />
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Trabalho relacionado</p>
                  </div>
                  {!isBasicUser && (
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

                {originTask && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-muted-foreground">Origem</p>
                    {relationRow(originTask)}
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground">Pai</p>
                  {parentTask
                    ? relationRow(parentTask, () => void handleUnlinkParent())
                    : <p className="text-[11px] italic text-muted-foreground/70">Sem card pai.</p>}
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground">Filhos ({children.length})</p>
                  {children.length === 0 ? (
                    <p className="text-[11px] italic text-muted-foreground/70">Nenhum item filho.</p>
                  ) : (
                    <div className="space-y-1">
                      {children.map((c) => (
                        <div key={c.id}>{relationRow(c, () => void handleUnlinkChild(c))}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-primary" />
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                  Comentários
                </p>
              </div>
              <div className="max-h-44 overflow-y-auto space-y-2 rounded-md border p-2">
                {comments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
                ) : comments.map((c) => (
                  <div key={c.id} className="rounded bg-muted/40 p-2">
                    <p className="text-sm">{c.content}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {new Date(c.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Adicionar comentário..."
                />
                <Button type="button" onClick={handleComment} disabled={sendingComment || !newComment.trim()}>
                  {sendingComment && <Loader2 size={13} className="animate-spin mr-1.5" />}
                  Enviar
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="destructive" className="mr-auto" onClick={handleDelete} disabled={removing || !task}>
            {removing ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Trash2 size={13} className="mr-1.5" />}
            Excluir
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
              {relationRow(task)}
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
    </>
  )
}

