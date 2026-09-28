import { useEffect, useMemo, useState } from "react"
import { FirstAccessLinkButton } from "@/components/FirstAccessLinkButton"
import { AllocationSplitBar, allocationSplit } from "@/modules/teamops/AllocationSplit"
import { useNavigate, useParams } from "react-router-dom"
import {
  Briefcase, Building2, CalendarOff, Clock, FileText, KeyRound, Layers, Network, Plus, Trash2, Pencil, UserMinus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/EmptyState"
import {
  DetailHeader, DetailTabs, Field, KpiCount, KpiPerson, KpiRow, KpiText, Pill, SectionCard, TABLE,
  type MenuAction, type TabDef, type Tone,
} from "@/components/ds"
import {
  teamopsApi,
  PERSON_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  STACK_LEVEL_LABELS,
  ABSENCE_STATUS_LABELS,
  personAreasLabel,
  personPosLabel,
  type Absence,
  type AbsenceStatus,
  type AbsenceType,
  type Area,
  type Person,
  type PersonStack,
  type PersonStatus,
  type Stack,
  type StackLevel,
} from "@/api/teamops"
import { PersonFormDialog } from "./PersonFormDialog"
import { useAuth } from "@/contexts/AuthContext"
import { canManageTeamopsPeople } from "@/lib/permissions"

type PersonTab = "org" | "stacks" | "absences"

// Selos (Pill do design system do Portal): mesmas cores dos antigos Badges.
const STATUS_TONE: Record<PersonStatus, Tone> = { ativo: "emerald", ferias: "amber", afastado: "amber", desligado: "red" }
const ABSENCE_TONE: Record<AbsenceStatus, Tone> = { aprovada: "emerald", recusada: "red", pendente: "amber", cancelada: "slate" }

const DL = "grid gap-x-6 gap-y-4 sm:grid-cols-2"

/** "2026-08-01" → "01/08/2026" (sem passar por Date, para não virar o dia no fuso). */
function fmtYmd(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10).split("-").reverse().join("/") : null
}

