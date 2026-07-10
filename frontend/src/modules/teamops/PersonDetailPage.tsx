import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Plus, Trash2, Pencil, UserMinus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  teamopsApi,
  PERSON_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  STACK_LEVEL_LABELS,
  ABSENCE_STATUS_LABELS,
  type Absence,
  type AbsenceType,
  type Person,
  type PersonStack,
  type Stack,
  type StackLevel,
} from "@/api/teamops"
import { PersonFormDialog } from "./PersonFormDialog"

export default function PersonDetailPage() {
  const { personId } = useParams<{ personId: string }>()
  const navigate = useNavigate()
  const [person, setPerson] = useState<Person | null>(null)
  const [personStacks, setPersonStacks] = useState<PersonStack[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [showStackDlg, setShowStackDlg] = useState(false)
  const [showAbsenceDlg, setShowAbsenceDlg] = useState(false)
  const [stacks, setStacks] = useState<Stack[]>([])
  const [absenceTypes, setAbsenceTypes] = useState<AbsenceType[]>([])

  async function refresh() {
    if (!personId) return
    setLoading(true)
    try {
      const [p, ps, abs] = await Promise.all([
        teamopsApi.getPerson(personId),
        teamopsApi.listPersonStacks(personId),
        teamopsApi.listAbsences({ person_id: personId }),
      ])
      setPerson(p)
      setPersonStacks(ps)
      setAbsences(abs)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    teamopsApi.listStacks({ active_only: true }).then(setStacks)
    teamopsApi.listAbsenceTypes(true).then(setAbsenceTypes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId])

  if (loading || !person) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/app/modules/teamops/people")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={async () => {
              if (!confirm(`Excluir permanentemente "${person.full_name}"?\n\nEsta ação remove a pessoa do sistema e desfaz seus vínculos no organograma. Ausências e stacks vinculadas também serão removidas.`)) return
              try {
                await teamopsApi.deletePerson(person.id)
                navigate("/app/modules/teamops/people")
              } catch (err: any) {
                alert(err?.response?.data?.detail ?? "Erro ao excluir.")
              }
            }}
          >
            <UserMinus className="mr-2 h-4 w-4" /> Excluir
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1">
            <CardTitle className="text-2xl">{person.full_name}</CardTitle>
            <CardDescription>
              {person.position?.name ?? "—"} · {person.email}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={person.status === "ativo" ? "success" : person.status === "desligado" ? "destructive" : "warning"}>
                {PERSON_STATUS_LABELS[person.status]}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Área</p>
              <p className="font-medium">{person.area?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vínculo</p>
              <p className="font-medium">{EMPLOYMENT_TYPE_LABELS[person.employment_type]}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Carga</p>
              <p className="font-medium">
                {person.daily_hours}h/dia · {person.weekly_hours}h/sem
                {person.project_allocation_pct != null && person.project_allocation_pct < 100 && (
                  <> · {person.project_allocation_pct}% projetos ({Math.round(person.daily_hours * person.project_allocation_pct / 100 * 10) / 10}h/dia)</>
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="org">
        <TabsList>
          <TabsTrigger value="org">Organização</TabsTrigger>
          <TabsTrigger value="stacks">Stacks ({personStacks.length})</TabsTrigger>
          <TabsTrigger value="absences">Ausências ({absences.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="org" className="mt-4">
          <Card>
            <CardContent className="grid gap-4 p-6 md:grid-cols-2">
              <Field label="Cargo" value={person.position?.name} />
              <Field label="Área" value={person.area?.name} />
              <Field label="PO vinculado" value={person.po_person?.full_name} />
              <Field label="Referência técnica" value={person.tech_reference_person?.full_name} />
              <Field label="Superior imediato" value={person.manager_person?.full_name} />
              <Field label="Data de entrada" value={person.start_date ?? null} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stacks" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setShowStackDlg(true)}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar stack
            </Button>
          </div>
          {personStacks.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma stack vinculada. Adicione para mapear competências.
            </CardContent></Card>
          ) : (
            <Card><CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Stack</th>
                    <th className="px-4 py-2 text-left">Nível</th>
                    <th className="px-4 py-2 text-left">Experiência</th>
                    <th className="px-4 py-2 text-left">Referência</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {personStacks.map((ps) => (
                    <tr key={ps.id} className="border-t">
                      <td className="px-4 py-2 font-medium">
                        {ps.stack?.name}
                        {ps.stack?.is_critical && <Badge variant="warning" className="ml-2">Crítica</Badge>}
                      </td>
                      <td className="px-4 py-2">{STACK_LEVEL_LABELS[ps.level]}</td>
                      <td className="px-4 py-2">{ps.years_experience} ano(s)</td>
                      <td className="px-4 py-2">
                        {ps.is_reference ? <Badge variant="success">Sim</Badge> : "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          variant="ghost" size="sm"
                          onClick={async () => {
                            if (!confirm("Remover esta stack da pessoa?")) return
                            await teamopsApi.deletePersonStack(person.id, ps.id)
                            refresh()
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="absences" className="mt-4">
          <div className="mb-3 flex justify-end">
            <Button size="sm" onClick={() => setShowAbsenceDlg(true)}>
              <Plus className="mr-2 h-4 w-4" /> Registrar ausência
            </Button>
          </div>
          {absences.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma ausência registrada.
            </CardContent></Card>
          ) : (
            <Card><CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Tipo</th>
                    <th className="px-4 py-2 text-left">Período</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {absences.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="px-4 py-2">{a.absence_type?.name ?? "—"}</td>
                      <td className="px-4 py-2">{a.start_date} → {a.end_date}</td>
                      <td className="px-4 py-2">
                        <Badge variant={a.status === "aprovada" ? "success" : a.status === "recusada" ? "destructive" : "secondary"}>
                          {ABSENCE_STATUS_LABELS[a.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      {editing && (
        <PersonFormDialog
          person={person}
          areas={[]}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); refresh() }}
        />
      )}

      {showStackDlg && (
        <AddStackDialog
          personId={person.id}
          existingStackIds={personStacks.map((ps) => ps.stack_id)}
          allStacks={stacks}
          onClose={() => setShowStackDlg(false)}
          onSaved={() => { setShowStackDlg(false); refresh() }}
        />
      )}

      {showAbsenceDlg && (
        <AddAbsenceDialog
          personId={person.id}
          absenceTypes={absenceTypes}
          onClose={() => setShowAbsenceDlg(false)}
          onSaved={() => { setShowAbsenceDlg(false); refresh() }}
        />
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? "—"}</p>
    </div>
  )
}

function AddStackDialog({
  personId, existingStackIds, allStacks, onClose, onSaved,
}: {
  personId: string
  existingStackIds: string[]
  allStacks: Stack[]
  onClose: () => void
  onSaved: () => void
}) {
  const [stackId, setStackId] = useState<string>("")
  const [level, setLevel] = useState<StackLevel>("pleno")
  const [years, setYears] = useState<string>("1")
  const [isReference, setIsReference] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const options = useMemo(
    () => allStacks.filter((s) => !existingStackIds.includes(s.id)),
    [allStacks, existingStackIds],
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stackId) return
    setSaving(true)
    setError(null)
    try {
      await teamopsApi.addPersonStack(personId, {
        stack_id: stackId,
        level,
        years_experience: Number(years),
        is_reference: isReference,
      })
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Erro ao adicionar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adicionar stack</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Stack *</Label>
            <Select value={stackId} onValueChange={setStackId}>
              <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
              <SelectContent>
                {options.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}{s.is_critical ? " ⚠️" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nível</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as StackLevel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STACK_LEVEL_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Anos de experiência</Label>
            <Input type="number" min={0} max={80} value={years} onChange={(e) => setYears(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isReference}
              onChange={(e) => setIsReference(e.target.checked)}
            />
            Marcar como referência interna nesta stack
          </label>
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || !stackId}>{saving ? "Salvando…" : "Adicionar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddAbsenceDialog({
  personId, absenceTypes, onClose, onSaved,
}: {
  personId: string
  absenceTypes: AbsenceType[]
  onClose: () => void
  onSaved: () => void
}) {
  const [typeId, setTypeId] = useState<string>("")
  const [start, setStart] = useState<string>("")
  const [end, setEnd] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!typeId || !start || !end) return
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
            <Label>Tipo *</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
              <SelectContent>
                {absenceTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
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
