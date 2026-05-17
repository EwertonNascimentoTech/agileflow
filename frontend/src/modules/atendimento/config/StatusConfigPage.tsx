import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, GripVertical, Trophy, X as XIcon, Circle, ChevronDown, ChevronUp } from "lucide-react"
import { statusConfigApi, funnelsApi } from "@/api/atendimento"
import type { StatusConfig, Funnel, StageOutcome } from "@/api/atendimento"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import StageRequiredFieldsConfig from "./StageRequiredFieldsConfig"
import PlaybookConfig from "./PlaybookConfig"

const schema = z.object({
  funnel_id: z.string().uuid(),
  name: z.string().min(1, "Nome obrigatório"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  order: z.coerce.number().min(0),
  is_initial: z.boolean(),
  is_final: z.boolean(),
  outcome: z.enum(["neutral", "won", "lost"]),
})
type FormData = z.infer<typeof schema>

const PRESET_COLORS = [
  "#6B7280", "#3B82F6", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#0EA5E9",
]

const OUTCOME_LABELS: Record<StageOutcome, string> = {
  neutral: "Neutra",
  won: "Ganho",
  lost: "Perdido",
}

const OUTCOME_ICONS: Record<StageOutcome, typeof Circle> = {
  neutral: Circle,
  won: Trophy,
  lost: XIcon,
}

const OUTCOME_COLORS: Record<StageOutcome, string> = {
  neutral: "text-muted-foreground",
  won: "text-emerald-600",
  lost: "text-red-600",
}

function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e.response?.data?.detail
  if (typeof d === "string") return d
  return "Erro ao processar."
}

