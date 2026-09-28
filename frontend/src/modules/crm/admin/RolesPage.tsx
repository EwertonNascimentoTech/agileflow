import { useEffect, useMemo, useState } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ShieldCheck, Plus, Pencil, Trash2, Loader2, Users as UsersIcon, Check, Info, KeyRound } from "lucide-react"
import { companyApi } from "@/api/crm"
import type { Role, ModulePermission } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"
import { KpiCount, KpiRow, Notice, Pill, SectionCard, TABLE } from "@/components/ds"

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(100),
  description: z.string().optional(),
  permissions: z.array(z.string()),
})
type FormData = z.infer<typeof schema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar a requisição."
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<ModulePermission[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Role | null>(null)
  const [serverError, setServerError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema) as Resolver<FormData>,
      defaultValues: { name: "", description: "", permissions: [] },
    })

  const selected = watch("permissions") ?? []

  const grouped = useMemo(() => {
    const map = new Map<string, ModulePermission[]>()
    for (const p of permissions) {
      const list = map.get(p.module_slug) ?? []
      list.push(p)
      map.set(p.module_slug, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [permissions])

  useEffect(() => {
    Promise.all([companyApi.listRoles(), companyApi.listPermissions()])
      // Roles "Cargo · X" (is_system) são gerenciados em Cargos → Acesso; aqui só os custom.
      .then(([r, p]) => { setRoles(r.filter((role) => !role.is_system)); setPermissions(p) })
      .finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    reset({ name: "", description: "", permissions: [] })
    setServerError("")
    setOpen(true)
  }

  function openEdit(role: Role) {
    setEditing(role)
    reset({
      name: role.name,
      description: role.description ?? "",
      permissions: role.permissions,
    })
    setServerError("")
    setOpen(true)
  }

  function togglePermission(code: string) {
    const next = selected.includes(code)
      ? selected.filter((c) => c !== code)
      : [...selected, code]
    setValue("permissions", next, { shouldValidate: true })
  }

  function toggleModule(_slug: string, allCodes: string[]) {
    const allSelected = allCodes.every((c) => selected.includes(c))
    const next = allSelected
      ? selected.filter((c) => !allCodes.includes(c))
      : Array.from(new Set([...selected, ...allCodes]))
    setValue("permissions", next, { shouldValidate: true })
  }

  async function onSubmit(data: FormData) {
    setServerError("")
    try {
      if (editing) {
        const updated = await companyApi.updateRole(editing.id, data)
        setRoles((prev) => prev.map((r) => r.id === updated.id ? updated : r))
      } else {
        const created = await companyApi.createRole(data)
        setRoles((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  async function handleDelete(role: Role) {
    if (!confirm(`Excluir a função "${role.name}"?`)) return
    setDeletingId(role.id)
    try {
      await companyApi.deleteRole(role.id)
      setRoles((prev) => prev.filter((r) => r.id !== role.id))
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  // Indicadores do topo (só leitura).
  const usersInRoles = roles.reduce((acc, r) => acc + r.user_count, 0)

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
      ) : (
        <KpiRow className="sm:grid-cols-3">
          <KpiCount icon={ShieldCheck} value={roles.length} label="Funções cadastradas" />
          <KpiCount icon={UsersIcon} value={usersInRoles} label="Usuários nessas funções" tone="emerald" />
          <KpiCount icon={KeyRound} value={permissions.length} label="Permissões disponíveis" tone="violet" />
        </KpiRow>
      )}

      <Notice tone="blue" icon={Info}>
        <span>
          Funções definem o que cada usuário pode fazer dentro dos módulos. <strong>Admins</strong> têm acesso total e dispensam função.
        </span>
      </Notice>

      <SectionCard
        title="Funções"
        subtitle={loading ? "Carregando…" : `${roles.length} função${roles.length !== 1 ? "es" : ""} cadastrada${roles.length !== 1 ? "s" : ""}`}
        icon={ShieldCheck}
        flush
        right={
          <Button onClick={openCreate} className="h-10 gap-1.5" disabled={permissions.length === 0}>
            <Plus size={16} />
            Nova Função
          </Button>
        }
      >
        {loading ? (
          <div className="space-y-2 p-4">
            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : roles.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nenhuma função criada"
            description="Crie funções como Atendente, Gerente etc. e atribua permissões granulares por módulo."
            action={{ label: "Nova Função", onClick: openCreate }}
            compact
          />
        ) : (
          <div className={TABLE.wrap}>
            <table className={`${TABLE.table} min-w-[640px]`}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Função</th>
                  <th className={`${TABLE.th} text-right`}>Usuários</th>
                  <th className={`${TABLE.th} text-right`}>Permissões</th>
                  <th className={`${TABLE.th} w-24`}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className={TABLE.tr}>
                    <td className={TABLE.tdFirst}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{role.name}</p>
                          {role.is_system && <Pill tone="slate">sistema</Pill>}
                        </div>
                        {role.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{role.description}</p>
                        )}
                      </div>
                    </td>
                    <td className={`${TABLE.td} text-right tabular-nums whitespace-nowrap`}>
                      <span className="inline-flex items-center gap-1.5">
                        <UsersIcon size={14} className="text-muted-foreground" />
                        {role.user_count} usuário{role.user_count !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className={`${TABLE.td} text-right tabular-nums whitespace-nowrap`}>
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-muted-foreground" />
                        {role.permissions.length} permissão{role.permissions.length !== 1 ? "ões" : ""}
                      </span>
                    </td>
                    <td className={TABLE.td}>
                      <div className="flex justify-end gap-0.5">
                        <Button
                          size="icon" variant="ghost" className="h-8 w-8"
                          title="Editar função"
                          aria-label={`Editar ${role.name}`}
                          onClick={() => openEdit(role)}
                          disabled={role.is_system}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Excluir função"
                          aria-label={`Excluir ${role.name}`}
                          onClick={() => handleDelete(role)}
                          disabled={role.is_system || deletingId === role.id}
                        >
                          {deletingId === role.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Trash2 size={14} />}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Função" : "Nova Função"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" {...register("name")} placeholder="Atendente" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Descrição</Label>
              <Textarea id="description" rows={2} {...register("description")} placeholder="O que essa função pode fazer?" />
            </div>

            <div className="space-y-2">
              <Label>Permissões</Label>
              {grouped.length === 0 ? (
                <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center">
                  Nenhuma permissão disponível. Cadastre módulos com <code>permissions.py</code>.
                </p>
              ) : (
                <div className="space-y-3">
                  {grouped.map(([slug, perms]) => {
                    const codes = perms.map((p) => p.code)
                    const allSelected = codes.every((c) => selected.includes(c))
                    const someSelected = codes.some((c) => selected.includes(c))
                    return (
                      <div key={slug} className="rounded-md border">
                        <button
                          type="button"
                          onClick={() => toggleModule(slug, codes)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                              allSelected ? "bg-primary border-primary"
                              : someSelected ? "bg-primary/40 border-primary"
                              : "border-muted-foreground/40"
                            }`}>
                              {allSelected && <Check size={10} className="text-white" />}
                            </div>
                            <span className="text-sm font-medium capitalize">{slug}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {codes.filter((c) => selected.includes(c)).length} / {codes.length}
                          </span>
                        </button>
                        <div className="p-2 space-y-1">
                          {perms.map((p) => {
                            const active = selected.includes(p.code)
                            return (
                              <button
                                key={p.code}
                                type="button"
                                onClick={() => togglePermission(p.code)}
                                className={`w-full flex items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                                  active ? "bg-primary/5" : "hover:bg-accent/50"
                                }`}
                              >
                                <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                                  active ? "bg-primary border-primary" : "border-muted-foreground/40"
                                }`}>
                                  {active && <Check size={10} className="text-white" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium">{p.name}</p>
                                  {p.description && (
                                    <p className="text-muted-foreground line-clamp-2">{p.description}</p>
                                  )}
                                  <p className="text-[10px] font-mono text-muted-foreground/70">{p.code}</p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
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
