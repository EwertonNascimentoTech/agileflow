import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import {
  AlertTriangle, BarChart3, CalendarPlus, CheckCircle2, CircleDashed, ClipboardList, FileText, Gauge, Loader2, Pencil, RefreshCw,
  XCircle,
} from "lucide-react"

import { indicadoresApi, type Acompanhamento, type AcompStatus, type Indicador } from "@/api/indicadores"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import {
  Card, DetailHeader, Field, FilterSelect, KpiCount, KpiPerson, KpiRow, KpiText, Pill, SectionCard, TABLE,
  type KpiTone, type MenuAction, type Tone,
} from "@/components/ds"
import { toast } from "@/lib/toast"
import { AcompanhamentoEditDialog } from "@/modules/indicadores/AcompanhamentoEditDialog"
import { AcompanhamentoEvidenciasDialog } from "@/modules/indicadores/AcompanhamentoEvidenciasDialog"
import { AcompanhamentoTableRow } from "@/modules/indicadores/AcompanhamentoTableRow"
import { IndicadorFormDialog } from "@/modules/indicadores/IndicadorFormDialog"
import {
  ACOMP_STATUS_LABEL, ANOS, CATEGORIA_LABEL, FONTE_LABEL, GRANULARIDADE_LABEL, METRICA_LABEL,
  SENTIDO_LABEL, STATUS_LABEL,
} from "@/modules/indicadores/constants"

// Tons do cartão "Último período apurado" (KpiText do design system).
const ACOMP_KPI: Record<AcompStatus, KpiTone> = {
  pendente: "slate", atingido: "emerald", em_atencao: "amber", nao_atingido: "red",
}
const ACOMP_TEXT: Record<AcompStatus, string> = {
  pendente: "text-muted-foreground",
  atingido: "text-emerald-600 dark:text-emerald-400",
  em_atencao: "text-amber-600 dark:text-amber-400",
  nao_atingido: "text-red-600 dark:text-red-400",
}
const SENTIDO_TONE: Record<Indicador["sentido"], Tone> = { maior_melhor: "emerald", menor_melhor: "red", faixa_ideal: "blue" }