export default function PersonDetailPage() {
  const { user } = useAuth()
  const canManage = canManageTeamopsPeople(user)
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
  const [areas, setAreas] = useState<Area[]>([])
  const [tab, setTab] = useState<PersonTab>("org")

  async function refresh() {
    if (!personId) return
    setLoading(true)
    try {
      const [p, ps, abs, as] = await Promise.all([
        teamopsApi.getPerson(personId),
        teamopsApi.listPersonStacks(personId),
        teamopsApi.listAbsences({ person_id: personId }),
        teamopsApi.listAreas(),
      ])
      setPerson(p)
      setPersonStacks(ps)
      setAbsences(abs)
      setAreas(as)
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
      <div className="space-y-5 p-4">
        <Skeleton className="h-20 w-2/3 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    )
  }

  async function removePerson() {
    if (!person) return
    if (!confirm(`Excluir permanentemente "${person.full_name}"?\n\nEsta ação remove a pessoa do sistema e desfaz seus vínculos no organograma. Ausências e stacks vinculadas também serão removidas.`)) return
    try {
      await teamopsApi.deletePerson(person.id)
      navigate("/app/modules/teamops/people")
    } catch (err: any) {
      alert(err?.response?.data?.detail ?? "Erro ao excluir.")
    }
  }

  const actions: MenuAction[] = canManage
    ? [
        { label: "Editar", icon: Pencil, onClick: () => setEditing(true) },
        { label: "Excluir", icon: UserMinus, onClick: () => void removePerson() },
      ]
    : []
  const tabs: TabDef<PersonTab>[] = [
    { value: "org", label: "Organização", icon: Network },
    { value: "stacks", label: `Stacks (${personStacks.length})`, icon: Layers },
    { value: "absences", label: `Ausências (${absences.length})`, icon: CalendarOff },
  ]
  const posLabel = personPosLabel(person)

  return (
    <div className="space-y-5 p-4">
      <DetailHeader
        crumbs={[{ label: "Pessoas", to: "/app/modules/teamops/people" }, { label: person.full_name }]}
        icon="Users"
        color="#0891B2"
        title={person.full_name}
        badge={
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={STATUS_TONE[person.status]} dot>{PERSON_STATUS_LABELS[person.status]}</Pill>
            {person.access_level !== "none" && (
              <Pill tone={person.user_active === false ? "slate" : "blue"}>
                Com acesso{person.user_active === false ? " (inativo)" : ""}
              </Pill>
            )}
          </div>
        }
        description={<>{person.position?.name ?? "—"} · {person.email}</>}
        updatedAt={person.updated_at ?? null}
        actions={actions}
      />

      <KpiRow className="sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiText icon={Building2} value={<span title={personAreasLabel(person)}>{personAreasLabel(person)}</span>} label="Área" />
        <KpiText icon={Briefcase} value={EMPLOYMENT_TYPE_LABELS[person.employment_type]} label="Vínculo" />
        <KpiText icon={Clock} value={`${person.daily_hours}h/dia · ${person.weekly_hours}h/sem`} label="Carga" />
        <KpiPerson name={person.manager_person?.full_name} role="Superior imediato" />
        <KpiCount icon={Layers} value={personStacks.length} label="Stacks" onClick={() => setTab("stacks")} active={tab === "stacks"} />
        <KpiCount
          icon={CalendarOff} value={absences.length} label="Ausências" tone="violet"
          onClick={() => setTab("absences")} active={tab === "absences"}
        />
      </KpiRow>

      <DetailTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "org" && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <SectionCard
              title="Organização"
              icon={Network}
              right={canManage ? (
                <Button variant="outline" className="h-9 gap-1.5" onClick={() => setEditing(true)}>
                  <Pencil size={14} /> Editar
                </Button>
              ) : undefined}
            >
              <dl className={DL}>
                <Field label="Cargo">{person.position?.name ?? "—"}</Field>
                <Field label="Área">{personAreasLabel(person)}</Field>
                <Field label="PO vinculado">{posLabel}</Field>
                <Field label="Referência técnica">{person.tech_reference_person?.full_name ?? "—"}</Field>
                <Field label="Superior imediato">{person.manager_person?.full_name ?? "—"}</Field>
                <Field label="Data de entrada">{fmtYmd(person.start_date) ?? "—"}</Field>
              </dl>
            </SectionCard>

            {person.payroll && (
              <SectionCard
                title="Dados da folha"
                icon={FileText}
                subtitle={
                  <>
                    Do Genus, no 1º login pelo IDigital
                    {person.payroll.fetched_at && ` em ${fmtYmd(person.payroll.fetched_at)}`}.
                  </>
                }
              >
                <dl className={DL}>
                  <Field label="Matrícula">{person.payroll.employee_number ?? "—"}</Field>
                  <Field label="Cargo funcional">{person.payroll.job_title ?? "—"}</Field>
                  <Field label="Departamento">{person.payroll.department ?? "—"}</Field>
                  <Field label="Função de confiança">{person.payroll.trust_role ?? "—"}</Field>
                  <Field label="Organização">{person.payroll.organization ?? "—"}</Field>
                </dl>
              </SectionCard>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <SectionCard title="Jornada" icon={Clock} subtitle="Divisão entre Projetos, Operação Assistida e Chamados (o que sobra).">
              <dl className={DL}>
                <Field label="Carga">{person.daily_hours}h/dia · {person.weekly_hours}h/sem</Field>
                <Field label="Vínculo">{EMPLOYMENT_TYPE_LABELS[person.employment_type]}</Field>
              </dl>
              <div className="mt-4 border-t pt-4">
                <AllocationSplitBar
                  split={allocationSplit(person.daily_hours, person.project_allocation_pct, person.assisted_ops_allocation_pct)}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Acesso ao sistema"
              icon={KeyRound}
              right={canManage && person.status === "ativo" ? (
                <FirstAccessLinkButton
                  personName={person.full_name}
                  generate={() => teamopsApi.personFirstAccessLink(person.id)}
                />
              ) : undefined}
            >
              <dl className={DL}>
                <Field label="Acesso">
                  {person.access_level === "none" ? (
                    <span className="font-normal text-muted-foreground">Sem acesso (só ficha)</span>
                  ) : (
                    <Pill tone={person.user_active === false ? "slate" : "blue"}>
                      Com acesso{person.user_active === false ? " (inativo)" : ""}
                    </Pill>
                  )}
                </Field>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                O que a pessoa pode fazer vem do cargo — Configurações → Cargos → Acesso.
              </p>
            </SectionCard>
          </div>
        </div>
      )}

      {tab === "stacks" && (
        <SectionCard
          title="Stacks"
          icon={Layers}
          subtitle="Competências mapeadas da pessoa."
          right={
            <Button className="h-9 gap-1.5" onClick={() => setShowStackDlg(true)}>
              <Plus size={14} /> Adicionar stack
            </Button>
          }
          flush
        >
          {personStacks.length === 0 ? (
            <EmptyState icon={Layers} title="Nenhuma stack vinculada." description="Adicione para mapear competências." compact />
          ) : (
            <div className={TABLE.wrap}>
              <table className={TABLE.table}>
                <thead className={TABLE.thead}>
                  <tr>
                    <th className={TABLE.thFirst}>Stack</th>
                    <th className={TABLE.th}>Nível</th>
                    <th className={TABLE.th}>Experiência</th>
                    <th className={TABLE.th}>Referência</th>
                    <th className={TABLE.th}><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {personStacks.map((ps) => (
                    <tr key={ps.id} className={TABLE.tr}>
                      <td className={`${TABLE.tdFirst} font-medium`}>
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {ps.stack?.name}
                          {ps.stack?.is_critical && <Pill tone="amber">Crítica</Pill>}
                        </span>
                      </td>
                      <td className={TABLE.td}>{STACK_LEVEL_LABELS[ps.level]}</td>
                      <td className={`${TABLE.td} tabular-nums text-muted-foreground`}>{ps.years_experience} ano(s)</td>
                      <td className={TABLE.td}>
                        {ps.is_reference ? <Pill tone="emerald" dot>Sim</Pill> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={`${TABLE.td} text-right`}>
                        <Button
                          variant="ghost" size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          title="Remover stack"
                          aria-label={`Remover ${ps.stack?.name ?? "stack"}`}
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
            </div>
          )}
        </SectionCard>
      )}

      {tab === "absences" && (
        <SectionCard
          title="Ausências"
          icon={CalendarOff}
          subtitle="Férias, afastamentos e demais ausências da pessoa."
          right={
            <Button className="h-9 gap-1.5" onClick={() => setShowAbsenceDlg(true)}>
              <Plus size={14} /> Registrar ausência
            </Button>
          }
          flush
        >
          {absences.length === 0 ? (
            <EmptyState icon={CalendarOff} title="Nenhuma ausência registrada." compact />
          ) : (
            <div className={TABLE.wrap}>
              <table className={TABLE.table}>
                <thead className={TABLE.thead}>
                  <tr>
                    <th className={TABLE.thFirst}>Tipo</th>
                    <th className={TABLE.th}>Período</th>
                    <th className={TABLE.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {absences.map((a) => (
                    <tr key={a.id} className={TABLE.tr}>
                      <td className={TABLE.tdFirst}>
                        <span className="inline-flex items-center gap-2">
                          {a.absence_type?.color && (
                            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.absence_type.color }} aria-hidden />
                          )}
                          {a.absence_type?.name ?? "—"}
                        </span>
                      </td>
                      <td className={`${TABLE.td} whitespace-nowrap tabular-nums`}>{fmtYmd(a.start_date)} → {fmtYmd(a.end_date)}</td>
                      <td className={TABLE.td}>
                        <Pill tone={ABSENCE_TONE[a.status]} dot>{ABSENCE_STATUS_LABELS[a.status]}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {canManage && editing && (
        <PersonFormDialog
          person={person}
          areas={areas}
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
