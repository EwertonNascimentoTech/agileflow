import { useEffect, useRef, useState, type ReactNode } from "react"
import { useParams } from "react-router-dom"
import {
  CheckCircle2,
  Clock,
  Flag,
  FolderKanban,
  GitBranch,
  Info,
  LifeBuoy,
  Loader2,
  MessageSquareReply,
  PackageOpen,
  Send,
  ShieldCheck,
  Users,
  XCircle,
  Zap,
} from "lucide-react"

import {
  OCCURRENCE_ABRANGENCIA_LABEL,
  OCCURRENCE_IMPACTO_LABEL,
  OCCURRENCE_TIPO_LABEL,
  portalOccurrencesApi,
  type OccurrenceDetail,
  type OccurrencePrioridade,
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
import { DetailHeader, KpiPerson, KpiRow, KpiText, type KpiTone, type MenuAction } from "@/modules/portal/DetailShell"
import {
  PRIORITY_LABEL,
  StageBadge,
  StageStepper,
  apiErrorDetail,
  fmtDateTime,
  fmtRelative,
  initials,
  occTitle,
  stageHint,
} from "@/modules/portal/occurrenceUi"
import { Card } from "@/modules/portal/portfolioUi"
import { usePortalBase } from "@/modules/portal/portfolioMeta"

/** Origem do movimento na visão do cliente (sem o jargão interno do kanban). */
const PORTAL_SOURCE_LABELS: Record<string, string> = {
  client: "Portal do cliente",
  system: "Automático",
  automation: "Automático",
}

/** Cor do ícone do cabeçalho e do cartão de prioridade. */
const PRIORITY_COLOR: Record<OccurrencePrioridade, string> = { P1: "#DC2626", P2: "#EA580C", P3: "#0284C7", P4: "#64748B" }
const PRIORITY_TONE: Record<OccurrencePrioridade, KpiTone> = { P1: "red", P2: "amber", P3: "primary", P4: "slate" }

/** Cartão com cabeçalho (título + subtítulo), no padrão das telas de portfólio e projetos. */
function Section({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title: string
  subtitle?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{value}</p>
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
    <div className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center ${toneClass}`}>
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

function fmtHours(h: number | null | undefined): string {
  if (h == null) return "—"
  return `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h úteis`
}

/** Detalhe da Ocorrência no Portal: etapas, próximo passo, conversa pública e resposta do cliente. */
export default function ClientOccurrenceDetailPage() {
  const base = usePortalBase()
  const { id } = useParams<{ id: string }>()
  // Resultado guardado com o id: trocar de ocorrência volta ao "carregando" sem setState no efeito.
  const [result, setResult] = useState<{ id: string; occ: OccurrenceDetail | null } | null>(null)
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
    let alive = true
    portalOccurrencesApi
      .get(id)
      .then((occ) => { if (alive) setResult({ id, occ }) })
      .catch(() => { if (alive) setResult({ id, occ: null }) })
    return () => { alive = false }
  }, [id])

  const loading = !result || result.id !== id
  const occ = loading ? null : result.occ
  const setOcc = (next: OccurrenceDetail) => setResult({ id: next.task_id, occ: next })

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

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 w-2/3 rounded-xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    )
  }
  if (!occ) {
    return (
      <Card>
        <EmptyState
          icon={Info}
          title="Ocorrência não encontrada"
          description="Ela pode ter sido removida ou não pertence aos seus projetos."
        />
      </Card>
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
          <Button size="sm" className="gap-1.5" onClick={() => homologRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
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
            <span className="font-medium">Resolvida.</span> Homologada em {fmtDateTime(occ.homologated_at)} · nota {occ.nps_score}/10
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

  const actions: MenuAction[] = [
    { label: "Ver o projeto", icon: FolderKanban, to: `${base}/projetos/${occ.project_task_id}` },
    { label: "Ocorrências do projeto", icon: LifeBuoy, to: `${base}/ocorrencias?projeto=${occ.project_task_id}&situacao=todas` },
  ]

  return (
    <div className="space-y-5">
      <DetailHeader
        crumbs={[{ label: "Portfólio", to: base }, { label: "Ocorrências", to: `${base}/ocorrencias` }, { label: occ.code_label }]}
        icon="LifeBuoy"
        color={PRIORITY_COLOR[occ.prioridade]}
        title={occTitle(occ)}
        badge={<StageBadge stageKey={occ.stage_key} name={occ.stage_name} mine={mine} size="lg" />}
        description={<>{occ.project_title} · {OCCURRENCE_TIPO_LABEL[occ.tipo]}</>}
        meta={
          <>
            <span className="font-mono text-foreground">{occ.code_label}</span> · aberta em {fmtDateTime(occ.created_at)}
            {occ.opened_by_name && <> por <span className="text-foreground">{mine ? "você" : occ.opened_by_name}</span></>}
          </>
        }
        updatedAt={occ.updated_at ?? occ.created_at}
        actions={actions}
      />

      <KpiRow className="sm:grid-cols-2 lg:grid-cols-5">
        <KpiText icon={Flag} tone={PRIORITY_TONE[occ.prioridade]} value={`${occ.prioridade} · ${PRIORITY_LABEL[occ.prioridade]}`} label="Prioridade" />
        <KpiText icon={Zap} value={OCCURRENCE_IMPACTO_LABEL[occ.impacto]} label="Impacto" />
        <KpiText icon={Users} value={OCCURRENCE_ABRANGENCIA_LABEL[occ.abrangencia]} label="Quem é afetado" />
        <KpiPerson name={occ.assignee_name ?? "A definir"} role="Responsável no time" />
        <KpiText
          icon={Clock} tone="slate" label="Tempo de atendimento"
          value={occ.assumed_at ? fmtHours(occ.worked_hours) : "Ainda não assumida"}
        />
      </KpiRow>

      <Section title="Andamento da ocorrência" subtitle="Em que etapa a ocorrência está e o que acontece a seguir.">
        <div className="space-y-5">
          <div className="mx-auto max-w-3xl">
            <StageStepper stageKey={occ.stage_key} />
          </div>
          {nextStep}
        </div>
      </Section>

      {validateMe && (
        <section
          ref={homologRef}
          className="scroll-mt-20 space-y-4 rounded-2xl border border-violet-300 bg-violet-50/60 p-5 shadow-sm dark:border-violet-800 dark:bg-violet-950/30"
        >
          <div>
            <h2 className="text-lg font-semibold">Validação da solução</h2>
            <p className="text-sm text-muted-foreground">Teste no sistema e conte se ficou resolvido.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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
                className={`flex items-start gap-3 rounded-xl border bg-background p-4 text-left transition-colors ${
                  homologMode === mode ? on : "hover:border-primary/40"
                }`}
              >
                <Icon size={20} className={mode === "approve" ? "text-emerald-600" : "text-red-500"} />
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="block text-sm text-muted-foreground">{desc}</span>
                </span>
              </button>
            ))}
          </div>
          {homologMode === "approve" && (
            <div className="space-y-2">
              <p className="text-sm">De 0 a 10, o quanto você recomendaria este atendimento?</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 11 }, (_, n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNps(n)}
                    aria-pressed={nps === n}
                    className={`h-10 w-10 rounded-lg border text-sm font-medium transition-colors ${nps === n ? npsTone(n) : "bg-background hover:bg-muted"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex max-w-[30rem] justify-between text-xs text-muted-foreground">
                <span>Nada provável</span>
                <span>Muito provável</span>
              </div>
              <Textarea rows={2} placeholder="Comentário (opcional)" value={homologText} onChange={(e) => setHomologText(e.target.value)} />
            </div>
          )}
          {homologMode === "reject" && (
            <div className="space-y-1.5">
              <Textarea rows={3} placeholder="O que ainda não está funcionando?" value={homologText} onChange={(e) => setHomologText(e.target.value)} />
              <p className="text-xs text-muted-foreground">A ocorrência volta para o time com a sua explicação.</p>
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

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {occ.solucao && (
            <section className="space-y-1.5 rounded-2xl border border-emerald-300 bg-emerald-50/70 p-5 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 size={18} /> Solução aplicada
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{occ.solucao}</p>
            </section>
          )}

          <Section title="Detalhes da ocorrência" subtitle="O que foi relatado na abertura.">
            <div className="space-y-4">
              <Field label="O que aconteceu" value={occ.description} />
              <Field label="Passos para reproduzir" value={occ.passos} />
              <Field label="Resultado esperado" value={occ.esperado} />
              <Field label="Tela / funcionalidade" value={occ.funcionalidade} />
              {!!occ.anexos?.length && (
                <div>
                  <div className="mb-1 text-sm font-medium text-muted-foreground">Anexos</div>
                  <AttachmentField value={occ.anexos} onChange={() => {}} disabled getUrl={portalOccurrencesApi.uploadUrl} />
                </div>
              )}
            </div>
          </Section>

          <Section
            title="Conversa"
            subtitle={occ.can_interact ? "Mensagens entre você e o time de atendimento." : "Mensagens entre quem abriu e o time de atendimento."}
            right={<span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{occ.comments.length}</span>}
          >
            <div className="space-y-4">
              {occ.comments.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
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
                            c.from_client ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
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
                          <p className={`mb-1 flex flex-wrap items-baseline gap-x-2 text-xs ${c.from_client ? "justify-end" : ""}`}>
                            <span className="font-semibold text-foreground">{name}</span>
                            {!c.from_client && (
                              <span className="rounded-md bg-primary/10 px-1.5 text-[10px] font-medium text-primary">Time</span>
                            )}
                            <span className="text-muted-foreground" title={fmtDateTime(c.created_at)}>{fmtRelative(c.created_at)}</span>
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
                <div className="rounded-xl border bg-background transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
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
                      <span className="hidden text-xs text-muted-foreground sm:inline">Ctrl + Enter envia</span>
                      <Button size="sm" onClick={() => void send()} disabled={sending || !reply.trim()} className="gap-1.5">
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={14} />}
                        Enviar
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="border-t pt-3 text-sm text-muted-foreground">
                  {occ.is_closed ? "Ocorrência encerrada — não recebe novas mensagens." : "Só quem abriu a ocorrência pode responder."}
                </p>
              )}
            </div>
          </Section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          {/* Timeline de raias no formato do drawer do card: mais recente primeiro, de → para, quem, quando e origem. */}
          <Section title="Histórico" subtitle="Mudanças de etapa, da mais recente para a mais antiga.">
            {occ.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum movimento registrado ainda.</p>
            ) : (
              <ol className="relative ms-1.5 border-s border-border/70 ps-4">
                {[...occ.history].reverse().map((h, i) => (
                  <li key={i} className="mb-3 last:mb-0">
                    <span className="absolute -start-[5px] mt-2 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                    <div className="rounded-lg bg-muted/50 px-3 py-2">
                      <p className="text-sm font-medium leading-snug">
                        <span className="text-muted-foreground">{h.from_stage_name ?? "Abertura"}</span>
                        {" → "}
                        <span>{h.stage_name ?? "—"}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
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
          </Section>
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            A prioridade é calculada pelo impacto e por quem é afetado; o PO do projeto pode ajustá-la. O tempo de atendimento conta
            horas úteis a partir de quando alguém do time assumiu e pausa enquanto a ocorrência espera por você.
          </p>
        </aside>
      </div>
    </div>
  )
}
