import { useEffect, useState } from "react"
import { useForm, Controller, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CreditCard, Plus, Pencil, Loader2, Check } from "lucide-react"
import { plansApi, modulesApi } from "@/api/superAdmin"
import type { Plan, ModuleSlug, Module } from "@/types"
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
  name: z.string().min(2, "Mínimo 2 caracteres"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Preço inválido"),
  max_users: z.coerce.number().min(1, "Mínimo 1 usuário"),
  modules: z.array(z.string()).min(1, "Selecione ao menos 1 módulo"),
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

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [registry, setRegistry] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [serverError, setServerError] = useState("")

  const moduleLabels: Record<string, string> = Object.fromEntries(
    registry.map((m) => [m.slug, m.name])
  )
  const availableModules = registry.filter((m) => m.is_active)

  const { register, handleSubmit, control, setValue, reset, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: { modules: [], is_active: true },
  })

  const selectedModules = watch("modules") as ModuleSlug[]

  useEffect(() => {
    Promise.all([
      plansApi.list(false),
      modulesApi.list(false),
    ])
      .then(([p, m]) => { setPlans(p); setRegistry(m) })
      .finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    reset({ name: "", description: "", price: 0, max_users: 5, modules: [], is_active: true })
    setServerError("")
    setOpen(true)
  }

  function openEdit(plan: Plan) {
    setEditing(plan)
    reset({
      name: plan.name,
      description: plan.description ?? "",
      price: plan.price,
      max_users: plan.max_users,
      modules: plan.modules,
      is_active: plan.is_active,
    })
    setServerError("")
    setOpen(true)
  }

  function toggleModule(slug: ModuleSlug) {
    const current = selectedModules
    setValue(
      "modules",
      current.includes(slug) ? current.filter((m) => m !== slug) : [...current, slug],
      { shouldValidate: true }
    )
  }

  async function onSubmit(data: FormData) {
    setServerError("")
    try {
      if (editing) {
        const updated = await plansApi.update(editing.id, data as Parameters<typeof plansApi.update>[1])
        setPlans((prev) => prev.map((p) => p.id === updated.id ? updated : p))
      } else {
        const created = await plansApi.create(data as Parameters<typeof plansApi.create>[0])
        setPlans((prev) => [created, ...prev])
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Carregando…" : `${plans.length} plano${plans.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus size={16} />
          Novo Plano
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum plano cadastrado"
          description="Crie o primeiro plano para oferecer às empresas."
          action={{ label: "Novo Plano", onClick: openCreate }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{plan.name}</p>
                    {plan.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{plan.description}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(plan)}>
                    <Pencil size={13} />
                  </Button>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <span className="font-bold text-base">R$ {Number(plan.price).toFixed(2)}</span>
                  <span className="text-muted-foreground text-xs">{plan.max_users} usuários</span>
                  {!plan.is_active && <Badge variant="secondary" className="text-xs ml-auto">Inativo</Badge>}
                </div>

                <div className="flex flex-wrap gap-1">
                  {plan.modules.map((m) => (
                    <Badge key={m} variant="outline" className="text-xs">{moduleLabels[m] ?? m}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Plano" : "Novo Plano"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>
            )}

            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input placeholder="Básico" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Descrição <span className="text-muted-foreground">(opcional)</span></Label>
              <Textarea placeholder="Descreva o plano…" rows={2} {...register("description")} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Preço (R$/mês)</Label>
                <Input type="number" min={0} step={0.01} {...register("price")} />
                {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Máx. usuários</Label>
                <Input type="number" min={1} {...register("max_users")} />
                {errors.max_users && <p className="text-xs text-destructive">{errors.max_users.message}</p>}
              </div>
            </div>

            {/* Módulos */}
            <div className="space-y-2">
              <Label>Módulos incluídos</Label>
              {availableModules.length === 0 ? (
                <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center">
                  Nenhum módulo cadastrado. Cadastre módulos em "Módulos" antes de criar planos.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availableModules.map((mod) => {
                    const active = selectedModules.includes(mod.slug)
                    return (
                      <button
                        key={mod.slug}
                        type="button"
                        onClick={() => toggleModule(mod.slug)}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                          active
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-input text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${active ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                          {active && <Check size={10} className="text-white" />}
                        </div>
                        {mod.name}
                      </button>
                    )
                  })}
                </div>
              )}
              {errors.modules && <p className="text-xs text-destructive">{errors.modules.message}</p>}
            </div>

            {/* Ativo */}
            {editing && (
              <div className="flex items-center justify-between border-t pt-3">
                <Label>Plano ativo</Label>
                <Controller
                  name="is_active"
                  control={control}
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 size={14} className="animate-spin mr-1.5" />}
                {editing ? "Salvar" : "Criar Plano"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
