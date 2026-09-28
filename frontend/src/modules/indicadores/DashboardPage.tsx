import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, BarChart3, CheckCircle2, Gauge, ListChecks, Target, XCircle } from "lucide-react"
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import type { TooltipProps } from "recharts"

import {
  indicadoresApi,
  type AcompStatus,
  type AreaRefMini,
  type DashboardChartIndicador,
  type DashboardCharts,
  type DashboardFilters,
  type PersonMini,
  type Sentido,
} from "@/api/indicadores"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, FilterSelect, KpiCount, KpiRow, PageHeader, Pill, type Tone } from "@/components/ds"
import {
  ACOMP_STATUS_LABEL,
  ANOS, CATEGORIA_LABEL, CATEGORIA_OPTS, GRANULARIDADE_LABEL, GRANULARIDADE_OPTS, MESES,
  SENTIDO_LABEL, STATUS_LABEL, STATUS_OPTS, SUB_PROCESSOS_PORTFOLIO,
} from "@/modules/indicadores/constants"

const ALL = "__all__"
const META_COLOR = "#6366f1"

const STATUS_BAR_COLOR: Record<AcompStatus, string> = {
  atingido: "#059669",
  em_atencao: "#d97706",
  nao_atingido: "#dc2626",
  pendente: "#94a3b8",
}

type ChartRow = {
  label: string
  meta: number | null
  realizado: number | null
  percentual_atingimento: number | null
  status: AcompStatus
}

function periodoLabel(competencia: string): string {
  const m = competencia.match(/^(\d{2})\/(\d{4})$/)
  if (!m) return competencia
  const mes = MESES.find(([n]) => n === Number(m[1]))
  return mes ? mes[1].slice(0, 3) : competencia
}

function formatValor(value: number | null | undefined, unit: string): string {
  if (value == null) return "—"
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2)
  return unit ? `${formatted} ${unit}` : formatted
}

function metaBateuLabel(status: AcompStatus): string {
  if (status === "atingido") return "✓ Meta"
  if (status === "em_atencao") return "⚠ Atenção"
  if (status === "nao_atingido") return "✗ Meta"
  return "Pendente"
}

function chartData(ind: DashboardChartIndicador): ChartRow[] {
  return ind.periodos.map((p) => ({
    label: periodoLabel(p.competencia),
    meta: p.meta,
    realizado: p.realizado,
    percentual_atingimento: p.percentual_atingimento,
    status: p.status,
  }))
}

function ChartTooltip({ active, payload, label, unit }: TooltipProps<number, string> & { unit: string }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as ChartRow

  return (
    <div className="rounded-lg border bg-background px-3 py-2.5 text-sm shadow-md">
      <p className="mb-2 font-semibold">Período: {label}</p>
      <div className="space-y-1 text-muted-foreground">
        <p className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: META_COLOR }} />
          Meta: <span className="font-medium text-foreground">{formatValor(row.meta, unit)}</span>
        </p>
        <p className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_BAR_COLOR[row.status] }} />
          Realizado: <span className="font-medium text-foreground">{formatValor(row.realizado, unit)}</span>
        </p>
        <p className="border-t pt-1.5">
          Atingimento:{" "}
          <span className="font-semibold" style={{ color: STATUS_BAR_COLOR[row.status] }}>
            {row.percentual_atingimento != null ? `${row.percentual_atingimento.toFixed(1)}%` : "—"}
          </span>
          {" · "}
          {ACOMP_STATUS_LABEL[row.status]}
        </p>
      </div>
    </div>
  )
}

function MetaBarLabel(props: { x?: number; y?: number; width?: number; value?: number | string }) {
  const { x = 0, y = 0, width = 0, value } = props
  if (value == null || value === "") return null
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={9} fontWeight={600} fill="#6366f1">
      {Number(value) % 1 === 0 ? Number(value) : Number(value).toFixed(1)}
    </text>
  )
}

function RealizadoBarLabel(props: {
  x?: number
  y?: number
  width?: number
  index?: number
  payload?: ChartRow
}) {
  const { x = 0, y = 0, width = 0, payload } = props
  if (!payload || payload.realizado == null) return null

  const color = STATUS_BAR_COLOR[payload.status]
  const cx = x + width / 2
  const pct = payload.percentual_atingimento

  return (
    <g>
      <text x={cx} y={y - 16} textAnchor="middle" fontSize={10} fontWeight={700} fill={color}>
        {pct != null ? `${pct.toFixed(0)}%` : "—"}
      </text>
      <text x={cx} y={y - 5} textAnchor="middle" fontSize={8} fontWeight={600} fill={color}>
        {metaBateuLabel(payload.status)}
      </text>
    </g>
  )
}

