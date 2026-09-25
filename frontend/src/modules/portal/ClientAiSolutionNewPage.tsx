import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ChevronRight, Loader2, Send } from "lucide-react"

import { aiSolutionsPortalApi, type AiSolutionFormField } from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/toast"
import { apiErrorDetail } from "@/modules/portal/occurrenceUi"
import { AiFieldEditor } from "@/modules/portal/aiSolutionUi"
import { missingAiFields } from "@/modules/portal/aiSolutionRules"
import { Card, IconTile } from "@/modules/portal/portfolioUi"
import { FieldError, FormSection, HowItWorks, Req, StepProgress, SummaryRow } from "@/modules/portal/portalForm"
import { usePortalBase } from "@/modules/portal/portfolioMeta"

/** Etapas do pedido. Os campos vêm do backend (seção "Pedido do cliente"); o que não estiver
 *  aqui cai em "Outras informações", para a tela não quebrar se o formulário mudar. */
const GROUPS: { id: string; title: string; hint: string; keys: string[] }[] = [
  { id: "ai-step-1", title: "A solução", hint: "Dê um nome e conte o objetivo e o problema que ela resolve.", keys: ["objetivo", "problema"] },
  {
    id: "ai-step-2", title: "Quem usa e o que faz", hint: "Público, principais funcionalidades e com quais sistemas ela conversa.",
    keys: ["publico", "funcionalidades", "integracoes"],
  },
  {
    id: "ai-step-3", title: "Dados e ferramenta", hint: "Que dados a solução usa, em qual ferramenta será construída e os custos.",
    keys: ["dados_envolvidos", "dados_pessoais", "plataforma", "plataforma_outra", "custos"],
  },
]

/** Os 9 pontos que a coordenação confere na Análise (checklist da etapa). */
const ANALYSIS_POINTS = [
  "Objetivo da solução",
  "Se já existe solução semelhante",
  "Projetos e demandas em andamento",
  "Possibilidade de reaproveitamento",
  "Custos",
  "Integrações",
  "Dados utilizados",
  "Impacto tecnológico",
  "Sustentação pela TI",
]

