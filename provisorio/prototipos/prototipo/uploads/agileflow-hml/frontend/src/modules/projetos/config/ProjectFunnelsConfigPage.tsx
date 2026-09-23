import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Check, ChevronDown, ChevronUp, GitBranch, GripVertical, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"

import { projetosApi, type ProjectFunnel, type ProjectDemandType } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/EmptyState"
import { toast } from "@/lib/toast"

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  return "Não foi possível excluir o kanban."
}

export default function ProjectFunnelsConfigPage() {
  const navigate = useNavigate()
  const [funnels, setFunnels] = useState<ProjectFunnel[]>([])
  const [demandTypes, setDemandTypes] = useState<ProjectDemandType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState("")

  const [openCreate, setOpenCreate] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [newFunnelName, setNewFunnelName] = useState("")
  const [newFunnelDescription, setNewFunnelDescription] = useState("")
  const [newFunnelColor, setNewFunnelColor] = useState("#7C3AED")
  const [newFunnelActive, setNewFunnelActive] = useState(true)
  const [draggingFunnelId, setDraggingFunnelId] = useState<string | null>(null)
  const [editingFunnelId, setEditingFunnelId] = useState<string | null>(null)
  const [funnelDraftName, setFunnelDraftName] = useState("")
  const [funnelDraftDescription, setFunnelDraftDescription] = useState("")
  const [funnelDraftColor, setFunnelDraftColor] = useState("#7C3AED")
  const [funnelDraftActive, setFunnelDraftActive] = useState(true)

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
    projetosApi.listDemandTypes(true).then(setDemandTypes).catch(() => setDemandTypes([]))
  }, [])

  async function handleToggleAllowedType(funnel: ProjectFunnel, typeId: string) {
    if (!selectedProjectId) return
    const current = funnel.allowed_demand_type_ids ?? []
    const next = current.includes(typeId)
      ? current.filter((id) => id !== typeId)
      : [...current, typeId]
    const updated = await projetosApi.updateFunnel(selectedProjectId, funnel.id, { allowed_demand_type_ids: next })
    setFunnels((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
  }

  useEffect(() => {
    if (!selectedProjectId) return
    projetosApi.listFunnels(selectedProjectId, false).then((data) => {
      setFunnels([...data].sort((a, b) => a.order - b.order))
    })
  }, [selectedProjectId])

  function resetCreateForm() {
    setNewFunnelName("")
    setNewFunnelDescription("")
    setNewFunnelColor("#7C3AED")
    setNewFunnelActive(true)
  }

  function openCreateDialog() {
    resetCreateForm()
    setOpenCreate(true)
  }

  async function handleCreateFunnel() {
    if (!selectedProjectId || !newFunnelName.trim()) return
    setSavingCreate(true)
    try {
      const created = await projetosApi.createFunnel(selectedProjectId, {
        name: newFunnelName.trim(),
        description: newFunnelDescription.trim() || undefined,
        color: newFunnelColor,
        order: funnels.length,
        is_default: funnels.length === 0,
        is_active: newFunnelActive,
      })
      const next = [...funnels, created].sort((a, b) => a.order - b.order)
      const ordered = await projetosApi.reorderFunnels(selectedProjectId, toReorderPayload(next))
      setFunnels([...ordered].sort((a, b) => a.order - b.order))
      setOpenCreate(false)
      resetCreateForm()
    } finally {
      setSavingCreate(false)
    }
  }

  async function handleDeleteFunnel(funnelId: string) {
    if (!selectedProjectId) return
    if (!window.confirm("Excluir este kanban? As colunas vazias serão removidas junto.")) return
    try {
      await projetosApi.deleteFunnel(selectedProjectId, funnelId)
      const next = funnels.filter((f) => f.id !== funnelId)
      const ordered = await projetosApi.reorderFunnels(selectedProjectId, toReorderPayload(next))
      setFunnels([...ordered].sort((a, b) => a.order - b.order))
      toast.success("Kanban excluído.")
    } catch (err) {
      toast.error(getApiError(err))
    }
  }

  async function handleSetDefaultFunnel(funnelId: string) {
    if (!selectedProjectId) return
    const updated = await projetosApi.updateFunnel(selectedProjectId, funnelId, { is_default: true })
    setFunnels((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : { ...item, is_default: false }))
    )
  }

  function beginEditFunnel(funnel: ProjectFunnel) {
    setEditingFunnelId(funnel.id)
    setFunnelDraftName(funnel.name)
    setFunnelDraftDescription(funnel.description ?? "")
    setFunnelDraftColor(funnel.color)
    setFunnelDraftActive(funnel.is_active)
  }

  async function saveEditFunnel(funnelId: string) {
    if (!selectedProjectId || !funnelDraftName.trim()) return
    const updated = await projetosApi.updateFunnel(selectedProjectId, funnelId, {
      name: funnelDraftName.trim(),
      description: funnelDraftDescription.trim() || null,
      color: funnelDraftColor,
      is_active: funnelDraftActive,
    })
    setFunnels((prev) => prev.map((f) => (f.id === funnelId ? updated : f)))
    setEditingFunnelId(null)
  }

  async function handleToggleActive(funnel: ProjectFunnel) {
    if (!selectedProjectId) return
    const updated = await projetosApi.updateFunnel(selectedProjectId, funnel.id, {
      is_active: !funnel.is_active,
    })
    setFunnels((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  async function persistOrder(next: ProjectFunnel[]) {
    if (!selectedProjectId) return
    setFunnels(next)
    try {
      const ordered = await projetosApi.reorderFunnels(selectedProjectId, toReorderPayload(next))
      setFunnels([...ordered].sort((a, b) => a.order - b.order))
    } catch (err) {
      toast.error(getApiError(err))
      // recarrega do servidor para desfazer a reordenação otimista que falhou
      projetosApi.listFunnels(selectedProjectId, false).then((data) =>
        setFunnels([...data].sort((a, b) => a.order - b.order))
      )
    }
  }

  async function handleDropFunnel(targetFunnelId: string) {
    if (!selectedProjectId || !draggingFunnelId || draggingFunnelId === targetFunnelId) return
    const from = funnels.findIndex((f) => f.id === draggingFunnelId)
    const to = funnels.findIndex((f) => f.id === targetFunnelId)
    setDraggingFunnelId(null)
    if (from < 0 || to < 0) return
    await persistOrder(moveItem(funnels, from, to))
  }

  async function moveFunnelBy(index: number, delta: number) {
    const to = index + delta
    if (to < 0 || to >= funnels.length) return
    await persistOrder(moveItem(funnels, index, to))
  }

  if (loading) {
    return <Skeleton className="h-36 rounded-lg" />
  }

  if (!selectedProjectId) {
    return (
      <EmptyState
        icon={GitBranch}
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
          <h2 className="text-lg font-bold">Funis</h2>
          <p className="text-sm text-muted-foreground">Crie e gerencie os funis do kanban.</p>
        </div>
        <Button type="button" className="gap-1.5" onClick={openCreateDialog}>
          <Plus size={14} />
          Novo Funil
        </Button>
      </div>

      {funnels.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="Nenhum funil cadastrado"
          description="Crie o primeiro funil para começar a organizar suas demandas."
          action={{ label: "Novo Funil", onClick: openCreateDialog }}
        />
      ) : (
      <div className="space-y-2">
        {funnels.map((funnel, index) => (
          <Card
            key={funnel.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { void handleDropFunnel(funnel.id) }}
            className={draggingFunnelId === funnel.id ? "opacity-50" : undefined}
          >
            <CardContent className="p-3">
              {editingFunnelId === funnel.id ? (
                <div className="w-full space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={funnelDraftName} onChange={(e) => setFunnelDraftName(e.target.value)} />
                    <Input className="w-16" type="color" value={funnelDraftColor} onChange={(e) => setFunnelDraftColor(e.target.value)} />
                    <div className="flex items-center gap-1 rounded-md border px-2 py-1">
                      <Label className="text-xs">Ativo</Label>
                      <Switch checked={funnelDraftActive} onCheckedChange={setFunnelDraftActive} />
                    </div>
                    <Button type="button" size="icon" variant="ghost" onClick={() => void saveEditFunnel(funnel.id)}>
                      <Check size={14} />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setEditingFunnelId(null)}>
                      <X size={14} />
                    </Button>
                  </div>
                  <Input
                    value={funnelDraftDescription}
                    onChange={(e) => setFunnelDraftDescription(e.target.value)}
                    placeholder="Descrição do funil"
                  />
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => void moveFunnelBy(index, -1)}
                      className="text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                      title="Mover para cima"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <span
                      draggable
                      onDragStart={() => setDraggingFunnelId(funnel.id)}
                      onDragEnd={() => setDraggingFunnelId(null)}
                      className="cursor-grab text-muted-foreground/50 active:cursor-grabbing"
                      title="Arraste para reordenar"
                    >
                      <GripVertical size={14} />
                    </span>
                    <button
                      type="button"
                      disabled={index === funnels.length - 1}
                      onClick={() => void moveFunnelBy(index, 1)}
                      className="text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                      title="Mover para baixo"
                    >
                      <ChevronDown size={15} />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: funnel.color }} />
                      <span className="font-medium break-words">{funnel.name}</span>
                      {funnel.is_default && <Badge variant="outline">padrão</Badge>}
                      {!funnel.is_active && <Badge variant="secondary">inativo</Badge>}
                    </div>
                    {funnel.description && (
                      <p className="text-xs text-muted-foreground mt-1 break-words whitespace-pre-wrap">{funnel.description}</p>
                    )}
                    {demandTypes.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">Tipos permitidos:</span>
                        {demandTypes.map((t) => {
                          const selected = (funnel.allowed_demand_type_ids ?? []).includes(t.id)
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => void handleToggleAllowedType(funnel, t.id)}
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] transition ${
                                selected
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "border-border text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {t.name}
                            </button>
                          )
                        })}
                        {(funnel.allowed_demand_type_ids ?? []).length === 0 && (
                          <span className="text-[11px] italic text-muted-foreground/70">todos (sem restrição)</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!funnel.is_default && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => void handleSetDefaultFunnel(funnel.id)}>
                        Padrão
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" onClick={() => beginEditFunnel(funnel)}>
                      <Pencil size={14} />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void handleToggleActive(funnel)}>
                      {funnel.is_active ? "Inativar" : "Ativar"}
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => void handleDeleteFunnel(funnel.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      )}

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Funil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={newFunnelName}
                onChange={(e) => setNewFunnelName(e.target.value)}
                placeholder="Ex: Suporte, Vendas, Demandas internas"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                rows={3}
                value={newFunnelDescription}
                onChange={(e) => setNewFunnelDescription(e.target.value)}
                placeholder="Para que serve esse funil? (opcional)"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-10 w-14 p-1"
                    value={newFunnelColor}
                    onChange={(e) => setNewFunnelColor(e.target.value)}
                  />
                  <Input
                    value={newFunnelColor}
                    onChange={(e) => setNewFunnelColor(e.target.value)}
                    placeholder="#7C3AED"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <div className="flex h-10 items-center gap-2 rounded-md border px-3">
                  <Switch checked={newFunnelActive} onCheckedChange={setNewFunnelActive} />
                  <span className="text-sm text-muted-foreground">
                    {newFunnelActive ? "Ativo" : "Inativo"}
                  </span>
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
              onClick={() => void handleCreateFunnel()}
              disabled={savingCreate || !newFunnelName.trim()}
            >
              {savingCreate && <Loader2 size={13} className="animate-spin mr-1.5" />}
              Criar Funil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
