import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Target, TrendingUp, CheckCircle2, AlertTriangle, XCircle, Clock, Gauge, ListChecks } from "lucide-react"

import { indicadoresApi, type AreaRefMini, type DashboardFilters, type DashboardKpis, type PersonMini } from "@/api/indicadores"
import { KpiCard } from "@/components/KpiCard"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ANOS, CATEGORIA_LABEL, CATEGORIA_OPTS, GRANULARIDADE_LABEL, GRANULARIDADE_OPTS, STATUS_LABEL, STATUS_OPTS,
} from "@/modules/indicadores/constants"

const ALL = "__all__"

export default function IndicadoresDashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardKpis | null>(null)
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
    indicadoresApi.getDashboard(filters).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [filters])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Painel de Indicadores</h2>
          <p className="text-sm text-muted-foreground">Visão geral de atingimento das metas.</p>
        </div>
        <Button onClick={() => navigate("/app/modules/indicadores/indicadores")}>Ver indicadores</Button>
      </div>

      {/* Filtros */}
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

      {loading || !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            <KpiCard label="Total de indicadores" value={data.total} icon={ListChecks} />
            <KpiCard label="Estratégicos" value={data.total_estrategicos} icon={Target} />
            <KpiCard label="Táticos" value={data.total_taticos} icon={TrendingUp} />
            <KpiCard label="% geral de atingimento" value={`${data.percentual_geral_atingimento.toFixed(1)}%`} icon={Gauge} />
            <KpiCard label="Atingidos" value={data.atingidos} icon={CheckCircle2} />
            <KpiCard label="Em atenção" value={data.em_atencao} icon={AlertTriangle} />
            <KpiCard label="Não atingidos" value={data.nao_atingidos} icon={XCircle} />
            <KpiCard label="Pendentes de atualização" value={data.pendentes_atualizacao} icon={Clock} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownCard title="Por categoria" data={data.por_categoria} labelMap={CATEGORIA_LABEL as Record<string, string>} />
            <BreakdownCard title="Por área" data={data.por_area} />
          </div>
        </>
      )}
    </div>
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

function BreakdownCard({ title, data, labelMap }: { title: string; data: Record<string, number>; labelMap?: Record<string, string> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...entries.map(([, v]) => v))
  return (
    <Card className="p-4">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{labelMap?.[k] ?? k}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{v}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, Math.round((v / max) * 100))}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
