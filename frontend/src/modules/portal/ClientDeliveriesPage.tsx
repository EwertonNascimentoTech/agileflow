import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Box, CheckCircle2, Flag } from "lucide-react"

import { portalPortfolioApi, type PortalDelivery } from "@/api/portalPortfolio"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { apiErrorDetail } from "@/modules/portal/occurrenceUi"
import { Card, ItemStatusBadge, Segmented } from "@/modules/portal/portfolioUi"
import { fmtDate, usePortalBase } from "@/modules/portal/portfolioMeta"

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

function monthLabel(iso: string): string {
  const [y, m] = iso.slice(0, 7).split("-").map(Number)
  return `${MONTHS[m - 1]} de ${y}`
}

function DeliveryList({ items, empty }: { items: PortalDelivery[]; empty: string }) {
  const base = usePortalBase()
  if (items.length === 0) return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{empty}</p>
  const groups = new Map<string, PortalDelivery[]>()
  for (const it of items) groups.set(it.date.slice(0, 7), [...(groups.get(it.date.slice(0, 7)) ?? []), it])
  return (
    <div className="divide-y">
      {Array.from(groups.entries()).map(([month, list]) => (
        <section key={month} className="px-5 py-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{monthLabel(`${month}-01`)}</h3>
          <ul className="space-y-1">
            {list.map((it) => {
              const Icon = it.kind === "projeto" ? Flag : it.done ? CheckCircle2 : Box
              return (
                <li key={`${it.kind}-${it.id}`}>
                  <Link
                    to={`${base}/projetos/${it.task_id}`}
                    className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                  >
                    <span className="w-24 shrink-0 text-sm tabular-nums text-muted-foreground">{fmtDate(it.date)}</span>
                    <Icon size={16} className={`shrink-0 ${it.kind === "projeto" ? "text-blue-600" : it.done ? "text-emerald-600" : "text-violet-500"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {it.code && <span className="mr-1.5 text-muted-foreground">{it.code}</span>}
                        {it.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {it.project_title}{it.program_name ? ` · ${it.program_name}` : ""}
                      </span>
                    </span>
                    <ItemStatusBadge value={it.status} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Entregas e Marcos: o que vem pela frente e o que foi entregue nos últimos meses. */
export default function ClientDeliveriesPage() {
  const [items, setItems] = useState<PortalDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<"proximas" | "entregues">("proximas")

  useEffect(() => {
    portalPortfolioApi
      .deliveries()
      .then((r) => setItems(r.items))
      .catch((err) => setError(apiErrorDetail(err, "Não foi possível carregar as entregas.")))
      .finally(() => setLoading(false))
  }, [])

  const upcoming = useMemo(() => items.filter((i) => !i.done), [items])
  const done = useMemo(() => items.filter((i) => i.done).reverse(), [items])
  const late = upcoming.filter((i) => i.status === "atrasado").length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Entregas e Marcos</h1>
          <p className="text-sm text-muted-foreground">
            Entregas (Features) previstas e concluídas nos projetos que você acompanha, e a data de entrega de cada projeto.
          </p>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "proximas", label: `Próximas (${upcoming.length})` },
            { value: "entregues", label: `Entregues (${done.length})` },
          ]}
        />
      </div>
      {loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : error ? (
        <Card><EmptyState icon={Flag} title="Entregas indisponíveis" description={error} /></Card>
      ) : (
        <Card>
          {tab === "proximas" && late > 0 && (
            <p className="border-b bg-red-50 px-5 py-2.5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {late === 1 ? "1 entrega passou do prazo previsto." : `${late} entregas passaram do prazo previsto.`}
            </p>
          )}
          {tab === "proximas" ? (
            <DeliveryList items={upcoming} empty="Nenhuma entrega prevista." />
          ) : (
            <DeliveryList items={done} empty="Nenhuma entrega nos últimos 4 meses." />
          )}
        </Card>
      )}
    </div>
  )
}
