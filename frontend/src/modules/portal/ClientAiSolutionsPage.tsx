import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowRight, Ban, ChevronRight, CircleDot, Hourglass, List, Plus, Rocket, Sparkles } from "lucide-react"

import { aiSolutionsPortalApi, type AiSolutionSummary } from "@/api/clientes"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DetailTabs, KpiCount, KpiRow, type TabDef } from "@/modules/portal/DetailShell"
import { fmtDateTime, fmtRelative } from "@/modules/portal/occurrenceUi"
import { AiProgress, AiStageBadge } from "@/modules/portal/aiSolutionUi"
import { CLIENT_ACTION_HINT, aiTitle } from "@/modules/portal/aiSolutionRules"
import { Card, IconTile } from "@/modules/portal/portfolioUi"
import { usePortalBase } from "@/modules/portal/portfolioMeta"

type Filtro = "andamento" | "voce" | "producao" | "encerradas" | "todas"
const FILTROS: { key: Filtro; label: string; icon: typeof CircleDot }[] = [
  { key: "andamento", label: "Em andamento", icon: CircleDot },
  { key: "voce", label: "Com você", icon: Hourglass },
  { key: "producao", label: "Em produção", icon: Rocket },
  { key: "encerradas", label: "Não seguiram", icon: Ban },
  { key: "todas", label: "Todas", icon: List },
]
const MATCH: Record<Filtro, (s: AiSolutionSummary) => boolean> = {
  andamento: (s) => !s.is_closed,
  voce: (s) => !!s.client_action,
  producao: (s) => s.stage_key === "producao",
  encerradas: (s) => s.is_closed && s.stage_key !== "producao",
  todas: () => true,
}
const EMPTY_TEXT: Record<Filtro, string> = {
  andamento: "Nenhuma solicitação em andamento.",
  voce: "Nada depende de você agora. Avisamos quando a TI precisar.",
  producao: "Nenhuma solução em produção ainda.",
  encerradas: "Nenhuma solicitação não aprovada ou cancelada.",
  todas: "Nenhuma solicitação para a busca.",
}

/** Jornada do pedido (quem age em cada passo), para quem nunca pediu uma solução. */
const JOURNEY: [string, string, "Você" | "TI"][] = [
  ["Solicitação", "Você conta o que quer construir.", "Você"],
  ["Análise", "A coordenação avalia objetivo, custos, dados e sustentação.", "TI"],
  ["Seu desenvolvimento", "Aprovada, você constrói na ferramenta autorizada e envia o link.", "Você"],
  ["Apresentação", "A versão funcional é apresentada à coordenação e ao PO.", "TI"],
  ["Adequação pela TI", "A TI adequa o código e prepara a homologação.", "TI"],
  ["Sua homologação", "Você testa e aprova ou pede ajustes.", "Você"],
  ["Segurança e publicação", "Segurança da Informação e deploy em produção.", "TI"],
  ["Em produção", "A TI publica e passa a sustentar a solução.", "TI"],
]

/** Soluções com IA pedidas pelo cliente: a TI analisa, o cliente constrói (ex.: Base44) e a TI
 *  adequa, publica e sustenta. Layout das telas de portfólio e ocorrências. */
