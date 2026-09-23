import { useEffect, useMemo, useState } from "react"
import { ClipboardList, Search } from "lucide-react"

import { projetosApi, type ProjectTaskWithContext } from "@/api/projetos"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { ProjectTaskDrawer } from "@/modules/projetos/ProjectTaskDrawer"

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

export default function BasicMyRequestsPage() {
  const [items, setItems] = useState<ProjectTaskWithContext[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [selectedTask, setSelectedTask] = useState<ProjectTaskWithContext | null>(null)

  async function reload() {
    const data = await projetosApi.listMyRequests().catch(() => [] as ProjectTaskWithContext[])
    setItems(data)
  }

  useEffect(() => {
    projetosApi.listMyRequests()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.title.toLowerCase().includes(q))
  }, [items, query])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Minhas Solicitações</h1>
          <p className="text-xs text-muted-foreground">Acompanhe o status das solicitações que você abriu.</p>
        </div>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground shrink-0">
          {items.length}
        </span>
        <div className="relative ml-auto flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pelo título..."
            className="pl-9 h-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={items.length === 0 ? "Você ainda não fez nenhuma solicitação" : "Nada encontrado"}
          description={items.length === 0 ? "Abra uma nova solicitação no menu ao lado." : "Tente outra busca."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedTask(item)}
              className="w-full text-left rounded-xl border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold text-foreground line-clamp-2">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {item.project.name}
                    {item.demand_type ? <> · {item.demand_type.name}</> : null}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: `${item.status.color}1A`,
                      color: item.status.color,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.status.color }} />
                    {item.status.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{timeAgo(item.created_at)}</span>
                </div>
              </div>
            </button>
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
