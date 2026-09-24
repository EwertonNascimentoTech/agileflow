import { useEffect, useState, type ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import { AlertTriangle, ArrowLeft, Check, FolderKanban, Headset, PauseCircle } from "lucide-react"

import { portalOccurrencesApi, type ClientProjectFeature, type ClientProjectReport, type ProjectPhase } from "@/api/clientes"
import { EmptyState } from "@/components/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorDetail, fmtRelative } from "@/modules/portal/occurrenceUi"

/** Fases do projeto (mesma régua do PO Sync). Impedimento fica fora da régua: vira aviso. */
const PHASES: { key: ProjectPhase; label: string }[] = [
  { key: "planejamento", label: "Planejamento" },
  { key: "desenvolvimento", label: "Desenvolvimento" },
  { key: "homologacao", label: "Homologação" },
  { key: "producao", label: "Produção" },
  { key: "concluido", label: "Concluído" },
]

const FEATURE_STATE: Record<ClientProjectFeature["state"], { label: string; cls: string }> = {
  a_iniciar: { label: "A iniciar", cls: "bg-muted text-muted-foreground" },
  andamento: { label: "Em andamento", cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  validacao: { label: "Em validação", cls: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" },
  ajuste: { label: "Em ajuste", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  concluida: { label: "Concluída", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-primary" />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function PhaseStepper({ phase }: { phase: ProjectPhase }) {
  const current = Math.max(0, PHASES.findIndex((p) => p.key === phase))
  const lastDone = phase === "concluido"
  return (
    <ol className="flex w-full items-start">
      {PHASES.map((step, i) => {
        const done = i < current || (lastDone && i === current)
        const active = i === current && !lastDone
        return (
          <li key={step.key} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                className={`absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2 ${i <= current ? "bg-primary" : "bg-border"}`}
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary bg-background text-primary"
                    : "border-border bg-background text-muted-foreground"
              }`}
            >
              {done ? <Check size={13} strokeWidth={3} /> : i + 1}
            </span>
            <span className={`mt-1.5 px-1 text-[11px] leading-tight ${active || done ? "font-medium text-foreground" : "text-muted-foreground"}`}>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Andamento do projeto para o cliente: fase, execução, prazos e as Features (entregas). */
export default function ClientProjectPage() {
  const { id } = useParams<{ id: string }>()
  const [report, setReport] = useState<ClientProjectReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    portalOccurrencesApi
      .projectReport(id)
      .then((r) => { setReport(r); setError(null) })
      .catch((err) => { setReport(null); setError(apiErrorDetail(err, "Não foi possível carregar o projeto.")) })
      .finally(() => setLoading(false))
  }, [id])

  const back = (
    <Link to="/portal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft size={14} /> Meus projetos
    </Link>
  )

  if (loading) {
    return (
      <div className="space-y-5">
        {back}
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }
  if (!report) {
    return (
      <div className="space-y-5">
        {back}
        <div className="rounded-xl border bg-card">
          <EmptyState icon={FolderKanban} title="Projeto indisponível" description={error ?? "Projeto não encontrado."} />
        </div>
      </div>
    )
  }

  const exec = report.exec_pct != null ? Math.round(report.exec_pct) : null
  const features = report.features
  const done = features.filter((f) => f.state === "concluida").length
  const next = features.filter((f) => f.state !== "concluida" && f.due_date).slice(0, 3)

  return (
    <div className="space-y-5">
      {back}

      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {report.planning_kind === "programa" ? "Programa" : "Projeto"}
              {report.my_role_label && <> · você é <span className="text-foreground">{report.my_role_label}</span></>}
            </div>
            <h1 className="mt-1 text-xl font-bold leading-snug md:text-2xl">{report.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {report.po_name && <>Product Owner: <span className="font-medium text-foreground">{report.po_name}</span> · </>}
              Atualizado {fmtRelative(report.updated_at)}
            </p>
          </div>
          {exec != null && (
            <div className="text-right">
              <div className="text-3xl font-bold tabular-nums">{exec}%</div>
              <div className="text-[11px] text-muted-foreground">de execução</div>
            </div>
          )}
        </div>

        {exec != null && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, exec))}%` }} />
          </div>
        )}

        <PhaseStepper phase={report.phase === "impedimento" ? "desenvolvimento" : report.phase} />

        {report.phase === "impedimento" && (
          <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle size={15} /> O projeto está com um impedimento. O Product Owner está tratando.
          </p>
        )}
        {report.paused && (
          <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            <PauseCircle size={15} /> O projeto está pausado no momento.
          </p>
        )}
        {report.in_assisted_operation && (
          <p className="flex items-center gap-2 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-200">
            <Headset size={15} /> Entregue e em Operação Assistida: você pode abrir ocorrências deste projeto.
          </p>
        )}

        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Etapa atual</dt>
            <dd className="mt-0.5 font-medium">{report.stage_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Início</dt>
            <dd className="mt-0.5 font-medium">{fmtDate(report.start_date)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {report.completed_at ? "Concluído em" : "Previsão de entrega"}
            </dt>
            <dd className="mt-0.5 font-medium">{fmtDate(report.completed_at ?? report.due_date)}</dd>
          </div>
        </dl>
      </section>

      {next.length > 0 && (
        <Card title="Próximas entregas">
          <ul className="divide-y">
            {next.map((f) => (
              <li key={`${f.title}-${f.due_date}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate font-medium">{f.title}</span>
                <span className="shrink-0 text-muted-foreground">{fmtDate(f.due_date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`Entregas do projeto (${done}/${features.length} concluídas)`}>
        {features.length === 0 ? (
          <p className="text-sm text-muted-foreground">O cronograma de entregas ainda está sendo montado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Entrega</th>
                  <th className="py-2 pr-3 font-semibold">Situação</th>
                  <th className="py-2 pr-3 font-semibold">Início</th>
                  <th className="py-2 pr-3 font-semibold">Previsão</th>
                  <th className="py-2 font-semibold">Histórias</th>
                </tr>
              </thead>
              <tbody>
                {features.map((f) => {
                  const st = FEATURE_STATE[f.state]
                  return (
                    <tr key={`${f.title}-${f.start_date}-${f.due_date}`} className="border-b last:border-b-0">
                      <td className="py-2 pr-3 font-medium">{f.title}</td>
                      <td className="py-2 pr-3">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">{fmtDate(f.start_date)}</td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">{fmtDate(f.due_date)}</td>
                      <td className="py-2 tabular-nums text-muted-foreground">{f.us_total ? `${f.us_done}/${f.us_total}` : "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
