import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Bug,
  Building2,
  ChevronRight,
  CircleHelp,
  Feather,
  Lightbulb,
  Loader2,
  Route,
  Send,
  User,
  Users,
  type LucideIcon,
} from "lucide-react"

import {
  OCCURRENCE_ABRANGENCIA_LABEL,
  OCCURRENCE_IMPACTO_LABEL,
  OCCURRENCE_TIPO_ABERTURA,
  portalOccurrencesApi,
  type OccurrenceAbrangencia,
  type OccurrenceImpacto,
  type OccurrencePrioridade,
  type OccurrenceTipoAbertura,
  type PortalProject,
  type Upload,
} from "@/api/clientes"
import { AttachmentField } from "@/components/AttachmentField"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { PriorityBadge, apiErrorDetail, plural } from "@/modules/portal/occurrenceUi"
import { Card, IconTile } from "@/modules/portal/portfolioUi"
import {
  ChoiceCards,
  FieldError,
  FormSection,
  HowItWorks,
  Req,
  StepProgress,
  SummaryRow,
  type Choice,
} from "@/modules/portal/portalForm"
import { usePortalBase } from "@/modules/portal/portfolioMeta"

const NONE = "__none__"

const TIPO_META: Record<OccurrenceTipoAbertura, { icon: LucideIcon; desc: string }> = {
  erro: { icon: Bug, desc: "Algo não funciona como deveria." },
  duvida: { icon: CircleHelp, desc: "Não sei como fazer algo no sistema." },
  melhoria: { icon: Lightbulb, desc: "Uma ideia para o sistema ficar melhor." },
}
const IMPACTO_META: Record<OccurrenceImpacto, { icon: LucideIcon; desc: string }> = {
  impede: { icon: Ban, desc: "Não consigo seguir com o trabalho." },
  contorno: { icon: Route, desc: "Consigo seguir de outro jeito." },
  baixo: { icon: Feather, desc: "Incomoda, mas não atrapalha." },
}
const ABRANGENCIA_META: Record<OccurrenceAbrangencia, { icon: LucideIcon; desc: string }> = {
  eu: { icon: User, desc: "Acontece só comigo." },
  setor: { icon: Users, desc: "Afeta pessoas da minha área." },
  todos: { icon: Building2, desc: "Afeta todo mundo que usa." },
}

/** Mesma matriz do backend (assisted_ops._PRIORITY): impacto × quem é afetado. O PO pode ajustar. */
const PRIORITY: Record<OccurrenceImpacto, Record<OccurrenceAbrangencia, OccurrencePrioridade>> = {
  impede: { todos: "P1", setor: "P1", eu: "P2" },
  contorno: { todos: "P2", setor: "P3", eu: "P3" },
  baixo: { todos: "P3", setor: "P4", eu: "P4" },
}

type FieldKey = "project" | "tipo" | "title" | "description" | "impacto" | "abrangencia"

function choicesOf<T extends string>(labels: Record<T, string>, meta: Record<T, { icon: LucideIcon; desc: string }>): Choice<T>[] {
  return (Object.keys(labels) as T[]).map((k) => ({ value: k, label: labels[k], desc: meta[k].desc, icon: meta[k].icon }))
}

