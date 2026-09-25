import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import {
  ArrowRight, CheckCircle2, ChevronRight, CircleDot, Headset, Hourglass, LifeBuoy, List, MessageSquareReply, Plus,
} from "lucide-react"

import {
  OCCURRENCE_TIPO_LABEL,
  portalOccurrencesApi,
  type OccurrencePrioridade,
  type OccurrenceSummary,
  type OccurrenceTipo,
  type PortalProject,
} from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { DetailTabs, KpiCount, KpiRow, type TabDef } from "@/modules/portal/DetailShell"
import {
  PRIORITY_LABEL,
  PersonChip,
  PriorityBadge,
  StageBadge,
  fmtDateTime,
  fmtRelative,
  needsMyAction,
  occTitle,
} from "@/modules/portal/occurrenceUi"
import { Card, FilterSelect } from "@/modules/portal/portfolioUi"
import { usePortalBase } from "@/modules/portal/portfolioMeta"

const ALL = "__all__"

type Situacao = "abertas" | "acao" | "encerradas" | "todas"
const SITUACOES: Array<{ key: Situacao; label: string; icon: typeof CircleDot }> = [
  { key: "abertas", label: "Em aberto", icon: CircleDot },
  { key: "acao", label: "Aguardando você", icon: Hourglass },
  { key: "encerradas", label: "Encerradas", icon: CheckCircle2 },
  { key: "todas", label: "Todas", icon: List },
]
const MATCH: Record<Situacao, (o: OccurrenceSummary) => boolean> = {
  abertas: (o) => !o.is_closed,
  acao: needsMyAction,
  encerradas: (o) => o.is_closed,
  todas: () => true,
}
const EMPTY_TEXT: Record<Situacao, string> = {
  abertas: "Nenhuma ocorrência em aberto para os filtros escolhidos.",
  acao: "Nada depende de você agora. Avisamos quando o time precisar.",
  encerradas: "Nenhuma ocorrência encerrada para os filtros escolhidos.",
  todas: "Não há ocorrências para os filtros escolhidos.",
}

/** Ação do cliente na ocorrência que depende dele (vai para o detalhe). */
function ActionLink({ o, href }: { o: OccurrenceSummary; href: string }) {
  if (!needsMyAction(o)) return null
  const validar = o.stage_key === "homologando"
  return (
    <Button asChild size="sm" className="h-8 gap-1.5 px-2.5 text-xs">
      <Link to={href}>
        {validar ? <CheckCircle2 size={14} /> : <MessageSquareReply size={14} />} {validar ? "Validar" : "Responder"}
      </Link>
    </Button>
  )
}

