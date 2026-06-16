import { useEffect, useState } from "react"
import { CalendarRange, FileText, History } from "lucide-react"

import {
  projetosApi,
  type PoPortfolioItem,
  type PriorityQuadrant,
  type PriorityScoreHistoryItem,
  type ProjectDemandFormField,
  type ProjectDemandFormSection,
} from "@/api/projetos"
import { parseFieldOptions } from "@/modules/projetos/FormFieldRenderer"
import { CompletionBadge } from "@/modules/projetos/CompletionBadge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ProjectPriorityWidget } from "./ProjectPriorityWidget"
import { QuadrantBadge } from "./QuadrantBadge"

const HEALTH_COLOR: Record<string, string> = { verde: "#16A34A", amarelo: "#CA8A04", vermelho: "#DC2626" }

function fmtDate(s: string | null): string {
  if (!s) return "—"
  const d = new Date(s)
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

function density(impacto: number, esforco: number): number | null {
  return esforco > 0 ? impacto / esforco : null
}

type SectionWithFields = { section: ProjectDemandFormSection; fields: ProjectDemandFormField[] }

/** Formata o valor de um campo para leitura: resolve opções (select), usuários e tipos comuns. */
function displayValue(field: ProjectDemandFormField, value: unknown, users: { id: string; full_name: string }[]): string | null {
  if (value === null || value === undefined || value === "") return null
  const opts = parseFieldOptions(field)
  const labelOf = (v: string) => opts.find((o) => o.value === v)?.label
    ?? users.find((u) => u.id === v)?.full_name
    ?? v
  if (Array.isArray(value)) {
    const parts = value.map((v) => displayValue(field, v, users)).filter((v): v is string => !!v)
    return parts.length ? parts.join(", ") : null
  }
  if (typeof value === "boolean") return value ? "Sim" : "Não"
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    const named = obj.filename ?? obj.name ?? obj.label
    return typeof named === "string" ? named : null
  }
  return labelOf(String(value))
}

/**
 * Modal de repriorização: cabeçalho do projeto + matriz Impacto×Esforço editável
 * (reusa ProjectPriorityWidget) + histórico de repriorizações. Após salvar, dispara
 * `onSaved` para o pai refazer o fetch do portfólio.
 */
