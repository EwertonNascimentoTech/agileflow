import { useEffect, useMemo, useState } from "react"
import { ListChecks, Loader2, Pencil, Search, Trash2 } from "lucide-react"

import { projetosApi, type Project, type ProjectTaskWithContext } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/EmptyState"
import { Card, FilterSelect, PageHeader, Pill, ProgressBar, TABLE } from "@/components/ds"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

const ALL_PROJECTS = "__all__"

/** Converte ISO -> valor para <input type="date"> (yyyy-MM-dd). */
function toDateInput(value: string | null): string {
  if (!value) return ""
  return value.slice(0, 10)
}

/** Converte yyyy-MM-dd -> ISO (ou null se vazio). */
function fromDateInput(value: string): string | null {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("pt-BR")
}

interface EditDraft {
  title: string
  description: string
  start_date: string
  due_date: string
  percent_complete: number
}

export default function ProjectAllTasksConfigPage() {
  const [tasks, setTasks] = useState<ProjectTaskWithContext[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS)

  const [editing, setEditing] = useState<ProjectTaskWithContext | null>(null)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([projetosApi.listAllTasks(), projetosApi.listProjects(false)])
      .then(([taskList, projectList]) => {
        setTasks(taskList)
        setProjects(projectList)
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return tasks.filter((t) => {
      if (projectFilter !== ALL_PROJECTS && t.project_id !== projectFilter) return false
      if (term && !t.title.toLowerCase().includes(term)) return false
      return true
    })
  }, [tasks, search, projectFilter])

  function beginEdit(task: ProjectTaskWithContext) {
    setEditing(task)
    setDraft({
      title: task.title,
      description: task.description ?? "",
      start_date: toDateInput(task.start_date),
      due_date: toDateInput(task.due_date),
      percent_complete: task.percent_complete,
    })
  }

  function closeEdit() {
    setEditing(null)
    setDraft(null)
  }

  async function saveEdit() {
    if (!editing || !draft || !draft.title.trim()) return
    setSaving(true)
    try {
      const updated = await projetosApi.updateTask(editing.project_id, editing.id, {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        start_date: fromDateInput(draft.start_date),
        due_date: fromDateInput(draft.due_date),
        percent_complete: draft.percent_complete,
      })
      setTasks((prev) =>
        prev.map((t) => (t.id === editing.id ? { ...t, ...updated } : t))
      )
      closeEdit()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(task: ProjectTaskWithContext) {
    if (!window.confirm(`Excluir a demanda "${task.title}"? Esta ação não pode ser desfeita.`)) {
      return
    }
    setDeletingId(task.id)
    try {
      await projetosApi.deleteTask(task.project_id, task.id)
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
    } finally {
      setDeletingId(null)
    }
  }

  const header = (
    <PageHeader
      icon={ListChecks}
      color="#2563EB"
      crumbs={[{ label: "Configurações", to: "/app/modules/projetos/config" }, { label: "Demandas / Cards" }]}
      title="Demandas / Cards"
      description="Todas as demandas criadas nos quadros. Edite ou exclua em um só lugar."
    />
  )

  if (loading) {
    return (
      <div className="space-y-5">
        {header}
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {header}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[240px] flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">Buscar</span>
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                className="h-10 w-full rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Buscar por título…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </span>
          </label>
          <FilterSelect
            label="Processo"
            value={projectFilter}
            onChange={setProjectFilter}
            options={[
              { value: ALL_PROJECTS, label: "Todos os processos" },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ]}
          />
          <span className="ml-auto pb-2.5 text-sm text-muted-foreground">
            <strong className="font-semibold text-foreground">{filtered.length}</strong> demanda{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={ListChecks} title="Nenhuma demanda encontrada." compact />
        ) : (
          <div className={TABLE.wrap}>
            <table className={`${TABLE.table} min-w-[900px]`}>
              <thead className={TABLE.thead}>
                <tr>
                  <th className={TABLE.thFirst}>Demanda</th>
                  <th className={TABLE.th}>Processo</th>
                  <th className={TABLE.th}>Etapa</th>
                  <th className={TABLE.th}>Tipo</th>
                  <th className={`${TABLE.th} whitespace-nowrap`}>Prazo</th>
                  <th className={`${TABLE.th} w-40`}>Progresso</th>
                  <th className={`${TABLE.th} w-24`}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => (
                  <tr key={task.id} className={TABLE.tr}>
                    <td className={TABLE.tdFirst}>
                      <p className="max-w-[360px] truncate font-semibold" title={task.title}>{task.title}</p>
                    </td>
                    <td className={TABLE.td}>
                      <Pill tone="slate">{task.project?.name ?? "—"}</Pill>
                    </td>
                    <td className={TABLE.td}>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: task.status?.color || "#6B7280" }}
                          aria-hidden
                        />
                        {task.status?.name ?? "—"}
                      </span>
                    </td>
                    <td className={`${TABLE.td} text-muted-foreground`}>{task.demand_type?.name ?? "—"}</td>
                    <td className={`${TABLE.td} whitespace-nowrap tabular-nums text-muted-foreground`}>{formatDate(task.due_date)}</td>
                    <td className={TABLE.td}>
                      <ProgressBar value={task.percent_complete} />
                    </td>
                    <td className={TABLE.td}>
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Editar demanda" onClick={() => beginEdit(task)}>
                          <Pencil size={14} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Excluir demanda"
                          onClick={() => void handleDelete(task)}
                          disabled={deletingId === task.id}
                        >
                          {deletingId === task.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) closeEdit() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar demanda</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea
                  rows={3}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Início</Label>
                  <Input
                    type="date"
                    value={draft.start_date}
                    onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Prazo</Label>
                  <Input
                    type="date"
                    value={draft.due_date}
                    onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Progresso (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.percent_complete}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      percent_complete: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                    })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closeEdit}>Cancelar</Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={saving || !draft?.title.trim()}>
              {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
