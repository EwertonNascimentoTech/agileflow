import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutGrid, ListOrdered, Loader2, Plus, Save, Trash2 } from "lucide-react"

import { projetosApi, type CardFieldKey, type Project, type ProjectCardAvailableField, type ProjectCardField, type ProjectFunnel } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Card, PageHeader, Pill, SectionCard } from "@/components/ds"
import { toast } from "@/lib/toast"

const CUSTOM_PREFIX = "form:"
const isCustomKey = (key: string) => key.startsWith(CUSTOM_PREFIX)

const HINTS: Record<string, string> = {
  demand_type: "Etiqueta do tipo da demanda",
  priority_quadrant: "Badge do quadrante (Quick Win, Big Bet, …)",
  card_classification: "Desenvolvimento, Implantação ou Melhoria (portfólio de produtos)",
  schedule_sla: "Em dia / Alerta / Atrasado (prazo + SLA da etapa)",
  code: "Código curto do card",
  title: "Título da demanda",
  description: "Resumo da descrição",
  parent: "Nome do projeto/card pai",
  children_progress: "% de subtarefas concluídas",
  diretoria: "Diretoria",
  area: "Área",
  due_date: "Data de prazo",
  assignee: "Avatar do responsável",
  requester: "Quem criou a solicitação de origem (útil em Projetos convertidos). Em Prospectar, prefira o campo de formulário “Requisitante”.",
}

export default function ProjectCardLayoutConfigPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [funnels, setFunnels] = useState<ProjectFunnel[]>([])
  const [projectId, setProjectId] = useState("")
  const [funnelId, setFunnelId] = useState("")
  const [fields, setFields] = useState<ProjectCardField[]>([])
  const [available, setAvailable] = useState<ProjectCardAvailableField[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingFields, setLoadingFields] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addKey, setAddKey] = useState("")

  useEffect(() => {
    projetosApi.listProjects(true)
      .then((ps) => {
        setProjects(ps)
        if (ps[0]) setProjectId(ps[0].id)
      })
      .catch(() => toast.error("Não foi possível carregar os projetos."))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!projectId) return
    projetosApi.listFunnels(projectId, true).then((fs) => {
      const ordered = [...fs].sort((a, b) => a.order - b.order)
      setFunnels(ordered)
      const def = ordered.find((f) => f.is_default) ?? ordered[0]
      setFunnelId(def?.id ?? "")
    })
  }, [projectId])

  useEffect(() => {
    if (!funnelId) {
      setFields([])
      setAvailable([])
      return
    }
    setLoadingFields(true)
    setAddKey("")
    Promise.all([
      projetosApi.listCardFields(funnelId),
      projetosApi.listAvailableCardFields(funnelId).catch(() => [] as ProjectCardAvailableField[]),
    ])
      .then(([f, av]) => {
        setFields([...f].sort((a, b) => a.order - b.order))
        setAvailable(av)
      })
      .catch(() => toast.error("Não foi possível carregar o layout do card."))
      .finally(() => setLoadingFields(false))
  }, [funnelId])

  // Campos personalizados ainda não incluídos no layout.
  const availableToAdd = useMemo(() => {
    const present = new Set(fields.map((f) => f.field_key))
    return available.filter((a) => !present.has(`${CUSTOM_PREFIX}${a.field_key}` as CardFieldKey))
  }, [available, fields])

  const addCustomField = (fieldKey: string) => {
    const meta = available.find((a) => a.field_key === fieldKey)
    if (!meta) return
    const key = `${CUSTOM_PREFIX}${meta.field_key}` as CardFieldKey
    setFields((prev) => {
      if (prev.some((f) => f.field_key === key)) return prev
      return [
        ...prev,
        {
          id: `tmp-${meta.field_key}`,
          funnel_id: funnelId,
          field_key: key,
          label: meta.label,
          is_visible: true,
          order: prev.length,
        },
      ]
    })
    setAddKey("")
    toast.success(`Campo “${meta.label}” adicionado. Clique em Salvar para confirmar.`)
  }

  const removeField = (key: string) =>
    setFields((prev) => prev.filter((f) => f.field_key !== key).map((f, i) => ({ ...f, order: i })))

  const move = (idx: number, dir: -1 | 1) => {
    setFields((prev) => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next.map((f, i) => ({ ...f, order: i }))
    })
  }
  const patch = (key: string, p: Partial<ProjectCardField>) =>
    setFields((prev) => prev.map((f) => (f.field_key === key ? { ...f, ...p } : f)))

  async function save() {
    if (!funnelId) return
    setSaving(true)
    try {
      const saved = await projetosApi.saveCardFields(
        funnelId,
        fields.map((f, i) => ({ field_key: f.field_key, label: f.label, is_visible: f.is_visible, order: i })),
      )
      setFields([...saved].sort((a, b) => a.order - b.order))
      toast.success("Layout do card salvo para este kanban.")
    } catch {
      toast.error("Falha ao salvar o layout do card.")
    } finally {
      setSaving(false)
    }
  }

  const header = (
    <PageHeader
      icon={LayoutGrid}
      color="#2563EB"
      crumbs={[{ label: "Configurações", to: "/app/modules/projetos/config" }, { label: "Layout do card" }]}
      title="Layout do card"
      description={
        <>
          O layout é definido <strong>por kanban</strong>: escolha o projeto e o funil, defina o que aparece nos cards, a ordem e os rótulos.
        </>
      }
    />
  )

  if (loading) {
    return (
      <div className="w-full space-y-5">
        {header}
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    )
  }

  const visibleCount = fields.filter((f) => f.is_visible).length

  return (
    <div className="w-full space-y-5">
      {header}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Projeto</span>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-10 w-56 bg-background"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Kanban (funil)</span>
            <Select value={funnelId} onValueChange={setFunnelId}>
              <SelectTrigger className="h-10 w-56 bg-background"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {funnels.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        </div>
      </Card>

      {!funnelId ? (
        <Card>
          <EmptyState icon={LayoutGrid} title="Selecione um kanban" description="Escolha o projeto e o funil para configurar o layout dos cards." />
        </Card>
      ) : loadingFields ? (
        <Skeleton className="h-72 w-full rounded-2xl" />
      ) : (
        <>
          <SectionCard
            title="Campos do card"
            subtitle="Ordem, rótulo e visibilidade de cada informação no card do quadro."
            icon={ListOrdered}
            right={<Pill tone="blue">{visibleCount} de {fields.length} visíveis</Pill>}
            flush
          >
            <ul className="divide-y">
              {fields.map((f, idx) => (
                <li
                  key={f.field_key}
                  className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 ${f.is_visible ? "" : "opacity-60"}`}
                >
                  <div className="flex flex-col">
                    <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" onClick={() => move(idx, 1)} disabled={idx === fields.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ArrowDown size={14} />
                    </button>
                  </div>
                  <div className="min-w-0">
                    <Input value={f.label} onChange={(e) => patch(f.field_key, { label: e.target.value })} className="h-9 text-sm" />
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {isCustomKey(f.field_key) ? "Campo personalizado do formulário" : (HINTS[f.field_key] ?? f.field_key)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      {f.is_visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      <Switch checked={f.is_visible} onCheckedChange={(v) => patch(f.field_key, { is_visible: v })} />
                    </label>
                    {isCustomKey(f.field_key) && (
                      <button
                        type="button"
                        onClick={() => removeField(f.field_key)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Remover campo personalizado do layout"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-2 border-t bg-muted/40 px-5 py-4">
              <label className="block space-y-1">
                <span className="flex items-center gap-1 text-sm font-semibold">
                  <Plus size={14} />
                  Adicionar campo personalizado
                </span>
                <Select value={addKey} onValueChange={addCustomField} disabled={availableToAdd.length === 0}>
                  <SelectTrigger className="h-10 w-full bg-background sm:w-72">
                    <SelectValue placeholder={availableToAdd.length === 0 ? "Nenhum campo disponível" : "Selecione para adicionar…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableToAdd.map((a) => (
                      <SelectItem key={a.field_key} value={a.field_key}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <p className="text-xs text-muted-foreground">
                Os campos personalizados vêm dos formulários dos tipos de demanda deste kanban (ex.: “Requisitante”). O valor preenchido em cada card aparecerá no quadro.
              </p>
            </div>
          </SectionCard>

          <Button className="h-10 gap-1.5" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar layout deste kanban
          </Button>
        </>
      )}
    </div>
  )
}
