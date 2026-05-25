import { useEffect, useMemo, useState } from "react"
import { CalendarRange, Loader2 } from "lucide-react"

import { companyApi } from "@/api/crm"
import { projetosApi, type ProjectDemandType, type ProjectTask } from "@/api/projetos"
import type { User } from "@/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { GanttChart } from "@/modules/projetos/GanttChart"
import { toast } from "@/lib/toast"

const NO_ASSIGNEE = "__none__"

export default function GanttPage() {
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [demandTypes, setDemandTypes] = useState<ProjectDemandType[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [projectId, setProjectId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [rootId, setRootId] = useState<string>("")
  const [editId, setEditId] = useState<string | null>(null)

  // Diálogo de criação (raiz quando parentId = null; filho caso contrário)
  const [createOpen, setCreateOpen] = useState(false)
  const [createParentId, setCreateParentId] = useState<string | null>(null)
  const [createTitle, setCreateTitle] = useState("")
  const [createDescription, setCreateDescription] = useState("")
  const [createTypeId, setCreateTypeId] = useState("")
  const [createStart, setCreateStart] = useState("")
  const [createDue, setCreateDue] = useState("")
  const [createAssignee, setCreateAssignee] = useState(NO_ASSIGNEE)
  const [savingCreate, setSavingCreate] = useState(false)

  async function reload(pid = projectId) {
    if (!pid) return
    const ts = await projetosApi.listTasks(pid)
    setTasks(ts)
  }

  // Edição rápida de datas direto na linha (otimista; reverte no erro).
  async function handleUpdateDates(task: ProjectTask, patch: { start_date?: string | null; due_date?: string | null }) {
    if (!projectId) return
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)))
    try {
      await projetosApi.updateTask(projectId, task.id, patch)
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível atualizar a data.")
      await reload()
    }
  }

  useEffect(() => {
    async function load() {
      const projects = await projetosApi.listProjects(true)
      const pid = projects[0]?.id
      if (!pid) return
      setProjectId(pid)
      const [ts, dts, us] = await Promise.all([
        projetosApi.listTasks(pid),
        projetosApi.listDemandTypes(true),
        companyApi.listUsers({ active_only: true }).catch(() => [] as User[]),
      ])
      setTasks(ts)
      setDemandTypes(dts)
      setUsers(us)
    }
    load().finally(() => setLoading(false))
  }, [])

  const typeName = useMemo(() => {
    const m = new Map(demandTypes.map((t) => [t.id, t.name]))
    return (id: string | null) => (id ? m.get(id) ?? null : null)
  }, [demandTypes])

  // Só entram no cronograma itens cujo tipo está marcado como "Visível no cronograma".
  const scheduleTasks = useMemo(() => {
    const visible = new Set(demandTypes.filter((d) => d.show_in_schedule).map((d) => d.id))
    return tasks.filter((t) => !!t.demand_type_id && visible.has(t.demand_type_id))
  }, [tasks, demandTypes])

  // Raízes do cronograma: cards que já têm filhos OU itens de topo de um tipo "container"
  // (tipo que aceita filhos) — assim um Projeto recém-criado já aparece para planejar.
  const roots = useMemo(() => {
    const parentIds = new Set(scheduleTasks.map((t) => t.parent_task_id).filter(Boolean) as string[])
    const containerTypeIds = new Set(
      demandTypes.filter((d) => (d.allowed_child_type_ids ?? []).length > 0).map((d) => d.id),
    )
    return scheduleTasks
      .filter(
        (t) =>
          parentIds.has(t.id) ||
          (!t.parent_task_id && !!t.demand_type_id && containerTypeIds.has(t.demand_type_id)),
      )
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [scheduleTasks, demandTypes])

  useEffect(() => {
    if (!rootId && roots.length > 0) setRootId(roots[0].id)
  }, [roots, rootId])

  // Tipos oferecidos no diálogo de criação
  const createTypeOptions = useMemo(() => {
    if (createParentId) {
      const parent = tasks.find((t) => t.id === createParentId)
      const parentType = demandTypes.find((d) => d.id === parent?.demand_type_id)
      const allowed = parentType?.allowed_child_type_ids ?? []
      return demandTypes.filter((d) => d.is_active && allowed.includes(d.id))
    }
    const containers = demandTypes.filter((d) => d.is_active && d.funnel_id && (d.allowed_child_type_ids ?? []).length > 0)
    return containers.length > 0 ? containers : demandTypes.filter((d) => d.is_active && d.funnel_id)
  }, [createParentId, tasks, demandTypes])

  function openCreate(parentId: string | null) {
    setEditId(null)
    setCreateParentId(parentId)
    setCreateTitle("")
    setCreateDescription("")
    setCreateStart("")
    setCreateDue("")
    setCreateAssignee(NO_ASSIGNEE)
    setCreateTypeId("")
    setCreateOpen(true)
  }

  function openEdit(task: ProjectTask) {
    setEditId(task.id)
    setCreateParentId(task.parent_task_id ?? null)
    setCreateTitle(task.title)
    setCreateDescription(task.description ?? "")
    setCreateTypeId(task.demand_type_id ?? "")
    setCreateStart(task.start_date ? task.start_date.slice(0, 10) : "")
    setCreateDue(task.due_date ? task.due_date.slice(0, 10) : "")
    setCreateAssignee(task.assigned_to ?? NO_ASSIGNEE)
    setCreateOpen(true)
  }

  async function handleCreate() {
    if (!projectId || !createTitle.trim()) return
    // Modo edição: atualiza o item (sem mexer em etapa/kanban/tipo).
    if (editId) {
      setSavingCreate(true)
      try {
        await projetosApi.updateTask(projectId, editId, {
          title: createTitle.trim().slice(0, 200),
          description: createDescription.trim() || null,
          start_date: createStart ? new Date(`${createStart}T00:00:00`).toISOString() : null,
          due_date: createDue ? new Date(`${createDue}T00:00:00`).toISOString() : null,
          assigned_to: createAssignee !== NO_ASSIGNEE ? createAssignee : null,
        })
        await reload()
        setCreateOpen(false)
        toast.success("Item atualizado.")
      } catch (err) {
        const e = err as { response?: { data?: { detail?: unknown } } }
        toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível salvar.")
      } finally {
        setSavingCreate(false)
      }
      return
    }
    const typeId = createTypeId || createTypeOptions[0]?.id
    const type = demandTypes.find((d) => d.id === typeId)
    if (!type) {
      toast.error("Selecione um tipo.")
      return
    }
    setSavingCreate(true)
    try {
      let statusId = ""
      if (type.funnel_id) {
        const sts = await projetosApi.listStatuses(projectId, type.funnel_id, true)
        const initial = sts.find((s) => s.is_initial) ?? [...sts].sort((a, b) => a.order - b.order)[0]
        statusId = initial?.id ?? ""
      }
      if (!statusId) {
        toast.error("O tipo precisa estar vinculado a um kanban com etapa inicial.")
        return
      }
      const created = await projetosApi.createTask(projectId, {
        status_id: statusId,
        demand_type_id: typeId,
        parent_task_id: createParentId,
        title: createTitle.trim().slice(0, 200),
        description: createDescription.trim() || null,
        start_date: createStart ? new Date(`${createStart}T00:00:00`).toISOString() : null,
        due_date: createDue ? new Date(`${createDue}T00:00:00`).toISOString() : null,
        assigned_to: createAssignee !== NO_ASSIGNEE ? createAssignee : null,
      })
      await reload()
      if (!createParentId) setRootId(created.id)
      setCreateOpen(false)
      toast.success(createParentId ? "Item filho criado." : "Item criado.")
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível criar o item.")
    } finally {
      setSavingCreate(false)
    }
  }

  if (loading) return <div className="p-4"><Skeleton className="h-96 rounded-lg" /></div>

  return (
    <div className="w-full space-y-4 p-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Cronograma</h2>
          <p className="text-sm text-muted-foreground">
            Linha do tempo de um programa ou projeto e seus itens. Clique num item para editar datas e responsável; use “+” para adicionar filhos.
          </p>
        </div>
        {roots.length > 0 && (
          <Select value={rootId} onValueChange={setRootId}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Escolha o programa/projeto" />
            </SelectTrigger>
            <SelectContent>
              {roots.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}{typeName(r.demand_type_id) ? ` · ${typeName(r.demand_type_id)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {roots.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Nada para exibir no cronograma"
          description="Crie um Projeto/Programa no kanban (ou abra um card e adicione itens filhos). Itens que possuem filhos aparecem aqui para montar a linha do tempo."
        />
      ) : (
        <>
          <GanttChart
            rootId={rootId}
            tasks={scheduleTasks}
            users={users}
            onOpenTask={(t) => openEdit(t)}
            onAddChild={(t) => openCreate(t.id)}
            onUpdateDates={handleUpdateDates}
          />
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-primary" /> em andamento</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-success" /> concluído</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-warning" /> SLA em alerta</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-destructive" /> SLA estourado</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-destructive/60" /> hoje</span>
          </div>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editId
                ? "Editar item"
                : createParentId
                  ? `Novo item filho de “${tasks.find((t) => t.id === createParentId)?.title ?? ""}”`
                  : "Novo item do cronograma"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Ex.: Portal do Cliente"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                rows={3}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Detalhes do item (opcional)"
              />
            </div>
            {editId ? (
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                  {typeName(createTypeId) ?? "—"}
                </div>
              </div>
            ) : createTypeOptions.length === 0 ? (
              <p className="text-[11px] text-destructive">
                {createParentId
                  ? "O tipo do item pai não aceita filhos. Configure em Tipos de Demanda → “Aceita como filhos”."
                  : "Nenhum tipo disponível. Configure um tipo vinculado a um kanban em Tipos de Demanda."}
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={createTypeId || createTypeOptions[0].id} onValueChange={setCreateTypeId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {createTypeOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input type="date" value={createStart} onChange={(e) => setCreateStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo</Label>
                <Input type="date" value={createDue} onChange={(e) => setCreateDue(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={createAssignee} onValueChange={setCreateAssignee}>
                <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ASSIGNEE}>Sem responsável</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={savingCreate || !createTitle.trim() || (!editId && createTypeOptions.length === 0)}
            >
              {savingCreate && <Loader2 size={13} className="animate-spin mr-1.5" />}
              {editId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
