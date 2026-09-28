import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowLeftRight, Loader2, ShieldAlert } from "lucide-react"

import { projetosApi, type CrossTeamResponse } from "@/api/projetos"
import { EmptyState } from "@/components/EmptyState"
import { KpiCount, KpiRow, Pill, SectionCard, TABLE } from "@/components/ds"

/** Barra da % de horas fora do próprio time. */
function AwayBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  const color = pct > 50 ? "#ef4444" : pct > 20 ? "#f59e0b" : "#22c55e"
  return (
    <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${clamped}%`, backgroundColor: color }} />
    </div>
  )
}

export function CapacityCrossTeamView({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<CrossTeamResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    projetosApi.getCrossTeam({ from, to })
      .then((r) => alive && setData(r))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [from, to])

  const { atRisk, leaking } = useMemo(() => {
    const rows = data?.rows ?? []
    const risk = rows.filter((r) => r.at_risk)
    return { atRisk: risk.length, leaking: Math.round(risk.reduce((s, r) => s + r.away_hours, 0)) }
  }, [data])

  if (loading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Analisando alocação entre times…</div>
  }

  const rows = data?.rows ?? []

  return (
    <div className="space-y-5">
      <KpiRow className="sm:grid-cols-3">
        <KpiCount icon={ShieldAlert} value={atRisk} label="Pessoas em risco · mais horas para outros times que para o próprio"
          tone={atRisk > 0 ? "red" : "emerald"} highlight={atRisk > 0} />
        <KpiCount icon={ArrowLeftRight} value={`${leaking}h`} label="Horas 'vazando' · de quem está em risco, indo p/ outros times"
          tone="amber" />
        <KpiCount icon={AlertTriangle} value={rows.length} label="Pessoas analisadas" tone="slate" />
      </KpiRow>

      <SectionCard
        title="Alocação entre times — quem trabalha mais para fora do próprio time"
        subtitle={rows.length > 0 ? (
          <>
            "Time dono" de um trabalho = a área do <strong>PO</strong> do card-raiz. <strong>Away</strong> = horas da pessoa em
            projetos de outros times. <span className="text-destructive">Risco</span> = mais horas fora do que dentro do próprio time.
          </>
        ) : undefined}
        icon={ArrowLeftRight}
        flush
      >
        {rows.length === 0 ? (
          <EmptyState icon={ArrowLeftRight} title="Sem dados no período"
            description="Nenhuma pessoa com tarefas agendadas no intervalo. Ajuste o período (lembre: os dados podem estar em outro mês)." />
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Pessoa</th>
                  <th className={TABLE.th}>Time de origem</th>
                  <th className={`${TABLE.th} text-right`}>No time</th>
                  <th className={`${TABLE.th} text-right`}>Fora</th>
                  <th className={TABLE.th}>% fora</th>
                  <th className={TABLE.th}>Trabalhando para</th>
                  <th className={TABLE.th}><span className="sr-only">Risco</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.person_id} className={TABLE.tr}>
                    <td className={TABLE.tdFirst}>
                      <div className="font-medium">{r.full_name}</div>
                      {r.position_label && <div className="text-xs text-muted-foreground">{r.position_label}</div>}
                    </td>
                    <td className={`${TABLE.td} text-muted-foreground`}>
                      {r.home_area_names.length > 0 ? r.home_area_names.join(", ") : <span className="text-amber-600 dark:text-amber-400">sem time</span>}
                    </td>
                    <td className={`${TABLE.td} text-right tabular-nums text-emerald-600 dark:text-emerald-400`}>{Math.round(r.home_hours)}h</td>
                    <td className={`${TABLE.td} text-right tabular-nums font-medium text-destructive`}>{Math.round(r.away_hours)}h</td>
                    <td className={TABLE.td}>
                      <div className="flex items-center gap-2">
                        <AwayBar pct={r.away_pct} />
                        <span className="text-xs tabular-nums text-muted-foreground">{Math.round(r.away_pct)}%</span>
                      </div>
                    </td>
                    <td className={TABLE.td}>
                      <div className="flex flex-wrap gap-1">
                        {r.away_by_team.slice(0, 3).map((a) => (
                          <Pill key={a.team_area_id ?? a.team_name} tone="slate">
                            {a.team_name}: {Math.round(a.hours)}h
                          </Pill>
                        ))}
                        {r.undefined_hours > 0 && (
                          <Pill tone="amber">sem time: {Math.round(r.undefined_hours)}h</Pill>
                        )}
                        {r.away_by_team.length === 0 && r.undefined_hours === 0 && <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className={TABLE.td}>
                      {r.at_risk && <Pill tone="red"><ShieldAlert size={12} />Risco</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export default CapacityCrossTeamView
