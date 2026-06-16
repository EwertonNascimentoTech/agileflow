import { useEffect, useMemo, useState } from "react"
import { Loader2, Pencil, Search, Trash2 } from "lucide-react"

import { projetosApi, type Project, type ProjectTaskWithContext } from "@/api/projetos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Demandas / Cards</h1>
        <p className="text-sm text-muted-foreground">
          Todas as demandas criadas nos quadros. Edite ou exclua em um só lugar.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por título…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sm:w-64">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os processos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROJECTS}>Todos os processos</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} demanda{filtered.length !== 1 ? "s" : ""}
      </p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma demanda encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <Card key={task.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: task.status?.color || "#6B7280" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline">{task.project?.name ?? "—"}</Badge>
                    <Badge variant="secondary">{task.status?.name ?? "—"}</Badge>
                    {task.demand_type && <span>· {task.demand_type.name}</span>}
                    <span>· Prazo {formatDate(task.due_date)}</span>
                    <span>· {task.percent_complete}%</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => beginEdit(task)}>
                    <Pencil size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => void handleDelete(task)}
                    disabled={deletingId === task.id}
                  >
                    {deletingId === task.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
