import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowLeftRight, Loader2, ShieldAlert } from "lucide-react"

import { projetosApi, type CrossTeamResponse } from "@/api/projetos"
import { KpiCard } from "@/components/KpiCard"
import { EmptyState } from "@/components/EmptyState"
import { SectionCard } from "@/components/SectionCard"
import { Badge } from "@/components/ui/badge"

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="Pessoas em risco" value={atRisk} icon={ShieldAlert}
          deltaTone={atRisk > 0 ? "down" : "up"} sub="mais horas para outros times que para o próprio" />
        <KpiCard label="Horas 'vazando'" value={`${leaking}h`} icon={ArrowLeftRight}
          sub="horas de quem está em risco indo p/ outros times" />
        <KpiCard label="Pessoas analisadas" value={rows.length} icon={AlertTriangle} />
      </div>

      <SectionCard title="Alocação entre times — quem trabalha mais para fora do próprio time">
        {rows.length === 0 ? (
          <EmptyState icon={ArrowLeftRight} title="Sem dados no período"
            description="Nenhuma pessoa com tarefas agendadas no intervalo. Ajuste o período (lembre: os dados podem estar em outro mês)." />
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              "Time dono" de um trabalho = a área do <strong>PO</strong> do card-raiz. <strong>Away</strong> = horas da pessoa em
              projetos de outros times. <span className="text-destructive">Risco</span> = mais horas fora do que dentro do próprio time.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">Pessoa</th>
                    <th className="py-2 pr-3 font-medium">Time de origem</th>
                    <th className="py-2 pr-3 text-right font-medium">No time</th>
                    <th className="py-2 pr-3 text-right font-medium">Fora</th>
                    <th className="py-2 pr-3 font-medium">% fora</th>
                    <th className="py-2 pr-3 font-medium">Trabalhando para</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.person_id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.full_name}</div>
                        {r.position_label && <div className="text-[11px] text-muted-foreground">{r.position_label}</div>}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {r.home_area_names.length > 0 ? r.home_area_names.join(", ") : <span className="text-amber-600">sem time</span>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-green-600">{Math.round(r.home_hours)}h</td>
                      <td className="py-2 pr-3 text-right tabular-nums font-medium text-destructive">{Math.round(r.away_hours)}h</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <AwayBar pct={r.away_pct} />
                          <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(r.away_pct)}%</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {r.away_by_team.slice(0, 3).map((a) => (
                            <Badge key={a.team_area_id ?? a.team_name} variant="secondary" className="text-[10px]">
                              {a.team_name}: {Math.round(a.hours)}h
                            </Badge>
                          ))}
                          {r.undefined_hours > 0 && (
                            <Badge variant="outline" className="text-[10px]">sem time: {Math.round(r.undefined_hours)}h</Badge>
                          )}
                          {r.away_by_team.length === 0 && r.undefined_hours === 0 && <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        {r.at_risk && <Badge variant="destructive" className="gap-1"><ShieldAlert size={12} />Risco</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}

export default CapacityCrossTeamView
