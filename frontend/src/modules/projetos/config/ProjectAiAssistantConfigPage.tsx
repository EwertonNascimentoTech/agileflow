import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  AlertTriangle, BrainCircuit, CheckCircle2, Database, Flame, Loader2, MessageSquareText, RefreshCw,
  RotateCcw, Save, Search, Server, SlidersHorizontal, XCircle,
} from "lucide-react"

import {
  projetosApi,
  type AiAssistantLogItem,
  type AiAssistantStatus,
  type AiSearchTestHit,
  type AiSyncRun,
} from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { EmptyState } from "@/components/EmptyState"
import {
  Card, DetailTabs, FilterSelect, KpiRow, Notice, PageHeader, Pill, ProgressBar, SectionCard, TABLE, type TabDef, type Tone,
} from "@/components/ds"
import { toast } from "@/lib/toast"

const PAGE_SIZE = 30
const ALL = "__all__"
const RUNNING = ["na_fila", "rodando"]

const TRIGGER_LABELS: Record<string, string> = { agendado: "Agendada", manual: "Manual", reindexar: "Reindexar tudo" }
const RUN_STATUS: Record<string, { label: string; tone: Tone }> = {
  na_fila: { label: "Na fila", tone: "blue" },
  rodando: { label: "Rodando", tone: "blue" },
  ok: { label: "Concluída", tone: "emerald" },
  erro: { label: "Erro", tone: "red" },
  ignorada: { label: "Ignorada", tone: "amber" },
}
const LOG_STATUS: Record<string, { label: string; tone: Tone }> = {
  ok: { label: "Respondida", tone: "emerald" },
  erro: { label: "Erro", tone: "red" },
  indisponivel: { label: "Indisponível", tone: "red" },
  limite: { label: "Limite por minuto", tone: "amber" },
}
const SEARCH_MODE: Record<string, string> = {
  busca: "Com trechos",
  sem_trechos: "Nenhum trecho acima da nota",
  desligada: "Busca desligada",
  indisponivel: "Busca fora do ar",
  sem_indice: "Sem índice",
}

function errMsg(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const detail = e?.response?.data?.detail
  return typeof detail === "string" ? detail : fallback
}

function when(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("pt-BR") : "—"
}

function num(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString("pt-BR")
}

function duration(ms: number | null | undefined): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  return s < 60 ? `${s.toFixed(1).replace(".", ",")} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`
}

function score(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(2).replace(".", ",")
}

type AiTab = "base" | "ajustes" | "teste" | "runs" | "logs"

const TABS: TabDef<AiTab>[] = [
  { value: "base", label: "Base", icon: Database },
  { value: "ajustes", label: "Ajustes", icon: SlidersHorizontal },
  { value: "teste", label: "Testar busca", icon: Search },
  { value: "runs", label: "Sincronizações", icon: RotateCcw },
  { value: "logs", label: "Perguntas", icon: MessageSquareText },
]

/** Cor do quadrado do ícone conforme a situação (mesmos tons dos cartões de indicador do Portal). */
const STAT_TONE = {
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  fail: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  neutral: "bg-primary/10 text-primary",
} as const

/** Cartão de indicador no padrão do KpiText do Portal, com uma linha de detalhe (texto ou progresso). */
function StatTile({
  icon: Icon, title, ok, value, detail,
}: { icon: typeof Server; title: string; ok: boolean | null; value: string; detail?: ReactNode }) {
  const tone = ok === true ? STAT_TONE.ok : ok === false ? STAT_TONE.fail : STAT_TONE.neutral
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 font-semibold leading-tight">{value}</p>
          {ok === true && <CheckCircle2 size={15} className="ml-auto shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Ok" />}
          {ok === false && <XCircle size={15} className="ml-auto shrink-0 text-red-600 dark:text-red-400" aria-label="Com problema" />}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{title}</p>
        {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
      </div>
    </div>
  )
}

