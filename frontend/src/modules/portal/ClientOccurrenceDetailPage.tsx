import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import {
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  Info,
  Loader2,
  MessageSquareReply,
  PackageOpen,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react"

import {
  OCCURRENCE_ABRANGENCIA_LABEL,
  OCCURRENCE_IMPACTO_LABEL,
  OCCURRENCE_TIPO_LABEL,
  portalOccurrencesApi,
  type OccurrenceDetail,
  type Upload,
} from "@/api/clientes"
import { AttachmentField } from "@/components/AttachmentField"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { CommentBody } from "@/modules/projetos/CommentComposer"
import { toast } from "@/lib/toast"
import { formatApiDateTime } from "@/lib/utils"
import {
  PriorityBadge,
  StageBadge,
  StageStepper,
  apiErrorDetail,
  fmtDateTime,
  fmtRelative,
  initials,
  occTitle,
  stageHint,
} from "@/modules/portal/occurrenceUi"

/** Origem do movimento na visão do cliente (sem o jargão interno do kanban). */
const PORTAL_SOURCE_LABELS: Record<string, string> = {
  client: "Portal do cliente",
  system: "Automático",
  automation: "Automático",
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">{value}</p>
    </div>
  )
}

function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-3 rounded-xl border bg-card p-5 shadow-sm ${className}`}>
      {title && (
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-primary" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">{title}</h2>
        </div>
      )}
      {children}
    </section>
  )
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  )
}

/** Faixa de "próximo passo" abaixo das etapas. */
function NextStep({
  tone,
  icon,
  children,
  action,
}: {
  tone: "amber" | "violet" | "emerald" | "slate"
  icon: ReactNode
  children: ReactNode
  action?: ReactNode
}) {
  const toneClass = {
    amber: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
    violet: "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100",
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
    slate: "border-border bg-muted/50 text-foreground",
  }[tone]
  return (
    <div className={`flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center ${toneClass}`}>
      <div className="flex min-w-0 flex-1 items-start gap-2.5 text-sm">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function npsTone(n: number): string {
  if (n <= 6) return "border-red-400 bg-red-500 text-white"
  if (n <= 8) return "border-amber-400 bg-amber-500 text-white"
  return "border-emerald-500 bg-emerald-600 text-white"
}

/** Detalhe da Ocorrência no Portal: etapas, próximo passo, conversa pública e resposta do cliente. */
export default function ClientOccurrenceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [occ, setOcc] = useState<OccurrenceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState("")
  const [replyFiles, setReplyFiles] = useState<Upload[]>([])
  const [sending, setSending] = useState(false)
  const replyRef = useRef<HTMLTextAreaElement>(null)
  const homologRef = useRef<HTMLElement>(null)
  // Homologação
  const [homologMode, setHomologMode] = useState<"approve" | "reject" | null>(null)
  const [nps, setNps] = useState<number | null>(null)
  const [homologText, setHomologText] = useState("")
  const [homologating, setHomologating] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    portalOccurrencesApi
      .get(id)
      .then(setOcc)
      .catch(() => setOcc(null))
      .finally(() => setLoading(false))
  }, [id])

  async function send() {
    if (!occ || !reply.trim() || sending) return
    setSending(true)
    try {
      const updated = await portalOccurrencesApi.comment(occ.task_id, {
        content: reply.trim(),
        anexos: replyFiles.length ? replyFiles : null,
      })
      const wasWaiting = occ.stage_key === "aguardando_cliente"
      setOcc(updated)
      setReply("")
      setReplyFiles([])
      toast.success(wasWaiting ? "Resposta enviada — a ocorrência voltou para o time." : "Mensagem enviada.")
    } catch (err) {
      toast.error(apiErrorDetail(err, "Não foi possível enviar a mensagem."))
    } finally {
      setSending(false)
    }
  }

  async function homologate() {
    if (!occ || !homologMode) return
    if (homologMode === "approve" && nps === null) return toast.error("Escolha uma nota de 0 a 10.")
    if (homologMode === "reject" && homologText.trim().length < 5) return toast.error("Conte o que ainda não está certo.")
    setHomologating(true)
    try {
      const updated = await portalOccurrencesApi.homologate(occ.task_id, {
        approve: homologMode === "approve",
        nps_score: homologMode === "approve" ? nps : null,
        comment: homologText.trim() || null,
      })
      setOcc(updated)
      setHomologMode(null)
      setHomologText("")
      setNps(null)
      toast.success(homologMode === "approve" ? "Obrigado! Ocorrência finalizada." : "Enviado de volta para ajuste.")
    } catch (err) {
      toast.error(apiErrorDetail(err, "Não foi possível registrar a homologação."))
    } finally {
      setHomologating(false)
    }
  }

  function focusReply() {
    replyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    replyRef.current?.focus({ preventScroll: true })
  }

  const back = (
    <Link to="/portal/ocorrencias" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft size={14} /> Ocorrências
    </Link>
  )

  if (loading) {
    return (
      <div className="space-y-5">
        {back}
        <Skeleton className="h-52 rounded-xl" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    )
  }
  if (!occ) {
    return (
      <div className="space-y-5">
        {back}
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={Info}
            title="Ocorrência não encontrada"
            description="Ela pode ter sido removida ou não pertence aos seus projetos."
          />
        </div>
      </div>
    )
  }

  const mine = occ.opened_by_me
  const waitingMe = mine && occ.stage_key === "aguardando_cliente"
  const validateMe = mine && occ.stage_key === "homologando"

  let nextStep: ReactNode
  if (waitingMe) {
    nextStep = (
      <NextStep
        tone="amber"
        icon={<MessageSquareReply size={16} />}
        action={
          occ.can_interact && (
            <Button size="sm" className="gap-1.5" onClick={focusReply}>
              <MessageSquareReply size={14} /> Responder
            </Button>
          )
        }
      >
        <p className="font-medium">O time precisa de uma informação sua.</p>
        <p className="text-xs opacity-80">Responda na conversa para a ocorrência voltar ao atendimento.</p>
      </NextStep>
    )
  } else if (validateMe) {
    nextStep = (
      <NextStep
        tone="violet"
        icon={<ShieldCheck size={16} />}
        action={
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => homologRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <ShieldCheck size={14} /> Validar agora
          </Button>
        }
      >
        <p className="font-medium">O time concluiu o ajuste.</p>
        <p className="text-xs opacity-80">Teste no sistema e diga se está resolvido.</p>
      </NextStep>
    )
  } else if (occ.stage_key === "encaminhada_release") {
    nextStep = (
      <NextStep tone="slate" icon={<PackageOpen size={16} />}>
        <p>
          Esta ocorrência foi classificada como melhoria e não será atendida na Operação Assistida. Ela segue para um
          projeto de Release{occ.release_project_title ? <> (<strong>{occ.release_project_title}</strong>)</> : null}.
        </p>
      </NextStep>
    )
  } else if (occ.is_closed) {
    nextStep = (
      <NextStep tone="emerald" icon={<CheckCircle2 size={16} />}>
        {occ.nps_score != null ? (
          <p>
            <span className="font-medium">Resolvida.</span> Homologada em {fmtDateTime(occ.homologated_at)} · nota{" "}
            {occ.nps_score}/10
          </p>
        ) : (
          <p>
            <span className="font-medium">Encerrada</span>
            {occ.finalized_by_team ? " pelo time." : "."}
          </p>
        )}
      </NextStep>
    )
  } else {
    nextStep = (
      <NextStep tone="slate" icon={<Info size={16} />}>
        <p>{stageHint(occ.stage_key, mine)}</p>
      </NextStep>
    )
  }

  return (
    <div className="space-y-5">
      {back}

      {/* Cabeçalho: identificação, etapas e próximo passo */}
      <section className="space-y-5 rounded-xl border bg-card p-5 shadow-sm md:p-6">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-medium">{occ.code_label}</span>
            <PriorityBadge value={occ.prioridade} />
            <StageBadge stageKey={occ.stage_key} name={occ.stage_name} mine={mine} />
          </div>
          <h1 className="text-xl font-bold leading-snug md:text-2xl">{occTitle(occ)}</h1>
          <p className="text-sm text-muted-foreground">
            {occ.project_title} · {OCCURRENCE_TIPO_LABEL[occ.tipo]} · aberta {fmtDateTime(occ.created_at)}
            {occ.opened_by_name && ` por ${mine ? "você" : occ.opened_by_name}`}
          </p>
        </div>
        <div className="mx-auto max-w-2xl">
          <StageStepper stageKey={occ.stage_key} />
        </div>
        {nextStep}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {validateMe && (
            <section
              ref={homologRef}
              className="scroll-mt-20 space-y-4 rounded-xl border border-violet-300 bg-violet-50/60 p-5 shadow-sm dark:border-violet-800 dark:bg-violet-950/30"
            >
              <div>
                <h2 className="font-semibold">Validação da solução</h2>
                <p className="text-sm text-muted-foreground">Teste no sistema e conte se ficou resolvido.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { mode: "approve", label: "Está resolvido", desc: "Funcionou como esperado.", icon: CheckCircle2, on: "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-950/40" },
                    { mode: "reject", label: "Ainda não está certo", desc: "Volta para o time ajustar.", icon: XCircle, on: "border-red-400 bg-red-50 ring-1 ring-red-400 dark:bg-red-950/40" },
                  ] as const
                ).map(({ mode, label, desc, icon: Icon, on }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setHomologMode(mode)}
                    aria-pressed={homologMode === mode}
                    className={`flex items-start gap-3 rounded-lg border bg-background p-3 text-left transition-colors ${
                      homologMode === mode ? on : "hover:border-primary/40"
                    }`}
                  >
                    <Icon size={18} className={mode === "approve" ? "text-emerald-600" : "text-red-500"} />
                    <span>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-muted-foreground">{desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              {homologMode === "approve" && (
                <div className="space-y-2">
                  <p className="text-sm">De 0 a 10, o quanto você recomendaria este atendimento?</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: 11 }, (_, n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setNps(n)}
                        aria-pressed={nps === n}
                        className={`h-9 w-9 rounded-md border text-sm font-medium transition-colors ${
                          nps === n ? npsTone(n) : "bg-background hover:bg-muted"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex max-w-[27rem] justify-between text-[11px] text-muted-foreground">
                    <span>Nada provável</span>
                    <span>Muito provável</span>
                  </div>
                  <Textarea rows={2} placeholder="Comentário (opcional)" value={homologText} onChange={(e) => setHomologText(e.target.value)} />
                </div>
              )}
              {homologMode === "reject" && (
                <div className="space-y-1.5">
                  <Textarea rows={3} placeholder="O que ainda não está funcionando?" value={homologText} onChange={(e) => setHomologText(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">A ocorrência volta para o time com a sua explicação.</p>
                </div>
              )}
              {homologMode && (
                <div className="flex justify-end">
                  <Button onClick={() => void homologate()} disabled={homologating}>
                    {homologating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirmar
                  </Button>
                </div>
              )}
            </section>
          )}

          {occ.solucao && (
            <section className="space-y-1 rounded-xl border border-emerald-300 bg-emerald-50/70 p-5 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 size={13} /> Solução aplicada
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{occ.solucao}</p>
            </section>
          )}

          <Card title="Detalhes">
            <div className="space-y-4">
              <Field label="O que aconteceu" value={occ.description} />
              <Field label="Passos para reproduzir" value={occ.passos} />
              <Field label="Resultado esperado" value={occ.esperado} />
              <Field label="Tela / funcionalidade" value={occ.funcionalidade} />
              {!!occ.anexos?.length && (
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Anexos</div>
                  <AttachmentField value={occ.anexos} onChange={() => {}} disabled getUrl={portalOccurrencesApi.uploadUrl} />
                </div>
              )}
            </div>
          </Card>

          <Card title="Conversa">
            {occ.comments.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhuma mensagem ainda. {occ.can_interact ? "Se quiser, acrescente algo para o time." : ""}
              </p>
            ) : (
              <div className="space-y-3">
                {occ.comments.map((c) => {
                  const own = c.from_client && mine
                  const name = own ? "Você" : c.author_name ?? "Time"
                  return (
                    <div key={c.id} className={`flex gap-2.5 ${c.from_client ? "flex-row-reverse" : ""}`}>
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          c.from_client ? "bg-primary text-primary-foreground" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                        }`}
                        aria-hidden
                      >
                        {initials(c.author_name)}
                      </span>
                      <div
                        className={`min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                          c.from_client ? "rounded-tr-sm bg-primary/10" : "rounded-tl-sm bg-muted"
                        }`}
                      >
                        <p className={`mb-1 flex flex-wrap items-baseline gap-x-2 text-[11px] ${c.from_client ? "justify-end" : ""}`}>
                          <span className="font-semibold text-foreground">{name}</span>
                          {!c.from_client && (
                            <span className="rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">Time</span>
                          )}
                          <span className="text-muted-foreground" title={fmtDateTime(c.created_at)}>
                            {fmtRelative(c.created_at)}
                          </span>
                        </p>
                        <CommentBody content={c.content} />
                        {!!c.anexos?.length && (
                          <div className="mt-2">
                            <AttachmentField value={c.anexos} onChange={() => {}} disabled getUrl={portalOccurrencesApi.uploadUrl} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {occ.can_interact ? (
              <div className="rounded-lg border bg-background transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
                <Textarea
                  ref={replyRef}
                  rows={3}
                  placeholder="Escreva sua mensagem"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  className="min-h-[84px] resize-y border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <div className="flex flex-wrap items-start justify-between gap-2 border-t px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <AttachmentField
                      compact
                      value={replyFiles}
                      onChange={(files) => setReplyFiles(files)}
                      upload={portalOccurrencesApi.upload}
                      getUrl={portalOccurrencesApi.uploadUrl}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="hidden text-[11px] text-muted-foreground sm:inline">Ctrl + Enter envia</span>
                    <Button size="sm" onClick={() => void send()} disabled={sending || !reply.trim()} className="gap-1.5">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={14} />}
                      Enviar
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="border-t pt-3 text-xs text-muted-foreground">
                {occ.is_closed ? "Ocorrência encerrada — não recebe novas mensagens." : "Só quem abriu a ocorrência pode responder."}
              </p>
            )}
          </Card>

          {/* Timeline de raias no formato do drawer do card: mais recente primeiro, de → para, quem, quando e origem. */}
          <Card title="Andamento">
            {occ.history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum movimento registrado ainda.</p>
            ) : (
              <ol className="relative ms-1.5 border-s border-border/70 ps-4">
                {[...occ.history].reverse().map((h, i) => (
                  <li key={i} className="mb-3 last:mb-0">
                    <span className="absolute -start-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                    <div className="rounded bg-muted/40 px-2.5 py-2">
                      <p className="text-sm font-medium leading-snug">
                        <span className="text-muted-foreground">{h.from_stage_name ?? "Abertura"}</span>
                        {" → "}
                        <span>{h.stage_name ?? "—"}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                        <GitBranch className="inline h-3 w-3 shrink-0" />
                        <span className="font-medium text-foreground">{h.moved_by_name ?? "Sistema"}</span>
                        <span>·</span>
                        <span>{formatApiDateTime(h.moved_at)}</span>
                        <span>·</span>
                        <span>{PORTAL_SOURCE_LABELS[h.source ?? ""] ?? "Time de atendimento"}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Card title="Resumo">
            <dl className="divide-y">
              <SummaryRow label="Projeto">{occ.project_title ?? "—"}</SummaryRow>
              <SummaryRow label="Tipo">{OCCURRENCE_TIPO_LABEL[occ.tipo]}</SummaryRow>
              <SummaryRow label="Prioridade">
                <PriorityBadge value={occ.prioridade} />
              </SummaryRow>
              <SummaryRow label="Impacto">{OCCURRENCE_IMPACTO_LABEL[occ.impacto]}</SummaryRow>
              <SummaryRow label="Quem é afetado">{OCCURRENCE_ABRANGENCIA_LABEL[occ.abrangencia]}</SummaryRow>
              <SummaryRow label="Responsável">
                {occ.assignee_name ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                      {initials(occ.assignee_name)}
                    </span>
                    {occ.assignee_name}
                  </span>
                ) : (
                  <span className="font-normal text-muted-foreground">A definir</span>
                )}
              </SummaryRow>
              <SummaryRow label="Aberta em">{fmtDateTime(occ.created_at)}</SummaryRow>
              <SummaryRow label="Atualizada">
                <span title={fmtDateTime(occ.updated_at ?? occ.created_at)}>{fmtRelative(occ.updated_at ?? occ.created_at)}</span>
              </SummaryRow>
            </dl>
          </Card>
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            A prioridade é calculada pelo impacto e por quem é afetado; o PO do projeto pode ajustá-la.
          </p>
        </aside>
      </div>
    </div>
  )
}