export function ProjectPriorityDialog({
  open,
  onOpenChange,
  item,
  quadrants,
  canScore,
  users = [],
  onSaved,
  onOpenGantt,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  item: PoPortfolioItem | null
  quadrants: PriorityQuadrant[]
  canScore: boolean
  users?: { id: string; full_name: string }[]
  onSaved: () => void
  onOpenGantt: (item: PoPortfolioItem) => void
}) {
  const [history, setHistory] = useState<PriorityScoreHistoryItem[]>([])
  const [savedTick, setSavedTick] = useState(0)
  const [reqSections, setReqSections] = useState<SectionWithFields[]>([])
  const [reqValues, setReqValues] = useState<Record<string, unknown>>({})

  useEffect(() => {
    if (!open || !item) return
    let active = true
    projetosApi.getTaskPriorityHistory(item.task_id)
      .then((h) => active && setHistory(h))
      .catch(() => active && setHistory([]))
    return () => { active = false }
  }, [open, item?.task_id, savedTick])

  // Dados da solicitação: valores preenchidos + definição do formulário do tipo de demanda.
  useEffect(() => {
    if (!open || !item) { setReqSections([]); setReqValues({}); return }
    let active = true
    projetosApi.getTaskFormSubmission(item.project_id, item.task_id)
      .then((sub) => active && setReqValues(sub?.values ?? {}))
      .catch(() => active && setReqValues({}))
    if (item.demand_type_id) {
      projetosApi.listDemandSections(item.demand_type_id, true)
        .then(async (sections) => {
          const withFields = await Promise.all(
            sections.map(async (section) => ({
              section,
              fields: await projetosApi.listDemandFields(item.demand_type_id as string, section.id, true).catch(() => []),
            })),
          )
          if (active) setReqSections(withFields)
        })
        .catch(() => active && setReqSections([]))
    } else {
      setReqSections([])
    }
    return () => { active = false }
  }, [open, item?.task_id, item?.demand_type_id, item?.project_id])

  if (!item) return null

  const dens = item.impacto_efetivo != null && item.esforco != null ? density(item.impacto_efetivo, item.esforco) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: HEALTH_COLOR[item.health] ?? "#6B7280" }}
            />
            {item.title}
            {item.planning_kind === "programa" && <Badge variant="outline" className="text-[10px]">Programa</Badge>}
            <CompletionBadge subtreeTotal={item.subtree_total} subtreeCompleted={item.subtree_completed} progressPct={item.progress_pct} pendingStages={item.pending_stages} />
            {item.quadrant_code && <QuadrantBadge code={item.quadrant_code} quadrants={quadrants} />}
          </DialogTitle>
        </DialogHeader>

        {/* Resumo atual do projeto */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <span>Progresso <strong className="text-foreground">{item.progress_pct}%</strong> ({item.subtree_completed}/{item.subtree_total})</span>
          {item.impacto_efetivo != null && <span>Impacto <strong className="text-foreground">{item.impacto_efetivo.toFixed(2)}</strong></span>}
          {item.esforco != null && <span>Esforço <strong className="text-foreground">{item.esforco.toFixed(2)}</strong></span>}
          {dens != null && <span>Densidade <strong className="text-foreground">{dens.toFixed(2)}×</strong></span>}
          {item.due_date && <span>Prazo <strong className="text-foreground">{fmtDate(item.due_date)}</strong></span>}
        </div>

        {/* Dados da solicitação: descrição + campos preenchidos na "Nova Solicitação" */}
        {(() => {
          const filled = reqSections
            .map(({ section, fields }) => ({
              section,
              rows: fields
                .map((f) => ({ field: f, value: displayValue(f, reqValues[f.field_key], users) }))
                .filter((r) => r.value !== null),
            }))
            .filter((g) => g.rows.length > 0)
          const hasAny = !!item.description || filled.length > 0
          return (
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Solicitação
              </p>
              {!hasAny ? (
                <p className="text-xs text-muted-foreground">Sem dados de solicitação.</p>
              ) : (
                <>
                  {item.description && (
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-semibold text-muted-foreground">Descrição</p>
                      <p className="whitespace-pre-wrap text-sm">{item.description}</p>
                    </div>
                  )}
                  {filled.map(({ section, rows }) => (
                    <div key={section.id} className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</p>
                      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {rows.map(({ field, value }) => (
                          <div key={field.id} className="min-w-0">
                            <dt className="text-[11px] text-muted-foreground">{field.label}</dt>
                            <dd className="truncate text-sm" title={value ?? undefined}>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </>
              )}
            </div>
          )
        })()}

        {/* Matriz editável (ou somente leitura sem permissão) */}
        <ProjectPriorityWidget
          taskId={item.task_id}
          mode={canScore ? "edit" : "view"}
          onSaved={() => { onSaved(); setSavedTick((t) => t + 1) }}
        />

        {/* Histórico de repriorização */}
        <div className="space-y-2 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Histórico de repriorização
          </p>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma repriorização registrada ainda.</p>
          ) : (
            <ol className="space-y-1.5">
              {history.map((h) => {
                const d = density(h.impacto_efetivo, h.esforco)
                return (
                  <li key={h.id} className="flex items-center gap-3 rounded-md border px-3 py-1.5 text-xs">
                    <span className="shrink-0 tabular-nums text-muted-foreground">{fmtDate(h.scored_at)}</span>
                    <QuadrantBadge code={h.quadrant_code} quadrants={quadrants} />
                    <span className="text-muted-foreground">
                      I {h.impacto_efetivo.toFixed(2)} · E {h.esforco.toFixed(2)}
                      {d != null && <> · <span className="font-semibold text-foreground">{d.toFixed(2)}×</span></>}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenGantt(item)} className="gap-1">
            <CalendarRange className="h-4 w-4" /> Abrir cronograma
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
