import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ArrowRight, FileText, GitBranch, Loader2, Pencil, Plus, Settings2, Trash2 } from "lucide-react"

import { projetosApi, type Project, type ProjectDemandType, type ProjectFunnel } from "@/api/projetos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

  if (loading) return <Skeleton className="h-28 rounded-lg" />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/modules/projetos/config")}>
          <ArrowLeft size={16} />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Tipos de Demanda</h2>
          <p className="text-sm text-muted-foreground">Defina os tipos, seus formulários e o kanban de cada um.</p>
        </div>
        <Button type="button" className="gap-1.5" onClick={openCreateDialog}>
          <Plus size={14} />
          Novo Tipo
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Settings2}
          title="Nenhum tipo de demanda"
          description="Crie o primeiro tipo para habilitar formulários por sessão."
          action={{ label: "Novo Tipo", onClick: openCreateDialog }}
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const linkedLabel = item.funnel_id ? funnelLabelById[item.funnel_id] : null
            return (
              <Card key={item.id} className="transition-shadow hover:shadow-sm">
                <CardContent className="p-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-3 flex-1">
                      <div className="h-9 w-9 shrink-0 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{item.name}</p>
                          {!item.is_active && <Badge variant="secondary" className="text-[10px]">inativo</Badge>}
                          {!item.available_for_basic && (
                            <Badge variant="outline" className="text-[10px] text-warning border-warning/40">
                              restrito p/ basic
                            </Badge>
                          )}
                          {linkedLabel ? (
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <GitBranch size={10} />
                              {linkedLabel}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              sem kanban vinculado
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.description || <span className="italic">sem descrição</span>}
                          <span className="ml-2 text-[10px] uppercase tracking-wide opacity-60">{item.slug}</span>
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
                        onClick={() => void handleDelete(item)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-12">
                    <Label className="text-xs whitespace-nowrap text-muted-foreground">Disponível p/ usuário basic</Label>
                    <Switch
                      checked={item.available_for_basic}
                      onCheckedChange={() => void handleToggleBasic(item)}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {item.available_for_basic
                        ? "pode solicitar e ver em Minhas Solicitações"
                        : "oculto para o usuário basic"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pl-12">
                    <Label className="text-xs whitespace-nowrap text-muted-foreground">Kanban</Label>
                    <Select
                      value={item.funnel_id ?? NO_FUNNEL}
                      onValueChange={(v) => void handleChangeFunnel(item, v)}
                    >
                      <SelectTrigger className="h-8 text-xs max-w-sm">
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
                  <div className="flex items-start gap-2 pl-12">
                    <Label className="text-xs whitespace-nowrap text-muted-foreground pt-1">
                      Aceita como filhos
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {items.filter((t) => t.id !== item.id).length === 0 ? (
                        <span className="text-[11px] italic text-muted-foreground/70 pt-1">
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
                                onClick={() => void handleToggleChildType(item, t.id)}
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] transition ${
                                  selected
                                    ? "border-primary bg-primary/10 text-primary font-medium"
                                    : "border-border text-muted-foreground hover:bg-muted"
                                }`}
                              >
                                {t.name}
                              </button>
                            )
                          })
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
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
              <p className="text-[11px] text-muted-foreground">
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
              <p className="text-[11px] text-muted-foreground">
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
              <p className="text-[11px] text-muted-foreground">
                Se desligado, o usuário basic não pode abrir solicitações deste tipo nem vê-las em
                "Minhas Solicitações".
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
