import { useEffect, useMemo, useState } from "react"
import { Check, X, Plus, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  teamopsApi,
  ABSENCE_STATUS_LABELS,
  type Absence,
  type AbsenceCalendar,
  type AbsenceType,
  type Person,
} from "@/api/teamops"

const NONE = "__none__"

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function addMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default function AbsencesPage() {
  const [creating, setCreating] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const triggerRefresh = () => setRefreshTick((t) => t + 1)

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ausências e férias</h1>
          <p className="text-sm text-muted-foreground">
            Calendário, listagem e aprovações pendentes.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> Registrar ausência
        </Button>
      </header>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendário</TabsTrigger>
          <TabsTrigger value="list">Lista</TabsTrigger>
          <TabsTrigger value="approvals">Aprovações pendentes</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <CalendarView key={`cal-${refreshTick}`} />
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <ListView key={`list-${refreshTick}`} onChange={triggerRefresh} />
        </TabsContent>

        <TabsContent value="approvals" className="mt-4">
          <ApprovalsView key={`appr-${refreshTick}`} onChange={triggerRefresh} />
        </TabsContent>
      </Tabs>

      {creating && (
        <CreateAbsenceDialog
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); triggerRefresh() }}
        />
      )}
    </div>
  )
}

function CalendarView() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState<AbsenceCalendar | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    teamopsApi.getAbsenceCalendar(month).then(setData).finally(() => setLoading(false))
  }, [month])

  const today = ymd(new Date())
  const weekdays = ["D", "S", "T", "Q", "Q", "S", "S"]

  // Calcula offset do primeiro dia
  const firstWeekday = useMemo(() => {
    const [y, m] = month.split("-").map(Number)
    return new Date(y, m - 1, 1).getDay()
  }, [month])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">
          {new Date(month + "-01").toLocaleString("pt-BR", { month: "long", year: "numeric" })}
        </CardTitle>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setMonth(addMonth(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(currentMonth())}>Hoje</Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(addMonth(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <Skeleton className="h-96" />
        ) : (
          <>
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
              {weekdays.map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {data.days.map((d) => {
                const isToday = d.day === today
                const count = d.absences.length
                const hasConflict = d.conflict_flags.length > 0
                return (
                  <div
                    key={d.day}
                    className={
                      "min-h-[64px] rounded-md border p-1 text-xs " +
                      (isToday ? "border-primary bg-primary/5 " : "") +
                      (hasConflict ? "bg-amber-50 dark:bg-amber-950/30 " : "")
                    }
                    title={d.absences.map((a) => a.person?.full_name).join(", ")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{Number(d.day.slice(-2))}</span>
                      {count > 0 && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{count}</Badge>}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {d.absences.slice(0, 2).map((a) => (
                        <div
                          key={a.id}
                          className="truncate rounded px-1 text-[10px]"
                          style={{ background: a.absence_type?.color ?? "#8B5CF6", color: "white" }}
                        >
                          {a.person?.full_name?.split(" ")[0]}
                        </div>
                      ))}
                      {count > 2 && (
                        <div className="text-[10px] text-muted-foreground">+{count - 2}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ListView({ onChange }: { onChange: () => void }) {
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    teamopsApi.listAbsences().then(setAbsences).finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton className="h-96" />
  if (absences.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
      Nenhuma ausência registrada.
    </CardContent></Card>
  }
  return (
    <Card><CardContent className="p-0">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Pessoa</th>
            <th className="px-4 py-2 text-left">Tipo</th>
            <th className="px-4 py-2 text-left">Período</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {absences.map((a) => (
            <tr key={a.id} className="border-t">
              <td className="px-4 py-2 font-medium">{a.person?.full_name ?? "—"}</td>
              <td className="px-4 py-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: a.absence_type?.color }} />{" "}
                {a.absence_type?.name}
              </td>
              <td className="px-4 py-2">{a.start_date} → {a.end_date}</td>
              <td className="px-4 py-2">
                <Badge variant={a.status === "aprovada" ? "success" : a.status === "recusada" ? "destructive" : "secondary"}>
                  {ABSENCE_STATUS_LABELS[a.status]}
                </Badge>
              </td>
              <td className="px-4 py-2 text-right">
                <Button
                  variant="ghost" size="sm"
                  onClick={async () => {
                    if (!confirm("Remover esta ausência?")) return
                    await teamopsApi.deleteAbsence(a.id)
                    onChange()
                  }}
                >Remover</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent></Card>
  )
}

function ApprovalsView({ onChange }: { onChange: () => void }) {
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    const all = await teamopsApi.listAbsences({ status: "pendente" })
    setAbsences(all)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  if (loading) return <Skeleton className="h-64" />
  if (absences.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
      Nenhuma aprovação pendente. ✨
    </CardContent></Card>
  }
  return (
    <div className="space-y-3">
      {absences.map((a) => (
        <Card key={a.id}>
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex-1">
              <p className="font-medium">{a.person?.full_name}</p>
              <p className="text-sm text-muted-foreground">
                {a.absence_type?.name} · {a.start_date} → {a.end_date}
              </p>
              {a.notes && <p className="mt-1 text-xs text-muted-foreground">{a.notes}</p>}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm" variant="outline"
                onClick={async () => {
                  await teamopsApi.rejectAbsence(a.id)
                  refresh()
                  onChange()
                }}
              >
                <X className="mr-1 h-4 w-4" /> Recusar
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  await teamopsApi.approveAbsence(a.id)
                  refresh()
                  onChange()
                }}
              >
                <Check className="mr-1 h-4 w-4" /> Aprovar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function CreateAbsenceDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [people, setPeople] = useState<Person[]>([])
  const [types, setTypes] = useState<AbsenceType[]>([])
  const [personId, setPersonId] = useState<string>(NONE)
  const [typeId, setTypeId] = useState<string>(NONE)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    teamopsApi.listPersons().then(setPeople)
    teamopsApi.listAbsenceTypes(true).then(setTypes)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (personId === NONE || typeId === NONE) return
    setSaving(true)
    setError(null)
    try {
      await teamopsApi.createAbsence({
        person_id: personId,
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
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Pessoa *</Label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
