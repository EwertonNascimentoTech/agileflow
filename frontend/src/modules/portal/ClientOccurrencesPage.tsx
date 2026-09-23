import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { LifeBuoy, MessageSquareReply, Plus } from "lucide-react"

import {
  OCCURRENCE_TIPO_LABEL,
  portalOccurrencesApi,
  type OccurrenceSummary,
  type PortalProject,
} from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PriorityBadge, StageBadge, fmtDateTime } from "@/modules/portal/occurrenceUi"

const ALL = "__all__"

/** Lista de ocorrências dos projetos do cliente (todas; filtro "abertas por mim"). */
export default function ClientOccurrencesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const projectFilter = params.get("projeto") ?? ALL
  const mine = params.get("minhas") === "1"
  const [projects, setProjects] = useState<PortalProject[]>([])
  const [items, setItems] = useState<OccurrenceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showClosed, setShowClosed] = useState(false)

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

  const visible = useMemo(() => (showClosed ? items : items.filter((i) => !i.is_closed)), [items, showClosed])
  const canOpen = projects.some((p) => p.accepts_occurrences)
  const newHref =
    projectFilter !== ALL && projects.find((p) => p.task_id === projectFilter)?.accepts_occurrences
      ? `/portal/ocorrencias/nova?projeto=${projectFilter}`
      : "/portal/ocorrencias/nova"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Ocorrências</h1>
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

      <div className="flex flex-wrap items-center gap-3">
        <Select value={projectFilter} onValueChange={(v) => setParam("projeto", v === ALL ? null : v)}>
          <SelectTrigger className="w-72">
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            checked={mine}
            onChange={(e) => setParam("minhas", e.target.checked ? "1" : null)}
          />
          Abertas por mim
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
          />
          Mostrar encerradas
        </label>
      </div>

      {loading ? (
        <Skeleton className="h-56 rounded-lg" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="Nenhuma ocorrência"
          description={canOpen ? "Abra uma ocorrência quando precisar de ajuda com o sistema." : "Não há ocorrências para os filtros escolhidos."}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Ocorrência</th>
                <th className="px-3 py-2 font-semibold">Projeto</th>
                <th className="px-3 py-2 font-semibold">Prioridade</th>
                <th className="px-3 py-2 font-semibold">Situação</th>
                <th className="px-3 py-2 font-semibold">Responsável</th>
                <th className="px-3 py-2 font-semibold">Aberta</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const href = `/portal/ocorrencias/${o.task_id}`
                const waitingMe = o.opened_by_me && o.stage_key === "aguardando_cliente"
                // A linha inteira abre o detalhe (é lá que o cliente responde ao time).
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
                    className={`cursor-pointer border-t align-top hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:outline-none ${
                      waitingMe ? "bg-amber-50/70 dark:bg-amber-950/20" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <Link to={href} className="font-medium hover:underline">
                        {o.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {OCCURRENCE_TIPO_LABEL[o.tipo]}
                        {o.opened_by_name && <> · {o.opened_by_me ? "aberta por você" : `por ${o.opened_by_name}`}</>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{o.project_title ?? "—"}</td>
                    <td className="px-3 py-2">
                      <PriorityBadge value={o.prioridade} />
                    </td>
                    <td className="px-3 py-2">
                      <StageBadge stageKey={o.stage_key} name={o.stage_name} mine={o.opened_by_me} />
                      {waitingMe && (
                        <Button asChild size="sm" className="mt-1.5 h-7 gap-1 px-2 text-xs">
                          <Link to={href}>
                            <MessageSquareReply size={13} /> Responder
                          </Link>
                        </Button>
                      )}
                    </td>
                    {/* Quem assumiu no time (antes disso, aguardando alguém assumir). */}
                    <td className="px-3 py-2">
                      {o.assignee_name
                        ? <span className="font-medium">{o.assignee_name}</span>
                        : <span className="text-xs text-muted-foreground">{o.is_closed ? "—" : "Aguardando atendimento"}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{fmtDateTime(o.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
