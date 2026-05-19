import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Search } from "lucide-react"
import { toast } from "@/lib/toast"
import { attendancesApi, clientsApi, companiesApi, tagsApi } from "@/api/crm"
import type { Client, ClientSummary, ChannelType, Priority, CompanySummary } from "@/api/crm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram",
  phone: "Telefone", site: "Site", other: "Outro",
}
const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baixa", medium: "Normal", high: "Alta", urgent: "Urgente",
}
const PRIORITY_COLORS: Record<Priority, string> = {
  low: "text-slate-600", medium: "text-blue-600", high: "text-orange-600", urgent: "text-red-600",
}

const NO_COMPANY = "__none__"

const CLASSIFICATION_SLUG_PF = "classificacao_pf"
const CLASSIFICATION_SLUG_PJ = "classificacao_pj"

const schema = z.object({
  client_id: z.string().min(1, "Selecione um contato"),
  /** PF ou PJ — vira tag de classificação no atendimento (slugs do tenant). */
  classification: z.enum(["pf", "pj"]),
  company_id: z.string().nullable().optional(),
  channel: z.enum(["whatsapp", "instagram", "phone", "site", "other"]),
  subject: z.string().min(3, "Mínimo 3 caracteres"),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  value: z.string().optional(),
  expected_close_date: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.classification === "pj") {
    if (!data.company_id || data.company_id === NO_COMPANY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Classificação PJ exige empresa vinculada (vários contatos podem usar a mesma empresa).",
        path: ["company_id"],
      })
    }
  }
})
type FormData = z.infer<typeof schema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map((x) => x.msg).join(", ")
  return "Erro ao criar atendimento."
}

function clientToSummary(c: Client): ClientSummary {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    client_type: c.client_type,
    entity_type: c.entity_type,
    company_id: c.company_id,
    is_active: c.is_active,
    created_at: c.created_at,
  }
}

const defaultForm: Partial<FormData> = {
  channel: "whatsapp",
  priority: "medium",
  client_id: "",
  classification: "pf",
  company_id: null,
  subject: "",
  value: "",
  expected_close_date: "",
}

