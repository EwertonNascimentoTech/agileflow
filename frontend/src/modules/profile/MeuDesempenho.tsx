import { useEffect, useState } from "react"
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps,
} from "recharts"
import {
  BarChart3, Briefcase, CheckCircle2, Gauge, Layers, Scale, Target,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Card, KpiCount, KpiRow, KpiText, Notice, Pill, SectionCard, TABLE } from "@/components/ds"
import { projetosApi, type DevLoadStatus, type MyPerformance, type MyPerfTask } from "@/api/projetos"
import { errMsg, fmtData, fmtNum, fmtPct, httpStatus, isoLocal, mesCurto } from "@/modules/profile/utils"

type Periodo = "mes" | "3m" | "6m" | "ano"
const PERIODOS: [Periodo, string][] = [
  ["mes", "Este mês"], ["3m", "Últimos 3 meses"], ["6m", "Últimos 6 meses"], ["ano", "Este ano"],
]

function janela(p: Periodo): [string, string] {
  const hoje = new Date()
  if (p === "mes") {
    return [isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), isoLocal(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))]
  }
  if (p === "ano") return [isoLocal(new Date(hoje.getFullYear(), 0, 1)), isoLocal(hoje)]
  const meses = p === "3m" ? 2 : 5
  return [isoLocal(new Date(hoje.getFullYear(), hoje.getMonth() - meses, 1)), isoLocal(hoje)]
}

const CARGA: Record<DevLoadStatus, string> = {
  livre: "com folga", equilibrado: "equilibrado", sobrecarregado: "sobrecarregado", sem_dados: "sem dados de capacidade",
}

function ChartTip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{label}</p>
      {payload.map((p) => <p key={String(p.dataKey)}>{p.name}: {p.value}</p>)}
    </div>
  )
}

function TarefaCell({ t }: { t: MyPerfTask }) {
  return (
    <td className={`${TABLE.tdFirst} min-w-[16rem]`}>
      <p className="font-medium">{t.title}</p>
      {t.project_title && <p className="text-xs text-muted-foreground">{t.project_title}</p>}
    </td>
  )
}

