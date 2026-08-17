import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarClock, FlaskConical, Loader2, Users } from "lucide-react"

import {
  projetosApi,
  type ScheduleScenarioResponse,
} from "@/api/projetos"
import type { Person } from "@/api/teamops"
import { EmptyState } from "@/components/EmptyState"
import { KpiCard } from "@/components/KpiCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

function fmtH(h: number): string {
  return `${h.toFixed(1).replace(".", ",")}h`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR")
}

/**
 * Aba Cenário do cronograma: informa início + devs e projeta o fim pela
 * capacidade livre agregada (cenário hipotético — não altera datas).
 */
export function ScheduleScenarioPanel({
  projectId,
  rootTaskId,
  rootTitle,
  defaultStart,
  persons,
}: {
  projectId: string
  rootTaskId: string
  rootTitle?: string
  defaultStart?: string | null
  persons: Person[]
}) {
  const [start, setStart] = useState(defaultStart?.slice(0, 10) ?? "")
  const [selected, setSelected] = useState<string[]>([])
  const [result, setResult] = useState<ScheduleScenarioResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setStart(defaultStart?.slice(0, 10) ?? "")
  }, [defaultStart, rootTaskId])

  useEffect(() => {
    setResult(null)
    setError(null)
  }, [rootTaskId])

  const activePersons = useMemo(
    () => persons.filter((p) => p.status === "ativo").sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR")),
    [persons],
  )

  const selectedSet = useMemo(() => new Set(selected), [selected])

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function calculate() {
    if (!start || selected.length === 0) {
      setError("Informe a data de início e selecione ao menos um desenvolvedor.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await projetosApi.postScheduleScenario(projectId, {
        root_task_id: rootTaskId,
        start_date: start,
        person_ids: selected,
      })
      setResult(r)
    } catch (err: unknown) {
      setResult(null)
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      setError(typeof detail === "string" ? detail : "Não foi possível calcular o cenário.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-start gap-2">
          <FlaskConical size={18} className="mt-0.5 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">Cenário de fim do projeto</h2>
            <p className="text-xs text-muted-foreground">
              {rootTitle ? <span className="font-medium text-foreground">{rootTitle}</span> : null}
              {rootTitle ? " · " : ""}
              Informe o início e os devs. O sistema soma as horas das US abertas e avança dia a dia
              na capacidade livre do time (desconta outros projetos, sáb/dom e ausências).
              {" "}
              <span className="font-medium text-foreground">Cenário hipotético — não altera o cronograma.</span>
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[200px_1fr_auto]">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Início do cenário
            </label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Desenvolvedores ({selected.length})
            </label>
            <div className="max-h-40 overflow-y-auto rounded-md border bg-background p-1">
              {activePersons.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">Nenhuma pessoa ativa no TeamOps.</p>
              ) : (
                activePersons.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-primary"
                      checked={selectedSet.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="min-w-0 truncate">
                      {p.full_name}
                      {p.position?.name ? (
                        <span className="text-xs text-muted-foreground"> · {p.position.name}</span>
                      ) : null}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              className="w-full gap-1.5 lg:w-auto"
              disabled={loading || !start || selected.length === 0}
              onClick={() => void calculate()}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
              Calcular cenário
            </Button>
          </div>
        </div>

        {error && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle size={14} /> {error}
          </p>
        )}
      </div>

      {loading && !result && (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Calculando capacidade do time…
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Demanda (US abertas)"
              value={fmtH(result.demand_hours)}
              icon={CalendarClock}
            />
            <KpiCard
              label="Folga do time"
              value={fmtH(result.team_free_hours)}
              icon={Users}
              sub={`Capacidade ${fmtH(result.team_capacity_hours)}`}
            />
            <KpiCard
              label="Dias úteis"
              value={result.work_days}
              icon={CalendarClock}
            />
            <KpiCard
              label="Fim projetado"
              value={result.projected_end_date ? fmtDate(result.projected_end_date) : "—"}
              icon={FlaskConical}
              sub={result.start_date ? `Início ${fmtDate(result.start_date)}` : undefined}
              deltaTone={result.projected_end_date ? "up" : "down"}
            />
          </div>

          {result.warnings.length > 0 && (
            <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
              {result.warnings.map((w) => (
                <p key={w} className="flex items-start gap-1.5">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}

          {result.persons.length > 0 && (
            <div className="overflow-x-auto rounded-md border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Pessoa</th>
                    <th className="px-3 py-2 text-right font-medium">Capacidade</th>
                    <th className="px-3 py-2 text-right font-medium">Alocado (outros)</th>
                    <th className="px-3 py-2 text-right font-medium">Folga</th>
                    <th className="px-3 py-2 text-right font-medium">Utilização</th>
                  </tr>
                </thead>
                <tbody>
                  {result.persons.map((p) => (
                    <tr key={p.person_id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">
                        {p.full_name ?? `Sem cadastro (${p.person_id.slice(0, 8)})`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtH(p.capacity_hours)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtH(p.allocated_elsewhere_hours)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtH(p.free_hours)}</td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant="secondary" className="font-normal tabular-nums">
                          {Math.round(p.utilization_pct)}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.days.length > 0 && result.projected_end_date && (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Consumo dia a dia até {fmtDate(result.projected_end_date)}:{" "}
              {result.days.length} dia(s) útil(is) simulado(s)
              {result.days.length > 0 && (
                <> · pico de folga diária {fmtH(Math.max(...result.days.map((d) => d.team_free)))}</>
              )}
              .
            </div>
          )}
        </div>
      )}

      {!loading && !result && !error && (
        <EmptyState
          icon={FlaskConical}
          title="Monte o cenário"
          description="Escolha a data de início e os desenvolvedores, depois calcule para ver quando a demanda das US cabe na capacidade livre do time."
        />
      )}
    </div>
  )
}
