import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { BarChart3 } from "lucide-react"
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
} from "@/api/indicadores"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ACOMP_STATUS_LABEL,
  ANOS, CATEGORIA_LABEL, CATEGORIA_OPTS, GRANULARIDADE_LABEL, GRANULARIDADE_OPTS, MESES, STATUS_LABEL, STATUS_OPTS,
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Painel de Indicadores</h2>
          <p className="text-sm text-muted-foreground">Meta vs. realizado por período.</p>
        </div>
        <Button onClick={() => navigate("/app/modules/indicadores/indicadores")}>Ver indicadores</Button>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <FilterSelect label="Ano" value={String(ano)} onChange={(v) => setAno(Number(v))}
            options={ANOS.map((y) => [String(y), String(y)])} allowAll={false} />
          <FilterSelect label="Categoria" value={categoria} onChange={setCategoria}
            options={CATEGORIA_OPTS.map((c) => [c, CATEGORIA_LABEL[c]])} />
          <FilterSelect label="Área" value={areaId} onChange={setAreaId}
            options={areas.map((a) => [a.id, a.name])} />
          <FilterSelect label="Responsável" value={responsavelId} onChange={setResponsavelId}
            options={persons.map((p) => [p.id, p.full_name])} />
          <FilterSelect label="Granularidade" value={granularidade} onChange={setGranularidade}
            options={GRANULARIDADE_OPTS.map((g) => [g, GRANULARIDADE_LABEL[g]])} />
          <FilterSelect label="Status" value={status} onChange={setStatus}
            options={STATUS_OPTS.map((s) => [s, STATUS_LABEL[s]])} />
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : !data || data.indicadores.length === 0 ? (
        <EmptyState icon={BarChart3} title="Nenhum indicador encontrado" description="Ajuste os filtros ou cadastre indicadores para o ano selecionado." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.indicadores.map((ind) => (
            <IndicadorChartCard key={ind.id} ind={ind} onOpen={() => navigate(`/app/modules/indicadores/indicadores/${ind.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function IndicadorChartCard({ ind, onOpen }: { ind: DashboardChartIndicador; onOpen: () => void }) {
  const rows = chartData(ind)
  const unit = ind.unidade_medida?.trim() || ""

  return (
    <Card className="flex flex-col p-4">
      <div className="mb-3 min-w-0">
        <button type="button" onClick={onOpen} className="text-left hover:text-primary">
          <p className="line-clamp-2 text-sm font-bold leading-tight">{ind.codigo} — {ind.nome}</p>
        </button>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {CATEGORIA_LABEL[ind.categoria]}
          {ind.area_name ? ` · ${ind.area_name}` : ""}
          {unit ? ` · ${unit}` : ""}
        </p>
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

function FilterSelect({ label, value, onChange, options, allowAll = true }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]; allowAll?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {allowAll && <SelectItem value={ALL}>Todos</SelectItem>}
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}
