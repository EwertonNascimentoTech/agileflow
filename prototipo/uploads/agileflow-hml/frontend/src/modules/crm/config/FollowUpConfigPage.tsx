import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  ArrowLeft, Plus, Pencil, Trash2, Loader2, Send,
  MessageSquare, AtSign, Phone, Eye, Bot, Sparkles,
} from "lucide-react"
import { followUpApi, funnelsApi, statusConfigApi } from "@/api/crm"
import type { FollowUpTemplate, FollowUpChannel, Funnel, StatusConfig } from "@/api/crm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmptyState } from "@/components/EmptyState"

const NO_FUNNEL = "__none__"
const NO_STAGE = "__any__"

const CHANNEL_LABELS: Record<FollowUpChannel, string> = {
  auto: "Auto (canal do atendimento)",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  phone: "Telefone (registro)",
  internal: "Interno (só timeline)",
}

const CHANNEL_ICONS: Record<FollowUpChannel, typeof MessageSquare> = {
  auto: Sparkles,
  whatsapp: MessageSquare,
  instagram: AtSign,
  phone: Phone,
  internal: Bot,
}

const VARIABLES: Array<{ key: string; label: string }> = [
  { key: "client_name", label: "Nome do contato" },
  { key: "client_first_name", label: "Primeiro nome" },
  { key: "client_email", label: "E-mail" },
  { key: "client_phone", label: "Telefone" },
  { key: "stage_name", label: "Etapa atual" },
  { key: "funnel_name", label: "Funil" },
  { key: "protocol", label: "Protocolo" },
  { key: "user_name", label: "Usuário atual" },
  { key: "value", label: "Valor" },
]

