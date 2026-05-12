import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Plus, ShieldCheck } from "lucide-react"
import { adminsApi } from "@/api/superAdmin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"

const schema = z.object({
  full_name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
})
type FormData = z.infer<typeof schema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar a requisição."
}

export default function AdminsPage() {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState("")
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setServerError("")
    try {
      await adminsApi.create(data)
      setSuccess(true)
      reset()
      setTimeout(() => { setOpen(false); setSuccess(false) }, 1500)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Super Admins</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie os administradores da plataforma.</p>
        </div>
        <Button onClick={() => { reset(); setServerError(""); setSuccess(false); setOpen(true) }} className="gap-1.5">
          <Plus size={16} />
          Novo Super Admin
        </Button>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <ShieldCheck size={40} className="mb-3 opacity-30" />
        <p className="font-medium">Listagem em desenvolvimento</p>
        <p className="text-sm mt-1">Por enquanto, use o botão acima para criar novos Super Admins.</p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Super Admin</DialogTitle>
          </DialogHeader>

          {success ? (
            <div className="py-6 text-center space-y-2">
              <div className="text-4xl">✅</div>
              <p className="font-medium">Super Admin criado com sucesso!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {serverError && (
                <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>
              )}
              <div className="space-y-1.5">
                <Label>Nome completo</Label>
                <Input placeholder="João Silva" {...register("full_name")} />
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" placeholder="admin@kore.com" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Senha</Label>
                <Input type="password" placeholder="mínimo 8 caracteres" {...register("password")} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
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
