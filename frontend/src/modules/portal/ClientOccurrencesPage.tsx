import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowRight, CheckCircle2, LifeBuoy, MessageSquareReply, Plus, Search } from "lucide-react"

import {
  OCCURRENCE_TIPO_LABEL,
  portalOccurrencesApi,
  type OccurrenceSummary,
  type PortalProject,
} from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  PriorityBadge,
  StageBadge,
  fmtDateTime,
  fmtRelative,
  needsMyAction,
  occTitle,
} from "@/modules/portal/occurrenceUi"

const ALL = "__all__"

type Situacao = "abertas" | "acao" | "encerradas" | "todas"
const TABS: Array<{ key: Situacao; label: string }> = [
  { key: "abertas", label: "Em aberto" },
  { key: "acao", label: "Aguardando você" },
  { key: "encerradas", label: "Encerradas" },
  { key: "todas", label: "Todas" },
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
    <Button asChild size="sm" className="h-7 gap-1 px-2 text-xs">
      <Link to={href}>
        {validar ? <CheckCircle2 size={13} /> : <MessageSquareReply size={13} />} {validar ? "Validar" : "Responder"}
      </Link>
    </Button>
  )
}

/** Lista de ocorrências dos projetos do cliente (todas; filtro "abertas por mim"). */
export default function ClientOccurrencesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const projectFilter = params.get("projeto") ?? ALL
  const mine = params.get("minhas") === "1"
  const situacao = (TABS.some((t) => t.key === params.get("situacao")) ? params.get("situacao") : "abertas") as Situacao
  const [projects, setProjects] = useState<PortalProject[]>([])
  const [items, setItems] = useState<OccurrenceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  useEffect(() => {
    portalOccurrencesApi.projects().then(setProjects).catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    setLoading(true)
    portalOccurrencesApi
      .list({ project_task_id: projectFilter === ALL ? undefined : projectFilter, mine })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [projectFilter, mine])

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((o) => o.title.toLowerCase().includes(q) || o.code_label.toLowerCase().includes(q))
  }, [items, query])
  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, searched.filter(MATCH[t.key]).length])) as Record<Situacao, number>,
    [searched],
  )
  const visible = useMemo(() => searched.filter(MATCH[situacao]), [searched, situacao])

  const canOpen = projects.some((p) => p.accepts_occurrences)
  const newHref =
    projectFilter !== ALL && projects.find((p) => p.task_id === projectFilter)?.accepts_occurrences
      ? `/portal/ocorrencias/nova?projeto=${projectFilter}`
      : "/portal/ocorrencias/nova"

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ocorrências</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe as ocorrências dos seus projetos. Você responde nas que abriu.
          </p>
        </div>
        {canOpen && (
          <Button asChild className="gap-1.5">
            <Link to={newHref}>
              <Plus size={15} /> Nova ocorrência
            </Link>
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {/* Situação (abas) + filtros */}
        <div className="flex flex-col gap-3 border-b p-3">
          <div role="tablist" aria-label="Situação" className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap">
            {TABS.map((t) => {
              const active = t.key === situacao
              const alert = t.key === "acao" && counts.acao > 0
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setParam("situacao", t.key === "abertas" ? null : t.key)}
                  className={`inline-flex shrink-0 items-center justify-between gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors sm:justify-start ${
                    active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {t.label}
                  <span
                    className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums ${
                      alert ? "bg-amber-500 text-white" : active ? "bg-primary/15" : "bg-muted"
                    }`}
                  >
                    {loading ? "·" : counts[t.key]}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por código ou título"
                aria-label="Buscar ocorrência"
                className="h-9 pl-8"
              />
            </div>
            <Select value={projectFilter} onValueChange={(v) => setParam("projeto", v === ALL ? null : v)}>
              <SelectTrigger className="h-9 w-full sm:w-64" aria-label="Projeto">
                <SelectValue placeholder="Projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os projetos</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.task_id} value={p.task_id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={mine}
                onChange={(e) => setParam("minhas", e.target.checked ? "1" : null)}
              />
              Abertas por mim
            </label>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={situacao === "acao" ? CheckCircle2 : LifeBuoy}
            title={situacao === "acao" ? "Tudo em dia" : "Nenhuma ocorrência"}
            description={
              items.length === 0 && canOpen ? "Abra uma ocorrência quando precisar de ajuda com o sistema." : EMPTY_TEXT[situacao]
            }
            compact
          />
        ) : (
          <>
            {/* Desktop: tabela; a linha inteira abre o detalhe (é lá que o cliente responde ao time). */}
            <table className="hidden w-full text-sm md:table">
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Ocorrência</th>
                  <th className="px-3 py-2.5 font-semibold">Projeto</th>
                  <th className="px-3 py-2.5 font-semibold">Situação</th>
                  <th className="px-3 py-2.5 font-semibold">Responsável</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Atualizada</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const href = `/portal/ocorrencias/${o.task_id}`
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
                      className={`cursor-pointer border-t align-top transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none ${
                        action ? "bg-amber-50/70 dark:bg-amber-950/20" : ""
                      }`}
                    >
                      <td className="max-w-[340px] px-4 py-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono font-medium text-foreground/80">{o.code_label}</span>
                          <PriorityBadge value={o.prioridade} />
                          <span>{OCCURRENCE_TIPO_LABEL[o.tipo]}</span>
                        </div>
                        <Link to={href} className="mt-0.5 block font-medium leading-snug hover:underline">
                          {occTitle(o)}
                        </Link>
                        {o.opened_by_name && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {o.opened_by_me ? "Aberta por você" : `Aberta por ${o.opened_by_name}`}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{o.project_title ?? "—"}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <StageBadge stageKey={o.stage_key} name={o.stage_name} mine={o.opened_by_me} />
                          <ActionLink o={o} href={href} />
                        </div>
                      </td>
                      {/* Quem assumiu no time (antes disso, aguardando alguém assumir). */}
                      <td className="px-3 py-3">
                        {o.assignee_name ? (
                          <span className="font-medium">{o.assignee_name}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{o.is_closed ? "—" : "Aguardando atendimento"}</span>
                        )}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground"
                        title={`Aberta em ${fmtDateTime(o.created_at)}`}
                      >
                        {fmtRelative(o.updated_at ?? o.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Celular: cartões */}
            <ul className="divide-y md:hidden">
              {visible.map((o) => {
                const href = `/portal/ocorrencias/${o.task_id}`
                return (
                  <li key={o.task_id} className={needsMyAction(o) ? "bg-amber-50/70 dark:bg-amber-950/20" : ""}>
                    <Link to={href} className="block space-y-1.5 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-medium">{o.code_label}</span>
                          <PriorityBadge value={o.prioridade} />
                        </span>
                        <span className="text-[11px] text-muted-foreground">{fmtRelative(o.updated_at ?? o.created_at)}</span>
                      </div>
                      <div className="font-medium leading-snug">{occTitle(o)}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.project_title ?? "—"} · {o.assignee_name ?? (o.is_closed ? "—" : "Aguardando atendimento")}
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-0.5">
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
      </div>
    </div>
  )
}
