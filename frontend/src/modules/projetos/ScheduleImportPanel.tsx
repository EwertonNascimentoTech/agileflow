import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react"

import {
  projetosApi,
  type ProjectFunnel,
  type ProjectStatus,
  type ProjectTask,
  type TaskImportResult,
} from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"

/** Raias em que o modal do card libera a importacao de cronograma (Features/US). */
const SCHEDULE_IMPORT_STATUS_HINTS = [
  "requisitos",
  "prototipo",
  "refinamento",
  "validacao",
  "validar escopo",
  "pronto para desenvolvimento",
]

function normalizeStatusName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/** True se a etapa atual do card deve exibir a importacao de cronograma no modal. */
export function canImportScheduleInStatus(statusName: string | null | undefined): boolean {
  if (!statusName) return false
  const n = normalizeStatusName(statusName)
  return SCHEDULE_IMPORT_STATUS_HINTS.some((hint) => n.includes(normalizeStatusName(hint)))
}

type Props = {
  projectId: string
  statuses: ProjectStatus[]
  funnels: ProjectFunnel[]
  /** Quando informado, as Features/US sao criadas sob este card (projeto/programa). */
  fixedParentTaskId?: string
  /** Esconde o seletor de destino (util no modal do card). */
  hideParentSelect?: boolean
  /** Compacta o visual para caber no drawer. */
  compact?: boolean
  /** Chamado apos importacao bem-sucedida (ex.: recarregar filhos). */
  onImported?: (result: TaskImportResult) => void
  /** Etapas marcadas como incluidas no cronograma (pagina de config). */
  includedStatusIds?: Set<string> | Record<string, { included?: boolean }>
}

export function ScheduleImportPanel({
  projectId,
  statuses,
  funnels,
  fixedParentTaskId,
  hideParentSelect = false,
  compact = false,
  onImported,
  includedStatusIds,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [featureStatusId, setFeatureStatusId] = useState("")
  const [usStatusId, setUsStatusId] = useState("")
  const [parentTaskId, setParentTaskId] = useState(fixedParentTaskId ?? "__top__")
  const [nodes, setNodes] = useState<ProjectTask[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<TaskImportResult | null>(null)

  const funnelName = useMemo(() => new Map(funnels.map((f) => [f.id, f.name])), [funnels])
  const ordered = useMemo(() => [...statuses].sort((a, b) => a.order - b.order), [statuses])

  useEffect(() => {
    if (fixedParentTaskId) setParentTaskId(fixedParentTaskId)
  }, [fixedParentTaskId])

  useEffect(() => {
    if (!projectId || hideParentSelect || fixedParentTaskId) {
      setNodes([])
      return
    }
    projetosApi.listPlanningNodes(projectId).then(setNodes).catch(() => setNodes([]))
  }, [projectId, hideParentSelect, fixedParentTaskId])

  useEffect(() => {
    const fname = (s: ProjectStatus) => (funnelName.get(s.funnel_id) ?? "").toLowerCase()
    const isIncluded = (id: string) => {
      if (!includedStatusIds) return false
      if (includedStatusIds instanceof Set) return includedStatusIds.has(id)
      return !!includedStatusIds[id]?.included
    }
    const included = ordered.find((s) => isIncluded(s.id))
    const initial = ordered.find((s) => s.is_initial)
    const fallback = (included ?? initial ?? ordered[0])?.id ?? ""

    if (!featureStatusId || !ordered.some((s) => s.id === featureStatusId)) {
      const match = ordered.find((s) => fname(s).includes("feature"))
      setFeatureStatusId(match?.id ?? fallback)
    }
    if (!usStatusId || !ordered.some((s) => s.id === usStatusId)) {
      const match = ordered.find((s) => /\bus\b|user story|user-story|historia/.test(fname(s)))
      setUsStatusId(match?.id ?? fallback)
    }
  }, [ordered, includedStatusIds, funnelName, featureStatusId, usStatusId])

  async function runImport() {
    if (!projectId || !file || !featureStatusId || !usStatusId) return
    setImporting(true)
    setResult(null)
    try {
      const parent = parentTaskId === "__top__" ? undefined : parentTaskId
      const res = await projetosApi.importTasks(projectId, file, featureStatusId, usStatusId, parent)
      setResult(res)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ""
      toast.success(`Importacao concluida: ${res.features_created} Features e ${res.us_created} US criadas.`)
      onImported?.(res)
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } } }
      toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Falha na importacao.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileSpreadsheet size={16} className="text-primary" />
        <h2 className="font-semibold text-sm">Importar cronograma (Features/US)</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        A planilha tem as colunas <strong>Tipo, Titulo, Descricao, Responsavel (e-mail), Inicio, Fim, Horas</strong>.
        Cada <strong>US</strong> pertence a <strong>Feature</strong> da linha acima. Baixe o modelo para comecar.
      </p>
      <div className={`flex flex-wrap items-end gap-3 ${compact ? "gap-2" : ""}`}>
        {!hideParentSelect && !fixedParentTaskId && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Projeto/Programa de destino</label>
            <Select value={parentTaskId} onValueChange={setParentTaskId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Onde criar as Features" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__top__">- Topo do projeto (sem pai) -</SelectItem>
                {nodes.map((n) => (
                  <SelectItem key={n.id} value={n.id}>{n.planning_kind === "programa" ? "> " : "- "}{n.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Etapa das Features</label>
          <Select value={featureStatusId} onValueChange={setFeatureStatusId}>
            <SelectTrigger className={compact ? "w-56" : "w-64"}><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
            <SelectContent>
              {ordered.map((s) => (
                <SelectItem key={s.id} value={s.id}>{funnelName.get(s.funnel_id) ? `${funnelName.get(s.funnel_id)} > ` : ""}{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Etapa das US</label>
          <Select value={usStatusId} onValueChange={setUsStatusId}>
            <SelectTrigger className={compact ? "w-56" : "w-64"}><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
            <SelectContent>
              {ordered.map((s) => (
                <SelectItem key={s.id} value={s.id}>{funnelName.get(s.funnel_id) ? `${funnelName.get(s.funnel_id)} > ` : ""}{s.name}</SelectItem>
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
          <p className="font-medium">{result.features_created} Feature(s) e {result.us_created} US criadas{result.skipped > 0 ? ` / ${result.skipped} puladas` : ""}.</p>
          {result.warnings.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600"><AlertTriangle size={12} /> Avisos ({result.warnings.length})</p>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-muted-foreground">
                {result.warnings.map((w, i) => <li key={i}>- {w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
