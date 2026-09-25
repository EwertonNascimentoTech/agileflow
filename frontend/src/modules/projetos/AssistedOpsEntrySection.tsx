import { useEffect, useState } from "react"
import { CalendarClock, ClipboardCheck, Loader2, Pencil } from "lucide-react"

import { teamOccurrencesApi, type AssistedOpsEntryState } from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"

/** O backend responde 428 com este código quando o projeto vai para a Operação Assistida sem
 *  os pré-requisitos do POP.COR.GTD.003 (5) confirmados. */
export const ASSISTED_OPS_PREREQS_REQUIRED = "assisted_ops_prereqs_required"

export function isAssistedOpsPrereqsRequired(err: unknown): boolean {
  const r = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response
  const d = r?.data?.detail as { code?: string } | undefined
  return r?.status === 428 && typeof d === "object" && d?.code === ASSISTED_OPS_PREREQS_REQUIRED
}

type Mark = "sim" | "na"

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

/** "2026-10-09" → "09/10/2026" sem passar por Date (fuso não mexe no dia). */
function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

function isoDay(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function marksOf(state: AssistedOpsEntryState): Record<string, Mark> {
  return Object.fromEntries(state.items.filter((i) => i.value).map((i) => [i.key, i.value as Mark]))
}

/** Checklist editável: cada pré-requisito fica "feito" ou, quando o POP permite, "não se aplica". */
function ChecklistEditor({
  state, marks, onChange, disabled,
}: {
  state: AssistedOpsEntryState
  marks: Record<string, Mark>
  onChange: (next: Record<string, Mark>) => void
  disabled?: boolean
}) {
  function toggle(key: string, value: Mark) {
    const next = { ...marks }
    if (next[key] === value) delete next[key]
    else next[key] = value
    onChange(next)
  }
  return (
    <div className="divide-y rounded-md border bg-background">
      {state.items.map((item) => (
        <div key={item.key} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm">
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={marks[item.key] === "sim"}
              onChange={() => toggle(item.key, "sim")}
              disabled={disabled}
            />
            <span className={marks[item.key] === "na" ? "text-muted-foreground line-through" : ""}>{item.label}</span>
          </label>
          {item.allow_na && (
            <button
              type="button"
              onClick={() => toggle(item.key, "na")}
              disabled={disabled}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                marks[item.key] === "na" ? "border-slate-400 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Não se aplica
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/** Preparação e prazo da Operação Assistida no drawer do projeto: pré-requisitos do POP,
 *  fim previsto (até 15 dias) e prorrogações com justificativa. Sem nada preenchido e fora da
 *  raia, não aparece — o checklist é pedido no modal ao mover o projeto. */
export function AssistedOpsEntrySection({
  projectTaskId, readOnly, refreshKey = 0,
}: {
  projectTaskId: string
  readOnly: boolean
  refreshKey?: number
}) {
  const [state, setState] = useState<AssistedOpsEntryState | null>(null)
  const [editing, setEditing] = useState(false)
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [saving, setSaving] = useState(false)
  const [extending, setExtending] = useState(false)
  const [newDate, setNewDate] = useState("")
  const [reason, setReason] = useState("")

  useEffect(() => {
    teamOccurrencesApi.entry(projectTaskId).then(setState).catch(() => setState(null))
  }, [projectTaskId, refreshKey])

  if (!state) return null
  const filled = state.items.filter((i) => i.value).length
  if (!state.entered_at && filled === 0 && !state.due_date) return null
  const canManage = state.can_manage && !readOnly
  // Projeto que entrou na raia antes do POP (sem data): a primeira data é definição, não prorrogação.
  const firstDue = !state.due_date

  async function saveChecklist() {
    setSaving(true)
    try {
      setState(await teamOccurrencesApi.setEntry(projectTaskId, { checklist: marks }))
      setEditing(false)
      toast.success("Pré-requisitos atualizados.")
    } catch (err) {
      toast.error(apiError(err, "Não foi possível salvar."))
    } finally {
      setSaving(false)
    }
  }

  async function extend() {
    if (!state) return
    if (!newDate) return toast.error("Escolha a nova data.")
    if (!firstDue && reason.trim().length < 10) return toast.error("Explique o motivo da prorrogação (mín. 10 caracteres).")
    setSaving(true)
    try {
      setState(
        firstDue
          ? await teamOccurrencesApi.setEntry(projectTaskId, { checklist: marksOf(state), due_date: newDate })
          : await teamOccurrencesApi.extend(projectTaskId, { new_due_date: newDate, reason: reason.trim() }),
      )
      setExtending(false)
      setReason("")
      toast.success(firstDue ? "Fim previsto definido." : "Operação Assistida prorrogada.")
    } catch (err) {
      toast.error(apiError(err, "Não foi possível prorrogar."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-teal-500/30 bg-teal-50/40 p-3 dark:bg-teal-950/20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={14} className="text-teal-600" />
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700 dark:text-teal-400">
            Operação Assistida · preparação e prazo
          </p>
        </div>
        {canManage && !editing && !extending && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { setMarks(marksOf(state)); setEditing(true) }}>
              <Pencil size={12} /> Pré-requisitos
            </Button>
            {state.entered_at && (
              <Button
                variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                onClick={() => { setNewDate(""); setReason(""); setExtending(true) }}
              >
                <CalendarClock size={12} /> {firstDue ? "Definir fim previsto" : "Prorrogar"}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-background/70 px-2 py-1.5 text-xs">
        <span>
          Pré-requisitos:{" "}
          <span className={`font-medium ${state.complete ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300"}`}>
            {state.complete ? "todos confirmados" : `${filled} de ${state.items.length}`}
          </span>
        </span>
        {state.entered_at && <span>Em Operação Assistida desde <span className="font-medium">{fmtDay(state.entered_at)}</span></span>}
        <span>
          Fim previsto: <span className="font-medium">{fmtDay(state.due_date)}</span>
          {state.overdue && <span className="ml-1 font-semibold text-red-700 dark:text-red-400">· vencido</span>}
        </span>
        {state.extensions.length > 0 && <span>{state.extensions.length} prorrogação(ões)</span>}
      </div>

      {editing && (
        <div className="space-y-2">
          <ChecklistEditor state={state} marks={marks} onChange={setMarks} disabled={saving} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={() => void saveChecklist()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      )}

      {extending && (
        <div className="space-y-2 rounded-md border bg-background p-2">
          <p className="text-xs text-muted-foreground">
            {firstDue
              ? `O POP prevê até ${state.max_days} dias de Operação Assistida.`
              : `O POP prevê até ${state.max_days} dias; a prorrogação precisa de justificativa e fica registrada no card.`}
          </p>
          <div className={`grid gap-2 ${firstDue ? "" : "sm:grid-cols-[10rem_1fr]"}`}>
            <div className="space-y-1">
              <Label className="text-xs">{firstDue ? "Fim previsto" : "Nova data"}</Label>
              <Input
                type="date" className="h-8 w-40" value={newDate} min={state.due_date ?? isoDay()}
                max={firstDue ? isoDay(state.max_days) : undefined}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
            {!firstDue && (
              <div className="space-y-1">
                <Label className="text-xs">Justificativa</Label>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por que a operação precisa de mais tempo?" />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setExtending(false)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={() => void extend()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {firstDue ? "Salvar" : "Prorrogar"}
            </Button>
          </div>
        </div>
      )}

      {!editing && state.extensions.length > 0 && (
        <ul className="space-y-1 text-xs">
          {state.extensions.map((x, i) => (
            <li key={i} className="rounded-md bg-background/70 px-2 py-1">
              <span className="font-medium">{x.from ? `${fmtDay(x.from)} → ` : ""}{fmtDay(x.to)}</span>
              {x.by && <span className="text-muted-foreground"> · {x.by}</span>}
              <span className="block text-muted-foreground">{x.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Modal ao mover o projeto para a Operação Assistida sem os pré-requisitos do POP: o PO do
 *  projeto ou a coordenação confirma o checklist e o fim previsto e o movimento é reenviado. */
export function AssistedOpsPrereqsDialog({
  open, projectTaskId, projectTitle, onCancel, onSaved,
}: {
  open: boolean
  projectTaskId: string | null
  projectTitle?: string
  onCancel: () => void
  onSaved: () => void
}) {
  const [state, setState] = useState<AssistedOpsEntryState | null>(null)
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [due, setDue] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !projectTaskId) return
    setState(null)
    teamOccurrencesApi
      .entry(projectTaskId)
      .then((st) => {
        setState(st)
        setMarks(marksOf(st))
        setDue(st.due_date ?? isoDay(st.max_days))
      })
      .catch(() => setState(null))
  }, [open, projectTaskId])

  const missing = state ? state.items.filter((i) => !marks[i.key]) : []

  async function save() {
    if (!projectTaskId || !state) return
    if (missing.length) return toast.error("Confirme todos os pré-requisitos (ou marque “não se aplica” onde o POP permite).")
    setSaving(true)
    try {
      await teamOccurrencesApi.setEntry(projectTaskId, { checklist: marks, due_date: due || null })
      onSaved()
    } catch (err) {
      toast.error(apiError(err, "Não foi possível salvar."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Operação Assistida · pré-requisitos</DialogTitle>
          <DialogDescription>
            Pelo POP.COR.GTD.003, {projectTitle ? <strong>{projectTitle}</strong> : "o projeto"} só entra em Operação Assistida
            com estes itens confirmados. O card só entra na raia depois de salvar.
          </DialogDescription>
        </DialogHeader>
        {!state ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : state.can_manage ? (
          <div className="space-y-3">
            <ChecklistEditor state={state} marks={marks} onChange={setMarks} disabled={saving} />
            <div className="space-y-1">
              <Label className="text-xs">Fim previsto da Operação Assistida</Label>
              <Input
                type="date" className="h-9 w-44" value={due} min={isoDay()} max={isoDay(state.max_days)}
                onChange={(e) => setDue(e.target.value)} disabled={saving || (!!state.entered_at && !!state.due_date)}
              />
              <p className="text-[11px] text-muted-foreground">
                Até {state.max_days} dias a partir de hoje. Depois de entrar na raia, mudar a data é prorrogação, com justificativa.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
              <Button onClick={() => void save()} disabled={saving || missing.length > 0}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar e mover
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Faltam {missing.length} de {state.items.length} pré-requisitos. Só o PO do projeto ou a coordenação confirmam a
              preparação da Operação Assistida — peça a um deles antes de mover o projeto.
            </p>
            <DialogFooter>
              <Button onClick={onCancel}>Entendi</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
