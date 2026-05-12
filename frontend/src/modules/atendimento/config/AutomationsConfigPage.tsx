import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, Zap, Bot } from "lucide-react"
import { automationsApi, funnelsApi, statusConfigApi } from "@/api/atendimento"
import type { AutomationRule, AutomationTrigger, AutomationAction, Funnel, StatusConfig } from "@/api/atendimento"
import { companyApi as companyApiPublic } from "@/api/company"
import type { User } from "@/types"
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
const NO_STAGE = "__none__"
const NO_USER = "__none__"

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  created:     "Atendimento criado",
  enter_stage: "Entra em etapa",
  status_won:  "Etapa de ganho",
  status_lost: "Etapa de perdido",
}

const ACTION_LABELS: Record<AutomationAction, string> = {
  create_task:       "Criar tarefa",
  send_notification: "Enviar notificação",
  update_priority:   "Atualizar prioridade",
  assign_user:       "Atribuir usuário",
}

const schema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().optional(),
  trigger: z.enum(["created", "enter_stage", "status_won", "status_lost"]),
  funnel_id: z.string().nullable().optional(),
  stage_id: z.string().nullable().optional(),
  action: z.enum(["create_task", "send_notification", "update_priority", "assign_user"]),
  // Config fields (flat)
  task_title: z.string().optional(),
  due_hours: z.string().optional(),
  message: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  user_id: z.string().nullable().optional(),
  order: z.string().optional(),
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

