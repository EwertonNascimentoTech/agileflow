import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Building2, Plus, Search, ChevronRight, Loader2 } from "lucide-react"
import { tenantsApi, plansApi } from "@/api/superAdmin"
import type { TenantSummary, Plan } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
  plan_id: z.string().optional(),
})
type FormData = z.infer<typeof schema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar a requisição."
}

export default function TenantsPage() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState<TenantSummary[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState("")

  const { register, handleSubmit, setValue, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    Promise.all([tenantsApi.list({ limit: 200 }), plansApi.list(false)])
      .then(([t, p]) => { setTenants(t); setPlans(p) })
      .finally(() => setLoading(false))
  }, [])

  const filtered = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase())
  )

  async function onSubmit(data: FormData) {
    setServerError("")
    try {
      const tenant = await tenantsApi.create({
        name: data.name,
        slug: data.slug,
        plan_id: data.plan_id || undefined,
      })
      setTenants((prev) => [{ ...tenant, active_modules: undefined } as unknown as TenantSummary, ...prev])
      reset()
      setOpen(false)
      navigate(`/admin/tenants/${tenant.id}`)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Empresas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Carregando…" : `${tenants.length} empresa${tenants.length !== 1 ? "s" : ""} cadastrada${tenants.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={() => { reset(); setServerError(""); setOpen(true) }} className="gap-1.5">
          <Plus size={16} />
          Nova Empresa
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={search ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"}
          description={search ? "Tente buscar por outro termo." : "Cadastre a primeira empresa para começar."}
          action={!search ? { label: "Nova Empresa", onClick: () => { reset(); setServerError(""); setOpen(true) } } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((tenant) => {
            const plan = plans.find((p) => p.id === tenant.plan_id)
            return (
              <Card
                key={tenant.id}
                className="cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                    {tenant.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{tenant.name}</p>
                    <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2">
                    {plan && (
                      <Badge variant="secondary" className="text-xs">{plan.name}</Badge>
                    )}
                    <Badge variant={tenant.is_active ? "success" : "destructive"}>
                      {tenant.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog: Nova Empresa */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Empresa</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input placeholder="Acme Ltda." {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Slug</Label>
              <Input
                placeholder="acme"
                {...register("slug")}
                onChange={(e) => {
                  const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")
                  setValue("slug", v, { shouldValidate: true })
                }}
              />
              <p className="text-xs text-muted-foreground">Identificador único — letras minúsculas, números e hífens.</p>
              {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Plano <span className="text-muted-foreground">(opcional)</span></Label>
              <Select onValueChange={(v) => setValue("plan_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar plano…" />
                </SelectTrigger>
                <SelectContent>
                  {plans.filter(p => p.is_active).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Criar Empresa
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
