import { useEffect, useRef, useState, type ReactNode } from "react"
import { useParams } from "react-router-dom"
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Hourglass,
  Info,
  ListChecks,
  Loader2,
  Plus,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
  XCircle,
} from "lucide-react"

import { aiSolutionsPortalApi, type AiSolutionDetail, type AiSolutionFormField } from "@/api/clientes"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"
import { CommentBody } from "@/modules/projetos/CommentComposer"
import { DetailHeader, KpiPerson, KpiRow, KpiText, type MenuAction } from "@/modules/portal/DetailShell"
import { apiErrorDetail, fmtDateTime, fmtRelative, initials } from "@/modules/portal/occurrenceUi"
import { AiFieldEditor, AiSolutionStepper, AiStageBadge } from "@/modules/portal/aiSolutionUi"
import { CLIENT_ACTION_HINT, aiStageHint, aiStep, aiTitle, missingAiFields } from "@/modules/portal/aiSolutionRules"
import { Card } from "@/modules/portal/portfolioUi"
import { usePortalBase } from "@/modules/portal/portfolioMeta"

const VIOLET = "#7C3AED"

/** Cartão com cabeçalho (título + subtítulo), no padrão das telas do Portal. */
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

/** Faixa de "próximo passo" abaixo da linha dos passos. */
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

function ExtLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href} target="_blank" rel="noreferrer"
      className="flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <span className="min-w-0">
        <span className="block">{label}</span>
        <span className="block truncate text-xs font-normal text-muted-foreground">{href}</span>
      </span>
      <ExternalLink size={15} className="shrink-0 text-primary" />
    </a>
  )
}

