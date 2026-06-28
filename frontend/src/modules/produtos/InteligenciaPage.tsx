import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Activity, AlertTriangle, Clock, FileWarning, Gauge, HeartPulse, Building2, CalendarClock,
} from "lucide-react"

import {
  produtosApi,
  type ContratosInteligencia, type PortfolioInteligencia, type SaudeClasse,
} from "@/api/produtos"
import { KpiCard } from "@/components/KpiCard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CRITICIDADE_LABEL, DOCNT_STATUS_LABEL, SAUDE_COLOR, SAUDE_LABEL,
} from "@/modules/produtos/constants"

const CRIT_ORDER = ["critica", "alta", "media", "baixa"] as const
const CLASSE_ORDER: SaudeClasse[] = ["critico", "atencao", "saudavel"]
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—")

export default function InteligenciaPage() {
  const navigate = useNavigate()
  const [portfolio, setPortfolio] = useState<PortfolioInteligencia | null>(null)
  const [contratos, setContratos] = useState<ContratosInteligencia | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      produtosApi.getPortfolioIntelligence().catch(() => null),
      produtosApi.getContratosIntelligence().catch(() => null),
    ])
      .then(([p, c]) => { setPortfolio(p); setContratos(c) })
      .finally(() => setLoading(false))
  }, [])

  // matriz[criticidade][classe] = count
  const matriz = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    portfolio?.matriz_risco.forEach((c) => {
      (m[c.criticidade] ??= {})[c.classe] = c.count
    })
    return m
  }, [portfolio])

  const goList = (params: string) => navigate(`/app/modules/produtos/produtos${params}`)

  if (loading) return <Skeleton className="h-64 w-full" />
  if (!portfolio) return <p className="text-sm text-muted-foreground">Não foi possível carregar a inteligência do portfólio.</p>

  const d = portfolio.distribuicao

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><Gauge size={20} /> Inteligência de Portfólio</h2>
        <p className="text-sm text-muted-foreground">Saúde, risco e ações recomendadas para a gestão dos produtos.</p>
      </div>

      {/* ── Saúde do portfólio ── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Saúde do portfólio</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Score médio" value={`${portfolio.media_score}/100`} icon={HeartPulse} />
          <KpiCard label="Saudáveis" value={d.saudavel} icon={Activity}
            deltaTone={d.saudavel > 0 ? "up" : "neutral"} />
          <KpiCard label="Em atenção" value={d.atencao} icon={AlertTriangle}
            deltaTone={d.atencao > 0 ? "down" : "neutral"} />
          <KpiCard label="Críticos" value={d.critico} icon={AlertTriangle}
            deltaTone={d.critico > 0 ? "down" : "neutral"} />
        </div>

        {/* Matriz de risco: criticidade × saúde */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Matriz de risco — Criticidade × Saúde</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-center text-sm">
                <thead>
                  <tr className="text-[11px] uppercase text-muted-foreground">
                    <th className="px-2 py-1 text-left">Criticidade ↓ / Saúde →</th>
                    {CLASSE_ORDER.map((cl) => (
                      <th key={cl} className="px-2 py-1" style={{ color: SAUDE_COLOR[cl] }}>{SAUDE_LABEL[cl]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CRIT_ORDER.map((crit) => (
                    <tr key={crit} className="border-t">
                      <td className="px-2 py-1.5 text-left font-medium">{CRITICIDADE_LABEL[crit]}</td>
                      {CLASSE_ORDER.map((cl) => {
                        const n = matriz[crit]?.[cl] ?? 0
                        const danger = (crit === "critica" || crit === "alta") && cl === "critico"
                        return (
                          <td key={cl} className="px-2 py-1.5">
                            {n > 0 ? (
                              <span
                                className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 font-semibold ${danger ? "ring-2 ring-red-300" : ""}`}
                                style={{ backgroundColor: `${SAUDE_COLOR[cl]}22`, color: SAUDE_COLOR[cl] }}>
                                {n}
                              </span>
                            ) : <span className="text-muted-foreground">·</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Ações recomendadas ── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Pendências do portfólio</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {portfolio.pendencias.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pendência. 🎉</p>}
            {portfolio.pendencias.map((p) => (
              <div key={p.code} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <span className="flex items-center gap-2">
                  <AlertTriangle size={14} className={p.nivel === "alto" ? "text-red-600" : "text-amber-600"} />
                  {p.label}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{p.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top produtos em risco</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {portfolio.top_risco.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto em risco.</p>}
            {portfolio.top_risco.map((t) => (
              <button key={t.id} type="button" onClick={() => navigate(`/app/modules/produtos/produtos/${t.id}`)}
                className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left text-sm transition hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {CRITICIDADE_LABEL[t.criticidade]} · {t.principais_gaps.join(" · ") || "—"}
                  </span>
                </span>
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums"
                  style={{ backgroundColor: `${SAUDE_COLOR[t.classe]}1a`, color: SAUDE_COLOR[t.classe], borderColor: `${SAUDE_COLOR[t.classe]}55` }}>
                  {t.score}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* ── Contratos & Fornecedores ── */}
      {contratos && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Contratos & Fornecedores</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Valor contratado" value={fmtBRL(contratos.valor_total)} icon={Building2}
              sub={contratos.valor_ambiguo ? "soma indicativa (mistura periodicidades)" : undefined} />
            <KpiCard label="Vencidos" value={contratos.buckets_vencimento.vencidos ?? 0} icon={CalendarClock}
              deltaTone={(contratos.buckets_vencimento.vencidos ?? 0) > 0 ? "down" : "neutral"} />
            <KpiCard label="Vencem ≤30d" value={contratos.buckets_vencimento.ate_30 ?? 0} icon={CalendarClock}
              deltaTone={(contratos.buckets_vencimento.ate_30 ?? 0) > 0 ? "down" : "neutral"} />
            <KpiCard label="Sem renovação (≤90d)" value={contratos.sem_renovacao_avencer.length} icon={AlertTriangle}
              deltaTone={contratos.sem_renovacao_avencer.length > 0 ? "down" : "neutral"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Por fornecedor</CardTitle></CardHeader>
              <CardContent>
                {contratos.por_fornecedor.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum contrato ativo.</p> : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-[11px] uppercase text-muted-foreground">
                      <tr><th className="py-1">Fornecedor</th><th className="py-1 text-center">Prod.</th><th className="py-1 text-center">Contr.</th><th className="py-1 text-right">Valor</th><th className="py-1 text-right">Próx. venc.</th></tr>
                    </thead>
                    <tbody>
                      {contratos.por_fornecedor.map((f) => (
                        <tr key={f.fornecedor_id ?? f.fornecedor_nome} className="border-t">
                          <td className="py-1.5 font-medium">{f.fornecedor_nome}</td>
                          <td className="py-1.5 text-center tabular-nums">{f.produtos_count}</td>
                          <td className="py-1.5 text-center tabular-nums">{f.contratos_count}</td>
                          <td className="py-1.5 text-right tabular-nums">{fmtBRL(f.valor_total)}</td>
                          <td className="py-1.5 text-right tabular-nums">{fmtDate(f.proximo_vencimento)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">A vencer sem renovação automática</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {contratos.sem_renovacao_avencer.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contrato nessa condição.</p>}
                {contratos.sem_renovacao_avencer.map((c) => (
                  <button key={c.contrato_id} type="button" onClick={() => navigate(`/app/modules/produtos/produtos/${c.product_id}`)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left text-sm transition hover:bg-muted/50">
                    <span className="min-w-0 truncate"><strong>{c.product_name}</strong>{c.fornecedor_nome ? ` — ${c.fornecedor_nome}` : ""}</span>
                    <span className={`shrink-0 text-xs ${c.dias_para_vencer <= 30 ? "text-destructive" : "text-amber-600"}`}>{c.dias_para_vencer}d</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* ── Produtos parados & dívida de documentação ── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Clock size={16} /> Produtos parados</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {portfolio.produtos_parados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto em produção parado há &gt;12 meses.</p>}
            {portfolio.produtos_parados.map((p) => (
              <button key={p.id} type="button" onClick={() => navigate(`/app/modules/produtos/produtos/${p.id}`)}
                className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left text-sm transition hover:bg-muted/50">
                <span className="min-w-0 truncate font-medium">{p.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">últ. release {fmtDate(p.ultima_release_date)}{p.meses != null ? ` · ${p.meses}m` : ""}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><FileWarning size={16} /> Dívida de documentação</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {portfolio.doc_debt.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma documentação obsoleta ou desatualizada.</p>}
            {portfolio.doc_debt.map((p) => (
              <button key={p.id} type="button" onClick={() => navigate(`/app/modules/produtos/produtos/${p.id}`)}
                className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left text-sm transition hover:bg-muted/50">
                <span className="min-w-0 truncate font-medium">{p.name}</span>
                <span className="shrink-0 text-xs text-amber-600">{p.doc_status ? (DOCNT_STATUS_LABEL[p.doc_status as keyof typeof DOCNT_STATUS_LABEL] ?? p.doc_status) : "—"}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </section>

      <p className="text-[11px] text-muted-foreground">
        Dica: filtre a <button type="button" className="text-primary hover:underline" onClick={() => goList("")}>listagem de produtos</button> por Saúde (Crítico/Atenção) para agir sobre as pendências.
      </p>
    </div>
  )
}
