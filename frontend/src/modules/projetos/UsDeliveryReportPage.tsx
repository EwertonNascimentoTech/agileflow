import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FolderKanban,
  GitBranch,
  PackageCheck,
} from "lucide-react"

import {
  projetosApi,
  type ProjectDeliveryItem,
  type UsDeliveryAssigneeGroup,
  type UsDeliveryItem,
  type UsDeliveryPeriod,
  type UsDeliveryReport,
} from "@/api/projetos"
import { EmptyState } from "@/components/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, FilterSelect, KpiCount, KpiRow, Pill, SectionCard, TABLE } from "@/components/ds"

const ALL = "__all__"

const PERIOD_OPTS: { value: UsDeliveryPeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "tomorrow", label: "Amanhã" },
  { value: "this_week", label: "Essa semana" },
  { value: "next_week", label: "Próxima semana" },
  { value: "last_month", label: "Mês passado" },
  { value: "this_month", label: "Mês atual" },
  { value: "next_month", label: "Próximo mês" },
]

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function LinkBadge({
  ok,
  label,
  count,
  items,
}: {
  ok: boolean
  label: string
  count: number
  items: { name: string; item_date: string | null }[]
}) {
  const hasItems = items.length > 0
  const titleText = hasItems
    ? items.map((it) => (it.item_date ? `${it.name} — ${fmtDate(it.item_date)}` : it.name)).join("\n")
    : undefined
  return (
    <span className="relative inline-flex group/link" title={titleText}>
      <Pill tone={ok ? "emerald" : "slate"} className={hasItems ? "cursor-default" : ""}>
        {label} {count}
      </Pill>
      {hasItems && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden w-max max-w-[300px] rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md group-hover/link:block"
        >
          <ul className="space-y-1 text-left">
            {items.map((it, idx) => (
              <li key={`${it.name}-${idx}`} className="leading-snug">
                <span className="font-medium">{it.name}</span>
                {it.item_date && (
                  <span className="text-muted-foreground"> · {fmtDate(it.item_date)}</span>
                )}
              </li>
            ))}
          </ul>
        </span>
      )}
    </span>
  )
}

