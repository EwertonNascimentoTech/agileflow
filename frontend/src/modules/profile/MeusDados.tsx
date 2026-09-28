import { useState } from "react"
import { Briefcase, Building2, Loader2, Phone, UserCog } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field, SectionCard } from "@/components/ds"
import { EMPLOYMENT_TYPE_LABELS, teamopsApi, type Person } from "@/api/teamops"
import type { User } from "@/types"
import { toast } from "@/lib/toast"
import { errMsg, fmtData, fmtNum } from "@/modules/profile/utils"

function acessoLabel(u: User): string {
  if (u.role === "super_admin") return "Administrador da plataforma"
  if (u.role === "company_admin") return "Administrador da empresa"
  return u.role_name?.trim() || "Usuário"
}

/** Contato que a própria pessoa mantém (o restante do cadastro é da coordenação). */
function ContatoForm({ person, onSaved }: { person: Person; onSaved: (p: Person) => void }) {
  const [phone, setPhone] = useState(person.phone ?? "")
  const [whatsapp, setWhatsapp] = useState(person.whatsapp ?? "")
  const [birth, setBirth] = useState(person.birth_date ?? "")
  const [saving, setSaving] = useState(false)
  const dirty = phone !== (person.phone ?? "") || whatsapp !== (person.whatsapp ?? "") || birth !== (person.birth_date ?? "")

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const p = await teamopsApi.updateMyContact({ phone: phone.trim(), whatsapp: whatsapp.trim(), birth_date: birth || null })
      toast.success("Contato atualizado.")
      onSaved(p)
    } catch (err) {
      toast.error(errMsg(err, "Não foi possível salvar. Confira o telefone e a data."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void salvar(e)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="perfil-telefone">Telefone</Label>
          <Input id="perfil-telefone" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(82) 3333-0000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="perfil-whatsapp">WhatsApp</Label>
          <Input id="perfil-whatsapp" inputMode="tel" maxLength={30} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(82) 99999-0000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="perfil-nascimento">Data de nascimento</Label>
          <Input id="perfil-nascimento" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">O aniversário aparece para o time no painel de Gestão de Times.</p>
        <Button type="submit" disabled={saving || !dirty}>
          {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />} Salvar contato
        </Button>
      </div>
    </form>
  )
}

export default function MeusDados({ user, person, onPersonChange }: {
  user: User
  person: Person | null
  onPersonChange: (p: Person) => void
}) {
  const payroll = person?.payroll
  const alocProj = person?.project_allocation_pct ?? 0
  const alocOa = person?.assisted_ops_allocation_pct ?? 0
  const alocChamados = person?.tickets_allocation_pct ?? Math.max(0, 100 - alocProj - alocOa)

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <SectionCard title="Conta" icon={UserCog}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome">{user.full_name}</Field>
          <Field label="E-mail de acesso">{user.email}</Field>
          <Field label="Perfil de acesso">{acessoLabel(user)}</Field>
          <Field label="Último acesso">{user.last_login ? new Date(user.last_login).toLocaleString("pt-BR") : "—"}</Field>
        </dl>
      </SectionCard>

      {person && (
        <SectionCard title="No time" icon={Briefcase} subtitle="Mantido pela coordenação em Gestão de Times > Pessoas">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Cargo">{person.position?.name ?? "—"}</Field>
            <Field label="Áreas">{person.areas?.length ? person.areas.map((a) => a.name).join(", ") : "—"}</Field>
            <Field label="PO">{person.pos?.length ? person.pos.map((p) => p.full_name).join(", ") : "—"}</Field>
            <Field label="Referência técnica">{person.tech_reference_person?.full_name ?? "—"}</Field>
            <Field label="Gestor">{person.manager_person?.full_name ?? "—"}</Field>
            <Field label="Vínculo">{EMPLOYMENT_TYPE_LABELS[person.employment_type] ?? person.employment_type}</Field>
            <Field label="Jornada">{fmtNum(person.daily_hours)}h/dia · {fmtNum(person.weekly_hours)}h/semana</Field>
            <Field label="No time desde">{fmtData(person.start_date)}</Field>
            <Field label="Divisão da jornada" className="sm:col-span-2">
              Projetos {fmtNum(alocProj, 0)}% · Operação Assistida {fmtNum(alocOa, 0)}% · Chamados {fmtNum(alocChamados, 0)}%
            </Field>
          </dl>
        </SectionCard>
      )}

      {person && (
        <SectionCard title="Contato" icon={Phone} subtitle="Você mesmo mantém estes dados">
          <ContatoForm key={person.updated_at} person={person} onSaved={onPersonChange} />
        </SectionCard>
      )}

      {payroll && (
        <SectionCard title="Dados funcionais (folha)" icon={Building2} subtitle={`Genus · atualizado em ${fmtData(payroll.fetched_at)}`}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Matrícula">{payroll.employee_number ?? "—"}</Field>
            <Field label="Organização">{payroll.organization ?? "—"}</Field>
            <Field label="Departamento">{payroll.department ?? "—"}</Field>
            <Field label="Cargo funcional">{payroll.job_title ?? "—"}</Field>
            {payroll.trust_role && <Field label="Função de confiança">{payroll.trust_role}</Field>}
          </dl>
        </SectionCard>
      )}
    </div>
  )
}
