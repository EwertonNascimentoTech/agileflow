import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  ArrowLeft, Pencil, Loader2, Mail, Phone,
  FileText, MessageSquare, AtSign, Globe, ChevronRight,
} from "lucide-react"
import { clientsApi, statusConfigApi, companiesApi } from "@/api/crm"
import type { Client, AttendanceSummary, StatusConfig, ChannelType, Priority, ClientType, CompanySummary } from "@/api/crm"
import ProposalsListPanel from "@/modules/crm/proposals/ProposalsListPanel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { nullableStr } from "@/lib/utils"
import { useNewAttendanceModal } from "@/modules/crm/newAttendanceModal"

const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  salao: "Salão", delivery: "Delivery", evento: "Evento",
  corporativo: "Corporativo", recorrente: "Recorrente",
}
const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baixa", medium: "Normal", high: "Alta", urgent: "Urgente",
}
const PRIORITY_VARIANTS: Record<Priority, "outline" | "secondary" | "destructive"> = {
  low: "outline", medium: "secondary", high: "secondary", urgent: "destructive",
}

function ChannelIcon({ channel }: { channel: ChannelType }) {
  if (channel === "whatsapp")  return <MessageSquare size={13} className="text-green-600 shrink-0" />
  if (channel === "instagram") return <AtSign size={13} className="text-pink-600 shrink-0" />
  if (channel === "phone")     return <Phone size={13} className="text-blue-600 shrink-0" />
  return <Globe size={13} className="text-muted-foreground shrink-0" />
}

const NO_COMPANY = "__none__"

const editSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  document: z.string().optional(),
  client_type: z.enum(["salao", "delivery", "evento", "corporativo", "recorrente"]),
  entity_type: z.enum(["pf", "pj"]),
  company_id: z.string().nullable().optional(),
  notes: z.string().optional(),
})
type EditForm = z.infer<typeof editSchema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  return "Erro ao salvar."
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { openNew } = useNewAttendanceModal()
  const [client, setClient] = useState<Client | null>(null)
  const [attendances, setAttendances] = useState<AttendanceSummary[]>([])
  const [statuses, setStatuses] = useState<StatusConfig[]>([])
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editError, setEditError] = useState("")

  const { register, handleSubmit, setValue, reset, formState: { errors, isSubmitting } } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  })

  useEffect(() => {
    if (!id) return
    Promise.all([
      clientsApi.get(id),
      clientsApi.getAttendances(id),
      statusConfigApi.list(),
      companiesApi.list({ limit: 200, active_only: false }).catch(() => [] as CompanySummary[]),
    ]).then(([c, a, s, cos]) => {
      setClient(c)
      setAttendances(a)
      setStatuses(s.sort((x, y) => x.order - y.order))
      setCompanies(cos)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  function openEdit() {
    if (!client) return
    reset({
      name: client.name,
      email: client.email ?? "",
      phone: client.phone ?? "",
      document: client.document ?? "",
      client_type: client.client_type,
      entity_type: client.entity_type,
      company_id: client.company_id,
      notes: client.notes ?? "",
    })
    setEditError("")
    setEditOpen(true)
  }

  async function onEdit(data: EditForm) {
    if (!id) return
    setEditError("")
    try {
      const payload = {
        ...data,
        email: nullableStr(data.email),
        phone: nullableStr(data.phone),
        document: nullableStr(data.document),
        notes: nullableStr(data.notes),
        company_id: data.company_id && data.company_id !== NO_COMPANY ? data.company_id : null,
      }
      const updated = await clientsApi.update(id, payload)
      setClient(updated)
      setEditOpen(false)
    } catch (err) {
      setEditError(getApiError(err))
    }
  }

  const statusMap = new Map(statuses.map(s => [s.id, s]))

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!client) {
    return <div className="py-16 text-center text-muted-foreground">Contato não encontrado.</div>
  }

  const initials = client.name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight">{client.name}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs uppercase">
                {client.entity_type}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {CLIENT_TYPE_LABELS[client.client_type]}
              </Badge>
              <Badge variant={client.is_active ? "success" : "destructive"} className="text-xs">
                {client.is_active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => openNew(client.id)}
          >
            <MessageSquare size={13} /> Novo atendimento
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={openEdit}>
            <Pencil size={13} />
          </Button>
        </div>
      </div>

      {/* Contact info strip */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground px-1">
        {client.email && (
          <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
            <Mail size={13} /> {client.email}
          </a>
        )}
        {client.phone && (
          <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
            <Phone size={13} /> {client.phone}
          </a>
        )}
        {client.document && (
          <span className="flex items-center gap-1.5">
            <FileText size={13} /> {client.document}
          </span>
        )}
      </div>

      <Tabs defaultValue="attendances">
        <TabsList>
          <TabsTrigger value="attendances">
            Atendimentos <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded-full">{attendances.length}</span>
          </TabsTrigger>
          <TabsTrigger value="proposals">Propostas</TabsTrigger>
          <TabsTrigger value="info">Informações</TabsTrigger>
        </TabsList>

        {/* Atendimentos */}
        <TabsContent value="attendances">
          {attendances.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center text-muted-foreground">
              <MessageSquare size={32} className="mb-2 opacity-30" />
              <p className="text-sm font-medium">Nenhum atendimento com este contato</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 gap-1.5"
                onClick={() => openNew(client.id)}
              >
                <MessageSquare size={13} /> Criar atendimento
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5 mt-1">
              {attendances.map(a => {
                const status = statusMap.get(a.status_id)
                return (
                  <Card
                    key={a.id}
                    className="cursor-pointer hover:shadow-sm transition-shadow"
                    onClick={() => navigate(`/app/modules/crm/attendances/${a.id}`)}
                  >
                    <CardContent className="flex items-center gap-3 p-3">
                      <span className="text-xs font-mono text-muted-foreground w-24 shrink-0 hidden sm:block">
                        {a.protocol}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.subject}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <ChannelIcon channel={a.channel} />
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.opened_at).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </div>
                      <Badge variant={PRIORITY_VARIANTS[a.priority]} className="text-xs hidden sm:flex shrink-0">
                        {PRIORITY_LABELS[a.priority]}
                      </Badge>
                      {status && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
                          <span className="text-xs hidden md:block">{status.name}</span>
                        </div>
                      )}
                      {a.closed_at && (
                        <Badge variant="secondary" className="text-xs shrink-0">Fechado</Badge>
                      )}
                      <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Propostas */}
        <TabsContent value="proposals">
          <Card className="mt-1">
            <CardContent className="p-4">
              <ProposalsListPanel
                clientId={client.id}
                newProposalParams={{ client_id: client.id }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Informações */}
        <TabsContent value="info">
          <Card className="mt-1">
            <CardContent className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Nome</p>
                <p className="font-medium">{client.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Tipo</p>
                <p className="font-medium">{CLIENT_TYPE_LABELS[client.client_type]}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">E-mail</p>
                <p className="font-medium">{client.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Telefone</p>
                <p className="font-medium">{client.phone ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">CPF / CNPJ</p>
                <p className="font-medium">{client.document ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Cadastrado em</p>
                <p className="font-medium">{new Date(client.created_at).toLocaleDateString("pt-BR")}</p>
              </div>
              {client.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Observações</p>
                  <p className="font-medium whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar contato</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onEdit)} className="space-y-3">
            {editError && <Alert variant="destructive"><AlertDescription>{editError}</AlertDescription></Alert>}

            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">Mínimo 2 caracteres</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">E-mail inválido</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input {...register("phone")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pessoa</Label>
                <Select
                  defaultValue={client.entity_type}
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
                <Input {...register("document")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Segmento</Label>
                <Select
                  defaultValue={client.client_type}
                  onValueChange={v => setValue("client_type", v as ClientType)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CLIENT_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Empresa</Label>
                <Select
                  defaultValue={client.company_id ?? NO_COMPANY}
                  onValueChange={v => setValue("company_id", v === NO_COMPANY ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_COMPANY}>Sem empresa</SelectItem>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input placeholder="Observações sobre o contato…" {...register("notes")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 size={13} className="animate-spin mr-1.5" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
