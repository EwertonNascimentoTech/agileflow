import { useEffect, useState } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import * as Icons from "lucide-react"
import { Package, Plus, Pencil, Trash2, Loader2, FolderOpen } from "lucide-react"

function resolveIcon(name: string | null | undefined): React.ElementType {
  if (!name) return Package
  const Comp = (Icons as unknown as Record<string, React.ElementType>)[name]
  return Comp ?? Package
}
import { modulesApi } from "@/api/superAdmin"
import type { Module } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"

const schema = z.object({
  slug: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/, "Use letras minúsculas, números e _"),
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida"),
  backend_path: z.string().min(2).max(255),
  frontend_path: z.string().min(2).max(255),
  is_active: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

const PRESET_COLORS: Array<{ name: string; value: string }> = [
  { name: "Azul",    value: "#3B82F6" },
  { name: "Verde",   value: "#10B981" },
  { name: "Roxo",    value: "#8B5CF6" },
  { name: "Rosa",    value: "#EC4899" },
  { name: "Laranja", value: "#F59E0B" },
  { name: "Vermelho",value: "#EF4444" },
  { name: "Ciano",   value: "#06B6D4" },
  { name: "Cinza",   value: "#6B7280" },
]

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar a requisição."
}

export default function ModulesPage() {
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Module | null>(null)
  const [serverError, setServerError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema) as Resolver<FormData>,
      defaultValues: { is_active: true, color: "#3B82F6" },
    })

  const isActive = watch("is_active")
  const color = watch("color")

  useEffect(() => {
    modulesApi.list(false).then(setModules).finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    reset({
      slug: "", name: "", description: "", icon: "",
      color: "#3B82F6",
      backend_path: "backend/app/modules/", frontend_path: "frontend/src/modules/",
      is_active: true,
    })
    setServerError("")
    setOpen(true)
  }

  function openEdit(m: Module) {
    setEditing(m)
    reset({
      slug: m.slug,
      name: m.name,
      description: m.description ?? "",
      icon: m.icon ?? "",
      color: m.color,
      backend_path: m.backend_path,
      frontend_path: m.frontend_path,
      is_active: m.is_active,
    })
    setServerError("")
    setOpen(true)
  }

  async function onSubmit(data: FormData) {
    setServerError("")
    try {
      if (editing) {
        const { slug: _slug, ...updatePayload } = data
        const updated = await modulesApi.update(editing.id, updatePayload)
        setModules((prev) => prev.map((m) => m.id === updated.id ? updated : m))
      } else {
        const created = await modulesApi.create(data)
        setModules((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  async function handleDelete(m: Module) {
    if (!confirm(`Excluir o módulo "${m.name}"?\nEsta ação só funciona se ele não estiver vinculado a nenhum tenant.`)) return
    setDeletingId(m.id)
    try {
      await modulesApi.remove(m.id)
      setModules((prev) => prev.filter((x) => x.id !== m.id))
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Módulos do Sistema</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Carregando…" : `${modules.length} módulo${modules.length !== 1 ? "s" : ""} cadastrado${modules.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus size={16} />
          Cadastrar Módulo
        </Button>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          Apenas módulos cadastrados aqui ficam disponíveis para ativação em tenants.
          Cadastre um módulo somente após ele ser desenvolvido (backend + frontend).
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : modules.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum módulo cadastrado"
          description="Cadastre o primeiro módulo desenvolvido para liberá-lo na plataforma."
          action={{ label: "Cadastrar Módulo", onClick: openCreate }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <Card key={m.id} className={!m.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {(() => {
                      const Icon = resolveIcon(m.icon)
                      return (
                        <div
                          className="h-9 w-9 rounded-lg shrink-0 mt-0.5 flex items-center justify-center"
                          style={{ backgroundColor: `${m.color}1a`, color: m.color, border: `1px solid ${m.color}33` }}
                        >
                          <Icon size={16} />
                        </div>
                      )
                    })()}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{m.name}</p>
                        {m.is_active ? (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">ativo</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">inativo</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{m.slug}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => openEdit(m)}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(m)}
                      disabled={deletingId === m.id}
                    >
                      {deletingId === m.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Trash2 size={13} />}
                    </Button>
                  </div>
                </div>

                {m.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{m.description}</p>
                )}

                <div className="space-y-1 text-[11px] text-muted-foreground font-mono">
                  <div className="flex items-center gap-1">
                    <FolderOpen size={11} className="shrink-0" />
                    <span className="truncate">{m.backend_path}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FolderOpen size={11} className="shrink-0" />
                    <span className="truncate">{m.frontend_path}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Módulo" : "Cadastrar Módulo"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  {...register("slug")}
                  placeholder="atendimento"
                  disabled={!!editing}
                  className="font-mono"
                />
                {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
                {editing && <p className="text-[11px] text-muted-foreground">Slug não pode ser alterado.</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" {...register("name")} placeholder="Atendimento" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                {...register("description")}
                rows={2}
                placeholder="O que esse módulo faz?"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="icon">Ícone</Label>
                <Input id="icon" {...register("icon")} placeholder="MessageSquare" />
                <p className="text-[11px] text-muted-foreground">
                  Nome de um ícone do <code>lucide-react</code>.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Cor do módulo</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setValue("color", c.value, { shouldValidate: true })}
                      title={c.name}
                      className="h-7 w-7 rounded-md border-2 transition-all hover:scale-110"
                      style={{
                        backgroundColor: c.value,
                        borderColor: color === c.value ? "hsl(var(--foreground))" : "transparent",
                      }}
                    />
                  ))}
                  <Input
                    type="color"
                    value={color ?? "#3B82F6"}
                    onChange={(e) => setValue("color", e.target.value.toUpperCase(), { shouldValidate: true })}
                    className="h-7 w-7 p-0.5 cursor-pointer rounded-md"
                  />
                </div>
                {errors.color && <p className="text-xs text-destructive">{errors.color.message}</p>}
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-md border p-3 flex items-center gap-3 bg-muted/30">
              {(() => {
                const Icon = resolveIcon(watch("icon"))
                const c = color ?? "#3B82F6"
                return (
                  <>
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${c}1a`, color: c, border: `1px solid ${c}33` }}
                    >
                      <Icon size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{watch("name") || "Nome do módulo"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{c}</p>
                    </div>
                  </>
                )
              })()}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="backend_path">Pasta do backend</Label>
              <Input
                id="backend_path"
                {...register("backend_path")}
                placeholder="backend/app/modules/atendimento"
                className="font-mono text-xs"
              />
              {errors.backend_path && <p className="text-xs text-destructive">{errors.backend_path.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="frontend_path">Pasta do frontend</Label>
              <Input
                id="frontend_path"
                {...register("frontend_path")}
                placeholder="frontend/src/modules/atendimento"
                className="font-mono text-xs"
              />
              {errors.frontend_path && <p className="text-xs text-destructive">{errors.frontend_path.message}</p>}
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Módulo ativo</p>
                <p className="text-xs text-muted-foreground">Inativos não podem ser ativados em tenants.</p>
              </div>
              <Switch
                checked={isActive ?? true}
                onCheckedChange={(v) => setValue("is_active", v)}
              />
            </div>

            {serverError && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{serverError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {editing ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
