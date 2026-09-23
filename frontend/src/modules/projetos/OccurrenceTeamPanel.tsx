import { useEffect, useState } from "react"
import { Hand, LifeBuoy, Loader2, Send } from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { AttachmentField, type Attachment } from "@/components/AttachmentField"

const NONE = "__none__"

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="whitespace-pre-wrap text-sm">{value}</p>
    </div>
  )
}

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

const NEW_RELEASE = "__new__"

/** Dados da Ocorrência (Operação Assistida) no drawer do card: o que o cliente informou e
 * os campos do time — prioridade, classificação, solução (o cliente vê) e causa raiz. */
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
    <div className="space-y-3 rounded-md border border-teal-500/30 bg-teal-50/40 p-3 dark:bg-teal-950/20">
      <div className="flex items-center gap-2">
        <LifeBuoy size={14} className="text-teal-600" />
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700 dark:text-teal-400">
          Ocorrência {occ.code_label} · Operação Assistida
        </p>
      </div>
      {/* Do projeto, só o essencial para quem atende: nome, PO e produto. */}
      <div className="grid gap-x-4 gap-y-1 rounded-md bg-background/70 px-2 py-1.5 text-xs sm:grid-cols-3">
        <span>Projeto: <span className="font-medium">{occ.project_title ?? "—"}</span></span>
        <span>PO: <span className="font-medium">{occ.project_po_name ?? "—"}</span></span>
        <span>Produto: <span className="font-medium">{occ.product_name ?? "—"}</span></span>
      </div>
      <p className="text-xs text-muted-foreground">
        {occ.opened_by_name && <>Aberta por <span className="font-medium text-foreground">{occ.opened_by_name}</span> · </>}
        {OCCURRENCE_TIPO_LABEL[occ.tipo]} · {OCCURRENCE_IMPACTO_LABEL[occ.impacto]} · {OCCURRENCE_ABRANGENCIA_LABEL[occ.abrangencia]}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-background/70 px-2 py-1.5 text-xs">
        <span>
          Responsável: <span className="font-medium">{occ.assignee_name ?? "ninguém assumiu"}</span>
        </span>
        <span>
          Horas úteis: <span className="font-medium tabular-nums">{occ.worked_hours != null ? `${occ.worked_hours.toFixed(1)}h` : "—"}</span>
        </span>
        {occ.nps_score != null && (
          <span>
            NPS: <span className="font-medium">{occ.nps_score}/10</span>
            {occ.nps_comment && <span className="text-muted-foreground"> — {occ.nps_comment}</span>}
          </span>
        )}
        {occ.rejection_count > 0 && <span className="text-amber-700">Reprovada {occ.rejection_count}x</span>}
        {occ.finalized_by_team && <span className="text-muted-foreground">Finalizada pelo PO</span>}
        {occ.can_assume && !readOnly && (
          <Button size="sm" variant="outline" className="ml-auto h-7 gap-1 text-xs" onClick={() => void assume()} disabled={assuming}>
            {assuming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hand size={12} />}
            {occ.assignee_name ? "Assumir no lugar" : "Assumir"}
          </Button>
        )}
      </div>
      {occ.release_project_title && (
        <p className="text-xs">
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
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Anexos enviados na abertura
          </div>
          <AttachmentField value={occ.anexos as Attachment[]} onChange={() => {}} disabled />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Prioridade</Label>
          <Select value={prioridade} onValueChange={(v) => setPrioridade(v as OccurrencePrioridade)} disabled={readOnly}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["P1", "P2", "P3", "P4"] as const).map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <p className="text-[11px] text-muted-foreground">Mova o card para “Melhoria – Análise PO”.</p>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Solução aplicada (visível ao cliente)</Label>
        <Textarea rows={2} value={solucao} onChange={(e) => setSolucao(e.target.value)} disabled={readOnly} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Causa raiz (interna)</Label>
        <Textarea rows={2} value={causaRaiz} onChange={(e) => setCausaRaiz(e.target.value)} disabled={readOnly} />
      </div>
      {occ.stage_key === "melhoria_analise" && !readOnly && (
        <div className="space-y-2 rounded-md border bg-background/70 p-2">
          <p className="text-xs font-semibold">Encaminhar para Release (PO)</p>
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
          <p className="text-[11px] text-muted-foreground">O cliente é avisado de que a melhoria não será atendida na Operação Assistida.</p>
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
    </div>
  )
}