export default function ClientAiSolutionsPage() {
  const base = usePortalBase()
  const navigate = useNavigate()
  // Qualquer pessoa com acesso à plataforma pede; a coordenação também acompanha os de todos.
  const canRequest = true
  const [params, setParams] = useSearchParams()
  const filtro = (FILTROS.some((f) => f.key === params.get("situacao")) ? params.get("situacao") : "andamento") as Filtro
  const [items, setItems] = useState<AiSolutionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  useEffect(() => {
    aiSolutionsPortalApi.list().then(setItems).catch(() => setItems([])).finally(() => setLoading(false))
  }, [])

  function goFiltro(f: Filtro) {
    const next = new URLSearchParams(params)
    if (f === "andamento") next.delete("situacao")
    else next.set("situacao", f)
    setParams(next, { replace: true })
  }

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((s) => aiTitle(s).toLowerCase().includes(q) || s.code_label.toLowerCase().includes(q))
  }, [items, query])
  const counts = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.key, searched.filter(MATCH[f.key]).length])) as Record<Filtro, number>,
    [searched],
  )
  const visible = useMemo(() => searched.filter(MATCH[filtro]), [searched, filtro])
  const kpi = useMemo(() => ({
    voce: items.filter(MATCH.voce).length,
    andamento: items.filter(MATCH.andamento).length,
    producao: items.filter(MATCH.producao).length,
    encerradas: items.filter(MATCH.encerradas).length,
  }), [items])
  const lastUpdate = items.reduce<string | null>((max, s) => {
    const v = s.updated_at ?? s.created_at
    return !max || (v && v > max) ? v : max
  }, null)
  const tabs: TabDef<Filtro>[] = FILTROS.map((f) => ({ value: f.key, label: loading ? f.label : `${f.label} (${counts[f.key]})`, icon: f.icon }))

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Trilha">
          <Link to={base} className="hover:text-foreground">Portfólio</Link>
          <ChevronRight size={14} />
          <span className="font-medium text-foreground">Soluções com IA</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <IconTile icon="Sparkles" color="#7C3AED" size={56} />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Soluções com IA</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Peça a análise de uma solução que você vai construir numa ferramenta de IA autorizada (ex.: Base44). Depois de
                aprovada e construída, a TI adequa, publica e sustenta.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canRequest && (
              <Button asChild className="h-10 gap-1.5">
                <Link to={`${base}/solucoes-ia/nova`}><Plus size={16} /> Solicitar análise</Link>
              </Button>
            )}
            <p className="text-right text-xs leading-snug text-muted-foreground">
              Última atualização
              <br />
              <span className="text-foreground">{fmtDateTime(lastUpdate)}</span>
            </p>
          </div>
        </div>
      </div>

      <KpiRow className="grid-cols-2 lg:grid-cols-4">
        <KpiCount
          icon={Hourglass} value={loading ? "·" : kpi.voce} label="Com você" tone="amber"
          highlight={kpi.voce > 0} onClick={() => goFiltro("voce")} active={filtro === "voce"}
        />
        <KpiCount
          icon={CircleDot} value={loading ? "·" : kpi.andamento} label="Em andamento"
          onClick={() => goFiltro("andamento")} active={filtro === "andamento"}
        />
        <KpiCount
          icon={Rocket} value={loading ? "·" : kpi.producao} label="Em produção" tone="emerald"
          onClick={() => goFiltro("producao")} active={filtro === "producao"}
        />
        <KpiCount
          icon={Ban} value={loading ? "·" : kpi.encerradas} label="Não aprovadas ou canceladas" tone="slate"
          onClick={() => goFiltro("encerradas")} active={filtro === "encerradas"}
        />
      </KpiRow>

      <DetailTabs tabs={tabs} value={filtro} onChange={goFiltro} search={query} onSearch={setQuery} placeholder="Buscar por código ou nome…" />

      <Card>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title={items.length === 0 ? "Nenhuma solicitação ainda" : filtro === "voce" ? "Tudo em dia" : "Nada por aqui"}
            description={items.length === 0 ? (canRequest ? "Clique em “Solicitar análise” para começar." : "Nenhum cliente pediu solução com IA ainda.") : EMPTY_TEXT[filtro]}
            action={items.length === 0 && canRequest ? { label: "Solicitar análise", onClick: () => navigate(`${base}/solucoes-ia/nova`) } : undefined}
            compact
          />
        ) : (
          <>
            {/* Desktop: tabela; a linha inteira abre o detalhe. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[920px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "32%" }} /><col style={{ width: "19%" }} /><col style={{ width: "25%" }} />
                  <col style={{ width: "14%" }} /><col style={{ width: "10%" }} />
                </colgroup>
                <thead className="bg-muted/60 text-left text-sm text-foreground">
                  <tr>
                    <th className="py-3 pl-4 pr-3 font-semibold">Solução</th>
                    <th className="px-3 py-3 font-semibold">Etapa</th>
                    <th className="px-3 py-3 font-semibold">Próximo passo</th>
                    <th className="px-3 py-3 font-semibold">Progresso</th>
                    <th className="px-3 py-3 text-right font-semibold">Atualizada</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => {
                    const href = `${base}/solucoes-ia/${s.task_id}`
                    return (
                      <tr
                        key={s.task_id}
                        tabIndex={0}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("a, button")) return
                          navigate(href)
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) navigate(href) }}
                        className={`cursor-pointer border-t transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none ${
                          s.client_action ? "bg-amber-50/70 dark:bg-amber-950/20" : ""
                        }`}
                      >
                        <td className="py-3 pl-4 pr-3">
                          <div className="flex items-center gap-3">
                            <IconTile icon="Sparkles" color="#7C3AED" size={36} />
                            <div className="min-w-0">
                              <p className="font-mono text-xs text-muted-foreground">{s.code_label}</p>
                              <Link to={href} className="block truncate font-semibold hover:underline" title={aiTitle(s)}>{aiTitle(s)}</Link>
                              {s.created_at && <p className="text-xs text-muted-foreground">Pedida em {fmtDateTime(s.created_at).slice(0, 10)}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3"><AiStageBadge stageKey={s.stage_key} name={s.stage_name} isClosed={s.is_closed} /></td>
                        <td className="px-3 py-3">
                          {s.client_action ? (
                            <Link to={href} className="flex items-start gap-1.5 font-medium text-amber-800 hover:underline dark:text-amber-300">
                              <span className="line-clamp-2">{CLIENT_ACTION_HINT[s.client_action]}</span>
                              <ArrowRight size={14} className="mt-0.5 shrink-0" />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">
                              {s.stage_key === "producao" ? "Publicada e sustentada pela TI." : s.is_closed ? "—" : "Com a TI. Avisamos quando precisar de você."}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3"><AiProgress stageKey={s.stage_key} isClosed={s.is_closed} /></td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-xs text-muted-foreground" title={fmtDateTime(s.updated_at)}>
                          {fmtRelative(s.updated_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Celular: cartões */}
            <ul className="divide-y md:hidden">
              {visible.map((s) => (
                <li key={s.task_id} className={s.client_action ? "bg-amber-50/70 dark:bg-amber-950/20" : ""}>
                  <Link to={`${base}/solucoes-ia/${s.task_id}`} className="block space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{s.code_label}</span>
                      <span>{fmtRelative(s.updated_at)}</span>
                    </div>
                    <p className="font-semibold leading-snug">{aiTitle(s)}</p>
                    <AiStageBadge stageKey={s.stage_key} name={s.stage_name} isClosed={s.is_closed} />
                    {s.client_action && <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{CLIENT_ACTION_HINT[s.client_action]}</p>}
                    <AiProgress stageKey={s.stage_key} isClosed={s.is_closed} />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card>
        <div className="border-b px-5 py-4">
          <h2 className="text-lg font-semibold">Como funciona</h2>
          <p className="text-sm text-muted-foreground">O caminho de um pedido até a solução em produção. Os passos em destaque dependem de você.</p>
        </div>
        <ol className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {JOURNEY.map(([t, d, who], i) => (
            <li
              key={t}
              className={`flex gap-3 rounded-xl border p-3 ${who === "Você" ? "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20" : ""}`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
              <span className="min-w-0 text-sm">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {t}
                  <span className={`rounded-md px-1.5 text-[11px] font-medium ${who === "Você" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" : "bg-muted text-muted-foreground"}`}>
                    {who}
                  </span>
                </span>
                <span className="block text-muted-foreground">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
