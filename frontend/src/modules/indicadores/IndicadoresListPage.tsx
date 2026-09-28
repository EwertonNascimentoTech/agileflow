import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, BarChart3, CheckCircle2, CircleDashed, ListChecks, Pencil, Plus, Target, Trash2, XCircle } from "lucide-react"

import {
  indicadoresApi, type AcompStatus, type AreaRefMini, type DashboardFilters, type Indicador, type IndicadorListItem, type PersonMini,
} from "@/api/indicadores"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Card, FilterSelect, KpiCount, KpiRow, PageHeader, Pill, TABLE, type Tone } from "@/components/ds"
import { toast } from "@/lib/toast"
import { IndicadorFormDialog } from "@/modules/indicadores/IndicadorFormDialog"
import {
  ACOMP_STATUS_LABEL, ANOS, CATEGORIA_LABEL, CATEGORIA_OPTS,
  GRANULARIDADE_LABEL, GRANULARIDADE_OPTS, SENTIDO_LABEL, STATUS_LABEL, STATUS_OPTS,
} from "@/modules/indicadores/constants"

const ALL = "__all__"

// Tom do selo de atingimento (Pill do design system, com variante escura).
const ACOMP_TONE: Record<AcompStatus, Tone> = {
  pendente: "slate", atingido: "emerald", em_atencao: "amber", nao_atingido: "red",
}

