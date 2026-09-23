import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, Bug, CircleHelp, Lightbulb, Loader2, Send, type LucideIcon } from "lucide-react"

import {
  OCCURRENCE_ABRANGENCIA_LABEL,
  OCCURRENCE_IMPACTO_LABEL,
  OCCURRENCE_TIPO_ABERTURA,
  portalOccurrencesApi,
  type OccurrenceAbrangencia,
  type OccurrenceImpacto,
  type OccurrenceTipoAbertura,
  type PortalProject,
  type Upload,
} from "@/api/clientes"
import { AttachmentField } from "@/components/AttachmentField"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { apiErrorDetail } from "@/modules/portal/occurrenceUi"

const NONE = "__none__"

const TIPO_META: Record<OccurrenceTipoAbertura, { icon: LucideIcon; desc: string }> = {
  erro: { icon: Bug, desc: "Algo não funciona como deveria." },
  duvida: { icon: CircleHelp, desc: "Não sei como fazer algo no sistema." },
  melhoria: { icon: Lightbulb, desc: "Uma ideia para o sistema ficar melhor." },
}
const IMPACTO_DESC: Record<OccurrenceImpacto, string> = {
  impede: "Não consigo seguir com o trabalho.",
  contorno: "Consigo seguir de outro jeito.",
  baixo: "Incomoda, mas não atrapalha.",
}
const ABRANGENCIA_DESC: Record<OccurrenceAbrangencia, string> = {
  eu: "Acontece só comigo.",
  setor: "Afeta pessoas da minha área.",
  todos: "Afeta todo mundo que usa.",
}

type FieldKey = "project" | "tipo" | "title" | "description" | "impacto" | "abrangencia"

