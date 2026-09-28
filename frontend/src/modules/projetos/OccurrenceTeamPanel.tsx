import { useEffect, useState } from "react"
import { Hand, Info as InfoIcon, LifeBuoy, Loader2, Send, Users } from "lucide-react"

import {
  OCCURRENCE_ABRANGENCIA_LABEL,
  OCCURRENCE_CLASSIFICACAO_LABEL,
  OCCURRENCE_IMPACTO_LABEL,
  OCCURRENCE_TIPO_LABEL,
  teamOccurrencesApi,
  type OccurrenceClassificacao,
  type OccurrenceDetail,
  type OccurrencePrioridade,
  type ReleaseCandidate,
} from "@/api/clientes"
import { Field, Notice, Pill } from "@/components/ds"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { AttachmentField, type Attachment } from "@/components/AttachmentField"
import { PRIORITY_LABEL, SLA_RESOLUCAO_HORAS, SlaText } from "@/modules/portal/occurrenceUi"
import { DrawerSection } from "@/modules/projetos/CollapsibleFormSection"

const NONE = "__none__"

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  )
}

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

const NEW_RELEASE = "__new__"

/** Dados da Ocorrência (Operação Assistida) no drawer do card: o que o cliente informou e
 * os campos do time — criticidade (só correção, POP), classificação, solução (o cliente vê)
 * e causa raiz (obrigatórias, na correção, antes de ir para a validação do cliente). */
