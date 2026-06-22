import type { ReactNode } from "react"
import { ArrowRight, CalendarClock, GitBranch, ListPlus, ListX, Timer, User, Workflow } from "lucide-react"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { BaselineDiff } from "@/modules/projetos/baselineDiff"

function fmtDay(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

function DeltaTag({ d }: { d?: number }) {
  if (d === undefined) return null
  if (d > 0) return <Badge variant="destructive">+{d}d</Badge>
  if (d < 0) return <Badge variant="success">{d}d</Badge>
  return <Badge variant="secondary">0d</Badge>
}

function Section({ icon, title, count, children }: { icon: ReactNode; title: string; count: number; children: ReactNode }) {
  if (count === 0) return null
  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm font-medium">
        {icon} {title} <Badge variant="secondary" className="ml-auto">{count}</Badge>
      </div>
      <div className="divide-y">{children}</div>
    </div>
  )
}

function Row({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="truncate" title={title}>{title}</span>
      {children && <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{children}</span>}
    </div>
  )
}

export function BaselineAlertsDialog({
  open, onOpenChange, diff, version,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  diff: BaselineDiff | null
  version: number
}) {
  if (!diff) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Alterações desde o baseline v{version} · {diff.total}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto">
          {diff.total === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma diferença em relação ao baseline selecionado.</p>
          )}

          <Section icon={<CalendarClock size={15} />} title="Prazo (fim) alterado" count={diff.dueChanges.length}>
            {diff.dueChanges.map((c) => (
              <Row key={c.task_id} title={c.title}>
                {fmtDay(c.from)} <ArrowRight size={12} /> {fmtDay(c.to)} <DeltaTag d={c.deltaDays} />
              </Row>
            ))}
          </Section>

          <Section icon={<CalendarClock size={15} />} title="Início alterado" count={diff.startChanges.length}>
            {diff.startChanges.map((c) => (
              <Row key={c.task_id} title={c.title}>
                {fmtDay(c.from)} <ArrowRight size={12} /> {fmtDay(c.to)} <DeltaTag d={c.deltaDays} />
              </Row>
            ))}
          </Section>

          <Section icon={<User size={15} />} title="Responsável alterado" count={diff.assigneeChanges.length}>
            {diff.assigneeChanges.map((c) => (
              <Row key={c.task_id} title={c.title}>
                {c.fromName ?? "—"} <ArrowRight size={12} /> {c.toName ?? "—"}
              </Row>
            ))}
          </Section>
          {diff.assigneeUnavailable && (
            <p className="px-1 text-xs text-muted-foreground">
              O responsável não foi capturado neste baseline (salvo antes deste recurso) — alertas de troca de
              responsável aparecem a partir dos próximos baselines.
            </p>
          )}

          <Section icon={<ListPlus size={15} />} title="Tarefas inseridas" count={diff.inserted.length}>
            {diff.inserted.map((t) => <Row key={t.task_id} title={t.title} />)}
          </Section>

          <Section icon={<ListX size={15} />} title="Tarefas removidas" count={diff.removed.length}>
            {diff.removed.map((t) => <Row key={t.task_id} title={t.title} />)}
          </Section>

          <Section icon={<Timer size={15} />} title="Esforço (horas) alterado" count={diff.hoursChanges.length}>
            {diff.hoursChanges.map((c) => (
              <Row key={c.task_id} title={c.title}>
                {c.from ?? "—"}h <ArrowRight size={12} /> {c.to ?? "—"}h
              </Row>
            ))}
          </Section>

          <Section icon={<Workflow size={15} />} title="Etapa alterada" count={diff.statusChanges.length}>
            {diff.statusChanges.map((c) => (
              <Row key={c.task_id} title={c.title}>
                {c.from ?? "—"} <ArrowRight size={12} /> {c.to ?? "—"}
              </Row>
            ))}
          </Section>

          <Section icon={<GitBranch size={15} />} title="Dependências adicionadas" count={diff.depsAdded.length}>
            {diff.depsAdded.map((d, i) => <Row key={i} title={`${d.predTitle} → ${d.succTitle}`} />)}
          </Section>

          <Section icon={<GitBranch size={15} />} title="Dependências removidas" count={diff.depsRemoved.length}>
            {diff.depsRemoved.map((d, i) => <Row key={i} title={`${d.predTitle} → ${d.succTitle}`} />)}
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
