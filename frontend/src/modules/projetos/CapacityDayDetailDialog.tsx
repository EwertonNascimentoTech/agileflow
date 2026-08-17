import { useEffect, useState } from "react"
import { AlertTriangle, CalendarClock, Clock, Loader2 } from "lucide-react"

import { projetosApi, type CapacityDayDetail, type CapacityDayTask } from "@/api/projetos"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${WEEKDAY[d.getDay()]}, ${d.toLocaleDateString("pt-BR")}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return "sem prazo"
  const d = new Date(iso.length > 10 ? iso : `${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR")
}

function fmtHours(h: number): string {
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)}h`
}

function StatusPill({ name, color }: { name: string | null; color: string | null }) {
  if (!name) return <span className="text-[11px] text-muted-foreground">sem etapa</span>
  const c = color ?? "#6B7280"
  return (
    <span
      className="shrink-0 rounded px-1.5 py-px text-[10px] font-medium"
      style={{ background: `${c}22`, color: c }}
    >
      {name}
    </span>
  )
}

/** Uma US da lista: contexto (projeto · feature), título, etapa e horas/prazo. */
function TaskRow({ task, showHours }: { task: CapacityDayTask; showHours: boolean }) {
  return (
    <li className="flex w-full items-start justify-between gap-3 rounded-md border bg-card px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="break-words text-[11px] text-muted-foreground">
          {task.project_name}
          {task.feature_title ? ` · ${task.feature_title}` : ""}
        </p>
        <p className="break-words text-sm leading-snug">{task.task_title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <StatusPill name={task.status_name} color={task.status_color} />
          <span className="text-[11px] text-muted-foreground">
            prazo {fmtDate(task.due_date)}
          </span>
          {task.days_late != null && (
            <span className="text-[11px] font-medium text-destructive">
              {task.days_late} dia(s) de atraso
            </span>
          )}
          {task.sla_state === "breached" && (
            <span className="text-[11px] font-medium text-destructive">SLA estourado</span>
          )}
          {!showHours && task.in_day && (
            <span className="text-[11px] text-warning">consome {fmtHours(task.hours)} neste dia</span>
          )}
        </div>
      </div>
      {showHours ? (
        <div className="w-14 shrink-0 text-right">
          <span className="block text-sm font-medium tabular-nums">{fmtHours(task.hours)}</span>
          {task.estimated_hours != null && (
            <span className="block text-[10px] text-muted-foreground">
              de {fmtHours(task.estimated_hours)}
            </span>
          )}
          {task.is_overdue && (
            <span className="mt-0.5 inline-block text-[10px] font-medium text-destructive">atrasada</span>
          )}
        </div>
      ) : (
        <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
          {task.estimated_hours != null ? fmtHours(task.estimated_hours) : "—"}
        </span>
      )}
    </li>
  )
}

/**
 * Detalhe da célula do heatmap de carga (clique em pessoa × dia): o que está sendo
 * feito no dia com a etapa de cada US e, abaixo, o snapshot das atrasadas da pessoa.
 */
export function CapacityDayDetailDialog({
  personId,
  date,
  personName,
  onClose,
}: {
  personId: string | null
  date: string | null
  personName?: string
  onClose: () => void
}) {
  const open = Boolean(personId && date)
  const [data, setData] = useState<CapacityDayDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!personId || !date) {
      setData(null)
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    projetosApi.getCapacityDayDetail({ person: personId, date })
      .then((r) => alive && setData(r))
      .catch(() => {
        if (!alive) return
        setData(null)
        setError("Não foi possível carregar o detalhamento deste dia.")
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [personId, date])

  const title = data?.person_name ?? personName ?? "Responsável"

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* DialogContent é grid: os filhos precisam de min-w-0, senão nomes longos de
          projeto/feature esticam a coluna e o painel corta as horas na direita. */}
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-3xl overflow-x-hidden"
        description="Demandas do dia e atrasadas do responsável"
      >
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pr-8">
            <span className="break-words">{title}</span>
            <span className="text-sm font-normal text-muted-foreground">
              · {date ? fmtDay(date) : ""}
            </span>
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Carregando demandas do dia…
          </div>
        )}

        {!loading && error && (
          <p className="py-6 text-center text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && data && (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={data.overallocated ? "destructive" : "secondary"} className="gap-1 font-normal">
                <Clock size={12} />
                {fmtHours(data.allocated_hours)} / {fmtHours(data.capacity_hours)}
              </Badge>
              {data.overallocated && (
                <span className="text-xs font-medium text-destructive">
                  Superlotado — excesso de {fmtHours(Math.max(0, data.allocated_hours - data.capacity_hours))}
                </span>
              )}
              {!data.is_working_day && (
                <span className="text-xs text-muted-foreground">Dia não útil no calendário</span>
              )}
              {data.is_working_day && data.capacity_hours === 0 && (
                <span className="text-xs text-warning">Sem capacidade no dia (ausência aprovada)</span>
              )}
            </div>

            <section className="min-w-0">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <CalendarClock size={12} /> No dia ({data.items.length})
              </p>
              {data.items.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                  Nenhuma User Story alocada neste dia.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {data.items.map((t) => (
                    <TaskRow key={t.task_id} task={t} showHours />
                  ))}
                </ul>
              )}
            </section>

            <section className="min-w-0 border-t pt-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
                <AlertTriangle size={12} /> Atrasadas ({data.overdue.length})
              </p>
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                US em aberto com prazo vencido ou SLA estourado — snapshot de{" "}
                {fmtDate(data.overdue_reference)}, independente do dia selecionado.
              </p>
              {data.overdue.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                  Nenhuma demanda atrasada.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {data.overdue.map((t) => (
                    <TaskRow key={t.task_id} task={t} showHours={false} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
