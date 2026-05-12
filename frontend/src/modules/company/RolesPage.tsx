import { useEffect, useMemo, useState } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ShieldCheck, Plus, Pencil, Trash2, Loader2, Users as UsersIcon, Check } from "lucide-react"
import { companyApi } from "@/api/company"
import type { Role, ModulePermission } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"

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
      .then(([r, p]) => { setRoles(r); setPermissions(p) })
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Funções</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Carregando…" : `${roles.length} função${roles.length !== 1 ? "es" : ""} cadastrada${roles.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5" disabled={permissions.length === 0}>
          <Plus size={16} />
          Nova Função
        </Button>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          Funções definem o que cada usuário pode fazer dentro dos módulos. <strong>Admins</strong> têm acesso total e dispensam função.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : roles.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nenhuma função criada"
          description="Crie funções como Atendente, Gerente etc. e atribua permissões granulares por módulo."
          action={{ label: "Nova Função", onClick: openCreate }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{role.name}</p>
                      {role.is_system && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">sistema</Badge>
                      )}
                    </div>
                    {role.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{role.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => openEdit(role)}
                      disabled={role.is_system}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(role)}
                      disabled={role.is_system || deletingId === role.id}
                    >
                      {deletingId === role.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Trash2 size={13} />}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <UsersIcon size={11} /> {role.user_count} usuário{role.user_count !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <ShieldCheck size={11} /> {role.permissions.length} permissão{role.permissions.length !== 1 ? "ões" : ""}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
