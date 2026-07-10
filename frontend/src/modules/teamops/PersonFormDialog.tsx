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
  MANUAL_PERSON_STATUSES,
  PERSON_STATUS_LABELS,
  type AccessLevel,
  type Area,
  type EmploymentType,
  type Person,
  type PersonStatus,
  type Position,
} from "@/api/teamops"

const NONE = "__none__"

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState(person?.full_name ?? "")
  const [email, setEmail] = useState(person?.email ?? "")
  const [phone, setPhone] = useState(person?.phone ?? "")
  const [whatsapp, setWhatsapp] = useState(person?.whatsapp ?? "")
  const [birthDate, setBirthDate] = useState<string>(person?.birth_date ?? "")
  const [positionId, setPositionId] = useState<string>(person?.position_id ?? "")
  const [areaId, setAreaId] = useState<string>(person?.area_id ?? NONE)
  const [poPersonId, setPoPersonId] = useState<string>(person?.po_person_id ?? NONE)
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
      if (needsNewPassword && !password) {
        setError("Defina uma senha inicial para o acesso.")
        setSaving(false)
        return
      }
      const payload: any = {
        full_name: fullName,
        email,
        phone: phone || null,
        whatsapp: whatsapp || null,
        birth_date: birthDate || null,
        position_id: positionId,
        area_id: areaId === NONE ? null : areaId,
        po_person_id: poPersonId === NONE ? null : poPersonId,
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
