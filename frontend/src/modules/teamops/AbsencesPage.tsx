import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CalendarDays,
  CalendarOff,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FolderKanban,
  List,
  Plus,
  Users,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import {
  Card, DetailTabs, KpiCount, KpiRow, Notice, PageHeader, Pill, SectionCard, TABLE, type TabDef, type Tone,
} from "@/components/ds"
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
  type AbsenceImpact,
  type AbsenceStatus,
  type AbsenceType,
  type Person,
} from "@/api/teamops"
import { useAuth } from "@/contexts/AuthContext"
import { hasPermission } from "@/lib/permissions"

const NONE = "__none__"

type AbsencesTab = "calendar" | "list" | "approvals" | "impact"

// Selo do status da ausência (Pill do design system do Portal).
const ABSENCE_TONE: Record<AbsenceStatus, Tone> = { aprovada: "emerald", recusada: "red", pendente: "amber", cancelada: "slate" }
const RISK_TONE: Record<"low" | "medium" | "high", Tone> = { high: "red", medium: "amber", low: "slate" }

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// "2026-08" -> Date local no dia 1 (evita o parse UTC de new Date("2026-08-01"),
// que em fusos negativos cai no mes anterior).
function monthStart(month: string): Date {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1)
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

function formatDate(value: string): string {
  const [year, month, day] = value.split("-")
  return `${day}/${month}/${year}`
}

