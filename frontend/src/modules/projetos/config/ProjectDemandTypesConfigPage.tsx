import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ArrowRight, Check, FileText, GitBranch, Loader2, Pencil, Plus, Settings2, Trash2, X } from "lucide-react"

import { projetosApi, type Project, type ProjectDemandType, type ProjectFunnel } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Card, PageHeader, Pill, SectionCard } from "@/components/ds"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/EmptyState"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

const NO_FUNNEL = "__none__"

interface FunnelOption {
  funnel: ProjectFunnel
  projectName: string
}

export default function ProjectDemandTypesConfigPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ProjectDemandType[]>([])
  const [funnelOptions, setFunnelOptions] = useState<FunnelOption[]>([])
  const [loading, setLoading] = useState(true)
  const [openCreate, setOpenCreate] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [funnelId, setFunnelId] = useState<string>(NO_FUNNEL)
  const [active, setActive] = useState(true)
  const [availableForBasic, setAvailableForBasic] = useState(true)
  const [showInSchedule, setShowInSchedule] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    async function load() {
      const [types, projects] = await Promise.all([
        projetosApi.listDemandTypes(false),
        projetosApi.listProjects(true),
      ])
      setItems(types.sort((a, b) => a.order - b.order))
      const funnels = await Promise.all(
        projects.map(async (project: Project) => ({
          project,
          funnels: await projetosApi.listFunnels(project.id, true).catch(() => [] as ProjectFunnel[]),
        }))
      )
      const opts: FunnelOption[] = []
      funnels.forEach(({ project, funnels: pf }) => {
        pf.forEach((f) => opts.push({ funnel: f, projectName: project.name }))
      })
      setFunnelOptions(opts)
    }
    load().finally(() => setLoading(false))
  }, [])

  const funnelLabelById = useMemo(() => {
    const map: Record<string, string> = {}
    funnelOptions.forEach((opt) => {
      map[opt.funnel.id] = `${opt.projectName} — ${opt.funnel.name}`
    })
    return map
  }, [funnelOptions])

  function slugify(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
  }

  function resetCreateForm() {
    setName("")
    setSlug("")
    setDescription("")
    setFunnelId(NO_FUNNEL)
    setActive(true)
    setAvailableForBasic(true)
    setShowInSchedule(true)
  }

  function openCreateDialog() {
    resetCreateForm()
    setOpenCreate(true)
  }

  async function handleCreate() {
    if (!name.trim()) return
    setSavingCreate(true)
    try {
      const created = await projetosApi.createDemandType({
        name: name.trim(),
        slug: slugify(slug || name),
        description: description.trim() || undefined,
        funnel_id: funnelId === NO_FUNNEL ? null : funnelId,
        available_for_basic: availableForBasic,
        show_in_schedule: showInSchedule,
        order: items.length,
        is_active: active,
      })
      const reordered = await projetosApi.reorderDemandTypes(
        [...items, created].map((x, index) => ({ id: x.id, order: index }))
      )
      setItems(reordered)
      setOpenCreate(false)
      resetCreateForm()
    } finally {
      setSavingCreate(false)
    }
  }

  function startEditName(item: ProjectDemandType) {
    setEditingId(item.id)
    setEditName(item.name)
  }

  async function saveEditName(item: ProjectDemandType) {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === item.name) {
      setEditingId(null)
      return
    }
    setSavingName(true)
    try {
      const updated = await projetosApi.updateDemandType(item.id, { name: trimmed })
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      setEditingId(null)
    } finally {
      setSavingName(false)
    }
  }

  async function handleToggle(item: ProjectDemandType) {
    const updated = await projetosApi.updateDemandType(item.id, { is_active: !item.is_active })
    setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
  }

  async function handleToggleBasic(item: ProjectDemandType) {
    const updated = await projetosApi.updateDemandType(item.id, {
      available_for_basic: !item.available_for_basic,
    })
    setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
  }

  async function handleToggleSchedule(item: ProjectDemandType) {
    const updated = await projetosApi.updateDemandType(item.id, {
      show_in_schedule: !item.show_in_schedule,
    })
    setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
  }

  async function handleChangeFunnel(item: ProjectDemandType, newFunnelId: string) {
    const updated = await projetosApi.updateDemandType(item.id, {
      funnel_id: newFunnelId === NO_FUNNEL ? null : newFunnelId,
    })
    setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
  }

  async function handleToggleChildType(item: ProjectDemandType, childTypeId: string) {
    const current = item.allowed_child_type_ids ?? []
    const next = current.includes(childTypeId)
      ? current.filter((id) => id !== childTypeId)
      : [...current, childTypeId]
    const updated = await projetosApi.updateDemandType(item.id, { allowed_child_type_ids: next })
    setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
  }

  async function handleDelete(item: ProjectDemandType) {
    if (!confirm(`Excluir tipo "${item.name}"?`)) return
    await projetosApi.deleteDemandType(item.id)
    const next = items.filter((x) => x.id !== item.id)
    const reordered = await projetosApi.reorderDemandTypes(next.map((x, index) => ({ id: x.id, order: index })))
    setItems(reordered)
  }

  function renderHeader(withCreate: boolean) {
    return (
      <PageHeader
        crumbs={[{ label: "Configurações", to: "/app/modules/projetos/config" }, { label: "Tipos de Demanda" }]}
        icon={FileText}
        color="#2563EB"
        title="Tipos de Demanda"
        description="Defina os tipos, seus formulários e o kanban de cada um."
        actions={
          <>
            <Button variant="outline" className="h-10 gap-1.5" onClick={() => navigate("/app/modules/projetos/config")}>
              <ArrowLeft size={16} />
              Voltar às Configurações
            </Button>
            {withCreate && (
              <Button type="button" className="h-10 gap-1.5" onClick={openCreateDialog}>
                <Plus size={16} />
                Novo Tipo
              </Button>
            )}
          </>
        }
      />
    )
  }

  if (loading) {
    return (
      <div className="space-y-5">
        {renderHeader(false)}
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {renderHeader(true)}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Settings2}
            title="Nenhum tipo de demanda"
            description="Crie o primeiro tipo para habilitar formulários por sessão."
            action={{ label: "Novo Tipo", onClick: openCreateDialog }}
          />
        </Card>
      ) : (
        <SectionCard
          title="Tipos cadastrados"
          subtitle="Formulário, kanban vinculado, visibilidade e tipos filhos de cada tipo de demanda."
          icon={FileText}
          right={<Pill tone="slate">{items.length} {items.length === 1 ? "tipo" : "tipos"}</Pill>}
          flush
        >
          <ul className="divide-y">
          {items.map((item) => {
            const linkedLabel = item.funnel_id ? funnelLabelById[item.funnel_id] : null
            return (
              <li key={item.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-3 flex-1">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <FileText size={18} />
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {editingId === item.id ? (
                            <span className="flex items-center gap-1">
                              <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void saveEditName(item)
                                  else if (e.key === "Escape") setEditingId(null)
                                }}
                                autoFocus
                                aria-label="Nome do tipo"
                                className="h-10 w-56 text-sm"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 text-success"
                                title="Salvar"
                                disabled={savingName}
                                onClick={() => void saveEditName(item)}
                              >
                                {savingName ? <Loader2 size={14} className="animate-spin" /> : <Check size={16} />}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 text-muted-foreground"
                                title="Cancelar"
                                onClick={() => setEditingId(null)}
                              >
                                <X size={16} />
                              </Button>
                            </span>
                          ) : (
                            <span className="group/name flex items-center gap-1">
                              <p className="text-base font-semibold">{item.name}</p>
                              <button
                                type="button"
                                className="text-muted-foreground opacity-0 transition hover:text-primary focus-visible:opacity-100 group-hover/name:opacity-100"
                                title="Renomear tipo"
                                onClick={() => startEditName(item)}
                              >
                                <Pencil size={13} />
                              </button>
                            </span>
                          )}
                          {!item.is_active && <Pill tone="slate">inativo</Pill>}
                          {!item.available_for_basic && <Pill tone="amber">restrito p/ basic</Pill>}
                          {!item.show_in_schedule && <Pill tone="slate">fora do cronograma</Pill>}
                          {linkedLabel ? (
                            <Pill tone="blue">
                              <GitBranch size={12} />
                              {linkedLabel}
                            </Pill>
                          ) : (
                            <Pill tone="slate">sem kanban vinculado</Pill>
                          )}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">
                          {item.description || <span className="italic">sem descrição</span>}
                          <span className="ml-2 font-mono text-xs">{item.slug}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => navigate(`/app/modules/projetos/config/demand-types/${item.id}`)}
                      >
                        <Pencil size={13} />
                        Formulário
                        <ArrowRight size={13} />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => void handleToggle(item)}>
                        {item.is_active ? "Inativar" : "Ativar"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        title="Excluir"
                        onClick={() => void handleDelete(item)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-x-6 gap-y-3 rounded-xl border bg-muted/30 p-3 sm:ml-[52px] md:grid-cols-2">
                    <div className="flex items-start gap-3">
                      <Switch
                        checked={item.available_for_basic}
                        onCheckedChange={() => void handleToggleBasic(item)}
                        aria-label="Disponível p/ usuário basic"
                      />
                      <div className="min-w-0 leading-tight">
                        <Label className="text-sm">Disponível p/ usuário basic</Label>
                        <p className="text-xs text-muted-foreground">
                          {item.available_for_basic
                            ? "pode solicitar e ver em Minhas Solicitações"
                            : "oculto para o usuário basic"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Switch
                        checked={item.show_in_schedule}
                        onCheckedChange={() => void handleToggleSchedule(item)}
                        aria-label="Visível no cronograma"
                      />
                      <div className="min-w-0 leading-tight">
                        <Label className="text-sm">Visível no cronograma</Label>
                        <p className="text-xs text-muted-foreground">
                          {item.show_in_schedule ? "aparece no Cronograma" : "não aparece no Cronograma"}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs text-muted-foreground">Kanban</Label>
                      <Select
                        value={item.funnel_id ?? NO_FUNNEL}
                        onValueChange={(v) => void handleChangeFunnel(item, v)}
                      >
                        <SelectTrigger className="h-10 max-w-md bg-background">
                          <SelectValue placeholder="Sem vínculo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_FUNNEL}>Sem vínculo (usa kanban atual)</SelectItem>
                          {funnelOptions.map((opt) => (
                            <SelectItem key={opt.funnel.id} value={opt.funnel.id}>
                              {opt.projectName} — {opt.funnel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-xs text-muted-foreground">Aceita como filhos</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {items.filter((t) => t.id !== item.id).length === 0 ? (
                          <span className="text-xs italic text-muted-foreground">
                            cadastre outros tipos primeiro
                          </span>
                        ) : (
                          items
                            .filter((t) => t.id !== item.id)
                            .map((t) => {
                              const selected = (item.allowed_child_type_ids ?? []).includes(t.id)
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => void handleToggleChildType(item, t.id)}
                                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                    selected
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                                  }`}
                                >
                                  {t.name}
                                </button>
                              )
                            })
                        )}
                      </div>
                    </div>
                  </div>
              </li>
            )
          })}
          </ul>
        </SectionCard>
      )}

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Tipo de Demanda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Suporte técnico, Manutenção, Pedido"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Slug</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={name ? slugify(name) : "auto a partir do nome"}
              />
              <p className="text-xs text-muted-foreground">
                Usado internamente. Deixe vazio para gerar automaticamente.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Para que serve esse tipo de demanda? (opcional)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kanban vinculado</Label>
              <Select value={funnelId} onValueChange={setFunnelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar kanban" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FUNNEL}>Sem vínculo (usa kanban atual)</SelectItem>
                  {funnelOptions.map((opt) => (
                    <SelectItem key={opt.funnel.id} value={opt.funnel.id}>
                      {opt.projectName} — {opt.funnel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Toda demanda criada desse tipo cai automaticamente no kanban escolhido.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} />
              <Label className="text-sm">{active ? "Ativo" : "Inativo"}</Label>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Switch checked={availableForBasic} onCheckedChange={setAvailableForBasic} />
                <Label className="text-sm">Disponível para usuário basic</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Se desligado, o usuário basic não pode abrir solicitações deste tipo nem vê-las em
                "Minhas Solicitações".
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Switch checked={showInSchedule} onCheckedChange={setShowInSchedule} />
                <Label className="text-sm">Visível no cronograma</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Se desligado, itens deste tipo não aparecem no Cronograma.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={savingCreate || !name.trim()}
            >
              {savingCreate && <Loader2 size={13} className="animate-spin mr-1.5" />}
              Criar Tipo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
