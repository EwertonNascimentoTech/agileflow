import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Minus, Plus, Sparkles, Trash2, TrendingDown, TrendingUp } from "lucide-react"
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

import {
  rtdApi,
  type IndicadorDetalhe,
  type IndicadorPeriodoRef,
  type IndicadorPeriodoStatus,
  type PersonMini,
} from "@/api/rtd"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"

const NONE = "__none__" // sentinela: Radix proíbe value=""

const STATUS_FAROL: Record<IndicadorPeriodoStatus, { label: string; dot: string; text: string }> = {
  atingido: { label: "Atingido", dot: "bg-emerald-500", text: "text-emerald-600" },
  em_atencao: { label: "Em atenção", dot: "bg-amber-500", text: "text-amber-600" },
  nao_atingido: { label: "Não atingido", dot: "bg-red-500", text: "text-destructive" },
  pendente: { label: "Pendente", dot: "bg-slate-400", text: "text-muted-foreground" },
}

const SENTIDO_LABEL: Record<string, string> = {
  maior_melhor: "▲ quanto maior, melhor",
  menor_melhor: "▼ quanto menor, melhor",
  faixa_ideal: "↔ faixa ideal",
}

function fmtNum(v: number | null | undefined, unit: string): string {
  if (v == null) return "—"
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1)
  return unit ? `${s}${unit === "%" ? "%" : ` ${unit}`}` : s
}

// ── Gráfico no formato do módulo de Indicadores (meta × realizado por período),
//    com ÊNFASE no período de referência da reunião (demais esmaecidos).
//    Paleta no padrão EPA/FIEA: realizado azul-marinho, meta azul-claro. ──
const META_COLOR = "#35b3e7"       // azul claro (META, padrão EPA)
const REALIZADO_COLOR = "#0d3c78"  // azul-marinho (QUANTIDADE, padrão EPA)
const DIM_OPACITY = 0.3

// O farol continua nos chips/labels; as barras seguem a paleta da apresentação.
const STATUS_BAR_COLOR: Record<IndicadorPeriodoStatus, string> = {
  atingido: REALIZADO_COLOR,
  em_atencao: REALIZADO_COLOR,
  nao_atingido: REALIZADO_COLOR,
  pendente: "#94a3b8",
}

const MESES_CURTOS = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

function periodoLabel(competencia: string): string {
  const m = competencia.match(/^(\d{2})\/(\d{4})$/)
  return m ? MESES_CURTOS[Number(m[1])] ?? competencia : competencia
}

type ChartRow = {
  label: string
  competencia: string
  ordem: number
  meta: number | null
  realizado: number | null
  status: IndicadorPeriodoStatus
  isRef: boolean
  entregas: string[] | null
}