/** Desempenho da pessoa logada: mesmas métricas do painel do time, com a média do time ao lado. */
export default function MeuDesempenho() {
  const [periodo, setPeriodo] = useState<Periodo>("3m")
  const [data, setData] = useState<MyPerformance | null>(null)
  const [erro, setErro] = useState<{ status?: number; msg: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    const [from, to] = janela(periodo)
    projetosApi.getMyPerformance(from, to)
      .then((r) => { if (vivo) { setData(r); setErro(null) } })
      .catch((err) => { if (vivo) setErro({ status: httpStatus(err), msg: errMsg(err, "Não foi possível carregar o desempenho.") }) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [periodo])

  const trocar = (p: Periodo) => { if (p !== periodo) { setLoading(true); setPeriodo(p) } }

  const toolbar = (
    <div className="flex flex-wrap gap-1.5">
      {PERIODOS.map(([v, l]) => (
        <Button key={v} size="sm" variant={periodo === v ? "default" : "outline"} className="h-8" onClick={() => trocar(v)}>{l}</Button>
      ))}
    </div>
  )

  if (loading) return <div className="space-y-4">{toolbar}<Skeleton className="h-96 rounded-2xl" /></div>
  if (erro || !data) {
    return (
      <div className="space-y-4">
        {toolbar}
        <Card>
          <EmptyState
            icon={BarChart3}
            title={erro?.status === 403 ? "Sem acesso aos dados de Processos" : "Desempenho indisponível"}
            description={erro?.msg ?? "Tente de novo em instantes."}
            compact
          />
        </Card>
      </div>
    )
  }

  const { kpis: k, team } = data
  const comparacao: { label: string; voce: string; time: string; dica?: string }[] = [
    { label: "User Stories entregues", voce: String(k.delivered), time: fmtNum(team.delivered_avg) },
    { label: "Entregues no prazo", voce: fmtPct(k.on_time_pct), time: fmtPct(team.on_time_pct) },
    { label: "Cycle time médio", voce: k.avg_cycle_time_days == null ? "—" : `${fmtNum(k.avg_cycle_time_days)} d`,
      time: team.avg_cycle_time_days == null ? "—" : `${fmtNum(team.avg_cycle_time_days)} d`, dica: "do início do desenvolvimento à entrega; menor é melhor" },
    { label: "Lead time médio", voce: k.avg_lead_time_days == null ? "—" : `${fmtNum(k.avg_lead_time_days)} d`,
      time: team.avg_lead_time_days == null ? "—" : `${fmtNum(team.avg_lead_time_days)} d`, dica: "da criação (ou início) à entrega" },
    { label: "Uso da capacidade", voce: fmtPct(k.utilization_pct), time: fmtPct(team.utilization_avg_pct) },
  ]
  const serie = data.series.map((m) => ({ label: mesCurto(m.month), Entregues: m.delivered, "No prazo": m.on_time }))
  const temSerie = data.series.some((m) => m.delivered > 0)

  return (
    <div className="space-y-4">
      {toolbar}

      <KpiRow className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiCount icon={CheckCircle2} value={k.delivered} label={`User Stories entregues · time: ${fmtNum(team.delivered_avg)} em média`} tone="emerald" />
        <KpiText icon={Target} value={fmtPct(k.on_time_pct)} label={`Entregues no prazo · time: ${fmtPct(team.on_time_pct)}`} />
        <KpiCount icon={Layers} value={k.wip} label={k.overdue ? `Em andamento · ${k.overdue} atrasada${k.overdue > 1 ? "s" : ""}` : "Em andamento, nenhuma atrasada"}
          tone={k.overdue ? "amber" : "primary"} highlight={k.overdue > 0} />
        <KpiText icon={Gauge} value={fmtPct(k.utilization_pct)}
          label={`Uso da capacidade · ${CARGA[k.status]}${k.free_hours_total != null ? ` · ${fmtNum(k.free_hours_total, 0)}h livres` : ""}`}
          tone={k.status === "sobrecarregado" ? "red" : k.status === "livre" ? "emerald" : "primary"} />
      </KpiRow>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <SectionCard title="Entregas por mês" icon={BarChart3} subtitle="User Stories concluídas nos últimos 6 meses">
          {!temSerie ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma entrega nos últimos 6 meses.</p>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip content={ChartTip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Entregues" fill="#014898" radius={[4, 4, 0, 0]} />
                <Bar dataKey="No prazo" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Você e a média do time" icon={Scale} subtitle="Mesmo período, mesmos critérios do painel de desempenho" flush>
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Indicador</th>
                  <th className={`${TABLE.th} text-right`}>Você</th>
                  <th className={`${TABLE.th} text-right`}>Média do time</th>
                </tr>
              </thead>
              <tbody>
                {comparacao.map((c) => (
                  <tr key={c.label} className={TABLE.tr}>
                    <td className={TABLE.tdFirst}>
                      {c.label}
                      {c.dica && <span className="block text-xs text-muted-foreground">{c.dica}</span>}
                    </td>
                    <td className={`${TABLE.td} text-right font-semibold tabular-nums`}>{c.voce}</td>
                    <td className={`${TABLE.td} text-right tabular-nums text-muted-foreground`}>{c.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            A média considera as {team.devs} pessoas com User Story no período, sem identificar ninguém.
          </p>
        </SectionCard>
      </div>

      <SectionCard title="Em andamento" icon={Layers} subtitle={`${k.wip} User Stor${k.wip === 1 ? "y" : "ies"} com você agora`} flush>
        {data.open_tasks.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">Nenhuma User Story em andamento com você.</p>
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>User Story</th>
                  <th className={TABLE.th}>Etapa</th>
                  <th className={TABLE.th}>Prazo</th>
                  <th className={`${TABLE.th} text-right`}>Dias na etapa</th>
                </tr>
              </thead>
              <tbody>
                {data.open_tasks.map((t) => (
                  <tr key={t.task_id} className={`${TABLE.tr} align-top`}>
                    <TarefaCell t={t} />
                    <td className={TABLE.td}>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className="h-2 w-2 rounded-full" style={{ background: t.status_color ?? "#6B7280" }} aria-hidden />
                        {t.status_name ?? "—"}
                      </span>
                    </td>
                    <td className={`${TABLE.td} whitespace-nowrap`}>
                      {fmtData(t.due_date)}
                      {t.overdue && <Pill tone="red" className="ml-1.5">Atrasada</Pill>}
                    </td>
                    <td className={`${TABLE.td} text-right tabular-nums`}>{fmtNum(t.aging_days, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Entregues no período" icon={CheckCircle2} subtitle={`${fmtData(data.date_from)} a ${fmtData(data.date_to)}`} flush>
        {data.delivered_tasks.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">Nenhuma User Story concluída no período.</p>
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>User Story</th>
                  <th className={TABLE.th}>Concluída em</th>
                  <th className={TABLE.th}>Prazo</th>
                </tr>
              </thead>
              <tbody>
                {data.delivered_tasks.map((t) => (
                  <tr key={t.task_id} className={`${TABLE.tr} align-top`}>
                    <TarefaCell t={t} />
                    <td className={`${TABLE.td} whitespace-nowrap`}>{fmtData(t.completed_at)}</td>
                    <td className={TABLE.td}>
                      {t.on_time ? <Pill tone="emerald" dot>No prazo</Pill> : <Pill tone="amber" dot>Com atraso</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {data.po && (
        <SectionCard
          title="Minha carteira (PO)"
          icon={Briefcase}
          subtitle={`${data.po.total} projeto${data.po.total === 1 ? "" : "s"}/programa${data.po.total === 1 ? "" : "s"} · execução média ${fmtPct(data.po.avg_exec_pct)}`}
          flush
        >
          {(data.po.em_risco > 0 || data.po.atrasados > 0) && (
            <div className="border-b px-5 py-3">
              <Notice tone="amber">
                <span>{data.po.em_risco} em risco · {data.po.atrasados} com prazo estourado</span>
              </Notice>
            </div>
          )}
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Projeto / programa</th>
                  <th className={TABLE.th}>Etapa</th>
                  <th className={`${TABLE.th} text-right`}>Execução</th>
                  <th className={TABLE.th}>Prazo</th>
                </tr>
              </thead>
              <tbody>
                {data.po.projetos.map((p) => (
                  <tr key={p.task_id} className={TABLE.tr}>
                    <td className={TABLE.tdFirst}>
                      <p className="font-medium">{p.title}</p>
                      <p className="text-xs text-muted-foreground">{p.planning_kind === "programa" ? "Programa" : "Projeto"}</p>
                    </td>
                    <td className={TABLE.td}>{p.stage_name ?? "—"}</td>
                    <td className={`${TABLE.td} text-right tabular-nums`}>{fmtPct(p.exec_pct)}</td>
                    <td className={`${TABLE.td} whitespace-nowrap`}>
                      {fmtData(p.due_date)}
                      {p.health === "vermelho" && <Pill tone="red" className="ml-1.5">Atrasado</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
