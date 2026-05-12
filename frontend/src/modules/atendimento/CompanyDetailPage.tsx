import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Building2, Loader2, Pencil, Mail, Phone, Globe, Briefcase, FileText, Users, MessageSquare } from "lucide-react"
import { companiesApi, clientsApi, attendancesApi } from "@/api/atendimento"
import type { Company, ClientSummary, AttendanceSummary } from "@/api/atendimento"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"

const editSchema = z.object({
  name: z.string().min(2),
  trade_name: z.string().optional(),
  document: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().optional(),
  industry: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.boolean(),
})
type EditForm = z.infer<typeof editSchema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  return "Erro ao salvar."
}

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [company, setCompany] = useState<Company | null>(null)
  const [contacts, setContacts] = useState<ClientSummary[]>([])
  const [attendances, setAttendances] = useState<AttendanceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editError, setEditError] = useState("")

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } =
    useForm<EditForm>({ resolver: zodResolver(editSchema) as Resolver<EditForm> })

  useEffect(() => {
    if (!id) return
    Promise.all([
      companiesApi.get(id),
      clientsApi.list({ limit: 200, active_only: false }),
    ]).then(([c, cs]) => {
      setCompany(c)
      setContacts(cs.filter(x => x.company_id === id))
    }).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id) return
    // Buscar atendimentos vinculados à empresa
    attendancesApi.list({ limit: 200 })
      .then(all => setAttendances(all.filter(a => a.company_id === id)))
      .catch(() => {})
  }, [id])

  function openEdit() {
    if (!company) return
    reset({
      name: company.name,
      trade_name: company.trade_name ?? "",
      document: company.document ?? "",
      email: company.email ?? "",
      phone: company.phone ?? "",
      website: company.website ?? "",
      industry: company.industry ?? "",
      notes: company.notes ?? "",
      is_active: company.is_active,
    })
    setEditError("")
    setEditOpen(true)
  }

  async function onEdit(data: EditForm) {
    if (!id) return
    setEditError("")
    try {
      const payload = { ...data, email: data.email || undefined }
      const updated = await companiesApi.update(id, payload)
      setCompany(updated)
      setEditOpen(false)
    } catch (err) {
      setEditError(getApiError(err))
    }
  }

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-32" /></div>
  }
  if (!company) {
    return <div className="text-center py-16 text-muted-foreground">Empresa não encontrada.</div>
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/app/modules/atendimento/companies")}>
          <ArrowLeft size={15} />
        </Button>
        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Building2 size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold leading-tight">{company.name}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {company.trade_name && <span className="text-sm text-muted-foreground">{company.trade_name}</span>}
            <Badge variant={company.is_active ? "success" : "destructive"} className="text-xs">
              {company.is_active ? "Ativa" : "Inativa"}
            </Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit} className="gap-1.5">
          <Pencil size={13} /> Editar
        </Button>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="contacts">Contatos ({contacts.length})</TabsTrigger>
          <TabsTrigger value="attendances">Atendimentos ({attendances.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {company.document && (
                  <div className="flex items-start gap-2">
                    <FileText size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">CNPJ</p>
                      <p className="font-mono">{company.document}</p>
                    </div>
                  </div>
                )}
                {company.industry && (
                  <div className="flex items-start gap-2">
                    <Briefcase size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Segmento</p>
                      <p>{company.industry}</p>
                    </div>
                  </div>
                )}
                {company.email && (
                  <div className="flex items-start gap-2">
                    <Mail size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">E-mail</p>
                      <p>{company.email}</p>
                    </div>
                  </div>
                )}
                {company.phone && (
                  <div className="flex items-start gap-2">
                    <Phone size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Telefone</p>
                      <p>{company.phone}</p>
                    </div>
                  </div>
                )}
                {company.website && (
                  <div className="flex items-start gap-2">
                    <Globe size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Site</p>
                      <p>{company.website}</p>
                    </div>
                  </div>
                )}
              </div>
              {company.notes && (
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm whitespace-pre-wrap">{company.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          {contacts.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhum contato vinculado.</p>
          ) : (
            <div className="space-y-2">
              {contacts.map(c => (
                <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/app/modules/atendimento/clients/${c.id}`)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      {c.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.email ?? c.phone ?? "—"}</p>
                    </div>
                    <Users size={13} className="text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="attendances">
          {attendances.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhum atendimento vinculado.</p>
          ) : (
            <div className="space-y-2">
              {attendances.map(a => (
                <Card key={a.id} className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/app/modules/atendimento/attendances/${a.id}`)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <MessageSquare size={14} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.subject}</p>
                      <p className="text-xs text-muted-foreground">{a.protocol}</p>
                    </div>
                    {a.value !== null && (
                      <span className="text-sm font-semibold text-emerald-600">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(a.value))}
                      </span>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar — {company.name}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onEdit)} className="space-y-3">
            {editError && <Alert variant="destructive"><AlertDescription>{editError}</AlertDescription></Alert>}
            <div className="space-y-1.5">
              <Label>Razão social</Label>
              <Input {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Nome fantasia</Label><Input {...register("trade_name")} /></div>
              <div className="space-y-1.5"><Label>CNPJ</Label><Input {...register("document")} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" {...register("email")} /></div>
              <div className="space-y-1.5"><Label>Telefone</Label><Input {...register("phone")} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Site</Label><Input {...register("website")} /></div>
              <div className="space-y-1.5"><Label>Segmento</Label><Input {...register("industry")} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={2} {...register("notes")} />
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <Label>Empresa ativa</Label>
              <Switch
                checked={watch("is_active") ?? true}
                onCheckedChange={v => setValue("is_active", v)}
              />
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
