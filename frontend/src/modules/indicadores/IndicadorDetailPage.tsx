import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Loader2, Pencil, RefreshCw } from "lucide-react"

import { indicadoresApi, type Acompanhamento, type Indicador } from "@/api/indicadores"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/toast"
import { AcompanhamentoEditDialog } from "@/modules/indicadores/AcompanhamentoEditDialog"
import { AcompanhamentoEvidenciasDialog } from "@/modules/indicadores/AcompanhamentoEvidenciasDialog"
import { AcompanhamentoTableRow } from "@/modules/indicadores/AcompanhamentoTableRow"
import { IndicadorFormDialog } from "@/modules/indicadores/IndicadorFormDialog"
import {
  ANOS, CATEGORIA_LABEL, FONTE_LABEL, GRANULARIDADE_LABEL, METRICA_LABEL,
  SENTIDO_LABEL, STATUS_LABEL,
} from "@/modules/indicadores/constants"

export default function IndicadorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [ind, setInd] = useState<Indicador | null>(null)
  const [loading, setLoading] = useState(true)
  const [ano, setAno] = useState<number>(new Date().getFullYear())
  const [formOpen, setFormOpen] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [atualizandoPortfolio, setAtualizandoPortfolio] = useState(false)
  const [editAcomp, setEditAcomp] = useState<Acompanhamento | null>(null)
  const [evidenciasAcomp, setEvidenciasAcomp] = useState<Acompanhamento | null>(null)

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    indicadoresApi.get(id).then(setInd).catch(() => setInd(null)).finally(() => setLoading(false))
  }, [id])

  useEffect(load, [load])

  const acomps = useMemo(
    () => (ind?.acompanhamentos ?? []).filter((a) => a.ano_referencia === ano),
    [ind, ano],
  )

  function patchAcomp(updated: Acompanhamento) {
    setInd((prev) =>
      prev
        ? { ...prev, acompanhamentos: prev.acompanhamentos.map((x) => (x.id === updated.id ? updated : x)) }
        : prev,
    )
  }

  async function gerarAno() {
    if (!id) return
    setGerando(true)
    try {
      await indicadoresApi.gerarAcompanhamentos(id, ano)
      toast.success(`Períodos de ${ano} gerados.`)
      load()
    } catch {
      toast.error("Não foi possível gerar os períodos.")
    } finally {
      setGerando(false)
    }
  }

  async function atualizarPortfolio() {
    if (!id) return
    setAtualizandoPortfolio(true)
    try {
      const updated = await indicadoresApi.atualizarPortfolio(id)
      setInd(updated)
      toast.success("Portfólio atualizado (meses bloqueados foram preservados).")
    } catch {
      toast.error("Não foi possível atualizar do portfólio.")
    } finally {
      setAtualizandoPortfolio(false)
    }
  }

  if (loading || !ind) {
    return <Skeleton className="h-60 w-full" />
  }

  const unit = ind.unidade_medida?.trim() || "%"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/modules/indicadores/indicadores")}>
          <ArrowLeft size={16} />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate">{ind.codigo} — {ind.nome}</h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <Badge variant="outline" className="text-[10px]">{CATEGORIA_LABEL[ind.categoria]}</Badge>
            <Badge variant="outline" className="text-[10px]">{GRANULARIDADE_LABEL[ind.granularidade]}</Badge>
            <Badge variant="outline" className="text-[10px]">{SENTIDO_LABEL[ind.sentido]}</Badge>
            <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[ind.status]}</Badge>
            <Badge variant={ind.fonte === "portfolio" ? "secondary" : "outline"} className="text-[10px]">
              {FONTE_LABEL[ind.fonte]}
            </Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
          <Pencil size={13} /> Editar
        </Button>
        {ind.fonte === "portfolio" && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void atualizarPortfolio()}
            disabled={atualizandoPortfolio}
          >
            <RefreshCw size={13} className={atualizandoPortfolio ? "animate-spin" : ""} />
            Atualizar portfólio
          </Button>
        )}
      </div>

      <Card className="p-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3 text-sm">
        <MetaItem label="Área" value={ind.area?.name ?? "—"} />
        <MetaItem label="Responsável" value={ind.responsavel?.full_name ?? "—"} />
        <MetaItem label="Unidade" value={ind.unidade_medida ?? "—"} />
        <MetaItem label="Periodicidade" value={ind.periodicidade_atualizacao ?? "—"} />
        <MetaItem label="Fonte de dados" value={ind.fonte_dados ?? "—"} />
        {ind.fonte === "portfolio" && (
          <>
            <MetaItem label="Métrica" value={ind.fonte_metrica ? METRICA_LABEL[ind.fonte_metrica] : "—"} />
            <MetaItem label="Corte portfólio" value={ind.fonte_corte ?? "—"} />
            <MetaItem
              label="Snapshot portfólio (hoje)"
              value={
                ind.fonte_portfolio_pct != null
                  ? `${ind.fonte_portfolio_pct}% (${ind.fonte_portfolio_num ?? 0}/${ind.fonte_portfolio_den ?? 0})`
                  : "—"
              }
            />
          </>
        )}
        {ind.descricao && (
          <div className="md:col-span-2 lg:col-span-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Descrição</p>
            <p className="mt-1 text-muted-foreground">{ind.descricao}</p>
          </div>
        )}
        {ind.objetivo_estrategico && (
          <div className="md:col-span-2 lg:col-span-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Objetivo estratégico</p>
            <p className="mt-1 text-muted-foreground">{ind.objetivo_estrategico}</p>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Ano de referência</Label>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANOS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => void gerarAno()} disabled={gerando}>
          {gerando && <Loader2 size={14} className="mr-1.5 animate-spin" />}
          Gerar períodos de {ano}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Competência</th>
                <th className="px-3 py-2 font-semibold text-right">Meta ({unit})</th>
                <th className="px-3 py-2 font-semibold text-right">Realizado ({unit})</th>
                <th className="px-3 py-2 font-semibold text-right">Atingimento</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Origem</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {acomps.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Nenhum período gerado para {ano}.
                  </td>
                </tr>
              ) : acomps.map((a) => (
                <AcompanhamentoTableRow
                  key={a.id}
                  acomp={a}
                  onUpdated={patchAcomp}
                  onEditDetails={() => setEditAcomp(a)}
                  onEditEvidencias={() => setEvidenciasAcomp(a)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <IndicadorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        indicador={ind}
        onSaved={(saved) => { setFormOpen(false); setInd(saved) }}
      />

      {editAcomp && (
        <AcompanhamentoEditDialog
          indicador={ind}
          acomp={editAcomp}
          onClose={() => setEditAcomp(null)}
          onSaved={() => { setEditAcomp(null); load() }}
        />
      )}

      {evidenciasAcomp && (
        <AcompanhamentoEvidenciasDialog
          acomp={evidenciasAcomp}
          fonteMetrica={ind.fonte_metrica}
          onClose={() => setEvidenciasAcomp(null)}
          onSaved={(updated) => {
            patchAcomp(updated)
            setEvidenciasAcomp(null)
          }}
        />
      )}
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  )
}