/** Ocorrências dos projetos do cliente, no layout das telas de portfólio e projetos. */
export default function ClientOccurrencesPage() {
  const base = usePortalBase()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const projectFilter = params.get("projeto") ?? ALL
  const mine = params.get("minhas") === "1"
  const situacao = (SITUACOES.some((t) => t.key === params.get("situacao")) ? params.get("situacao") : "abertas") as Situacao
  const [projects, setProjects] = useState<PortalProject[]>([])
  const [result, setResult] = useState<{ key: string; items: OccurrenceSummary[] } | null>(null)
  const [query, setQuery] = useState("")
  const [priority, setPriority] = useState(ALL)
  const [tipo, setTipo] = useState(ALL)

  useEffect(() => {
    portalOccurrencesApi.projects().then(setProjects).catch(() => setProjects([]))
  }, [])

  // Resultado guardado com a chave dos filtros: trocar de filtro volta ao "carregando" sem setState no efeito.
  const loadKey = `${projectFilter}|${mine}`
  useEffect(() => {
    let alive = true
    portalOccurrencesApi
      .list({ project_task_id: projectFilter === ALL ? undefined : projectFilter, mine })
      .then((items) => { if (alive) setResult({ key: loadKey, items }) })
      .catch(() => { if (alive) setResult({ key: loadKey, items: [] }) })
    return () => { alive = false }
  }, [projectFilter, mine, loadKey])
  const loading = !result || result.key !== loadKey
  const items = useMemo(() => (loading ? [] : result.items), [loading, result])

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((o) => {
      if (priority !== ALL && o.prioridade !== priority) return false
      if (tipo !== ALL && o.tipo !== tipo) return false
      if (q && !o.title.toLowerCase().includes(q) && !o.code_label.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, query, priority, tipo])
  const counts = useMemo(
    () => Object.fromEntries(SITUACOES.map((t) => [t.key, filtered.filter(MATCH[t.key]).length])) as Record<Situacao, number>,
    [filtered],
  )
  const visible = useMemo(() => filtered.filter(MATCH[situacao]), [filtered, situacao])
  const kpi = useMemo(() => ({
    acao: items.filter(needsMyAction).length,
    abertas: items.filter((o) => !o.is_closed).length,
    encerradas: items.filter((o) => o.is_closed).length,
  }), [items])

  const openable = projects.filter((p) => p.accepts_occurrences)
  const newHref =
    projectFilter !== ALL && projects.find((p) => p.task_id === projectFilter)?.accepts_occurrences
      ? `${base}/ocorrencias/nova?projeto=${projectFilter}`
      : openable.length === 1
        ? `${base}/ocorrencias/nova?projeto=${openable[0].task_id}`
        : `${base}/ocorrencias/nova`
  const lastUpdate = items.reduce<string | null>((max, o) => {
    const v = o.updated_at ?? o.created_at
    return !max || (v && v > max) ? v : max
  }, null)
  const tabs: TabDef<Situacao>[] = SITUACOES.map((t) => ({
    value: t.key,
    label: loading ? t.label : `${t.label} (${counts[t.key]})`,
    icon: t.icon,
  }))
  const goSituacao = (s: Situacao) => setParam("situacao", s === "abertas" ? null : s)

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Trilha">
          <Link to={base} className="hover:text-foreground">Portfólio</Link>
          <ChevronRight size={14} />
          <span className="font-medium text-foreground">Ocorrências</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Ocorrências</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Acompanhe as ocorrências dos seus projetos em Operação Assistida. Você responde e valida as que abriu.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {openable.length > 0 && (
              <Button asChild className="h-10 gap-1.5">
                <Link to={newHref}><Plus size={16} /> Nova ocorrência</Link>
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
          icon={Hourglass} value={loading ? "·" : kpi.acao} label="Aguardando você" tone="amber"
          highlight={kpi.acao > 0} onClick={() => goSituacao("acao")} active={situacao === "acao"}
        />
        <KpiCount
          icon={CircleDot} value={loading ? "·" : kpi.abertas} label="Em aberto"
          onClick={() => goSituacao("abertas")} active={situacao === "abertas"}
        />
        <KpiCount
          icon={CheckCircle2} value={loading ? "·" : kpi.encerradas} label="Resolvidas" tone="emerald"
          onClick={() => goSituacao("encerradas")} active={situacao === "encerradas"}
        />
        <KpiCount icon={Headset} value={openable.length} label="Projetos em Operação Assistida" tone="slate" />
      </KpiRow>

      <DetailTabs
        tabs={tabs}
        value={situacao}
        onChange={goSituacao}
        search={query}
        onSearch={setQuery}
        placeholder="Buscar por código ou título…"
      />

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div className="flex flex-wrap gap-3">
            <FilterSelect
              label="Projeto" value={projectFilter} onChange={(v) => setParam("projeto", v === ALL ? null : v)}
              options={[{ value: ALL, label: "Todos os projetos" }, ...projects.map((p) => ({ value: p.task_id, label: p.title }))]}
            />
            <FilterSelect
              label="Prioridade" value={priority} onChange={setPriority}
              options={[
                { value: ALL, label: "Todas" },
                ...(Object.keys(PRIORITY_LABEL) as OccurrencePrioridade[]).map((k) => ({ value: k, label: `${k} · ${PRIORITY_LABEL[k]}` })),
              ]}
            />
            <FilterSelect
              label="Tipo" value={tipo} onChange={setTipo}
              options={[
                { value: ALL, label: "Todos" },
                ...(Object.keys(OCCURRENCE_TIPO_LABEL) as OccurrenceTipo[]).map((k) => ({ value: k, label: OCCURRENCE_TIPO_LABEL[k] })),
              ]}
            />
            <FilterSelect
              label="Aberta por" value={mine ? "mine" : ALL} onChange={(v) => setParam("minhas", v === "mine" ? "1" : null)}
              options={[{ value: ALL, label: "Qualquer pessoa" }, { value: "mine", label: "Por mim" }]}
            />
          </div>
          <p className="pb-2 text-xs text-muted-foreground">Clique numa ocorrência para ver a conversa com o time.</p>
        </div>

        {loading ? (
          <div className="space-y-2 border-t p-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="border-t">
            <EmptyState
              icon={situacao === "acao" ? CheckCircle2 : LifeBuoy}
              title={situacao === "acao" ? "Tudo em dia" : "Nenhuma ocorrência"}
              description={
                items.length === 0 && openable.length > 0 ? "Abra uma ocorrência quando precisar de ajuda com o sistema." : EMPTY_TEXT[situacao]
              }
              compact
            />
          </div>
        ) : (
          <>
            {/* Desktop: tabela; a linha inteira abre o detalhe (é lá que o cliente responde ao time). */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "33%" }} /><col style={{ width: "17%" }} /><col style={{ width: "10%" }} />
                  <col style={{ width: "15%" }} /><col style={{ width: "14%" }} /><col style={{ width: "11%" }} />
                </colgroup>
                <thead className="bg-muted/60 text-left text-sm text-foreground">
                  <tr>
                    <th className="py-3 pl-4 pr-3 font-semibold">Ocorrência</th>
                    <th className="px-3 py-3 font-semibold">Projeto</th>
                    <th className="px-3 py-3 font-semibold">Prioridade</th>
                    <th className="px-3 py-3 font-semibold">Situação</th>
                    <th className="px-3 py-3 font-semibold">Responsável</th>
                    <th className="px-3 py-3 text-right font-semibold">Atualizada</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((o) => {
                    const href = `${base}/ocorrencias/${o.task_id}`
                    const action = needsMyAction(o)
                    return (
                      <tr
                        key={o.task_id}
                        tabIndex={0}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("a, button")) return
                          if (window.getSelection()?.toString()) return
                          navigate(href)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && e.target === e.currentTarget) navigate(href)
                        }}
                        className={`cursor-pointer border-t align-middle transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none ${
                          action ? "bg-amber-50/70 dark:bg-amber-950/20" : ""
                        }`}
                      >
                        <td className="py-3 pl-4 pr-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
                              <LifeBuoy size={17} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs text-muted-foreground">
                                <span className="font-mono font-medium text-foreground/80">{o.code_label}</span> · {OCCURRENCE_TIPO_LABEL[o.tipo]}
                              </p>
                              <Link to={href} className="block truncate font-semibold hover:underline" title={occTitle(o)}>
                                {occTitle(o)}
                              </Link>
                              {o.opened_by_name && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {o.opened_by_me ? "Aberta por você" : `Aberta por ${o.opened_by_name}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3"><span className="line-clamp-2 text-muted-foreground" title={o.project_title ?? undefined}>{o.project_title ?? "—"}</span></td>
                        <td className="px-3 py-3"><PriorityBadge value={o.prioridade} /></td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col items-start gap-1.5">
                            <StageBadge stageKey={o.stage_key} name={o.stage_name} mine={o.opened_by_me} />
                            <ActionLink o={o} href={href} />
                          </div>
                        </td>
                        {/* Quem assumiu no time (antes disso, aguardando alguém assumir). */}
                        <td className="px-3 py-3">
                          <PersonChip name={o.assignee_name} empty={o.is_closed ? "—" : "Aguardando atendimento"} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-xs text-muted-foreground" title={`Aberta em ${fmtDateTime(o.created_at)}`}>
                          {fmtRelative(o.updated_at ?? o.created_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Celular: cartões */}
            <ul className="divide-y border-t md:hidden">
              {visible.map((o) => {
                const href = `${base}/ocorrencias/${o.task_id}`
                return (
                  <li key={o.task_id} className={needsMyAction(o) ? "bg-amber-50/70 dark:bg-amber-950/20" : ""}>
                    <Link to={href} className="block space-y-2 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-medium">{o.code_label}</span>
                          <PriorityBadge value={o.prioridade} />
                        </span>
                        <span className="text-xs text-muted-foreground">{fmtRelative(o.updated_at ?? o.created_at)}</span>
                      </div>
                      <div className="font-semibold leading-snug">{occTitle(o)}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.project_title ?? "—"} · {o.assignee_name ?? (o.is_closed ? "—" : "Aguardando atendimento")}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <StageBadge stageKey={o.stage_key} name={o.stage_name} mine={o.opened_by_me} />
                        {needsMyAction(o) && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            {o.stage_key === "homologando" ? "Validar" : "Responder"} <ArrowRight size={12} />
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}
