import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Plus, ShieldCheck, Trash2, Pencil } from "lucide-react"
import { adminsApi } from "@/api/superAdmin"
import type { User } from "@/types"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"
import { passwordSchema } from "@/lib/passwordSchema"
import { PasswordChecklist } from "@/components/PasswordChecklist"

const createSchema = z.object({
  full_name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("E-mail inválido"),
  password: passwordSchema,
})
type CreateForm = z.infer<typeof createSchema>

const editSchema = z.object({
  full_name: z.string().min(2, "Mínimo 2 caracteres"),
  is_active: z.boolean(),
})
type EditForm = z.infer<typeof editSchema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar a requisição."
}

export default function AdminsPage() {
  const { user: me } = useAuth()
  const [admins, setAdmins] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [serverError, setServerError] = useState("")
  const [editError, setEditError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) })
  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) })

  useEffect(() => {
    adminsApi.list()
      .then(setAdmins)
      .catch((e) => setServerError(getApiError(e)))
      .finally(() => setLoading(false))
  }, [])

  function openCreate() {
    createForm.reset()
    setServerError("")
    setCreateOpen(true)
  }

  function openEdit(u: User) {
    setEditing(u)
    editForm.reset({ full_name: u.full_name, is_active: u.is_active })
    setEditError("")
  }

  async function onCreate(data: CreateForm) {
    setServerError("")
    try {
      const created = await adminsApi.create(data)
      setAdmins(prev => [created, ...prev])
      createForm.reset()
      setCreateOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  async function onEdit(data: EditForm) {
    if (!editing) return
    setEditError("")
    try {
      const updated = await adminsApi.update(editing.id, data)
      setAdmins(prev => prev.map(x => x.id === updated.id ? updated : x))
      setEditing(null)
    } catch (err) {
      setEditError(getApiError(err))
    }
  }

  async function handleDelete(u: User) {
    if (!confirm(`Excluir o super admin "${u.full_name}"?`)) return
    setDeletingId(u.id)
    try {
      await adminsApi.remove(u.id)
      setAdmins(prev => prev.filter(x => x.id !== u.id))
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
          <h1 className="text-2xl font-bold">Super Admins</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Carregando…" : `${admins.length} administrador${admins.length !== 1 ? "es" : ""} da plataforma`}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus size={16} />
          Novo Super Admin
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : admins.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nenhum super admin cadastrado"
          description="Cadastre o primeiro super administrador da plataforma."
          action={{ label: "Novo Super Admin", onClick: openCreate }}
        />
      ) : (
        <div className="space-y-1.5">
          {admins.map(u => (
            <Card key={u.id} className={!u.is_active ? "opacity-60" : ""}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {u.full_name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{u.full_name}</p>
                      {u.id === me?.id && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">você</Badge>}
                      {!u.is_active && <Badge variant="outline" className="text-[10px] h-4 px-1.5">inativo</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(u)}>
                    <Pencil size={13} />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(u)}
                    disabled={deletingId === u.id || u.id === me?.id}
                    title={u.id === me?.id ? "Não pode excluir você mesmo" : ""}
                  >
                    {deletingId === u.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Super Admin</DialogTitle>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input placeholder="João Silva" {...createForm.register("full_name")} />
              {createForm.formState.errors.full_name && (
                <p className="text-xs text-destructive">{createForm.formState.errors.full_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" placeholder="admin@kore.com" {...createForm.register("email")} />
              {createForm.formState.errors.email && (
                <p className="text-xs text-destructive">{createForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Senha</Label>
              <Input type="password" placeholder="Senha forte" {...createForm.register("password")} />
              <PasswordChecklist password={createForm.watch("password") ?? ""} />
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>
              )}
            </div>
            {serverError && <Alert variant="destructive"><AlertDescription className="text-xs">{serverError}</AlertDescription></Alert>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createForm.formState.isSubmitting}>
                {createForm.formState.isSubmitting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar super admin</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input {...editForm.register("full_name")} />
              {editForm.formState.errors.full_name && (
                <p className="text-xs text-destructive">{editForm.formState.errors.full_name.message}</p>
              )}
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <p className="text-sm">Ativo</p>
              <Switch
                checked={editForm.watch("is_active") ?? true}
                onCheckedChange={(v) => editForm.setValue("is_active", v)}
              />
            </div>
            {editError && <Alert variant="destructive"><AlertDescription className="text-xs">{editError}</AlertDescription></Alert>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit" disabled={editForm.formState.isSubmitting}>
                {editForm.formState.isSubmitting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
