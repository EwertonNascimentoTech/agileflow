import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, MessageSquare, AtSign, Phone, Globe } from "lucide-react"
import { channelsApi } from "@/api/crm"
import type { ChannelConfig, ChannelType } from "@/api/crm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"

const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram",
  phone: "Telefone", site: "Site", other: "Outro",
}

function ChannelIcon({ channel }: { channel: ChannelType }) {
  if (channel === "whatsapp")  return <MessageSquare size={16} className="text-green-600" />
  if (channel === "instagram") return <AtSign size={16} className="text-pink-600" />
  if (channel === "phone")     return <Phone size={16} className="text-blue-600" />
  return <Globe size={16} className="text-muted-foreground" />
}

// WhatsApp fields helper
function WhatsAppFields({ register }: { register: ReturnType<typeof useForm>["register"] }) {
  return (
    <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground">Credenciais WhatsApp Business API</p>
      <div className="space-y-1.5">
        <Label className="text-xs">Phone Number ID</Label>
        <Input placeholder="123456789" {...register("phone_number_id")} className="h-8 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Access Token</Label>
        <Input type="password" placeholder="EAAxxxxxxxx" {...register("access_token")} className="h-8 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Webhook Verify Token</Label>
        <Input placeholder="token-secreto" {...register("webhook_verify_token")} className="h-8 text-sm" />
      </div>
    </div>
  )
}

function InstagramFields({ register }: { register: ReturnType<typeof useForm>["register"] }) {
  return (
    <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground">Credenciais Instagram</p>
      <div className="space-y-1.5">
        <Label className="text-xs">Instagram Account ID</Label>
        <Input placeholder="123456789" {...register("instagram_account_id")} className="h-8 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Access Token</Label>
        <Input type="password" placeholder="EAAxxxxxxxx" {...register("access_token")} className="h-8 text-sm" />
      </div>
    </div>
  )
}

const schema = z.object({
  name: z.string().min(1),
  channel: z.enum(["whatsapp", "instagram", "phone", "site", "other"]),
  webhook_url: z.string().optional(),
  is_active: z.boolean().optional(),
  access_token: z.string().optional(),
  phone_number_id: z.string().optional(),
  webhook_verify_token: z.string().optional(),
  instagram_account_id: z.string().optional(),
})
type FormData = z.infer<typeof schema>

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  return "Erro ao processar."
}

export default function ChannelsConfigPage() {
  const navigate = useNavigate()
  const [channels, setChannels] = useState<ChannelConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ChannelConfig | null>(null)
  const [serverError, setServerError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, reset, formState: { isSubmitting } } = useForm<FormData>({
    defaultValues: { channel: "whatsapp", is_active: true },
  })
  const channelType = watch("channel")

  useEffect(() => {
    channelsApi.list().then(setChannels).finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    reset({ channel: "whatsapp", is_active: true })
    setServerError("")
    setOpen(true)
  }

  function openEdit(c: ChannelConfig) {
    setEditing(c)
    reset({
      name: c.name,
      channel: c.channel,
      webhook_url: c.webhook_url ?? "",
      is_active: c.is_active,
      ...(c.config ?? {}),
    })
    setServerError("")
    setOpen(true)
  }

  async function onSubmit(data: FormData) {
    setServerError("")
    const { name, channel, webhook_url, is_active, access_token, phone_number_id, webhook_verify_token, instagram_account_id } = data
    const credentials: Record<string, string> = {}
    const config: Record<string, string> = {}
    if (access_token) credentials.access_token = access_token
    if (phone_number_id) config.phone_number_id = phone_number_id
    if (webhook_verify_token) config.webhook_verify_token = webhook_verify_token
    if (instagram_account_id) config.instagram_account_id = instagram_account_id

    const payload = { name, channel, webhook_url: webhook_url || undefined, is_active, credentials, config }

    try {
      if (editing) {
        const updated = await channelsApi.update(editing.id, payload)
        setChannels(prev => prev.map(c => c.id === updated.id ? updated : c))
      } else {
        const created = await channelsApi.create(payload)
        setChannels(prev => [...prev, created])
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await channelsApi.delete(id)
      setChannels(prev => prev.filter(c => c.id !== id))
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
          <h2 className="text-lg font-bold">Canais</h2>
          <p className="text-sm text-muted-foreground">Configure suas integrações de mensagens.</p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus size={14} /> Novo Canal
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : channels.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhum canal configurado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map(c => (
            <Card key={c.id} className={!c.is_active ? "opacity-60" : ""}>
              <CardContent className="flex items-center gap-3 p-3">
                <ChannelIcon channel={c.channel} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{CHANNEL_LABELS[c.channel]}</p>
                </div>
                <Badge variant={c.is_active ? "success" : "secondary"}>
                  {c.is_active ? "Ativo" : "Inativo"}
                </Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                  <Pencil size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(c.id)}
                  disabled={deletingId === c.id}
                >
                  {deletingId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Canal" : "Novo Canal"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>}

            <div className="space-y-1.5">
              <Label>Nome do canal</Label>
              <Input placeholder="Ex: WhatsApp Principal" {...register("name")} />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={channelType}
                onValueChange={v => setValue("channel", v as ChannelType)}
              >
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

            {channelType === "whatsapp" && <WhatsAppFields register={register as never} />}
            {channelType === "instagram" && <InstagramFields register={register as never} />}

            <div className="space-y-1.5">
              <Label>URL do Webhook <span className="text-muted-foreground">(opcional)</span></Label>
              <Input placeholder="https://…" {...register("webhook_url")} />
            </div>

            {editing && (
              <div className="flex items-center justify-between border-t pt-3">
                <Label>Canal ativo</Label>
                <Switch
                  checked={watch("is_active") ?? true}
                  onCheckedChange={v => setValue("is_active", v)}
                />
              </div>
            )}

            <DialogFooter>
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