function ProjectDeliveriesTable({ items }: { items: ProjectDeliveryItem[] }) {
  if (items.length === 0) {
    return (
      <p className="px-5 py-4 text-sm text-muted-foreground">
        Nenhum projeto/programa concluído neste período.
      </p>
    )
  }
  return (
    <div className={TABLE.wrap}>
      <table className={TABLE.table}>
        <thead className={TABLE.thead}>
          <tr>
            <th className={TABLE.thFirst}>Projeto / Programa</th>
            <th className={TABLE.th}>PO</th>
            <th className={TABLE.th}>Produto</th>
            <th className={`${TABLE.th} whitespace-nowrap`}>Entregue em</th>
            <th className={`${TABLE.th} pr-4`}>Vínculos</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className={`${TABLE.tr} align-top`}>
              <td className={TABLE.tdFirst}>
                <div className="font-medium">{it.title}</div>
                {it.em_operacao_assistida && (
                  <Pill tone="teal" className="mt-0.5">Em operação assistida</Pill>
                )}
                {it.planning_kind && (
                  <div className="text-xs text-muted-foreground capitalize">{it.planning_kind}</div>
                )}
              </td>
              <td className={`${TABLE.td} text-muted-foreground`}>{it.po_name ?? "—"}</td>
              <td className={`${TABLE.td} text-muted-foreground`}>{it.product_name ?? "—"}</td>
              <td className={`${TABLE.td} whitespace-nowrap tabular-nums text-muted-foreground`}>
                {fmtDateTime(it.completed_at)}
              </td>
              <td className={`${TABLE.td} pr-4`}>
                <div className="flex flex-wrap gap-1">
                  <LinkBadge
                    ok={it.has_servicos}
                    label="Serviços"
                    count={it.servicos_count}
                    items={it.servicos ?? []}
                  />
                  <LinkBadge
                    ok={it.has_processos}
                    label="Processos"
                    count={it.processos_count}
                    items={it.processos ?? []}
                  />
                  <LinkBadge
                    ok={it.has_documentos}
                    label="Docs"
                    count={it.documentos_count}
                    items={it.documentos ?? []}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UsTable({ items, mode }: { items: UsDeliveryItem[]; mode: "delivered" | "overdue" }) {
  if (items.length === 0) {
    return (
      <p className="py-3 text-sm text-muted-foreground">
        {mode === "delivered" ? "Nenhuma US entregue neste período." : "Nenhuma US atrasada."}
      </p>
    )
  }
  return (
    <div className={`${TABLE.wrap} rounded-xl border`}>
      <table className={TABLE.table}>
        <thead className={TABLE.thead}>
          <tr>
            <th className={TABLE.thFirst}>User Story</th>
            <th className={`${TABLE.th} whitespace-nowrap`}>Prazo</th>
            <th className={`${TABLE.th} whitespace-nowrap`}>Saiu do backlog</th>
            <th className={`${TABLE.th} whitespace-nowrap pr-4`}>
              {mode === "delivered" ? "Concluída em" : "Concluída em"}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className={TABLE.tr}>
              <td className={TABLE.tdFirst}>
                <div className="flex items-start gap-2">
                  {it.is_overdue && mode === "overdue" && (
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />
                  )}
                  <span className="font-medium">{it.title}</span>
                </div>
              </td>
              <td className={`${TABLE.td} whitespace-nowrap tabular-nums ${it.is_overdue && mode === "overdue" ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {fmtDate(it.due_date)}
              </td>
              <td className={`${TABLE.td} whitespace-nowrap tabular-nums text-muted-foreground`}>
                {fmtDateTime(it.left_backlog_at)}
              </td>
              <td className={`${TABLE.td} whitespace-nowrap tabular-nums text-muted-foreground pr-4`}>
                {fmtDateTime(it.completed_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AssigneeSection({ group }: { group: UsDeliveryAssigneeGroup }) {
  return (
    <SectionCard
      title={group.assignee_name}
      right={
        <div className="flex gap-2">
          <Pill tone={group.delivered_count > 0 ? "emerald" : "slate"}>
            <CheckCircle2 size={12} /> {group.delivered_count} entregue{group.delivered_count !== 1 ? "s" : ""}
          </Pill>
          <Pill tone={group.overdue_count > 0 ? "red" : "slate"}>
            <AlertTriangle size={12} /> {group.overdue_count} atrasada{group.overdue_count !== 1 ? "s" : ""}
          </Pill>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <h4 className="mb-2 text-sm font-semibold">
            US no período
          </h4>
          <UsTable items={group.delivered} mode="delivered" />
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">
            US atrasadas
          </h4>
          <UsTable items={group.overdue} mode="overdue" />
        </div>
      </div>
    </SectionCard>
  )
}

export default function UsDeliveryReportPage() {
  const [period, setPeriod] = useState<UsDeliveryPeriod>("today")
  const [assignee, setAssignee] = useState(ALL)
  const [data, setData] = useState<UsDeliveryReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    projetosApi
      .getUsDeliveryReport({
        period,
        assignee: assignee === ALL ? null : assignee,
      })
      .then((r) => {
        if (alive) setData(r)
      })
      .catch(() => {
        if (alive) {
          setData(null)
          setError("Não foi possível carregar o relatório de entregas.")
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [period, assignee])

  const usTotals = useMemo(() => {
    if (!data) return { delivered: 0, overdue: 0 }
    return data.by_assignee.reduce(
      (acc, g) => ({
        delivered: acc.delivered + g.delivered_count,
        overdue: acc.overdue + g.overdue_count,
      }),
      { delivered: 0, overdue: 0 },
    )
  }, [data])

  const periodLabel = PERIOD_OPTS.find((p) => p.value === period)?.label ?? period
  const kpis = data?.project_kpis ?? {
    total: 0,
    com_servicos: 0,
    com_processos_e_documentos: 0,
    servicos_no_mes: 0,
    processos_no_mes: 0,
    documentos_no_mes: 0,
  }
  const projects = data?.project_deliveries ?? []


  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Entregas</h2>
        <p className="text-sm text-muted-foreground">
          Projetos concluídos no período (com vínculos de produto) e User Stories por responsável.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label="Período"
            value={period}
            onChange={(v) => setPeriod(v as UsDeliveryPeriod)}
            options={PERIOD_OPTS}
          />
          <FilterSelect
            label="Responsável (US)"
            value={assignee}
            onChange={setAssignee}
            options={[
              { value: ALL, label: "Todos" },
              ...(data?.available_assignees ?? []).map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>
      </Card>

      {loading && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)}
          </div>
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      )}

      {!loading && error && (
        <Card>
          <EmptyState icon={AlertTriangle} title="Erro ao carregar" description={error} />
        </Card>
      )}

      {!loading && !error && data && (
        <>
          {/* ── Entregas = projetos ── */}
          <section className="space-y-3">
            <div>
              <h3 className="text-base font-semibold">Entregas (projetos)</h3>
              <p className="text-sm text-muted-foreground">
                Só entra o card de Projetos e Programas na etapa Concluído. US/Features prontas com o projeto em Impedimento não contam.
              </p>
            </div>
            <KpiRow className="sm:grid-cols-3">
              <KpiCount
                icon={FolderKanban}
                value={kpis.total}
                label={`Projetos entregues · Período: ${periodLabel}`}
              />
              <KpiCount
                icon={GitBranch}
                value={kpis.com_servicos}
                label={`Com serviços vinculados · ${kpis.total > 0 ? `${Math.round((kpis.com_servicos / kpis.total) * 100)}% das entregas` : "sem entregas"}`}
                tone="emerald"
              />
              <KpiCount
                icon={FileText}
                value={kpis.com_processos_e_documentos}
                label={`Com processos e documentos · ${kpis.total > 0 ? `${Math.round((kpis.com_processos_e_documentos / kpis.total) * 100)}% das entregas` : "sem entregas"}`}
                tone="violet"
              />
            </KpiRow>
            <SectionCard
              title="Lista de entregas"
              subtitle="Tags = serviços, processos e documentos com data no mesmo mês da conclusão do projeto."
              flush
            >
              <div className="flex flex-wrap items-center gap-1.5 border-b px-5 py-3">
                <Pill tone="emerald">
                  Serviços {kpis.servicos_no_mes}
                </Pill>
                <Pill tone="emerald">
                  Processos {kpis.processos_no_mes}
                </Pill>
                <Pill tone="emerald">
                  Docs {kpis.documentos_no_mes}
                </Pill>
                <span className="text-xs text-muted-foreground">
                  entregues no mês da conclusão (soma das linhas)
                </span>
              </div>
              <ProjectDeliveriesTable items={projects} />
            </SectionCard>
          </section>

          {/* ── User Stories ── */}
          <section className="space-y-3">
            <div>
              <h3 className="text-base font-semibold">User Stories por responsável</h3>
              <p className="text-sm text-muted-foreground">
                O que foi concluído no período, US atrasadas, saída do backlog e conclusão.
              </p>
            </div>
            <KpiRow className="sm:grid-cols-2">
              <KpiCount icon={CheckCircle2} value={usTotals.delivered} label="US entregues" tone="emerald" />
              <KpiCount
                icon={AlertTriangle}
                value={usTotals.overdue}
                label="US atrasadas"
                tone={usTotals.overdue > 0 ? "red" : "slate"}
                highlight={usTotals.overdue > 0}
              />
            </KpiRow>

            {data.by_assignee.length === 0 ? (
              <Card>
                <EmptyState
                  icon={PackageCheck}
                  title="Nenhuma US neste recorte"
                  description="Não há User Stories entregues neste período nem atrasadas para o filtro escolhido."
                />
              </Card>
            ) : (
              <div className="space-y-4">
                {data.by_assignee.map((g) => (
                  <AssigneeSection key={g.assignee_id ?? "__none__"} group={g} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
