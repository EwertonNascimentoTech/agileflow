import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  teamopsApi,
  EMPLOYMENT_TYPE_LABELS,
  PERSON_STATUS_LABELS,
  type Area,
  type EmploymentType,
  type Person,
  type PersonStatus,
  type Position,
} from "@/api/teamops"

const NONE = "__none__"

interface Props {
  person: Person | null
  areas: Area[]
  onClose: () => void
  onSaved: () => void
}

export function PersonFormDialog({ person, areas, onClose, onSaved }: Props) {
  const isEdit = !!person
  const [allPersons, setAllPersons] = useState<Person[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState(person?.full_name ?? "")
  const [email, setEmail] = useState(person?.email ?? "")
  const [phone, setPhone] = useState(person?.phone ?? "")
  const [positionId, setPositionId] = useState<string>(person?.position_id ?? "")
  const [areaId, setAreaId] = useState<string>(person?.area_id ?? NONE)
  const [poPersonId, setPoPersonId] = useState<string>(person?.po_person_id ?? NONE)
  const [techRefId, setTechRefId] = useState<string>(person?.tech_reference_person_id ?? NONE)
  const [managerId, setManagerId] = useState<string>(person?.manager_person_id ?? NONE)
  const [employmentType, setEmploymentType] = useState<EmploymentType>(person?.employment_type ?? "clt")
  const [dailyHours, setDailyHours] = useState<string>(String(person?.daily_hours ?? 8))
  const [weeklyHours, setWeeklyHours] = useState<string>(String(person?.weekly_hours ?? 40))
  const [startDate, setStartDate] = useState<string>(person?.start_date ?? "")
  const [status, setStatus] = useState<PersonStatus>(person?.status ?? "ativo")
  const [notes, setNotes] = useState<string>(person?.notes ?? "")

  useEffect(() => {
    teamopsApi.listPersons().then(setAllPersons).catch(() => null)
    teamopsApi.listPositions(true).then((items) => {
      setPositions(items)
      if (!isEdit && !positionId) {
        // default: primeiro cargo "Dev Fullstack" se existir, senão o primeiro da lista
        const def = items.find((p) => p.slug === "dev_fullstack") ?? items[0]
        if (def) setPositionId(def.id)
      }
    }).catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (!positionId) {
        setError("Selecione um cargo.")
        setSaving(false)
        return
      }
      const payload: any = {
        full_name: fullName,
        email,
        phone: phone || null,
        position_id: positionId,
        area_id: areaId === NONE ? null : areaId,
        po_person_id: poPersonId === NONE ? null : poPersonId,
        tech_reference_person_id: techRefId === NONE ? null : techRefId,
        manager_person_id: managerId === NONE ? null : managerId,
        employment_type: employmentType,
        daily_hours: Number(dailyHours),
        weekly_hours: Number(weeklyHours),
        start_date: startDate || null,
        status,
        notes: notes || null,
      }
      if (isEdit) {
        await teamopsApi.updatePerson(person!.id, payload)
      } else {
        await teamopsApi.createPerson(payload)
      }
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  const otherPersons = allPersons.filter((p) => p.id !== person?.id)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar pessoa" : "Nova pessoa"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nome completo *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} />
          </div>
          <div>
            <Label>E-mail *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>Cargo *</Label>
            <Select value={positionId} onValueChange={setPositionId}>
              <SelectTrigger><SelectValue placeholder="Selecione um cargo…" /></SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Área</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem área</SelectItem>
                {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>PO vinculado</Label>
            <Select value={poPersonId} onValueChange={setPoPersonId}>
              <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem PO</SelectItem>
                {otherPersons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Referência técnica</Label>
            <Select value={techRefId} onValueChange={setTechRefId}>
              <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem referência</SelectItem>
                {otherPersons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Superior imediato</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem superior</SelectItem>
                {otherPersons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vínculo</Label>
            <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as EmploymentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as PersonStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PERSON_STATUS_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Horas/dia</Label>
            <Input type="number" min={0} max={24} step="0.5" value={dailyHours} onChange={(e) => setDailyHours(e.target.value)} />
          </div>
          <div>
            <Label>Horas/semana</Label>
            <Input type="number" min={0} max={168} step="0.5" value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} />
          </div>
          <div>
            <Label>Data de entrada</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          {error && (
            <p className="md:col-span-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="md:col-span-2 justify-between sm:justify-between">
            {isEdit ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={async () => {
                  if (!confirm(`Excluir permanentemente "${person!.full_name}"?\n\nEsta ação remove a pessoa do sistema e desfaz seus vínculos no organograma. Ausências e stacks vinculadas também serão removidas.`)) return
                  setSaving(true)
                  setError(null)
                  try {
                    await teamopsApi.deletePerson(person!.id)
                    onSaved()
                  } catch (err: any) {
                    setError(err?.response?.data?.detail ?? "Erro ao excluir.")
                    setSaving(false)
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
