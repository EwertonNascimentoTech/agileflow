import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Layers, Loader2, Pencil, Plus, Trash2, Wand2 } from "lucide-react"

import { projetosApi, type ProgramAdminDetail, type ProgramPillar } from "@/api/projetos"
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
import { IconTile } from "@/modules/portal/portfolioUi"
import { ProgramAppearanceFields } from "@/modules/projetos/ProgramAppearanceFields"
import { ProjectClientsSection } from "@/modules/projetos/ProjectClientsSection"
import { colorFor } from "@/modules/portal/portfolioMeta"

const NONE = "__none__"

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

type PillarForm = { name: string; description: string; icon: string | null; color: string | null }
const emptyPillar = (): PillarForm => ({ name: "", description: "", icon: null, color: null })

/** Gestão do programa para o Portal do Cliente: pilares, pilar de cada projeto e clientes. */
export default function ProjectProgramDetailPage() {
  const { programId } = useParams<{ programId: string }>()
  const { user } = useAuth()
  const canManage = hasPermission(user?.permissions, "projetos.program.manage")
  const [data, setData] = useState<ProgramAdminDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ editing: ProgramPillar | null } | null>(null)
  const [form, setForm] = useState<PillarForm>(emptyPillar())
  const [saving, setSaving] = useState(false)
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)

  useEffect(() => {
    if (!programId) return
    projetosApi
      .programAdmin(programId)
      .then(setData)
      .catch((err) => setError(apiError(err, "Não foi possível carregar o programa.")))
      .finally(() => setLoading(false))
  }, [programId])

  const pillarName = useMemo(() => new Map((data?.pillars ?? []).map((p) => [p.id, p.name])), [data])
  const unassigned = (data?.projects ?? []).filter((p) => !p.pillar_id).length

  function openNew() {
    setForm(emptyPillar())
    setDialog({ editing: null })
  }
  function openEdit(p: ProgramPillar) {
    setForm({ name: p.name, description: p.description ?? "", icon: p.icon, color: p.color })
    setDialog({ editing: p })
  }

  async function savePillar() {
    if (!programId || !dialog) return
    if (form.name.trim().length < 2) {
      toast.error("Informe o nome do pilar.")
      return
    }
    setSaving(true)
    const payload = { name: form.name.trim(), description: form.description.trim() || null, icon: form.icon, color: form.color }
    try {
      setData(dialog.editing
        ? await projetosApi.updateProgramPillar(programId, dialog.editing.id, payload)
        : await projetosApi.createProgramPillar(programId, payload))
      setDialog(null)
      toast.success(dialog.editing ? "Pilar atualizado." : "Pilar criado.")
    } catch (err) {
      toast.error(apiError(err, "Não foi possível salvar o pilar."))
    } finally {
      setSaving(false)
    }
  }

  async function removePillar(p: ProgramPillar) {
    if (!programId) return
    if (!window.confirm(`Excluir o pilar "${p.name}"? ${p.project_count ? `${p.project_count} projeto(s) ficam sem pilar.` : ""}`)) return
    try {
      setData(await projetosApi.deleteProgramPillar(programId, p.id))
      toast.success("Pilar excluído.")
    } catch (err) {
      toast.error(apiError(err, "Não foi possível excluir o pilar."))
    }
  }

  async function setPillar(taskId: string, value: string) {
    if (!programId) return
    setBusyTask(taskId)
    try {
      setData(await projetosApi.setProgramProjectPillar(programId, taskId, value === NONE ? null : value))
    } catch (err) {
      toast.error(apiError(err, "Não foi possível mudar o pilar."))
    } finally {
      setBusyTask(null)
    }
  }

  async function suggest() {
    if (!programId) return
    if (!window.confirm("Os projetos sem pilar recebem o pilar com o nome da Área do card (o pilar é criado se não existir). Continuar?")) return
    setSuggesting(true)
    try {
      const r = await projetosApi.suggestProgramPillars(programId)
      setData(r.detail)
      toast.success(`${r.assigned} projeto(s) classificados; ${r.created} pilar(es) criados.`)
    } catch (err) {
      toast.error(apiError(err, "Não foi possível sugerir os pilares."))
    } finally {
      setSuggesting(false)
    }
  }

  const back = (
    <Link to="/app/modules/projetos/programas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft size={14} /> Programas
    </Link>
  )

  if (loading) {
    return <div className="space-y-4 p-1">{back}<Skeleton className="h-64 rounded-lg" /></div>
  }
  if (!data || !canManage) {
    return (
      <div className="space-y-4 p-1">
        {back}
        <EmptyState icon={Layers} title="Programa indisponível" description={error ?? "Só quem gerencia o catálogo de Programas acessa esta tela."} />
      </div>
    )
  }

  const prog = data.program
  return (
    <div className="w-full space-y-5 p-1">
      {back}
      <div className="flex flex-wrap items-center gap-3">
        <IconTile icon={prog.icon} color={colorFor(prog.color, prog.id)} size={44} />
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{prog.name}</h1>
          <p className="text-sm text-muted-foreground">
            Como o programa aparece no Portal do Cliente: pilares, projetos e quem acompanha.
            Responsável: {prog.responsavel_nome ?? "—"} · Operação Assistida prevista: {prog.oa_days} dias.
          </p>
        </div>
      </div>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Pilares</h2>
            <p className="text-sm text-muted-foreground">Agrupam os projetos do programa na visão por pilares e no roadmap do Portal.</p>
          </div>
          <div className="flex gap-2">
            {unassigned > 0 && (
              <Button variant="outline" className="gap-1.5" onClick={() => void suggest()} disabled={suggesting}>
                {suggesting ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Sugerir pela Área
              </Button>
            )}
            <Button className="gap-1.5" onClick={openNew}><Plus size={15} /> Novo pilar</Button>
          </div>
        </div>
        {data.pillars.length === 0 ? (
          <p className="rounded-md bg-muted/50 px-3 py-4 text-sm text-muted-foreground">
            Nenhum pilar ainda. Crie os pilares (ex.: Financeiro, Suprimentos) ou use "Sugerir pela Área" como ponto de partida.
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.pillars.map((p) => (
              <div key={p.id} className="flex items-start gap-3 rounded-md border p-3">
                <IconTile icon={p.icon} color={colorFor(p.color, p.id)} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{p.description || "Sem descrição"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.project_count} projeto(s)</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(p)} aria-label={`Editar ${p.name}`}>
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => void removePillar(p)} aria-label={`Excluir ${p.name}`}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div>
          <h2 className="font-semibold">Projetos do programa ({data.projects.length})</h2>
          <p className="text-sm text-muted-foreground">
            Cards vinculados ao programa. Escolha o pilar de cada um{unassigned ? ` — ${unassigned} sem pilar` : ""}.
          </p>
        </div>
        {data.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum card vinculado a este programa.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Projeto</th>
                  <th className="px-3 py-2 font-semibold">Etapa</th>
                  <th className="px-3 py-2 font-semibold">Área</th>
                  <th className="px-3 py-2 font-semibold">PO</th>
                  <th className="w-56 px-3 py-2 font-semibold">Pilar</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((t) => (
                  <tr key={t.task_id} className="border-t">
                    <td className="max-w-[360px] truncate px-3 py-2 font-medium" title={t.title}>{t.title}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.stage_name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.area_label ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.po_name ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      <Select value={t.pillar_id ?? NONE} onValueChange={(v) => void setPillar(t.task_id, v)} disabled={busyTask === t.task_id}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue>{t.pillar_id ? pillarName.get(t.pillar_id) ?? "—" : "Sem pilar"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Sem pilar</SelectItem>
                          {data.pillars.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4">
        {programId && <ProjectClientsSection programId={programId} />}
      </section>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.editing ? "Editar pilar" : "Novo pilar"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pl-name">Nome</Label>
              <Input id="pl-name" value={form.name} maxLength={120} autoFocus
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-desc">Descrição</Label>
              <Textarea id="pl-desc" rows={2} value={form.description} placeholder="Ex.: Projetos da cadeia de suprimentos e compras"
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <ProgramAppearanceFields
              icon={form.icon}
              color={form.color}
              onIcon={(v) => setForm((f) => ({ ...f, icon: v }))}
              onColor={(v) => setForm((f) => ({ ...f, color: v }))}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void savePillar()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dialog?.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