export default function IndicadorDetailPage() {
  const { id } = useParams<{ id: string }>()
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

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 w-2/3 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
        <Skeleton className="h-60 w-full rounded-2xl" />
      </div>
    )
  }
  if (!ind) {
    return (
      <Card>
        <EmptyState icon={BarChart3} title="Indicador não encontrado" description="Volte para a lista de indicadores." />
      </Card>
    )
  }

  const unit = ind.unidade_medida?.trim() || "%"
  const contagem = {
    atingidos: acomps.filter((a) => a.status === "atingido").length,
    atencao: acomps.filter((a) => a.status === "em_atencao").length,
    naoAtingidos: acomps.filter((a) => a.status === "nao_atingido").length,
    pendentes: acomps.filter((a) => a.status === "pendente").length,
  }
  // Último período do ano com realizado lançado (o mais recente na ordem da tabela).
  const ultimo = [...acomps].reverse().find((a) => a.realizado != null) ?? null

  const actions: MenuAction[] = [
    { label: "Editar indicador", icon: Pencil, onClick: () => setFormOpen(true) },
  ]

  return (
    <div className="space-y-5">
      <DetailHeader
        crumbs={[{ label: "Indicadores", to: "/app/modules/indicadores/indicadores" }, { label: ind.nome }]}
        icon="BarChart3"
        color="#16A34A"
        title={ind.nome}
        badge={
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={ind.categoria === "estrategico" ? "violet" : "blue"}>{CATEGORIA_LABEL[ind.categoria]}</Pill>
            <Pill>{GRANULARIDADE_LABEL[ind.granularidade]}</Pill>
            <Pill tone={SENTIDO_TONE[ind.sentido]}>{SENTIDO_LABEL[ind.sentido]}</Pill>
            <Pill tone={ind.status === "ativo" ? "emerald" : "slate"} dot>{STATUS_LABEL[ind.status]}</Pill>
            <Pill tone={ind.fonte === "portfolio" ? "teal" : "slate"}>{FONTE_LABEL[ind.fonte]}</Pill>
          </div>
        }
        meta={<>Código: <span className="font-mono text-foreground">{ind.codigo}</span></>}
        updatedAt={ind.updated_at ?? null}
        actions={actions}
      />

      <KpiRow className="sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiPerson name={ind.responsavel?.full_name} role="Responsável" />
        {ultimo ? (
          <KpiText
            icon={Gauge}
            tone={ACOMP_KPI[ultimo.status]}
            label={`Último período apurado (${ultimo.competencia})`}
            value={
              <span className={ACOMP_TEXT[ultimo.status]}>
                {ultimo.percentual_atingimento != null ? `${Number(ultimo.percentual_atingimento).toFixed(1)}%` : "—"}
                {" · "}{ACOMP_STATUS_LABEL[ultimo.status]}
              </span>
            }
          />
        ) : (
          <KpiText icon={Gauge} tone="slate" label={`Último período apurado (${ano})`} value="Sem realizado" />
        )}
        <KpiCount icon={CheckCircle2} value={contagem.atingidos} label={`Atingidos em ${ano}`} tone="emerald" />
        <KpiCount icon={AlertTriangle} value={contagem.atencao} label="Em atenção" tone={contagem.atencao > 0 ? "amber" : "slate"} />
        <KpiCount
          icon={XCircle} value={contagem.naoAtingidos} label="Não atingidos" tone={contagem.naoAtingidos > 0 ? "red" : "slate"}
          highlight={contagem.naoAtingidos > 0}
        />
        <KpiCount icon={CircleDashed} value={contagem.pendentes} label="Pendentes" tone="slate" />
      </KpiRow>

      <SectionCard title="Ficha do indicador" icon={FileText}>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Área">{ind.area?.name ?? "—"}</Field>
          <Field label="Responsável">{ind.responsavel?.full_name ?? "—"}</Field>
          <Field label="Unidade">{ind.unidade_medida ?? "—"}</Field>
          <Field label="Periodicidade">{ind.periodicidade_atualizacao ?? "—"}</Field>
          <Field label="Fonte de dados">{ind.fonte_dados ?? "—"}</Field>
          <Field label="Sub-processo do portfólio">{ind.sub_processo ?? "—"}</Field>
          {ind.fonte === "portfolio" && (
            <>
              <Field label="Métrica">{ind.fonte_metrica ? METRICA_LABEL[ind.fonte_metrica] : "—"}</Field>
              <Field label="Corte portfólio">{ind.fonte_corte ?? "—"}</Field>
              <Field label="Snapshot portfólio (hoje)">
                {ind.fonte_portfolio_pct != null
                  ? `${ind.fonte_portfolio_pct}% (${ind.fonte_portfolio_num ?? 0}/${ind.fonte_portfolio_den ?? 0})`
                  : "—"}
              </Field>
            </>
          )}
          {ind.formula_calculo && (
            <Field label="Fórmula de cálculo" className="sm:col-span-2 lg:col-span-3">
              <span className="font-normal text-muted-foreground">{ind.formula_calculo}</span>
            </Field>
          )}
          {ind.descricao && (
            <Field label="Descrição" className="sm:col-span-2 lg:col-span-3">
              <span className="whitespace-pre-line font-normal text-muted-foreground">{ind.descricao}</span>
            </Field>
          )}
          {ind.objetivo_estrategico && (
            <Field label="Objetivo estratégico" className="sm:col-span-2 lg:col-span-3">
              <span className="whitespace-pre-line font-normal text-muted-foreground">{ind.objetivo_estrategico}</span>
            </Field>
          )}
        </dl>
      </SectionCard>

      <SectionCard
        title="Acompanhamentos"
        subtitle={`Meta e realizado por competência em ${ano}. Edite direto na tabela; Enter ou sair do campo salva.`}
        icon={ClipboardList}
        flush
        right={
          <div className="flex flex-wrap items-end gap-2">
            <FilterSelect
              label="Ano de referência" value={String(ano)} onChange={(v) => setAno(Number(v))}
              options={ANOS.map((y) => ({ value: String(y), label: String(y) }))}
            />
            <Button variant="outline" className="h-10 gap-1.5" onClick={() => void gerarAno()} disabled={gerando}>
              {gerando ? <Loader2 size={16} className="animate-spin" /> : <CalendarPlus size={16} />}
              Gerar períodos de {ano}
            </Button>
            {ind.fonte === "portfolio" && (
              <Button
                variant="outline"
                className="h-10 gap-1.5"
                onClick={() => void atualizarPortfolio()}
                disabled={atualizandoPortfolio}
              >
                <RefreshCw size={16} className={atualizandoPortfolio ? "animate-spin" : ""} />
                Atualizar portfólio
              </Button>
            )}
          </div>
        }
      >
        <div className={TABLE.wrap}>
          <table className={TABLE.table}>
            <thead className={TABLE.thead}>
              <tr>
                <th className={TABLE.thFirst}>Competência</th>
                <th className={`${TABLE.th} whitespace-nowrap text-right`}>Meta ({unit})</th>
                <th className={`${TABLE.th} whitespace-nowrap text-right`}>Realizado ({unit})</th>
                <th className={`${TABLE.th} text-right`}>Atingimento</th>
                <th className={TABLE.th}>Status</th>
                <th className={TABLE.th}>Origem</th>
                <th className={TABLE.th}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {acomps.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
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
      </SectionCard>

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
