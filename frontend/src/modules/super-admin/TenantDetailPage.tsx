import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  ArrowLeft, Building2, Loader2,
  CalendarDays, Package, UserPlus, Pencil, Trash2,
} from "lucide-react"
import { tenantsApi, plansApi, modulesApi, usersApi } from "@/api/superAdmin"
import type { Tenant, Plan, ModuleSlug, Module, User } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { passwordSchema } from "@/lib/passwordSchema"
import { PasswordChecklist } from "@/components/PasswordChecklist"

const adminSchema = z.object({
  full_name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("E-mail inválido"),
  password: passwordSchema,
})
type AdminForm = z.infer<typeof adminSchema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar a requisição."
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [registry, setRegistry] = useState<Module[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingModule, setTogglingModule] = useState<ModuleSlug | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminError, setAdminError] = useState("")
  const [adminSuccess, setAdminSuccess] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<AdminForm>({
    resolver: zodResolver(adminSchema),
  })

  useEffect(() => {
    if (!id) return
    Promise.all([
      tenantsApi.get(id),
      plansApi.list(false),
      modulesApi.list(false),
      tenantsApi.listUsers(id).catch(() => [] as User[]),
    ])
      .then(([t, p, m, u]) => { setTenant(t); setPlans(p); setRegistry(m); setUsers(u) })
      .finally(() => setLoading(false))
  }, [id])

  async function refreshUsers() {
    if (!id) return
    const u = await tenantsApi.listUsers(id).catch(() => [] as User[])
    setUsers(u)
  }

  // ── Editar / excluir usuário ──
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState<{ full_name: string; role: "company_admin" | "company_user"; is_active: boolean }>({
    full_name: "", role: "company_user", is_active: true,
  })
  const [savingUser, setSavingUser] = useState(false)
  const [userError, setUserError] = useState("")
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)

  function openEditUser(u: User) {
    setEditingUser(u)
    setEditForm({
      full_name: u.full_name,
      role: u.role === "super_admin" ? "company_admin" : u.role,
      is_active: u.is_active,
    })
    setUserError("")
  }

  async function saveUser() {
    if (!editingUser) return
    setSavingUser(true)
    setUserError("")
    try {
      await usersApi.update(editingUser.id, editForm)
      await refreshUsers()
      setEditingUser(null)
    } catch (err) {
      setUserError(getApiError(err))
    } finally {
      setSavingUser(false)
    }
  }

  async function handleDeleteUser(u: User) {
    if (!confirm(`Excluir o usuário "${u.full_name}"?\nEsta ação não pode ser desfeita.`)) return
    setDeletingUserId(u.id)
    try {
      await usersApi.remove(u.id)
      await refreshUsers()
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingUserId(null)
    }
  }

  async function toggleModule(slug: ModuleSlug) {
    if (!tenant) return
    setTogglingModule(slug)
    try {
      const active = tenant.active_modules.find((m) => m.module_slug === slug)
      if (active?.is_active) {
        await tenantsApi.deactivateModule(tenant.id, slug)
        setTenant((prev) => prev && {
          ...prev,
          active_modules: prev.active_modules.map((m) =>
            m.module_slug === slug ? { ...m, is_active: false } : m
          ),
        })
      } else {
        const updated = await tenantsApi.activateModule(tenant.id, slug)
        setTenant((prev) => {
          if (!prev) return prev
          const existing = prev.active_modules.find((m) => m.module_slug === slug)
          return {
            ...prev,
            active_modules: existing
              ? prev.active_modules.map((m) => m.module_slug === slug ? updated : m)
              : [...prev.active_modules, updated],
          }
        })
      }
    } finally {
      setTogglingModule(null)
    }
  }

  async function handleChangePlan(planId: string) {
    if (!tenant) return
    setSavingPlan(true)
    try {
      const newPlanId = planId === "__none__" ? null : planId
      const updated = await tenantsApi.update(tenant.id, { plan_id: newPlanId })
      setTenant(updated)
    } finally {
      setSavingPlan(false)
    }
  }

  async function handleToggleActive() {
    if (!tenant) return
    const updated = await tenantsApi.update(tenant.id, { is_active: !tenant.is_active })
    setTenant(updated)
  }

  async function onCreateAdmin(data: AdminForm) {
    if (!tenant) return
    setAdminError("")
    try {
      await tenantsApi.createAdmin(tenant.id, data)
      setAdminSuccess(true)
      reset()
      await refreshUsers()
      setTimeout(() => { setAdminOpen(false); setAdminSuccess(false) }, 1500)
    } catch (err) {
      setAdminError(getApiError(err))
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!tenant) {
    return <div className="text-center py-16 text-muted-foreground">Empresa não encontrada.</div>
  }

  const currentPlan = plans.find((p) => p.id === tenant.plan_id)

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/tenants")}>
          <ArrowLeft size={16} />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">{tenant.slug}</p>
        </div>
        <Badge variant={tenant.is_active ? "success" : "destructive"}>
          {tenant.is_active ? "Ativo" : "Inativo"}
        </Badge>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="modules">Módulos</TabsTrigger>
          <TabsTrigger value="admin">Admin</TabsTrigger>
        </TabsList>

        {/* ── Informações ── */}
        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados da Empresa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Nome</p>
                  <p className="font-medium">{tenant.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Slug</p>
                  <p className="font-medium font-mono">{tenant.slug}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Schema</p>
                  <p className="font-medium font-mono">{tenant.schema_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Cadastro</p>
                  <p className="font-medium flex items-center gap-1">
                    <CalendarDays size={13} />
                    {new Date(tenant.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>

              {/* Plano */}
              <div className="space-y-1.5 pt-2 border-t">
                <Label className="flex items-center gap-1.5">
                  <Package size={13} /> Plano
                  {savingPlan && <Loader2 size={12} className="animate-spin ml-1" />}
                </Label>
                <Select
                  defaultValue={tenant.plan_id ?? "__none__"}
                  onValueChange={handleChangePlan}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="Sem plano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem plano</SelectItem>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {currentPlan && (
                  <p className="text-xs text-muted-foreground">
                    {currentPlan.max_users} usuários · R$ {Number(currentPlan.price).toFixed(2)}/mês
                  </p>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="text-sm font-medium">Empresa ativa</p>
                  <p className="text-xs text-muted-foreground">Desativar bloqueia o acesso de todos os usuários.</p>
                </div>
                <Switch checked={tenant.is_active} onCheckedChange={handleToggleActive} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Módulos ── */}
        <TabsContent value="modules">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Módulos Ativos</CardTitle>
              <CardDescription>Ative ou desative módulos individualmente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {registry.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum módulo cadastrado na plataforma.
                </p>
              ) : (
                registry.map((m) => {
                  const tm = tenant.active_modules.find((x) => x.module_slug === m.slug)
                  const isActive = tm?.is_active ?? false
                  const isLoading = togglingModule === m.slug
                  const disabled = !m.is_active
                  return (
                    <div key={m.slug} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{m.name}</p>
                          {!m.is_active && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5">desativado na plataforma</Badge>
                          )}
                        </div>
                        {tm?.activated_at && (
                          <p className="text-xs text-muted-foreground">
                            Ativado em {new Date(tm.activated_at).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                      {isLoading ? (
                        <Loader2 size={16} className="animate-spin text-muted-foreground" />
                      ) : (
                        <Switch
                          checked={isActive}
                          disabled={disabled}
                          onCheckedChange={() => toggleModule(m.slug)}
                        />
                      )}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Admin ── */}
        <TabsContent value="admin">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Usuários da Empresa</CardTitle>
                  <CardDescription>Administradores e usuários cadastrados neste tenant.</CardDescription>
                </div>
                <Button size="sm" onClick={() => { reset(); setAdminError(""); setAdminSuccess(false); setAdminOpen(true) }} className="gap-1.5">
                  <UserPlus size={14} />
                  Criar Admin
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Building2 size={36} className="mb-3 opacity-30" />
                  <p className="text-sm">Nenhum usuário ainda. Clique em "Criar Admin" para adicionar o primeiro.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map(u => (
                    <div
                      key={u.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${!u.is_active ? "opacity-60" : ""}`}
                    >
                      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {u.full_name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={u.role === "company_admin" ? "secondary" : "outline"} className="text-xs">
                          {u.role === "company_admin" ? "Admin" : "Usuário"}
                        </Badge>
                        <Badge variant={u.is_active ? "success" : "destructive"} className="text-xs">
                          {u.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditUser(u)}>
                          <Pencil size={12} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteUser(u)}
                          disabled={deletingUserId === u.id}
                        >
                          {deletingUserId === u.id
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Trash2 size={12} />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Editar Usuário */}
      <Dialog open={!!editingUser} onOpenChange={v => !v && setEditingUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar — {editingUser?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {userError && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{userError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <Select
                value={editForm.role}
                onValueChange={v => setEditForm({ ...editForm, role: v as "company_admin" | "company_user" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_user">Usuário</SelectItem>
                  <SelectItem value="company_admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <p className="text-sm font-medium">Usuário ativo</p>
                <p className="text-xs text-muted-foreground">Inativos não conseguem fazer login.</p>
              </div>
              <Switch
                checked={editForm.is_active}
                onCheckedChange={v => setEditForm({ ...editForm, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
            <Button onClick={saveUser} disabled={savingUser}>
              {savingUser && <Loader2 size={13} className="animate-spin mr-1.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Criar Admin */}
      <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Admin — {tenant.name}</DialogTitle>
          </DialogHeader>

          {adminSuccess ? (
            <div className="py-6 text-center space-y-2">
              <div className="text-4xl">✅</div>
              <p className="font-medium">Admin criado com sucesso!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onCreateAdmin)} className="space-y-4">
              {adminError && (
                <Alert variant="destructive">
                  <AlertDescription>{adminError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label>Nome completo</Label>
                <Input placeholder="João Silva" {...register("full_name")} />
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" placeholder="admin@empresa.com" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Senha provisória</Label>
                <Input type="password" placeholder="Senha forte" {...register("password")} />
                <PasswordChecklist password={watch("password") ?? ""} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAdminOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 size={14} className="animate-spin mr-1.5" />}
                  Criar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
