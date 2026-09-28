import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarCheck, CalendarClock, FlaskConical, Loader2, Users } from "lucide-react"

import {
  projetosApi,
  type ScheduleScenarioResponse,
} from "@/api/projetos"
import type { Person } from "@/api/teamops"
import { EmptyState } from "@/components/EmptyState"
import { Card, KpiCount, KpiRow, Notice, Pill, SectionCard, TABLE } from "@/components/ds"
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
    <div className="space-y-5">
      <SectionCard
        icon={FlaskConical}
        title="Cenário de fim do projeto"
        subtitle={
          <>
            {rootTitle ? <span className="font-medium text-foreground">{rootTitle}</span> : null}
            {rootTitle ? " · " : ""}
            Informe o início e os devs. O sistema soma as horas das US abertas e avança dia a dia
            na capacidade livre do time (desconta outros projetos, sáb/dom e ausências).
            {" "}
            <span className="font-medium text-foreground">Cenário hipotético — não altera o cronograma.</span>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[200px_1fr_auto]">
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground">
              Início do cenário
            </label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground">
              Desenvolvedores ({selected.length})
            </label>
            <div className="max-h-40 overflow-y-auto rounded-lg border bg-background p-1">
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
              className="h-10 w-full gap-1.5 lg:w-auto"
              disabled={loading || !start || selected.length === 0}
              onClick={() => void calculate()}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
              Calcular cenário
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-4">
            <Notice tone="red" icon={AlertTriangle}>{error}</Notice>
          </div>
        )}
      </SectionCard>

      {loading && !result && (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Calculando capacidade do time…
        </div>
      )}

      {result && (
        <div className="space-y-5">
          <KpiRow className="sm:grid-cols-2 xl:grid-cols-4">
            <KpiCount
              icon={CalendarClock}
              value={fmtH(result.demand_hours)}
              label="Demanda (US abertas)"
            />
            <KpiCount
              icon={Users}
              value={fmtH(result.team_free_hours)}
              label={`Folga do time · capacidade ${fmtH(result.team_capacity_hours)}`}
            />
            <KpiCount
              icon={CalendarClock}
              value={result.work_days}
              label="Dias úteis"
              tone="slate"
            />
            <KpiCount
              icon={CalendarCheck}
              value={result.projected_end_date ? fmtDate(result.projected_end_date) : "—"}
              label={result.start_date ? `Fim projetado · início ${fmtDate(result.start_date)}` : "Fim projetado"}
              tone={result.projected_end_date ? "emerald" : "amber"}
              highlight={!result.projected_end_date}
            />
          </KpiRow>

          {result.warnings.length > 0 && (
            <Notice tone="amber" icon={AlertTriangle}>
              <div className="min-w-0 flex-1 space-y-1">
                {result.warnings.map((w) => <p key={w}>{w}</p>)}
              </div>
            </Notice>
          )}

          {result.persons.length > 0 && (
            <SectionCard title="Capacidade por pessoa" icon={Users} flush>
              <div className={TABLE.wrap}>
                <table className={TABLE.table}>
                  <thead className={TABLE.thead}>
                    <tr>
                      <th className={TABLE.thFirst}>Pessoa</th>
                      <th className={`${TABLE.th} text-right`}>Capacidade</th>
                      <th className={`${TABLE.th} text-right`}>Alocado (outros)</th>
                      <th className={`${TABLE.th} text-right`}>Folga</th>
                      <th className={`${TABLE.th} text-right`}>Utilização</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.persons.map((p) => (
                      <tr key={p.person_id} className={TABLE.tr}>
                        <td className={`${TABLE.tdFirst} font-medium`}>
                          {p.full_name ?? `Sem cadastro (${p.person_id.slice(0, 8)})`}
                        </td>
                        <td className={`${TABLE.td} text-right tabular-nums`}>{fmtH(p.capacity_hours)}</td>
                        <td className={`${TABLE.td} text-right tabular-nums text-muted-foreground`}>
                          {fmtH(p.allocated_elsewhere_hours)}
                        </td>
                        <td className={`${TABLE.td} text-right tabular-nums font-medium`}>{fmtH(p.free_hours)}</td>
                        <td className={`${TABLE.td} text-right`}>
                          <Pill tone="slate" className="tabular-nums">{Math.round(p.utilization_pct)}%</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {result.days.length > 0 && result.projected_end_date && (
            <div className="rounded-xl border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
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
        <Card>
          <EmptyState
            icon={FlaskConical}
            title="Monte o cenário"
            description="Escolha a data de início e os desenvolvedores, depois calcule para ver quando a demanda das US cabe na capacidade livre do time."
          />
        </Card>
      )}
    </div>
  )
}
