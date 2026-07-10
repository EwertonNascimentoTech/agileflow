import { useEffect, useMemo, useState } from "react"
import { Layers, Loader2, Pencil, Plus, Trash2 } from "lucide-react"

import { projetosApi, type ProjectProgram } from "@/api/projetos"
import { teamopsApi, type Person } from "@/api/teamops"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"

const NONE = "__none__"

type Form = { name: string; description: string; responsavelId: string; isActive: boolean }
const emptyForm = (): Form => ({ name: "", description: "", responsavelId: NONE, isActive: true })

export default function ProjectProgramsPage() {
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

  return (
    <div className="w-full space-y-4 p-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Programa</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de programas (nome, descrição e responsável). Cards podem ser vinculados a um programa na conversão.
          </p>
        </div>
        <Button className="gap-1.5" onClick={openCreate}><Plus size={15} /> Novo programa</Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : programs.length === 0 ? (
        <EmptyState icon={Layers} title="Nenhum programa cadastrado"
          description="Cadastre um programa para vincular cards na conversão."
          action={{ label: "Novo programa", onClick: openCreate }} />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Nome</th>
                <th className="px-3 py-2 font-semibold">Responsável</th>
                <th className="px-3 py-2 font-semibold">Descrição</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="w-20 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.responsavel_nome ?? personName(p.responsavel_person_id)}</td>
                  <td className="max-w-[28rem] truncate px-3 py-2 text-muted-foreground">{p.description ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                      {p.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={() => openEdit(p)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void remove(p)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
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
