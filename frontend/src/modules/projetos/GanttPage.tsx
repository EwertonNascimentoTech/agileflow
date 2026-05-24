import { useEffect, useMemo, useState } from "react"
import { CalendarRange } from "lucide-react"

import { projetosApi, type ProjectDemandType, type ProjectTask } from "@/api/projetos"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { GanttChart } from "@/modules/projetos/GanttChart"

export default function GanttPage() {
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [demandTypes, setDemandTypes] = useState<ProjectDemandType[]>([])
  const [loading, setLoading] = useState(true)
  const [rootId, setRootId] = useState<string>("")

  useEffect(() => {
    async function load() {
      const projects = await projetosApi.listProjects(true)
      const projectId = projects[0]?.id
      if (!projectId) return
      const [ts, dts] = await Promise.all([
        projetosApi.listTasks(projectId),
        projetosApi.listDemandTypes(true),
      ])
      setTasks(ts)
      setDemandTypes(dts)
    }
    load().finally(() => setLoading(false))
  }, [])

  const typeName = useMemo(() => {
    const m = new Map(demandTypes.map((t) => [t.id, t.name]))
    return (id: string | null) => (id ? m.get(id) ?? null : null)
  }, [demandTypes])

  // Candidatos a raiz do cronograma: cards que são pais de algum outro card.
  const roots = useMemo(() => {
    const parentIds = new Set(tasks.map((t) => t.parent_task_id).filter(Boolean) as string[])
    return tasks
      .filter((t) => parentIds.has(t.id))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [tasks])

  useEffect(() => {
    if (!rootId && roots.length > 0) setRootId(roots[0].id)
  }, [roots, rootId])

  if (loading) return <div className="p-4"><Skeleton className="h-96 rounded-lg" /></div>

  return (
    <div className="w-full space-y-4 p-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Cronograma</h2>
          <p className="text-sm text-muted-foreground">
            Linha do tempo de um programa ou projeto e seus itens (Programa → Projetos → Features).
          </p>
        </div>
        {roots.length > 0 && (
          <Select value={rootId} onValueChange={setRootId}>
            <SelectTrigger className="w-[320px]">
              <SelectValue placeholder="Escolha o programa/projeto" />
            </SelectTrigger>
            <SelectContent>
              {roots.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}{typeName(r.demand_type_id) ? ` · ${typeName(r.demand_type_id)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {roots.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Nada para exibir no cronograma"
          description="Crie cards com hierarquia (um Programa ou Projeto com itens filhos) e defina datas de início e prazo para visualizar a linha do tempo."
        />
      ) : (
        <>
          <GanttChart rootId={rootId} tasks={tasks} />
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-primary" /> em andamento</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-success" /> concluído</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-warning" /> SLA em alerta</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded bg-destructive" /> SLA estourado</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-destructive/60" /> hoje</span>
          </div>
        </>
      )}
    </div>
  )
}
