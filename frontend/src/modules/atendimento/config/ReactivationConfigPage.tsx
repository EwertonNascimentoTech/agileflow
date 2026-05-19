import { useEffect, useState } from "react"
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react"
import { reactivationApi } from "@/api/atendimento"
import type { ReactivationConfig, Funnel } from "@/api/atendimento"
import { funnelsApi } from "@/api/atendimento"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/lib/toast"

export default function ReactivationConfigPage() {
  const [configs, setConfigs] = useState<ReactivationConfig[]>([])
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ funnel_id: "", loss_reason: "", delay_days: 30 })

  async function load() {
    try {
      const [cfgs, fs] = await Promise.all([reactivationApi.list(), funnelsApi.list(true)])
      setConfigs(cfgs)
      setFunnels(fs)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    setSaving(true)
    try {
      await reactivationApi.create({
        funnel_id: form.funnel_id && form.funnel_id !== "__all__" ? form.funnel_id : undefined,
        loss_reason: form.loss_reason || undefined,
        delay_days: form.delay_days,
        is_active: true,
      })
      toast.success("Configuração criada!")
      setShowForm(false)
      setForm({ funnel_id: "", loss_reason: "", delay_days: 30 })
      await load()
    } catch {
      toast.error("Erro ao criar configuração.")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(cfg: ReactivationConfig) {
    try {
      await reactivationApi.update(cfg.id, { is_active: !cfg.is_active })
      toast.success(cfg.is_active ? "Reativação desativada." : "Reativação ativada.")
      await load()
    } catch {
      toast.error("Erro ao atualizar.")
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta configuração de reativação?")) return
    try {
      await reactivationApi.remove(id)
      toast.success("Configuração removida.")
      await load()
    } catch {
      toast.error("Erro ao remover.")
    }
  }

  const funnelName = (id?: string | null) =>
    funnels.find(f => f.id === id)?.name ?? "Todos os funis"

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Reativação Automática</h2>
          <p className="text-sm text-muted-foreground">
            Cria novo atendimento automaticamente X dias após um negócio ser perdido.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowForm(v => !v)}>
          <Plus size={14} /> Nova regra
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Nova configuração</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Funil</Label>
                <Select value={form.funnel_id || "__all__"} onValueChange={v => setForm(f => ({ ...f, funnel_id: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os funis</SelectItem>
                    {funnels.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Dias até reativar</Label>
                <Input
                  type="number" min={1} className="h-8 text-sm"
                  value={form.delay_days}
                  onChange={e => setForm(f => ({ ...f, delay_days: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motivo de perda (opcional — vazio = qualquer motivo)</Label>
              <Input
                className="h-8 text-sm"
                placeholder="Ex: Cliente optou por concorrente"
                value={form.loss_reason}
                onChange={e => setForm(f => ({ ...f, loss_reason: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : configs.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          Nenhuma regra configurada. Clique em "Nova regra" para começar.
        </div>
      ) : (
        <div className="space-y-2">
          {configs.map(cfg => (
            <Card key={cfg.id}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{funnelName(cfg.funnel_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    Reativar após <span className="font-semibold">{cfg.delay_days} dias</span>
                    {cfg.loss_reason && <> · Motivo: <span className="italic">"{cfg.loss_reason}"</span></>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={cfg.is_active ? "default" : "secondary"}>
                    {cfg.is_active ? "Ativa" : "Inativa"}
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggle(cfg)}>
                    {cfg.is_active ? <ToggleRight size={16} className="text-primary" /> : <ToggleLeft size={16} />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(cfg.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
