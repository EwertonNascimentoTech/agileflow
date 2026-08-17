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
import { KpiCard } from "@/components/KpiCard"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

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
      <Badge
        variant={ok ? "success" : "outline"}
        className={`font-normal gap-1 ${hasItems ? "cursor-default" : ""}`}
      >
        {label}{count > 0 ? ` ${count}` : ""}
      </Badge>
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
      <p className="py-3 text-sm text-muted-foreground">
        Nenhum projeto/programa concluído neste período.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Projeto / Programa</th>
            <th className="px-3 py-2 font-medium">PO</th>
            <th className="px-3 py-2 font-medium">Produto</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">Concluído em</th>
            <th className="px-3 py-2 font-medium">Vínculos</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b last:border-b-0 align-top">
              <td className="px-3 py-2">
                <div className="font-medium">{it.title}</div>
                {it.planning_kind && (
                  <div className="text-xs text-muted-foreground capitalize">{it.planning_kind}</div>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{it.po_name ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{it.product_name ?? "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                {fmtDateTime(it.completed_at)}
              </td>
              <td className="px-3 py-2">
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
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">User Story</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">Prazo</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">Saiu do backlog</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">
              {mode === "delivered" ? "Concluída em" : "Concluída em"}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b last:border-b-0">
              <td className="px-3 py-2">
                <div className="flex items-start gap-2">
                  {it.is_overdue && mode === "overdue" && (
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />
                  )}
                  <span className="font-medium">{it.title}</span>
                </div>
              </td>
              <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${it.is_overdue && mode === "overdue" ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {fmtDate(it.due_date)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                {fmtDateTime(it.left_backlog_at)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{group.assignee_name}</CardTitle>
          <div className="flex gap-2">
            <Badge variant="secondary" className="font-normal gap-1">
              <CheckCircle2 size={12} /> {group.delivered_count} entregue{group.delivered_count !== 1 ? "s" : ""}
            </Badge>
            <Badge
              variant={group.overdue_count > 0 ? "destructive" : "outline"}
              className="font-normal gap-1"
            >
              <AlertTriangle size={12} /> {group.overdue_count} atrasada{group.overdue_count !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            US no período
          </h4>
          <UsTable items={group.delivered} mode="delivered" />
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            US atrasadas
          </h4>
          <UsTable items={group.overdue} mode="overdue" />
        </div>
      </CardContent>
    </Card>
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
  const kpis = data?.project_kpis ?? { total: 0, com_servicos: 0, com_processos_e_documentos: 0 }
  const projects = data?.project_deliveries ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Entregas</h3>
          <p className="text-sm text-muted-foreground">
            Projetos concluídos no período (com vínculos de produto) e User Stories por responsável.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Período</label>
            <Select value={period} onValueChange={(v) => setPeriod(v as UsDeliveryPeriod)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Responsável (US)</label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {(data?.available_assignees ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!loading && error && (
        <EmptyState icon={AlertTriangle} title="Erro ao carregar" description={error} />
      )}

      {!loading && !error && data && (
        <>
          {/* ── Entregas = projetos ── */}
          <section className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold">Entregas (projetos)</h4>
              <p className="text-xs text-muted-foreground">
                Projetos e programas concluídos em {periodLabel.toLowerCase()} · vínculos com o portfólio de produtos.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiCard
                label="Projetos entregues"
                value={kpis.total}
                icon={FolderKanban}
                sub={`Período: ${periodLabel}`}
              />
              <KpiCard
                label="Com serviços vinculados"
                value={kpis.com_servicos}
                icon={GitBranch}
                sub={kpis.total > 0 ? `${Math.round((kpis.com_servicos / kpis.total) * 100)}% das entregas` : "sem entregas"}
              />
              <KpiCard
                label="Com processos e documentos"
                value={kpis.com_processos_e_documentos}
                icon={FileText}
                sub={kpis.total > 0 ? `${Math.round((kpis.com_processos_e_documentos / kpis.total) * 100)}% das entregas` : "sem entregas"}
              />
            </div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Lista de entregas</CardTitle>
                <CardDescription>
                  Indicadores: serviços do produto · processos (sub-processos do portfólio) · documentos cadastrados.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProjectDeliveriesTable items={projects} />
              </CardContent>
            </Card>
          </section>

          {/* ── User Stories ── */}
          <section className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold">User Stories por responsável</h4>
              <p className="text-xs text-muted-foreground">
                O que foi concluído no período, US atrasadas, saída do backlog e conclusão.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>US entregues</CardDescription>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-600" />
                    {usTotals.delivered}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>US atrasadas</CardDescription>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle size={18} className={usTotals.overdue > 0 ? "text-destructive" : "text-muted-foreground"} />
                    {usTotals.overdue}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            {data.by_assignee.length === 0 ? (
              <EmptyState
                icon={PackageCheck}
                title="Nenhuma US neste recorte"
                description="Não há User Stories entregues neste período nem atrasadas para o filtro escolhido."
              />
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
