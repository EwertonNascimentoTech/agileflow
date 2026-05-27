import { useEffect, useMemo, useState } from "react"
import { GitBranch, Loader2, Save } from "lucide-react"

import { projetosApi, type ProjectFunnel, type ProjectStatus } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { toast } from "@/lib/toast"

type StageCfg = { included: boolean; requireFill: boolean }

export default function BindingsConfigPage() {
  const [funnels, setFunnels] = useState<ProjectFunnel[]>([])
  const [statuses, setStatuses] = useState<ProjectStatus[]>([])
  const [config, setConfig] = useState<Record<string, StageCfg>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const projects = await projetosApi.listProjects(true)
      const pid = projects[0]?.id
      if (!pid) return
      const [fs, sts, bs] = await Promise.all([
        projetosApi.listFunnels(pid, true),
        projetosApi.listStatuses(pid, undefined, true),
        projetosApi.listScheduleBindings(),
      ])
      const cfg: Record<string, StageCfg> = {}
      for (const s of sts) cfg[s.id] = { included: false, requireFill: true }
      for (const b of bs) {
        if (cfg[b.status_id]) cfg[b.status_id] = { included: true, requireFill: b.require_fill }
      }
      setFunnels(fs)
      setStatuses(sts)
      setConfig(cfg)
    }
    load().finally(() => setLoading(false))
  }, [])

  const statusesByFunnel = useMemo(() => {
    const m = new Map<string, ProjectStatus[]>()
    for (const s of [...statuses].sort((a, b) => a.order - b.order)) {
      const arr = m.get(s.funnel_id) ?? []
      arr.push(s)
      m.set(s.funnel_id, arr)
    }
    return m
  }, [statuses])

  function update(statusId: string, patch: Partial<StageCfg>) {
    setConfig((prev) => ({ ...prev, [statusId]: { ...prev[statusId], ...patch } }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = statuses
        .filter((s) => config[s.id]?.included)
        .map((s) => ({
          funnel_id: s.funnel_id,
          status_id: s.id,
          require_fill: config[s.id]?.requireFill ?? true,
          is_active: true,
        }))
      await projetosApi.saveScheduleBindings(payload)
      toast.success("Configuração do cronograma salva.")
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-1"><Skeleton className="h-96 rounded-lg" /></div>

  const orderedFunnels = [...funnels].sort((a, b) => a.order - b.order)

  return (
    <div className="w-full space-y-4 p-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Fluxos e etapas do cronograma</h1>
          <p className="text-sm text-muted-foreground">
            Marque as etapas em que o cronograma deve ser preenchido. Os cards nessas etapas entram
            no cronograma; “exigir preenchimento” bloqueia a saída da etapa sem início e prazo.
          </p>
        </div>
        <Button type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
          Salvar
        </Button>
      </div>

      {orderedFunnels.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="Nenhum fluxo configurado"
          description="Crie fluxos e etapas no módulo Projetos (Configurações → Fluxos / Etapas) para então vinculá-los ao cronograma."
        />
      ) : (
        <div className="space-y-4">
          {orderedFunnels.map((f) => {
            const sts = statusesByFunnel.get(f.id) ?? []
            return (
              <Card key={f.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: f.color }} />
                    <h2 className="font-semibold text-sm">{f.name}</h2>
                  </div>
                  {sts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem etapas neste fluxo.</p>
                  ) : (
                    <div className="space-y-2">
                      {sts.map((s) => {
                        const cfg = config[s.id] ?? { included: false, requireFill: true }
                        return (
                          <div
                            key={s.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="text-sm truncate">{s.name}</span>
                            </div>
                            <div className="flex items-center gap-5">
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Switch
                                  checked={cfg.included}
                                  onCheckedChange={(v) => update(s.id, { included: v })}
                                />
                                incluir no cronograma
                              </label>
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Switch
                                  checked={cfg.requireFill}
                                  disabled={!cfg.included}
                                  onCheckedChange={(v) => update(s.id, { requireFill: v })}
                                />
                                exigir preenchimento
                              </label>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
