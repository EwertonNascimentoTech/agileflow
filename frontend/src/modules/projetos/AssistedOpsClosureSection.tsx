import { useEffect, useState } from "react"
import { CheckCircle2, FileCheck2, Loader2, Send, ShieldCheck, Sparkles, XCircle } from "lucide-react"

import {
  teamOccurrencesApi,
  type AssistedOpsClosureInput,
  type AssistedOpsClosureState,
  type AssistedOpsEntryState,
} from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).toLocaleDateString("pt-BR")
}

function toInput(s: AssistedOpsClosureState): AssistedOpsClosureInput {
  return {
    criterios: Object.fromEntries(s.criterios.map((c) => [c.key, c.done])),
    decisao_estrategica: s.decisao_estrategica,
    decisao_texto: s.decisao_texto,
    analise: Object.fromEntries(s.analise.map((a) => [a.key, a.text ?? ""])),
  }
}

const ACEITE_LABEL: Record<string, string> = { pendente: "aguardando o Dono do Processo", aceito: "aceito", recusado: "recusado" }

/** Encerramento formal da Operação Assistida no card do projeto (POP 8.4 e 8.5): critérios de
 *  saída (ou decisão estratégica), análise crítica e lições aprendidas (com rascunho gerado das
 *  ocorrências e atas) e o aceite do Dono do Processo no Portal. Sem isso o projeto não vai a Concluído. */