export function OccurrenceTeamPanel({
  taskId,
  readOnly,
  onChanged,
}: {
  taskId: string
  readOnly: boolean
  /** Chamado quando a ação mexe no card (responsável/etapa) — o drawer recarrega. */
  onChanged?: () => void
}) {
  const [occ, setOcc] = useState<OccurrenceDetail | null>(null)
  const [prioridade, setPrioridade] = useState<OccurrencePrioridade>("P3")
  const [classificacao, setClassificacao] = useState<string>(NONE)
  const [solucao, setSolucao] = useState("")
  const [causaRaiz, setCausaRaiz] = useState("")
  const [saving, setSaving] = useState(false)
  const [assuming, setAssuming] = useState(false)
  // Melhoria → Release
  const [candidates, setCandidates] = useState<ReleaseCandidate[] | null>(null)
  const [releaseId, setReleaseId] = useState<string>(NONE)
  const [newReleaseTitle, setNewReleaseTitle] = useState("")
  const [itemKind, setItemKind] = useState<"feature" | "user_story">("feature")
  const [parentFeatureId, setParentFeatureId] = useState<string>(NONE)
  const [forwarding, setForwarding] = useState(false)

  useEffect(() => {
    teamOccurrencesApi
      .get(taskId)
      .then((o) => {
        setOcc(o)
        setPrioridade(o.prioridade)
        setClassificacao(o.classificacao ?? NONE)
        setSolucao(o.solucao ?? "")
        setCausaRaiz(o.causa_raiz ?? "")
      })
      .catch(() => setOcc(null))
  }, [taskId])

  useEffect(() => {
    if (occ?.stage_key === "melhoria_analise" && candidates === null) {
      teamOccurrencesApi.releaseCandidates().then(setCandidates).catch(() => setCandidates([]))
    }
  }, [occ?.stage_key, candidates])

  if (!occ) return null

  const selectedRelease = candidates?.find((c) => c.task_id === releaseId) ?? null
  // Mesma regra do backend (assisted_ops.is_correction): a classificação do time manda.
  const isCorrection = classificacao !== NONE ? classificacao === "erro_confirmado" : occ.tipo === "erro"

  async function assume() {
    setAssuming(true)
    try {
      setOcc(await teamOccurrencesApi.assume(taskId))
      toast.success("Ocorrência assumida.")
      onChanged?.()
    } catch (err) {
      toast.error(apiError(err, "Não foi possível assumir."))
    } finally {
      setAssuming(false)
    }
  }

  async function forward() {
    if (releaseId === NONE) return toast.error("Escolha o projeto de Release.")
    if (releaseId === NEW_RELEASE && newReleaseTitle.trim().length < 3) return toast.error("Informe o nome do novo projeto.")
    if (itemKind === "user_story" && parentFeatureId === NONE) return toast.error("Escolha a Feature da User Story.")
    setForwarding(true)
    try {
      setOcc(
        await teamOccurrencesApi.forwardRelease(taskId, {
          release_task_id: releaseId === NEW_RELEASE ? null : releaseId,
          new_release_title: releaseId === NEW_RELEASE ? newReleaseTitle.trim() : null,
          item_kind: itemKind,
          parent_feature_id: itemKind === "user_story" ? parentFeatureId : null,
        }),
      )
      toast.success("Melhoria encaminhada para Release.")
      onChanged?.()
    } catch (err) {
      toast.error(apiError(err, "Não foi possível encaminhar."))
    } finally {
      setForwarding(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const before = occ?.stage_key
      const updated = await teamOccurrencesApi.update(taskId, {
        prioridade,
        classificacao: classificacao === NONE ? null : (classificacao as OccurrenceClassificacao),
        solucao: solucao.trim() || null,
        causa_raiz: causaRaiz.trim() || null,
      })
      setOcc(updated)
      toast.success("Ocorrência atualizada.")
      if (updated.stage_key !== before) onChanged?.()
    } catch {
      toast.error("Não foi possível salvar a ocorrência.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <DrawerSection
      title={`Ocorrência ${occ.code_label} · Operação Assistida`}
      icon={LifeBuoy}
      iconClassName="text-teal-600 dark:text-teal-400"
      subtitle={
        <>
          {occ.opened_by_name && <>Aberta por <span className="font-medium text-foreground">{occ.opened_by_name}</span> · </>}
          {OCCURRENCE_TIPO_LABEL[occ.tipo]} · {OCCURRENCE_IMPACTO_LABEL[occ.impacto]} · {OCCURRENCE_ABRANGENCIA_LABEL[occ.abrangencia]}
        </>
      }
    >
      <div className="space-y-3 rounded-lg bg-muted/40 p-3">
        {/* Do projeto, só o essencial para quem atende: nome, PO e produto. */}
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <Field label="Projeto">{occ.project_title ?? "—"}</Field>
          <Field label="PO">{occ.project_po_name ?? "—"}</Field>
          <Field label="Produto">{occ.product_name ?? "—"}</Field>
          <Field label="Responsável">{occ.assignee_name ?? "ninguém assumiu"}</Field>
          <Field label="Horas úteis">
            <span className="tabular-nums">{occ.worked_hours != null ? `${occ.worked_hours.toFixed(1)}h` : "—"}</span>
          </Field>
          {occ.nps_score != null && (
            <Field label="Satisfação">
              {occ.nps_score}/5
              {occ.nps_comment && <span className="font-normal text-muted-foreground"> — {occ.nps_comment}</span>}
            </Field>
          )}
          {occ.is_correction && occ.sla_state && (
            <Field label="Prazo">
              <SlaText o={occ} />
            </Field>
          )}
        </dl>
        {(occ.rejection_count > 0 || occ.finalized_by_team || (occ.can_assume && !readOnly && occ.assignee_name)) && (
          <div className="flex flex-wrap items-center gap-2">
            {occ.rejection_count > 0 && <Pill tone="amber">Reprovada {occ.rejection_count}x</Pill>}
            {occ.finalized_by_team && <Pill>Finalizada pelo PO</Pill>}
            {occ.can_assume && !readOnly && occ.assignee_name && (
              <Button size="sm" variant="outline" className="ml-auto h-8 gap-1" onClick={() => void assume()} disabled={assuming}>
                {assuming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hand size={13} />}
                Assumir no lugar
              </Button>
            )}
          </div>
        )}
      </div>
      {/* Ninguém assumiu: chamada clara para quem pode (dev de atendimento, PO, coordenação) e,
          para os demais, quem pode assumir. Assumir define o responsável e inicia as horas úteis. */}
      {!occ.assignee_name && !occ.is_closed && (
        occ.can_assume && !readOnly ? (
          <Notice tone="amber" icon={Hand}>
            <p className="min-w-0 flex-1">
              <span className="font-semibold">Ninguém assumiu esta ocorrência.</span> Ao assumir, você vira o responsável,
              ela vai para <span className="font-medium">Ajustando</span>, as horas úteis começam a contar e o cliente é avisado.
            </p>
            <Button size="sm" className="gap-1.5" onClick={() => void assume()} disabled={assuming}>
              {assuming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hand size={14} />}
              Assumir
            </Button>
          </Notice>
        ) : (
          <Notice tone="slate" icon={Users}>
            <p className="min-w-0 flex-1">
              Ninguém assumiu ainda. Podem assumir:{" "}
              <span className="font-medium text-foreground">
                {[
                  ...(occ.assisted_ops_dev_names ?? []),
                  ...(occ.project_po_name ? [`${occ.project_po_name} (PO)`] : []),
                ].join(", ") || "os desenvolvedores de atendimento do projeto e o PO"}
              </span>{" "}
              — e a coordenação.
            </p>
          </Notice>
        )
      )}
      {/* Triagem N1 (POP 8.2.1): quem tria e o resultado. */}
      {occ.stage_key === "triagem_n1" ? (
        <Notice tone="blue" icon={InfoIcon}>
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Em triagem no N1</span> ({occ.n1_names.join(", ") || "responsáveis do Produto e Dono do Processo"}). A TI
            recebe quando o N1 encaminhar pelo Portal.
          </p>
        </Notice>
      ) : occ.n1_outcome ? (
        <p className="text-xs text-muted-foreground">
          Triagem N1: {occ.n1_outcome === "resolvida" ? "resolvida no N1" : "encaminhada à TI"}
          {occ.n1_by_name && <> por <span className="font-medium text-foreground">{occ.n1_by_name}</span></>}
          {occ.n1_at && <> em {new Date(occ.n1_at.endsWith("Z") ? occ.n1_at : `${occ.n1_at}Z`).toLocaleDateString("pt-BR")}</>}.
        </p>
      ) : null}
      {occ.release_project_title && (
        <p className="text-sm">
          Encaminhada para <span className="font-medium">{occ.release_project_title}</span>
          {occ.release_item_title && <> como “{occ.release_item_title}”</>}.
        </p>
      )}
      <Info label="O que aconteceu" value={occ.description} />
      <Info label="Passos para reproduzir" value={occ.passos} />
      <Info label="Resultado esperado" value={occ.esperado} />
      <Info label="Tela / funcionalidade" value={occ.funcionalidade} />
      {(occ.anexos?.length ?? 0) > 0 && (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Anexos enviados na abertura</div>
          <AttachmentField value={occ.anexos as Attachment[]} onChange={() => {}} disabled />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Criticidade</Label>
          {isCorrection ? (
            <Select value={prioridade} onValueChange={(v) => setPrioridade(v as OccurrencePrioridade)} disabled={readOnly}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["P1", "P2", "P3", "P4"] as const).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]} · prazo-alvo {SLA_RESOLUCAO_HORAS[p]} h úteis
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="flex h-8 items-center text-xs text-muted-foreground">
              Não se aplica: só correção tem criticidade (POP).
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Classificação do time</Label>
          <Select value={classificacao} onValueChange={setClassificacao} disabled={readOnly}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Não classificada</SelectItem>
              {(Object.keys(OCCURRENCE_CLASSIFICACAO_LABEL) as OccurrenceClassificacao[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {OCCURRENCE_CLASSIFICACAO_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {classificacao === "melhoria" && (
            <p className="text-xs text-muted-foreground">Mova o card para “Melhoria – Análise PO”.</p>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Solução aplicada (visível ao cliente){isCorrection && <span className="text-destructive"> *</span>}</Label>
        <Textarea rows={2} value={solucao} onChange={(e) => setSolucao(e.target.value)} disabled={readOnly} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Causa raiz (interna){isCorrection && <span className="text-destructive"> *</span>}</Label>
        <Textarea rows={2} value={causaRaiz} onChange={(e) => setCausaRaiz(e.target.value)} disabled={readOnly} />
        {isCorrection && (
          <p className="text-xs text-muted-foreground">
            Na correção, solução e causa raiz são obrigatórias antes de enviar para a validação do cliente (POP).
          </p>
        )}
      </div>
      {occ.stage_key === "melhoria_analise" && !readOnly && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm font-semibold">Encaminhar para Release (PO)</p>
          <Select value={releaseId} onValueChange={(v) => { setReleaseId(v); setParentFeatureId(NONE) }}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Projeto de Release" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Escolha o projeto de Release</SelectItem>
              <SelectItem value={NEW_RELEASE}>+ Criar novo projeto</SelectItem>
              {(candidates ?? []).map((c) => (
                <SelectItem key={c.task_id} value={c.task_id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {releaseId === NEW_RELEASE && (
            <Input className="h-8" placeholder="Nome do projeto de Release" value={newReleaseTitle} onChange={(e) => setNewReleaseTitle(e.target.value)} />
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={itemKind === "feature"} onChange={() => setItemKind("feature")} className="accent-primary" />
              Virar Feature
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={itemKind === "user_story"}
                onChange={() => setItemKind("user_story")}
                disabled={releaseId === NEW_RELEASE}
                className="accent-primary"
              />
              Virar User Story
            </label>
          </div>
          {itemKind === "user_story" && releaseId !== NEW_RELEASE && (
            <Select value={parentFeatureId} onValueChange={setParentFeatureId}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Feature" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Escolha a Feature</SelectItem>
                {(selectedRelease?.features ?? []).map((f) => (
                  <SelectItem key={f.task_id} value={f.task_id}>
                    {f.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">O cliente é avisado de que a melhoria não será atendida na Operação Assistida.</p>
          <div className="flex justify-end">
            <Button size="sm" className="gap-1" onClick={() => void forward()} disabled={forwarding}>
              {forwarding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={13} />}
              Encaminhar
            </Button>
          </div>
        </div>
      )}
      {!readOnly && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar ocorrência
          </Button>
        </div>
      )}
    </DrawerSection>
  )
}
