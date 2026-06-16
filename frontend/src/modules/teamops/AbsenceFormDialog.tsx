import { useEffect, useState } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { teamopsApi, type AbsenceType, type Person } from "@/api/teamops"

const NONE = "__none__"

interface Props {
  /** Quando fornecido, a ausência é sempre desta pessoa e o seletor de pessoa é ocultado. */
  personId?: string
  onClose: () => void
  onSaved: () => void
}

/**
 * Diálogo único para registrar ausência. Usado tanto na página de Ausências
 * (com seletor de pessoa) quanto na ficha da pessoa (pessoa fixa).
 */
export function AbsenceFormDialog({ personId, onClose, onSaved }: Props) {
  const [people, setPeople] = useState<Person[]>([])
  const [types, setTypes] = useState<AbsenceType[]>([])
  const [selectedPerson, setSelectedPerson] = useState<string>(personId ?? NONE)
  const [typeId, setTypeId] = useState<string>(NONE)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!personId) teamopsApi.listPersons().then(setPeople).catch(() => null)
    teamopsApi.listAbsenceTypes(true).then(setTypes).catch(() => null)
  }, [personId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const pid = personId ?? selectedPerson
    if (pid === NONE || typeId === NONE || !start || !end) return
    setSaving(true)
    setError(null)
    try {
      await teamopsApi.createAbsence({
        person_id: pid,
        absence_type_id: typeId,
        start_date: start,
        end_date: end,
        notes: notes || undefined,
      })
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar ausência</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Férias e afastamento médico atualizam automaticamente o status da pessoa quando o período inclui hoje.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!personId && (
            <div>
              <Label>Pessoa *</Label>
              <Select value={selectedPerson} onValueChange={setSelectedPerson}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Tipo *</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início *</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div>
              <Label>Fim *</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
