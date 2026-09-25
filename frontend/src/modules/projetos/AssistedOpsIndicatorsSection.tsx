import { useEffect, useState } from "react"
import { BarChart3, Loader2, Plus, SlidersHorizontal, Trash2 } from "lucide-react"

import { teamOccurrencesApi, type AssistedOpsEntryState, type AssistedOpsIndicators, type AssistedOpsTargets } from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"
import { IndicatorBreakdown, IndicatorGrid } from "@/modules/portal/assistedOpsUi"

function apiError(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

function today(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

type MeasureDraft = { kind: "taxa_erros" | "disponibilidade"; start: string; end: string; transactions: string; value: string; note: string }

/** Indicadores da Operação Assistida no card do projeto (POP 8.1.3): calculados das ocorrências,
 *  com metas de referência (calibráveis com justificativa) e medições manuais do que vem de fora
 *  — volume de transações (taxa de erros) e disponibilidade. Só depois de o projeto entrar na raia. */
export function AssistedOpsIndicatorsSection({
  projectTaskId, readOnly, refreshKey = 0,
}: {
  projectTaskId: string
  readOnly: boolean
  refreshKey?: number
}) {
  const [entry, setEntry] = useState<AssistedOpsEntryState | null>(null)
  const [data, setData] = useState<AssistedOpsIndicators | null>(null)
  const [targets, setTargets] = useState<AssistedOpsTargets | null>(null)
  const [measure, setMeasure] = useState<MeasureDraft | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    teamOccurrencesApi.entry(projectTaskId).then(setEntry).catch(() => setEntry(null))
    teamOccurrencesApi.indicators(projectTaskId).then(setData).catch(() => setData(null))
  }, [projectTaskId, refreshKey])

  if (!entry?.entered_at || !data) return null
  const canManage = data.can_manage && !readOnly
  const canRecord = entry.can_record && !readOnly

  async function saveTargets() {
    if (!targets) return
    if ((targets.justificativa ?? "").trim().length < 10) return toast.error("Justifique a calibragem (mín. 10 caracteres).")
    setSaving(true)
    try {
      setData(await teamOccurrencesApi.setTargets(projectTaskId, targets))
      setTargets(null)
      toast.success("Metas calibradas.")
    } catch (err) {
      toast.error(apiError(err, "Não foi possível salvar as metas."))
    } finally {
      setSaving(false)
    }
  }

  async function saveMeasure() {
    if (!measure) return
    setSaving(true)
    try {
      setData(await teamOccurrencesApi.addMeasure(projectTaskId, {
        kind: measure.kind,
        period_start: measure.start,
        period_end: measure.end,
        transactions: measure.kind === "taxa_erros" ? Number(measure.transactions) || null : null,
        value: measure.kind === "disponibilidade" ? Number(measure.value.replace(",", ".")) : null,
        note: measure.note.trim() || null,
      }))
      setMeasure(null)
      toast.success("Medição lançada.")
    } catch (err) {
      toast.error(apiError(err, "Não foi possível lançar a medição."))
    } finally {
      setSaving(false)
    }
  }

  async function removeMeasure(id: string) {
    if (!window.confirm("Excluir esta medição?")) return
    try {
      setData(await teamOccurrencesApi.deleteMeasure(projectTaskId, id))
    } catch (err) {
      toast.error(apiError(err, "Não foi possível excluir."))
    }
  }

  const t = data.targets
  return (
    <div className="space-y-2 rounded-md border border-teal-500/30 bg-teal-50/40 p-3 dark:bg-teal-950/20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-teal-600" />
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700 dark:text-teal-400">
            Operação Assistida · indicadores
          </p>
        </div>
        <div className="flex gap-1">
          {canRecord && !measure && (
            <Button
              variant="ghost" size="sm" className="h-7 gap-1 text-xs"
              onClick={() => setMeasure({ kind: "taxa_erros", start: today(-6), end: today(), transactions: "", value: "", note: "" })}
            >
              <Plus size={12} /> Medição
            </Button>
          )}
          {canManage && !targets && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setTargets({ ...t })}>
              <SlidersHorizontal size={12} /> Metas
            </Button>
          )}
        </div>
      </div>

      <IndicatorGrid items={data.items} compact />
      <IndicatorBreakdown data={data} />
      <p className="text-[11px] text-muted-foreground">
        {data.targets_calibrated
          ? <>Metas calibradas para o projeto: {t.justificativa}</>
          : <>Metas de referência do POP (a calibrar pelo histórico institucional).</>}
      </p>

      {targets && (
        <div className="space-y-2 rounded-md border bg-background p-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["sla_pct", "No prazo (%) ≥"],
                ["disponibilidade_pct", "Disponibilidade (%) ≥"],
                ["reincidencia_pct", "Reincidência (%) ≤"],
                ["satisfacao", "Satisfação (1–5) ≥"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label className="text-[11px]">{label}</Label>
                <Input
                  type="number" step="0.1" className="h-8" value={targets[k]}
                  onChange={(e) => setTargets({ ...targets, [k]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
          <Textarea
            rows={2} placeholder="Justificativa da calibragem (histórico institucional, POP 8.1.3)"
            value={targets.justificativa ?? ""} onChange={(e) => setTargets({ ...targets, justificativa: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTargets(null)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={() => void saveTargets()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar metas
            </Button>
          </div>
        </div>
      )}

      {measure && (
        <div className="space-y-2 rounded-md border bg-background p-2">
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["taxa_erros", "Transações (taxa de erros)"],
                ["disponibilidade", "Disponibilidade"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMeasure({ ...measure, kind: k })}
                aria-pressed={measure.kind === k}
                className={`rounded-md border px-2 py-1 text-xs font-medium ${
                  measure.kind === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Início</Label>
              <Input type="date" className="h-8" value={measure.start} onChange={(e) => setMeasure({ ...measure, start: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Fim</Label>
              <Input type="date" className="h-8" value={measure.end} onChange={(e) => setMeasure({ ...measure, end: e.target.value })} />
            </div>
            {measure.kind === "taxa_erros" ? (
              <div className="space-y-1">
                <Label className="text-[11px]">Transações no período</Label>
                <Input type="number" min={1} className="h-8" value={measure.transactions} onChange={(e) => setMeasure({ ...measure, transactions: e.target.value })} />
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-[11px]">Disponibilidade (%)</Label>
                <Input className="h-8" inputMode="decimal" placeholder="99,5" value={measure.value} onChange={(e) => setMeasure({ ...measure, value: e.target.value })} />
              </div>
            )}
          </div>
          {measure.kind === "taxa_erros" && (
            <p className="text-[11px] text-muted-foreground">Os incidentes do período são as correções abertas nele; a taxa é por mil transações.</p>
          )}
          <Input className="h-8" placeholder="Observação (fonte do dado)" value={measure.note} onChange={(e) => setMeasure({ ...measure, note: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMeasure(null)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={() => void saveMeasure()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lançar
            </Button>
          </div>
        </div>
      )}

      {data.measures.length > 0 && (
        <ul className="space-y-1 text-xs">
          {data.measures.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 rounded-md bg-background/70 px-2 py-1">
              <span>
                {fmtDay(m.period_start)} a {fmtDay(m.period_end)} ·{" "}
                {m.kind === "taxa_erros"
                  ? `${m.incidents ?? 0} incidente(s) em ${m.transactions} transações (${(m.rate ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}‰)`
                  : `disponibilidade ${(m.value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}
                {m.note && <span className="text-muted-foreground"> · {m.note}</span>}
              </span>
              {canRecord && (
                <Button variant="ghost" size="icon" className="h-6 w-6" title="Excluir" onClick={() => void removeMeasure(m.id)}>
                  <Trash2 size={12} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