export default function AutomationsConfigPage() {
  const navigate = useNavigate()
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [stages, setStages] = useState<StatusConfig[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AutomationRule | null>(null)
  const [serverError, setServerError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema) as Resolver<FormData>,
      defaultValues: { trigger: "enter_stage", action: "create_task", is_active: true },
    })

  const trigger = watch("trigger")
  const action = watch("action")
  const funnelId = watch("funnel_id")

  useEffect(() => {
    Promise.all([
      automationsApi.list({ active_only: false }),
      funnelsApi.list(true),
      statusConfigApi.list(),
      companyApiPublic.listUsers({ active_only: true }).catch(() => [] as User[]),
    ]).then(([r, f, s, u]) => {
      setRules(r); setFunnels(f); setStages(s); setUsers(u)
    }).finally(() => setLoading(false))
  }, [])

  const stageOptions = funnelId && funnelId !== NO_FUNNEL
    ? stages.filter(s => s.funnel_id === funnelId)
    : stages

  function openCreate() {
    setEditing(null)
    reset({
      name: "", description: "",
      trigger: "enter_stage", action: "create_task",
      funnel_id: NO_FUNNEL, stage_id: NO_STAGE, user_id: NO_USER,
      task_title: "", due_hours: "24", message: "", priority: "medium",
      order: "0", is_active: true,
    })
    setServerError("")
    setOpen(true)
  }

  function openEdit(r: AutomationRule) {
    setEditing(r)
    const cfg = r.action_config ?? {}
    reset({
      name: r.name,
      description: r.description ?? "",
      trigger: r.trigger,
      funnel_id: r.funnel_id ?? NO_FUNNEL,
      stage_id: r.stage_id ?? NO_STAGE,
      action: r.action,
      task_title: (cfg.task_title as string) ?? "",
      due_hours: cfg.due_hours != null ? String(cfg.due_hours) : "24",
      message: (cfg.message as string) ?? "",
      priority: (cfg.priority as never) ?? "medium",
      user_id: (cfg.user_id as string) ?? NO_USER,
      order: String(r.order ?? 0),
      is_active: r.is_active,
    })
    setServerError("")
    setOpen(true)
  }

  async function onSubmit(data: FormData) {
    setServerError("")

    let action_config: Record<string, unknown> = {}
    if (data.action === "create_task") {
      action_config = { task_title: data.task_title, due_hours: Number(data.due_hours || 24) }
    } else if (data.action === "send_notification") {
      action_config = { message: data.message }
    } else if (data.action === "update_priority") {
      action_config = { priority: data.priority }
    } else if (data.action === "assign_user") {
      action_config = { user_id: data.user_id === NO_USER ? null : data.user_id }
    }

    const payload = {
      name: data.name,
      description: data.description,
      trigger: data.trigger,
      action: data.action,
      funnel_id: data.funnel_id && data.funnel_id !== NO_FUNNEL ? data.funnel_id : null,
      stage_id: data.stage_id && data.stage_id !== NO_STAGE ? data.stage_id : null,
      action_config,
      order: Number(data.order || 0),
      is_active: data.is_active ?? true,
    }

    try {
      if (editing) {
        const updated = await automationsApi.update(editing.id, payload)
        setRules(prev => prev.map(r => r.id === updated.id ? updated : r))
      } else {
        const created = await automationsApi.create(payload)
        setRules(prev => [...prev, created])
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  async function handleDelete(r: AutomationRule) {
    if (!confirm(`Excluir a regra "${r.name}"?`)) return
    setDeletingId(r.id)
    try {
      await automationsApi.remove(r.id)
      setRules(prev => prev.filter(x => x.id !== r.id))
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/app/modules/atendimento/config")}>
          <ArrowLeft size={15} />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Automações</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "Carregando…" : `${rules.length} regra${rules.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus size={14} /> Nova Regra
        </Button>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          Regras são executadas automaticamente quando o <strong>gatilho</strong> acontece.
          Você pode filtrar por funil ou etapa específica. <strong>Admins</strong> têm acesso total.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Nenhuma automação criada"
          description="Crie regras pra disparar tarefas, notificações ou mudanças quando algo acontece."
          action={{ label: "Nova Regra", onClick: openCreate }}
        />
      ) : (
        <div className="space-y-2">
          {rules.map(r => {
            const stage = stages.find(s => s.id === r.stage_id)
            const funnel = funnels.find(f => f.id === r.funnel_id)
            return (
              <Card key={r.id} className={!r.is_active ? "opacity-60" : ""}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                    <Bot size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{r.name}</p>
                      {!r.is_active && <Badge variant="outline" className="text-[10px] h-4 px-1.5">inativa</Badge>}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      <span>Quando</span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{TRIGGER_LABELS[r.trigger]}</Badge>
                      {funnel && <><span>em</span><Badge variant="outline" className="text-[10px] h-4 px-1.5">{funnel.name}</Badge></>}
                      {stage && <><span>·</span><Badge variant="outline" className="text-[10px] h-4 px-1.5">{stage.name}</Badge></>}
                      <span>→</span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{ACTION_LABELS[r.action]}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}>
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(r)}
                      disabled={deletingId === r.id}
                    >
                      {deletingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Regra" : "Nova Regra"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input {...register("name")} placeholder="Ex: Criar tarefa quando lead entra em Qualificação" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={2} {...register("description")} placeholder="Para que serve esta regra?" />
            </div>

            <div className="space-y-1.5">
              <Label>Gatilho</Label>
              <Select value={trigger} onValueChange={v => setValue("trigger", v as AutomationTrigger)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {(trigger === "enter_stage") && (
                <div className="space-y-1.5">
                  <Label>Etapa</Label>
                  <Select
                    value={watch("stage_id") ?? NO_STAGE}
                    onValueChange={v => setValue("stage_id", v === NO_STAGE ? null : v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_STAGE}>Qualquer etapa</SelectItem>
                      {stageOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1.5 border-t pt-3">
              <Label>Ação</Label>
              <Select value={action} onValueChange={v => setValue("action", v as AutomationAction)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Configuração específica da ação */}
            {action === "create_task" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Título da tarefa</Label>
                  <Input {...register("task_title")} placeholder="Ligar para o cliente" />
                </div>
                <div className="space-y-1.5">
                  <Label>Prazo (horas)</Label>
                  <Input type="number" min={1} {...register("due_hours")} />
                </div>
              </div>
            )}

            {action === "send_notification" && (
              <div className="space-y-1.5">
                <Label>Mensagem</Label>
                <Textarea rows={2} {...register("message")} placeholder="Lead chegou em etapa de qualificação" />
              </div>
            )}

            {action === "update_priority" && (
              <div className="space-y-1.5">
                <Label>Nova prioridade</Label>
                <Select value={watch("priority") ?? "medium"} onValueChange={v => setValue("priority", v as never)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Normal</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {action === "assign_user" && (
              <div className="space-y-1.5">
                <Label>Atribuir para</Label>
                <Select value={watch("user_id") ?? NO_USER} onValueChange={v => setValue("user_id", v === NO_USER ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_USER}>—</SelectItem>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div className="space-y-1.5">
                <Label>Ordem</Label>
                <Input type="number" min={0} {...register("order")} />
              </div>
              <div className="flex items-end justify-between rounded-md border p-3">
                <Label>Ativa</Label>
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
