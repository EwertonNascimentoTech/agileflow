import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Pencil, Plus, Trash2 } from "lucide-react"

import {
  indicadoresApi, type AreaRefMini, type DashboardFilters, type Indicador, type IndicadorListItem, type PersonMini,
} from "@/api/indicadores"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import { IndicadorFormDialog } from "@/modules/indicadores/IndicadorFormDialog"
import {
  ACOMP_STATUS_COLOR, ACOMP_STATUS_LABEL, ANOS, CATEGORIA_LABEL, CATEGORIA_OPTS,
  GRANULARIDADE_LABEL, GRANULARIDADE_OPTS, SENTIDO_LABEL, STATUS_LABEL, STATUS_OPTS,
} from "@/modules/indicadores/constants"

const ALL = "__all__"

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
    if (!confirm(`Inativar o indicador "${it.codigo} — ${it.nome}"?`)) return
    await indicadoresApi.remove(it.id)
    toast.success("Indicador inativado.")
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Indicadores</h2>
          <p className="text-sm text-muted-foreground">Cadastro de indicadores estratégicos e táticos.</p>
        </div>
        <Button className="gap-1.5" onClick={() => { setEditing(null); setFormOpen(true) }}><Plus size={15} /> Novo indicador</Button>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Filter label="Ano" value={String(ano)} onChange={(v) => setAno(Number(v))} options={ANOS.map((y) => [String(y), String(y)])} allowAll={false} />
          <Filter label="Categoria" value={categoria} onChange={setCategoria} options={CATEGORIA_OPTS.map((c) => [c, CATEGORIA_LABEL[c]])} />
          <Filter label="Área" value={areaId} onChange={setAreaId} options={areas.map((a) => [a.id, a.name])} />
          <Filter label="Responsável" value={responsavelId} onChange={setResponsavelId} options={persons.map((p) => [p.id, p.full_name])} />
          <Filter label="Granularidade" value={granularidade} onChange={setGranularidade} options={GRANULARIDADE_OPTS.map((g) => [g, GRANULARIDADE_LABEL[g]])} />
          <Filter label="Status" value={status} onChange={setStatus} options={STATUS_OPTS.map((s) => [s, STATUS_LABEL[s]])} />
        </div>
      </Card>

      {loading ? (
        <Skeleton className="h-60 w-full" />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum indicador encontrado.</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Código</th>
                  <th className="px-3 py-2 font-semibold">Indicador</th>
                  <th className="px-3 py-2 font-semibold">Categoria</th>
                  <th className="px-3 py-2 font-semibold">Área</th>
                  <th className="px-3 py-2 font-semibold">Responsável</th>
                  <th className="px-3 py-2 font-semibold">Granularidade</th>
                  <th className="px-3 py-2 font-semibold">Atingimento ({ano})</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => navigate(`/app/modules/indicadores/indicadores/${it.id}`)}>
                    <td className="px-3 py-2 font-mono text-xs">{it.codigo}</td>
                    <td className="px-3 py-2 font-medium">{it.nome}
                      <span className="block text-[11px] font-normal text-muted-foreground">{SENTIDO_LABEL[it.sentido]}</span>
                    </td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{CATEGORIA_LABEL[it.categoria]}</Badge></td>
                    <td className="px-3 py-2 text-muted-foreground">{it.area_name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{it.responsavel_nome ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{GRANULARIDADE_LABEL[it.granularidade]}</td>
                    <td className="px-3 py-2">
                      {it.status_atual ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ACOMP_STATUS_COLOR[it.status_atual]}`}>{ACOMP_STATUS_LABEL[it.status_atual]}</span>
                          {it.percentual_atingimento != null && <span className="tabular-nums text-xs text-muted-foreground">{it.percentual_atingimento.toFixed(0)}%</span>}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">Sem dados</span>}
                    </td>
                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={() => void openEdit(it.id)}><Pencil size={14} /></Button>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => void del(it)}><Trash2 size={14} /></Button>
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

function Filter({ label, value, onChange, options, allowAll = true }: {
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
