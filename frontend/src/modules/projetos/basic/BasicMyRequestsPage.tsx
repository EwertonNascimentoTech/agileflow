import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { CheckCircle2, ChevronDown, ChevronRight, Circle, ClipboardList, Search } from "lucide-react"

import {
  projetosApi,
  type ProjectMyRequest,
  type ProjectMyRequestStage,
  type ProjectTaskWithContext,
} from "@/api/projetos"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { ProjectTaskDrawer } from "@/modules/projetos/ProjectTaskDrawer"
import { cn } from "@/lib/utils"

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return "agora"
  const min = Math.floor(sec / 60)
  if (min < 60) return `há ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `há ${hr} h`
  const day = Math.floor(hr / 24)
  if (day < 30) return `há ${day} d`
  return new Date(iso).toLocaleDateString("pt-BR")
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function StatusBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium shrink-0"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  )
}

function reportProgress(item: ProjectMyRequest) {
  const stages = item.stages.length > 0 ? item.stages : [{ is_complete: !!item.completed_at, is_current: true }]
  const stageDone = stages.filter((s) => s.is_complete).length
  const childDone = item.children.filter((c) => c.completed_at).length
  const total = stages.length + item.children.length
  if (total === 0) return { done: 0, total: 1, pct: item.completed_at ? 100 : 0 }
  const done = stageDone + childDone
  return { done, total, pct: Math.round((done / total) * 100) }
}

function currentStage(item: ProjectMyRequest): ProjectMyRequestStage | null {
  if (item.stages.length === 0) return null
  return item.stages.find((s) => s.is_current) ?? item.stages[item.stages.length - 1]
}

function matchesQuery(item: ProjectMyRequest, q: string): boolean {
  if (item.title.toLowerCase().includes(q)) return true
  if (item.stages.some((s) => s.label.toLowerCase().includes(q) || s.task?.title.toLowerCase().includes(q))) return true
  return item.children.some((c) => c.title.toLowerCase().includes(q))
}

function findTaskById(items: ProjectMyRequest[], taskId: string): ProjectTaskWithContext | null {
  for (const item of items) {
    if (item.id === taskId) return item
    for (const stage of item.stages) {
      if (stage.task?.id === taskId) return stage.task
    }
    const child = item.children.find((c) => c.id === taskId)
    if (child) return child
  }
  return null
}

function PipelineStage({
  stage,
  isLast,
  onOpen,
}: {
  stage: ProjectMyRequestStage
  isLast: boolean
  onOpen: (task: ProjectTaskWithContext) => void
}) {
  const clickable = !!stage.task
  const Wrapper = clickable ? "button" : "div"

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <Wrapper
          type={clickable ? "button" : undefined}
          onClick={clickable ? () => onOpen(stage.task!) : undefined}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition",
            clickable && "hover:scale-105",
            stage.is_complete
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-600"
              : stage.is_current
                ? "border-primary bg-primary/10 text-primary"
                : "border-muted-foreground/30 bg-muted text-muted-foreground",
          )}
        >
          {stage.is_complete ? <CheckCircle2 size={14} /> : stage.is_current ? <Circle size={10} fill="currentColor" /> : <Circle size={10} />}
        </Wrapper>
        {!isLast && (
          <div
            className={cn(
              "my-0.5 w-0.5 flex-1 min-h-[20px]",
              stage.is_complete ? "bg-emerald-500/50" : "bg-border",
            )}
          />
        )}
      </div>
      <Wrapper
        type={clickable ? "button" : undefined}
        onClick={clickable ? () => onOpen(stage.task!) : undefined}
        className={cn(
          "group mb-3 flex-1 rounded-lg border bg-card px-3 py-2 text-left transition",
          clickable ? "hover:border-primary/40 hover:shadow-sm" : "opacity-80",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Kanban
            </p>
            <p className={cn(
              "text-xs font-medium text-foreground truncate",
              clickable && "group-hover:text-primary",
            )}
            >
              {stage.label}
            </p>
            {stage.task?.demand_type && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {stage.task.demand_type.name}
              </p>
            )}
          </div>
          {stage.task ? (
            <StatusBadge name={stage.task.status.name} color={stage.task.status.color} />
          ) : (
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shrink-0">
              {stage.is_pending ? "Aguardando" : "—"}
            </span>
          )}
        </div>
      </Wrapper>
    </div>
  )
}

function RequestCard({
  item,
  onOpenTask,
}: {
  item: ProjectMyRequest
  onOpenTask: (task: ProjectTaskWithContext) => void
}) {
  const progress = reportProgress(item)
  const active = currentStage(item)
  const hasChildren = item.children.length > 0
  const hasPipeline = item.stages.length > 0
  const [expanded, setExpanded] = useState(false)

  return (
    <article className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpenTask(item)}
            className="min-w-0 flex-1 space-y-1.5 text-left transition hover:opacity-80"
          >
            <p className="text-sm font-semibold text-foreground leading-snug">{item.title}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {item.project.name}
              {active ? <> · {active.label}</> : item.demand_type ? <> · {item.demand_type.name}</> : null}
            </p>
          </button>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-label={expanded ? "Minimizar card" : "Maximizar card"}
                title={expanded ? "Minimizar" : "Maximizar"}
                className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-[10px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              >
                <ChevronDown
                  size={12}
                  className={cn("transition-transform", !expanded && "-rotate-90")}
                />
                {expanded ? "Minimizar" : "Maximizar"}
              </button>
              <StatusBadge
                name={active?.task?.status.name ?? item.status.name}
                color={active?.task?.status.color ?? item.status.color}
              />
            </div>
            <span className="text-[11px] text-muted-foreground">Aberta {timeAgo(item.created_at)}</span>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {progress.done} de {progress.total} etapas concluídas · {item.stages.length} kanbans
            </span>
            <span className="font-semibold text-foreground">{progress.pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                progress.pct >= 100 ? "bg-emerald-500" : "bg-primary",
              )}
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>
      </div>

      {expanded && hasPipeline && (
        <div className="border-t bg-muted/20 px-4 py-3">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Reporte de andamento
          </p>
          <div>
            {item.stages.map((stage, idx) => (
              <PipelineStage
                key={stage.funnel_id}
                stage={stage}
                isLast={idx === item.stages.length - 1 && !hasChildren}
                onOpen={onOpenTask}
              />
            ))}
          </div>
        </div>
      )}

      {expanded && hasChildren && (
        <div className={cn("px-4 py-3", hasPipeline ? "border-t" : "border-t bg-muted/20")}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Itens de projetos e programas
          </p>
          <ol className="space-y-1">
            {item.children.map((child, idx) => {
              const done = !!child.completed_at
              const due = formatDate(child.due_date)
              return (
                <li key={child.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(child)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition",
                      "hover:border-primary/40 hover:shadow-sm",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                        done ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {done ? <CheckCircle2 size={14} /> : idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground line-clamp-2 group-hover:text-primary">
                        {child.title}
                      </p>
                      {due && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Prazo: {due}</p>
                      )}
                    </div>
                    <StatusBadge name={child.status.name} color={child.status.color} />
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {expanded && !hasPipeline && !hasChildren && (
        <div className="border-t px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            Sua solicitação está em{" "}
            <span className="font-medium text-foreground">
              {(active?.task?.status.name ?? item.status.name).toLowerCase()}
            </span>
            . Clique no título para ver detalhes e acompanhar atualizações.
          </p>
        </div>
      )}

      {expanded && (
        <div className="border-t px-4 py-2.5 flex flex-wrap gap-x-4">
          {item.origin_request_id && (
            <button
              type="button"
              onClick={() => {
                const origin = item.stages.find((s) => s.task?.id === item.origin_request_id)
                if (origin?.task) onOpenTask(origin.task)
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-primary hover:underline"
            >
              Ver solicitação original
              <ChevronRight size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenTask(item)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            {item.stages.length > 1 ? "Ver andamento completo" : "Ver solicitação completa"}
            <ChevronRight size={12} />
          </button>
        </div>
      )}
    </article>
  )
}

export default function BasicMyRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<ProjectMyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [selectedTask, setSelectedTask] = useState<ProjectTaskWithContext | null>(null)

  async function reload() {
    const data = await projetosApi.listMyRequests().catch(() => [] as ProjectMyRequest[])
    setItems(data)
    return data
  }

  useEffect(() => {
    projetosApi.listMyRequests()
      .then((data) => {
        setItems(data)
        const taskId = searchParams.get("task")
        if (taskId) {
          const found = findTaskById(data, taskId)
          if (found) setSelectedTask(found)
          setSearchParams({}, { replace: true })
        }
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => matchesQuery(it, q))
  }, [items, query])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Minhas Solicitações</h1>
          <p className="text-xs text-muted-foreground">
            Acompanhe todos os kanbans do fluxo: solicitação, programas e itens vinculados.
          </p>
        </div>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground shrink-0 sm:ml-2">
          {items.length}
        </span>
        <div className="relative sm:ml-auto sm:flex-1 sm:max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar solicitação ou item..."
            className="pl-9 h-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={items.length === 0 ? "Você ainda não fez nenhuma solicitação" : "Nada encontrado"}
          description={items.length === 0 ? "Abra uma nova solicitação no menu ao lado." : "Tente outra busca."}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <RequestCard key={item.origin_request_id ?? item.id} item={item} onOpenTask={setSelectedTask} />
          ))}
        </div>
      )}

      <ProjectTaskDrawer
        open={!!selectedTask}
        onOpenChange={(v) => !v && setSelectedTask(null)}
        projectId={selectedTask?.project_id ?? ""}
        task={selectedTask}
        isBasicUser
        onSaved={() => { void reload() }}
        onDeleted={() => { void reload() }}
      />
    </div>
  )
}
