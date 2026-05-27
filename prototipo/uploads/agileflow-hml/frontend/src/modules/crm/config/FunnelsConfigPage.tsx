import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, GitBranch, Plus, Pencil, Trash2, Loader2, Check, KanbanSquare } from "lucide-react"
import { funnelsApi } from "@/api/crm"
import type { Funnel } from "@/api/crm"
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

const PRESET_COLORS = [
  "#3B82F6", "#10B981", "#8B5CF6", "#EC4899",
  "#F59E0B", "#EF4444", "#06B6D4", "#6B7280",
]

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(100),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida"),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar a requisição."
}

export default function FunnelsConfigPage() {
  const navigate = useNavigate()
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Funnel | null>(null)
  const [serverError, setServerError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema) as Resolver<FormData>,
      defaultValues: { color: "#3B82F6", is_active: true, is_default: false },
    })

  const color = watch("color")
  const isDefault = watch("is_default")
  const isActive = watch("is_active")

  useEffect(() => {
    funnelsApi.list(false)
      .then(setFunnels)
      .finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    reset({ name: "", description: "", color: "#3B82F6", is_default: false, is_active: true })
    setServerError("")
    setOpen(true)
  }

  function openEdit(f: Funnel) {
    setEditing(f)
    reset({
      name: f.name,
      description: f.description ?? "",
      color: f.color,
      is_default: f.is_default,
      is_active: f.is_active,
    })
    setServerError("")
    setOpen(true)
  }

  async function onSubmit(data: FormData) {
    setServerError("")
    try {
      if (editing) {
        const updated = await funnelsApi.update(editing.id, data)
        setFunnels((prev) => prev.map((f) => f.id === updated.id ? { ...f, ...updated } : f))
      } else {
        const created = await funnelsApi.create(data)
        setFunnels((prev) => [...prev, created].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)))
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  async function handleDelete(f: Funnel) {
    if (!confirm(`Excluir o funil "${f.name}"?\nEtapas vinculadas serão removidas em cascata.`)) return
    setDeletingId(f.id)
    try {
      await funnelsApi.remove(f.id)
      setFunnels((prev) => prev.filter((x) => x.id !== f.id))
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/modules/crm/config")}>
          <ArrowLeft size={16} />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Funis</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "Carregando…" : `${funnels.length} funil${funnels.length !== 1 ? "s" : ""} cadastrado${funnels.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus size={16} /> Novo Funil
        </Button>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          Funis agrupam as etapas do Kanban. Você pode ter funis diferentes para vendas, pós-venda, onboarding etc.
          O funil <strong>padrão</strong> é usado quando criar atendimentos sem escolher um funil explicitamente.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : funnels.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="Nenhum funil cadastrado"
          description="Crie o primeiro funil para começar a organizar seus atendimentos."
          action={{ label: "Novo Funil", onClick: openCreate }}
        />
      ) : (
        <div className="space-y-2">
          {funnels.map((f) => (
            <Card key={f.id} className={!f.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${f.color}1a`, color: f.color, border: `1px solid ${f.color}33` }}
                >
                  <GitBranch size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{f.name}</p>
                    {f.is_default && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">padrão</Badge>}
                    {!f.is_active && <Badge variant="outline" className="text-[10px] h-4 px-1.5">inativo</Badge>}
                  </div>
                  {f.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{f.description}</p>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <KanbanSquare size={11} />
                    {f.stage_count} etapa{f.stage_count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(f)}>
                    <Pencil size={13} />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(f)}
                    disabled={f.is_default || deletingId === f.id}
                    title={f.is_default ? "Funil padrão não pode ser excluído" : ""}
                  >
                    {deletingId === f.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Funil" : "Novo Funil"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" {...register("name")} placeholder="Vendas" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Descrição</Label>
              <Textarea id="description" rows={2} {...register("description")} placeholder="Para que serve este funil?" />
            </div>

            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setValue("color", c, { shouldValidate: true })}
                    className="h-7 w-7 rounded-md border-2 transition-all hover:scale-110 flex items-center justify-center"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? "hsl(var(--foreground))" : "transparent",
                    }}
                  >
                    {color === c && <Check size={12} className="text-white" />}
                  </button>
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

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Funil padrão</p>
                <p className="text-xs text-muted-foreground">Usado quando nenhum outro for escolhido.</p>
              </div>
              <Switch
                checked={isDefault ?? false}
                onCheckedChange={(v) => setValue("is_default", v)}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Ativo</p>
                <p className="text-xs text-muted-foreground">Inativos não aparecem no Kanban.</p>
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
                {editing ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
