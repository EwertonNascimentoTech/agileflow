import { useEffect, useMemo, useState, type ReactNode } from "react"
import { CalendarRange, GitBranch, Loader2, Save } from "lucide-react"

import { projetosApi, type Project, type ProjectFunnel, type ProjectStatus } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Card, PageHeader, Pill, SectionCard } from "@/components/ds"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/EmptyState"
import { ScheduleImportPanel } from "@/modules/projetos/ScheduleImportPanel"
import { toast } from "@/lib/toast"

type StageCfg = { included: boolean; requireFill: boolean }

export default function BindingsConfigPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState("")
  const [funnels, setFunnels] = useState<ProjectFunnel[]>([])
  const [statuses, setStatuses] = useState<ProjectStatus[]>([])
  const [config, setConfig] = useState<Record<string, StageCfg>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    projetosApi.listProjects(true).then((ps) => {
      setProjects(ps)
      setProjectId((cur) => cur || ps[0]?.id || "")
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!projectId) return
    Promise.all([
      projetosApi.listFunnels(projectId, true),
      projetosApi.listStatuses(projectId, undefined, true),
      projetosApi.listScheduleBindings(),
    ]).then(([fs, sts, bs]) => {
      const cfg: Record<string, StageCfg> = {}
      for (const s of sts) cfg[s.id] = { included: false, requireFill: true }
      for (const b of bs) if (cfg[b.status_id]) cfg[b.status_id] = { included: true, requireFill: b.require_fill }
      setFunnels(fs)
      setStatuses(sts)
      setConfig(cfg)
    })
  }, [projectId])

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
        .map((s) => ({ funnel_id: s.funnel_id, status_id: s.id, require_fill: config[s.id]?.requireFill ?? true, is_active: true }))
      await projetosApi.saveScheduleBindings(payload)
      toast.success("Configuração do cronograma salva.")
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  const header = (actions?: ReactNode) => (
    <PageHeader
      icon={CalendarRange}
      color="#2563EB"
      crumbs={[{ label: "Configurações", to: "/app/modules/projetos/config" }, { label: "Cronograma" }]}
      title="Fluxos e etapas do cronograma"
      description={
        <>
          Marque as etapas em que o cronograma deve ser preenchido. Os cards nessas etapas entram
          no cronograma; "exigir preenchimento" bloqueia a saída da etapa sem início e prazo.
        </>
      }
      actions={actions}
    />
  )

  if (loading) {
    return (
      <div className="w-full space-y-5">
        {header()}
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  const orderedFunnels = [...funnels].sort((a, b) => a.order - b.order)

  return (
    <div className="w-full space-y-5">
      {header(
        <>
          {projects.length > 1 && (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-10 w-48 bg-background"><SelectValue placeholder="Projeto" /></SelectTrigger>
              <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button type="button" className="h-10 gap-1.5" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar
          </Button>
        </>,
      )}

      <Card className="p-5">
        <ScheduleImportPanel
          projectId={projectId}
          statuses={statuses}
          funnels={funnels}
          includedStatusIds={config}
        />
      </Card>

      {orderedFunnels.length === 0 ? (
        <Card>
          <EmptyState
            icon={GitBranch}
            title="Nenhum fluxo configurado"
            description="Crie fluxos e etapas no módulo Projetos (Configurações → Fluxos / Etapas) para então vinculá-los ao cronograma."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {orderedFunnels.map((f) => {
            const sts = statusesByFunnel.get(f.id) ?? []
            const includedCount = sts.filter((s) => config[s.id]?.included).length
            return (
              <SectionCard
                key={f.id}
                title={
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                    {f.name}
                  </span>
                }
                right={sts.length > 0 ? <Pill tone={includedCount > 0 ? "blue" : "slate"}>{includedCount} de {sts.length} no cronograma</Pill> : undefined}
                flush
              >
                {sts.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">Sem etapas neste fluxo.</p>
                ) : (
                  <ul className="divide-y">
                    {sts.map((s) => {
                      const cfg = config[s.id] ?? { included: false, requireFill: true }
                      return (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                            <span className="truncate text-sm font-medium">{s.name}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-5">
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Switch checked={cfg.included} onCheckedChange={(v) => update(s.id, { included: v })} />
                              incluir no cronograma
                            </label>
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Switch checked={cfg.requireFill} disabled={!cfg.included} onCheckedChange={(v) => update(s.id, { requireFill: v })} />
                              exigir preenchimento
                            </label>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </SectionCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
