import { useEffect, useMemo, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, CalendarClock, Layers, ListTree, Loader2, Pencil, Plus, Trash2, Users, Wand2, Waypoints } from "lucide-react"

import { projetosApi, type ProgramAdminDetail, type ProgramPillar } from "@/api/projetos"
import {
  Card, DetailHeader, DetailTabs, IconTile, KpiCount, KpiPerson, KpiRow, KpiText, Pill, SectionCard, TABLE,
  type MenuAction, type TabDef,
} from "@/components/ds"
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
import { ProjectClientsSection } from "@/modules/projetos/ProjectClientsSection"
import { colorFor } from "@/modules/portal/portfolioMeta"

const NONE = "__none__"

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

type PillarForm = { name: string; description: string; icon: string | null; color: string | null }
const emptyPillar = (): PillarForm => ({ name: "", description: "", icon: null, color: null })

// Abas da tela (mesmo layout do programa no Portal); a aba fica na URL (?aba=).
type Tab = "pilares" | "projetos" | "clientes"
const TAB_VALUES: Tab[] = ["pilares", "projetos", "clientes"]

/** Gestão do programa para o Portal do Cliente: pilares, pilar de cada projeto e clientes. */
export default function ProjectProgramDetailPage() {
  const { programId } = useParams<{ programId: string }>()
  const { user } = useAuth()
  const canManage = hasPermission(user?.permissions, "projetos.program.manage")
  const [params, setParams] = useSearchParams()
  const tab = (TAB_VALUES.includes(params.get("aba") as Tab) ? params.get("aba") : "pilares") as Tab
  const setTab = (v: Tab) => setParams((prev) => { const n = new URLSearchParams(prev); n.set("aba", v); return n }, { replace: true })
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
    return (
      <div className="w-full space-y-5 p-1">
        <Skeleton className="h-20 w-2/3 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }
  if (!data || !canManage) {
    return (
      <div className="w-full space-y-4 p-1">
        {back}
        <Card>
          <EmptyState icon={Layers} title="Programa indisponível" description={error ?? "Só quem gerencia o catálogo de Programas acessa esta tela."} />
        </Card>
      </div>
    )
  }

  const prog = data.program
  const tabs: TabDef<Tab>[] = [
    { value: "pilares", label: `Pilares (${data.pillars.length})`, icon: Waypoints },
    { value: "projetos", label: `Projetos do programa (${data.projects.length})`, icon: ListTree },
    { value: "clientes", label: "Clientes", icon: Users },
  ]
  const actions: MenuAction[] = [
    { label: "Novo pilar", icon: Plus, onClick: () => { setTab("pilares"); openNew() } },
    ...(unassigned > 0 && !suggesting ? [{ label: "Sugerir pela Área", icon: Wand2, onClick: () => void suggest() }] : []),
  ]

  return (
    <div className="w-full space-y-5 p-1">
      <DetailHeader
        crumbs={[{ label: "Programa", to: "/app/modules/projetos/programas" }, { label: prog.name }]}
        icon={prog.icon}
        color={colorFor(prog.color, prog.id)}
        title={prog.name}
        badge={<Pill tone={prog.is_active ? "emerald" : "slate"} dot>{prog.is_active ? "Ativo" : "Inativo"}</Pill>}
        description="Como o programa aparece no Portal do Cliente: pilares, projetos e quem acompanha."
        updatedAt={prog.updated_at ?? null}
        actions={actions}
      />

      <KpiRow className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCount icon={Waypoints} value={data.pillars.length} label="Pilares" onClick={() => setTab("pilares")} active={tab === "pilares"} />
        <KpiCount icon={Layers} value={data.projects.length} label="Projetos do programa" onClick={() => setTab("projetos")} active={tab === "projetos"} />
        <KpiCount
          icon={ListTree} value={unassigned} label="Projetos sem pilar" tone={unassigned > 0 ? "amber" : "slate"}
          highlight={unassigned > 0} onClick={() => setTab("projetos")}
        />
        <KpiPerson name={prog.responsavel_nome} role="Responsável (PO)" />
        <KpiText icon={CalendarClock} value={`${prog.oa_days} dias`} label="Operação Assistida prevista" tone="slate" />
      </KpiRow>

      <DetailTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "pilares" && (
        <SectionCard
          title="Pilares"
          icon={Waypoints}
          subtitle="Agrupam os projetos do programa na visão por pilares e no roadmap do Portal."
          right={
            <div className="flex flex-wrap gap-2">
              {unassigned > 0 && (
                <Button variant="outline" className="h-9 gap-1.5" onClick={() => void suggest()} disabled={suggesting}>
                  {suggesting ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Sugerir pela Área
                </Button>
              )}
              <Button className="h-9 gap-1.5" onClick={openNew}><Plus size={15} /> Novo pilar</Button>
            </div>
          }
        >
          {data.pillars.length === 0 ? (
            <p className="rounded-xl bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
              Nenhum pilar ainda. Crie os pilares (ex.: Financeiro, Suprimentos) ou use "Sugerir pela Área" como ponto de partida.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.pillars.map((p) => (
                <div key={p.id} className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm">
                  <IconTile icon={p.icon} color={colorFor(p.color, p.id)} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.name}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{p.description || "Sem descrição"}</p>
                    <Pill tone={p.project_count > 0 ? "blue" : "slate"} className="mt-2">{p.project_count} projeto(s)</Pill>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(p)} aria-label={`Editar ${p.name}`} title="Editar pilar">
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => void removePillar(p)} aria-label={`Excluir ${p.name}`} title="Excluir pilar">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {tab === "projetos" && (
        <SectionCard
          flush
          title={`Projetos do programa (${data.projects.length})`}
          icon={ListTree}
          subtitle={`Cards vinculados ao programa. Escolha o pilar de cada um${unassigned ? ` — ${unassigned} sem pilar` : ""}.`}
          right={unassigned > 0 ? <Pill tone="amber" dot>{unassigned} sem pilar</Pill> : undefined}
        >
          {data.projects.length === 0 ? (
            <EmptyState icon={Layers} title="Nenhum card vinculado a este programa" compact />
          ) : (
            <div className={TABLE.wrap}>
              <table className={`${TABLE.table} min-w-[760px]`}>
                <thead className={TABLE.thead}>
                  <tr>
                    <th className={TABLE.thFirst}>Projeto</th>
                    <th className={TABLE.th}>Etapa</th>
                    <th className={TABLE.th}>Área</th>
                    <th className={TABLE.th}>PO</th>
                    <th className={`${TABLE.th} w-56`}>Pilar</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((t) => (
                    <tr key={t.task_id} className={TABLE.tr}>
                      <td className={`${TABLE.tdFirst} max-w-[360px] truncate font-semibold`} title={t.title}>{t.title}</td>
                      <td className={TABLE.td}>{t.stage_name ? <Pill>{t.stage_name}</Pill> : <span className="text-muted-foreground">—</span>}</td>
                      <td className={`${TABLE.td} text-muted-foreground`}>{t.area_label ?? "—"}</td>
                      <td className={`${TABLE.td} whitespace-nowrap text-muted-foreground`}>{t.po_name ?? "—"}</td>
                      <td className={`${TABLE.td} py-2`}>
                        <Select value={t.pillar_id ?? NONE} onValueChange={(v) => void setPillar(t.task_id, v)} disabled={busyTask === t.task_id}>
                          <SelectTrigger className={`h-9 bg-background ${t.pillar_id ? "" : "text-muted-foreground"}`}>
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
        </SectionCard>
      )}

      {tab === "clientes" && (
        <Card className="p-5">
          {programId && <ProjectClientsSection programId={programId} />}
        </Card>
      )}

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