export default function NewAttendanceDialog({
  open,
  onOpenChange,
  initialClientId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialClientId?: string
}) {
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [classificationTagIds, setClassificationTagIds] = useState<{ pf: string; pj: string } | null>(null)
  const [clientSearch, setClientSearch] = useState("")
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null)
  const [serverError, setServerError] = useState("")

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: defaultForm as FormData,
  })

  const channel = watch("channel")
  const priority = watch("priority")
  const classification = watch("classification")

  useEffect(() => {
    if (!open) return
    clientsApi.list({ limit: 200 }).then(setClients).catch(() => {})
    companiesApi.list({ limit: 200, active_only: true }).then(setCompanies).catch(() => {})
    tagsApi.list("attendance")
      .then((tags) => {
        const pf = tags.find(t => t.slug === CLASSIFICATION_SLUG_PF)
        const pj = tags.find(t => t.slug === CLASSIFICATION_SLUG_PJ)
        if (pf?.id && pj?.id) setClassificationTagIds({ pf: pf.id, pj: pj.id })
        else setClassificationTagIds(null)
      })
      .catch(() => setClassificationTagIds(null))
  }, [open])

  useEffect(() => {
    if (!open) {
      reset(defaultForm as FormData)
      setSelectedClient(null)
      setClientSearch("")
      setServerError("")
      return
    }
    reset(defaultForm as FormData)
    setSelectedClient(null)
    setClientSearch("")
    setServerError("")
    if (initialClientId) {
      clientsApi.get(initialClientId).then((c) => {
        const s = clientToSummary(c)
        setSelectedClient(s)
        setValue("client_id", s.id, { shouldValidate: true })
        setValue("classification", c.entity_type === "pj" ? "pj" : "pf")
        if (c.entity_type === "pj" && c.company_id) {
          setValue("company_id", c.company_id)
        } else {
          setValue("company_id", null)
        }
      }).catch(() => {})
    }
  }, [open, initialClientId, reset, setValue])

  const filteredClients = clients.filter(c =>
    !clientSearch ||
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.email ?? "").toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone ?? "").includes(clientSearch)
  )

  function selectClient(client: ClientSummary) {
    setSelectedClient(client)
    setValue("client_id", client.id, { shouldValidate: true })
    setValue("classification", client.entity_type === "pj" ? "pj" : "pf")
    if (client.entity_type === "pj" && client.company_id) {
      setValue("company_id", client.company_id)
    } else {
      setValue("company_id", null)
    }
    setClientSearch("")
  }

  async function onSubmit(data: FormData) {
    setServerError("")
    if (!classificationTagIds) {
      setServerError("Tags de classificação PF/PJ não encontradas. Rode as migrações do tenant (tags de atendimento).")
      return
    }
    try {
      const companyResolved =
        data.classification === "pj"
          ? (data.company_id && data.company_id !== NO_COMPANY ? data.company_id : undefined)
          : undefined
      const classification_tag_id =
        data.classification === "pj" ? classificationTagIds.pj : classificationTagIds.pf
      const payload = {
        client_id: data.client_id,
        classification_tag_id,
        company_id: companyResolved ?? null,
        channel: data.channel,
        subject: data.subject,
        priority: data.priority,
        value: data.value ? Number(data.value) : undefined,
        expected_close_date: data.expected_close_date
          ? new Date(data.expected_close_date).toISOString()
          : undefined,
      }
      const attendance = await attendancesApi.create(payload)
      toast.success("Atendimento criado com sucesso!")
      onOpenChange(false)
      navigate(`/app/modules/crm/attendances/${attendance.id}`)
    } catch (err) {
      const msg = getApiError(err)
      setServerError(msg)
      toast.error(msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Atendimento</DialogTitle>
          <DialogDescription>
            Todo atendimento é vinculado a um contato. A classificação fica registrada por tag no atendimento: PF (só contato) ou PJ (empresa obrigatória; vários contatos podem compartilhar a mesma empresa).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-1">
          {serverError && (
            <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>
          )}

          <div className="space-y-2">
            <Label>Contato *</Label>

            {selectedClient ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-primary/5 border-primary/20">
                <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                  {selectedClient.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{selectedClient.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedClient.email ?? selectedClient.phone ?? "—"}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs shrink-0"
                  onClick={() => {
                    setSelectedClient(null)
                    setValue("client_id", "")
                    setValue("classification", "pf")
                    setValue("company_id", null)
                  }}
                >
                  Trocar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar contato por nome, e-mail ou telefone…"
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {clientSearch && (
                  <Card className="max-h-48 overflow-y-auto">
                    <CardContent className="p-1">
                      {filteredClients.length === 0 ? (
                        <div className="py-3 text-center text-sm text-muted-foreground">
                          Nenhum contato encontrado.{" "}
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => {
                              onOpenChange(false)
                              navigate("/app/modules/crm/clients")
                            }}
                          >
                            Cadastrar contato
                          </button>
                        </div>
                      ) : (
                        filteredClients.slice(0, 8).map(c => (
                          <button
                            key={c.id}
                            type="button"
                            className="flex items-center gap-3 w-full px-3 py-2 hover:bg-accent rounded-md text-left transition-colors"
                            onClick={() => selectClient(c)}
                          >
                            <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                              {c.name[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{c.email ?? c.phone ?? "—"}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {errors.client_id && (
              <p className="text-xs text-destructive">{errors.client_id.message}</p>
            )}
          </div>

          {selectedClient && (
            <div className="space-y-2">
              <Label>Classificação (tag no atendimento) *</Label>
              <p className="text-xs text-muted-foreground">
                PF: apenas o contato. PJ: vincule sempre uma empresa (outros contatos podem usar a mesma empresa).
              </p>
              {!classificationTagIds && (
                <p className="text-xs text-destructive">
                  Não foi possível carregar as tags PF/PJ. Confira se o tenant tem as tags de atendimento (migração 014).
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setValue("classification", "pf")
                    setValue("company_id", null)
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                    classification === "pf"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input text-muted-foreground hover:border-primary/40"
                  )}
                >
                  PF — Pessoa física
                </button>
                <button
                  type="button"
                  onClick={() => setValue("classification", "pj")}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                    classification === "pj"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input text-muted-foreground hover:border-primary/40"
                  )}
                >
                  PJ — Pessoa jurídica
                </button>
              </div>
            </div>
          )}

          {selectedClient && classification === "pj" && (
          <div className="space-y-1.5">
            <Label>Empresa vinculada *</Label>
            <Select
              value={watch("company_id") ?? NO_COMPANY}
              onValueChange={v => setValue("company_id", v === NO_COMPANY ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COMPANY}>Selecione…</SelectItem>
                {companies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.company_id && (
              <p className="text-xs text-destructive">{errors.company_id.message}</p>
            )}
          </div>
          )}

          <div className="space-y-1.5">
            <Label>Canal *</Label>
            <Select value={channel} onValueChange={v => setValue("channel", v as ChannelType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CHANNEL_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Assunto *</Label>
            <Input placeholder="Descreva brevemente o motivo do atendimento…" {...register("subject")} />
            {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Prioridade</Label>
            <div className="grid grid-cols-4 gap-2">
              {(["low", "medium", "high", "urgent"] as Priority[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setValue("priority", p)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-xs font-medium transition-all",
                    priority === p
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input text-muted-foreground hover:border-primary/40"
                  )}
                >
                  <span className={cn("block text-base mb-0.5", PRIORITY_COLORS[p])}>
                    {p === "low" ? "↓" : p === "medium" ? "→" : p === "high" ? "↑" : "⚡"}
                  </span>
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" min="0" placeholder="0,00" {...register("value")} />
            </div>
            <div className="space-y-1.5">
              <Label>Previsão fech.</Label>
              <Input type="date" {...register("expected_close_date")} />
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting || !classificationTagIds}>
              {isSubmitting ? (
                <><Loader2 size={14} className="animate-spin mr-1.5" /> Criando…</>
              ) : (
                "Criar Atendimento"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