export default function IndicadoresListPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<IndicadorListItem[]>([])
  const [areas, setAreas] = useState<AreaRefMini[]>([])
  const [persons, setPersons] = useState<PersonMini[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Indicador | null>(null)

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

  function reload() {
    setLoading(true)
    indicadoresApi.list(filters).then(setItems).catch(() => setItems([])).finally(() => setLoading(false))
  }
  useEffect(reload, [filters])

  async function openEdit(id: string) {
    const full = await indicadoresApi.get(id)
    setEditing(full)
    setFormOpen(true)
  }
  async function del(it: IndicadorListItem) {
    if (!confirm(`Inativar o indicador "${it.nome}"?`)) return
    await indicadoresApi.remove(it.id)
    toast.success("Indicador inativado.")
    reload()
  }

  // Faixa de indicadores do topo: conta sobre a lista carregada (filtros aplicados).
  const counts = useMemo(() => ({
    estrategicos: items.filter((i) => i.categoria === "estrategico").length,
    taticos: items.filter((i) => i.categoria === "tatico").length,
    atingidos: items.filter((i) => i.status_atual === "atingido").length,
    atencao: items.filter((i) => i.status_atual === "em_atencao").length,
    naoAtingidos: items.filter((i) => i.status_atual === "nao_atingido").length,
    semDados: items.filter((i) => !i.status_atual || i.status_atual === "pendente").length,
  }), [items])

  const todos = { value: ALL, label: "Todos" }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={BarChart3}
        color="#16A34A"
        title="Indicadores"
        description="Cadastro de indicadores estratégicos e táticos."
        actions={
          <Button className="h-10 gap-1.5" onClick={() => { setEditing(null); setFormOpen(true) }}><Plus size={16} /> Novo indicador</Button>
        }
      />

      {/* Estratégicos/Táticos ligam e desligam o mesmo filtro de Categoria da barra abaixo. */}
      {loading && items.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
      ) : (
      <KpiRow className="sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCount
          icon={Target} value={counts.estrategicos} label="Estratégicos" tone="violet"
          onClick={() => setCategoria((c) => (c === "estrategico" ? ALL : "estrategico"))} active={categoria === "estrategico"}
        />
        <KpiCount
          icon={ListChecks} value={counts.taticos} label="Táticos"
          onClick={() => setCategoria((c) => (c === "tatico" ? ALL : "tatico"))} active={categoria === "tatico"}
        />
        <KpiCount icon={CheckCircle2} value={counts.atingidos} label="Atingidos" tone="emerald" />
        <KpiCount icon={AlertTriangle} value={counts.atencao} label="Em atenção" tone={counts.atencao > 0 ? "amber" : "slate"} />
        <KpiCount
          icon={XCircle} value={counts.naoAtingidos} label="Não atingidos" tone={counts.naoAtingidos > 0 ? "red" : "slate"}
          highlight={counts.naoAtingidos > 0}
        />
        <KpiCount icon={CircleDashed} value={counts.semDados} label="Sem dados / pendentes" tone="slate" />
      </KpiRow>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect label="Ano" value={String(ano)} onChange={(v) => setAno(Number(v))} options={ANOS.map((y) => ({ value: String(y), label: String(y) }))} />
          <FilterSelect label="Categoria" value={categoria} onChange={setCategoria} options={[todos, ...CATEGORIA_OPTS.map((c) => ({ value: c, label: CATEGORIA_LABEL[c] }))]} />
          <FilterSelect label="Área" value={areaId} onChange={setAreaId} options={[todos, ...areas.map((a) => ({ value: a.id, label: a.name }))]} />
          <FilterSelect label="Responsável" value={responsavelId} onChange={setResponsavelId} options={[todos, ...persons.map((p) => ({ value: p.id, label: p.full_name }))]} />
          <FilterSelect label="Granularidade" value={granularidade} onChange={setGranularidade} options={[todos, ...GRANULARIDADE_OPTS.map((g) => ({ value: g, label: GRANULARIDADE_LABEL[g] }))]} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[todos, ...STATUS_OPTS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
          {!loading && (
            <span className="ml-auto pb-2 text-sm text-muted-foreground">
              <strong className="font-semibold text-foreground">{items.length}</strong> {items.length === 1 ? "indicador" : "indicadores"}
            </span>
          )}
        </div>
      </Card>

      {loading ? (
        <Skeleton className="h-60 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={BarChart3} title="Nenhum indicador encontrado" description="Ajuste os filtros ou cadastre um novo indicador." compact />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Código</th>
                  <th className={TABLE.th}>Indicador</th>
                  <th className={TABLE.th}>Categoria</th>
                  <th className={TABLE.th}>Área</th>
                  <th className={TABLE.th}>Responsável</th>
                  <th className={TABLE.th}>Granularidade</th>
                  <th className={`${TABLE.th} whitespace-nowrap`}>Atingimento ({ano})</th>
                  <th className={`${TABLE.th} w-24`}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className={`${TABLE.tr} group cursor-pointer`} onClick={() => navigate(`/app/modules/indicadores/indicadores/${it.id}`)}>
                    <td className={`${TABLE.tdFirst} whitespace-nowrap font-mono text-xs`}>{it.codigo}</td>
                    <td className={TABLE.td}>
                      <span className="font-semibold">{it.nome}</span>
                      <span className="block text-xs text-muted-foreground">
                        {SENTIDO_LABEL[it.sentido]}
                        {it.sub_processo ? ` · ${it.sub_processo}` : ""}
                      </span>
                    </td>
                    <td className={TABLE.td}><Pill tone={it.categoria === "estrategico" ? "violet" : "blue"}>{CATEGORIA_LABEL[it.categoria]}</Pill></td>
                    <td className={`${TABLE.td} text-muted-foreground`}>{it.area_name ?? "—"}</td>
                    <td className={`${TABLE.td} whitespace-nowrap text-muted-foreground`}>{it.responsavel_nome ?? "—"}</td>
                    <td className={`${TABLE.td} text-muted-foreground`}>{GRANULARIDADE_LABEL[it.granularidade]}</td>
                    <td className={TABLE.td}>
                      {it.status_atual ? (
                        <span className="inline-flex items-center gap-2">
                          <Pill tone={ACOMP_TONE[it.status_atual]} dot>{ACOMP_STATUS_LABEL[it.status_atual]}</Pill>
                          {it.percentual_atingimento != null && <span className="text-xs tabular-nums text-muted-foreground">{it.percentual_atingimento.toFixed(0)}%</span>}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">Sem dados</span>}
                    </td>
                    <td className={`${TABLE.td} text-right`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Editar indicador" aria-label="Editar indicador" onClick={() => void openEdit(it.id)}><Pencil size={15} /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Inativar indicador" aria-label="Inativar indicador" onClick={() => void del(it)}><Trash2 size={15} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <IndicadorFormDialog open={formOpen} onOpenChange={setFormOpen} indicador={editing}
        onSaved={(saved) => { setFormOpen(false); if (!editing) navigate(`/app/modules/indicadores/indicadores/${saved.id}`); else reload() }} />
    </div>
  )
}
