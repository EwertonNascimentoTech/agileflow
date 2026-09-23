import { useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, CheckCircle2, GitBranch, Loader2, MessageSquareReply, Send, XCircle } from "lucide-react"

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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CommentBody } from "@/modules/projetos/CommentComposer"
import { toast } from "@/lib/toast"
import { formatApiDateTime } from "@/lib/utils"
import { PriorityBadge, StageBadge, apiErrorDetail, fmtDateTime } from "@/modules/portal/occurrenceUi"

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
      <p className="whitespace-pre-wrap text-sm">{value}</p>
    </div>
  )
}

/** Detalhe da Ocorrência no Portal: dados, conversa pública e resposta do cliente. */
export default function ClientOccurrenceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [occ, setOcc] = useState<OccurrenceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState("")
  const [replyFiles, setReplyFiles] = useState<Upload[]>([])
  const [sending, setSending] = useState(false)
  const replyRef = useRef<HTMLTextAreaElement>(null)
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
    if (!occ || !reply.trim()) return
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

  if (loading) return <Skeleton className="h-96 rounded-lg" />
  if (!occ) {
    return (
      <div className="space-y-3">
        <Link to="/portal/ocorrencias" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Ocorrências
        </Link>
        <p className="text-sm text-muted-foreground">Ocorrência não encontrada.</p>
      </div>
    )
  }

  const waitingMe = occ.opened_by_me && occ.stage_key === "aguardando_cliente"

  return (
    <div className="space-y-4">
      <Link to="/portal/ocorrencias" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Ocorrências
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{occ.title}</h1>
          <p className="text-sm text-muted-foreground">
            {occ.project_title} · {OCCURRENCE_TIPO_LABEL[occ.tipo]} · aberta {fmtDateTime(occ.created_at)}
            {occ.opened_by_name && ` por ${occ.opened_by_me ? "você" : occ.opened_by_name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge value={occ.prioridade} />
          <StageBadge stageKey={occ.stage_key} name={occ.stage_name} mine={occ.opened_by_me} />
        </div>
      </div>

      {waitingMe && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>O time precisa de uma informação sua. Responda na conversa para a ocorrência voltar ao atendimento.</span>
            {occ.can_interact && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  replyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
                  replyRef.current?.focus({ preventScroll: true })
                }}
              >
                <MessageSquareReply size={14} /> Responder
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {occ.opened_by_me && occ.stage_key === "homologando" && (
        <div className="space-y-3 rounded-lg border border-violet-400/50 bg-violet-50/60 p-4 dark:bg-violet-950/30">
          <div>
            <h2 className="font-semibold">Homologação</h2>
            <p className="text-sm text-muted-foreground">O time ajustou a ocorrência. Teste e diga se está resolvido.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={homologMode === "approve" ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setHomologMode("approve")}
            >
              <CheckCircle2 size={15} /> Está resolvido
            </Button>
            <Button
              variant={homologMode === "reject" ? "destructive" : "outline"}
              className="gap-1.5"
              onClick={() => setHomologMode("reject")}
            >
              <XCircle size={15} /> Ainda não está certo
            </Button>
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
                    className={`h-9 w-9 rounded-md border text-sm font-medium ${
                      nps === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <Textarea rows={2} placeholder="Comentário (opcional)" value={homologText} onChange={(e) => setHomologText(e.target.value)} />
            </div>
          )}
          {homologMode === "reject" && (
            <Textarea rows={3} placeholder="O que ainda não está funcionando?" value={homologText} onChange={(e) => setHomologText(e.target.value)} />
          )}
          {homologMode && (
            <div className="flex justify-end">
              <Button onClick={() => void homologate()} disabled={homologating}>
                {homologating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar
              </Button>
            </div>
          )}
        </div>
      )}
      {occ.nps_score != null && (
        <p className="text-sm text-muted-foreground">
          Homologada em {fmtDateTime(occ.homologated_at)} · nota {occ.nps_score}/10
        </p>
      )}
      {occ.stage_key === "encaminhada_release" && (
        <Alert>
          <AlertDescription>
            Esta ocorrência foi classificada como melhoria e não será atendida na Operação Assistida. Ela segue para um
            projeto de Release.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="space-y-3 rounded-lg border p-4">
            <Field label="O que aconteceu" value={occ.description} />
            <Field label="Passos para reproduzir" value={occ.passos} />
            <Field label="Resultado esperado" value={occ.esperado} />
            <Field label="Tela / funcionalidade" value={occ.funcionalidade} />
            {occ.solucao && (
              <div className="rounded-md bg-emerald-50 p-3 dark:bg-emerald-950/40">
                <Field label="Solução aplicada" value={occ.solucao} />
              </div>
            )}
            {!!occ.anexos?.length && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Anexos</div>
                <AttachmentField value={occ.anexos} onChange={() => {}} disabled getUrl={portalOccurrencesApi.uploadUrl} />
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Conversa</h2>
            {occ.comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
            ) : (
              <div className="space-y-2">
                {occ.comments.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-md p-3 ${c.from_client ? "ml-8 bg-primary/10" : "mr-8 bg-muted/50"}`}
                  >
                    <CommentBody content={c.content} />
                    {!!c.anexos?.length && (
                      <div className="mt-2">
                        <AttachmentField value={c.anexos} onChange={() => {}} disabled getUrl={portalOccurrencesApi.uploadUrl} />
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{c.author_name ?? "Time"}</span> · {fmtDateTime(c.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {occ.can_interact ? (
              <div className="space-y-2 border-t pt-3">
                <Textarea ref={replyRef} rows={3} placeholder="Escreva sua mensagem" value={reply} onChange={(e) => setReply(e.target.value)} />
                <AttachmentField
                  value={replyFiles}
                  onChange={(files) => setReplyFiles(files)}
                  upload={portalOccurrencesApi.upload}
                  getUrl={portalOccurrencesApi.uploadUrl}
                />
                <div className="flex justify-end">
                  <Button onClick={() => void send()} disabled={sending || !reply.trim()} className="gap-1.5">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={14} />}
                    Enviar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="border-t pt-3 text-xs text-muted-foreground">
                {occ.is_closed ? "Ocorrência encerrada." : "Só quem abriu a ocorrência pode responder."}
              </p>
            )}
          </div>

          {/* Timeline de raias no formato do drawer do card: mais recente primeiro, de → para, quem, quando e origem. */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-primary" />
              <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Andamento</h2>
            </div>
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
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Impacto</span>
              <span>{OCCURRENCE_IMPACTO_LABEL[occ.impacto]}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Quem é afetado</span>
              <span>{OCCURRENCE_ABRANGENCIA_LABEL[occ.abrangencia]}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Responsável</span>
              <span>{occ.assignee_name ?? "A definir"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
