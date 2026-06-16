import { useEffect, useState } from "react"
import { CheckSquare, Square, Plus, Loader2, CalendarClock, X } from "lucide-react"
import { tasksApi } from "@/api/crm"
import type { Task, TaskPriority } from "@/api/crm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "text-slate-500",
  medium: "text-blue-600",
  high: "text-orange-600",
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Baixa", medium: "Normal", high: "Alta",
}

export default function TasksPanel({ attendanceId }: { attendanceId: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{ title: string; description: string; priority: TaskPriority; due_date: string }>({
    title: "", description: "", priority: "medium", due_date: "",
  })

  useEffect(() => {
    tasksApi.list({ attendance_id: attendanceId, limit: 100 })
      .then(setTasks)
      .finally(() => setLoading(false))
  }, [attendanceId])

  async function handleCreate() {
    if (!form.title.trim()) return
    setCreating(true)
    try {
      const created = await tasksApi.create({
        attendance_id: attendanceId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : undefined,
      })
      setTasks(prev => [created, ...prev])
      setForm({ title: "", description: "", priority: "medium", due_date: "" })
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

  async function toggleTask(t: Task) {
    const newStatus = t.status === "done" ? "pending" : "done"
    const updated = await tasksApi.update(t.id, { status: newStatus })
    setTasks(prev => prev.map(x => x.id === t.id ? updated : x))
  }

  async function deleteTask(id: string) {
    if (!confirm("Excluir esta tarefa?")) return
    await tasksApi.remove(id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const pending = tasks.filter(t => t.status === "pending")
  const done = tasks.filter(t => t.status === "done")

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Tarefas {tasks.length > 0 && <span className="text-foreground/60">({pending.length})</span>}
        </p>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setOpen(true)}>
          <Plus size={12} />
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">Nenhuma tarefa.</p>
      ) : (
        <div className="space-y-1.5">
          {[...pending, ...done].map(t => {
            const isDone = t.status === "done"
            const isOverdue = !isDone && t.due_date && new Date(t.due_date) < new Date()
            return (
              <div key={t.id} className="group flex items-start gap-2 text-xs">
                <button
                  onClick={() => toggleTask(t)}
                  className="shrink-0 mt-0.5 text-muted-foreground hover:text-primary transition-colors"
                >
                  {isDone ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {t.source === "playbook" && (
                      <span className="inline-flex items-center rounded px-1 py-0 text-[9px] font-medium bg-violet-100 text-violet-700 border border-violet-200">
                        Playbook
                      </span>
                    )}
                    <p className={cn("leading-snug", isDone && "line-through text-muted-foreground")}>
                      {t.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                    <span className={PRIORITY_COLORS[t.priority]}>● {PRIORITY_LABELS[t.priority]}</span>
                    {t.due_date && (
                      <span className={cn("flex items-center gap-0.5", isOverdue && "text-destructive font-medium")}>
                        <CalendarClock size={9} />
                        {new Date(t.due_date).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteTask(t.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                placeholder="Ligar para o cliente…"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Prazo</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Normal</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating || !form.title.trim()}>
              {creating && <Loader2 size={13} className="animate-spin mr-1.5" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
