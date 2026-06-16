import { useEffect, useMemo, useState } from "react"
import { Loader2, Save, Trash2, Target } from "lucide-react"

import {
  projetosApi,
  type PriorityCriterion,
  type PriorityConfidenceLevel,
  type PriorityPillar,
  type PriorityQuadrant,
  type PrioritySettings,
} from "@/api/projetos"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/toast"
import { computePriority } from "./computePriority"
import { QuadrantBadge } from "./QuadrantBadge"

const NONE = "__none__"

type PriorityMode = "edit" | "view" | "hidden"

/** Widget de triagem: pontua a demanda (Impacto × Esforço) com cálculo ao vivo.
 * `mode` vem da etapa atual do kanban: 'edit' (preencher), 'view' (somente leitura), 'hidden'. */
export function ProjectPriorityWidget({
  taskId,
  mode = "edit",
  onSaved,
}: {
  taskId: string
  mode?: PriorityMode
  /** Chamado após salvar/limpar a pontuação — o pai usa para refazer fetch (matriz/portfólio). */
  onSaved?: () => void
}) {
  const readOnly = mode === "view"
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(true)

  const [criteria, setCriteria] = useState<PriorityCriterion[]>([])
  const [pillars, setPillars] = useState<PriorityPillar[]>([])
  const [confidence, setConfidence] = useState<PriorityConfidenceLevel[]>([])
  const [quadrants, setQuadrants] = useState<PriorityQuadrant[]>([])
  const [settings, setSettings] = useState<PrioritySettings | null>(null)

  const [pillarIds, setPillarIds] = useState<string[]>([])
  const [impactScores, setImpactScores] = useState<Record<string, number>>({})
  const [effortScores, setEffortScores] = useState<Record<string, number>>({})
  const [hasScore, setHasScore] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      projetosApi.getPrioritySettings(),
      projetosApi.listPriorityCriteria(),
      projetosApi.listPriorityPillars(),
      projetosApi.listPriorityConfidence(),
      projetosApi.listPriorityQuadrants(),
      projetosApi.getTaskPriority(taskId),
    ])
      .then(([st, cr, pl, cf, qd, score]) => {
        if (!active) return
        setSettings(st)
        setEnabled(st.is_enabled)
        setCriteria(cr)
        setPillars(pl)
        setConfidence(cf)
        setQuadrants(qd)
        if (score) {
          setPillarIds(score.pillar_ids ?? (score.pillar_id ? [score.pillar_id] : []))
          setImpactScores(score.impact_scores ?? {})
          setEffortScores(score.effort_scores ?? {})
          setHasScore(true)
        }
      })
      .catch(() => active && setEnabled(false))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [taskId])

  const impactCriteria = useMemo(() => criteria.filter((c) => c.axis === "impact" && c.is_active), [criteria])
  const effortCriteria = useMemo(() => criteria.filter((c) => c.axis === "effort" && c.is_active), [criteria])

  const result = useMemo(() => {
    if (!settings) return null
    return computePriority({ impactScores, effortScores, pillarIds }, criteria, pillars, confidence, settings)
  }, [impactScores, effortScores, pillarIds, criteria, pillars, confidence, settings])

  const togglePillar = (id: string) =>
    setPillarIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  // Agrupa os pilares por perspectiva do Mapa Estratégico (ordem preservada).
  const pillarGroups = useMemo(() => {
    const groups: { perspective: string; color: string; items: PriorityPillar[] }[] = []
    const index = new Map<string, number>()
    for (const p of pillars) {
      const key = p.perspective || "Outros"
      let i = index.get(key)
      if (i === undefined) {
        i = groups.length
        index.set(key, i)
        groups.push({ perspective: key, color: p.color, items: [] })
      }
      groups[i].items.push(p)
    }
    return groups
  }, [pillars])

  if (mode === "hidden") return null
  if (!loading && !enabled) return null

  async function handleSave() {
    setSaving(true)
    try {
      await projetosApi.saveTaskPriority(taskId, {
        pillar_ids: pillarIds,
        impact_scores: impactScores,
        effort_scores: effortScores,
      })
      setHasScore(true)
      toast.success("Priorização salva.")
      onSaved?.()
    } catch {
      toast.error("Não foi possível salvar a priorização.")
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setSaving(true)
    try {
      await projetosApi.deleteTaskPriority(taskId)
      setPillarIds([])
      setImpactScores({})
      setEffortScores({})
      setHasScore(false)
      toast.info("Priorização removida.")
      onSaved?.()
    } catch {
      toast.error("Não foi possível remover a priorização.")
    } finally {
      setSaving(false)
    }
  }

  const criterionRow = (c: PriorityCriterion, scores: Record<string, number>, setScores: (s: Record<string, number>) => void) => {
    const value = scores[c.code]
    const points = [...(c.scale ?? [])].sort((a, b) => a.value - b.value)
    const desc = points.find((p) => p.value === value)?.description
    return (
      <div key={c.code} className="grid grid-cols-[1fr_84px] items-start gap-2">
        <div>
          <p className="text-xs font-medium">
            {c.label} <span className="text-muted-foreground">({Math.round(c.weight * 100)}%)</span>
          </p>
          {desc && <p className="text-[11px] leading-tight text-muted-foreground">{desc}</p>}
        </div>
        <Select
          disabled={readOnly}
          value={value !== undefined ? String(value) : NONE}
          onValueChange={(v) => {
            const next = { ...scores }
            if (v === NONE) delete next[c.code]
            else next[c.code] = Number(v)
            setScores(next)
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {points.map((p) => (
              <SelectItem key={p.value} value={String(p.value)}>
                {p.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-primary" />
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Priorização (Impacto × Esforço)</p>
        {result && hasScore && <QuadrantBadge code={result.quadrantCode} quadrants={quadrants} className="ml-1" />}
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="space-y-3">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Pilares estratégicos
                  {pillarIds.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                      {pillarIds.length} selecionado{pillarIds.length > 1 ? "s" : ""}
                    </span>
                  )}
                </p>
                {!readOnly && pillarIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPillarIds([])}
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Limpar seleção
                  </button>
                )}
              </div>

              {pillars.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Nenhum pilar configurado.</p>
              ) : (
                <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3">
                  {pillarGroups.map((group) => (
                    <div key={group.perspective}>
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {group.perspective}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map((p) => {
                          const on = pillarIds.includes(p.id)
                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={readOnly}
                              onClick={() => togglePillar(p.id)}
                              title={`${p.code} · ${p.label}`}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-all disabled:cursor-not-allowed disabled:opacity-60",
                                on
                                  ? "border-transparent font-medium text-white shadow-sm"
                                  : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                              )}
                              style={on ? { backgroundColor: group.color } : undefined}
                            >
                              <span
                                className={cn(
                                  "rounded px-1 text-[9px] font-bold",
                                  on ? "bg-white/25" : "bg-muted text-foreground/70",
                                )}
                              >
                                {p.code}
                              </span>
                              {p.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pillarIds.length > 1 && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Modificador aplicado: o maior entre os pilares selecionados.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Impacto</p>
              {impactCriteria.map((c) => criterionRow(c, impactScores, setImpactScores))}
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Esforço</p>
              {effortCriteria.map((c) => criterionRow(c, effortScores, setEffortScores))}
            </div>
          </div>

          {result && (
            <div className="flex flex-wrap items-center gap-4 rounded-md bg-muted/40 p-3 text-sm">
              <span>
                Impacto efetivo: <strong>{result.impactoEfetivo.toFixed(2)}</strong>
                <span className="text-[11px] text-muted-foreground"> (bruto {result.impactoBruto.toFixed(2)} × {result.modulador} ÷ {result.divisor})</span>
              </span>
              <span>
                Esforço: <strong>{result.esforco.toFixed(2)}</strong>
              </span>
              <QuadrantBadge code={result.quadrantCode} quadrants={quadrants} />
            </div>
          )}

          {readOnly ? (
            <span className="flex items-center gap-1 text-[11px] italic text-muted-foreground">
              <Target size={12} /> {hasScore ? "Somente leitura nesta etapa" : "Ainda não pontuada"}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar priorização
              </Button>
              {hasScore && (
                <Button size="sm" variant="ghost" onClick={() => void handleClear()} disabled={saving}>
                  <Trash2 size={13} /> Limpar
                </Button>
              )}
              {!hasScore && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Target size={12} /> Ainda não pontuada
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
