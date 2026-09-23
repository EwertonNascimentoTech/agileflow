import { useEffect, useState } from "react"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { playbookApi } from "@/api/crm"
import type { PlaybookStep } from "@/api/crm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/lib/toast"

interface Props {
  statusId: string
}

export default function PlaybookConfig({ statusId }: Props) {
  const [steps, setSteps] = useState<PlaybookStep[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDueDays, setNewDueDays] = useState("1")
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    playbookApi
      .list(statusId)
      .then(setSteps)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [statusId])

  async function handleAdd() {
    if (!newTitle.trim()) return
    setAdding(true)
    try {
      const created = await playbookApi.create(statusId, {
        title: newTitle.trim(),
        due_days: Math.max(1, parseInt(newDueDays) || 1),
        order: steps.length,
      })
      setSteps(prev => [...prev, created])
      setNewTitle("")
      setNewDueDays("1")
      setShowForm(false)
      toast.success("Step do playbook adicionado.")
    } catch {
      toast.error("Erro ao adicionar step.")
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(stepId: string) {
    setDeletingId(stepId)
    try {
      await playbookApi.delete(statusId, stepId)
      setSteps(prev => prev.filter(s => s.id !== stepId))
      toast.success("Step removido.")
    } catch {
      toast.error("Erro ao remover step.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Playbook de tarefas</p>
          <p className="text-xs text-muted-foreground">Tarefas criadas automaticamente ao entrar nesta etapa.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowForm(v => !v)}
        >
          <Plus size={12} /> Adicionar step
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-2">
          {steps.length === 0 && !showForm && (
            <p className="text-xs text-muted-foreground italic">Nenhum step no playbook desta etapa.</p>
          )}
          {steps.map(step => (
            <div key={step.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{step.title}</p>
                <p className="text-xs text-muted-foreground">Prazo: {step.due_days} dia{step.due_days !== 1 ? "s" : ""}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                onClick={() => handleDelete(step.id)}
                disabled={deletingId === step.id}
              >
                {deletingId === step.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              </Button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Título da tarefa</Label>
            <Input
              placeholder="Ex: Enviar proposta"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="h-8 text-xs"
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prazo (dias após entrar na etapa)</Label>
            <Input
              type="number"
              min={1}
              value={newDueDays}
              onChange={e => setNewDueDays(e.target.value)}
              className="h-8 text-xs w-24"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs gap-1" onClick={handleAdd} disabled={!newTitle.trim() || adding}>
              {adding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Adicionar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
