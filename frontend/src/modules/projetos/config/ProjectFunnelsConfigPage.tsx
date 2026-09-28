import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Check, ChevronDown, ChevronUp, GitBranch, GripVertical, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"

import { projetosApi, type ProjectFunnel, type ProjectDemandType, type FunnelAccessLevel } from "@/api/projetos"
import { teamopsApi, type Position } from "@/api/teamops"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Card, PageHeader, Pill, SectionCard } from "@/components/ds"
import { EmptyState } from "@/components/EmptyState"
import { toast } from "@/lib/toast"

const ACCESS_OPTIONS: { value: FunnelAccessLevel; label: string; hint: string }[] = [
  { value: "manage", label: "Gerenciar", hint: "Criar, mover e editar cards" },
  { value: "view", label: "Visualizar", hint: "Somente leitura do kanban" },
  { value: "none", label: "Sem acesso", hint: "Kanban oculto para a função" },
]

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
  const [positions, setPositions] = useState<Position[]>([])
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
    teamopsApi.listPositions(true).then(setPositions).catch(() => setPositions([]))
  }, [])

  async function handleSetFunnelAccess(funnel: ProjectFunnel, position: Position, level: FunnelAccessLevel) {
    if (!selectedProjectId) return
    // O access_control é chaveado por role_id; cada cargo tem um role por trás. Provisiona sob demanda.
    let roleId = position.role_id
    if (!roleId) {
      roleId = await teamopsApi.ensurePositionRole(position.id)
      setPositions((prev) => prev.map((p) => (p.id === position.id ? { ...p, role_id: roleId } : p)))
    }
    const current = { ...(funnel.access_control ?? {}) }
    if (level === "manage") {
      delete current[roleId] // "manage" é o padrão — não precisa persistir
    } else {
      current[roleId] = level
    }
    const updated = await projetosApi.updateFunnel(selectedProjectId, funnel.id, { access_control: current })
    setFunnels((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
  }

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

  function renderHeader(withCreate: boolean) {
    return (
      <PageHeader
        crumbs={[{ label: "Configurações", to: "/app/modules/projetos/config" }, { label: "Funis" }]}
        icon={GitBranch}
        color="#2563EB"
        title="Funis"
        description="Crie e gerencie os funis do kanban."
        actions={
          <>
            <Button variant="outline" className="h-10 gap-1.5" onClick={() => navigate("/app/modules/projetos/config")}>
              <ArrowLeft size={16} />
              Voltar às Configurações
            </Button>
            {withCreate && (
              <Button type="button" className="h-10 gap-1.5" onClick={openCreateDialog}>
                <Plus size={16} />
                Novo Funil
              </Button>
            )}
          </>
        }
      />
    )
  }

  if (loading) {
    return (
      <div className="w-full space-y-5">
        {renderHeader(false)}
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    )
  }

  if (!selectedProjectId) {
    return (
      <div className="w-full space-y-5">
        {renderHeader(false)}
        <Card>
          <EmptyState
            icon={GitBranch}
            title="Não foi possível carregar"
            description="Recarregue a página em instantes."
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full space-y-5">
      {renderHeader(true)}

      {funnels.length === 0 ? (
        <Card>
          <EmptyState
            icon={GitBranch}
            title="Nenhum funil cadastrado"
            description="Crie o primeiro funil para começar a organizar suas demandas."
            action={{ label: "Novo Funil", onClick: openCreateDialog }}
          />
        </Card>
      ) : (
      <SectionCard
        title="Funis do kanban"
        subtitle="Arraste pela alça ou use as setas para mudar a ordem."
        icon={GitBranch}
        right={<Pill tone="slate">{funnels.length} {funnels.length === 1 ? "funil" : "funis"}</Pill>}
        flush
      >
        <ul className="divide-y">
        {funnels.map((funnel, index) => (
          <li
            key={funnel.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { void handleDropFunnel(funnel.id) }}
            className={`px-5 py-4 transition-opacity ${draggingFunnelId === funnel.id ? "opacity-50" : ""}`}
          >
              {editingFunnelId === funnel.id ? (
                <div className="w-full space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="h-10 min-w-[12rem] flex-1"
                      aria-label="Nome do funil"
                      value={funnelDraftName}
                      onChange={(e) => setFunnelDraftName(e.target.value)}
                    />
                    <Input className="h-10 w-16 p-1" type="color" aria-label="Cor do funil" value={funnelDraftColor} onChange={(e) => setFunnelDraftColor(e.target.value)} />
                    <div className="flex h-10 items-center gap-2 rounded-md border bg-background px-3">
                      <Label className="text-sm">Ativo</Label>
                      <Switch checked={funnelDraftActive} onCheckedChange={setFunnelDraftActive} />
                    </div>
                    <Button type="button" size="icon" variant="ghost" className="h-10 w-10" title="Salvar" onClick={() => void saveEditFunnel(funnel.id)}>
                      <Check size={16} />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-10 w-10" title="Cancelar" onClick={() => setEditingFunnelId(null)}>
                      <X size={16} />
                    </Button>
                  </div>
                  <Input
                    className="h-10"
                    value={funnelDraftDescription}
                    onChange={(e) => setFunnelDraftDescription(e.target.value)}
                    placeholder="Descrição do funil"
                  />
                </div>
              ) : (
                <div className="flex items-start gap-3">
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
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: funnel.color }} />
                        <span className="break-words text-base font-semibold">{funnel.name}</span>
                        {funnel.is_default && <Pill tone="blue">padrão</Pill>}
                        {!funnel.is_active && <Pill tone="slate">inativo</Pill>}
                      </div>
                      {funnel.description && (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{funnel.description}</p>
                      )}
                    </div>
                    {demandTypes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-xs text-muted-foreground">Tipos permitidos</span>
                        {demandTypes.map((t) => {
                          const selected = (funnel.allowed_demand_type_ids ?? []).includes(t.id)
                          return (
                            <button
                              key={t.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => void handleToggleAllowedType(funnel, t.id)}
                              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                selected
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                            >
                              {t.name}
                            </button>
                          )
                        })}
                        {(funnel.allowed_demand_type_ids ?? []).length === 0 && (
                          <span className="text-xs italic text-muted-foreground">todos (sem restrição)</span>
                        )}
                      </div>
                    )}
                    {positions.length > 0 && (
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-sm font-medium">Acesso por cargo a este kanban</p>
                        <div className="mt-2 divide-y">
                          {positions.map((p) => {
                            const level: FunnelAccessLevel =
                              (p.role_id ? (funnel.access_control ?? {})[p.role_id] : undefined) ?? "manage"
                            return (
                              <div key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                                <div className="inline-flex shrink-0 rounded-lg border bg-background p-0.5">
                                  {ACCESS_OPTIONS.map((opt) => {
                                    const selected = level === opt.value
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        title={opt.hint}
                                        aria-pressed={selected}
                                        onClick={() => void handleSetFunnelAccess(funnel, p, opt.value)}
                                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                          selected
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {!funnel.is_default && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => void handleSetDefaultFunnel(funnel.id)}>
                        Padrão
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" title="Editar" onClick={() => beginEditFunnel(funnel)}>
                      <Pencil size={14} />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void handleToggleActive(funnel)}>
                      {funnel.is_active ? "Inativar" : "Ativar"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      title="Excluir"
                      onClick={() => void handleDeleteFunnel(funnel.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              )}
          </li>
        ))}
        </ul>
      </SectionCard>
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
