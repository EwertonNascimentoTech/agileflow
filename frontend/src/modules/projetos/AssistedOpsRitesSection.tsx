import { useEffect, useState } from "react"
import { Loader2, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react"

import {
  ASSISTED_OP_MEETING_KIND_LABEL,
  teamOccurrencesApi,
  type AssistedOpMeeting,
  type AssistedOpMeetingKind,
  type AssistedOpsEntryState,
} from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Cadência do POP (8.3.5) por fase. */
const CADENCE: Record<number, string> = {
  1: "Fase 1: rito diário dos incidentes críticos e semanal de chamados, indicadores e ajustes.",
  2: "Fase 2: rito semanal de chamados, indicadores e ajustes.",
  3: "Fase 3: monitoramento final dos indicadores e validação dos critérios de saída.",
}

type Draft = { id: string | null; kind: AssistedOpMeetingKind; held_on: string; participants: string; summary: string; decisions: string }

const EMPTY = (kind: AssistedOpMeetingKind): Draft => ({ id: null, kind, held_on: today(), participants: "", summary: "", decisions: "" })

/** Ritos da Operação Assistida (POP 8.3.2 e 8.3.5): atas das reuniões diárias, semanais e do
 *  comitê, registradas no card do projeto pelo PO, pela coordenação e pelos devs de atendimento.
 *  Só aparece depois que o projeto entrou na raia (ou se já há atas). */
export function AssistedOpsRitesSection({
  projectTaskId, readOnly, refreshKey = 0,
}: {
  projectTaskId: string
  readOnly: boolean
  refreshKey?: number
}) {
  const [entry, setEntry] = useState<AssistedOpsEntryState | null>(null)
  const [meetings, setMeetings] = useState<AssistedOpMeeting[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    teamOccurrencesApi.entry(projectTaskId).then(setEntry).catch(() => setEntry(null))
    teamOccurrencesApi.meetings(projectTaskId).then(setMeetings).catch(() => setMeetings([]))
  }, [projectTaskId, refreshKey])

  if (!entry || (!entry.entered_at && meetings.length === 0)) return null
  const canRecord = entry.can_record && !readOnly && !!entry.entered_at
  const last = (kind: AssistedOpMeetingKind) => meetings.find((m) => m.kind === kind)?.held_on ?? null

  async function save() {
    if (!draft) return
    if (draft.summary.trim().length < 10) return toast.error("Escreva a ata (mín. 10 caracteres).")
    setSaving(true)
    try {
      const body = {
        kind: draft.kind,
        held_on: draft.held_on,
        participants: draft.participants.trim() || null,
        summary: draft.summary.trim(),
        decisions: draft.decisions.trim() || null,
      }
      if (draft.id) {
        const saved = await teamOccurrencesApi.updateMeeting(projectTaskId, draft.id, body)
        setMeetings((cur) => cur.map((m) => (m.id === saved.id ? saved : m)))
      } else {
        const saved = await teamOccurrencesApi.createMeeting(projectTaskId, body)
        setMeetings((cur) => [saved, ...cur].sort((a, b) => b.held_on.localeCompare(a.held_on)))
      }
      setDraft(null)
      toast.success("Ata registrada.")
    } catch (err) {
      toast.error(apiError(err, "Não foi possível salvar a ata."))
    } finally {
      setSaving(false)
    }
  }

  async function remove(m: AssistedOpMeeting) {
    if (!window.confirm(`Excluir a ata ${m.kind_label.toLowerCase()} de ${fmtDay(m.held_on)}?`)) return
    try {
      await teamOccurrencesApi.deleteMeeting(projectTaskId, m.id)
      setMeetings((cur) => cur.filter((x) => x.id !== m.id))
    } catch (err) {
      toast.error(apiError(err, "Não foi possível excluir a ata."))
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-teal-500/30 bg-teal-50/40 p-3 dark:bg-teal-950/20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <NotebookPen size={14} className="text-teal-600" />
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700 dark:text-teal-400">
            Operação Assistida · ritos e atas
          </p>
        </div>
        {canRecord && !draft && (
          <Button
            variant="ghost" size="sm" className="h-7 gap-1 text-xs"
            onClick={() => setDraft(EMPTY(entry.phase === 1 ? "diaria" : "semanal"))}
          >
            <Plus size={12} /> Registrar ata
          </Button>
        )}
      </div>

      <div className="space-y-0.5 rounded-md bg-background/70 px-2 py-1.5 text-xs">
        {entry.phase && <p>{CADENCE[entry.phase]} Comitê sob demanda, para escalonamento à Instância Executiva.</p>}
        <p className="text-muted-foreground">
          Última diária: <span className="font-medium text-foreground">{fmtDay(last("diaria"))}</span> · última semanal:{" "}
          <span className="font-medium text-foreground">{fmtDay(last("semanal"))}</span> · comitês: {meetings.filter((m) => m.kind === "comite").length}
        </p>
      </div>

      {draft && (
        <div className="space-y-2 rounded-md border bg-background p-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <div className="space-y-1">
              <Label className="text-xs">Rito</Label>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(ASSISTED_OP_MEETING_KIND_LABEL) as AssistedOpMeetingKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDraft({ ...draft, kind: k })}
                    aria-pressed={draft.kind === k}
                    className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      draft.kind === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {ASSISTED_OP_MEETING_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data</Label>
              <Input
                type="date" className="h-8" value={draft.held_on} max={today()}
                onChange={(e) => setDraft({ ...draft, held_on: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Participantes</Label>
            <Input
              className="h-8" value={draft.participants} placeholder="Ex.: Dono do Processo, EP, TD"
              onChange={(e) => setDraft({ ...draft, participants: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ata</Label>
            <Textarea
              rows={4} value={draft.summary}
              placeholder="Chamados e incidentes revisados, indicadores, desvios entre o processo desenhado e o executado…"
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Decisões e encaminhamentos</Label>
            <Textarea rows={2} value={draft.decisions} onChange={(e) => setDraft({ ...draft, decisions: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}

      {meetings.length === 0 ? (
        !draft && <p className="text-xs text-muted-foreground">Nenhuma ata registrada ainda.</p>
      ) : (
        <ul className="space-y-1.5">
          {meetings.map((m) => (
            <li key={m.id} className="rounded-md bg-background px-2 py-1.5 text-xs shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="flex flex-1 flex-wrap items-center gap-2 text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
                  <span className="rounded bg-teal-100 px-1.5 py-0.5 font-semibold text-teal-800 dark:bg-teal-900/50 dark:text-teal-200">{m.kind_label}</span>
                  <span className="font-medium">{fmtDay(m.held_on)}</span>
                  {m.phase && <span className="text-muted-foreground">Fase {m.phase}</span>}
                  {m.created_by_name && <span className="text-muted-foreground">· {m.created_by_name}</span>}
                </button>
                {m.can_edit && !readOnly && (
                  <span className="flex gap-0.5">
                    <Button
                      variant="ghost" size="icon" className="h-6 w-6" title="Editar"
                      onClick={() => setDraft({
                        id: m.id, kind: m.kind, held_on: m.held_on, participants: m.participants ?? "",
                        summary: m.summary, decisions: m.decisions ?? "",
                      })}
                    >
                      <Pencil size={12} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" title="Excluir" onClick={() => void remove(m)}>
                      <Trash2 size={12} />
                    </Button>
                  </span>
                )}
              </div>
              <p className={`mt-1 whitespace-pre-wrap ${open === m.id ? "" : "line-clamp-2"}`}>{m.summary}</p>
              {open === m.id && (
                <>
                  {m.participants && <p className="mt-1 text-muted-foreground">Participantes: {m.participants}</p>}
                  {m.decisions && (
                    <p className="mt-1 whitespace-pre-wrap">
                      <span className="font-semibold">Decisões:</span> {m.decisions}
                    </p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