/** Pedido de análise de solução com IA, no padrão dos formulários do Portal. */
export default function ClientAiSolutionNewPage() {
  const base = usePortalBase()
  const navigate = useNavigate()
  const [fields, setFields] = useState<AiSolutionFormField[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState("")
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    aiSolutionsPortalApi.form()
      .then((r) => setFields(r.fields))
      .catch((err) => toast.error(apiErrorDetail(err, "Não foi possível carregar o formulário.")))
      .finally(() => setLoading(false))
  }, [])

  const val = (k: string) => (values[k] ?? "").trim()
  const outra = values.plataforma === "Outra"
  const isRequired = (f: AiSolutionFormField) => f.required || (f.key === "plataforma_outra" && outra)
  const shown = (f: AiSolutionFormField) => f.key !== "plataforma_outra" || outra
  const errors: Record<string, boolean> = { title: title.trim().length < 3 }
  for (const f of fields) if (shown(f) && isRequired(f)) errors[f.key] = !val(f.key)
  const show = (k: string) => tried && !!errors[k]

  const known = new Set(GROUPS.flatMap((g) => g.keys))
  const groups = [
    ...GROUPS.map((g) => ({ ...g, fields: g.keys.map((k) => fields.find((f) => f.key === k)).filter(Boolean) as AiSolutionFormField[] })),
    ...(fields.some((f) => !known.has(f.key))
      ? [{ id: "ai-step-4", title: "Outras informações", hint: "Complete o pedido.", keys: [], fields: fields.filter((f) => !known.has(f.key)) }]
      : []),
  ].filter((g, i) => i === 0 || g.fields.length > 0)
  const steps = groups.map((g, i) => ({
    id: g.id,
    label: g.title,
    done: (i > 0 || !errors.title) && g.fields.every((f) => !errors[f.key]),
  }))
  const requiredKeys = Object.keys(errors)
  const filled = requiredKeys.filter((k) => !errors[k]).length

  async function submit() {
    setTried(true)
    const faltam = [...(title.trim().length < 3 ? ["Nome da solução"] : []), ...missingAiFields(fields, values)]
    if (faltam.length) {
      const first = ["title", ...fields.map((f) => f.key)].find((k) => errors[k])
      if (first) document.getElementById(`ai-field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
      const msg = `Preencha: ${faltam.join(", ")}`
      toast.error(/[.?!]$/.test(msg) ? msg : `${msg}.`)
      return
    }
    setSaving(true)
    try {
      const created = await aiSolutionsPortalApi.create({
        title: title.trim(),
        values: Object.fromEntries(fields.map((f) => [f.key, (values[f.key] ?? "").trim() || null])),
      })
      toast.success(`${created.code_label} enviada para análise.`)
      navigate(`${base}/solucoes-ia/${created.task_id}`)
    } catch (err) {
      toast.error(apiErrorDetail(err, "Não foi possível enviar a solicitação."))
    } finally {
      setSaving(false)
    }
  }

  function renderField(f: AiSolutionFormField) {
    return (
      <AiFieldEditor
        key={f.key}
        field={f}
        value={values[f.key] ?? ""}
        onChange={(v) => setValues((cur) => ({ ...cur, [f.key]: v }))}
        required={isRequired(f)}
        invalid={show(f.key)}
      />
    )
  }

  const submitButton = (
    <Button className="h-10 w-full gap-1.5" onClick={() => void submit()} disabled={saving || loading}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={15} />}
      Enviar para análise
    </Button>
  )
  const plataforma = outra ? val("plataforma_outra") || "Outra" : values.plataforma

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Trilha">
          <Link to={base} className="hover:text-foreground">Portfólio</Link>
          <ChevronRight size={14} />
          <Link to={`${base}/solucoes-ia`} className="hover:text-foreground">Soluções com IA</Link>
          <ChevronRight size={14} />
          <span className="font-medium text-foreground">Solicitar análise</span>
        </nav>
        <div className="flex items-start gap-4">
          <IconTile icon="Sparkles" color="#7C3AED" size={56} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Solicitar análise de solução com IA</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Conte o que você quer construir. A coordenação de tecnologia avalia e responde por aqui.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-5">
          <Skeleton className="h-16 rounded-2xl" />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        </div>
      ) : (
        <>
          <StepProgress steps={steps} />

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-5">
              {groups.map((g, i) => (
                <FormSection key={g.id} id={g.id} n={i + 1} title={g.title} hint={g.hint} done={steps[i].done}>
                  {i === 0 && (
                    <div id="ai-field-title" className="space-y-1.5">
                      <Label htmlFor="ai-title">
                        Nome da solução
                        <Req />
                      </Label>
                      <Input
                        id="ai-title" value={title} maxLength={180} onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex.: Triagem de currículos" aria-invalid={show("title")}
                        className={`h-10 ${show("title") ? "border-destructive" : ""}`}
                      />
                      <FieldError show={show("title")}>Dê um nome à solução (mín. 3 caracteres).</FieldError>
                    </div>
                  )}
                  {g.fields.filter(shown).map(renderField)}
                </FormSection>
              ))}

              {/* No celular o resumo fica embaixo: o botão de enviar também. */}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end lg:hidden">
                <Button variant="outline" className="h-10" asChild><Link to={`${base}/solucoes-ia`}>Cancelar</Link></Button>
                <div className="sm:w-56">{submitButton}</div>
              </div>
            </div>

            <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
              <Card>
                <div className="border-b px-5 py-4">
                  <h2 className="text-lg font-semibold">Resumo do pedido</h2>
                  <p className="text-sm text-muted-foreground">
                    {filled === requiredKeys.length ? "Tudo pronto para enviar." : `${filled} de ${requiredKeys.length} campos obrigatórios preenchidos.`}
                  </p>
                </div>
                <div className="px-5 py-2">
                  <dl className="divide-y">
                    <SummaryRow label="Solução">
                      <span className="line-clamp-2">{title.trim() || <span className="font-normal text-muted-foreground">Sem nome</span>}</span>
                    </SummaryRow>
                    <SummaryRow label="Ferramenta">{plataforma || <span className="font-normal text-muted-foreground">—</span>}</SummaryRow>
                    <SummaryRow label="Dados pessoais">{values.dados_pessoais || <span className="font-normal text-muted-foreground">—</span>}</SummaryRow>
                  </dl>
                  <div className="py-3">
                    <div className="h-2 overflow-hidden rounded-full bg-muted dark:bg-white/10">
                      <div
                        className={`h-full rounded-full ${filled === requiredKeys.length ? "bg-emerald-500" : "bg-primary"}`}
                        style={{ width: `${requiredKeys.length ? Math.round((100 * filled) / requiredKeys.length) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="hidden space-y-2 border-t p-5 lg:block">
                  {submitButton}
                  <Button variant="ghost" className="h-10 w-full" asChild><Link to={`${base}/solucoes-ia`}>Cancelar</Link></Button>
                </div>
              </Card>

              <HowItWorks
                title="O que acontece depois"
                items={[
                  ["A coordenação analisa", "Aprova, pede ajustes no pedido ou não aprova — sempre com o motivo."],
                  ["Você constrói", "Aprovada, você constrói na ferramenta autorizada e envia o link da versão."],
                  ["A TI adequa e você homologa", "A TI adequa o código; você testa e aprova ou pede ajustes."],
                  ["Segurança e produção", "Segurança da Informação confere, a TI publica e sustenta."],
                ]}
              />

              <Card className="p-5 text-sm">
                <h2 className="font-semibold">O que a TI avalia</h2>
                <p className="mt-1 text-muted-foreground">Na análise, a coordenação confere:</p>
                <ul className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-muted-foreground sm:grid-cols-2 lg:grid-cols-1">
                  {ANALYSIS_POINTS.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