export default function IndicadoresDashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardCharts | null>(null)
  const [areas, setAreas] = useState<AreaRefMini[]>([])
  const [persons, setPersons] = useState<PersonMini[]>([])
  const [loading, setLoading] = useState(true)
  const [ano, setAno] = useState<number>(new Date().getFullYear())
  const [categoria, setCategoria] = useState(ALL)
  const [areaId, setAreaId] = useState(ALL)
  const [responsavelId, setResponsavelId] = useState(ALL)
  const [granularidade, setGranularidade] = useState(ALL)
  const [status, setStatus] = useState(ALL)

  useEffect(() => {
    Promise.all([
      indicadoresApi.listAreas().catch(() => []),
      indicadoresApi.listPersons().catch(() => []),
    ]).then(([a, p]) => { setAreas(a); setPersons(p) })
  }, [])

  const filters = useMemo<DashboardFilters>(() => ({
    ano,
    categoria: categoria === ALL ? undefined : categoria,
    area_id: areaId === ALL ? undefined : areaId,
    responsavel_id: responsavelId === ALL ? undefined : responsavelId,
    granularidade: granularidade === ALL ? undefined : granularidade,
    status: status === ALL ? undefined : status,
  }), [ano, categoria, areaId, responsavelId, granularidade, status])

  useEffect(() => {
    setLoading(true)
    indicadoresApi.getDashboardGraficos(filters).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [filters])

  // Faixa de indicadores do topo: conta sobre o que o painel mostra (filtros aplicados).
  const counts = useMemo(() => {
    const inds = data?.indicadores ?? []
    const periodos = inds.flatMap((i) => i.periodos)
    return {
      total: inds.length,
      estrategicos: inds.filter((i) => i.categoria === "estrategico").length,
      taticos: inds.filter((i) => i.categoria === "tatico").length,
      atingidos: periodos.filter((p) => p.status === "atingido").length,
      atencao: periodos.filter((p) => p.status === "em_atencao").length,
      naoAtingidos: periodos.filter((p) => p.status === "nao_atingido").length,
    }
  }, [data])

  const todos = { value: ALL, label: "Todos" }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Gauge}
        color="#16A34A"
        title="Painel de Indicadores"
        description="Meta vs. realizado por período."
        actions={
          <Button className="h-10 gap-1.5" onClick={() => navigate("/app/modules/indicadores/indicadores")}>
            <ListChecks size={16} /> Ver indicadores
          </Button>
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect label="Ano" value={String(ano)} onChange={(v) => setAno(Number(v))}
            options={ANOS.map((y) => ({ value: String(y), label: String(y) }))} />
          <FilterSelect label="Categoria" value={categoria} onChange={setCategoria}
            options={[todos, ...CATEGORIA_OPTS.map((c) => ({ value: c, label: CATEGORIA_LABEL[c] }))]} />
          <FilterSelect label="Área" value={areaId} onChange={setAreaId}
            options={[todos, ...areas.map((a) => ({ value: a.id, label: a.name }))]} />
          <FilterSelect label="Responsável" value={responsavelId} onChange={setResponsavelId}
            options={[todos, ...persons.map((p) => ({ value: p.id, label: p.full_name }))]} />
          <FilterSelect label="Granularidade" value={granularidade} onChange={setGranularidade}
            options={[todos, ...GRANULARIDADE_OPTS.map((g) => ({ value: g, label: GRANULARIDADE_LABEL[g] }))]} />
          <FilterSelect label="Status" value={status} onChange={setStatus}
            options={[todos, ...STATUS_OPTS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
        </div>
      </Card>

      {loading ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Skeleton className="h-72 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        </>
      ) : !data || data.indicadores.length === 0 ? (
        <Card>
          <EmptyState icon={BarChart3} title="Nenhum indicador encontrado" description="Ajuste os filtros ou cadastre indicadores para o ano selecionado." />
        </Card>
      ) : (
        <>
          {/* Estratégicos/Táticos ligam e desligam o mesmo filtro de Categoria da barra acima. */}
          <KpiRow className="sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <KpiCount icon={BarChart3} value={counts.total} label="Indicadores" />
            <KpiCount
              icon={Target} value={counts.estrategicos} label="Estratégicos" tone="violet"
              onClick={() => setCategoria((c) => (c === "estrategico" ? ALL : "estrategico"))} active={categoria === "estrategico"}
            />
            <KpiCount
              icon={ListChecks} value={counts.taticos} label="Táticos"
              onClick={() => setCategoria((c) => (c === "tatico" ? ALL : "tatico"))} active={categoria === "tatico"}
            />
            <KpiCount icon={CheckCircle2} value={counts.atingidos} label={`Períodos com meta atingida (${ano})`} tone="emerald" />
            <KpiCount
              icon={AlertTriangle} value={counts.atencao} label="Períodos em atenção" tone={counts.atencao > 0 ? "amber" : "slate"}
            />
            <KpiCount
              icon={XCircle} value={counts.naoAtingidos} label="Períodos com meta não atingida" tone={counts.naoAtingidos > 0 ? "red" : "slate"}
              highlight={counts.naoAtingidos > 0}
            />
          </KpiRow>

          <div className="space-y-7">
            {(["estrategico", "tatico"] as const).map((cat) => {
              const inds = data.indicadores.filter((i) => i.categoria === cat)
              if (inds.length === 0) return null
              return (
                <section key={cat} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={18} className="text-muted-foreground" />
                    <h2 className="text-lg font-semibold">
                      Indicadores {cat === "estrategico" ? "Estratégicos" : "Táticos"}
                    </h2>
                    <Pill>{inds.length}</Pill>
                  </div>
                  {cat === "estrategico" ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                      {inds.map((ind) => (
                        <IndicadorChartCard key={ind.id} ind={ind} onOpen={() => navigate(`/app/modules/indicadores/indicadores/${ind.id}`)} />
                      ))}
                    </div>
                  ) : (
                    // Táticos agrupados por sub-processo do portfólio (ordem canônica primeiro).
                    (() => {
                      const groups = new Map<string, DashboardChartIndicador[]>()
                      for (const i of inds) {
                        const k = i.sub_processo?.trim() || "Sem sub-processo vinculado"
                        groups.set(k, [...(groups.get(k) ?? []), i])
                      }
                      const ordered = [
                        ...SUB_PROCESSOS_PORTFOLIO.filter((sp) => groups.has(sp)),
                        ...[...groups.keys()].filter((k) => !SUB_PROCESSOS_PORTFOLIO.includes(k)),
                      ]
                      return ordered.map((sp) => (
                        <div key={sp} className="space-y-3">
                          <h3 className="flex flex-wrap items-center gap-2 border-l-4 border-primary pl-2 text-sm font-semibold">
                            <span><span className="font-normal text-muted-foreground">Sub. Processo:</span> {sp}</span>
                            <Pill>{groups.get(sp)!.length}</Pill>
                          </h3>
                          <div className="grid gap-4 xl:grid-cols-2">
                            {groups.get(sp)!.map((ind) => (
                              <IndicadorChartCard key={ind.id} ind={ind} onOpen={() => navigate(`/app/modules/indicadores/indicadores/${ind.id}`)} />
                            ))}
                          </div>
                        </div>
                      ))
                    })()
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// Polaridade do indicador (selo do cartão).
const SENTIDO_BADGE: Record<Sentido, { arrow: string; tone: Tone }> = {
  maior_melhor: { arrow: "▲", tone: "emerald" },
  menor_melhor: { arrow: "▼", tone: "red" },
  faixa_ideal: { arrow: "↔", tone: "blue" },
}

function IndicadorChartCard({ ind, onOpen }: { ind: DashboardChartIndicador; onOpen: () => void }) {
  const rows = chartData(ind)
  const unit = ind.unidade_medida?.trim() || ""
  const sentido = ind.sentido ? SENTIDO_BADGE[ind.sentido] : null

  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpen} className="min-w-0 text-left hover:text-primary">
            <p className="line-clamp-2 font-semibold leading-tight">{ind.nome}</p>
          </button>
          {sentido && ind.sentido && (
            <span className="shrink-0" title={`Polaridade: ${SENTIDO_LABEL[ind.sentido].toLowerCase()}`}>
              <Pill tone={sentido.tone}>{sentido.arrow} {SENTIDO_LABEL[ind.sentido]}</Pill>
            </span>
          )}
        </div>
        {ind.sub_processo && (
          <p className="mt-0.5 truncate text-xs font-medium text-primary" title={ind.sub_processo}>
            Sub. Processo: {ind.sub_processo}
          </p>
        )}
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {CATEGORIA_LABEL[ind.categoria]}
          {ind.area_name ? ` · ${ind.area_name}` : ""}
          {unit ? ` · ${unit}` : ""}
        </p>
        {ind.formula_calculo && (
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground" title={ind.formula_calculo}>
            <span className="font-medium text-foreground/80">Fórmula:</span> {ind.formula_calculo}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-10 text-center text-sm text-muted-foreground">
          Sem acompanhamentos para o ano selecionado.
        </p>
      ) : (
        <div className="h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 28, right: 4, left: -8, bottom: 0 }} barGap={2} barCategoryGap="16%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
              <Legend
                formatter={(value) => (value === "meta" ? "Meta" : "Realizado")}
                wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
              />
              <Bar dataKey="meta" name="meta" fill={META_COLOR} radius={[3, 3, 0, 0]} maxBarSize={24}>
                <LabelList dataKey="meta" content={<MetaBarLabel />} />
              </Bar>
              <Bar dataKey="realizado" name="realizado" radius={[3, 3, 0, 0]} maxBarSize={24}>
                {rows.map((row) => (
                  <Cell key={row.label} fill={STATUS_BAR_COLOR[row.status]} />
                ))}
                <LabelList content={<RealizadoBarLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
