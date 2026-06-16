import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from "lucide-react"

import {
  projetosApi,
  type PriorityCriterion,
  type PriorityConfidenceLevel,
  type PriorityPillar,
  type PriorityQuadrant,
  type PriorityScalePoint,
  type PrioritySettings,
} from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/toast"

export default function ProjectPriorityConfigPage() {
  const [loading, setLoading] = useState(true)
  const [criteria, setCriteria] = useState<PriorityCriterion[]>([])
  const [pillars, setPillars] = useState<PriorityPillar[]>([])
  const [confidence, setConfidence] = useState<PriorityConfidenceLevel[]>([])
  const [quadrants, setQuadrants] = useState<PriorityQuadrant[]>([])
  const [settings, setSettings] = useState<PrioritySettings | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      projetosApi.listPriorityCriteria(),
      projetosApi.listPriorityPillars(),
      projetosApi.listPriorityConfidence(),
      projetosApi.listPriorityQuadrants(),
      projetosApi.getPrioritySettings(),
    ])
      .then(([cr, pl, cf, qd, st]) => {
        setCriteria(cr)
        setPillars(pl)
        setConfidence(cf)
        setQuadrants(qd)
        setSettings(st)
      })
      .catch(() => toast.error("Não foi possível carregar a configuração de priorização."))
      .finally(() => setLoading(false))
  }, [])

  const sumByAxis = useMemo(() => {
    const s = { impact: 0, effort: 0 }
    for (const c of criteria) if (c.is_active) s[c.axis] += c.weight
    return s
  }, [criteria])

  const patchCriterion = (code: string, axis: string, patch: Partial<PriorityCriterion>) =>
    setCriteria((prev) => prev.map((c) => (c.code === code && c.axis === axis ? { ...c, ...patch } : c)))

  const setScale = (c: PriorityCriterion, scale: PriorityScalePoint[]) => patchCriterion(c.code, c.axis, { scale })
  const updatePoint = (c: PriorityCriterion, idx: number, patch: Partial<PriorityScalePoint>) =>
    setScale(c, c.scale.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  const addPoint = (c: PriorityCriterion) => {
    const nextVal = c.scale.length ? Math.max(...c.scale.map((p) => p.value)) + 1 : 1
    setScale(c, [...c.scale, { value: nextVal, description: "" }])
  }
  const removePoint = (c: PriorityCriterion, idx: number) => setScale(c, c.scale.filter((_, i) => i !== idx))

  const slugify = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40)

  const addCriterion = (axis: "impact" | "effort") => {
    setCriteria((prev) => {
      const codes = new Set(prev.filter((c) => c.axis === axis).map((c) => c.code))
      const base = "novo_criterio"
      let code = base
      let n = 2
      while (codes.has(code)) code = `${base}_${n++}`
      const order = Math.max(0, ...prev.filter((c) => c.axis === axis).map((c) => c.order)) + 1
      const novo: PriorityCriterion = {
        id: `tmp-${axis}-${code}`,
        axis,
        code,
        label: "Novo critério",
        weight: 0,
        scale: [1, 2, 3, 4, 5].map((v) => ({ value: v, description: "" })),
        order,
        is_active: true,
      }
      return [...prev, novo]
    })
  }

  const removeCriterion = (c: PriorityCriterion) =>
    setCriteria((prev) => prev.filter((x) => !(x.axis === c.axis && x.code === c.code)))

  // mantém o `code` coerente com o rótulo enquanto o critério é novo (ainda não salvo)
  const onLabelChange = (c: PriorityCriterion, label: string) => {
    if (c.id.startsWith("tmp-")) {
      const codes = new Set(criteria.filter((x) => x.axis === c.axis && x.id !== c.id).map((x) => x.code))
      let code = slugify(label) || "criterio"
      const baseCode = code
      let n = 2
      while (codes.has(code)) code = `${baseCode}_${n++}`
      patchCriterion(c.code, c.axis, { label, code })
    } else {
      patchCriterion(c.code, c.axis, { label })
    }
  }

  async function saveCriteria() {
    for (const axis of ["impact", "effort"] as const) {
      const active = criteria.filter((c) => c.axis === axis && c.is_active)
      const total = active.reduce((a, c) => a + c.weight, 0)
      if (active.length && Math.abs(total - 1) > 0.001) {
        toast.error(`A soma dos pesos do eixo ${axis === "impact" ? "Impacto" : "Esforço"} deve ser 100% (atual ${Math.round(total * 100)}%).`)
        return
      }
    }
    setSaving("criteria")
    try {
      const saved = await projetosApi.savePriorityCriteria(criteria.map(({ id: _id, ...rest }) => rest))
      setCriteria(saved)
      toast.success("Critérios salvos. Demandas pontuadas foram recalculadas.")
    } catch {
      toast.error("Falha ao salvar critérios.")
    } finally {
      setSaving(null)
    }
  }

  async function savePillars() {
    setSaving("pillars")
    try {
      const saved = await projetosApi.savePriorityPillars(pillars.map(({ id: _id, ...rest }) => rest))
      setPillars(saved)
      toast.success("Pilares salvos. Demandas pontuadas foram recalculadas.")
    } catch {
      toast.error("Falha ao salvar pilares.")
    } finally {
      setSaving(null)
    }
  }

  async function saveConfidence() {
    if (!settings) return
    setSaving("confidence")
    try {
      const saved = await projetosApi.savePriorityConfidence(confidence.map(({ id: _id, ...rest }) => rest))
      setConfidence(saved)
      // persiste também a confiança ATIVA (global) da metodologia
      const updated = await projetosApi.updatePrioritySettings({
        impact_cut: settings.impact_cut,
        effort_cut: settings.effort_cut,
        confidence_id: settings.confidence_id,
        is_enabled: settings.is_enabled,
      })
      setSettings(updated)
      toast.success("Confiança salva. Demandas pontuadas foram recalculadas.")
    } catch {
      toast.error("Falha ao salvar confiança.")
    } finally {
      setSaving(null)
    }
  }

  async function saveQuadrantsAndSettings() {
    if (!settings) return
    setSaving("quadrants")
    try {
      const [qd] = await Promise.all([
        projetosApi.savePriorityQuadrants(quadrants.map(({ id: _id, ...rest }) => rest)),
        projetosApi.updatePrioritySettings({
          impact_cut: settings.impact_cut,
          effort_cut: settings.effort_cut,
          confidence_id: settings.confidence_id,
          is_enabled: settings.is_enabled,
        }),
      ])
      setQuadrants(qd)
      toast.success("Quadrantes e cortes salvos. Demandas pontuadas foram recalculadas.")
    } catch {
      toast.error("Falha ao salvar quadrantes/cortes.")
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <Skeleton className="h-72 w-full" />

  const criteriaTable = (axis: "impact" | "effort") => {
    const rows = criteria.filter((c) => c.axis === axis).sort((a, b) => a.order - b.order)
    const total = sumByAxis[axis]
    const off = Math.abs(total - 1) > 0.001
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{axis === "impact" ? "Impacto" : "Esforço"}</p>
          <p className={`text-xs font-medium ${off ? "text-destructive" : "text-muted-foreground"}`}>
            {off && <AlertTriangle size={12} className="mr-1 inline" />}
            Soma dos pesos: {Math.round(total * 100)}%
          </p>
        </div>
        <div className="space-y-3">
          {rows.map((c) => (
            <div key={c.code} className="space-y-2 rounded-md border p-3">
              <div className="grid grid-cols-[1fr_90px_50px_28px] items-center gap-2">
                <Input
                  value={c.label}
                  onChange={(e) => onLabelChange(c, e.target.value)}
                  className="h-8 text-sm font-medium"
                />
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(c.weight * 100)}
                    onChange={(e) => patchCriterion(c.code, c.axis, { weight: Number(e.target.value) / 100 })}
                    className="h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <div className="flex items-center justify-end">
                  <Switch checked={c.is_active} onCheckedChange={(v) => patchCriterion(c.code, c.axis, { is_active: v })} />
                </div>
                <button
                  type="button"
                  onClick={() => removeCriterion(c)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
                  title="Remover critério"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="space-y-1 pl-1">
                <p className="text-[11px] font-semibold text-muted-foreground">Escala (valor → descrição)</p>
                {c.scale.map((p, i) => (
                  <div key={i} className="grid grid-cols-[56px_1fr_28px] items-center gap-2">
                    <Input
                      type="number"
                      value={p.value}
                      onChange={(e) => updatePoint(c, i, { value: Number(e.target.value) })}
                      className="h-7 text-sm"
                    />
                    <Input
                      value={p.description}
                      placeholder="Descrição exibida na triagem"
                      onChange={(e) => updatePoint(c, i, { description: e.target.value })}
                      className="h-7 text-[12px]"
                    />
                    <button
                      type="button"
                      onClick={() => removePoint(c, i)}
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
                      title="Remover valor"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addPoint(c)}
                  className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <Plus size={12} /> Adicionar valor
                </button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => addCriterion(axis)} className="w-full">
            <Plus size={14} /> Adicionar critério de {axis === "impact" ? "Impacto" : "Esforço"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      <div>
        <h2 className="text-lg font-bold">Priorização (Impacto × Esforço)</h2>
        <p className="text-sm text-muted-foreground">
          Configure a metodologia: critérios, pesos, rubrica, pilares estratégicos, confiança e quadrantes.
        </p>
      </div>

      <Tabs defaultValue="criteria">
        <TabsList>
          <TabsTrigger value="criteria">Critérios & Pesos</TabsTrigger>
          <TabsTrigger value="pillars">Pilares</TabsTrigger>
          <TabsTrigger value="confidence">Confiança</TabsTrigger>
          <TabsTrigger value="quadrants">Quadrantes & Corte</TabsTrigger>
        </TabsList>

        <TabsContent value="criteria" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {criteriaTable("impact")}
            {criteriaTable("effort")}
          </div>
          <Button onClick={() => void saveCriteria()} disabled={saving === "criteria"}>
            {saving === "criteria" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar critérios
          </Button>
        </TabsContent>

        <TabsContent value="pillars" className="mt-4 space-y-3">
          <div className="space-y-2">
            {pillars.map((p, idx) => (
              <div key={p.id} className="grid grid-cols-[60px_1fr_180px_80px_50px_60px] items-center gap-2 rounded-md border p-2">
                <Input value={p.code} onChange={(e) => setPillars((prev) => prev.map((x, i) => (i === idx ? { ...x, code: e.target.value } : x)))} className="h-8 text-sm" />
                <Input value={p.label} onChange={(e) => setPillars((prev) => prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))} className="h-8 text-sm" />
                <Input value={p.perspective} onChange={(e) => setPillars((prev) => prev.map((x, i) => (i === idx ? { ...x, perspective: e.target.value } : x)))} className="h-8 text-sm" />
                <Input type="number" step="0.1" min={0} max={5} value={p.modifier} onChange={(e) => setPillars((prev) => prev.map((x, i) => (i === idx ? { ...x, modifier: Number(e.target.value) } : x)))} className="h-8 text-sm" title="Modulador" />
                <Input type="color" value={p.color} onChange={(e) => setPillars((prev) => prev.map((x, i) => (i === idx ? { ...x, color: e.target.value } : x)))} className="h-8 w-full p-1" />
                <Switch checked={p.is_active} onCheckedChange={(v) => setPillars((prev) => prev.map((x, i) => (i === idx ? { ...x, is_active: v } : x)))} />
              </div>
            ))}
          </div>
          <Button onClick={() => void savePillars()} disabled={saving === "pillars"}>
            {saving === "pillars" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar pilares
          </Button>
        </TabsContent>

        <TabsContent value="confidence" className="mt-4 space-y-3">
          {settings && (
            <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Confiança ativa da metodologia</p>
                <Select
                  value={settings.confidence_id ?? "__none__"}
                  onValueChange={(v) => setSettings({ ...settings, confidence_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger className="h-8 w-64">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma (÷1)</SelectItem>
                    {confidence.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label} (÷{c.divisor})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="max-w-md text-[11px] text-muted-foreground">
                Aplicada a todas as demandas (parâmetro da metodologia). Os níveis abaixo definem os divisores disponíveis.
              </p>
            </div>
          )}
          <div className="space-y-2">
            {confidence.map((c, idx) => (
              <div key={c.id} className="grid grid-cols-[1fr_90px_60px] items-center gap-2 rounded-md border p-2">
                <Input value={c.label} onChange={(e) => setConfidence((prev) => prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))} className="h-8 text-sm" />
                <Input type="number" step="0.1" min={0.1} value={c.divisor} onChange={(e) => setConfidence((prev) => prev.map((x, i) => (i === idx ? { ...x, divisor: Number(e.target.value) } : x)))} className="h-8 text-sm" title="Divisor" />
                <Switch checked={c.is_active} onCheckedChange={(v) => setConfidence((prev) => prev.map((x, i) => (i === idx ? { ...x, is_active: v } : x)))} />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">O divisor reduz o impacto efetivo (ex.: confiança baixa = ÷1,5 penaliza estimativas sem dados).</p>
          <Button onClick={() => void saveConfidence()} disabled={saving === "confidence"}>
            {saving === "confidence" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar confiança
          </Button>
        </TabsContent>

        <TabsContent value="quadrants" className="mt-4 space-y-4">
          {settings && (
            <div className="flex flex-wrap items-end gap-4 rounded-md border p-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Corte do Impacto</p>
                <Input type="number" step="0.1" min={1} max={5} value={settings.impact_cut} onChange={(e) => setSettings({ ...settings, impact_cut: Number(e.target.value) })} className="h-8 w-24 text-sm" />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Corte do Esforço</p>
                <Input type="number" step="0.1" min={1} max={5} value={settings.effort_cut} onChange={(e) => setSettings({ ...settings, effort_cut: Number(e.target.value) })} className="h-8 w-24 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={settings.is_enabled} onCheckedChange={(v) => setSettings({ ...settings, is_enabled: v })} />
                Funcionalidade habilitada
              </label>
            </div>
          )}
          <div className="space-y-2">
            {quadrants.map((q, idx) => (
              <div key={q.id} className="grid grid-cols-[140px_50px_1fr] items-center gap-2 rounded-md border p-2">
                <Input value={q.label} onChange={(e) => setQuadrants((prev) => prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))} className="h-8 text-sm" />
                <Input type="color" value={q.color} onChange={(e) => setQuadrants((prev) => prev.map((x, i) => (i === idx ? { ...x, color: e.target.value } : x)))} className="h-8 w-full p-1" />
                <Input value={q.action_hint ?? ""} placeholder="Ação recomendada" onChange={(e) => setQuadrants((prev) => prev.map((x, i) => (i === idx ? { ...x, action_hint: e.target.value } : x)))} className="h-8 text-sm" />
              </div>
            ))}
          </div>
          <Button onClick={() => void saveQuadrantsAndSettings()} disabled={saving === "quadrants"}>
            {saving === "quadrants" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar quadrantes e cortes
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  )
}
