import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Gauge, Loader2 } from "lucide-react"

import { projetosApi, type PersonCapacityWindow } from "@/api/projetos"
import { capacityRatioColors } from "./capacityColors"

const MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function fmtH(h: number): string {
  return `${h.toFixed(1).replace(".", ",")}h`
}

function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return `${String(d.getDate()).padStart(2, "0")}/${MON[d.getMonth()]}`
}

export interface CapacitySummary {
  utilizationPct: number | null
  overloaded: boolean
  personName: string | null
}

/**
 * Carga × capacidade do responsável no período da tarefa, exibido no modal do cronograma.
 *
 * O backend devolve o "já alocado" de TODO o portfólio **sem** a tarefa em edição
 * (`exclude_task`); a estimativa candidata é somada aqui no cliente, espelhando a
 * distribuição linear do motor (`horas / dias úteis do período`). Assim, digitar horas
 * atualiza a leitura na hora, sem nova requisição — só trocar responsável ou datas refaz.
 *
 * Sobrecarga é sinalizada, nunca bloqueia: replanejar com estouro é decisão do planejador.
 */
export function AssigneeCapacityPanel({
  personId,
  start,
  due,
  hours,
  excludeTaskId,
  onSummary,
}: {
  personId: string
  start: string
  due: string
  hours: string
  excludeTaskId?: string
  onSummary?: (s: CapacitySummary | null) => void
}) {
  const [data, setData] = useState<PersonCapacityWindow | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const validWindow = !!personId && !!start && !!due && start <= due

  useEffect(() => {
    if (!validWindow) {
      setData(null)
      return
    }
    let alive = true
    setLoading(true)
    setFailed(false)
    const timer = setTimeout(() => {
      projetosApi
        .getPersonCapacityWindow({ person: personId, from: start, to: due, exclude_task: excludeTaskId })
        .then((r) => { if (alive) setData(r) })
        .catch(() => { if (alive) { setFailed(true); setData(null) } })
        .then(() => { if (alive) setLoading(false) })
    }, 400)
    return () => { alive = false; clearTimeout(timer) }
  }, [personId, start, due, excludeTaskId, validWindow])

  const view = useMemo(() => {
    if (!data) return null
    const taskHours = Math.max(0, parseFloat(hours) || 0)
    const days = data.days
    const perDay = days.length > 0 ? taskHours / days.length : 0
    const total = data.allocated_hours_total + taskHours
    const pct = data.capacity_hours_total > 0 ? (total / data.capacity_hours_total) * 100 : null
    const cells = days.map((d) => {
      const allocated = d.allocated_hours + perDay
      return { ...d, allocated, over: allocated > d.capacity_hours + 1e-6 }
    })
    return {
      taskHours,
      perDay,
      total,
      pct,
      cells,
      overDays: cells.filter((c) => c.over).length,
      deficit: Math.max(0, total - data.capacity_hours_total),
    }
  }, [data, hours])

  // Publica o resumo para o cabeçalho do modal (badge de sobrecarga).
  const pct = view?.pct ?? null
  const overloaded = !!view && view.deficit > 1e-6
  const personName = data?.full_name ?? null
  useEffect(() => {
    onSummary?.(view ? { utilizationPct: pct, overloaded, personName } : null)
  }, [onSummary, view, pct, overloaded, personName])
  useEffect(() => () => onSummary?.(null), [onSummary])

  if (!validWindow) return null

  if (!data) {
    return (
      <div className="hint" style={{ marginTop: 6 }}>
        {loading ? (
          <><Loader2 size={13} className="animate-spin" /> Calculando capacidade do responsável...</>
        ) : failed ? (
          "Não foi possível carregar a capacidade do responsável."
        ) : null}
      </div>
    )
  }

  const v = view!
  const tone = capacityRatioColors(v.total, data.capacity_hours_total)
  const barMax = Math.max(
    data.project_hours_per_day,
    ...v.cells.map((c) => Math.max(c.capacity_hours, c.allocated)),
    1,
  )
  const demandsTitle = data.top_demands.length
    ? data.top_demands.map((d) => `${d.project_name} · ${d.task_title} — ${fmtH(d.hours)}`).join("\n")
    : "Nenhuma outra demanda no período."

  return (
    <div
      style={{
        marginTop: 8,
        border: "1px solid var(--af-border)",
        borderRadius: 8,
        padding: "8px 10px",
        background: "var(--af-muted-2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Gauge size={13} style={{ color: "var(--af-muted-fg)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--af-muted-fg)", textTransform: "uppercase", letterSpacing: 0.4 }}>
          Capacidade · {fmtDay(start)} → {fmtDay(due)} ({data.work_days} dia{data.work_days === 1 ? "" : "s"} úte{data.work_days === 1 ? "l" : "is"})
        </span>
        {loading && <Loader2 size={12} className="animate-spin" style={{ color: "var(--af-faint)" }} />}
      </div>

      <Row
        label="Capacidade"
        value={fmtH(data.capacity_hours_total)}
        note={`${fmtH(data.project_hours_per_day)}/dia${data.full_name ? ` · ${data.full_name}` : ""}`}
      />
      <Row
        label="Já alocado"
        value={fmtH(data.allocated_hours_total)}
        note={data.top_demands.length ? `em ${data.top_demands.length} demanda${data.top_demands.length > 1 ? "s" : ""}` : "nenhuma outra demanda"}
        noteTitle={demandsTitle}
      />
      <Row label="Esta tarefa" value={`+${fmtH(v.taskHours)}`} />

      <div style={{ borderTop: "1px solid var(--af-border)", margin: "6px 0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <span style={{ fontWeight: 600, minWidth: 84, color: "var(--af-muted-fg)" }}>Resultado</span>
        <b>{fmtH(v.total)}</b>
        <span style={{ color: "var(--af-faint)" }}>/ {fmtH(data.capacity_hours_total)}</span>
        <span style={{ flex: 1 }} />
        {v.pct != null && (
          <span
            className="gx-badge"
            style={{ background: tone?.bg ?? "var(--af-muted-2)", color: tone?.fg ?? "var(--af-muted-fg)", fontWeight: 700 }}
          >
            {v.deficit > 1e-6 ? "⚠ " : ""}{Math.round(v.pct)}%
          </span>
        )}
      </div>

      {/* Barras por dia útil: carga resultante (já alocado + esta tarefa) sobre a capacidade do dia. */}
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 30, marginTop: 8, overflowX: "auto" }}>
        {v.cells.map((c) => {
          const col = capacityRatioColors(c.allocated, c.capacity_hours)
          const h = Math.max(2, Math.round((Math.min(c.allocated, barMax) / barMax) * 26))
          return (
            <div
              key={c.date}
              title={`${fmtDay(c.date)} · ${fmtH(c.allocated)} de ${fmtH(c.capacity_hours)}`}
              style={{ flex: "1 0 8px", minWidth: 8, height: 26, display: "flex", alignItems: "flex-end", background: "var(--af-muted-2)", borderRadius: 2 }}
            >
              <i style={{ display: "block", width: "100%", height: h, background: col?.bg ?? "var(--af-muted-3)", borderRadius: 2 }} />
            </div>
          )
        })}
      </div>

      {v.deficit > 1e-6 && (
        <div className="hint" style={{ color: "var(--af-destructive)", marginTop: 6 }}>
          <AlertTriangle size={13} /> Excede a capacidade em {fmtH(v.deficit)}
          {v.overDays > 0 && ` (${v.overDays} dia${v.overDays > 1 ? "s" : ""} sobrecarregado${v.overDays > 1 ? "s" : ""})`}.
        </div>
      )}

      {!data.task_counts_in_capacity && (
        <div className="hint" style={{ marginTop: 6 }}>
          Esta etapa não é User Story — as horas não entram no cockpit de capacidade.
        </div>
      )}
      {data.full_name === null && (
        <div className="hint" style={{ marginTop: 6 }}>
          Responsável sem cadastro no TeamOps — usando a jornada padrão ({fmtH(data.project_hours_per_day)}/dia).
        </div>
      )}
    </div>
  )
}

function Row({ label, value, note, noteTitle }: { label: string; value: string; note?: string; noteTitle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, lineHeight: 1.7 }}>
      <span style={{ minWidth: 84, color: "var(--af-muted-fg)" }}>{label}</span>
      <b style={{ minWidth: 52 }}>{value}</b>
      {note && (
        <span style={{ color: "var(--af-faint)", cursor: noteTitle ? "help" : undefined }} title={noteTitle}>
          {note}
        </span>
      )}
    </div>
  )
}
