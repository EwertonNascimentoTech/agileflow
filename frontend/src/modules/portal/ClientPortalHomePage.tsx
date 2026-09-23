import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, CheckCircle2, CircleDot, FolderKanban, Hourglass, LifeBuoy, Plus } from "lucide-react"

import { portalOccurrencesApi, type OccurrenceSummary, type PortalProject } from "@/api/clientes"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/EmptyState"
import { useAuth } from "@/contexts/AuthContext"
import { PriorityBadge, StageBadge, needsMyAction, occTitle, plural, stageHint } from "@/modules/portal/occurrenceUi"

const HERO_BG =
  "radial-gradient(120% 140% at 100% 0%, hsl(var(--accent)) 0%, hsl(var(--brand-500)) 45%, hsl(var(--brand-900)) 100%)"

function Kpi({
  to,
  label,
  value,
  icon: Icon,
  tone,
}: {
  to: string
  label: string
  value: number
  icon: typeof LifeBuoy
  tone: "amber" | "blue" | "emerald" | "slate"
}) {
  const toneClass = {
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  }[tone]
  const highlight = tone === "amber" && value > 0
  return (
    <Link
      to={to}
      className={`group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 ${
        highlight ? "border-amber-300 ring-1 ring-amber-200 dark:border-amber-700 dark:ring-amber-900" : ""
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-none tabular-nums">{value}</span>
        <span className="mt-1 block text-xs leading-tight text-muted-foreground group-hover:text-foreground">{label}</span>
      </span>
    </Link>
  )
}

/** Início do Portal: o que depende do cliente, números das ocorrências e os projetos que ele acompanha. */
export default function ClientPortalHomePage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<PortalProject[]>([])
  const [occurrences, setOccurrences] = useState<OccurrenceSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      portalOccurrencesApi.projects().catch(() => [] as PortalProject[]),
      portalOccurrencesApi.list().catch(() => [] as OccurrenceSummary[]),
    ])
      .then(([ps, os]) => {
        setProjects(ps)
        setOccurrences(os)
      })
      .finally(() => setLoading(false))
  }, [])

  const firstName = (user?.full_name ?? "").trim().split(/\s+/)[0] || "cliente"
  const canOpen = projects.some((p) => p.accepts_occurrences)
  const openable = projects.filter((p) => p.accepts_occurrences)
  const newHref = openable.length === 1 ? `/portal/ocorrencias/nova?projeto=${openable[0].task_id}` : "/portal/ocorrencias/nova"

  const stats = useMemo(() => {
    const mine = occurrences.filter((o) => o.opened_by_me)
    return {
      action: occurrences.filter(needsMyAction),
      open: mine.filter((o) => !o.is_closed).length,
      closed: mine.filter((o) => o.is_closed).length,
    }
  }, [occurrences])

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl p-6 text-white shadow-sm md:p-8" style={{ background: HERO_BG }}>
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(hsl(0 0% 100% / .15) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / .15) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <p className="text-sm text-white/75">Olá, {firstName}</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight md:text-3xl">Como podemos ajudar hoje?</h1>
            <p className="mt-2 text-sm text-white/80">
              Abra ocorrências nos projetos em Operação Assistida e acompanhe o atendimento do time por aqui.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canOpen && (
              <Button asChild className="gap-1.5 bg-white text-primary hover:bg-white/90">
                <Link to={newHref}>
                  <Plus size={15} /> Abrir ocorrência
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" className="gap-1.5 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link to="/portal/ocorrencias?minhas=1">Minhas ocorrências</Link>
            </Button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[74px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi to="/portal/ocorrencias?minhas=1&situacao=acao" label="Aguardando você" value={stats.action.length} icon={Hourglass} tone="amber" />
          <Kpi to="/portal/ocorrencias?minhas=1" label="Minhas em aberto" value={stats.open} icon={CircleDot} tone="blue" />
          <Kpi to="/portal/ocorrencias?minhas=1&situacao=encerradas" label="Minhas resolvidas" value={stats.closed} icon={CheckCircle2} tone="emerald" />
          <Kpi to="/portal/ocorrencias" label="Projetos em Operação Assistida" value={openable.length} icon={FolderKanban} tone="slate" />
        </div>
      )}

      {!loading && stats.action.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Precisa da sua atenção</h2>
          <ul className="divide-y overflow-hidden rounded-xl border border-amber-200 bg-card shadow-sm dark:border-amber-900">
            {stats.action.map((o) => (
              <li key={o.task_id}>
                <Link
                  to={`/portal/ocorrencias/${o.task_id}`}
                  className="flex flex-col gap-2 p-4 transition-colors hover:bg-amber-50/60 dark:hover:bg-amber-950/20 sm:flex-row sm:items-center"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground">{o.code_label}</span>
                      <PriorityBadge value={o.prioridade} />
                      <StageBadge stageKey={o.stage_key} name={o.stage_name} mine={o.opened_by_me} />
                    </span>
                    <span className="mt-1 block truncate font-medium">{occTitle(o)}</span>
                    <span className="block text-xs text-muted-foreground">{stageHint(o.stage_key, true)}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 self-start rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground sm:self-center">
                    {o.stage_key === "homologando" ? "Validar solução" : "Responder"} <ArrowRight size={13} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">Meus projetos</h2>
          {!loading && projects.length > 0 && (
            <span className="text-xs text-muted-foreground">{plural(projects.length, "projeto", "projetos")}</span>
          )}
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState
              icon={FolderKanban}
              title="Nenhum projeto vinculado"
              description="Peça ao Product Owner do seu projeto para vincular o seu cadastro."
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <div key={p.task_id} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FolderKanban size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-snug">{p.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {p.planning_kind && <span className="capitalize">{p.planning_kind}</span>}
                      {p.status_name && <span className="rounded bg-muted px-1.5 py-0.5">{p.status_name}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  {p.accepts_occurrences ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> Aceitando ocorrências
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Não aceita novas ocorrências
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {p.open_occurrences > 0 ? plural(p.open_occurrences, "ocorrência em aberto", "ocorrências em aberto") : "Nenhuma ocorrência em aberto"}
                  </span>
                </div>

                <div className="mt-auto flex flex-wrap gap-2 border-t pt-4">
                  {p.accepts_occurrences && (
                    <Button asChild size="sm" className="gap-1.5">
                      <Link to={`/portal/ocorrencias/nova?projeto=${p.task_id}`}>
                        <Plus size={14} /> Abrir ocorrência
                      </Link>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="ghost" className="gap-1">
                    <Link to={`/portal/ocorrencias?projeto=${p.task_id}`}>
                      Ver ocorrências <ArrowRight size={13} />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  )
}