export function AssistedOpsClosureSection({
  projectTaskId, readOnly, refreshKey = 0,
}: {
  projectTaskId: string
  readOnly: boolean
  refreshKey?: number
}) {
  const [entry, setEntry] = useState<AssistedOpsEntryState | null>(null)
  const [state, setState] = useState<AssistedOpsClosureState | null>(null)
  const [form, setForm] = useState<AssistedOpsClosureInput | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [overrideText, setOverrideText] = useState<string | null>(null)

  useEffect(() => {
    teamOccurrencesApi.entry(projectTaskId).then(setEntry).catch(() => setEntry(null))
    teamOccurrencesApi.closure(projectTaskId).then((s) => { setState(s); setForm(toInput(s)) }).catch(() => setState(null))
  }, [projectTaskId, refreshKey])

  if (!entry?.entered_at || !state || !form) return null
  const editable = state.can_manage && !readOnly && !state.concluded

  async function run<T>(key: string, fn: () => Promise<T>, ok: string): Promise<T | undefined> {
    setBusy(key)
    try {
      const out = await fn()
      toast.success(ok)
      return out
    } catch (err) {
      toast.error(apiError(err, "Não foi possível concluir a ação."))
      return undefined
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    const s = await run("save", () => teamOccurrencesApi.saveClosure(projectTaskId, form!), "Encerramento salvo.")
    if (s) { setState(s); setForm(toInput(s)) }
  }

  async function draft() {
    const d = await run("draft", () => teamOccurrencesApi.closureDraft(projectTaskId), "Rascunho gerado nos campos vazios.")
    if (d && form) {
      setForm({ ...form, analise: Object.fromEntries(Object.entries(form.analise).map(([k, v]) => [k, v.trim() ? v : d[k] ?? ""])) })
    }
  }

  async function requestAcceptance() {
    const s = await run("request", () => teamOccurrencesApi.requestAcceptance(projectTaskId), "Pedido de aceite enviado ao Dono do Processo.")
    if (s) setState(s)
  }

  async function override() {
    if ((overrideText ?? "").trim().length < 10) return toast.error("Justifique (mín. 10 caracteres).")
    const s = await run("override", () => teamOccurrencesApi.overrideAcceptance(projectTaskId, overrideText!.trim()), "Aceite registrado.")
    if (s) { setState(s); setOverrideText(null) }
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(toInput(state))

  return (
    <div className="space-y-3 rounded-md border border-teal-500/30 bg-teal-50/40 p-3 dark:bg-teal-950/20">
      <div className="flex items-center gap-2">
        <FileCheck2 size={14} className="text-teal-600" />
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700 dark:text-teal-400">
          Operação Assistida · encerramento (POP)
        </p>
      </div>

      {state.concluded ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 size={14} /> Operação Assistida encerrada.
        </p>
      ) : state.ready ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 size={14} /> Pronto para encerrar: mova o projeto para Concluído.
        </p>
      ) : (
        <div className="rounded-md bg-background/70 px-2 py-1.5 text-xs">
          <p className="font-medium">Para mover o projeto para Concluído, falta:</p>
          <ul className="ml-4 list-disc text-muted-foreground">
            {state.missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-semibold">Critérios de saída (8.4)</p>
        {state.criterios.map((c) => (
          <label key={c.key} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox" className="h-4 w-4 rounded border-input accent-primary"
              checked={!!form.criterios[c.key]} disabled={!editable || form.decisao_estrategica}
              onChange={(e) => setForm({ ...form, criterios: { ...form.criterios, [c.key]: e.target.checked } })}
            />
            {c.label}
          </label>
        ))}
        <p className="text-[11px] text-muted-foreground">Aceite formal das áreas envolvidas: é o aceite do Dono do Processo, abaixo.</p>
        <label className="flex items-center gap-2 pt-1 text-xs">
          <Switch
            checked={form.decisao_estrategica} disabled={!editable}
            onCheckedChange={(v) => setForm({ ...form, decisao_estrategica: v })}
          />
          Decisão estratégica: impossibilidade de estabilização (Instância Executiva)
        </label>
        {form.decisao_estrategica && (
          <Textarea
            rows={2} disabled={!editable} placeholder="Qual foi a decisão da Instância Executiva e quando (comitê)?"
            value={form.decisao_texto ?? ""} onChange={(e) => setForm({ ...form, decisao_texto: e.target.value })}
          />
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">Análise crítica e lições aprendidas (8.5)</p>
          {editable && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => void draft()} disabled={busy !== null}>
              {busy === "draft" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Gerar rascunho
            </Button>
          )}
        </div>
        {state.analise.map((a) => (
          <div key={a.key} className="space-y-1">
            <Label className="text-[11px]">{a.label}</Label>
            <Textarea
              rows={a.key === "incidentes" ? 4 : 2} disabled={!editable}
              value={form.analise[a.key] ?? ""} onChange={(e) => setForm({ ...form, analise: { ...form.analise, [a.key]: e.target.value } })}
            />
          </div>
        ))}
        {editable && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => void save()} disabled={busy !== null || !dirty}>
              {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar encerramento
            </Button>
          </div>
        )}
        {dirty && editable && (state.aceite_status === "pendente" || state.aceite_status === "aceito") && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">Salvar uma mudança invalida o aceite: será preciso pedir de novo.</p>
        )}
      </div>

      {!form.decisao_estrategica && (
        <div className="space-y-1.5 rounded-md bg-background/70 px-2 py-1.5 text-xs">
          <p className="font-semibold">
            Aceite do Dono do Processo:{" "}
            <span className={state.aceite_status === "aceito" || state.override ? "text-emerald-700 dark:text-emerald-400" : state.aceite_status === "recusado" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}>
              {state.override ? "registrado pela coordenação" : state.aceite_status ? ACEITE_LABEL[state.aceite_status] : "não pedido"}
            </span>
          </p>
          {state.aceite_requested_at && (
            <p className="text-muted-foreground">Pedido em {fmtDate(state.aceite_requested_at)}{state.aceite_requested_by && ` por ${state.aceite_requested_by}`}.</p>
          )}
          {state.donos.length === 0 ? (
            <p className="text-muted-foreground">Nenhum Dono do Processo nos Clientes do projeto.</p>
          ) : (
            <ul className="space-y-0.5">
              {state.donos.map((d) => (
                <li key={d.name} className="flex flex-wrap items-center gap-1.5">
                  {d.approved === true ? <CheckCircle2 size={12} className="text-emerald-600" /> : d.approved === false ? <XCircle size={12} className="text-red-600" /> : <ShieldCheck size={12} className="text-muted-foreground" />}
                  <span className="font-medium">{d.name}</span>
                  {!d.has_login && <span className="text-muted-foreground">(ainda não entrou no sistema)</span>}
                  {d.at && <span className="text-muted-foreground">· {fmtDate(d.at)}</span>}
                  {d.comment && <span className="text-muted-foreground">— “{d.comment}”</span>}
                </li>
              ))}
            </ul>
          )}
          {state.override && (
            <p className="text-muted-foreground">Registrado por {state.override.by} em {fmtDate(state.override.at)}: {state.override.justificativa}</p>
          )}
          {!readOnly && !state.concluded && (
            <div className="flex flex-wrap gap-2 pt-1">
              {state.can_manage && state.aceite_status !== "aceito" && !state.override && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => void requestAcceptance()} disabled={busy !== null || dirty}>
                  {busy === "request" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  {state.aceite_status === "pendente" || state.aceite_status === "recusado" ? "Pedir aceite de novo" : "Pedir aceite ao Dono do Processo"}
                </Button>
              )}
              {state.can_override && !state.override && state.aceite_status !== "aceito" && overrideText === null && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOverrideText("")}>
                  Registrar aceite (coordenação)
                </Button>
              )}
            </div>
          )}
          {overrideText !== null && (
            <div className="space-y-1.5 pt-1">
              <Textarea rows={2} placeholder="Como e quando o Dono do Processo deu o aceite (ex.: reunião de encerramento em …)" value={overrideText} onChange={(e) => setOverrideText(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setOverrideText(null)} disabled={busy !== null}>Cancelar</Button>
                <Button size="sm" onClick={() => void override()} disabled={busy !== null}>
                  {busy === "override" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Registrar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