/** Detalhe da Solução com IA no Portal, no padrão das telas de projeto e ocorrência. */
export default function ClientAiSolutionDetailPage() {
  const base = usePortalBase()
  const { id } = useParams<{ id: string }>()
  // Resultado guardado com o id: trocar de solução volta ao "carregando" sem setState no efeito.
  const [result, setResult] = useState<{ id: string; sol: AiSolutionDetail | null; error: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  // ajustar
  const [formFields, setFormFields] = useState<AiSolutionFormField[]>([])
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [triedEdit, setTriedEdit] = useState(false)
  // versão / homologação / cancelamento / mensagem
  const [versaoUrl, setVersaoUrl] = useState("")
  const [repoUrl, setRepoUrl] = useState("")
  const [note, setNote] = useState("")
  const [homologMode, setHomologMode] = useState<"approve" | "reject" | null>(null)
  const [canceling, setCanceling] = useState(false)
  const [message, setMessage] = useState("")
  const actionRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLDivElement>(null)

  /** Nova versão da solução: no "ajustar", o formulário já vem com o que foi enviado. */
  function apply(next: AiSolutionDetail, previous: AiSolutionDetail | null) {
    setResult({ id: next.task_id, sol: next, error: null })
    if (next.client_action === "ajustar" && (previous?.client_action !== "ajustar" || previous?.task_id !== next.task_id)) {
      setEdit(Object.fromEntries(Object.entries(next.values).map(([k, v]) => [k, v ?? ""])))
      setTriedEdit(false)
      aiSolutionsPortalApi.form().then((r) => setFormFields(r.fields)).catch(() => setFormFields([]))
    }
  }

  useEffect(() => {
    if (!id) return
    let alive = true
    aiSolutionsPortalApi
      .get(id)
      .then((r) => { if (alive) apply(r, null) })
      .catch((err) => {
        if (alive) setResult({ id, sol: null, error: apiErrorDetail(err, "Não foi possível carregar a solicitação.") })
      })
    return () => { alive = false }
  }, [id])

  const loading = !result || result.id !== id
  const sol = loading ? null : result.sol

  async function run(action: () => Promise<AiSolutionDetail>, ok: string) {
    setBusy(true)
    try {
      const next = await action()
      apply(next, sol)
      setNote("")
      setHomologMode(null)
      setCanceling(false)
      toast.success(ok)
    } catch (err) {
      toast.error(apiErrorDetail(err, "Não foi possível concluir a ação."))
    } finally {
      setBusy(false)
    }
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
  if (!sol || !id) {
    return (
      <Card>
        <EmptyState icon={Sparkles} title="Solicitação indisponível" description={result?.error ?? "Não encontrada."} />
      </Card>
    )
  }

  const action = sol.client_action
  const noteValid = note.trim().length >= 10
  const step = aiStep(sol.stage_key)
  const withClient = !!action
  const plataforma = sol.values.plataforma === "Outra" ? sol.values.plataforma_outra || "Outra" : sol.values.plataforma
  const goAction = () => actionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })

  let nextStep: ReactNode
  if (action === "ajustar") {
    nextStep = (
      <NextStep tone="amber" icon={<Wand2 size={16} />} action={<Button size="sm" onClick={goAction}>Ajustar pedido</Button>}>
        <p className="font-medium">A TI pediu ajustes no pedido.</p>
        <p className="text-xs opacity-80">Veja o motivo nas mensagens, corrija e reenvie para a análise.</p>
      </NextStep>
    )
  } else if (action === "versao") {
    nextStep = (
      <NextStep tone="amber" icon={<Rocket size={16} />} action={<Button size="sm" onClick={goAction}>Enviar minha versão</Button>}>
        <p className="font-medium">Aprovada! Agora é com você.</p>
        <p className="text-xs opacity-80">Construa na ferramenta autorizada e avise quando tiver uma versão funcional.</p>
      </NextStep>
    )
  } else if (action === "homologar") {
    nextStep = (
      <NextStep tone="violet" icon={<ShieldCheck size={16} />} action={<Button size="sm" onClick={goAction}>Validar agora</Button>}>
        <p className="font-medium">A TI adequou a solução.</p>
        <p className="text-xs opacity-80">Teste no ambiente de homologação e aprove ou reprove.</p>
      </NextStep>
    )
  } else if (sol.stage_key === "producao") {
    nextStep = (
      <NextStep
        tone="emerald" icon={<CheckCircle2 size={16} />}
        action={sol.producao_url ? (
          <Button asChild size="sm" className="gap-1.5">
            <a href={sol.producao_url} target="_blank" rel="noreferrer">Abrir a aplicação <ExternalLink size={13} /></a>
          </Button>
        ) : undefined}
      >
        <p className="font-medium">Em produção.</p>
        <p className="text-xs opacity-80">A TI publica e sustenta a solução.</p>
      </NextStep>
    )
  } else if (sol.stage_key === "nao_aprovado" || sol.stage_key === "cancelado") {
    nextStep = (
      <NextStep tone="slate" icon={<XCircle size={16} />}>
        <p className="font-medium">{sol.stage_key === "nao_aprovado" ? "Não aprovada." : "Cancelada."}</p>
        <p className="text-xs opacity-80">O motivo está nas mensagens.</p>
      </NextStep>
    )
  } else {
    nextStep = (
      <NextStep tone="slate" icon={<Info size={16} />}>
        <p>{aiStageHint(sol.stage_key) || "Com a TI. Avisamos quando precisar de você."}</p>
      </NextStep>
    )
  }

  const menu: MenuAction[] = [
    ...(sol.producao_url ? [{ label: "Abrir a aplicação", icon: ExternalLink, onClick: () => window.open(sol.producao_url as string, "_blank", "noopener") }] : []),
    { label: "Nova solicitação", icon: Plus, to: `${base}/solucoes-ia/nova` },
    { label: "Todas as soluções", icon: Sparkles, to: `${base}/solucoes-ia?situacao=todas` },
    ...(sol.can_cancel ? [{
      label: "Cancelar solicitação", icon: XCircle,
      onClick: () => { setNote(""); setCanceling(true); setTimeout(() => cancelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50) },
    }] : []),
  ]
  const links = [
    sol.versao_url && { href: sol.versao_url, label: "Sua versão funcional" },
    sol.repositorio_url && { href: sol.repositorio_url, label: "Seu repositório Git" },
    sol.homolog_url && { href: sol.homolog_url, label: "Ambiente de homologação" },
    sol.producao_url && { href: sol.producao_url, label: "Aplicação em produção" },
  ].filter(Boolean) as { href: string; label: string }[]
  const editErrors = Object.fromEntries(
    formFields.map((f) => [f.key, (f.required || (f.key === "plataforma_outra" && edit.plataforma === "Outra")) && !(edit[f.key] ?? "").trim()]),
  ) as Record<string, boolean>

  return (
    <div className="space-y-5">
      <DetailHeader
        crumbs={[{ label: "Portfólio", to: base }, { label: "Soluções com IA", to: `${base}/solucoes-ia` }, { label: sol.code_label }]}
        icon="Sparkles"
        color={VIOLET}
        title={aiTitle(sol)}
        badge={<AiStageBadge stageKey={sol.stage_key} name={sol.stage_name} isClosed={sol.is_closed} size="lg" />}
        description="Solução com IA construída por você e adequada, publicada e sustentada pela TI."
        meta={
          <>
            <span className="font-mono text-foreground">{sol.code_label}</span>
            {sol.created_at && <> · pedida em {fmtDateTime(sol.created_at)}</>}
          </>
        }
        updatedAt={sol.updated_at ?? sol.created_at}
        actions={menu}
      />

      <KpiRow className="sm:grid-cols-2 lg:grid-cols-5">
        <KpiText
          icon={ListChecks} tone="violet" label={step ? `Passo ${step.n} de ${step.total}` : "Situação"}
          value={step ? step.label : sol.stage_name ?? "—"}
        />
        <KpiText
          icon={withClient ? Hourglass : sol.is_closed ? CheckCircle2 : Users}
          tone={withClient ? "amber" : sol.stage_key === "producao" ? "emerald" : sol.is_closed ? "slate" : "primary"}
          value={withClient ? "Com você" : sol.stage_key === "producao" ? "Em produção" : sol.is_closed ? "Encerrada" : "Com a TI"}
          label="Com quem está"
        />
        <KpiText icon={Wand2} value={plataforma || "—"} label="Ferramenta de IA" />
        <KpiPerson name={sol.po_name ?? "A definir"} role="PO de acompanhamento" />
        <KpiText icon={CalendarDays} tone="slate" value={fmtRelative(sol.updated_at)} label="Última movimentação" />
      </KpiRow>

      <Section title="Andamento da solução" subtitle="Onde o pedido está e o que acontece a seguir.">
        <div className="space-y-5">
          {sol.stage_key !== "nao_aprovado" && sol.stage_key !== "cancelado" && (
            <div className="overflow-x-auto">
              <div className="mx-auto min-w-[640px] max-w-4xl">
                <AiSolutionStepper stageKey={sol.stage_key} />
              </div>
            </div>
          )}
          {nextStep}
        </div>
      </Section>

      {action && (
        <section
          ref={actionRef}
          className={`scroll-mt-20 space-y-4 rounded-2xl border p-5 shadow-sm ${
            action === "homologar"
              ? "border-violet-300 bg-violet-50/60 dark:border-violet-800 dark:bg-violet-950/30"
              : "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30"
          }`}
        >
          <div>
            <h2 className="text-lg font-semibold">
              {action === "ajustar" ? "Ajustar o pedido" : action === "versao" ? "Enviar a sua versão" : "Validação da solução"}
            </h2>
            <p className="text-sm text-muted-foreground">{CLIENT_ACTION_HINT[action]}</p>
          </div>

          {action === "ajustar" && (
            <div className="space-y-5 rounded-xl border bg-card p-5">
              {formFields.length === 0 ? (
                <Skeleton className="h-40 rounded-xl" />
              ) : (
                formFields
                  .filter((f) => f.key !== "plataforma_outra" || edit.plataforma === "Outra")
                  .map((f) => (
                    <AiFieldEditor
                      key={f.key}
                      field={f}
                      value={edit[f.key] ?? ""}
                      onChange={(v) => setEdit((c) => ({ ...c, [f.key]: v }))}
                      required={f.required || f.key === "plataforma_outra"}
                      invalid={triedEdit && !!editErrors[f.key]}
                    />
                  ))
              )}
              <div className="space-y-1.5">
                <Label htmlFor="ai-note">Mensagem para a TI</Label>
                <Textarea id="ai-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que você mudou (opcional)" />
              </div>
              <div className="flex justify-end">
                <Button
                  className="gap-1.5"
                  disabled={busy || formFields.length === 0}
                  onClick={() => {
                    setTriedEdit(true)
                    const faltam = missingAiFields(formFields, edit)
                    if (faltam.length) {
                      const first = formFields.find((f) => editErrors[f.key])
                      if (first) document.getElementById(`ai-field-${first.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
                      const msg = `Preencha: ${faltam.join(", ")}`
                      toast.error(/[.?!]$/.test(msg) ? msg : `${msg}.`)
                      return
                    }
                    void run(() => aiSolutionsPortalApi.resubmit(id, {
                      values: Object.fromEntries(formFields.map((f) => [f.key, (edit[f.key] ?? "").trim() || null])),
                      note: note.trim() || null,
                    }), "Reenviada para análise.")
                  }}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={15} />} Reenviar para análise
                </Button>
              </div>
            </div>
          )}

          {action === "versao" && (
            <div className="space-y-4 rounded-xl border bg-card p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ai-versao">Link da versão funcional <span className="text-destructive">*</span></Label>
                  <Input id="ai-versao" className="h-10" value={versaoUrl} onChange={(e) => setVersaoUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-repo">Repositório Git com o código-fonte <span className="text-destructive">*</span></Label>
                  <Input id="ai-repo" className="h-10" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://..." />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-note-versao">Algo que a TI deve saber antes da apresentação?</Label>
                <Textarea id="ai-note-versao" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
              </div>
              <div className="flex justify-end">
                <Button
                  className="gap-1.5"
                  disabled={busy || !versaoUrl.trim() || !repoUrl.trim()}
                  onClick={() => void run(() => aiSolutionsPortalApi.ready(id, {
                    versao_url: versaoUrl.trim(), repositorio_url: repoUrl.trim(), note: note.trim() || null,
                  }), "Pedido de apresentação enviado.")}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket size={15} />} Tenho uma versão funcional
                </Button>
              </div>
            </div>
          )}

          {action === "homologar" && (
            <div className="space-y-4">
              {sol.homolog_url && (
                <Button asChild variant="outline" className="gap-1.5 bg-background">
                  <a href={sol.homolog_url} target="_blank" rel="noreferrer">Abrir o ambiente de homologação <ExternalLink size={14} /></a>
                </Button>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    { mode: "approve", label: "Está funcionando", desc: "Aprovar e seguir para Segurança e produção.", icon: CheckCircle2, on: "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-950/40" },
                    { mode: "reject", label: "Ainda não está certo", desc: "Volta para a TI ajustar.", icon: XCircle, on: "border-red-400 bg-red-50 ring-1 ring-red-400 dark:bg-red-950/40" },
                  ] as const
                ).map(({ mode, label, desc, icon: Icon, on }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { setHomologMode(mode); setNote("") }}
                    aria-pressed={homologMode === mode}
                    className={`flex items-start gap-3 rounded-xl border bg-background p-4 text-left transition-colors ${homologMode === mode ? on : "hover:border-primary/40"}`}
                  >
                    <Icon size={20} className={mode === "approve" ? "text-emerald-600" : "text-red-500"} />
                    <span>
                      <span className="block font-medium">{label}</span>
                      <span className="block text-sm text-muted-foreground">{desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              {homologMode === "reject" && (
                <div className="space-y-1.5">
                  <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que não funcionou? (mín. 10 caracteres)" />
                  <p className="text-xs text-muted-foreground">A TI recebe a sua explicação e ajusta.</p>
                </div>
              )}
              {homologMode && (
                <div className="flex justify-end">
                  <Button
                    variant={homologMode === "reject" ? "destructive" : "default"}
                    disabled={busy || (homologMode === "reject" && !noteValid)}
                    onClick={() => void run(
                      () => aiSolutionsPortalApi.homologate(id, homologMode === "approve" ? { approve: true } : { approve: false, comment: note.trim() }),
                      homologMode === "approve" ? "Homologação aprovada." : "Homologação reprovada. A TI vai ajustar.",
                    )}
                  >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {homologMode === "approve" ? "Confirmar aprovação" : "Reprovar"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Section
            title="Mensagens"
            subtitle="Conversa entre você e a TI sobre esta solução."
            right={<span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{sol.comments.length}</span>}
          >
            <div className="space-y-4">
              {sol.comments.length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
              ) : (
                <div className="space-y-3">
                  {sol.comments.map((c) => (
                    <div key={c.id} className={`flex gap-2.5 ${c.from_client ? "flex-row-reverse" : ""}`}>
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          c.from_client ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                        }`}
                        aria-hidden
                      >
                        {initials(c.author_name)}
                      </span>
                      <div className={`min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2.5 ${c.from_client ? "rounded-tr-sm bg-primary/10" : "rounded-tl-sm bg-muted"}`}>
                        <p className={`mb-1 flex flex-wrap items-baseline gap-x-2 text-xs ${c.from_client ? "justify-end" : ""}`}>
                          <span className="font-semibold text-foreground">{c.from_client ? "Você" : c.author_name ?? "TI"}</span>
                          {!c.from_client && <span className="rounded-md bg-primary/10 px-1.5 text-[10px] font-medium text-primary">TI</span>}
                          <span className="text-muted-foreground" title={fmtDateTime(c.created_at)}>{fmtRelative(c.created_at)}</span>
                        </p>
                        <CommentBody content={c.content} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {sol.can_interact ? (
                <div className="rounded-xl border bg-background transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
                  <Textarea
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && message.trim() && !busy) {
                        e.preventDefault()
                        void run(async () => { const r = await aiSolutionsPortalApi.comment(id, message.trim()); setMessage(""); return r }, "Mensagem enviada.")
                      }
                    }}
                    placeholder="Escreva para a TI"
                    className="min-h-[84px] resize-y border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <div className="flex items-center justify-end gap-3 border-t px-2.5 py-2">
                    <span className="hidden text-xs text-muted-foreground sm:inline">Ctrl + Enter envia</span>
                    <Button
                      size="sm" className="gap-1.5" disabled={busy || !message.trim()}
                      onClick={() => void run(async () => { const r = await aiSolutionsPortalApi.comment(id, message.trim()); setMessage(""); return r }, "Mensagem enviada.")}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={14} />} Enviar
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="border-t pt-3 text-sm text-muted-foreground">
                  {sol.is_closed ? "Solicitação encerrada — não recebe novas mensagens." : "Só quem pediu a solução troca mensagens com a TI por aqui."}
                </p>
              )}
            </div>
          </Section>

          <Section title="Seu pedido" subtitle="O que você enviou para a análise.">
            {sol.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem informações do pedido.</p>
            ) : (
              <dl className="grid gap-x-6 gap-y-4 md:grid-cols-2">
                {sol.fields.map((f) => (
                  <div key={f.label} className={f.value.length > 120 ? "md:col-span-2" : ""}>
                    <dt className="text-sm font-medium text-muted-foreground">{f.label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          {links.length > 0 && (
            <Section title="Links" subtitle="Versão, código e ambientes da solução.">
              <div className="space-y-2">
                {links.map((l) => <ExtLink key={l.label} href={l.href} label={l.label} />)}
              </div>
            </Section>
          )}

          <Section title="Histórico" subtitle="Mudanças de etapa, da mais recente para a mais antiga.">
            {sol.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum movimento registrado ainda.</p>
            ) : (
              <ol className="relative ms-1.5 border-s border-border/70 ps-4">
                {[...sol.history].reverse().map((h, i) => (
                  <li key={i} className="mb-3 last:mb-0">
                    <span className="absolute -start-[5px] mt-2 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                    <div className="rounded-lg bg-muted/50 px-3 py-2">
                      <p className="text-sm font-medium leading-snug">
                        {h.from_stage_name && <><span className="text-muted-foreground">{h.from_stage_name}</span>{" → "}</>}
                        <span>{h.stage_name ?? "—"}</span>
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <GitBranch className="h-3 w-3 shrink-0" /> {fmtDateTime(h.moved_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          {sol.can_cancel && (
            <div ref={cancelRef}>
              <Card className="p-5">
                <h2 className="font-semibold">Cancelar solicitação</h2>
                <p className="mt-1 text-sm text-muted-foreground">Se não precisar mais da solução, cancele com o motivo. A TI é avisada.</p>
                {canceling ? (
                  <div className="mt-3 space-y-2">
                    <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por que cancelar? (mín. 10 caracteres)" />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setCanceling(false)} disabled={busy}>Voltar</Button>
                      <Button
                        variant="destructive" size="sm" disabled={busy || !noteValid}
                        onClick={() => void run(() => aiSolutionsPortalApi.cancel(id, note.trim()), "Solicitação cancelada.")}
                      >
                        Cancelar solicitação
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-destructive hover:text-destructive" onClick={() => { setNote(""); setCanceling(true) }}>
                    <XCircle size={14} /> Cancelar solicitação
                  </Button>
                )}
              </Card>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