/** Tooltip do gráfico: números do período + evidências (o que foi entregue no mês). */
function ChartTip({ active, payload, unit }: {
  active?: boolean
  payload?: Array<{ payload?: ChartRow }>
  unit: string
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="z-50 max-w-[320px] rounded-lg border bg-background px-3 py-2.5 text-xs shadow-md">
      <p className="mb-1.5 font-semibold">
        Período: {row.competencia}{row.isRef ? " (referência da reunião)" : ""}
      </p>
      <div className="space-y-0.5 text-muted-foreground">
        <p>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: META_COLOR }} />
          Meta: <b className="text-foreground">{fmtNum(row.meta, unit)}</b>
        </p>
        <p>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: STATUS_BAR_COLOR[row.status] }} />
          Realizado: <b className="text-foreground">{fmtNum(row.realizado, unit)}</b>
        </p>
      </div>
      {row.entregas && row.entregas.length > 0 && (
        <div className="mt-2 border-t pt-1.5">
          <p className="mb-1 font-semibold text-foreground">Entregas do período</p>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">
            {row.entregas.map((e, i) => (
              <li key={i} className={e.startsWith("… e mais") ? "italic text-muted-foreground" : "text-muted-foreground"}>
                {e.startsWith("… e mais") ? e : `• ${e}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {row.entregas !== null && row.entregas !== undefined && row.entregas.length === 0 && (
        <p className="mt-2 border-t pt-1.5 italic text-muted-foreground">Sem entregas no período.</p>
      )}
    </div>
  )
}

function RefTick(props: { x?: number; y?: number; payload?: { value?: string; index?: number }; rows: ChartRow[] }) {
  const { x = 0, y = 0, payload, rows } = props
  const idx = payload?.index ?? -1
  const isRef = rows[idx]?.isRef ?? false
  return (
    <text x={x} y={y + 10} textAnchor="middle" fontSize={isRef ? 12 : 10}
      fontWeight={isRef ? 800 : 400} fill={isRef ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}>
      {payload?.value}
    </text>
  )
}

function RefBarLabel(props: { x?: number; y?: number; width?: number; index?: number; rows: ChartRow[] }) {
  const { x = 0, y = 0, width = 0, index = -1, rows } = props
  const row = rows[index]
  if (!row?.isRef || row.realizado == null) return null
  return (
    <text x={x + width / 2} y={y - 5} textAnchor="middle" fontSize={11} fontWeight={800}
      fill={STATUS_BAR_COLOR[row.status]}>
      {Number.isInteger(row.realizado) ? row.realizado : row.realizado.toFixed(1)}
    </text>
  )
}

function IndicadorChart({ det, unit }: { det: IndicadorDetalhe; unit: string }) {
  const rows: ChartRow[] = det.serie.map((p: IndicadorPeriodoRef) => ({
    label: periodoLabel(p.competencia),
    competencia: p.competencia,
    ordem: p.ordem,
    meta: p.meta,
    realizado: p.realizado,
    status: p.status,
    isRef: det.periodo != null && p.ordem === det.periodo.ordem,
    entregas: p.entregas ?? null,
  }))
  if (rows.length === 0) return null
  return (
    <div className="h-48 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 18, right: 4, left: -12, bottom: 0 }} barGap={2} barCategoryGap="18%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0}
            tick={<RefTick rows={rows} />} height={22} />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
          <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} content={<ChartTip unit={unit} />} />
          <Legend formatter={(v) => (v === "meta" ? "Meta" : "Realizado")} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="meta" name="meta" radius={[3, 3, 0, 0]} maxBarSize={20}>
            {rows.map((r) => (
              <Cell key={`m-${r.ordem}`} fill={META_COLOR} fillOpacity={r.isRef ? 1 : DIM_OPACITY} />
            ))}
          </Bar>
          <Bar dataKey="realizado" name="realizado" radius={[3, 3, 0, 0]} maxBarSize={20}>
            {rows.map((r) => (
              <Cell key={`r-${r.ordem}`} fill={STATUS_BAR_COLOR[r.status]} fillOpacity={r.isRef ? 1 : DIM_OPACITY} />
            ))}
            <LabelList content={<RefBarLabel rows={rows} />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Tendencia({ det }: { det: IndicadorDetalhe }) {
  const t = det.tendencia
  if (!t?.direcao) return <span className="text-xs text-muted-foreground">tendência —</span>
  const cfg = {
    melhorando: { Icon: TrendingUp, cls: "text-emerald-600", label: "melhorando" },
    piorando: { Icon: TrendingDown, cls: "text-destructive", label: "piorando" },
    estavel: { Icon: Minus, cls: "text-muted-foreground", label: "estável" },
  }[t.direcao]
  const sufixo = t.base === "percentual" ? " p.p." : ""
  const varLabel = t.variacao != null ? ` (${t.variacao > 0 ? "+" : ""}${t.variacao}${sufixo})` : ""
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.cls}`}
      title={`Tendência vs período anterior preenchido${t.base === "percentual" ? " (base: % de atingimento)" : " (base: realizado)"}`}
    >
      <cfg.Icon className="h-3.5 w-3.5" /> {cfg.label}{varLabel}
    </span>
  )
}

interface AcaoRow {
  causa: string
  acao: string
  responsavel: string
  prazo: string
  resultado: string
}

interface CardState {
  fatores: string
  riscos: string
  acoes: AcaoRow[]
}

function IndicadorCard({
  det, reuniaoId, readOnly, persons, onSaved,
}: {
  det: IndicadorDetalhe
  reuniaoId: string
  readOnly: boolean
  persons: PersonMini[]
  onSaved: () => void
}) {
  const a = det.analise
  // Seed do plano de ação: lista salva; senão migra os campos legados p/ 1ª ação.
  const seedAcoes = (): AcaoRow[] => {
    if (a?.acoes?.length) {
      return a.acoes.map((x) => ({
        causa: x.causa ?? "", acao: x.acao ?? "",
        responsavel: x.responsavel_person_id ?? NONE,
        prazo: x.prazo ?? "", resultado: x.resultado_esperado ?? "",
      }))
    }
    if (a?.causa_analise || a?.plano_reversao || a?.responsavel_person_id || a?.prazo || a?.resultado_esperado) {
      return [{
        causa: a?.causa_analise ?? "", acao: a?.plano_reversao ?? "",
        responsavel: a?.responsavel_person_id ?? NONE,
        prazo: a?.prazo ?? "", resultado: a?.resultado_esperado ?? "",
      }]
    }
    return []
  }
  const [st, setSt] = useState<CardState>({
    fatores: a?.fatores_impacto ?? "",
    riscos: a?.riscos ?? "",
    acoes: seedAcoes(),
  })
  const temReversao = Boolean(a?.acoes?.length || a?.causa_analise || a?.plano_reversao || a?.responsavel_person_id || a?.prazo || a?.resultado_esperado)
  const status = det.periodo?.status ?? "pendente"
  // Abaixo da meta: reversão obrigatória (aberta); em atenção: opcional (colapsada, salvo se já preenchida).
  const [reversaoAberta, setReversaoAberta] = useState(status === "nao_atingido" || temReversao)
  const [saving, setSaving] = useState(false)
  const [gerando, setGerando] = useState(false)
  // Sugestão da IA carregada no formulário mas ainda NÃO salva (revisão humana pendente).
  const [sugestaoPendente, setSugestaoPendente] = useState(false)
  // Card minimizado por padrão — só o cabeçalho; clique expande/minimiza.
  const [expandido, setExpandido] = useState(false)

  const farol = STATUS_FAROL[status]
  const unit = det.unidade_medida?.trim() ?? ""
  const metaLabel = det.sentido === "faixa_ideal"
    ? `${fmtNum(det.meta_min, unit)}–${fmtNum(det.meta_max, unit)}`
    : fmtNum(det.periodo?.meta, unit)

  async function salvar() {
    setSaving(true)
    try {
      // PUT substitui o registro inteiro — envia SEMPRE o estado completo.
      // Os campos legados vão nulos: o plano de ação em LISTA é a fonte da verdade.
      await rtdApi.upsertIndicadorAnalise(reuniaoId, det.indicador_id, {
        fatores_impacto: st.fatores.trim() || null,
        riscos: st.riscos.trim() || null,
        causa_analise: null,
        plano_reversao: null,
        responsavel_person_id: null,
        prazo: null,
        resultado_esperado: null,
        acoes: st.acoes
          .filter((x) => x.causa.trim() || x.acao.trim())
          .map((x) => ({
            causa: x.causa.trim() || null,
            acao: x.acao.trim() || null,
            responsavel_person_id: x.responsavel === NONE ? null : x.responsavel,
            prazo: x.prazo || null,
            resultado_esperado: x.resultado.trim() || null,
          })),
      })
      toast.success("Análise salva")
      setSugestaoPendente(false)
      onSaved()
    } catch (e) {
      const status_ = (e as { response?: { status?: number } })?.response?.status
      toast.error(status_ === 423 ? "Reunião fechada — reabra para editar." : "Falha ao salvar a análise")
    } finally {
      setSaving(false)
    }
  }

  const set = (k: "fatores" | "riscos") => (v: string) => setSt((s) => ({ ...s, [k]: v }))
  const setAcao = (i: number, k: keyof AcaoRow, v: string) =>
    setSt((s) => ({ ...s, acoes: s.acoes.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }))
  const addAcao = () =>
    setSt((s) => ({ ...s, acoes: [...s.acoes, { causa: "", acao: "", responsavel: NONE, prazo: "", resultado: "" }] }))
  const rmAcao = (i: number) =>
    setSt((s) => ({ ...s, acoes: s.acoes.filter((_, j) => j !== i) }))

  async function gerarIa() {
    const temConteudo = [st.fatores, st.riscos].some((v) => v.trim()) || st.acoes.length > 0
    if (temConteudo && !confirm("Substituir o conteúdo atual dos campos pela sugestão da IA?")) return
    setGerando(true)
    try {
      const s = await rtdApi.sugerirAnalise(reuniaoId, det.indicador_id)
      const novasAcoes: AcaoRow[] = s.acoes.length
        ? s.acoes.map((x) => ({
            causa: x.causa ?? "", acao: x.acao ?? "",
            responsavel: NONE, prazo: "", resultado: x.resultado_esperado ?? "",
          }))
        : (s.causa_analise || s.plano_reversao)
          ? [{
              causa: s.causa_analise ?? "", acao: s.plano_reversao ?? "",
              responsavel: NONE, prazo: "", resultado: s.resultado_esperado ?? "",
            }]
          : []
      setSt((prev) => ({
        fatores: s.fatores_impacto ?? prev.fatores,
        riscos: s.riscos ?? prev.riscos,
        acoes: novasAcoes.length ? novasAcoes : prev.acoes,
      }))
      if (novasAcoes.length) setReversaoAberta(true)
      setSugestaoPendente(true)
      const anon = Object.values(s.anonimizacao ?? {}).reduce((a, b) => a + b, 0)
      toast.success(
        `Sugestão gerada — revise e clique em Salvar.${anon ? ` (${anon} dado(s) anonimizados no envio)` : ""}`,
      )
    } catch (e) {
      const resp = (e as { response?: { status?: number; data?: { detail?: string } } })?.response
      toast.error(resp?.data?.detail || "Falha ao gerar a sugestão com IA")
    } finally {
      setGerando(false)
    }
  }

  const FAROL_PILL: Record<IndicadorPeriodoStatus, string> = {
    atingido: "bg-emerald-100 text-emerald-800",
    em_atencao: "bg-amber-100 text-amber-800",
    nao_atingido: "bg-red-100 text-red-800",
    pendente: "bg-slate-100 text-slate-600",
  }
  const delta =
    det.periodo?.realizado != null && det.periodo?.meta != null
      ? det.periodo.realizado - det.periodo.meta
      : null

  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      {/* Header: nome + farol em destaque — clique expande/minimiza */}
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className={`flex w-full flex-wrap items-center justify-between gap-2 bg-slate-50/70 px-4 py-3 text-left transition-colors hover:bg-slate-100 ${expandido ? "border-b" : ""}`}
        title={expandido ? "Minimizar" : "Expandir"}
      >
        <div className="flex min-w-0 items-center gap-2">
          {expandido
            ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight text-blue-950">{det.nome}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={det.formula_calculo ?? undefined}>
              {det.sentido ? SENTIDO_LABEL[det.sentido] : ""}
              {det.area_name ? ` · ${det.area_name}` : ""}
              {det.formula_calculo ? ` · ${det.formula_calculo}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {det.periodo && (
            <span className="text-sm tabular-nums text-muted-foreground">
              <b className="text-blue-950">{fmtNum(det.periodo.realizado, unit)}</b>
              {" "}· meta {metaLabel}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${FAROL_PILL[status]}`}>
            <span className={`inline-block h-2 w-2 rounded-full ${farol.dot}`} />
            {farol.label}
          </span>
        </div>
      </button>

      {expandido && (
      <div className="space-y-3 p-4">
        {det.periodo === null ? (
          <p className="text-xs text-muted-foreground">Sem acompanhamentos gerados para o ano da reunião.</p>
        ) : (
          <>
            {/* KPI tiles: realizado · meta · atingimento · tendência */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-lg border bg-slate-50/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Resultado realizado
                </p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-blue-950">
                  {fmtNum(det.periodo.realizado, unit)}
                </p>
                <p className="text-[11px] text-muted-foreground">{det.periodo.competencia}</p>
              </div>
              <div className="rounded-lg border bg-slate-50/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Meta</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-sky-600">{metaLabel}</p>
                <p className="text-[11px] text-muted-foreground">
                  {delta != null ? `Δ ${delta > 0 ? "+" : ""}${fmtNum(delta, unit)}` : "—"}
                </p>
              </div>
              <div className="rounded-lg border bg-slate-50/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Atingimento</p>
                <p className={`mt-1 text-2xl font-extrabold tabular-nums ${farol.text}`}>
                  {det.periodo.percentual_atingimento != null
                    ? `${det.periodo.percentual_atingimento.toFixed(0)}%` : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">{farol.label}</p>
              </div>
              <div className="rounded-lg border bg-slate-50/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Tendência de evolução
                </p>
                <div className="mt-1.5"><Tendencia det={det} /></div>
                <p className="text-[11px] text-muted-foreground">vs período anterior</p>
              </div>
            </div>

            {/* Faixas de futuro: tendência (ritmo) e projeção (melhor cenário) */}
            {det.tendencia_futura && (
              <div
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                  det.tendencia_futura.atinge_meta === false
                    ? "border-red-200 bg-red-50 text-red-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`}
                title="Cenário 'mantido o ritmo': extrapolação do Δ médio dos últimos períodos realizados."
              >
                {det.tendencia_futura.direcao === "piorando"
                  ? <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  : det.tendencia_futura.direcao === "estavel"
                    ? <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    : <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>
                  <b>Tendência {det.tendencia_futura.competencia}:</b> {det.tendencia_futura.texto}
                </span>
              </div>
            )}
            {det.projecao && (
              <div
                className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"
                title="Melhor cenário do próximo período: se tudo que está planejado for entregue no prazo."
              >
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><b>Projeção {det.projecao.competencia}:</b> {det.projecao.texto}</span>
              </div>
            )}
          </>
        )}

      {/* Gráfico meta × realizado (formato do módulo de Indicadores), mês de referência em destaque */}
      {det.serie.length > 0 && (
        <div className="mt-2">
          <IndicadorChart det={det} unit={unit} />
        </div>
      )}

      {/* Análise da reunião */}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Principais fatores que impactaram o resultado</Label>
          <Textarea rows={2} value={st.fatores} disabled={readOnly}
            onChange={(e) => set("fatores")(e.target.value)} placeholder="O que explicou o número deste período" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Riscos associados</Label>
          <Textarea rows={2} value={st.riscos} disabled={readOnly}
            onChange={(e) => set("riscos")(e.target.value)} placeholder="Riscos para os próximos períodos" />
        </div>
      </div>

      {/* Bloco de reversão — indicadores abaixo da meta */}
      {(status === "nao_atingido" || status === "em_atencao") && (
        <div className="mt-3 rounded-md border border-dashed border-destructive/40 p-2.5">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 text-left text-xs font-semibold"
            onClick={() => setReversaoAberta((v) => !v)}
          >
            {reversaoAberta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Plano de ação para reverter
            {st.acoes.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {st.acoes.length} ação(ões)
              </span>
            )}
            {status === "em_atencao" && <span className="font-normal text-muted-foreground">(opcional — em atenção)</span>}
          </button>
          {reversaoAberta && (
            <div className="mt-2 space-y-2">
              {st.acoes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma ação registrada — adicione a primeira (pode haver várias causas/ações,
                  inclusive realocação de pessoas entre times).
                </p>
              )}
              {st.acoes.map((acao, i) => (
                <div key={i} className="space-y-2 rounded-md border bg-background p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Ação {i + 1}
                    </span>
                    {!readOnly && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="Remover ação"
                        onClick={() => rmAcao(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Causa</Label>
                      <Textarea rows={2} value={acao.causa} disabled={readOnly}
                        onChange={(e) => setAcao(i, "causa", e.target.value)}
                        placeholder="Por que a meta não foi atingida (esta causa)" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ação</Label>
                      <Textarea rows={2} value={acao.acao} disabled={readOnly}
                        onChange={(e) => setAcao(i, "acao", e.target.value)}
                        placeholder="Ex.: realocar 1 dev com folga do time A para o projeto B" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Resultado esperado</Label>
                    <Input className="h-9" value={acao.resultado} disabled={readOnly}
                      onChange={(e) => setAcao(i, "resultado", e.target.value)}
                      placeholder="Ex.: voltar a ≥ 90% até set/26" />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Responsável</Label>
                      <Select value={acao.responsavel} disabled={readOnly}
                        onValueChange={(v) => setAcao(i, "responsavel", v)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>—</SelectItem>
                          {persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Prazo</Label>
                      <Input type="date" className="h-9" value={acao.prazo} disabled={readOnly}
                        onChange={(e) => setAcao(i, "prazo", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
              {!readOnly && (
                <Button variant="outline" size="sm" onClick={addAcao}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar ação
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            {sugestaoPendente && (
              <Badge variant="warning" title="O texto abaixo foi gerado por IA e ainda não foi salvo.">
                <Sparkles className="mr-1 h-3 w-3" /> Sugestão de IA — revise e salve
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={gerarIa} disabled={gerando || saving}
              title="Gera a análise com o agente de IA usando o indicador + contexto do portfólio. Nada é salvo automaticamente.">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {gerando ? "Gerando… (pode levar ~1 min)" : "Gerar com IA"}
            </Button>
            <Button size="sm" onClick={salvar} disabled={saving || gerando}
              className="bg-blue-800 hover:bg-blue-900">
              {saving ? "Salvando…" : "Salvar análise"}
            </Button>
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  )
}

export function RtdIndicadoresSection({
  detalhes, reuniaoId, readOnly, snapshotAt, persons, onSaved, categoria,
}: {
  detalhes: IndicadorDetalhe[] | null
  reuniaoId: string
  readOnly: boolean
  snapshotAt: string | null
  persons: PersonMini[]
  onSaved: () => void
  /** Filtra a seção: slide de Estratégicos ou de Táticos (sem filtro = ambos). */
  categoria?: "estrategico" | "tatico"
}) {
  const grupos = useMemo(() => {
    const det = detalhes ?? []
    const estrategicos = det.filter((d) => d.categoria === "estrategico")
    const porSp = new Map<string, IndicadorDetalhe[]>()
    for (const d of det.filter((x) => x.categoria === "tatico")) {
      const k = d.sub_processo?.trim() || "Sem sub-processo vinculado"
      porSp.set(k, [...(porSp.get(k) ?? []), d])
    }
    // Ordem canônica dos sub-processos do portfólio
    // (fluxo: prospectar → desenvolver → implantar → sustentar/bugs).
    const ORDEM_SP = [
      "Prospectar Solução de TI",
      "Desenvolver Soluções de TI",
      "Implantar Soluções de TI de Mercado",
      "Tratamento de Bugs de Sistemas",
      "Administrar Melhorias de Sistemas",
    ]
    const taticos = new Map<string, IndicadorDetalhe[]>()
    for (const sp of ORDEM_SP) {
      if (porSp.has(sp)) taticos.set(sp, porSp.get(sp)!)
    }
    for (const [sp, list] of porSp) {
      if (!taticos.has(sp)) taticos.set(sp, list)
    }
    return { estrategicos, taticos }
  }, [detalhes])

  if (!detalhes || detalhes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Módulo de Indicadores sem dados para o ano da reunião — cadastre indicadores e gere os acompanhamentos.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {snapshotAt && (
        <Badge variant="secondary" title="Reunião fechada: os números abaixo são a foto congelada no fechamento.">
          📸 Foto congelada em {new Date(snapshotAt).toLocaleString("pt-BR")}
        </Badge>
      )}

      {categoria !== "tatico" && grupos.estrategicos.length > 0 && (
        <div className="space-y-3">
          {grupos.estrategicos.map((d) => (
            <IndicadorCard key={d.indicador_id} det={d} reuniaoId={reuniaoId}
              readOnly={readOnly} persons={persons} onSaved={onSaved} />
          ))}
        </div>
      )}

      {categoria !== "estrategico" && grupos.taticos.size > 0 && (
        <div className="space-y-3">
          {[...grupos.taticos.entries()].map(([sp, list]) => (
            <div key={sp} className="space-y-2">
              <h5 className="border-l-4 border-primary pl-2 text-xs font-semibold uppercase tracking-wide text-primary">
                Sub. Processo: {sp}
              </h5>
              <div className="space-y-3">
                {list.map((d) => (
                  <IndicadorCard key={d.indicador_id} det={d} reuniaoId={reuniaoId}
                    readOnly={readOnly} persons={persons} onSaved={onSaved} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
