import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CalendarClock, FileText, Plus } from "lucide-react"

import {
  projetosApi,
  type ProjectDefaultFormField,
  type StatusReportListItem,
} from "@/api/projetos"
import { parseDefaultFieldOptions } from "@/modules/projetos/defaultFormOptions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const ALL = "__all__" // sentinela: sem filtro (Radix proíbe value="")

function fmtDateTime(s: string): string {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " · " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

export default function StatusReportsPage() {
  const navigate = useNavigate()
  const [defaultFields, setDefaultFields] = useState<ProjectDefaultFormField[]>([])
  const [availDiretorias, setAvailDiretorias] = useState<string[]>([])
  const [availAreas, setAvailAreas] = useState<string[]>([])

  const [filterDir, setFilterDir] = useState(ALL)
  const [filterArea, setFilterArea] = useState(ALL)

  const [reports, setReports] = useState<StatusReportListItem[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dlgDir, setDlgDir] = useState(ALL)
  const [dlgArea, setDlgArea] = useState(ALL)

  // value → label das opções de diretoria/área (do formulário padrão), fallback no valor cru.
  const labelMaps = useMemo(() => {
    const build = (key: string) => {
      const field = defaultFields.find((f) => f.field_key === key)
      const map = new Map<string, string>()
      if (field) parseDefaultFieldOptions(field).forEach((o) => map.set(o.value, o.label))
      return map
    }
    return { diretoria: build("diretoria"), area: build("area") }
  }, [defaultFields])

  const dirLabel = (v: string | null) => (v ? labelMaps.diretoria.get(v) ?? v : "Todas as diretorias")
  const areaLabel = (v: string | null) => (v ? labelMaps.area.get(v) ?? v : "Todas as áreas")

  // Opções de filtro (diretorias/áreas disponíveis) + rótulos.
  useEffect(() => {
    Promise.all([
      projetosApi.getReports().catch(() => null),
      projetosApi.getDefaultFormFields().catch(() => [] as ProjectDefaultFormField[]),
    ]).then(([rep, df]) => {
      if (rep) {
        setAvailDiretorias(rep.available_diretorias ?? [])
        setAvailAreas(rep.available_areas ?? [])
      }
      setDefaultFields(df)
    })
  }, [])

  // Série histórica do recorte selecionado.
  useEffect(() => {
    let active = true
    setLoading(true)
    projetosApi
      .listStatusReports({
        diretoria: filterDir === ALL ? null : filterDir,
        area: filterArea === ALL ? null : filterArea,
      })
      .then((r) => { if (active) setReports(r) })
      .catch(() => { if (active) setReports([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filterDir, filterArea])

  function generate() {
    const params = new URLSearchParams()
    if (dlgDir !== ALL) params.set("diretoria", dlgDir)
    if (dlgArea !== ALL) params.set("area", dlgArea)
    navigate(`/app/modules/projetos/status-reports/new?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">Status Reports</h3>
          <p className="text-sm text-muted-foreground">
            Gere o report do estado atual por diretoria/área e acompanhe a evolução de cada recorte ao longo do tempo.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => { setDlgDir(filterDir); setDlgArea(filterArea); setDialogOpen(true) }}>
          <Plus className="h-4 w-4" /> Gerar Status Report
        </Button>
      </div>

      {/* Filtro do recorte para a série histórica */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recorte</span>
        <div className="w-48">
          <Select value={filterDir} onValueChange={setFilterDir}>
            <SelectTrigger><SelectValue placeholder="Diretoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as diretorias</SelectItem>
              {availDiretorias.map((v) => <SelectItem key={v} value={v}>{labelMaps.diretoria.get(v) ?? v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={filterArea} onValueChange={setFilterArea}>
            <SelectTrigger><SelectValue placeholder="Área" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as áreas</SelectItem>
              {availAreas.map((v) => <SelectItem key={v} value={v}>{labelMaps.area.get(v) ?? v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {(filterDir !== ALL || filterArea !== ALL) && (
          <Button size="sm" variant="ghost" className="h-9" onClick={() => { setFilterDir(ALL); setFilterArea(ALL) }}>
            Limpar
          </Button>
        )}
      </div>

      {/* Série histórica */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum report gerado"
          description="Gere o primeiro Status Report deste recorte para iniciar a série histórica."
        />
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Card key={r.id} className="cursor-pointer transition hover:bg-muted/40" onClick={() => navigate(`/app/modules/projetos/status-reports/${r.id}`)}>
              <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3.5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  {fmtDateTime(r.generated_at)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {dirLabel(r.diretoria)} · {areaLabel(r.area)}
                </div>
                <div className="ml-auto flex items-center gap-4 text-sm tabular-nums text-muted-foreground">
                  <span><strong className="text-foreground">{r.kpis?.total ?? 0}</strong> projetos</span>
                  {r.kpis?.avg_progress_pct != null && (
                    <span><strong className="text-foreground">{r.kpis.avg_progress_pct}%</strong> progresso médio</span>
                  )}
                  <span><strong className="text-foreground">{r.kpis?.concluido ?? 0}</strong> concluídos</span>
                </div>
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/app/modules/projetos/status-reports/${r.id}`) }}>
                  Abrir
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de geração */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Status Report</DialogTitle>
            <DialogDescription>
              Selecione o recorte. O report será montado com o estado atual dos projetos — você poderá ajustar a narrativa antes de salvar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Diretoria</label>
              <Select value={dlgDir} onValueChange={setDlgDir}>
                <SelectTrigger><SelectValue placeholder="Diretoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as diretorias</SelectItem>
                  {availDiretorias.map((v) => <SelectItem key={v} value={v}>{labelMaps.diretoria.get(v) ?? v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Área</label>
              <Select value={dlgArea} onValueChange={setDlgArea}>
                <SelectTrigger><SelectValue placeholder="Área" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as áreas</SelectItem>
                  {availAreas.map((v) => <SelectItem key={v} value={v}>{labelMaps.area.get(v) ?? v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={generate}>Gerar rascunho</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
