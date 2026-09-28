import { useEffect, useMemo, useState, type ElementType, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import {
  Activity, AlertTriangle, Building2, CalendarClock, ChevronRight, Clock, FileWarning, Gauge, Grid3x3,
  HeartPulse, Info, ListChecks, OctagonAlert, ShieldAlert,
} from "lucide-react"

import {
  produtosApi,
  type ContratosInteligencia, type PortfolioInteligencia, type SaudeClasse,
} from "@/api/produtos"
import { Skeleton } from "@/components/ui/skeleton"
import { KpiCount, KpiRow, Notice, PageHeader, Pill, SectionCard, TABLE, type Tone } from "@/components/ds"
import {
  CRITICIDADE_COLOR, CRITICIDADE_LABEL, DOCNT_STATUS_LABEL, SAUDE_COLOR, SAUDE_LABEL,
} from "@/modules/produtos/constants"

const CRIT_ORDER = ["critica", "alta", "media", "baixa"] as const
const CLASSE_ORDER: SaudeClasse[] = ["critico", "atencao", "saudavel"]
const CLASSE_TONE: Record<SaudeClasse, Tone> = { critico: "red", atencao: "amber", saudavel: "emerald" }
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—")
const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`

/** Título de cada faixa de indicadores (mesmo do painel do Portfólio de Produtos). */
function RowTitle({ children }: { children: string }) {
  return <h2 className="text-sm font-semibold text-muted-foreground">{children}</h2>
}

/** Texto de lista vazia dentro de um SectionCard `flush`. */
function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{children}</p>
}

/** Linha clicável de lista (abre o produto). */
function RowButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
      >
        {children}
        <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  )
}

/** Cartão de valor em texto longo (moeda) no mesmo formato do KpiCount, com observação opcional. */
function KpiValue({ icon: Icon, value, label, note }: { icon: ElementType; value: string; label: string; note?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={19} /></span>
      <div className="min-w-0">
        <p className="break-words text-xl font-bold leading-tight tabular-nums">{value}</p>
        <p className="mt-1 text-sm leading-tight text-muted-foreground">{label}</p>
        {note && <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">{note}</p>}
      </div>
    </div>
  )
}

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
  const goProduct = (id: string) => navigate(`/app/modules/produtos/produtos/${id}`)

  const header = (
    <PageHeader
      icon={Gauge}
      color="#7C3AED"
      title="Inteligência de Portfólio"
      description="Saúde, risco e ações recomendadas para a gestão dos produtos."
    />
  )

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-2/3 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (!portfolio) {
    return (
      <div className="space-y-5">
        {header}
        <Notice tone="red" icon={AlertTriangle}>Não foi possível carregar a inteligência do portfólio.</Notice>
      </div>
    )
  }

  const d = portfolio.distribuicao
  const vencidos = contratos?.buckets_vencimento.vencidos ?? 0
  const ate30 = contratos?.buckets_vencimento.ate_30 ?? 0
  const semRenov = contratos?.sem_renovacao_avencer.length ?? 0

  return (
    <div className="space-y-5">
      {header}

      {/* ── Saúde do portfólio ── */}
      <section className="space-y-2">
        <RowTitle>Saúde do portfólio</RowTitle>
        <KpiRow className="sm:grid-cols-2 xl:grid-cols-4">
          <KpiCount icon={HeartPulse} value={`${portfolio.media_score}/100`} label="Score médio" tone="violet" />
          <KpiCount icon={Activity} value={d.saudavel} label="Saudáveis" tone={d.saudavel > 0 ? "emerald" : "slate"} />
          <KpiCount icon={AlertTriangle} value={d.atencao} label="Em atenção" tone={d.atencao > 0 ? "amber" : "slate"} highlight={d.atencao > 0} />
          <KpiCount icon={OctagonAlert} value={d.critico} label="Críticos" tone={d.critico > 0 ? "red" : "slate"} highlight={d.critico > 0} />
        </KpiRow>
      </section>

      {/* Matriz de risco: criticidade × saúde */}
      <SectionCard
        title="Matriz de risco — Criticidade × Saúde"
        subtitle="Quantos produtos há em cada combinação de criticidade e saúde."
        icon={Grid3x3}
        flush
      >
        <div className={TABLE.wrap}>
          <table className={`${TABLE.table} min-w-[420px]`}>
            <thead className={TABLE.thead}>
              <tr>
                <th className={TABLE.thFirst}>Criticidade</th>
                {CLASSE_ORDER.map((cl) => (
                  <th key={cl} className={`${TABLE.th} text-center`}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SAUDE_COLOR[cl] }} aria-hidden />
                      {SAUDE_LABEL[cl]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CRIT_ORDER.map((crit) => (
                <tr key={crit} className={TABLE.tr}>
                  <td className={`${TABLE.tdFirst} font-medium`}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CRITICIDADE_COLOR[crit] }} aria-hidden />
                      {CRITICIDADE_LABEL[crit]}
                    </span>
                  </td>
                  {CLASSE_ORDER.map((cl) => {
                    const n = matriz[crit]?.[cl] ?? 0
                    const danger = (crit === "critica" || crit === "alta") && cl === "critico"
                    return (
                      <td key={cl} className={`${TABLE.td} text-center`}>
                        {n > 0 ? (
                          <Pill
                            tone={CLASSE_TONE[cl]}
                            dot={danger}
                            className={`min-w-[2.25rem] justify-center text-sm font-semibold tabular-nums ${danger ? "ring-2" : ""}`}
                          >
                            {n}
                          </Pill>
                        ) : <span className="text-muted-foreground" aria-label="nenhum">·</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          Em destaque: produtos de criticidade alta ou crítica com saúde crítica.
        </p>
      </SectionCard>

      {/* ── Ações recomendadas ── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Pendências do portfólio" icon={ListChecks} flush>
          {portfolio.pendencias.length === 0 ? <EmptyRow>Nenhuma pendência. 🎉</EmptyRow> : (
            <ul className="divide-y">
              {portfolio.pendencias.map((p) => (
                <li key={p.code} className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-muted/40">
                  <span className="flex min-w-0 items-center gap-2">
                    <AlertTriangle
                      size={15}
                      className={`shrink-0 ${p.nivel === "alto" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}
                    />
                    {p.label}
                  </span>
                  <Pill tone={p.nivel === "alto" ? "red" : "amber"} className="tabular-nums">{p.count}</Pill>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Top produtos em risco" subtitle="Clique para abrir o produto." icon={ShieldAlert} flush>
          {portfolio.top_risco.length === 0 ? <EmptyRow>Nenhum produto em risco.</EmptyRow> : (
            <ul className="divide-y">
              {portfolio.top_risco.map((t) => (
                <RowButton key={t.id} onClick={() => goProduct(t.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {CRITICIDADE_LABEL[t.criticidade]} · {t.principais_gaps.join(" · ") || "—"}
                    </span>
                  </span>
                  <Pill tone={CLASSE_TONE[t.classe]} dot className="font-semibold tabular-nums">{t.score}</Pill>
                </RowButton>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>

      {/* ── Contratos & Fornecedores ── */}
      {contratos && (
        <section className="space-y-4">
          <div className="space-y-2">
            <RowTitle>Contratos & Fornecedores</RowTitle>
            <KpiRow className="sm:grid-cols-2 xl:grid-cols-4">
              <KpiValue
                icon={Building2}
                value={fmtBRL(contratos.valor_total)}
                label="Valor contratado"
                note={contratos.valor_ambiguo ? "soma indicativa (mistura periodicidades)" : undefined}
              />
              <KpiCount icon={CalendarClock} value={vencidos} label="Vencidos" tone={vencidos > 0 ? "red" : "slate"} highlight={vencidos > 0} />
              <KpiCount icon={CalendarClock} value={ate30} label="Vencem em até 30 dias" tone={ate30 > 0 ? "amber" : "slate"} highlight={ate30 > 0} />
              <KpiCount icon={AlertTriangle} value={semRenov} label="Sem renovação (até 90 dias)" tone={semRenov > 0 ? "amber" : "slate"} highlight={semRenov > 0} />
            </KpiRow>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Por fornecedor" icon={Building2} flush>
              {contratos.por_fornecedor.length === 0 ? <EmptyRow>Nenhum contrato ativo.</EmptyRow> : (
                <div className={TABLE.wrap}>
                  <table className={TABLE.table}>
                    <thead className={TABLE.thead}>
                      <tr>
                        <th className={TABLE.thFirst}>Fornecedor</th>
                        <th className={`${TABLE.th} text-center`}>Produtos</th>
                        <th className={`${TABLE.th} text-center`}>Contratos</th>
                        <th className={`${TABLE.th} text-right`}>Valor</th>
                        <th className={`${TABLE.th} text-right`}>Próximo vencimento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contratos.por_fornecedor.map((f) => (
                        <tr key={f.fornecedor_id ?? f.fornecedor_nome} className={TABLE.tr}>
                          <td className={`${TABLE.tdFirst} font-medium`}>{f.fornecedor_nome}</td>
                          <td className={`${TABLE.td} text-center tabular-nums`}>{f.produtos_count}</td>
                          <td className={`${TABLE.td} text-center tabular-nums`}>{f.contratos_count}</td>
                          <td className={`${TABLE.td} whitespace-nowrap text-right tabular-nums`}>{fmtBRL(f.valor_total)}</td>
                          <td className={`${TABLE.td} text-right tabular-nums`}>{fmtDate(f.proximo_vencimento)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="A vencer sem renovação automática" subtitle="Clique para abrir o produto." icon={CalendarClock} flush>
              {contratos.sem_renovacao_avencer.length === 0 ? <EmptyRow>Nenhum contrato nessa condição.</EmptyRow> : (
                <ul className="divide-y">
                  {contratos.sem_renovacao_avencer.map((c) => (
                    <RowButton key={c.contrato_id} onClick={() => goProduct(c.product_id)}>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{c.product_name}</span>
                        {c.fornecedor_nome ? <span className="text-muted-foreground"> — {c.fornecedor_nome}</span> : ""}
                      </span>
                      <Pill tone={c.dias_para_vencer <= 30 ? "red" : "amber"} dot className="tabular-nums">
                        {dias(c.dias_para_vencer)}
                      </Pill>
                    </RowButton>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </section>
      )}

      {/* ── Produtos parados & dívida de documentação ── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Produtos parados" icon={Clock} flush>
          {portfolio.produtos_parados.length === 0 ? <EmptyRow>Nenhum produto em produção parado há &gt;12 meses.</EmptyRow> : (
            <ul className="divide-y">
              {portfolio.produtos_parados.map((p) => (
                <RowButton key={p.id} onClick={() => goProduct(p.id)}>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">Última release {fmtDate(p.ultima_release_date)}</span>
                    {p.meses != null && <Pill tone="amber" className="tabular-nums">{p.meses} {p.meses === 1 ? "mês" : "meses"}</Pill>}
                  </span>
                </RowButton>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Dívida de documentação" icon={FileWarning} flush>
          {portfolio.doc_debt.length === 0 ? <EmptyRow>Nenhuma documentação obsoleta ou desatualizada.</EmptyRow> : (
            <ul className="divide-y">
              {portfolio.doc_debt.map((p) => (
                <RowButton key={p.id} onClick={() => goProduct(p.id)}>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <Pill tone={p.doc_status === "obsoleta" ? "red" : "amber"} dot>
                    {p.doc_status ? (DOCNT_STATUS_LABEL[p.doc_status as keyof typeof DOCNT_STATUS_LABEL] ?? p.doc_status) : "—"}
                  </Pill>
                </RowButton>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info size={14} className="shrink-0" />
        <span>
          Dica: filtre a <button type="button" className="font-medium text-primary hover:underline" onClick={() => goList("")}>listagem de produtos</button> por
          Saúde (Crítico/Atenção) para agir sobre as pendências.
        </span>
      </p>
    </div>
  )
}
