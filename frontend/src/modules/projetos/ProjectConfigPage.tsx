import { useEffect, useMemo, useState } from "react"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"

import { projetosApi, type Project, type ProjectFunnel, type ProjectStatus } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"

export default function ProjectConfigPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [funnels, setFunnels] = useState<ProjectFunnel[]>([])
  const [statuses, setStatuses] = useState<ProjectStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [selectedFunnelId, setSelectedFunnelId] = useState("")

  const [newFunnelName, setNewFunnelName] = useState("")
  const [newFunnelColor, setNewFunnelColor] = useState("#7C3AED")
  const [newStatusName, setNewStatusName] = useState("")
  const [newStatusColor, setNewStatusColor] = useState("#6B7280")
  const [newProcessName, setNewProcessName] = useState("")
  const [newProcessDescription, setNewProcessDescription] = useState("")
  const [editingProcessId, setEditingProcessId] = useState<string | null>(null)
  const [processDraftName, setProcessDraftName] = useState("")
  const [processDraftDescription, setProcessDraftDescription] = useState("")
  const [draggingFunnelId, setDraggingFunnelId] = useState<string | null>(null)
  const [draggingStatusId, setDraggingStatusId] = useState<string | null>(null)
  const [editingFunnelId, setEditingFunnelId] = useState<string | null>(null)
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [funnelDraftName, setFunnelDraftName] = useState("")
  const [funnelDraftColor, setFunnelDraftColor] = useState("#7C3AED")
  const [statusDraftName, setStatusDraftName] = useState("")
  const [statusDraftColor, setStatusDraftColor] = useState("#6B7280")

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
      setProjects(data)
      setSelectedProjectId((current) => current || data[0]?.id || "")
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedProjectId) {
      setFunnels([])
      setStatuses([])
      setSelectedFunnelId("")
      return
    }
    projetosApi.listFunnels(selectedProjectId, false).then((data) => {
      const ordered = [...data].sort((a, b) => a.order - b.order)
      setFunnels(ordered)
      const defaultFunnel = ordered.find((f) => f.is_default) ?? ordered[0]
      setSelectedFunnelId(defaultFunnel?.id ?? "")
    })
  }, [selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId || !selectedFunnelId) {
      const timer = setTimeout(() => setStatuses([]), 0)
      return () => clearTimeout(timer)
    }
    projetosApi.listStatuses(selectedProjectId, selectedFunnelId).then((data) => {
      setStatuses([...data].sort((a, b) => a.order - b.order))
    })
  }, [selectedProjectId, selectedFunnelId])

  async function handleCreateFunnel() {
    if (!selectedProjectId || !newFunnelName.trim()) return
    const created = await projetosApi.createFunnel(selectedProjectId, {
      name: newFunnelName.trim(),
      color: newFunnelColor,
      order: funnels.length,
      is_default: funnels.length === 0,
      is_active: true,
    })
    const next = [...funnels, created].sort((a, b) => a.order - b.order)
    const ordered = await projetosApi.reorderFunnels(selectedProjectId, toReorderPayload(next))
    setFunnels([...ordered].sort((a, b) => a.order - b.order))
    setSelectedFunnelId(created.id)
    setNewFunnelName("")
  }

  async function handleCreateProcess() {
    if (!newProcessName.trim()) return
    const created = await projetosApi.createProject({
      name: newProcessName.trim(),
      description: newProcessDescription.trim() || undefined,
    })
    setProjects((prev) => [created, ...prev])
    setSelectedProjectId(created.id)
    setNewProcessName("")
    setNewProcessDescription("")
  }

  function beginEditProcess(project: Project) {
    setEditingProcessId(project.id)
    setProcessDraftName(project.name)
    setProcessDraftDescription(project.description ?? "")
  }

  async function saveEditProcess(projectId: string) {
    if (!processDraftName.trim()) return
    const updated = await projetosApi.updateProject(projectId, {
      name: processDraftName.trim(),
      description: processDraftDescription.trim() || null,
    })
    setProjects((prev) => prev.map((p) => (p.id === projectId ? updated : p)))
    setEditingProcessId(null)
  }

  async function handleDeleteProcess(projectId: string) {
    if (!window.confirm("Tem certeza que deseja excluir este processo? Esta ação remove funis, colunas e cards relacionados.")) {
      return
    }
    await projetosApi.deleteProject(projectId)
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== projectId)
      setSelectedProjectId((current) => (current === projectId ? (next[0]?.id ?? "") : current))
      return next
    })
  }

  async function handleDeleteFunnel(funnelId: string) {
    if (!selectedProjectId) return
    await projetosApi.deleteFunnel(selectedProjectId, funnelId)
    const next = funnels.filter((f) => f.id !== funnelId)
    const ordered = await projetosApi.reorderFunnels(selectedProjectId, toReorderPayload(next))
    setFunnels([...ordered].sort((a, b) => a.order - b.order))
    if (selectedFunnelId === funnelId) {
      setSelectedFunnelId(ordered[0]?.id ?? "")
    }
  }

  async function handleCreateStatus() {
    if (!selectedProjectId || !selectedFunnelId || !newStatusName.trim()) return
    const created = await projetosApi.createStatus(selectedProjectId, {
      funnel_id: selectedFunnelId,
      name: newStatusName.trim(),
      color: newStatusColor,
      order: statuses.length,
    })
    const next = [...statuses, created].sort((a, b) => a.order - b.order)
    const ordered = await projetosApi.reorderStatuses(selectedProjectId, selectedFunnelId, toReorderPayload(next))
    setStatuses([...ordered].sort((a, b) => a.order - b.order))
    setNewStatusName("")
  }

  async function handleDeleteStatus(statusId: string) {
    if (!selectedProjectId || !selectedFunnelId) return
    await projetosApi.deleteStatus(selectedProjectId, selectedFunnelId, statusId)
    const next = statuses.filter((s) => s.id !== statusId)
    const ordered = await projetosApi.reorderStatuses(selectedProjectId, selectedFunnelId, toReorderPayload(next))
    setStatuses([...ordered].sort((a, b) => a.order - b.order))
  }

  async function handleSetDefaultFunnel(funnelId: string) {
    if (!selectedProjectId) return
    const updated = await projetosApi.updateFunnel(selectedProjectId, funnelId, { is_default: true })
    setFunnels((prev) =>
      prev.map((item) => {
        if (item.id === updated.id) return updated
        return { ...item, is_default: false }
      })
    )
  }

  function beginEditFunnel(funnel: ProjectFunnel) {
    setEditingFunnelId(funnel.id)
    setFunnelDraftName(funnel.name)
    setFunnelDraftColor(funnel.color)
  }

  async function saveEditFunnel(funnelId: string) {
    if (!selectedProjectId || !funnelDraftName.trim()) return
    const updated = await projetosApi.updateFunnel(selectedProjectId, funnelId, {
      name: funnelDraftName.trim(),
      color: funnelDraftColor,
    })
    setFunnels((prev) => prev.map((f) => (f.id === funnelId ? updated : f)))
    setEditingFunnelId(null)
  }

  function beginEditStatus(status: ProjectStatus) {
    setEditingStatusId(status.id)
    setStatusDraftName(status.name)
    setStatusDraftColor(status.color)
  }

  async function saveEditStatus(statusId: string) {
    if (!selectedProjectId || !selectedFunnelId || !statusDraftName.trim()) return
    const updated = await projetosApi.updateStatus(selectedProjectId, selectedFunnelId, statusId, {
      name: statusDraftName.trim(),
      color: statusDraftColor,
    })
    setStatuses((prev) => prev.map((s) => (s.id === statusId ? updated : s)))
    setEditingStatusId(null)
  }

  async function handleDropFunnel(targetFunnelId: string) {
    if (!selectedProjectId || !draggingFunnelId || draggingFunnelId === targetFunnelId) return
    const from = funnels.findIndex((f) => f.id === draggingFunnelId)
    const to = funnels.findIndex((f) => f.id === targetFunnelId)
    if (from < 0 || to < 0) return
    const next = moveItem(funnels, from, to)
    setFunnels(next)
    const ordered = await projetosApi.reorderFunnels(selectedProjectId, toReorderPayload(next))
    setFunnels([...ordered].sort((a, b) => a.order - b.order))
    setDraggingFunnelId(null)
  }

  async function handleDropStatus(targetStatusId: string) {
    if (!selectedProjectId || !selectedFunnelId || !draggingStatusId || draggingStatusId === targetStatusId) return
    const from = statuses.findIndex((s) => s.id === draggingStatusId)
    const to = statuses.findIndex((s) => s.id === targetStatusId)
    if (from < 0 || to < 0) return
    const next = moveItem(statuses, from, to)
    setStatuses(next)
    const ordered = await projetosApi.reorderStatuses(selectedProjectId, selectedFunnelId, toReorderPayload(next))
    setStatuses([...ordered].sort((a, b) => a.order - b.order))
    setDraggingStatusId(null)
  }

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Configurações de Processos</h1>
        <p className="text-sm text-muted-foreground">Cadastre múltiplos funis e organize as colunas de cada funil.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Processos (CRUD)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 rounded-md border p-3">
              <Label>Novo processo</Label>
              <Input
                placeholder="Nome do processo"
                value={newProcessName}
                onChange={(e) => setNewProcessName(e.target.value)}
              />
              <Input
                placeholder="Descrição (opcional)"
                value={newProcessDescription}
                onChange={(e) => setNewProcessDescription(e.target.value)}
              />
              <Button type="button" onClick={handleCreateProcess}>
                <Plus size={14} className="mr-1" />
                Criar processo
              </Button>
            </div>

            <div className="space-y-2">
              {projects.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem processos cadastrados.</p>
              )}
              {projects.map((project) => (
                <div key={project.id} className="rounded-md border p-2">
                  {editingProcessId === project.id ? (
                    <div className="space-y-2">
                      <Input value={processDraftName} onChange={(e) => setProcessDraftName(e.target.value)} />
                      <Input value={processDraftDescription} onChange={(e) => setProcessDraftDescription(e.target.value)} />
                      <div className="flex gap-1">
                        <Button type="button" size="icon" variant="ghost" onClick={() => void saveEditProcess(project.id)}>
                          <Check size={14} />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" onClick={() => setEditingProcessId(null)}>
                          <X size={14} />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => setSelectedProjectId(project.id)}
                      >
                        <p className={selectedProjectId === project.id ? "font-semibold text-primary" : "font-medium"}>
                          {project.name}
                        </p>
                        {project.description && (
                          <p className="truncate text-xs text-muted-foreground">{project.description}</p>
                        )}
                      </button>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => beginEditProcess(project)}>
                          <Pencil size={14} />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => void handleDeleteProcess(project.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <div className="max-w-sm">
            <Label>Processo</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um processo" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedProjectId ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-sm text-muted-foreground">Selecione ou crie um processo para gerenciar funis e colunas.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Funis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Nome do funil" value={newFunnelName} onChange={(e) => setNewFunnelName(e.target.value)} />
              <Input className="w-20" type="color" value={newFunnelColor} onChange={(e) => setNewFunnelColor(e.target.value)} />
              <Button type="button" onClick={handleCreateFunnel}>
                <Plus size={14} className="mr-1" />
                Criar
              </Button>
            </div>
            <div className="space-y-2">
              {funnels.map((funnel) => (
                <div
                  key={funnel.id}
                  className="flex items-center justify-between rounded-md border p-2"
                  draggable
                  onDragStart={() => setDraggingFunnelId(funnel.id)}
                  onDragEnd={() => setDraggingFunnelId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { void handleDropFunnel(funnel.id) }}
                >
                  {editingFunnelId === funnel.id ? (
                    <div className="flex w-full items-center gap-2">
                      <Input value={funnelDraftName} onChange={(e) => setFunnelDraftName(e.target.value)} />
                      <Input className="w-16" type="color" value={funnelDraftColor} onChange={(e) => setFunnelDraftColor(e.target.value)} />
                      <Button type="button" size="icon" variant="ghost" onClick={() => void saveEditFunnel(funnel.id)}>
                        <Check size={14} />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" onClick={() => setEditingFunnelId(null)}>
                        <X size={14} />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="flex items-center gap-2 text-sm"
                        onClick={() => setSelectedFunnelId(funnel.id)}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: funnel.color }} />
                        <span className={selectedFunnelId === funnel.id ? "font-semibold" : ""}>{funnel.name}</span>
                        {funnel.is_default && <Badge variant="outline">padrão</Badge>}
                      </button>
                      <div className="flex items-center gap-1">
                        {!funnel.is_default && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => void handleSetDefaultFunnel(funnel.id)}>
                            Padrão
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="icon" onClick={() => beginEditFunnel(funnel)}>
                          <Pencil size={14} />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => void handleDeleteFunnel(funnel.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Colunas do funil</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedFunnel ? (
              <p className="text-sm text-muted-foreground">Selecione um funil para gerenciar as colunas.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input placeholder="Nome da coluna" value={newStatusName} onChange={(e) => setNewStatusName(e.target.value)} />
                  <Input className="w-20" type="color" value={newStatusColor} onChange={(e) => setNewStatusColor(e.target.value)} />
                  <Button type="button" onClick={handleCreateStatus}>
                    <Plus size={14} className="mr-1" />
                    Criar
                  </Button>
                </div>
                <div className="space-y-2">
                  {statuses.map((status) => (
                    <div
                      key={status.id}
                      className="flex items-center justify-between rounded-md border p-2"
                      draggable
                      onDragStart={() => setDraggingStatusId(status.id)}
                      onDragEnd={() => setDraggingStatusId(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { void handleDropStatus(status.id) }}
                    >
                      {editingStatusId === status.id ? (
                        <div className="flex w-full items-center gap-2">
                          <Input value={statusDraftName} onChange={(e) => setStatusDraftName(e.target.value)} />
                          <Input className="w-16" type="color" value={statusDraftColor} onChange={(e) => setStatusDraftColor(e.target.value)} />
                          <Button type="button" size="icon" variant="ghost" onClick={() => void saveEditStatus(status.id)}>
                            <Check size={14} />
                          </Button>
                          <Button type="button" size="icon" variant="ghost" onClick={() => setEditingStatusId(null)}>
                            <X size={14} />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                            <span>{status.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button type="button" variant="ghost" size="icon" onClick={() => beginEditStatus(status)}>
                              <Pencil size={14} />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" onClick={() => void handleDeleteStatus(status.id)}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
