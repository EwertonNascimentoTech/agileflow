import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { CheckCircle2, Layers, Loader2, Pencil, PauseCircle, Plus, Settings2, Trash2, UserX } from "lucide-react"

import { projetosApi, type ProjectProgram } from "@/api/projetos"
import { teamopsApi, type Person } from "@/api/teamops"
import { Card, IconTile, KpiCount, KpiRow, PageHeader, Pill, TABLE } from "@/components/ds"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { useAuth } from "@/contexts/AuthContext"
import { hasPermission } from "@/lib/permissions"
import { ProgramAppearanceFields } from "@/modules/projetos/ProgramAppearanceFields"
import { colorFor } from "@/modules/portal/portfolioMeta"

const NONE = "__none__"

type Form = {
  name: string
  description: string
  responsavelId: string
  isActive: boolean
  icon: string | null
  color: string | null
  oaDays: number
}
const emptyForm = (): Form => ({ name: "", description: "", responsavelId: NONE, isActive: true, icon: null, color: null, oaDays: 30 })

export default function ProjectProgramsPage() {
  const { user } = useAuth()
  // Catálogo de Programas: só PO/coordenação/gestão (`projetos.program.manage`).
  const canManage = hasPermission(user?.permissions, "projetos.program.manage")
  const [programs, setPrograms] = useState<ProjectProgram[]>([])
  const [persons, setPersons] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<ProjectProgram | null>(null)
  const [form, setForm] = useState<Form>(emptyForm())

  async function reload() {
    setPrograms(await projetosApi.listProgramCatalog().catch(() => []))
  }
  useEffect(() => {
    Promise.all([
      projetosApi.listProgramCatalog().catch(() => []),
      teamopsApi.listPersons().catch(() => []),
    ]).then(([pg, ps]) => { setPrograms(pg); setPersons(ps) }).finally(() => setLoading(false))
  }, [])

  const personName = useMemo(() => {
    const m = new Map(persons.map((p) => [p.id, p.full_name]))
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—")
  }, [persons])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }
  function openEdit(p: ProjectProgram) {
    setEditing(p)
    setForm({
      name: p.name,
      description: p.description ?? "",
      responsavelId: p.responsavel_person_id ?? NONE,
      isActive: p.is_active,
      icon: p.icon,
      color: p.color,
      oaDays: p.oa_days ?? 30,
    })
    setOpen(true)
  }

  async function save() {
    if (form.name.trim().length < 2) {
      toast.error("Informe o nome do programa (mín. 2 caracteres).")
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        responsavel_person_id: form.responsavelId === NONE ? null : form.responsavelId,
        is_active: form.isActive,
        icon: form.icon,
        color: form.color,
        oa_days: Math.max(0, Math.min(365, Math.round(form.oaDays || 0))),
      }
      if (editing) {
        await projetosApi.updateProgram(editing.id, payload)
        toast.success("Programa atualizado.")
      } else {
        await projetosApi.createProgram(payload)
        toast.success("Programa cadastrado.")
      }
      setOpen(false)
      await reload()
    } catch {
      toast.error("Não foi possível salvar o programa.")
    } finally {
      setSaving(false)
    }
  }

  async function remove(p: ProjectProgram) {
    if (!confirm(`Excluir o programa "${p.name}"?`)) return
    try {
      await projetosApi.deleteProgram(p.id)
      toast.success("Programa excluído.")
      await reload()
    } catch {
      toast.error("Não foi possível excluir.")
    }
  }

  // Indicadores do topo (só leitura): contam sobre o catálogo inteiro.
  const counts = {
    ativos: programs.filter((p) => p.is_active).length,
    inativos: programs.filter((p) => !p.is_active).length,
    semResponsavel: programs.filter((p) => !p.responsavel_person_id).length,
  }

  return (
    <div className="w-full space-y-5 p-1">
      <PageHeader
        icon={Layers}
        color="#2563EB"
        title="Programa"
        description={
          <>
            Cadastro de programas (nome, descrição e responsável). Cards podem ser vinculados a um programa na conversão.
            Em "Gerenciar": pilares, pilar de cada projeto e clientes que veem o programa no Portal.
          </>
        }
        actions={canManage ? <Button className="h-10 gap-1.5" onClick={openCreate}><Plus size={16} /> Novo programa</Button> : undefined}
      />

      {loading ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : programs.length === 0 ? (
        <Card>
          <EmptyState icon={Layers} title="Nenhum programa cadastrado"
            description="Cadastre um programa para vincular cards na conversão."
            action={canManage ? { label: "Novo programa", onClick: openCreate } : undefined} />
        </Card>
      ) : (
        <>
          <KpiRow className="sm:grid-cols-2 lg:grid-cols-4">
            <KpiCount icon={Layers} value={programs.length} label="Programas cadastrados" />
            <KpiCount icon={CheckCircle2} value={counts.ativos} label="Ativos" tone="emerald" />
            <KpiCount icon={PauseCircle} value={counts.inativos} label="Inativos" tone="slate" />
            <KpiCount
              icon={UserX} value={counts.semResponsavel} label="Sem responsável (PO)"
              tone={counts.semResponsavel > 0 ? "amber" : "slate"} highlight={counts.semResponsavel > 0}
            />
          </KpiRow>

          <Card className="overflow-hidden">
            <div className={TABLE.wrap}>
              <table className={`${TABLE.table} min-w-[760px]`}>
                <thead className={TABLE.thead}>
                  <tr>
                    <th className={TABLE.thFirst}>Nome</th>
                    <th className={TABLE.th}>Responsável</th>
                    <th className={TABLE.th}>Descrição</th>
                    <th className={TABLE.th}>Status</th>
                    <th className={`${TABLE.th} w-44`}><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((p) => (
                    <tr key={p.id} className={TABLE.tr}>
                      <td className={TABLE.tdFirst}>
                        <span className="flex items-center gap-3 font-semibold">
                          <IconTile icon={p.icon} color={colorFor(p.color, p.id)} size={36} />
                          {p.name}
                        </span>
                      </td>
                      <td className={`${TABLE.td} whitespace-nowrap text-muted-foreground`}>{p.responsavel_nome ?? personName(p.responsavel_person_id)}</td>
                      <td className={`${TABLE.td} max-w-[28rem] truncate text-muted-foreground`} title={p.description ?? undefined}>{p.description ?? "—"}</td>
                      <td className={TABLE.td}>
                        <Pill tone={p.is_active ? "emerald" : "slate"} dot>{p.is_active ? "Ativo" : "Inativo"}</Pill>
                      </td>
                      <td className={`${TABLE.td} text-right`}>
                        {canManage && <div className="flex items-center justify-end gap-0.5">
                          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
                            <Link to={`/app/modules/projetos/programas/${p.id}`}><Settings2 size={14} /> Gerenciar</Link>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                            title="Editar programa" aria-label={`Editar ${p.name}`} onClick={() => openEdit(p)}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title="Excluir programa" aria-label={`Excluir ${p.name}`} onClick={() => void remove(p)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar programa" : "Novo programa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pg-name">Nome</Label>
              <Input id="pg-name" value={form.name} maxLength={200} autoFocus
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-desc">Descrição</Label>
              <Textarea id="pg-desc" rows={3} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável (PO)</Label>
              <Select value={form.responsavelId} onValueChange={(v) => setForm((f) => ({ ...f, responsavelId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem responsável</SelectItem>
                  {persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-oa">Operação Assistida prevista (dias)</Label>
              <Input id="pg-oa" type="number" min={0} max={365} value={form.oaDays}
                onChange={(e) => setForm((f) => ({ ...f, oaDays: Number(e.target.value) }))} className="w-32" />
              <p className="text-xs text-muted-foreground">Usado no roadmap do Portal para prever a fase depois da entrega.</p>
            </div>
            <ProgramAppearanceFields
              icon={form.icon}
              color={form.color}
              onIcon={(v) => setForm((f) => ({ ...f, icon: v }))}
              onColor={(v) => setForm((f) => ({ ...f, color: v }))}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-input accent-primary" />
              <span>Ativo</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
