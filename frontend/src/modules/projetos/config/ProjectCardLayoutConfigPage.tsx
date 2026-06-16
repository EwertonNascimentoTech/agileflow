import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutGrid, Loader2, Plus, Save, Trash2 } from "lucide-react"

import { projetosApi, type CardFieldKey, type Project, type ProjectCardAvailableField, type ProjectCardField, type ProjectFunnel } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { toast } from "@/lib/toast"

const CUSTOM_PREFIX = "form:"
const isCustomKey = (key: string) => key.startsWith(CUSTOM_PREFIX)

const HINTS: Record<string, string> = {
  demand_type: "Etiqueta do tipo da demanda",
  priority_quadrant: "Badge do quadrante (Quick Win, Big Bet, …)",
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

  if (loading) return <Skeleton className="h-72 w-full" />

  return (
    <div className="w-full space-y-4">
      <div>
        <h2 className="text-lg font-bold">Layout do card</h2>
        <p className="text-sm text-muted-foreground">
          O layout é definido <strong>por kanban</strong>: escolha o projeto e o funil, defina o que aparece nos cards, a ordem e os rótulos.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div>
          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Projeto</p>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Kanban (funil)</p>
          <Select value={funnelId} onValueChange={setFunnelId}>
            <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {funnels.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!funnelId ? (
        <EmptyState icon={LayoutGrid} title="Selecione um kanban" description="Escolha o projeto e o funil para configurar o layout dos cards." />
      ) : loadingFields ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          <div className="space-y-2">
            {fields.map((f, idx) => (
              <div
                key={f.field_key}
                className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border p-2 ${f.is_visible ? "" : "opacity-60"}`}
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
                  <Input value={f.label} onChange={(e) => patch(f.field_key, { label: e.target.value })} className="h-8 text-sm" />
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
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
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                <Plus size={12} className="mr-1 inline" />
                Adicionar campo personalizado
              </p>
              <Select value={addKey} onValueChange={addCustomField} disabled={availableToAdd.length === 0}>
                <SelectTrigger className="h-9 w-full sm:w-72">
                  <SelectValue placeholder={availableToAdd.length === 0 ? "Nenhum campo disponível" : "Selecione para adicionar…"} />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map((a) => (
                    <SelectItem key={a.field_key} value={a.field_key}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Os campos personalizados vêm dos formulários dos tipos de demanda deste kanban (ex.: “Requisitante”). O valor preenchido em cada card aparecerá no quadro.
          </p>

          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar layout deste kanban
          </Button>
        </>
      )}
    </div>
  )
}
