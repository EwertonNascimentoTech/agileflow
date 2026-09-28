import { useEffect, useState } from "react"
import { FirstAccessLinkButton } from "@/components/FirstAccessLinkButton"
import { companyApi as companyAdminApi } from "@/api/company"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Users, Plus, Search, Pencil, Loader2, UserCheck, UserX, ShieldCheck, KeyRound } from "lucide-react"
import { companyApi } from "@/api/crm"
import type { User, Role } from "@/types"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/EmptyState"
import { KpiCount, KpiRow, Pill, SectionCard, TABLE, type Tone } from "@/components/ds"
import { passwordSchema } from "@/lib/passwordSchema"
import { PasswordChecklist } from "@/components/PasswordChecklist"

const NO_ROLE = "__none__"

const createSchema = z.object({
  full_name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("E-mail inválido"),
  password: passwordSchema,
  role: z.enum(["company_admin", "company_user"]),
  role_id: z.string().nullable().optional(),
})
type CreateForm = z.infer<typeof createSchema>

const editSchema = z.object({
  full_name: z.string().min(2, "Mínimo 2 caracteres"),
  role: z.enum(["company_admin", "company_user"]),
  role_id: z.string().nullable().optional(),
  is_active: z.boolean(),
})
type EditForm = z.infer<typeof editSchema>

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin",
  company_user: "Usuário",
  super_admin: "Super Admin",
}

