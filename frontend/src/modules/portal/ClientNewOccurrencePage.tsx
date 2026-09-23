import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"

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

function RadioGroup<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string
  value: T | null
  options: Record<T, string>
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(options) as T[]).map((key) => (
        <label
          key={key}
          className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors ${
            value === key ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/50"
          }`}
        >
          <input type="radio" name={name} className="sr-only" checked={value === key} onChange={() => onChange(key)} />
          {options[key]}
        </label>
      ))}
    </div>
  )
}

/** Abertura de Ocorrência pelo cliente (só projetos em Operação Assistida). */
export default function ClientNewOccurrencePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [projects, setProjects] = useState<PortalProject[]>([])
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

  useEffect(() => {
    portalOccurrencesApi
      .projects()
      .then((ps) => {
        setProjects(ps)
        const open = ps.filter((p) => p.accepts_occurrences)
        setProjectId((cur) => (open.some((p) => p.task_id === cur) ? cur : open.length === 1 ? open[0].task_id : NONE))
      })
      .catch(() => setProjects([]))
  }, [])

  const available = useMemo(() => projects.filter((p) => p.accepts_occurrences), [projects])

  async function submit() {
    if (projectId === NONE) return toast.error("Escolha o projeto.")
    if (!tipo) return toast.error("Escolha o tipo da ocorrência.")
    if (title.trim().length < 3) return toast.error("Informe um título (mín. 3 caracteres).")
    if (description.trim().length < 3) return toast.error("Descreva o que aconteceu.")
    if (!impacto || !abrangencia) return toast.error("Informe o impacto e quem é afetado.")
    setSaving(true)
    try {
      const created = await portalOccurrencesApi.open({
        project_task_id: projectId,
        tipo,
        title: title.trim(),
        description: description.trim(),
        passos: passos.trim() || null,
        esperado: esperado.trim() || null,
        funcionalidade: funcionalidade.trim() || null,
        impacto,
        abrangencia,
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
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/portal/ocorrencias" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Ocorrências
      </Link>
      <div>
        <h1 className="text-xl font-bold">Nova ocorrência</h1>
        <p className="text-sm text-muted-foreground">Conte o que aconteceu. O time é avisado assim que você enviar.</p>
      </div>

      {projects.length > 0 && available.length === 0 && (
        <Alert>
          <AlertDescription>Nenhum dos seus projetos está em Operação Assistida no momento.</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4 rounded-lg border p-4">
        <div className="space-y-1.5">
          <Label>Projeto</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger>
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
        </div>

        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <RadioGroup name="tipo" value={tipo} options={OCCURRENCE_TIPO_ABERTURA} onChange={setTipo} />
          {tipo === "melhoria" && (
            <p className="text-xs text-muted-foreground">
              Melhorias são analisadas pelo PO e podem seguir para um projeto de Release, fora da Operação Assistida.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="oc-title">Título</Label>
          <Input id="oc-title" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resumo em uma frase" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="oc-desc">O que aconteceu</Label>
          <Textarea id="oc-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
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

        <div className="space-y-1.5">
          <Label htmlFor="oc-esperado">Resultado esperado</Label>
          <Textarea id="oc-esperado" rows={2} value={esperado} onChange={(e) => setEsperado(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="oc-func">Tela / funcionalidade afetada</Label>
          <Input id="oc-func" maxLength={300} value={funcionalidade} onChange={(e) => setFuncionalidade(e.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Impacto</Label>
            <RadioGroup name="impacto" value={impacto} options={OCCURRENCE_IMPACTO_LABEL} onChange={setImpacto} />
          </div>
          <div className="space-y-1.5">
            <Label>Quem é afetado</Label>
            <RadioGroup name="abrangencia" value={abrangencia} options={OCCURRENCE_ABRANGENCIA_LABEL} onChange={setAbrangencia} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Anexos (prints, vídeos, arquivos)</Label>
          <AttachmentField
            value={anexos}
            onChange={(files) => setAnexos(files)}
            upload={portalOccurrencesApi.upload}
            getUrl={portalOccurrencesApi.uploadUrl}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate("/portal/ocorrencias")} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={saving || available.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar ocorrência
          </Button>
        </div>
      </div>
    </div>
  )
}
