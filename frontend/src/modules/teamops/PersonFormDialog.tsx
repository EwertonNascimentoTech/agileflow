import { useEffect, useMemo, useRef, useState } from "react"
import { Trash2, UserMinus } from "lucide-react"
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
  MANUAL_PERSON_STATUSES,
  PERSON_STATUS_LABELS,
  type AccessLevel,
  type Area,
  type EmploymentType,
  type OffboardingPreview,
  type Person,
  type PersonStatus,
  type Position,
} from "@/api/teamops"

const NONE = "__none__"

function AreaMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: { id: string; name: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedSet = useMemo(() => new Set(selected), [selected])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const triggerLabel = useMemo(() => {
    if (selected.length === 0) return "Nenhuma área"
    if (selected.length === 1) {
      return options.find((o) => o.id === selected[0])?.name ?? "1 área"
    }
    return `${selected.length} áreas`
  }, [selected, options])

  function toggle(id: string) {
    if (selectedSet.has(id)) onChange(selected.filter((v) => v !== id))
    else onChange([...selected, id])
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-left">{triggerLabel}</span>
        <span className="ml-2 shrink-0 text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full min-w-[240px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          <button
            type="button"
            className="mb-1 w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
            onClick={() => onChange([])}
          >
            Limpar seleção
          </button>
          {options.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">Nenhuma área cadastrada.</p>
          ) : (
            options.map((o) => {
              const checked = selectedSet.has(o.id)
              return (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={checked}
                    onChange={() => toggle(o.id)}
                  />
                  <span className="truncate">{o.name}</span>
                </label>
              )
            })
          )}
        </div>
      )}
      {selected.length > 1 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {selected
            .map((id) => options.find((o) => o.id === id)?.name)
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  )
}

function isAbsenceDrivenStatus(s: PersonStatus): boolean {
  return s === "ferias" || s === "afastado"
}