/** Opções em cartões (tipo, impacto, abrangência). */
function ChoiceCards<T extends string>({
  name,
  value,
  options,
  descriptions,
  icons,
  onChange,
  invalid,
}: {
  name: string
  value: T | null
  options: Record<T, string>
  descriptions: Record<T, string>
  icons?: Record<T, LucideIcon>
  onChange: (v: T) => void
  invalid?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2 sm:grid-cols-3">
      {(Object.keys(options) as T[]).map((key) => {
        const Icon: LucideIcon | undefined = icons?.[key]
        const selected = value === key
        return (
          <label
            key={key}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors ${
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : invalid
                  ? "border-destructive/60 hover:bg-muted/50"
                  : "hover:border-primary/40 hover:bg-muted/40"
            }`}
          >
            <input type="radio" name={name} className="sr-only" checked={selected} onChange={() => onChange(key)} />
            {Icon && (
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                  selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon size={15} />
              </span>
            )}
            <span className="min-w-0">
              <span className={`block font-medium ${selected ? "text-primary" : ""}`}>{options[key]}</span>
              <span className="block text-xs text-muted-foreground">{descriptions[key]}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t p-5 first:border-t-0 md:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {n}
        </span>
        <div>
          <h2 className="font-semibold leading-6">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <div className="space-y-4 md:pl-9">{children}</div>
    </section>
  )
}

function Req() {
  return <span className="text-destructive" aria-hidden> *</span>
}

function FieldError({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null
  return <p className="text-xs text-destructive">{children}</p>
}

/** Abertura de Ocorrência pelo cliente (só projetos em Operação Assistida). */
export default function ClientNewOccurrencePage() {
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

  const errors: Record<FieldKey, boolean> = {
    project: !projectId || projectId === NONE,
    tipo: !tipo,
    title: title.trim().length < 3,
    description: description.trim().length < 3,
    impacto: !impacto,
    abrangencia: !abrangencia,
  }
  const show = (k: FieldKey) => tried && errors[k]

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
      navigate(`/portal/ocorrencias/${created.task_id}`, { replace: true })
    } catch (err) {
      toast.error(apiErrorDetail(err, "Não foi possível abrir a ocorrência."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/portal/ocorrencias" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Ocorrências
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nova ocorrência</h1>
        <p className="text-sm text-muted-foreground">Conte o que aconteceu. O time é avisado assim que você enviar.</p>
      </div>

      {!loadingProjects && projects.length > 0 && available.length === 0 && (
        <Alert>
          <AlertDescription>Nenhum dos seus projetos está em Operação Assistida no momento.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Sem <form>: dentro de um form o Select (Radix) cria um <select> nativo que zera a escolha automática do projeto. */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Section n={1} title="Sobre o quê?" hint="Escolha o projeto e o tipo da ocorrência.">
            <div id="oc-field-project" className="space-y-1.5">
              <Label>
                Projeto
                <Req />
              </Label>
              <Select value={projectId} onValueChange={(v) => v && setProjectId(v)}>
                <SelectTrigger className={show("project") ? "border-destructive" : ""}>
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
            </div>

            <div id="oc-field-tipo" className="space-y-1.5">
              <Label>
                Tipo
                <Req />
              </Label>
              <ChoiceCards
                name="Tipo"
                value={tipo}
                options={OCCURRENCE_TIPO_ABERTURA}
                descriptions={Object.fromEntries(Object.entries(TIPO_META).map(([k, v]) => [k, v.desc])) as Record<OccurrenceTipoAbertura, string>}
                icons={Object.fromEntries(Object.entries(TIPO_META).map(([k, v]) => [k, v.icon])) as Record<OccurrenceTipoAbertura, LucideIcon>}
                onChange={setTipo}
                invalid={show("tipo")}
              />
              <FieldError show={show("tipo")}>Escolha o tipo da ocorrência.</FieldError>
              {tipo === "melhoria" && (
                <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  Melhorias são analisadas pelo PO e podem seguir para um projeto de Release, fora da Operação Assistida.
                </p>
              )}
            </div>
          </Section>

          <Section n={2} title="Descreva" hint="Quanto mais claro, mais rápido o time resolve.">
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
                className={show("title") ? "border-destructive" : ""}
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
                rows={4}
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
                />
              </div>
            </div>
          </Section>

          <Section n={3} title="Impacto" hint="Ajuda o time a priorizar o atendimento.">
            <div id="oc-field-impacto" className="space-y-1.5">
              <Label>
                Quanto isso atrapalha?
                <Req />
              </Label>
              <ChoiceCards
                name="Impacto"
                value={impacto}
                options={OCCURRENCE_IMPACTO_LABEL}
                descriptions={IMPACTO_DESC}
                onChange={setImpacto}
                invalid={show("impacto")}
              />
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
                options={OCCURRENCE_ABRANGENCIA_LABEL}
                descriptions={ABRANGENCIA_DESC}
                onChange={setAbrangencia}
                invalid={show("abrangencia")}
              />
              <FieldError show={show("abrangencia")}>Informe quem é afetado.</FieldError>
            </div>
          </Section>

          <Section n={4} title="Anexos" hint="Opcional: prints, vídeos ou arquivos que ajudem a entender.">
            <AttachmentField
              value={anexos}
              onChange={(files) => setAnexos(files)}
              upload={portalOccurrencesApi.upload}
              getUrl={portalOccurrencesApi.uploadUrl}
            />
          </Section>

          <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-end md:px-6">
            <Button type="button" variant="ghost" onClick={() => navigate("/portal/ocorrencias")} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" className="gap-1.5" onClick={() => void submit()} disabled={saving || available.length === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={14} />}
              Enviar ocorrência
            </Button>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Como funciona</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {[
                ["Você envia", "O time de atendimento do projeto é avisado na hora."],
                ["Alguém assume", "Um responsável do time passa a cuidar da ocorrência."],
                ["Vocês conversam", "Se o time precisar de algo, você recebe um aviso para responder aqui."],
                ["Você valida", "Quando o ajuste ficar pronto, você testa e confirma se resolveu."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block font-medium leading-5">{t}</span>
                    <span className="block text-xs text-muted-foreground">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl border bg-card p-5 text-sm shadow-sm">
            <h2 className="font-semibold">Dicas para um bom relato</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Um print da tela vale mais que muitas palavras.</li>
              <li>Informe a mensagem de erro exatamente como apareceu.</li>
              <li>Diga se acontece sempre ou só às vezes.</li>
              <li>Uma ocorrência por problema facilita o acompanhamento.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