const ROLE_TONE: Record<string, Tone> = {
  company_admin: "violet",
  company_user: "slate",
  super_admin: "amber",
}

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar a requisição."
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [createError, setCreateError] = useState("")
  const [editError, setEditError] = useState("")

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: "company_user" },
  })
  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) })

  useEffect(() => {
    Promise.all([
      companyApi.listUsers({ active_only: false }),
      companyApi.listRoles().catch(() => [] as Role[]),
    ])
      .then(([u, r]) => { setUsers(u); setRoles(r) })
      .finally(() => setLoading(false))
  }, [])

  const roleNameById = (id: string | null) =>
    id ? roles.find(r => r.id === id)?.name ?? null : null

  const filtered = users.filter(
    u =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  function normalizeRoleId(v: string | null | undefined): string | null {
    return !v || v === NO_ROLE ? null : v
  }

  async function onCreate(data: CreateForm) {
    setCreateError("")
    try {
      const payload = { ...data, role_id: normalizeRoleId(data.role_id) }
      const created = await companyApi.createUser(payload)
      setUsers(prev => [created, ...prev])
      createForm.reset({ role: "company_user", role_id: null })
      setCreateOpen(false)
    } catch (err) {
      setCreateError(getApiError(err))
    }
  }

  function openEdit(user: User) {
    setEditTarget(user)
    editForm.reset({
      full_name: user.full_name,
      role: user.role as "company_admin" | "company_user",
      role_id: user.role_id,
      is_active: user.is_active,
    })
    setEditError("")
  }

  async function onEdit(data: EditForm) {
    if (!editTarget) return
    setEditError("")
    try {
      const payload = { ...data, role_id: normalizeRoleId(data.role_id) }
      const updated = await companyApi.updateUser(editTarget.id, payload)
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
      setEditTarget(null)
    } catch (err) {
      setEditError(getApiError(err))
    }
  }

  function openCreate() {
    createForm.reset({ role: "company_user" }); setCreateError(""); setCreateOpen(true)
  }

  // Indicadores do topo (só leitura; contam sobre todos os usuários, sem a busca).
  const activeCount = users.filter(u => u.is_active).length
  const adminCount = users.filter(u => u.role === "company_admin").length
  const pendingFirstAccess = users.filter(u => !u.last_login && u.is_active).length

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
      ) : (
        <KpiRow className="sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <KpiCount icon={Users} value={users.length} label="Usuários" />
          <KpiCount icon={UserCheck} value={activeCount} label="Ativos" tone="emerald" />
          <KpiCount icon={UserX} value={users.length - activeCount} label="Inativos" tone="slate" />
          <KpiCount icon={ShieldCheck} value={adminCount} label="Administradores" tone="violet" />
          <KpiCount
            icon={KeyRound} value={pendingFirstAccess} label="Aguardando primeiro acesso"
            tone={pendingFirstAccess > 0 ? "amber" : "slate"} highlight={pendingFirstAccess > 0}
          />
        </KpiRow>
      )}

      <SectionCard
        title="Usuários"
        subtitle={loading ? "Carregando…" : `${users.length} usuário${users.length !== 1 ? "s" : ""}`}
        icon={Users}
        flush
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Buscar por nome ou e-mail…"
                aria-label="Buscar por nome ou e-mail"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-10 w-64 max-w-full rounded-md border bg-background pl-9 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </span>
            <Button onClick={openCreate} className="h-10 gap-1.5">
              <Plus size={16} /> Novo Usuário
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="space-y-2 p-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
            description={search ? "Tente buscar por outro termo." : "Adicione o primeiro usuário da empresa."}
            action={!search ? { label: "Novo Usuário", onClick: openCreate } : undefined}
            compact
          />
        ) : (
          <div className={TABLE.wrap}>
            <table className={`${TABLE.table} min-w-[720px]`}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Usuário</th>
                  <th className={TABLE.th}>Perfil</th>
                  <th className={TABLE.th}>Função</th>
                  <th className={TABLE.th}>Status</th>
                  <th className={`${TABLE.th} w-24`}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <tr key={user.id} className={`${TABLE.tr} ${!user.is_active ? "opacity-60" : ""}`}>
                    <td className={TABLE.tdFirst}>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                          {user.full_name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold truncate">{user.full_name}</p>
                            {user.id === me?.id && (
                              <span className="text-xs text-muted-foreground">(você)</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className={TABLE.td}>
                      <Pill tone={ROLE_TONE[user.role] ?? "slate"}>{ROLE_LABELS[user.role] ?? user.role}</Pill>
                    </td>
                    <td className={TABLE.td}>
                      {roleNameById(user.role_id)
                        ? <Pill tone="blue">{roleNameById(user.role_id)}</Pill>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={TABLE.td}>
                      <Pill tone={user.is_active ? "emerald" : "red"} dot>{user.is_active ? "Ativo" : "Inativo"}</Pill>
                    </td>
                    <td className={TABLE.td}>
                      <div className="flex items-center justify-end gap-0.5">
                        {!user.last_login && user.is_active && (
                          <FirstAccessLinkButton
                            size="icon"
                            variant="ghost"
                            personName={user.full_name}
                            generate={() => companyAdminApi.userFirstAccessLink(user.id)}
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          title="Editar usuário"
                          aria-label={`Editar ${user.full_name}`}
                          onClick={() => openEdit(user)}
                        >
                          <Pencil size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Dialog: Criar usuário */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Usuário</DialogTitle></DialogHeader>
          <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
            {createError && <Alert variant="destructive"><AlertDescription>{createError}</AlertDescription></Alert>}
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input placeholder="João Silva" {...createForm.register("full_name")} />
              {createForm.formState.errors.full_name && (
                <p className="text-xs text-destructive">{createForm.formState.errors.full_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" placeholder="joao@empresa.com" {...createForm.register("email")} />
              {createForm.formState.errors.email && (
                <p className="text-xs text-destructive">{createForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Senha provisória</Label>
              <Input
                type="password"
                placeholder="Senha forte"
                {...createForm.register("password")}
              />
              <PasswordChecklist password={createForm.watch("password") ?? ""} />
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select
                  value={createForm.watch("role")}
                  onValueChange={v => createForm.setValue("role", v as "company_admin" | "company_user")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company_user">Usuário</SelectItem>
                    <SelectItem value="company_admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Função</Label>
                <Select
                  value={createForm.watch("role_id") ?? NO_ROLE}
                  onValueChange={v => createForm.setValue("role_id", v === NO_ROLE ? null : v)}
                  disabled={createForm.watch("role") === "company_admin"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE}>Sem função</SelectItem>
                    {roles.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createForm.watch("role") === "company_admin" && (
                  <p className="text-[11px] text-muted-foreground">Admins têm acesso total.</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createForm.formState.isSubmitting}>
                {createForm.formState.isSubmitting && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar usuário */}
      <Dialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar — {editTarget?.full_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
            {editError && <Alert variant="destructive"><AlertDescription>{editError}</AlertDescription></Alert>}
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input {...editForm.register("full_name")} />
              {editForm.formState.errors.full_name && (
                <p className="text-xs text-destructive">{editForm.formState.errors.full_name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select
                  value={editForm.watch("role")}
                  onValueChange={v => editForm.setValue("role", v as "company_admin" | "company_user")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company_user">Usuário</SelectItem>
                    <SelectItem value="company_admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Função</Label>
                <Select
                  value={editForm.watch("role_id") ?? NO_ROLE}
                  onValueChange={v => editForm.setValue("role_id", v === NO_ROLE ? null : v)}
                  disabled={editForm.watch("role") === "company_admin"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE}>Sem função</SelectItem>
                    {roles.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editForm.watch("role") === "company_admin" && (
                  <p className="text-[11px] text-muted-foreground">Admins têm acesso total.</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <Label>Usuário ativo</Label>
              <Switch
                checked={editForm.watch("is_active")}
                onCheckedChange={v => editForm.setValue("is_active", v)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
              <Button type="submit" disabled={editForm.formState.isSubmitting}>
                {editForm.formState.isSubmitting && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
