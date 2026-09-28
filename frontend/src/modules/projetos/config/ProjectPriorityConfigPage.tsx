import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle, Columns3, Crosshair, Gauge, Grid2x2, Landmark, Loader2, Plus, Save, Scale, ShieldCheck, SlidersHorizontal, Trash2,
} from "lucide-react"

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
import { Skeleton } from "@/components/ui/skeleton"
import { DetailTabs, PageHeader, Pill, SectionCard, TABLE, type TabDef } from "@/components/ds"
import { toast } from "@/lib/toast"

type PriorityTab = "criteria" | "pillars" | "confidence" | "quadrants"

const TABS: TabDef<PriorityTab>[] = [
  { value: "criteria", label: "Critérios & Pesos", icon: Scale },
  { value: "pillars", label: "Pilares", icon: Landmark },
  { value: "confidence", label: "Confiança", icon: ShieldCheck },
  { value: "quadrants", label: "Quadrantes & Corte", icon: Grid2x2 },
]

export default function ProjectPriorityConfigPage() {
  const [tab, setTab] = useState<PriorityTab>("criteria")
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

  const header = (
    <PageHeader
      icon={Grid2x2}
      color="#2563EB"
      crumbs={[{ label: "Configurações", to: "/app/modules/projetos/config" }, { label: "Priorização" }]}
      title="Priorização (Impacto × Esforço)"
      description="Configure a metodologia: critérios, pesos, rubrica, pilares estratégicos, confiança e quadrantes."
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

  const criteriaTable = (axis: "impact" | "effort") => {
    const rows = criteria.filter((c) => c.axis === axis).sort((a, b) => a.order - b.order)
    const total = sumByAxis[axis]
    const off = Math.abs(total - 1) > 0.001
    return (
      <SectionCard
        title={axis === "impact" ? "Impacto" : "Esforço"}
        subtitle="Peso de cada critério e a rubrica (valor → descrição) usada na triagem."
        icon={axis === "impact" ? Crosshair : Gauge}
        right={
          <Pill tone={off ? "red" : "slate"} className="tabular-nums">
            {off && <AlertTriangle size={12} />}
            Soma dos pesos: {Math.round(total * 100)}%
          </Pill>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_90px_50px_28px] items-center gap-2 px-3 text-xs text-muted-foreground">
            <span>Critério</span>
            <span>Peso</span>
            <span className="text-right">Ativo</span>
            <span className="sr-only">Remover</span>
          </div>
          {rows.map((c) => (
            <div key={c.code} className="space-y-2 rounded-xl border p-3">
              <div className="grid grid-cols-[1fr_90px_50px_28px] items-center gap-2">
                <Input
                  value={c.label}
                  onChange={(e) => onLabelChange(c, e.target.value)}
                  className="h-9 text-sm font-medium"
                />
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round(c.weight * 100)}
                    onChange={(e) => patchCriterion(c.code, c.axis, { weight: Number(e.target.value) / 100 })}
                    className="h-9 text-sm tabular-nums"
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
              <div className="space-y-1.5 rounded-lg bg-muted/40 p-2.5">
                <p className="text-xs text-muted-foreground">Escala (valor → descrição)</p>
                {c.scale.map((p, i) => (
                  <div key={i} className="grid grid-cols-[56px_1fr_28px] items-center gap-2">
                    <Input
                      type="number"
                      value={p.value}
                      onChange={(e) => updatePoint(c, i, { value: Number(e.target.value) })}
                      className="h-8 bg-background text-sm tabular-nums"
                    />
                    <Input
                      value={p.description}
                      placeholder="Descrição exibida na triagem"
                      onChange={(e) => updatePoint(c, i, { description: e.target.value })}
                      className="h-8 bg-background text-sm"
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
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus size={12} /> Adicionar valor
                </button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={() => addCriterion(axis)} className="h-10 w-full gap-1.5">
            <Plus size={15} /> Adicionar critério de {axis === "impact" ? "Impacto" : "Esforço"}
          </Button>
        </div>
      </SectionCard>
    )
  }

  return (
    <div className="w-full space-y-5">
      {header}

      <DetailTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "criteria" && (
        <div className="space-y-4">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {criteriaTable("impact")}
            {criteriaTable("effort")}
          </div>
          <Button className="h-10 gap-1.5" onClick={() => void saveCriteria()} disabled={saving === "criteria"}>
            {saving === "criteria" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar critérios
          </Button>
        </div>
      )}

      {tab === "pillars" && (
        <div className="space-y-4">
          <SectionCard
            title="Pilares estratégicos"
            subtitle="Código, nome, perspectiva, modulador e cor de cada pilar."
            icon={Landmark}
            flush
          >
            <div className={TABLE.wrap}>
              <table className={`${TABLE.table} min-w-[760px]`}>
                <thead className={TABLE.thead}>
                  <tr>
                    <th className={`${TABLE.thFirst} w-24`}>Código</th>
                    <th className={TABLE.th}>Nome</th>
                    <th className={`${TABLE.th} w-48`}>Perspectiva</th>
                    <th className={`${TABLE.th} w-28`}>Modulador</th>
                    <th className={`${TABLE.th} w-20`}>Cor</th>
                    <th className={`${TABLE.th} w-20`}>Ativo</th>
                  </tr>
                </thead>
                <tbody>
                  {pillars.map((p, idx) => (
                    <tr key={p.id} className={TABLE.tr}>
                      <td className={TABLE.tdFirst}>
                        <Input value={p.code} onChange={(e) => setPillars((prev) => prev.map((x, i) => (i === idx ? { ...x, code: e.target.value } : x)))} className="h-9 text-sm" />
                      </td>
                      <td className={TABLE.td}>
                        <Input value={p.label} onChange={(e) => setPillars((prev) => prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))} className="h-9 text-sm" />
                      </td>
                      <td className={TABLE.td}>
                        <Input value={p.perspective} onChange={(e) => setPillars((prev) => prev.map((x, i) => (i === idx ? { ...x, perspective: e.target.value } : x)))} className="h-9 text-sm" />
                      </td>
                      <td className={TABLE.td}>
                        <Input type="number" step="0.1" min={0} max={5} value={p.modifier} onChange={(e) => setPillars((prev) => prev.map((x, i) => (i === idx ? { ...x, modifier: Number(e.target.value) } : x)))} className="h-9 text-sm tabular-nums" title="Modulador" />
                      </td>
                      <td className={TABLE.td}>
                        <Input type="color" value={p.color} onChange={(e) => setPillars((prev) => prev.map((x, i) => (i === idx ? { ...x, color: e.target.value } : x)))} className="h-9 w-full p-1" />
                      </td>
                      <td className={TABLE.td}>
                        <Switch checked={p.is_active} onCheckedChange={(v) => setPillars((prev) => prev.map((x, i) => (i === idx ? { ...x, is_active: v } : x)))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
          <Button className="h-10 gap-1.5" onClick={() => void savePillars()} disabled={saving === "pillars"}>
            {saving === "pillars" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar pilares
          </Button>
        </div>
      )}

      {tab === "confidence" && (
        <div className="space-y-4">
          {settings && (
            <SectionCard title="Confiança ativa da metodologia" icon={SlidersHorizontal}>
              <div className="flex flex-wrap items-end gap-4">
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Confiança ativa</span>
                  <Select
                    value={settings.confidence_id ?? "__none__"}
                    onValueChange={(v) => setSettings({ ...settings, confidence_id: v === "__none__" ? null : v })}
                  >
                    <SelectTrigger className="h-10 w-64 bg-background">
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
                </label>
                <p className="max-w-md pb-2 text-sm text-muted-foreground">
                  Aplicada a todas as demandas (parâmetro da metodologia). Os níveis abaixo definem os divisores disponíveis.
                </p>
              </div>
            </SectionCard>
          )}
          <SectionCard
            title="Níveis de confiança"
            subtitle="O divisor reduz o impacto efetivo (ex.: confiança baixa = ÷1,5 penaliza estimativas sem dados)."
            icon={ShieldCheck}
            flush
          >
            <div className={TABLE.wrap}>
              <table className={`${TABLE.table} min-w-[480px]`}>
                <thead className={TABLE.thead}>
                  <tr>
                    <th className={TABLE.thFirst}>Nível</th>
                    <th className={`${TABLE.th} w-32`}>Divisor</th>
                    <th className={`${TABLE.th} w-20`}>Ativo</th>
                  </tr>
                </thead>
                <tbody>
                  {confidence.map((c, idx) => (
                    <tr key={c.id} className={TABLE.tr}>
                      <td className={TABLE.tdFirst}>
                        <Input value={c.label} onChange={(e) => setConfidence((prev) => prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))} className="h-9 text-sm" />
                      </td>
                      <td className={TABLE.td}>
                        <Input type="number" step="0.1" min={0.1} value={c.divisor} onChange={(e) => setConfidence((prev) => prev.map((x, i) => (i === idx ? { ...x, divisor: Number(e.target.value) } : x)))} className="h-9 text-sm tabular-nums" title="Divisor" />
                      </td>
                      <td className={TABLE.td}>
                        <Switch checked={c.is_active} onCheckedChange={(v) => setConfidence((prev) => prev.map((x, i) => (i === idx ? { ...x, is_active: v } : x)))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
          <Button className="h-10 gap-1.5" onClick={() => void saveConfidence()} disabled={saving === "confidence"}>
            {saving === "confidence" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar confiança
          </Button>
        </div>
      )}

      {tab === "quadrants" && (
        <div className="space-y-4">
          {settings && (
            <SectionCard title="Cortes da matriz" subtitle="Onde a matriz divide Impacto e Esforço (de 1 a 5)." icon={SlidersHorizontal}>
              <div className="flex flex-wrap items-end gap-4">
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Corte do Impacto</span>
                  <Input type="number" step="0.1" min={1} max={5} value={settings.impact_cut} onChange={(e) => setSettings({ ...settings, impact_cut: Number(e.target.value) })} className="h-10 w-28 text-sm tabular-nums" />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Corte do Esforço</span>
                  <Input type="number" step="0.1" min={1} max={5} value={settings.effort_cut} onChange={(e) => setSettings({ ...settings, effort_cut: Number(e.target.value) })} className="h-10 w-28 text-sm tabular-nums" />
                </label>
                <label className="flex h-10 items-center gap-2 text-sm">
                  <Switch checked={settings.is_enabled} onCheckedChange={(v) => setSettings({ ...settings, is_enabled: v })} />
                  Funcionalidade habilitada
                </label>
              </div>
            </SectionCard>
          )}
          <SectionCard title="Quadrantes" subtitle="Nome, cor e ação recomendada de cada quadrante." icon={Columns3} flush>
            <div className={TABLE.wrap}>
              <table className={`${TABLE.table} min-w-[560px]`}>
                <thead className={TABLE.thead}>
                  <tr>
                    <th className={`${TABLE.thFirst} w-44`}>Quadrante</th>
                    <th className={`${TABLE.th} w-20`}>Cor</th>
                    <th className={TABLE.th}>Ação recomendada</th>
                  </tr>
                </thead>
                <tbody>
                  {quadrants.map((q, idx) => (
                    <tr key={q.id} className={TABLE.tr}>
                      <td className={TABLE.tdFirst}>
                        <Input value={q.label} onChange={(e) => setQuadrants((prev) => prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))} className="h-9 text-sm" />
                      </td>
                      <td className={TABLE.td}>
                        <Input type="color" value={q.color} onChange={(e) => setQuadrants((prev) => prev.map((x, i) => (i === idx ? { ...x, color: e.target.value } : x)))} className="h-9 w-full p-1" />
                      </td>
                      <td className={TABLE.td}>
                        <Input value={q.action_hint ?? ""} placeholder="Ação recomendada" onChange={(e) => setQuadrants((prev) => prev.map((x, i) => (i === idx ? { ...x, action_hint: e.target.value } : x)))} className="h-9 text-sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
          <Button className="h-10 gap-1.5" onClick={() => void saveQuadrantsAndSettings()} disabled={saving === "quadrants"}>
            {saving === "quadrants" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar quadrantes e cortes
          </Button>
        </div>
      )}
    </div>
  )
}
