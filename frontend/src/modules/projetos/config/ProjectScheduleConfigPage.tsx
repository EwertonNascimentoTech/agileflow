import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Download, FileSpreadsheet, GitBranch, Loader2, Save, Upload } from "lucide-react"

import { projetosApi, type Project, type ProjectFunnel, type ProjectStatus, type ProjectTask, type TaskImportResult } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState } from "@/components/EmptyState"
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
        <div className="flex items-center gap-2">
          {projects.length > 1 && (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Projeto" /></SelectTrigger>
              <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
            Salvar
          </Button>
        </div>
      </div>

      <ImportCard projectId={projectId} statuses={statuses} funnels={funnels} config={config} />

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
                          <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="text-sm truncate">{s.name}</span>
                            </div>
                            <div className="flex items-center gap-5">
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Switch checked={cfg.included} onCheckedChange={(v) => update(s.id, { included: v })} />
                                incluir no cronograma
                              </label>
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Switch checked={cfg.requireFill} disabled={!cfg.included} onCheckedChange={(v) => update(s.id, { requireFill: v })} />
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

function ImportCard({ projectId, statuses, funnels, config }: {
  projectId: string
  statuses: ProjectStatus[]
  funnels: ProjectFunnel[]
  config: Record<string, StageCfg>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [featureStatusId, setFeatureStatusId] = useState("")
  const [usStatusId, setUsStatusId] = useState("")
  const [parentTaskId, setParentTaskId] = useState("__top__")
  const [nodes, setNodes] = useState<ProjectTask[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<TaskImportResult | null>(null)

  const funnelName = useMemo(() => new Map(funnels.map((f) => [f.id, f.name])), [funnels])
  const ordered = useMemo(() => [...statuses].sort((a, b) => a.order - b.order), [statuses])

  useEffect(() => {
    if (!projectId) { setNodes([]); return }
    projetosApi.listPlanningNodes(projectId).then(setNodes).catch(() => setNodes([]))
  }, [projectId])

  // Defaults: tenta casar a etapa pelo nome do funil (Features → funil "Feature",
  // US → funil "US / User Story"); senão, 1ª etapa incluída / inicial / primeira.
  useEffect(() => {
    const fname = (s: ProjectStatus) => (funnelName.get(s.funnel_id) ?? "").toLowerCase()
    const included = ordered.find((s) => config[s.id]?.included)
    const initial = ordered.find((s) => s.is_initial)
    const fallback = (included ?? initial ?? ordered[0])?.id ?? ""

    if (!featureStatusId || !ordered.some((s) => s.id === featureStatusId)) {
      const match = ordered.find((s) => fname(s).includes("feature"))
      setFeatureStatusId(match?.id ?? fallback)
    }
    if (!usStatusId || !ordered.some((s) => s.id === usStatusId)) {
      const match = ordered.find((s) => /\bus\b|user story|user-story|hist[oó]ria/.test(fname(s)))
      setUsStatusId(match?.id ?? fallback)
    }
  }, [ordered, config, funnelName, featureStatusId, usStatusId])

  async function runImport() {
    if (!projectId || !file || !featureStatusId || !usStatusId) return
    setImporting(true)
    setResult(null)
    try {
      const res = await projetosApi.importTasks(projectId, file, featureStatusId, usStatusId, parentTaskId === "__top__" ? undefined : parentTaskId)
      setResult(res)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ""
      toast.success(`Importação concluída: ${res.features_created} Features e ${res.us_created} US criadas.`)
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Falha na importação.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={16} className="text-primary" />
          <h2 className="font-semibold text-sm">Importar Features/US (planilha)</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Migre projetos de outro lugar: a planilha tem as colunas <strong>Tipo, Título, Descrição, Responsável (e-mail), Início, Fim, Horas</strong>.
          Cada <strong>US</strong> pertence à <strong>Feature</strong> da linha acima. Baixe o modelo para começar.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Projeto/Programa de destino</label>
            <Select value={parentTaskId} onValueChange={setParentTaskId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Onde criar as Features" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__top__">— Topo do projeto (sem pai) —</SelectItem>
                {nodes.map((n) => (
                  <SelectItem key={n.id} value={n.id}>{n.planning_kind === "programa" ? "▸ " : "› "}{n.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Etapa das Features</label>
            <Select value={featureStatusId} onValueChange={setFeatureStatusId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
              <SelectContent>
                {ordered.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{funnelName.get(s.funnel_id) ? `${funnelName.get(s.funnel_id)} › ` : ""}{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Etapa das US</label>
            <Select value={usStatusId} onValueChange={setUsStatusId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
              <SelectContent>
                {ordered.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{funnelName.get(s.funnel_id) ? `${funnelName.get(s.funnel_id)} › ` : ""}{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" className="gap-1.5" onClick={() => void projetosApi.downloadImportTemplate(projectId)} disabled={!projectId}>
            <Download size={14} /> Baixar modelo (.xlsx)
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button type="button" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <FileSpreadsheet size={14} /> {file ? file.name : "Escolher arquivo"}
          </Button>
          <Button type="button" className="gap-1.5" onClick={() => void runImport()} disabled={!file || !featureStatusId || !usStatusId || importing}>
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importar
          </Button>
        </div>

        {result && (
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">{result.features_created} Feature(s) e {result.us_created} US criadas{result.skipped > 0 ? ` · ${result.skipped} puladas` : ""}.</p>
            {result.warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600"><AlertTriangle size={12} /> Avisos ({result.warnings.length})</p>
                <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-muted-foreground">
                  {result.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
