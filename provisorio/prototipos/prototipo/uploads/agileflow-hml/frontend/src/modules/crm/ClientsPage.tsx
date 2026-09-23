import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Users, Plus, Search, ChevronRight, Loader2 } from "lucide-react"
import { clientsApi } from "@/api/crm"
import type { ClientSummary, ClientType } from "@/api/crm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"

const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  salao: "Salão", delivery: "Delivery", evento: "Evento",
  corporativo: "Corporativo", recorrente: "Recorrente",
}

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  document: z.string().optional(),
  client_type: z.enum(["salao", "delivery", "evento", "corporativo", "recorrente"]),
  entity_type: z.enum(["pf", "pj"]),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao processar."
}

export default function ClientsPage() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState("")

  const { register, handleSubmit, setValue, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { client_type: "recorrente", entity_type: "pf" },
  })

  useEffect(() => {
    clientsApi.list({ limit: 200 }).then(setClients).finally(() => setLoading(false))
  }, [])

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? "").includes(search)
  )

  async function onSubmit(data: FormData) {
    setServerError("")
    try {
      const created = await clientsApi.create({
        ...data,
        email: data.email || undefined,
      })
      setClients(prev => [{ ...created }, ...prev])
      reset({ client_type: "recorrente", entity_type: "pf" })
      setOpen(false)
      navigate(`/app/modules/crm/clients/${created.id}`)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  return (
    <div className="space-y-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Contatos</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "…" : `${clients.length} contato${clients.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={() => { reset({ client_type: "recorrente", entity_type: "pf" }); setServerError(""); setOpen(true) }} className="gap-1.5">
          <Plus size={14} /> Novo contato
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "Nenhum contato encontrado" : "Nenhum contato cadastrado"}
          description={search ? "Tente buscar por outro termo." : "Cadastre o primeiro contato para começar."}
          action={!search ? { label: "Novo contato", onClick: () => { reset({ client_type: "recorrente", entity_type: "pf" }); setServerError(""); setOpen(true) } } : undefined}
        />
      ) : (
        <div className="space-y-1.5">
          {filtered.map(client => (
            <Card
              key={client.id}
              className="cursor-pointer hover:shadow-sm transition-shadow"
              onClick={() => navigate(`/app/modules/crm/clients/${client.id}`)}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                  {client.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{client.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{client.email ?? client.phone ?? "—"}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0 hidden sm:flex">
                  {CLIENT_TYPE_LABELS[client.client_type]}
                </Badge>
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo contato</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            {serverError && <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>}

            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input placeholder="Nome do contato" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" placeholder="email@exemplo.com" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input placeholder="(00) 00000-0000" {...register("phone")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pessoa</Label>
                <Select
                  defaultValue="pf"
                  onValueChange={v => setValue("entity_type", v as "pf" | "pj")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pf">Física (PF)</SelectItem>
                    <SelectItem value="pj">Jurídica (PJ)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>CPF / CNPJ</Label>
                <Input placeholder="000.000.000-00" {...register("document")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Select defaultValue="recorrente" onValueChange={v => setValue("client_type", v as ClientType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CLIENT_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 size={13} className="animate-spin mr-1.5" />}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