function RunProgress({ run }: { run: AiSyncRun }) {
  const pct = run.progress_total ? Math.round((100 * run.progress_done) / run.progress_total) : 0
  return (
    <div className="space-y-1">
      <ProgressBar value={run.status === "na_fila" ? 0 : pct} showLabel={false} />
      <p className="text-xs text-muted-foreground">
        {run.status === "na_fila"
          ? "Na fila do Celery…"
          : run.progress_total
            ? `${num(run.progress_done)} de ${num(run.progress_total)} trechos calculados (${pct}%)`
            : "Montando a base e comparando com o índice…"}
      </p>
    </div>
  )
}

export default function ProjectAiAssistantConfigPage() {
  const [tab, setTab] = useState<AiTab>("base")
  const [status, setStatus] = useState<AiAssistantStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<"" | "sync" | "reindex" | "warmup" | "save">("")
  const [confirmReindex, setConfirmReindex] = useState(false)
  const [liveRun, setLiveRun] = useState<AiSyncRun | null>(null)

  // Ajustes (formulário)
  const [ragEnabled, setRagEnabled] = useState(true)
  const [autoSync, setAutoSync] = useState(true)
  const [topK, setTopK] = useState("8")
  const [minScore, setMinScore] = useState("0.45")

  // Testar busca
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<AiSearchTestHit[] | null>(null)

  // Sincronizações
  const [runs, setRuns] = useState<AiSyncRun[]>([])
  const [runsTotal, setRunsTotal] = useState(0)
  const [runsOffset, setRunsOffset] = useState(0)

  // Perguntas
  const [logs, setLogs] = useState<AiAssistantLogItem[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsOffset, setLogsOffset] = useState(0)
  const [logStatus, setLogStatus] = useState(ALL)

  const loadStatus = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    try {
      const s = await projetosApi.getAiAssistantStatus()
      setStatus(s)
      setLiveRun(s.current_run)
      setRagEnabled(s.settings.rag_enabled)
      setAutoSync(s.settings.auto_sync)
      setTopK(String(s.settings.top_k))
      setMinScore(String(s.settings.min_score))
    } catch (err) {
      toast.error(errMsg(err, "Não foi possível carregar a situação do assistente."))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadRuns = useCallback(async (off: number) => {
    const page = await projetosApi.listAiSyncRuns({ limit: PAGE_SIZE, offset: off })
    setRuns(page.items)
    setRunsTotal(page.total)
    setRunsOffset(page.offset)
  }, [])

  const loadLogs = useCallback(async (off: number) => {
    const page = await projetosApi.listAiAssistantLogs({
      limit: PAGE_SIZE, offset: off, status: logStatus !== ALL ? logStatus : undefined,
    })
    setLogs(page.items)
    setLogsTotal(page.total)
    setLogsOffset(page.offset)
  }, [logStatus])

  useEffect(() => { void loadStatus() }, [loadStatus])
  useEffect(() => { void loadRuns(0).catch(() => undefined) }, [loadRuns])
  useEffect(() => { void loadLogs(0).catch(() => undefined) }, [loadLogs])

  // Acompanha a execução em andamento (consulta leve; a situação completa recarrega no fim).
  const pollRef = useRef<number | null>(null)
  useEffect(() => {
    if (!liveRun || !RUNNING.includes(liveRun.status)) return
    pollRef.current = window.setInterval(async () => {
      try {
        const page = await projetosApi.listAiSyncRuns({ limit: 5 })
        const current = page.items.find((r) => r.id === liveRun.id)
        if (!current) return
        setLiveRun(current)
        if (!RUNNING.includes(current.status)) {
          if (current.status === "ok") toast.success("Sincronização concluída.")
          else if (current.status === "erro") toast.error(current.error_message || "A sincronização falhou.")
          else toast.warning(current.error_message || "A sincronização não rodou.")
          void loadStatus(true)
          void loadRuns(0)
        }
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    }, 3000)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [liveRun, loadStatus, loadRuns])

  const running = !!liveRun && RUNNING.includes(liveRun.status)
  const ready = !!status?.index_ready

  const startSync = async (force: boolean) => {
    setBusy(force ? "reindex" : "sync")
    try {
      const run = await projetosApi.syncAiAssistant(force)
      setLiveRun(run)
      toast.info(force ? "Reindexação na fila." : "Sincronização na fila.")
      void loadRuns(0)
    } catch (err) {
      toast.error(errMsg(err, "Não foi possível iniciar a sincronização."))
    } finally {
      setBusy("")
      setConfirmReindex(false)
    }
  }

  const warmup = async () => {
    setBusy("warmup")
    try {
      const h = await projetosApi.warmupAiAssistant()
      if (h.ok && h.loaded) toast.success(`Modelo ${h.model ?? ""} carregado.`)
      else toast.error(h.error || "O serviço de embeddings não respondeu.")
      void loadStatus(true)
    } catch (err) {
      toast.error(errMsg(err, "O serviço de embeddings não respondeu."))
    } finally {
      setBusy("")
    }
  }

  const saveSettings = async (patch: Parameters<typeof projetosApi.updateAiAssistantSettings>[0], okMsg = "Ajustes salvos.") => {
    setBusy("save")
    try {
      const saved = await projetosApi.updateAiAssistantSettings(patch)
      setStatus((s) => (s ? { ...s, settings: saved } : s))
      toast.success(okMsg)
      return true
    } catch (err) {
      toast.error(errMsg(err, "Não foi possível salvar os ajustes."))
      return false
    } finally {
      setBusy("")
    }
  }

  const saveForm = async () => {
    const k = Number(topK)
    const m = Number(minScore.replace(",", "."))
    if (!Number.isInteger(k) || k < 1 || k > 20) return toast.error("Trechos por pergunta: de 1 a 20.")
    if (Number.isNaN(m) || m < 0 || m > 0.95) return toast.error("Nota mínima: de 0 a 0,95.")
    await saveSettings({ rag_enabled: ragEnabled, auto_sync: autoSync, top_k: k, min_score: m })
  }

  const toggleSource = async (key: string, on: boolean) => {
    if (!status) return
    const current = status.sources.filter((s) => s.enabled).map((s) => s.key)
    const next = on ? [...new Set([...current, key])] : current.filter((k) => k !== key)
    const ok = await saveSettings(
      { sources: next },
      on ? "Origem ligada: entra na próxima sincronização." : "Origem desligada: sai do índice na próxima sincronização.",
    )
    if (ok) void loadStatus(true)
  }

  const runSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      setHits(await projetosApi.searchAiAssistant(query.trim(), 12))
    } catch (err) {
      toast.error(errMsg(err, "A busca falhou."))
    } finally {
      setSearching(false)
    }
  }

  const pendingTotal = useMemo(() => {
    if (!status?.pending) return null
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)
    return sum(status.pending.changed) + sum(status.pending.removed)
  }, [status])

  const modelMismatch = !!status && status.index_models.some((m) => m !== status.expected_model)

  const header = (actions?: ReactNode) => (
    <PageHeader
      icon={BrainCircuit}
      color="#2563EB"
      crumbs={[{ label: "Configurações", to: "/app/modules/projetos/config" }, { label: "Assistente IA do Portal" }]}
      title="Assistente IA do Portal"
      description={
        <>
          Base de busca por significado (pgvector) usada pelo chat do Portal do Cliente. Só entra o que o Portal já
          mostra ao cliente, e cada pergunta busca apenas nos projetos que quem pergunta pode ver.
        </>
      }
      actions={actions}
    />
  )

  if (loading) {
    return (
      <div className="w-full space-y-5">
        {header()}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  if (!status) {
    return (
      <div className="w-full space-y-5">
        {header()}
        <Card>
          <EmptyState
            icon={BrainCircuit}
            title="Não foi possível carregar"
            description="Tente de novo em instantes."
          />
        </Card>
      </div>
    )
  }

  const u = status.usage_7d
  const lastRun = liveRun ?? status.last_run

  return (
    <div className="w-full space-y-5">
      {header(
        <>
          <Button type="button" variant="outline" className="h-10 gap-1.5" disabled={refreshing} onClick={() => void loadStatus(true)}>
            {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Atualizar
          </Button>
          <Button type="button" variant="outline" className="h-10 gap-1.5" disabled={!status.vector_enabled || busy !== ""} onClick={() => void warmup()}>
            {busy === "warmup" ? <Loader2 size={16} className="animate-spin" /> : <Flame size={16} />}
            Aquecer modelo
          </Button>
          <Button type="button" variant="outline" className="h-10 gap-1.5" disabled={!ready || running || busy !== ""} onClick={() => setConfirmReindex(true)}>
            <RotateCcw size={16} />
            Reindexar tudo
          </Button>
          <Button type="button" className="h-10 gap-1.5" disabled={!ready || running || busy !== ""} onClick={() => void startSync(false)}>
            {busy === "sync" || running ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Sincronizar agora
          </Button>
        </>,
      )}

      {!status.vector_enabled && (
        <Notice tone="amber" icon={AlertTriangle}>
          <span className="flex-1">
            A busca por significado está desligada neste ambiente (<code>VECTOR_ENABLED=false</code>). O assistente
            responde só com os dados estruturados. Para ligar, veja <code>docs/técnico/10-pgvector-embeddings.md</code>.
          </span>
        </Notice>
      )}
      {status.vector_enabled && !status.index_ready && (
        <Notice tone="red" icon={AlertTriangle}>
          <span className="flex-1">
            O índice ainda não existe neste tenant (a extensão <code>vector</code> precisa estar instalada e a API
            reiniciada).
          </span>
        </Notice>
      )}
      {!status.assistant_ready && (
        <Notice tone="amber" icon={AlertTriangle}>
          <span className="flex-1">
            O agente do Azure AI Foundry não está configurado: o chat do Portal responde "indisponível" mesmo com a
            base pronta.
          </span>
        </Notice>
      )}
      {modelMismatch && (
        <Notice tone="blue" icon={AlertTriangle}>
          <span className="flex-1">
            Há trechos gravados com outro modelo ({status.index_models.join(", ")}). A sincronização recalcula esses
            trechos para {status.expected_model}.
          </span>
        </Notice>
      )}

      <KpiRow className="sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          icon={Server}
          title="Serviço de embeddings"
          ok={status.service.ok && status.service.loaded ? true : status.service.ok ? null : false}
          value={status.service.ok ? (status.service.loaded ? "No ar, modelo carregado" : "No ar, modelo não carregado") : "Fora do ar"}
          detail={status.service.ok ? (status.service.model ?? status.expected_model) : (status.service.error ?? "—")}
        />
        <StatTile
          icon={Database}
          title="Banco (pgvector)"
          ok={status.index_ready}
          value={status.extension_version ? `vector ${status.extension_version}` : "Extensão não instalada"}
          detail={status.index_ready ? "Índice pronto neste tenant" : "Índice ausente"}
        />
        <StatTile
          icon={BrainCircuit}
          title="Base indexada"
          ok={null}
          value={`${num(status.totals.docs)} registros · ${num(status.totals.chunks)} trechos`}
          detail={`Última gravação: ${when(status.totals.last_at)}`}
        />
        <StatTile
          icon={RefreshCw}
          title="Pendências"
          ok={pendingTotal == null ? null : pendingTotal === 0}
          value={
            status.pending_error ? "Erro ao calcular"
              : pendingTotal == null ? "—"
                : pendingTotal === 0 ? "Em dia com o Portal"
                  : `${num(pendingTotal)} registro${pendingTotal !== 1 ? "s" : ""} a atualizar`
          }
          detail={
            status.pending_error
              ? status.pending_error
              : status.settings.auto_sync
                ? `Automática a cada 10 min · última verificação ${when(status.settings.last_check_at)}${status.settings.last_check_status === "erro" ? " (erro)" : ""}`
                : "Sincronização automática desligada"
          }
        />
        <StatTile
          icon={RotateCcw}
          title="Última sincronização"
          ok={lastRun ? (lastRun.status === "ok" ? true : lastRun.status === "erro" ? false : null) : null}
          value={lastRun ? `${RUN_STATUS[lastRun.status]?.label ?? lastRun.status} · ${TRIGGER_LABELS[lastRun.trigger] ?? lastRun.trigger}` : "Nenhuma ainda"}
          detail={
            lastRun && RUNNING.includes(lastRun.status)
              ? <RunProgress run={lastRun} />
              : lastRun
                ? `${when(lastRun.finished_at ?? lastRun.created_at)} · ${num(lastRun.docs_changed)} alterados, ${num(lastRun.docs_removed)} removidos · ${duration(lastRun.duration_ms)}`
                : undefined
          }
        />
        <StatTile
          icon={MessageSquareText}
          title="Perguntas (7 dias)"
          ok={null}
          value={`${num(u.questions)} pergunta${u.questions !== 1 ? "s" : ""} · ${num(u.users)} pessoa${u.users !== 1 ? "s" : ""}`}
          detail={
            u.questions
              ? `${Math.round((100 * u.with_hits) / u.questions)}% com trechos · nota média ${score(u.avg_top_score)} · ${duration(u.avg_total_ms)} em média · ${num(u.errors)} com erro`
              : "Nenhuma pergunta no período"
          }
        />
      </KpiRow>

      <DetailTabs tabs={TABS} value={tab} onChange={setTab} />

      {/* ── Base por origem ── */}
      {tab === "base" && (
        <SectionCard title="Base por origem" icon={Database} flush>
          <div className={TABLE.wrap}>
            <table className={`${TABLE.table} min-w-[720px]`}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Origem</th>
                  <th className={TABLE.th}>Usar</th>
                  <th className={`${TABLE.th} text-right`}>Registros</th>
                  <th className={`${TABLE.th} text-right`}>Trechos</th>
                  <th className={`${TABLE.th} text-right`}>Pendentes</th>
                  <th className={TABLE.th}>Última gravação</th>
                </tr>
              </thead>
              <tbody>
                {status.sources.map((s) => (
                  <tr key={s.key} className={TABLE.tr}>
                    <td className={`${TABLE.tdFirst} font-medium`}>{s.label}</td>
                    <td className={TABLE.td}>
                      <Switch
                        checked={s.enabled}
                        disabled={busy !== ""}
                        onCheckedChange={(v) => void toggleSource(s.key, v)}
                        aria-label={`Usar ${s.label}`}
                      />
                    </td>
                    <td className={`${TABLE.td} text-right tabular-nums`}>{num(s.docs)}</td>
                    <td className={`${TABLE.td} text-right tabular-nums`}>{num(s.chunks)}</td>
                    <td className={`${TABLE.td} text-right tabular-nums`}>
                      {s.pending ? <Pill tone="amber" className="tabular-nums">{num(s.pending)}</Pill> : "—"}
                    </td>
                    <td className={`${TABLE.td} whitespace-nowrap tabular-nums text-muted-foreground`}>{when(s.last_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t bg-muted/40 px-5 py-3 text-xs text-muted-foreground">
            Descrição de card de Projeto, Feature ou História e comentários internos nunca entram: o Portal não os mostra
            ao cliente. Situação, datas e % de evolução vão para a IA sempre com o valor atual, não o do índice.
          </p>
        </SectionCard>
      )}

      {/* ── Ajustes ── */}
      {tab === "ajustes" && (
        <SectionCard title="Ajustes" icon={SlidersHorizontal}>
          <div className="max-w-2xl space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label>Usar a busca por significado no assistente</Label>
                <p className="text-xs text-muted-foreground">
                  Desligado, o chat responde só com os dados estruturados do Portal (como antes).
                </p>
              </div>
              <Switch checked={ragEnabled} onCheckedChange={setRagEnabled} />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label>Sincronização automática (a cada 10 min)</Label>
                <p className="text-xs text-muted-foreground">
                  Grava só o que mudou no Portal. Sem mudança, não aparece em Sincronizações.
                </p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ai-topk">Trechos por pergunta</Label>
                <Input id="ai-topk" type="number" min={1} max={20} value={topK} onChange={(e) => setTopK(e.target.value)} className="h-10" />
                <p className="text-xs text-muted-foreground">De 1 a 20. Mais trechos, contexto maior (cota do Azure).</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-min">Nota mínima do trecho</Label>
                <Input id="ai-min" type="number" min={0} max={0.95} step={0.05} value={minScore} onChange={(e) => setMinScore(e.target.value)} className="h-10" />
                <p className="text-xs text-muted-foreground">
                  De 0 a 0,95. Medido na base atual: trecho relacionado ficou entre 0,47 e 0,62; sem relação,
                  abaixo de 0,42. Use "Testar busca" para recalibrar.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" className="h-10 gap-1.5" disabled={busy !== ""} onClick={() => void saveForm()}>
                {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Salvar ajustes
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Testar busca ── */}
      {tab === "teste" && (
        <div className="space-y-3">
          <SectionCard title="Testar busca" icon={Search}>
            <div className="space-y-2">
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => { e.preventDefault(); void runSearch() }}
              >
                <Input
                  placeholder="Pergunte como um cliente perguntaria (ex.: quando fica pronta a segunda via do boleto?)"
                  value={query}
                  maxLength={500}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-10"
                />
                <Button type="submit" className="h-10 gap-1.5" disabled={!ready || searching || !query.trim()}>
                  {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  Buscar
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">
                Busca na base inteira, sem o recorte de cliente, para calibrar a nota mínima. A pergunta daqui não vai à IA
                nem é gravada.
              </p>
            </div>
          </SectionCard>
          {hits && hits.length === 0 && (
            <Card>
              <EmptyState icon={Search} title="Nenhum trecho" description="A base está vazia ou nada parecido foi encontrado." compact />
            </Card>
          )}
          {hits && hits.length > 0 && (
            <div className="space-y-2">
              {hits.map((h) => (
                <Card key={`${h.source_type}-${h.source_id}-${h.chunk_index}`} className={`space-y-1.5 p-4 ${h.above_min ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Pill tone={h.above_min ? "emerald" : "slate"} className="tabular-nums">
                      {score(h.score)}
                    </Pill>
                    <span className="font-semibold">{h.source_label}</span>
                    {h.scope_title && <span className="text-muted-foreground">· {h.scope_title}</span>}
                    {!h.above_min && <span className="text-muted-foreground">· abaixo da nota mínima (não iria à IA)</span>}
                  </div>
                  <p className="line-clamp-5 whitespace-pre-wrap text-sm text-muted-foreground">{h.content}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sincronizações ── */}
      {tab === "runs" && (
        <div className="space-y-3">
          {runs.length === 0 ? (
            <Card>
              <EmptyState
                icon={RotateCcw}
                title="Nenhuma sincronização registrada"
                description="A automática só entra aqui quando grava alguma mudança; as manuais entram sempre."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className={TABLE.wrap}>
                <table className={`${TABLE.table} min-w-[980px]`}>
                  <thead className={TABLE.thead}>
                    <tr>
                      <th className={TABLE.thFirst}>Início</th>
                      <th className={TABLE.th}>Tipo</th>
                      <th className={TABLE.th}>Situação</th>
                      <th className={`${TABLE.th} text-right`}>Na base</th>
                      <th className={`${TABLE.th} text-right`}>Alterados</th>
                      <th className={`${TABLE.th} text-right`}>Removidos</th>
                      <th className={`${TABLE.th} text-right`}>Trechos calculados</th>
                      <th className={TABLE.th}>Duração</th>
                      <th className={TABLE.th}>Detalhe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} className={TABLE.tr}>
                        <td className={`${TABLE.tdFirst} whitespace-nowrap tabular-nums text-muted-foreground`}>{when(r.started_at ?? r.created_at)}</td>
                        <td className={TABLE.td}>{TRIGGER_LABELS[r.trigger] ?? r.trigger}</td>
                        <td className={TABLE.td}>
                          <Pill tone={RUN_STATUS[r.status]?.tone ?? "slate"} dot>
                            {RUN_STATUS[r.status]?.label ?? r.status}
                          </Pill>
                        </td>
                        <td className={`${TABLE.td} text-right tabular-nums`}>{num(r.docs_total)}</td>
                        <td className={`${TABLE.td} text-right tabular-nums`}>{num(r.docs_changed)}</td>
                        <td className={`${TABLE.td} text-right tabular-nums`}>{num(r.docs_removed)}</td>
                        <td className={`${TABLE.td} text-right tabular-nums`}>{num(r.chunks_embedded)}</td>
                        <td className={`${TABLE.td} whitespace-nowrap tabular-nums`}>{duration(r.duration_ms)}</td>
                        <td className={`${TABLE.td} max-w-xs text-xs text-muted-foreground`}>
                          {r.error_message
                            ? <span className="text-destructive">{r.error_message}</span>
                            : r.by_type?.alterados && Object.keys(r.by_type.alterados).length
                              ? Object.entries(r.by_type.alterados)
                                .map(([k, n]) => `${status.sources.find((s) => s.key === k)?.label.split(" (")[0] ?? k}: ${n}`)
                                .join(" · ")
                              : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {runsTotal > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{num(runsTotal)} execuções</span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={runsOffset === 0} onClick={() => void loadRuns(runsOffset - PAGE_SIZE)}>
                  Anterior
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={runsOffset + PAGE_SIZE >= runsTotal} onClick={() => void loadRuns(runsOffset + PAGE_SIZE)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Perguntas (só métricas) ── */}
      {tab === "logs" && (
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <FilterSelect
                label="Resultado"
                value={logStatus}
                onChange={setLogStatus}
                options={[{ value: ALL, label: "Todos" }, ...Object.entries(LOG_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]}
              />
              <p className="pb-2.5 text-xs text-muted-foreground sm:ml-auto">
                Só métricas: a pergunta e a resposta não são gravadas. Registros com mais de 90 dias são apagados.
              </p>
            </div>
          </Card>
          {logs.length === 0 ? (
            <Card>
              <EmptyState icon={MessageSquareText} title="Nenhuma pergunta registrada" description="As perguntas feitas no chat do Portal aparecem aqui." />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className={TABLE.wrap}>
                <table className={`${TABLE.table} min-w-[1000px]`}>
                  <thead className={TABLE.thead}>
                    <tr>
                      <th className={TABLE.thFirst}>Data</th>
                      <th className={TABLE.th}>Quem</th>
                      <th className={TABLE.th}>Resultado</th>
                      <th className={TABLE.th}>Busca</th>
                      <th className={`${TABLE.th} text-right`}>Trechos</th>
                      <th className={`${TABLE.th} text-right`}>Melhor nota</th>
                      <th className={`${TABLE.th} text-right`}>Projetos no recorte</th>
                      <th className={`${TABLE.th} text-right`}>Contexto</th>
                      <th className={TABLE.th}>Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id} className={TABLE.tr}>
                        <td className={`${TABLE.tdFirst} whitespace-nowrap tabular-nums text-muted-foreground`}>{when(l.created_at)}</td>
                        <td className={TABLE.td}>
                          <div className="max-w-[180px] truncate font-medium" title={l.user_name ?? undefined}>{l.user_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{l.viewer === "cliente" ? "Cliente" : "Equipe (Modo Cliente)"}</div>
                        </td>
                        <td className={TABLE.td}>
                          <Pill tone={LOG_STATUS[l.status]?.tone ?? "slate"} dot>
                            {LOG_STATUS[l.status]?.label ?? l.status}
                          </Pill>
                        </td>
                        <td className={`${TABLE.td} text-xs`}>{SEARCH_MODE[l.search_mode] ?? l.search_mode}</td>
                        <td className={`${TABLE.td} text-right tabular-nums`}>{num(l.hits)}</td>
                        <td className={`${TABLE.td} text-right tabular-nums`}>{score(l.top_score)}</td>
                        <td className={`${TABLE.td} text-right tabular-nums`}>{num(l.projects_in_scope)}</td>
                        <td className={`${TABLE.td} text-right tabular-nums text-xs`}>{num(l.context_chars)} car.</td>
                        <td className={`${TABLE.td} whitespace-nowrap text-xs`}>
                          {duration(l.total_ms)}
                          {l.search_ms != null && <span className="text-muted-foreground"> (busca {duration(l.search_ms)})</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {logsTotal > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{num(logsTotal)} perguntas</span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={logsOffset === 0} onClick={() => void loadLogs(logsOffset - PAGE_SIZE)}>
                  Anterior
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={logsOffset + PAGE_SIZE >= logsTotal} onClick={() => void loadLogs(logsOffset + PAGE_SIZE)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={confirmReindex} onOpenChange={setConfirmReindex}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reindexar tudo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Recalcula o vetor de todos os trechos, mesmo os que não mudaram. Use depois de trocar o modelo ou se a busca
            parecer errada. O assistente continua respondendo durante a carga (com os vetores antigos até cada trecho ser
            regravado).
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmReindex(false)}>Cancelar</Button>
            <Button type="button" disabled={busy !== ""} onClick={() => void startSync(true)}>
              {busy === "reindex" && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Reindexar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