export default function AbsencesPage() {
  const { user } = useAuth()
  const canApprove = hasPermission(user?.permissions, "teamops.absence.approve")
  const [creating, setCreating] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [tab, setTab] = useState<AbsencesTab>("calendar")
  const triggerRefresh = () => setRefreshTick((t) => t + 1)

  const tabs: TabDef<AbsencesTab>[] = [
    { value: "calendar", label: "Calendário", icon: CalendarDays },
    { value: "list", label: "Lista", icon: List },
    ...(canApprove
      ? [
          { value: "approvals" as const, label: "Aprovações pendentes", icon: ClipboardCheck },
          { value: "impact" as const, label: "Análise de impacto", icon: AlertTriangle },
        ]
      : []),
  ]

  return (
    <div className="space-y-5 p-4">
      <PageHeader
        icon={CalendarOff}
        color="#0891B2"
        title="Ausências e férias"
        description="Calendário, listagem e aprovações pendentes."
        actions={
          <Button className="h-10 gap-1.5" onClick={() => setCreating(true)}>
            <Plus size={16} /> Registrar ausência
          </Button>
        }
      />

      <DetailTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "calendar" && <CalendarView key={`cal-${refreshTick}`} />}
      {tab === "list" && <ListView key={`list-${refreshTick}`} onChange={triggerRefresh} />}
      {canApprove && tab === "approvals" && <ApprovalsView key={`appr-${refreshTick}`} onChange={triggerRefresh} />}
      {canApprove && tab === "impact" && <ImpactAnalysisView key={`impact-${refreshTick}`} />}

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
  const firstWeekday = useMemo(() => monthStart(month).getDay(), [month])

  return (
    <SectionCard
      title={<span className="capitalize">{monthStart(month).toLocaleString("pt-BR", { month: "long", year: "numeric" })}</span>}
      icon={CalendarDays}
      subtitle="Ausências pendentes e aprovadas do mês."
      right={
        <div className="flex gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Mês anterior" onClick={() => setMonth(addMonth(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="h-9" onClick={() => setMonth(currentMonth())}>Hoje</Button>
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Próximo mês" onClick={() => setMonth(addMonth(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      {loading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <>
          <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-muted-foreground">
            {weekdays.map((d, i) => <div key={i}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
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
                    "min-h-[76px] rounded-lg border p-1.5 text-xs " +
                    (isToday ? "border-primary bg-primary/5 ring-1 ring-primary/30 " : "bg-background ") +
                    (hasConflict ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 " : "")
                  }
                  title={d.absences.map((a) => a.person?.full_name).join(", ")}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-medium tabular-nums ${isToday ? "text-primary" : ""}`}>{Number(d.day.slice(-2))}</span>
                    {count > 0 && (
                      <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {d.absences.slice(0, 2).map((a) => (
                      <div
                        key={a.id}
                        className="truncate rounded px-1 text-xs leading-4"
                        style={{ background: a.absence_type?.color ?? "#8B5CF6", color: "white" }}
                      >
                        {a.person?.full_name?.split(" ")[0]}
                      </div>
                    ))}
                    {count > 2 && (
                      <div className="text-xs text-muted-foreground">+{count - 2}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Legenda</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border border-primary bg-primary/5" aria-hidden /> Hoje
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" aria-hidden /> Dia com conflito
            </span>
            <span>Cor da etiqueta = tipo de ausência; passe o mouse no dia para ver todos os nomes.</span>
          </div>
        </>
      )}
    </SectionCard>
  )
}

function ListView({ onChange }: { onChange: () => void }) {
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    teamopsApi.listAbsences().then(setAbsences).finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton className="h-96 rounded-2xl" />
  if (absences.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarOff} title="Nenhuma ausência registrada." compact />
      </Card>
    )
  }
  return (
    <SectionCard
      title="Ausências registradas"
      icon={List}
      right={<span className="text-sm tabular-nums text-muted-foreground">{absences.length} registro{absences.length === 1 ? "" : "s"}</span>}
      flush
    >
      <div className={TABLE.wrap}>
        <table className={`${TABLE.table} min-w-[640px]`}>
          <thead className={TABLE.thead}>
            <tr>
              <th className={TABLE.thFirst}>Pessoa</th>
              <th className={TABLE.th}>Tipo</th>
              <th className={TABLE.th}>Período</th>
              <th className={TABLE.th}>Status</th>
              <th className={TABLE.th}><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {absences.map((a) => (
              <tr key={a.id} className={TABLE.tr}>
                <td className={`${TABLE.tdFirst} font-medium`}>{a.person?.full_name ?? "—"}</td>
                <td className={TABLE.td}>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.absence_type?.color }} aria-hidden />
                    {a.absence_type?.name}
                  </span>
                </td>
                <td className={`${TABLE.td} whitespace-nowrap tabular-nums`}>{formatDate(a.start_date)} → {formatDate(a.end_date)}</td>
                <td className={TABLE.td}>
                  <Pill tone={ABSENCE_TONE[a.status]} dot>{ABSENCE_STATUS_LABELS[a.status]}</Pill>
                </td>
                <td className={`${TABLE.td} text-right`}>
                  <Button
                    variant="ghost" size="sm"
                    className="text-muted-foreground hover:text-destructive"
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
      </div>
    </SectionCard>
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

  if (loading) return <Skeleton className="h-64 rounded-2xl" />
  if (absences.length === 0) {
    return (
      <Card>
        <EmptyState icon={CheckCircle2} title="Nenhuma aprovação pendente. ✨" compact />
      </Card>
    )
  }
  return (
    <SectionCard
      title={`Aprovações pendentes (${absences.length})`}
      icon={ClipboardCheck}
      subtitle="Aprove ou recuse cada pedido de ausência."
      flush
    >
      <ul className="divide-y">
        {absences.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/40">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{a.person?.full_name}</p>
              <p className="text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  {a.absence_type?.color && (
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.absence_type.color }} aria-hidden />
                  )}
                  {a.absence_type?.name}
                </span>
                {" "}· <span className="tabular-nums">{formatDate(a.start_date)} → {formatDate(a.end_date)}</span>
              </p>
              {a.notes && <p className="mt-1 text-sm text-muted-foreground">{a.notes}</p>}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline" className="h-9 gap-1.5"
                onClick={async () => {
                  await teamopsApi.rejectAbsence(a.id)
                  refresh()
                  onChange()
                }}
              >
                <X size={15} /> Recusar
              </Button>
              <Button
                className="h-9 gap-1.5"
                onClick={async () => {
                  await teamopsApi.approveAbsence(a.id)
                  refresh()
                  onChange()
                }}
              >
                <Check size={15} /> Aprovar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

function ImpactAnalysisView() {
  const [data, setData] = useState<AbsenceImpact | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    teamopsApi.getAbsenceImpact()
      .then(setData)
      .catch((err) => setError(err?.response?.data?.detail ?? "Não foi possível analisar os impactos."))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton className="h-96 rounded-2xl" />
  if (error) {
    return <Notice tone="red" icon={AlertTriangle}>{error}</Notice>
  }
  if (!data) return null

  const s = data.summary

  return (
    <div className="space-y-4">
      <KpiRow className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiCount icon={Users} value={s.analyzed_absences} label="Ausências analisadas" />
        <KpiCount
          icon={AlertTriangle} value={s.people_at_risk} label="Pessoas em risco"
          tone={s.people_at_risk > 0 ? "red" : "slate"} highlight={s.people_at_risk > 0}
        />
        <KpiCount icon={Users} value={s.team_conflicts} label="Conflitos no time" tone={s.team_conflicts > 0 ? "amber" : "slate"} />
        <KpiCount icon={FolderKanban} value={s.impacted_projects} label="Projetos impactados" tone={s.impacted_projects > 0 ? "violet" : "slate"} />
      </KpiRow>

      {data.items.length === 0 ? (
        <Card>
          <EmptyState icon={CheckCircle2} title="Nenhuma ausência pendente ou aprovada com impacto futuro." compact />
        </Card>
      ) : (
        <div className="space-y-4">
          {data.items.map((item) => (
            <Card
              key={item.absence_id}
              className={
                item.risk_level === "high"
                  ? "border-red-300 dark:border-red-900"
                  : item.risk_level === "medium" ? "border-amber-300 dark:border-amber-800" : ""
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{item.person.full_name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {item.absence_type.name} · {formatDate(item.start_date)} a {formatDate(item.end_date)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill tone={ABSENCE_TONE[item.status]} dot>{ABSENCE_STATUS_LABELS[item.status]}</Pill>
                  <Pill tone={RISK_TONE[item.risk_level]}>
                    {item.risk_level === "high" && <AlertTriangle size={12} />}
                    Risco {item.risk_level === "high" ? "alto" : item.risk_level === "medium" ? "médio" : "baixo"}
                  </Pill>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Users size={15} className="text-muted-foreground" /> Impacto no time
                    </p>
                    {item.overlapping_people.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm">
                          Também estarão ausentes:{" "}
                          <span className="font-medium">
                            {item.overlapping_people.map((person) => person.full_name).join(", ")}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Time(s): {item.areas.map((area) => area.name).join(", ") || "Sem área vinculada"}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sem sobreposição com pessoas do mesmo time.</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <FolderKanban size={15} className="text-muted-foreground" /> Impacto nos projetos
                    </p>
                    {item.impacted_projects.length > 0 ? (
                      <div className="space-y-2">
                        {item.impacted_projects.map((project) => (
                          <div key={project.id} className="flex items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 text-sm">
                            <span className="min-w-0 truncate font-medium" title={project.name}>{project.name}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {project.overlapping_tasks} sobreposta(s) / {project.open_tasks} aberta(s)
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sem tarefas abertas em projetos.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  {item.reasons.map((reason) => (
                    <p key={reason} className="text-sm">• {reason}</p>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
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
