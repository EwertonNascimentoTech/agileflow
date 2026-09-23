import { Fragment, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Check, GripVertical, KanbanSquare, Loader2, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react"

import { projetosApi, type ProjectDemandFormField, type ProjectDemandFormSection, type ProjectDemandType, type ProjectFunnel, type ProjectStatus, type ProjectStatusSectionLink } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { EmptyState } from "@/components/EmptyState"
import { getFieldVisibility, type FieldVisibilityMode } from "@/modules/projetos/FormFieldRenderer"
import { StatusAutomationsManager } from "@/modules/projetos/config/StatusAutomationsManager"
import { companyApi } from "@/api/crm"
import type { User, Role } from "@/types"

type SectionMode = "__none__" | FieldVisibilityMode
type FieldMode = "__none__" | FieldVisibilityMode

interface Flags {
  visible: boolean
  editable: boolean
  required: boolean
}

function modeToFlags(mode: SectionMode | FieldMode): Flags {
  if (mode === "required") return { visible: true, editable: true, required: true }
  if (mode === "editable") return { visible: true, editable: true, required: false }
  if (mode === "visible") return { visible: true, editable: false, required: false }
  // "hidden" and "__none__" both render as all-unchecked.
  return { visible: false, editable: false, required: false }
}

function flagsToMode(flags: Flags): SectionMode {
  if (flags.required) return "required"
  if (flags.editable) return "editable"
  if (flags.visible) return "visible"
  return "hidden"
}

export default function ProjectStatusesConfigPage() {
  const navigate = useNavigate()
  const [funnels, setFunnels] = useState<ProjectFunnel[]>([])
  const [statuses, setStatuses] = useState<ProjectStatus[]>([])
  const [demandTypes, setDemandTypes] = useState<ProjectDemandType[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [sections, setSections] = useState<ProjectDemandFormSection[]>([])
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, ProjectDemandFormField[]>>({})
  const [linksByStatus, setLinksByStatus] = useState<Record<string, ProjectStatusSectionLink[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [selectedFunnelId, setSelectedFunnelId] = useState("")

  const [openCreate, setOpenCreate] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [newStatusName, setNewStatusName] = useState("")
  const [newStatusColor, setNewStatusColor] = useState("#6B7280")
  const [newStatusActive, setNewStatusActive] = useState(true)
  const [newStatusInitial, setNewStatusInitial] = useState(false)
  const [newStatusFinal, setNewStatusFinal] = useState(false)
  const [draggingStatusId, setDraggingStatusId] = useState<string | null>(null)
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null)
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [statusDraftName, setStatusDraftName] = useState("")
  const [statusDraftColor, setStatusDraftColor] = useState("#6B7280")
  const [statusDraftActive, setStatusDraftActive] = useState(true)

  const selectedFunnel = useMemo(
    () => funnels.find((f) => f.id === selectedFunnelId) ?? null,
    [funnels, selectedFunnelId]
  )

  function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
    const next = [...items]
    const [removed] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, removed)
    return next
  }

  function toReorderPayload<T extends { id: string }>(items: T[]) {
    return items.map((item, index) => ({ id: item.id, order: index }))
  }

  useEffect(() => {
    projetosApi.listProjects(true).then((data) => {
      if (data[0]) setSelectedProjectId(data[0].id)
    }).finally(() => setLoading(false))
    projetosApi.listDemandTypes(true).then(setDemandTypes)
    companyApi.listUsers({ active_only: true }).then(setUsers).catch(() => setUsers([]))
    companyApi.listRoles().then(setRoles).catch(() => setRoles([]))
  }, [])

  async function handleToggleMoveRole(status: ProjectStatus, roleId: string) {
    if (!selectedProjectId || !selectedFunnelId) return
    const current = status.move_in_role_ids ?? []
    const next = current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]
    const updated = await projetosApi.updateStatus(selectedProjectId, selectedFunnelId, status.id, { move_in_role_ids: next })
    setStatuses((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  async function handleSetSla(status: ProjectStatus, slaHours: number | null, warningPct: number) {
    if (!selectedProjectId || !selectedFunnelId) return
    const updated = await projetosApi.updateStatus(selectedProjectId, selectedFunnelId, status.id, {
      sla_hours: slaHours,
      sla_warning_pct: warningPct,
    })
    setStatuses((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  useEffect(() => {
    if (!selectedProjectId) return
    projetosApi.listFunnels(selectedProjectId, false).then((data) => {
      const ordered = [...data].sort((a, b) => a.order - b.order)
      setFunnels(ordered)
      const defaultFunnel = ordered.find((f) => f.is_default) ?? ordered[0]
      setSelectedFunnelId(defaultFunnel?.id ?? "")
    })
  }, [selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId || !selectedFunnelId) {
      setStatuses([])
      return
    }
    projetosApi.listStatuses(selectedProjectId, selectedFunnelId).then((data) => {
      setStatuses([...data].sort((a, b) => a.order - b.order))
    })
  }, [selectedProjectId, selectedFunnelId])

  const eligibleDemandTypes = useMemo(
    () => (selectedFunnelId ? demandTypes.filter((t) => t.funnel_id === selectedFunnelId) : []),
    [demandTypes, selectedFunnelId]
  )

  useEffect(() => {
    if (eligibleDemandTypes.length === 0) {
      setSections([])
      setFieldsBySection({})
      return
    }
    async function load() {
      const rows = await Promise.all(
        eligibleDemandTypes.map(async (dt) => ({
          dt,
          sections: await projetosApi.listDemandSections(dt.id, true).catch(() => [] as ProjectDemandFormSection[]),
        }))
      )
      const allSections: ProjectDemandFormSection[] = []
      rows.forEach((row) => {
        const ordered = [...row.sections].sort((a, b) => a.order - b.order)
        allSections.push(...ordered)
      })
      setSections(allSections)
      const fieldRows = await Promise.all(
        rows.flatMap((row) =>
          row.sections.map(async (s) => ({
            sectionId: s.id,
            fields: await projetosApi.listDemandFields(row.dt.id, s.id, false).catch(() => [] as ProjectDemandFormField[]),
          }))
        )
      )
      const map: Record<string, ProjectDemandFormField[]> = {}
      fieldRows.forEach((row) => { map[row.sectionId] = [...row.fields].sort((a, b) => a.order - b.order) })
      setFieldsBySection(map)
    }
    void load()
  }, [eligibleDemandTypes])

  const sectionsByDemandType = useMemo(() => {
    const map = new Map<string, ProjectDemandFormSection[]>()
    sections.forEach((s) => {
      if (!s.demand_type_id) return
      if (!map.has(s.demand_type_id)) map.set(s.demand_type_id, [])
      map.get(s.demand_type_id)!.push(s)
    })
    return map
  }, [sections])

  useEffect(() => {
    if (!selectedProjectId || statuses.length === 0) {
      setLinksByStatus({})
      return
    }
    Promise.all(
      statuses.map(async (status) => ({
        statusId: status.id,
        links: await projetosApi.listStatusSectionLinks(selectedProjectId, status.id),
      }))
    ).then((rows) => {
      const mapped: Record<string, ProjectStatusSectionLink[]> = {}
      rows.forEach((row) => { mapped[row.statusId] = row.links })
      setLinksByStatus(mapped)
    })
  }, [selectedProjectId, statuses])

  function resetCreateForm() {
    setNewStatusName("")
    setNewStatusColor("#6B7280")
    setNewStatusActive(true)
    setNewStatusInitial(false)
    setNewStatusFinal(false)
  }

  function openCreateDialog() {
    resetCreateForm()
    setOpenCreate(true)
  }

  function getApiError(err: unknown): string {
    const e = err as { response?: { data?: { detail?: unknown } } }
    const d = e.response?.data?.detail
    if (typeof d === "string") return d
    return "Não foi possível concluir a ação."
  }

  async function handleCreateStatus() {
    if (!selectedProjectId || !selectedFunnelId || !newStatusName.trim()) return
    setSavingCreate(true)
    try {
      const created = await projetosApi.createStatus(selectedProjectId, {
        funnel_id: selectedFunnelId,
        name: newStatusName.trim(),
        color: newStatusColor,
        order: statuses.length,
        is_initial: newStatusInitial,
        is_final: newStatusFinal,
        is_active: newStatusActive,
      })
      const next = [...statuses, created].sort((a, b) => a.order - b.order)
      const ordered = await projetosApi.reorderStatuses(selectedProjectId, selectedFunnelId, toReorderPayload(next))
      setStatuses([...ordered].sort((a, b) => a.order - b.order))
      setOpenCreate(false)
      resetCreateForm()
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setSavingCreate(false)
    }
  }

  async function handleDeleteStatus(statusId: string) {
    if (!selectedProjectId || !selectedFunnelId) return
    await projetosApi.deleteStatus(selectedProjectId, selectedFunnelId, statusId)
    const next = statuses.filter((s) => s.id !== statusId)
    const ordered = await projetosApi.reorderStatuses(selectedProjectId, selectedFunnelId, toReorderPayload(next))
    setStatuses([...ordered].sort((a, b) => a.order - b.order))
  }

  function beginEditStatus(status: ProjectStatus) {
    setEditingStatusId(status.id)
    setStatusDraftName(status.name)
    setStatusDraftColor(status.color)
    setStatusDraftActive(status.is_active)
  }

  async function saveEditStatus(statusId: string) {
    if (!selectedProjectId || !selectedFunnelId || !statusDraftName.trim()) return
    const updated = await projetosApi.updateStatus(selectedProjectId, selectedFunnelId, statusId, {
      name: statusDraftName.trim(),
      color: statusDraftColor,
      is_active: statusDraftActive,
    })
    setStatuses((prev) => prev.map((s) => (s.id === statusId ? updated : s)))
    setEditingStatusId(null)
  }

  async function handleToggleStatusActive(status: ProjectStatus) {
    if (!selectedProjectId || !selectedFunnelId) return
    const updated = await projetosApi.updateStatus(selectedProjectId, selectedFunnelId, status.id, {
      is_active: !status.is_active,
    })
    setStatuses((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  async function handleSetCreatesType(status: ProjectStatus, demandTypeId: string | null) {
    if (!selectedProjectId || !selectedFunnelId) return
    const updated = await projetosApi.updateStatus(selectedProjectId, selectedFunnelId, status.id, {
      creates_demand_type_id: demandTypeId,
    })
    setStatuses((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  async function handleSetMovesToFunnel(status: ProjectStatus, funnelId: string | null) {
    if (!selectedProjectId || !selectedFunnelId) return
    const updated = await projetosApi.updateStatus(selectedProjectId, selectedFunnelId, status.id, {
      moves_to_funnel_id: funnelId,
    })
    setStatuses((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  function sectionLink(statusId: string, sectionId: string): ProjectStatusSectionLink | null {
    return (linksByStatus[statusId] ?? []).find((l) => l.section_id === sectionId) ?? null
  }

  function sectionModeFor(statusId: string, sectionId: string): SectionMode {
    return (sectionLink(statusId, sectionId)?.mode as FieldVisibilityMode | undefined) ?? "__none__"
  }

  function fieldModeFor(statusId: string, field: ProjectDemandFormField): FieldMode {
    const entry = getFieldVisibility(field).find((v) => v.status_id === statusId)
    return entry?.mode ?? "__none__"
  }

  async function handleSetSectionMode(statusId: string, sectionId: string, mode: SectionMode) {
    if (!selectedProjectId) return
    if (mode === "__none__") {
      const link = sectionLink(statusId, sectionId)
      if (!link) return
      await projetosApi.deleteStatusSectionLink(selectedProjectId, statusId, link.id)
      setLinksByStatus((prev) => ({
        ...prev,
        [statusId]: (prev[statusId] ?? []).filter((l) => l.id !== link.id),
      }))
      return
    }
    const upserted = await projetosApi.upsertStatusSectionLink(selectedProjectId, statusId, {
      section_id: sectionId,
      mode,
    })
    setLinksByStatus((prev) => {
      const filtered = (prev[statusId] ?? []).filter((l) => l.section_id !== sectionId)
      return { ...prev, [statusId]: [...filtered, upserted] }
    })
  }

  function toggleFlag(current: Flags, key: keyof Flags, checked: boolean): Flags {
    if (key === "visible") {
      if (!checked) return { visible: false, editable: false, required: false }
      return { ...current, visible: true }
    }
    if (key === "editable") {
      if (!checked) return { ...current, editable: false, required: false }
      return { ...current, visible: true, editable: true }
    }
    if (!checked) return { ...current, required: false }
    return { visible: true, editable: true, required: true }
  }

  async function handleToggleSectionFlag(statusId: string, sectionId: string, flag: keyof Flags, checked: boolean) {
    const current = modeToFlags(sectionModeFor(statusId, sectionId))
    const next = toggleFlag(current, flag, checked)
    await handleSetSectionMode(statusId, sectionId, flagsToMode(next))
  }

  async function handleToggleFieldFlag(statusId: string, demandTypeId: string, sectionId: string, field: ProjectDemandFormField, flag: keyof Flags, checked: boolean) {
    const current = modeToFlags(fieldModeFor(statusId, field))
    const next = toggleFlag(current, flag, checked)
    await handleSetFieldMode(statusId, demandTypeId, sectionId, field, flagsToMode(next))
  }

  async function handleSetFieldMode(statusId: string, demandTypeId: string, sectionId: string, field: ProjectDemandFormField, mode: FieldMode) {
    if (!demandTypeId) return
    const current = getFieldVisibility(field).filter((v) => v.status_id !== statusId)
    const nextEntries = mode === "__none__" ? current : [...current, { status_id: statusId, mode }]
    const validation = nextEntries.length > 0 ? { ...(field.validation ?? {}), visibility: nextEntries } : null
    const updated = await projetosApi.updateDemandField(demandTypeId, sectionId, field.id, { validation })
    setFieldsBySection((prev) => {
      const list = (prev[sectionId] ?? []).map((f) => (f.id === field.id ? updated : f))
      return { ...prev, [sectionId]: list }
    })
  }

  async function handleDropStatus(targetStatusId: string) {
    setDragOverStatusId(null)
    if (!selectedProjectId || !selectedFunnelId || !draggingStatusId || draggingStatusId === targetStatusId) {
      setDraggingStatusId(null)
      return
    }
    const from = statuses.findIndex((s) => s.id === draggingStatusId)
    const to = statuses.findIndex((s) => s.id === targetStatusId)
    setDraggingStatusId(null)
    if (from < 0 || to < 0) return
    const next = moveItem(statuses, from, to)
    setStatuses(next)
    try {
      const ordered = await projetosApi.reorderStatuses(selectedProjectId, selectedFunnelId, toReorderPayload(next))
      setStatuses([...ordered].sort((a, b) => a.order - b.order))
    } catch (err) {
      alert(getApiError(err))
      const fresh = await projetosApi.listStatuses(selectedProjectId, selectedFunnelId, false)
      setStatuses([...fresh].sort((a, b) => a.order - b.order))
    }
  }

  if (loading) {
    return <Skeleton className="h-36 rounded-lg" />
  }

  if (!selectedProjectId) {
    return (
      <EmptyState
        icon={KanbanSquare}
        title="Não foi possível carregar"
        description="Recarregue a página em instantes."
      />
    )
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/modules/projetos/config")}>
          <ArrowLeft size={16} />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Etapas Kanban</h2>
          <p className="text-sm text-muted-foreground">Configure as colunas de cada funil e o formulário em cada etapa.</p>
        </div>
        <Button
          type="button"
          className="gap-1.5"
          onClick={openCreateDialog}
          disabled={!selectedFunnelId}
        >
          <Plus size={14} />
          Nova Etapa
        </Button>
      </div>

      <div className="max-w-sm">
        <Label>Funil</Label>
        <Select value={selectedFunnelId} onValueChange={setSelectedFunnelId}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {funnels.map((funnel) => (
              <SelectItem key={funnel.id} value={funnel.id}>{funnel.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedFunnel && eligibleDemandTypes.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Tipos vinculados: {eligibleDemandTypes.map((t) => t.name).join(", ")}
          </p>
        )}
      </div>

      {statuses.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="Nenhuma etapa configurada"
          description={selectedFunnelId
            ? "Crie a primeira etapa para começar a configurar o kanban."
            : "Selecione um funil para configurar as etapas."}
          action={selectedFunnelId ? { label: "Nova Etapa", onClick: openCreateDialog } : undefined}
        />
      ) : (
      <div className="space-y-2">
        {statuses.map((status) => {
          const isDragging = draggingStatusId === status.id
          const isDropTarget = dragOverStatusId === status.id && draggingStatusId !== status.id
          return (
          <Card
            key={status.id}
            onDragOver={(e) => {
              if (!draggingStatusId || draggingStatusId === status.id) return
              e.preventDefault()
              if (dragOverStatusId !== status.id) setDragOverStatusId(status.id)
            }}
            onDragLeave={() => {
              if (dragOverStatusId === status.id) setDragOverStatusId(null)
            }}
            onDrop={() => { void handleDropStatus(status.id) }}
            className={[
              "transition-all",
              isDragging ? "opacity-50" : "",
              isDropTarget ? "ring-2 ring-primary ring-offset-1" : "",
            ].filter(Boolean).join(" ")}
          >
            <CardContent className="p-3">
              {editingStatusId === status.id ? (
                <div className="flex w-full items-center gap-2">
                  <Input value={statusDraftName} onChange={(e) => setStatusDraftName(e.target.value)} />
                  <Input className="w-16" type="color" value={statusDraftColor} onChange={(e) => setStatusDraftColor(e.target.value)} />
                  <div className="flex items-center gap-1 rounded-md border px-2 py-1">
                    <Label className="text-xs">Ativa</Label>
                    <Switch checked={statusDraftActive} onCheckedChange={setStatusDraftActive} />
                  </div>
                  <Button type="button" size="icon" variant="ghost" onClick={() => void saveEditStatus(status.id)}>
                    <Check size={14} />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setEditingStatusId(null)}>
                    <X size={14} />
                  </Button>
                </div>
              ) : (
                <>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      draggable
                      onDragStart={(e) => {
                        setDraggingStatusId(status.id)
                        e.dataTransfer.effectAllowed = "move"
                      }}
                      onDragEnd={() => { setDraggingStatusId(null); setDragOverStatusId(null) }}
                      className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
                      title="Arraste para reordenar"
                    >
                      <GripVertical size={14} />
                    </span>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                    <span className="font-medium">{status.name}</span>
                    {status.is_initial && <Badge variant="outline" className="text-[10px]">inicial</Badge>}
                    {status.is_final && <Badge variant="outline" className="text-[10px]">final</Badge>}
                    {!status.is_active && <Badge variant="secondary">inativa</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => beginEditStatus(status)}>
                      <Pencil size={14} />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void handleToggleStatusActive(status)}>
                      {status.is_active ? "Inativar" : "Ativar"}
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => void handleDeleteStatus(status.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
                  <Label className="text-xs whitespace-nowrap text-muted-foreground">
                    Ao entrar nesta etapa, gerar card do tipo
                  </Label>
                  <Select
                    value={status.creates_demand_type_id ?? "__none__"}
                    onValueChange={(v) => void handleSetCreatesType(status, v === "__none__" ? null : v)}
                  >
                    <SelectTrigger className="h-8 text-xs max-w-xs">
                      <SelectValue placeholder="Não converte" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não converte</SelectItem>
                      {demandTypes.map((dt) => (
                        <SelectItem key={dt.id} value={dt.id}>{dt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {status.creates_demand_type_id && (
                    <Badge variant="info" className="text-[10px]">conversão automática</Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
                  <Label className="text-xs whitespace-nowrap text-muted-foreground">
                    Ao entrar nesta etapa, mover o card para o kanban
                  </Label>
                  <Select
                    value={status.moves_to_funnel_id ?? "__none__"}
                    onValueChange={(v) => void handleSetMovesToFunnel(status, v === "__none__" ? null : v)}
                  >
                    <SelectTrigger className="h-8 text-xs max-w-xs">
                      <SelectValue placeholder="Não move" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não move</SelectItem>
                      {funnels.filter((f) => f.id !== selectedFunnelId).map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {status.moves_to_funnel_id && (
                    <Badge variant="success" className="text-[10px]">transição automática</Badge>
                  )}
                </div>
                <StatusAutomationsManager projectId={selectedProjectId} statusId={status.id} users={users} />
                {roles.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 p-2">
                    <span className="text-xs text-muted-foreground">Quem pode mover para esta etapa:</span>
                    {roles.map((r) => {
                      const selected = (status.move_in_role_ids ?? []).includes(r.id)
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => void handleToggleMoveRole(status, r.id)}
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] transition ${
                            selected
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : "border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {r.name}
                        </button>
                      )
                    })}
                    {(status.move_in_role_ids ?? []).length === 0 && (
                      <span className="text-[11px] italic text-muted-foreground/70">todos (sem restrição)</span>
                    )}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
                  <span className="text-xs text-muted-foreground">SLA:</span>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-24 text-xs"
                    placeholder="horas"
                    defaultValue={status.sla_hours ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      const hours = v === "" ? null : Math.max(1, parseInt(v, 10) || 0)
                      if ((status.sla_hours ?? null) !== hours) void handleSetSla(status, hours, status.sla_warning_pct)
                    }}
                  />
                  <span className="text-xs text-muted-foreground">h · alerta em</span>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    className="h-8 w-16 text-xs"
                    defaultValue={status.sla_warning_pct}
                    disabled={!status.sla_hours}
                    onBlur={(e) => {
                      const pct = Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 80))
                      if (status.sla_warning_pct !== pct) void handleSetSla(status, status.sla_hours, pct)
                    }}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  {!status.sla_hours && <span className="text-[11px] italic text-muted-foreground/70">sem SLA</span>}
                </div>
                <div className="mt-2 rounded-md border bg-muted/30 p-2 space-y-2">
                  <p className="text-xs font-medium">Formulário nesta etapa</p>
                  {eligibleDemandTypes.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">
                      Nenhum tipo de demanda está vinculado a este kanban. Vincule em <span className="underline">Configurações → Tipos de Demanda</span>.
                    </p>
                  ) : sections.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">Os tipos vinculados não têm sessões configuradas.</p>
                  ) : (
                    <div className="space-y-3">
                      {eligibleDemandTypes.map((dt) => {
                        const dtSections = sectionsByDemandType.get(dt.id) ?? []
                        if (dtSections.length === 0) return null
                        return (
                          <div key={dt.id} className="rounded-md border bg-background overflow-hidden">
                            {eligibleDemandTypes.length > 1 && (
                              <p className="border-b bg-muted/40 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                                Tipo · {dt.name}
                              </p>
                            )}
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
                                  <th className="px-3 py-1.5 text-left font-medium">Campo</th>
                                  <th className="w-16 px-1 py-1.5 text-center font-medium" title="Obrigatório">Obrig.</th>
                                  <th className="w-16 px-1 py-1.5 text-center font-medium" title="Editável">Edit.</th>
                                  <th className="w-16 px-1 py-1.5 text-center font-medium" title="Visível">Visib.</th>
                                  <th className="w-10 px-1 py-1.5"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {dtSections.map((section) => {
                                  const sectionFlags = modeToFlags(sectionModeFor(status.id, section.id))
                                  const fields = fieldsBySection[section.id] ?? []
                                  return (
                                    <Fragment key={section.id}>
                                      <tr className="border-b bg-muted/20">
                                        <td className="px-3 py-2 text-xs font-bold uppercase tracking-wide">
                                          {section.title}
                                        </td>
                                        <td className="text-center">
                                          <input
                                            type="checkbox"
                                            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                                            checked={sectionFlags.required}
                                            onChange={(e) => void handleToggleSectionFlag(status.id, section.id, "required", e.target.checked)}
                                          />
                                        </td>
                                        <td className="text-center">
                                          <input
                                            type="checkbox"
                                            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                                            checked={sectionFlags.editable}
                                            onChange={(e) => void handleToggleSectionFlag(status.id, section.id, "editable", e.target.checked)}
                                          />
                                        </td>
                                        <td className="text-center">
                                          <input
                                            type="checkbox"
                                            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                                            checked={sectionFlags.visible}
                                            onChange={(e) => void handleToggleSectionFlag(status.id, section.id, "visible", e.target.checked)}
                                          />
                                        </td>
                                        <td></td>
                                      </tr>
                                      {fields.map((field) => {
                                        const flags = modeToFlags(fieldModeFor(status.id, field))
                                        return (
                                          <tr key={field.id} className="border-b last:border-b-0">
                                            <td className="px-3 py-1.5">
                                              <span className="text-sm text-primary">{field.field_key}</span>
                                              {!field.is_active && (
                                                <Badge variant="secondary" className="ml-1.5 text-[10px]">inativo</Badge>
                                              )}
                                            </td>
                                            <td className="text-center">
                                              <input
                                                type="checkbox"
                                                className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                                                checked={flags.required}
                                                onChange={(e) => void handleToggleFieldFlag(status.id, dt.id, section.id, field, "required", e.target.checked)}
                                              />
                                            </td>
                                            <td className="text-center">
                                              <input
                                                type="checkbox"
                                                className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                                                checked={flags.editable}
                                                onChange={(e) => void handleToggleFieldFlag(status.id, dt.id, section.id, field, "editable", e.target.checked)}
                                              />
                                            </td>
                                            <td className="text-center">
                                              <input
                                                type="checkbox"
                                                className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                                                checked={flags.visible}
                                                onChange={(e) => void handleToggleFieldFlag(status.id, dt.id, section.id, field, "visible", e.target.checked)}
                                              />
                                            </td>
                                            <td className="text-center">
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                className="h-7 w-9"
                                                title="Editar campo no formulário"
                                                onClick={() => navigate(`/app/modules/projetos/config/demand-types/${dt.id}`)}
                                              >
                                                <MoreHorizontal size={14} />
                                              </Button>
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </Fragment>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                </>
              )}
            </CardContent>
          </Card>
          )
        })}
      </div>
      )}

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Etapa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={newStatusName}
                onChange={(e) => setNewStatusName(e.target.value)}
                placeholder="Ex: Backlog, Em andamento, Concluído"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-10 w-14 p-1"
                    value={newStatusColor}
                    onChange={(e) => setNewStatusColor(e.target.value)}
                  />
                  <Input
                    value={newStatusColor}
                    onChange={(e) => setNewStatusColor(e.target.value)}
                    placeholder="#6B7280"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <div className="flex h-10 items-center gap-2 rounded-md border px-3">
                  <Switch checked={newStatusActive} onCheckedChange={setNewStatusActive} />
                  <span className="text-sm text-muted-foreground">
                    {newStatusActive ? "Ativa" : "Inativa"}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Switch checked={newStatusInitial} onCheckedChange={setNewStatusInitial} />
                <div className="leading-tight">
                  <Label className="text-sm">Etapa inicial</Label>
                  <p className="text-[11px] text-muted-foreground">Novas demandas começam aqui.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Switch checked={newStatusFinal} onCheckedChange={setNewStatusFinal} />
                <div className="leading-tight">
                  <Label className="text-sm">Etapa final</Label>
                  <p className="text-[11px] text-muted-foreground">Considera a demanda concluída.</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreateStatus()}
              disabled={savingCreate || !newStatusName.trim()}
            >
              {savingCreate && <Loader2 size={13} className="animate-spin mr-1.5" />}
              Criar Etapa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