const schema = z.object({
  name: z.string().min(2).max(200),
  funnel_id: z.string().nullable().optional(),
  stage_id: z.string().nullable().optional(),
  channel: z.enum(["auto", "whatsapp", "instagram", "phone", "internal"]),
  message: z.string().min(1, "Mensagem obrigatória"),
  delay_minutes: z.string().optional(),
  is_active: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  if (Array.isArray(d)) return d.map(x => x.msg).join(", ")
  return "Erro ao processar."
}

export default function FollowUpConfigPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<FollowUpTemplate[]>([])
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [stages, setStages] = useState<StatusConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FollowUpTemplate | null>(null)
  const [serverError, setServerError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [preview, setPreview] = useState("")

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema) as Resolver<FormData>,
      defaultValues: { channel: "auto", is_active: true, delay_minutes: "0" },
    })

  const message = watch("message") ?? ""
  const channel = watch("channel")
  const funnelId = watch("funnel_id")

  useEffect(() => {
    Promise.all([
      followUpApi.list({ active_only: false }),
      funnelsApi.list(true),
      statusConfigApi.list(),
    ]).then(([t, f, s]) => {
      setTemplates(t); setFunnels(f); setStages(s)
    }).finally(() => setLoading(false))
  }, [])

  // Re-render preview ao digitar (debounce simples via state local)
  useEffect(() => {
    if (!message.trim()) { setPreview(""); return }
    const t = setTimeout(() => {
      followUpApi.preview(message).then(r => setPreview(r.preview)).catch(() => setPreview(""))
    }, 250)
    return () => clearTimeout(t)
  }, [message])

  const stageOptions = funnelId && funnelId !== NO_FUNNEL
    ? stages.filter(s => s.funnel_id === funnelId)
    : stages

  function openCreate() {
    setEditing(null)
    reset({
      name: "", channel: "auto", message: "",
      funnel_id: NO_FUNNEL, stage_id: NO_STAGE,
      delay_minutes: "0", is_active: true,
    })
    setServerError("")
    setOpen(true)
  }

  function openEdit(t: FollowUpTemplate) {
    setEditing(t)
    reset({
      name: t.name,
      funnel_id: t.funnel_id ?? NO_FUNNEL,
      stage_id: t.stage_id ?? NO_STAGE,
      channel: t.channel,
      message: t.message,
      delay_minutes: String(t.delay_minutes ?? 0),
      is_active: t.is_active,
    })
    setServerError("")
    setOpen(true)
  }

  function insertVariable(key: string) {
    const ta = document.getElementById("message") as HTMLTextAreaElement | null
    const placeholder = `{{${key}}}`
    if (!ta) {
      setValue("message", (message ?? "") + placeholder, { shouldValidate: true })
      return
    }
    const start = ta.selectionStart ?? message.length
    const end = ta.selectionEnd ?? message.length
    const next = message.slice(0, start) + placeholder + message.slice(end)
    setValue("message", next, { shouldValidate: true })
    setTimeout(() => {
      ta.focus()
      const pos = start + placeholder.length
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  async function onSubmit(data: FormData) {
    setServerError("")
    const payload = {
      name: data.name,
      funnel_id: data.funnel_id && data.funnel_id !== NO_FUNNEL ? data.funnel_id : null,
      stage_id: data.stage_id && data.stage_id !== NO_STAGE ? data.stage_id : null,
      channel: data.channel,
      message: data.message,
      delay_minutes: Number(data.delay_minutes || 0),
      is_active: data.is_active ?? true,
    }
    try {
      if (editing) {
        const updated = await followUpApi.update(editing.id, payload)
        setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t))
      } else {
        const created = await followUpApi.create(payload)
        setTemplates(prev => [...prev, created])
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  async function handleDelete(t: FollowUpTemplate) {
    if (!confirm(`Excluir o template "${t.name}"?`)) return
    setDeletingId(t.id)
    try {
      await followUpApi.remove(t.id)
      setTemplates(prev => prev.filter(x => x.id !== t.id))
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/app/modules/crm/config")}>
          <ArrowLeft size={15} />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Follow-ups Automáticos</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "Carregando…" : `${templates.length} template${templates.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus size={14} /> Novo Template
        </Button>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          Templates são <strong>disparados automaticamente</strong> quando um atendimento entra na etapa configurada (ou em qualquer etapa do funil, se nenhuma for escolhida).
          A mensagem é enviada como bot e registrada na timeline. <strong>Atraso (delay_minutes)</strong> ainda não está ativo — envio é imediato.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={Send}
          title="Nenhum template criado"
          description="Crie templates de mensagem que serão enviados automaticamente quando o atendimento entrar em determinada etapa."
          action={{ label: "Novo Template", onClick: openCreate }}
        />
      ) : (
        <div className="space-y-2">
          {templates.map(t => {
            const Icon = CHANNEL_ICONS[t.channel]
            const stage = stages.find(s => s.id === t.stage_id)
            const funnel = funnels.find(f => f.id === t.funnel_id)
            return (
              <Card key={t.id} className={!t.is_active ? "opacity-60" : ""}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{t.name}</p>
                      {!t.is_active && <Badge variant="outline" className="text-[10px] h-4 px-1.5">inativo</Badge>}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{CHANNEL_LABELS[t.channel]}</Badge>
                      {funnel && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{funnel.name}</Badge>}
                      {stage && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{stage.name}</Badge>}
                      {!stage && !funnel && <span className="text-[10px]">(global)</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{t.message}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(t)}
                      disabled={deletingId === t.id}
                    >
                      {deletingId === t.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Template" : "Novo Template"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input {...register("name")} placeholder="Mensagem de boas-vindas" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Funil</Label>
                <Select
                  value={funnelId ?? NO_FUNNEL}
                  onValueChange={v => { setValue("funnel_id", v === NO_FUNNEL ? null : v); setValue("stage_id", null) }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FUNNEL}>Todos</SelectItem>
                    {funnels.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Etapa</Label>
                <Select
                  value={watch("stage_id") ?? NO_STAGE}
                  onValueChange={v => setValue("stage_id", v === NO_STAGE ? null : v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_STAGE}>Qualquer etapa do funil</SelectItem>
                    {stageOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={channel} onValueChange={v => setValue("channel", v as FollowUpChannel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNEL_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Mensagem</Label>
              <div className="flex flex-wrap gap-1 mb-1">
                {VARIABLES.map(v => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/70 font-mono"
                    title={v.label}
                  >
                    {"{{"}{v.key}{"}}"}
                  </button>
                ))}
              </div>
              <Textarea
                id="message"
                rows={5}
                {...register("message")}
                placeholder="Olá {{client_first_name}}, vimos que você entrou em {{stage_name}}…"
              />
              {errors.message && <p className="text-xs text-destructive">{errors.message.message}</p>}
            </div>

            {preview && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide flex items-center gap-1 mb-1">
                  <Eye size={11} /> Preview
                </p>
                <p className="text-xs whitespace-pre-wrap">{preview}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Atraso (minutos)</Label>
                <Input type="number" min={0} {...register("delay_minutes")} />
                <p className="text-[10px] text-muted-foreground">Recurso futuro — atualmente envio é imediato.</p>
              </div>
              <div className="flex items-end justify-between rounded-md border p-3">
                <Label>Ativo</Label>
                <Switch
                  checked={watch("is_active") ?? true}
                  onCheckedChange={v => setValue("is_active", v)}
                />
              </div>
            </div>

            {serverError && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{serverError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 size={13} className="animate-spin mr-1.5" />}
                {editing ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