// Acesso agora é binário: o que a pessoa PODE fazer vem da matriz de permissões do cargo.
function normalizeAccess(level?: AccessLevel | null): "none" | "com_acesso" {
  return level && level !== "none" ? "com_acesso" : "none"
}

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
  const [areaOptions, setAreaOptions] = useState<{ id: string; name: string }[]>(
    areas.map((a) => ({ id: a.id, name: a.name })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState(person?.full_name ?? "")
  const [email, setEmail] = useState(person?.email ?? "")
  const [phone, setPhone] = useState(person?.phone ?? "")
  const [whatsapp, setWhatsapp] = useState(person?.whatsapp ?? "")
  const [birthDate, setBirthDate] = useState<string>(person?.birth_date ?? "")
  const [positionId, setPositionId] = useState<string>(person?.position_id ?? "")
  const [areaIds, setAreaIds] = useState<string[]>(() => {
    if (person?.areas?.length) return person.areas.map((a) => a.id)
    if (person?.area_ids?.length) return [...person.area_ids]
    if (person?.area_id) return [person.area_id]
    return []
  })
  const [poPersonId, setPoPersonId] = useState<string>(
    person?.pos?.[0]?.id ?? person?.po_person_ids?.[0] ?? person?.po_person_id ?? NONE,
  )
  const [techRefId, setTechRefId] = useState<string>(person?.tech_reference_person_id ?? NONE)
  const [managerId, setManagerId] = useState<string>(person?.manager_person_id ?? NONE)
  const [employmentType, setEmploymentType] = useState<EmploymentType>(person?.employment_type ?? "clt")
  const [dailyHours, setDailyHours] = useState<string>(String(person?.daily_hours ?? 8))
  const [weeklyHours, setWeeklyHours] = useState<string>(String(person?.weekly_hours ?? 40))
  const [projectAllocationPct, setProjectAllocationPct] = useState<string>(String(person?.project_allocation_pct ?? 100))
  const [startDate, setStartDate] = useState<string>(person?.start_date ?? "")
  const [status, setStatus] = useState<PersonStatus>(person?.status ?? "ativo")
  const [notes, setNotes] = useState<string>(person?.notes ?? "")
  const [accessLevel, setAccessLevel] = useState<"none" | "com_acesso">(normalizeAccess(person?.access_level))
  const [password, setPassword] = useState("")
  const [resetPassword, setResetPassword] = useState("")

  // Passo de realocação ao desligar
  const [offboardPreview, setOffboardPreview] = useState<OffboardingPreview | null>(null)
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null)
  const [reassignTo, setReassignTo] = useState<string>("")

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
    // Garante opções de área mesmo se o pai passou lista vazia (ex.: detalhe).
    const mergeAreas = (list: { id: string; name: string }[]) => {
      const byId = new Map(list.map((a) => [a.id, a]))
      for (const a of person?.areas ?? []) {
        if (!byId.has(a.id)) byId.set(a.id, { id: a.id, name: a.name })
      }
      setAreaOptions(Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name)))
    }
    if (areas.length > 0) {
      mergeAreas(areas.map((a) => ({ id: a.id, name: a.name })))
    } else {
      teamopsApi.listAreas().then((list) => mergeAreas(list.map((a) => ({ id: a.id, name: a.name })))).catch(() => mergeAreas([]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function buildPayload(): Record<string, unknown> | null {
    if (!positionId) {
      setError("Selecione um cargo.")
      return null
    }
    if (needsNewPassword && !password) {
      setError("Defina uma senha inicial para o acesso.")
      return null
    }
    const payload: Record<string, unknown> = {
      full_name: fullName,
      email,
      phone: phone || null,
      whatsapp: whatsapp || null,
      birth_date: birthDate || null,
      position_id: positionId,
      area_ids: areaIds,
      po_person_ids: poPersonId === NONE ? [] : [poPersonId],
      tech_reference_person_id: techRefId === NONE ? null : techRefId,
      manager_person_id: managerId === NONE ? null : managerId,
      employment_type: employmentType,
      daily_hours: Number(dailyHours),
      weekly_hours: Number(weeklyHours),
      project_allocation_pct: Number(projectAllocationPct),
      start_date: startDate || null,
      notes: notes || null,
      access_level: accessLevel,
    }
    if (!isAbsenceDrivenStatus(status)) {
      payload.status = status
    }
    if (needsNewPassword && password) payload.password = password
    if (canResetPassword && resetPassword) payload.reset_password = resetPassword
    return payload
  }

  async function persist(payload: Record<string, unknown>) {
    if (isEdit) {
      await teamopsApi.updatePerson(person!.id, payload)
    } else {
      await teamopsApi.createPerson(payload as Parameters<typeof teamopsApi.createPerson>[0])
    }
    onSaved()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = buildPayload()
      if (!payload) {
        setSaving(false)
        return
      }

      const becomingOffboarded =
        isEdit && status === "desligado" && person!.status !== "desligado"

      if (becomingOffboarded) {
        const preview = await teamopsApi.getOffboardingPreview(person!.id)
        if (preview.open_tasks > 0) {
          setOffboardPreview(preview)
          setPendingPayload(payload)
          setReassignTo(preview.peers[0]?.id ?? "")
          setSaving(false)
          return
        }
      }

      await persist(payload)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  async function confirmOffboarding() {
    if (!pendingPayload || !offboardPreview) return
    if (!reassignTo) {
      setError("Selecione o colega do mesmo cargo que receberá as tarefas em aberto.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await persist({
        ...pendingPayload,
        reassign_open_tasks_to: reassignTo,
      })
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Erro ao desligar e realocar tarefas.")
      setSaving(false)
    }
  }

  const otherPersons = allPersons.filter((p) => p.id !== person?.id)
  const hasLoginAlready = isEdit && (person?.access_level ?? "none") !== "none"
  const needsNewPassword = accessLevel !== "none" && !hasLoginAlready
  const canResetPassword = hasLoginAlready && accessLevel !== "none"
  const absenceDriven = isAbsenceDrivenStatus(status)
  const dailyHoursNum = parseFloat(dailyHours)
  const allocationPctNum = parseFloat(projectAllocationPct)
  const projectHoursPreview =
    !isNaN(dailyHoursNum) && dailyHoursNum > 0 && !isNaN(allocationPctNum)
      ? Math.round((dailyHoursNum * allocationPctNum / 100) * 10) / 10
      : null

  if (offboardPreview && pendingPayload) {
    return (
      <Dialog open onOpenChange={() => { setOffboardPreview(null); setPendingPayload(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinus className="h-5 w-5" /> Desligar e realocar tarefas
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <p>
              <strong>{offboardPreview.full_name}</strong>
              {offboardPreview.position_name ? (
                <span className="text-muted-foreground"> · {offboardPreview.position_name}</span>
              ) : null}
            </p>
            <ul className="space-y-1 rounded-md border bg-muted/30 px-3 py-2">
              <li>
                <strong>{offboardPreview.open_tasks}</strong> tarefa(s) em aberto → serão movidas
                para o colega escolhido
              </li>
              <li>
                <strong>{offboardPreview.completed_tasks}</strong> tarefa(s) concluída(s) →
                permanecem no histórico com a pessoa desligada
              </li>
            </ul>

            {offboardPreview.peers.length === 0 ? (
              <p className="rounded-md bg-destructive/10 p-3 text-destructive">
                Não há outra pessoa <strong>ativa</strong> com o mesmo cargo.
                Cadastre ou reative um colega da mesma função antes de desligar.
              </p>
            ) : (
              <div>
                <Label>Quem assume as tarefas em aberto? *</Label>
                <Select value={reassignTo} onValueChange={setReassignTo}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione um colega…" />
                  </SelectTrigger>
                  <SelectContent>
                    {offboardPreview.peers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {error && (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setOffboardPreview(null); setPendingPayload(null); setError(null) }}
            >
              Voltar
            </Button>
            <Button
              type="button"
              disabled={saving || offboardPreview.peers.length === 0 || !reassignTo}
              onClick={confirmOffboarding}
            >
              {saving ? "Desligando…" : "Confirmar desligamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

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
            <Label>WhatsApp</Label>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div>
            <Label>Data de nascimento</Label>
            <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
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
            <Label>Áreas</Label>
            <AreaMultiSelect
              options={areaOptions}
              selected={areaIds}
              onChange={setAreaIds}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Pode vincular a pessoa a mais de uma área (aparece em cada uma no organograma).
            </p>
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
            {absenceDriven ? (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                {PERSON_STATUS_LABELS[status]}
                <p className="mt-1 text-xs text-muted-foreground">
                  Definido automaticamente pelas ausências (TeamOps → Ausências).
                </p>
              </div>
            ) : (
              <Select value={status} onValueChange={(v) => setStatus(v as PersonStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MANUAL_PERSON_STATUSES.map((v) => (
                    <SelectItem key={v} value={v}>{PERSON_STATUS_LABELS[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isEdit && status === "desligado" && person?.status !== "desligado" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Ao salvar, se houver tarefas em aberto, pediremos um colega do mesmo cargo para assumi-las.
              </p>
            )}
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
            <Label>Alocação para projetos (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={projectAllocationPct}
              onChange={(e) => setProjectAllocationPct(e.target.value)}
            />
            {projectHoursPreview != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Com {dailyHoursNum}h/dia e {allocationPctNum}%, ficam <strong>{projectHoursPreview}h/dia</strong> disponíveis para projetos.
              </p>
            )}
          </div>
          <div>
            <Label>Data de entrada</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <div className="md:col-span-2 space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-semibold">Acesso ao sistema</p>
            {hasLoginAlready && (
              <p className="text-xs text-muted-foreground">
                Login: {person!.user_email ?? "—"} · {person!.user_active ? "ativo" : "inativo"}
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Acesso</Label>
                <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as "none" | "com_acesso")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem acesso (só ficha)</SelectItem>
                    <SelectItem value="com_acesso">Com acesso ao sistema</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {needsNewPassword && (
                <div>
                  <Label>Senha inicial *</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Mín. 8 caracteres, com maiúscula, minúscula, número e especial.
                  </p>
                </div>
              )}
              {canResetPassword && (
                <div>
                  <Label>Redefinir senha</Label>
                  <Input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="(deixe vazio para manter)"
                    autoComplete="new-password"
                  />
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cria um login usando o e-mail acima. <strong>O que a pessoa pode fazer vem da matriz de permissões do cargo</strong> — configure em Configurações → Cargos → Acesso.
            </p>
          </div>

          {error && (
            <p className="md:col-span-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {typeof error === "string" ? error : "Erro ao salvar."}
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