/** Abertura de Ocorrência pelo cliente (só projetos em Operação Assistida), no padrão visual do Portal. */
export default function ClientNewOccurrencePage() {
  const base = usePortalBase()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [projects, setProjects] = useState<PortalProject[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectId, setProjectId] = useState<string>(params.get("projeto") ?? NONE)
  const [tipo, setTipo] = useState<OccurrenceTipoAbertura | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [passos, setPassos] = useState("")
  const [esperado, setEsperado] = useState("")
  const [funcionalidade, setFuncionalidade] = useState("")
  const [impacto, setImpacto] = useState<OccurrenceImpacto | null>(null)
  const [abrangencia, setAbrangencia] = useState<OccurrenceAbrangencia | null>(null)
  const [anexos, setAnexos] = useState<Upload[]>([])
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    portalOccurrencesApi
      .projects()
      .then((ps) => {
        setProjects(ps)
        const open = ps.filter((p) => p.accepts_occurrences)
        setProjectId((cur) => (open.some((p) => p.task_id === cur) ? cur : open.length === 1 ? open[0].task_id : NONE))
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false))
  }, [])

  const available = useMemo(() => projects.filter((p) => p.accepts_occurrences), [projects])
  const project = available.find((p) => p.task_id === projectId) ?? null

  const errors: Record<FieldKey, boolean> = {
    project: !projectId || projectId === NONE,
    tipo: !tipo,
    title: title.trim().length < 3,
    description: description.trim().length < 3,
    impacto: !impacto,
    abrangencia: !abrangencia,
  }
  const show = (k: FieldKey) => tried && errors[k]
  const steps = [
    { id: "oc-step-1", label: "Sobre o quê?", done: !errors.project && !errors.tipo },
    { id: "oc-step-2", label: "Descreva", done: !errors.title && !errors.description },
    { id: "oc-step-3", label: "Impacto", done: !errors.impacto && !errors.abrangencia },
    { id: "oc-step-4", label: "Anexos", done: anexos.length > 0, optional: true },
  ]
  const required = steps.filter((s) => !s.optional)
  const doneCount = required.filter((s) => s.done).length
  const priority = impacto && abrangencia ? PRIORITY[impacto][abrangencia] : null

  async function submit() {
    setTried(true)
    const first = (Object.keys(errors) as FieldKey[]).find((k) => errors[k])
    if (first) {
      document.getElementById(`oc-field-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
      return toast.error("Revise os campos destacados.")
    }
    setSaving(true)
    try {
      const created = await portalOccurrencesApi.open({
        project_task_id: projectId,
        tipo: tipo!,
        title: title.trim(),
        description: description.trim(),
        passos: passos.trim() || null,
        esperado: esperado.trim() || null,
        funcionalidade: funcionalidade.trim() || null,
        impacto: impacto!,
        abrangencia: abrangencia!,
        anexos: anexos.length ? anexos : null,
      })
      toast.success(`Ocorrência ${created.code_label} aberta.`)
      navigate(`${base}/ocorrencias/${created.task_id}`, { replace: true })
    } catch (err) {
      toast.error(apiErrorDetail(err, "Não foi possível abrir a ocorrência."))
    } finally {
      setSaving(false)
    }
  }

  const submitButton = (
    <Button type="button" className="h-10 w-full gap-1.5" onClick={() => void submit()} disabled={saving || available.length === 0}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={15} />}
      Enviar ocorrência
    </Button>
  )

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Trilha">
          <Link to={base} className="hover:text-foreground">Portfólio</Link>
          <ChevronRight size={14} />
          <Link to={`${base}/ocorrencias`} className="hover:text-foreground">Ocorrências</Link>
          <ChevronRight size={14} />
          <span className="font-medium text-foreground">Nova ocorrência</span>
        </nav>
        <div className="flex items-start gap-4">
          <IconTile icon="LifeBuoy" color="#2563EB" size={56} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Nova ocorrência</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Conte o que aconteceu. O time de atendimento do projeto é avisado assim que você enviar.
            </p>
          </div>
        </div>
      </div>

      {!loadingProjects && available.length === 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>
            Nenhum dos seus projetos está em Operação Assistida no momento. Ocorrências só podem ser abertas nos projetos que já foram
            entregues e estão nessa fase.
          </p>
        </div>
      )}

      <StepProgress steps={steps} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Sem <form>: dentro de um form o Select (Radix) cria um <select> nativo que zera a escolha automática do projeto. */}
        <div className="min-w-0 space-y-5">
          <FormSection id="oc-step-1" n={1} title="Sobre o quê?" hint="Escolha o projeto e o tipo da ocorrência." done={steps[0].done}>
            <div id="oc-field-project" className="space-y-1.5">
              <Label>
                Projeto
                <Req />
              </Label>
              <Select value={projectId} onValueChange={(v) => v && setProjectId(v)}>
                <SelectTrigger className={`h-10 ${show("project") ? "border-destructive" : ""}`}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Selecione o projeto</SelectItem>
                  {available.map((p) => (
                    <SelectItem key={p.task_id} value={p.task_id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError show={show("project")}>Escolha o projeto.</FieldError>
              {project && project.open_occurrences > 0 && (
                <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                  Este projeto tem {plural(project.open_occurrences, "ocorrência em aberto", "ocorrências em aberto")}.
                  <Link to={`${base}/ocorrencias?projeto=${project.task_id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                    Veja se o seu caso já está lá <ArrowRight size={13} />
                  </Link>
                </p>
              )}
            </div>

            <div id="oc-field-tipo" className="space-y-1.5">
              <Label>
                Tipo
                <Req />
              </Label>
              <ChoiceCards name="Tipo" value={tipo} choices={choicesOf(OCCURRENCE_TIPO_ABERTURA, TIPO_META)} onChange={setTipo} invalid={show("tipo")} />
              <FieldError show={show("tipo")}>Escolha o tipo da ocorrência.</FieldError>
              {tipo === "melhoria" && (
                <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                  Melhorias são analisadas pelo PO e podem seguir para um projeto de Release, fora da Operação Assistida.
                </p>
              )}
            </div>
          </FormSection>

          <FormSection id="oc-step-2" n={2} title="Descreva" hint="Quanto mais claro, mais rápido o time resolve." done={steps[1].done}>
            <div id="oc-field-title" className="space-y-1.5">
              <Label htmlFor="oc-title">
                Título
                <Req />
              </Label>
              <Input
                id="oc-title"
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Resumo em uma frase (ex.: Relatório não gera PDF)"
                aria-invalid={show("title")}
                className={`h-10 ${show("title") ? "border-destructive" : ""}`}
              />
              <FieldError show={show("title")}>Informe um título (mín. 3 caracteres).</FieldError>
            </div>

            <div id="oc-field-description" className="space-y-1.5">
              <Label htmlFor="oc-desc">
                O que aconteceu
                <Req />
              </Label>
              <Textarea
                id="oc-desc"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Conte o que você estava fazendo e o que aconteceu. Se apareceu uma mensagem de erro, copie aqui."
                aria-invalid={show("description")}
                className={show("description") ? "border-destructive" : ""}
              />
              <FieldError show={show("description")}>Descreva o que aconteceu.</FieldError>
            </div>

            {tipo === "erro" && (
              <div className="space-y-1.5">
                <Label htmlFor="oc-passos">Passos para reproduzir</Label>
                <Textarea
                  id="oc-passos"
                  rows={3}
                  value={passos}
                  onChange={(e) => setPassos(e.target.value)}
                  placeholder={"1. Entrei na tela...\n2. Cliquei em..."}
                />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="oc-esperado">Resultado esperado</Label>
                <Textarea
                  id="oc-esperado"
                  rows={2}
                  value={esperado}
                  onChange={(e) => setEsperado(e.target.value)}
                  placeholder="O que deveria ter acontecido"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="oc-func">Tela / funcionalidade afetada</Label>
                <Input
                  id="oc-func"
                  maxLength={300}
                  value={funcionalidade}
                  onChange={(e) => setFuncionalidade(e.target.value)}
                  placeholder="Ex.: Relatórios > Exportar"
                  className="h-10"
                />
              </div>
            </div>
          </FormSection>

          <FormSection id="oc-step-3" n={3} title="Impacto" hint="Ajuda o time a priorizar o atendimento." done={steps[2].done}>
            <div id="oc-field-impacto" className="space-y-1.5">
              <Label>
                Quanto isso atrapalha?
                <Req />
              </Label>
              <ChoiceCards name="Impacto" value={impacto} choices={choicesOf(OCCURRENCE_IMPACTO_LABEL, IMPACTO_META)} onChange={setImpacto} invalid={show("impacto")} />
              <FieldError show={show("impacto")}>Informe o impacto.</FieldError>
            </div>
            <div id="oc-field-abrangencia" className="space-y-1.5">
              <Label>
                Quem é afetado?
                <Req />
              </Label>
              <ChoiceCards
                name="Quem é afetado"
                value={abrangencia}
                choices={choicesOf(OCCURRENCE_ABRANGENCIA_LABEL, ABRANGENCIA_META)}
                onChange={setAbrangencia}
                invalid={show("abrangencia")}
              />
              <FieldError show={show("abrangencia")}>Informe quem é afetado.</FieldError>
            </div>
            {priority && (
              <p className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm">
                Prioridade prevista: <PriorityBadge value={priority} withLabel />
                <span className="text-muted-foreground">O PO do projeto pode ajustar.</span>
              </p>
            )}
          </FormSection>

          <FormSection
            id="oc-step-4" n={4} title="Anexos" hint="Prints, vídeos ou arquivos que ajudem a entender." done={steps[3].done} optional
          >
            <AttachmentField
              value={anexos}
              onChange={(files) => setAnexos(files)}
              upload={portalOccurrencesApi.upload}
              getUrl={portalOccurrencesApi.uploadUrl}
            />
          </FormSection>

          {/* No celular o resumo fica embaixo: o botão de enviar também. */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end lg:hidden">
            <Button type="button" variant="outline" className="h-10" onClick={() => navigate(`${base}/ocorrencias`)} disabled={saving}>
              Cancelar
            </Button>
            <div className="sm:w-56">{submitButton}</div>
          </div>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <div className="border-b px-5 py-4">
              <h2 className="text-lg font-semibold">Resumo do envio</h2>
              <p className="text-sm text-muted-foreground">
                {doneCount === required.length ? "Tudo pronto para enviar." : `${doneCount} de ${required.length} etapas obrigatórias preenchidas.`}
              </p>
            </div>
            <div className="px-5 py-2">
              <dl className="divide-y">
                <SummaryRow label="Projeto">
                  <span className="line-clamp-2">{project?.title ?? <span className="font-normal text-muted-foreground">A escolher</span>}</span>
                </SummaryRow>
                <SummaryRow label="Tipo">{tipo ? OCCURRENCE_TIPO_ABERTURA[tipo] : <span className="font-normal text-muted-foreground">—</span>}</SummaryRow>
                <SummaryRow label="Impacto">{impacto ? OCCURRENCE_IMPACTO_LABEL[impacto] : <span className="font-normal text-muted-foreground">—</span>}</SummaryRow>
                <SummaryRow label="Quem é afetado">
                  {abrangencia ? OCCURRENCE_ABRANGENCIA_LABEL[abrangencia] : <span className="font-normal text-muted-foreground">—</span>}
                </SummaryRow>
                <SummaryRow label="Prioridade prevista">
                  {priority ? <PriorityBadge value={priority} withLabel /> : <span className="font-normal text-muted-foreground">—</span>}
                </SummaryRow>
                <SummaryRow label="Anexos">{anexos.length || <span className="font-normal text-muted-foreground">Nenhum</span>}</SummaryRow>
              </dl>
            </div>
            <div className="hidden space-y-2 border-t p-5 lg:block">
              {submitButton}
              <Button type="button" variant="ghost" className="h-10 w-full" onClick={() => navigate(`${base}/ocorrencias`)} disabled={saving}>
                Cancelar
              </Button>
            </div>
          </Card>

          <HowItWorks
            items={[
              ["Você envia", "O time de atendimento do projeto é avisado na hora."],
              ["Alguém assume", "Um responsável do time passa a cuidar da ocorrência."],
              ["Vocês conversam", "Se o time precisar de algo, você recebe um aviso para responder aqui."],
              ["Você valida", "Quando o ajuste ficar pronto, você testa e confirma se resolveu."],
            ]}
          />

          <Card className="p-5 text-sm">
            <h2 className="font-semibold">Dicas para um bom relato</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
              <li>Um print da tela vale mais que muitas palavras.</li>
              <li>Informe a mensagem de erro exatamente como apareceu.</li>
              <li>Diga se acontece sempre ou só às vezes.</li>
              <li>Uma ocorrência por problema facilita o acompanhamento.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  )
}