export default function StatusConfigPage() {
  const navigate = useNavigate()
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [selectedFunnelId, setSelectedFunnelId] = useState<string>("")
  const [statuses, setStatuses] = useState<StatusConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingStatuses, setLoadingStatuses] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<StatusConfig | null>(null)
  const [serverError, setServerError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema) as Resolver<FormData>,
      defaultValues: { color: "#6B7280", order: 0, is_initial: false, is_final: false, outcome: "neutral" },
    })
  const color = watch("color")
  const outcome = watch("outcome")

  useEffect(() => {
    funnelsApi.list(false)
      .then((fs) => {
        setFunnels(fs)
        const def = fs.find(f => f.is_default) ?? fs[0]
        if (def) setSelectedFunnelId(def.id)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedFunnelId) return
    setLoadingStatuses(true)
    statusConfigApi.list(selectedFunnelId)
      .then(s => setStatuses(s.sort((a, b) => a.order - b.order)))
      .finally(() => setLoadingStatuses(false))
  }, [selectedFunnelId])

  function openCreate() {
    setEditing(null)
    reset({
      funnel_id: selectedFunnelId,
      name: "",
      color: "#6B7280",
      order: statuses.length,
      is_initial: false,
      is_final: false,
      outcome: "neutral",
    })
    setServerError("")
    setOpen(true)
  }

  function openEdit(s: StatusConfig) {
    setEditing(s)
    reset({
      funnel_id: s.funnel_id,
      name: s.name,
      color: s.color,
      order: s.order,
      is_initial: s.is_initial,
      is_final: s.is_final,
      outcome: s.outcome,
    })
    setServerError("")
    setOpen(true)
  }

  async function onSubmit(data: FormData) {
    setServerError("")
    try {
      if (editing) {
        const { funnel_id: _fid, ...payload } = data
        const updated = await statusConfigApi.update(editing.id, payload)
        setStatuses(prev => prev.map(s => s.id === updated.id ? updated : s).sort((a, b) => a.order - b.order))
      } else {
        const created = await statusConfigApi.create(data)
        setStatuses(prev => [...prev, created].sort((a, b) => a.order - b.order))
      }
      setOpen(false)
    } catch (err) {
      setServerError(getApiError(err))
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await statusConfigApi.delete(id)
      setStatuses(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      alert(getApiError(err))
    } finally {
      setDeletingId(null)
    }
  }

  const selectedFunnel = funnels.find(f => f.id === selectedFunnelId)

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/app/modules/atendimento/config")}>
          <ArrowLeft size={15} />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Etapas do Kanban</h2>
          <p className="text-sm text-muted-foreground">Configure as colunas de cada funil.</p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5" disabled={!selectedFunnelId}>
          <Plus size={14} /> Nova Etapa
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-10 w-full rounded-md" />
      ) : funnels.length === 0 ? (
        <Alert>
          <AlertDescription className="text-xs">
            Nenhum funil cadastrado. <button onClick={() => navigate("/app/modules/atendimento/config/funnels")} className="underline font-medium">Crie um funil</button> antes de configurar etapas.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs">Funil</Label>
          <Select value={selectedFunnelId} onValueChange={setSelectedFunnelId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {funnels.map(f => (
                <SelectItem key={f.id} value={f.id}>
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: f.color }} />
                    {f.name}
                    {f.is_default && <Badge variant="outline" className="text-[10px] h-4 px-1">padrão</Badge>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedFunnel?.description && (
            <p className="text-xs text-muted-foreground">{selectedFunnel.description}</p>
          )}
        </div>
      )}

      {loadingStatuses ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : !selectedFunnelId ? null : statuses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm border border-dashed rounded-lg">
          Nenhuma etapa neste funil. Clique em "Nova Etapa" para começar.
        </div>
      ) : (
        <div className="space-y-2">
          {statuses.map(s => {
            const OutcomeIcon = OUTCOME_ICONS[s.outcome]
            const isExpanded = expandedStageId === s.id
            return (
              <div key={s.id} className="rounded-lg border bg-background overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <GripVertical size={14} className="text-muted-foreground shrink-0 cursor-grab" />
                  <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{s.name}</span>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <span className={`flex items-center gap-1 text-[10px] ${OUTCOME_COLORS[s.outcome]}`}>
                        <OutcomeIcon size={10} />
                        {OUTCOME_LABELS[s.outcome]}
                      </span>
                      {s.is_initial && <Badge variant="outline" className="text-[10px] py-0 h-4">Inicial</Badge>}
                      {s.is_final && <Badge variant="outline" className="text-[10px] py-0 h-4">Final</Badge>}
                      {typeof s.probability !== "undefined" && (
                        <Badge variant="outline" className="text-[10px] py-0 h-4">{s.probability}%</Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">#{s.order}</span>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    title="Campos obrigatórios e playbook"
                    onClick={() => setExpandedStageId(isExpanded ? null : s.id)}
                  >
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                    <Pencil size={12} />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(s.id)}
                    disabled={deletingId === s.id}
                  >
                    {deletingId === s.id
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Trash2 size={12} />
                    }
                  </Button>
                </div>
                {isExpanded && (
                  <div className="border-t bg-muted/20 p-4 space-y-6">
                    <StageRequiredFieldsConfig statusId={s.id} />
                    <div className="border-t pt-4">
                      <PlaybookConfig statusId={s.id} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Etapa" : "Nova Etapa"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>}

            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input placeholder="Ex: Em andamento" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setValue("color", c)}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={e => setValue("color", e.target.value)}
                  className="h-7 w-7 rounded-full cursor-pointer border-0 p-0"
                  title="Cor personalizada"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ordem</Label>
                <Input type="number" min={0} {...register("order")} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de etapa</Label>
                <Select
                  value={outcome}
                  onValueChange={(v) => setValue("outcome", v as StageOutcome)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="neutral">
                      <span className="flex items-center gap-2"><Circle size={12} /> Neutra</span>
                    </SelectItem>
                    <SelectItem value="won">
                      <span className="flex items-center gap-2 text-emerald-600"><Trophy size={12} /> Ganho</span>
                    </SelectItem>
                    <SelectItem value="lost">
                      <span className="flex items-center gap-2 text-red-600"><XIcon size={12} /> Perdido</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {outcome === "won" && "Atendimento é considerado ganho ao chegar aqui."}
                  {outcome === "lost" && "Atendimento é considerado perdido ao chegar aqui."}
                  {outcome === "neutral" && "Etapa intermediária."}
                </p>
              </div>
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Etapa inicial</Label>
                  <p className="text-xs text-muted-foreground">Padrão ao criar atendimentos neste funil</p>
                </div>
                <Switch
                  checked={watch("is_initial")}
                  onCheckedChange={v => setValue("is_initial", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Etapa final</Label>
                  <p className="text-xs text-muted-foreground">Fecha o atendimento ao chegar aqui</p>
                </div>
                <Switch
                  checked={watch("is_final")}
                  onCheckedChange={v => setValue("is_final", v)}
                />
              </div>
            </div>

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
