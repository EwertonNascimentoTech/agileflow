import { useCallback, useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react"
import {
  AlertTriangle, ChevronDown, GitBranch, GitCommitHorizontal, Package, RefreshCw, Users,
} from "lucide-react"
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

import {
  reposApi,
  type CommitFilters,
  type RepoCommitPage,
  type RepoOverview,
} from "@/api/produtos"
import { EmptyState } from "@/components/EmptyState"
import {
  Card, DetailTabs, FilterSelect, KpiRow, Notice, PageHeader, Pill, SectionCard, TABLE, type KpiTone, type TabDef,
} from "@/components/ds"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RepositoriosConfigDialog } from "@/modules/produtos/RepositoriosConfigDialog"

type WindowPreset = "30d" | "90d" | "180d" | "365d" | "year"
const WINDOW_OPTS: { value: WindowPreset; label: string }[] = [
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "180d", label: "Últimos 6 meses" },
  { value: "365d", label: "Últimos 12 meses" },
  { value: "year", label: "Ano atual" },
]

type Aba = "devs" | "produtos" | "commits"
const ABAS: TabDef<Aba>[] = [
  { value: "devs", label: "Por Dev", icon: Users },
  { value: "produtos", label: "Por Produto", icon: Package },
  { value: "commits", label: "Commits", icon: GitCommitHorizontal },
]

const TONE: Record<KpiTone, string> = {
  primary: "bg-primary/10 text-primary",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  slate: "bg-muted text-muted-foreground",
}

/** Cartão de indicador do Portal (mesmo visual do KpiCount) com uma linha extra de detalhe. */
function StatTile({ icon: Icon, value, label, sub, tone = "primary" }: {
  icon: ElementType
  value: ReactNode
  label: string
  sub?: string
  tone?: KpiTone
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[tone]}`}><Icon size={19} /></span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none tabular-nums">{value}</p>
        <p className="mt-1 text-sm leading-tight text-muted-foreground">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function windowRange(preset: WindowPreset): { from: string; to: string } {
  const today = new Date()
  const to = iso(today)
  if (preset === "year") return { from: iso(new Date(today.getFullYear(), 0, 1)), to }
  const days = preset === "30d" ? 30 : preset === "90d" ? 90 : preset === "180d" ? 180 : 365
  const start = new Date(today)
  start.setDate(start.getDate() - days)
  return { from: iso(start), to }
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-")
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  return `${names[Number(mo) - 1] ?? mo}/${y.slice(2)}`
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR")
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

/** Multi-seleção com checkboxes. Vazio = todos. Mesmo padrão do painel de Desempenho do Time. */
function FilterMultiSelect({
  options,
  selected,
  onChange,
  emptyLabel,
}: {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
  emptyLabel: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const triggerLabel = useMemo(() => {
    if (selected.length === 0) return emptyLabel
    if (selected.length === 1) return options.find((o) => o.value === selected[0])?.label ?? "1 selecionado"
    return `${selected.length} selecionados`
  }, [selected, options, emptyLabel])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-left">{triggerLabel}</span>
        <ChevronDown size={16} className={`ml-2 shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full min-w-[240px] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
          <button
            type="button"
            className="mb-1 w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
            onClick={() => onChange([])}
          >
            Limpar seleção (todos)
          </button>
          {options.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">Nenhuma opção disponível.</p>
          ) : (
            options.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={selectedSet.has(o.value)}
                  onChange={() =>
                    selectedSet.has(o.value)
                      ? onChange(selected.filter((v) => v !== o.value))
                      : onChange([...selected, o.value])
                  }
                />
                <span className="truncate text-sm">{o.label}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function RepositoriosPage() {
  const [preset, setPreset] = useState<WindowPreset>("365d")
  const [repositories, setRepositories] = useState<string[]>([])
  const [positions, setPositions] = useState<string[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [incluirBots, setIncluirBots] = useState(false)

  const [data, setData] = useState<RepoOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [commits, setCommits] = useState<RepoCommitPage | null>(null)
  const [commitsPage, setCommitsPage] = useState(1)
  const [loadingCommits, setLoadingCommits] = useState(false)

  const [configOpen, setConfigOpen] = useState(false)
  const [aba, setAba] = useState<Aba>("devs")

  const range = useMemo(() => windowRange(preset), [preset])
  const repoKey = repositories.join(","), posKey = positions.join(","), teamKey = teams.join(",")

  const filtros: CommitFilters = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      repositories: repositories.length ? repositories : undefined,
      positions: positions.length ? positions : undefined,
      teams: teams.length ? teams : undefined,
      incluir_bots: incluirBots,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range.from, range.to, repoKey, posKey, teamKey, incluirBots],
  )

  const carregar = useCallback(() => {
    setLoading(true)
    setErro(null)
    reposApi
      .overview(filtros)
      .then(setData)
      .catch((e) => {
        const status = e?.response?.status
        setErro(
          status === 403
            ? "Você não tem a permissão “produtos.repos.view”. Peça ao administrador para liberá-la no seu cargo."
            : e?.response?.data?.detail || "Não foi possível carregar o painel de commits.",
        )
      })
      .finally(() => setLoading(false))
  }, [filtros])

  useEffect(carregar, [carregar])

  useEffect(() => {
    if (aba !== "commits") return
    setLoadingCommits(true)
    reposApi
      .commits({ ...filtros, page: commitsPage, page_size: 50 })
      .then(setCommits)
      .catch(() => setCommits(null))
      .finally(() => setLoadingCommits(false))
  }, [aba, filtros, commitsPage])

  useEffect(() => setCommitsPage(1), [filtros])

  const k = data?.kpis
  const serieChart = useMemo(
    () => (data?.series ?? []).map((p) => ({ ...p, label: monthLabel(p.month) })),
    [data],
  )
  const devChart = useMemo(
    () => (data?.by_dev ?? []).slice(0, 12).map((d) => ({ name: d.person_name, commits: d.commits })),
    [data],
  )

  const totalPaginas = commits ? Math.ceil(commits.total / commits.page_size) : 1

  return (
    <div className="space-y-5">
      <PageHeader
        icon={GitBranch}
        color="#7C3AED"
        title="Repositórios e commits"
        description="Evolução das entregas de código dos devs, a partir dos repositórios vinculados aos produtos."
        actions={
          <>
            <Button variant="outline" className="h-10 gap-1.5" onClick={carregar} disabled={loading}>
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Atualizar
            </Button>
            <Button className="h-10 gap-1.5" onClick={() => setConfigOpen(true)}>
              <GitBranch size={16} />
              Repositórios
            </Button>
          </>
        }
      />

      {data && !data.integracao_configurada && (
        <Notice tone="amber" icon={AlertTriangle}>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Integração com o Azure DevOps não configurada.</p>
            <p className="opacity-90">
              Defina <code>AZURE_DEVOPS_PAT</code> no <code>.env</code> (escopo Code → Read). Até lá o
              inventário de repositórios funciona, mas nenhum commit é importado.
            </p>
          </div>
        </Notice>
      )}

      {k && k.autores_pendentes > 0 && (
        <Notice tone="amber" icon={Users}>
          <span className="min-w-0 flex-1">
            <strong>{k.autores_pendentes}</strong>{" "}
            {k.autores_pendentes === 1 ? "autor de commit não vinculado" : "autores de commit não vinculados"} a
            uma pessoa — esses commits ficam fora do ranking por dev.
          </span>
          <Button variant="outline" size="sm" className="h-8 bg-background" onClick={() => setConfigOpen(true)}>
            Vincular
          </Button>
        </Notice>
      )}

      {/* Filtros compartilhados pelas três abas */}
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="w-56 max-w-full">
          <FilterSelect
            label="Período"
            value={preset}
            onChange={(v) => setPreset(v as WindowPreset)}
            options={WINDOW_OPTS}
          />
        </div>
        <div className="w-56 max-w-full space-y-1">
          <span className="block text-xs text-muted-foreground">Repositório</span>
          <FilterMultiSelect
            options={(data?.repo_options ?? []).map((r) => ({ value: r.id, label: r.name }))}
            selected={repositories}
            onChange={setRepositories}
            emptyLabel="Todos os repositórios"
          />
        </div>
        <div className="w-56 max-w-full space-y-1">
          <span className="block text-xs text-muted-foreground">Cargo</span>
          <FilterMultiSelect
            options={(data?.position_options ?? []).map((p) => ({ value: p.slug, label: p.name }))}
            selected={positions}
            onChange={setPositions}
            emptyLabel="Todos os cargos"
          />
        </div>
        <div className="w-56 max-w-full space-y-1">
          <span className="block text-xs text-muted-foreground">Time</span>
          <FilterMultiSelect
            options={(data?.team_options ?? []).map((t) => ({ value: t.id, label: t.name }))}
            selected={teams}
            onChange={setTeams}
            emptyLabel="Todos os times"
          />
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={incluirBots}
            onChange={(e) => setIncluirBots(e.target.checked)}
          />
          Incluir bots/pipelines
        </label>
      </Card>

      {erro ? (
        <Card>
          <EmptyState icon={AlertTriangle} title="Não foi possível carregar" description={erro} />
        </Card>
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <KpiRow className="sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={GitCommitHorizontal}
              value={k?.commits_total ?? 0}
              label="Commits no período"
              sub={
                k
                  ? [
                      `PROD ${k.commits_prod} · HML ${k.commits_hml} · DEV ${k.commits_dev}`,
                      k.commits_sem_autor ? `${k.commits_sem_autor} sem autor` : null,
                    ].filter(Boolean).join(" — ")
                  : undefined
              }
            />
            <StatTile icon={Users} value={k?.devs_ativos ?? 0} label="Devs com commit" tone="violet" />
            <StatTile
              icon={GitBranch}
              value={k?.repos_ativos ?? 0}
              label="Repositórios ativos"
              tone="emerald"
              sub={k?.repos_sem_commit ? `${k.repos_sem_commit} sem commit no período` : undefined}
            />
            <StatTile
              icon={Package}
              value={k?.produtos_com_repo ?? 0}
              label="Produtos com repositório"
              sub={k?.produtos_sem_commit ? `${k.produtos_sem_commit} sem commit no período` : undefined}
            />
          </KpiRow>

          <SectionCard
            title="Evolução mensal"
            right={
              k?.ultimo_sync_at ? (
                <span className="text-xs text-muted-foreground">
                  Última sincronização: {fmtDateTime(k.ultimo_sync_at)}
                </span>
              ) : null
            }
          >
            {serieChart.length === 0 ? (
              <EmptyState
                icon={GitCommitHorizontal}
                title="Nenhum commit no período"
                description="Verifique se os repositórios já foram sincronizados."
              />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={serieChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [`${v} commits`, ""]} />
                  <Line type="monotone" dataKey="commits" stroke="#008BD2" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <div className="space-y-4">
            <DetailTabs tabs={ABAS} value={aba} onChange={setAba} />

            {aba === "devs" && (
              (data?.by_dev ?? []).length === 0 ? (
                <Card>
                  <EmptyState icon={GitCommitHorizontal} title="Sem commits no período" description="Ajuste os filtros ou sincronize os repositórios." />
                </Card>
              ) : (
                <div className="space-y-4">
                  <SectionCard title="Commits por dev">
                    <ResponsiveContainer width="100%" height={Math.max(200, devChart.length * 32)}>
                      <BarChart data={devChart} layout="vertical" margin={{ left: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" fontSize={12} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={180} fontSize={12} />
                        <Tooltip formatter={(v: number) => [`${v} commits`, ""]} />
                        <Bar dataKey="commits" fill="#008BD2" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </SectionCard>

                  <SectionCard title="Detalhamento" flush>
                    <div className={TABLE.wrap}>
                      <table className={`${TABLE.table} min-w-[820px]`}>
                        <thead className={TABLE.thead}>
                          <tr>
                            <th className={TABLE.thFirst}>Dev</th>
                            <th className={TABLE.th}>Cargo</th>
                            <th className={`${TABLE.th} text-right`}>Commits</th>
                            <th className={`${TABLE.th} text-right`}>Merges</th>
                            <th className={`${TABLE.th} text-right`}>Dias com commit</th>
                            <th className={`${TABLE.th} text-right`}>Repos</th>
                            <th className={`${TABLE.th} text-right`}>Produtos</th>
                            <th className={`${TABLE.th} text-right`}>Arquivos tocados</th>
                            <th className={TABLE.th}>Último commit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data?.by_dev ?? []).map((d) => (
                            <tr key={d.person_id ?? d.person_name} className={TABLE.tr}>
                              <td className={`${TABLE.tdFirst} font-medium`}>
                                {d.person_name}
                                {!d.person_id && (
                                  <Pill tone="amber" className="ml-2">não vinculado</Pill>
                                )}
                              </td>
                              <td className={`${TABLE.td} text-muted-foreground`}>{d.position ?? "—"}</td>
                              <td className={`${TABLE.td} text-right font-semibold tabular-nums`}>{d.commits}</td>
                              <td className={`${TABLE.td} text-right tabular-nums text-muted-foreground`}>{d.merges}</td>
                              <td className={`${TABLE.td} text-right tabular-nums`}>{d.dias_com_commit}</td>
                              <td className={`${TABLE.td} text-right tabular-nums`}>{d.repos_tocados}</td>
                              <td className={`${TABLE.td} text-right tabular-nums`}>{d.produtos_tocados}</td>
                              <td className={`${TABLE.td} text-right tabular-nums text-muted-foreground`}>
                                {d.arquivos_add + d.arquivos_edit + d.arquivos_delete}
                              </td>
                              <td className={`${TABLE.td} whitespace-nowrap tabular-nums text-muted-foreground`}>{fmtDate(d.ultimo_commit)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                      Commit mede atividade de código, não valor entregue — leia junto com o painel de
                      Desempenho do Time, que mede User Stories concluídas. “Arquivos tocados” vem do
                      <code> changeCounts</code> do Azure, que conta arquivos, não linhas.
                    </p>
                  </SectionCard>
                </div>
              )
            )}

            {aba === "produtos" && (
              (data?.by_product ?? []).length === 0 ? (
                <Card>
                  <EmptyState icon={GitCommitHorizontal} title="Sem commits no período" description="Ajuste os filtros ou sincronize os repositórios." />
                </Card>
              ) : (
                <SectionCard title="Atividade por produto" flush>
                  <div className={TABLE.wrap}>
                    <table className={`${TABLE.table} min-w-[700px]`}>
                      <thead className={TABLE.thead}>
                        <tr>
                          <th className={TABLE.thFirst}>Produto</th>
                          <th className={`${TABLE.th} text-right`}>Commits</th>
                          <th className={`${TABLE.th} text-right`}>Devs</th>
                          <th className={`${TABLE.th} text-right`}>Repos</th>
                          <th className={TABLE.th}>Último commit</th>
                          <th className={`${TABLE.th} text-right`}>Dias parado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.by_product ?? []).map((p) => (
                          <tr key={p.product_id} className={TABLE.tr}>
                            <td className={`${TABLE.tdFirst} font-medium`}>
                              {p.product_name}
                              {p.sigla && <span className="ml-2 text-xs font-normal text-muted-foreground">{p.sigla}</span>}
                            </td>
                            <td className={`${TABLE.td} text-right font-semibold tabular-nums`}>{p.commits}</td>
                            <td className={`${TABLE.td} text-right tabular-nums`}>{p.devs}</td>
                            <td className={`${TABLE.td} text-right tabular-nums`}>{p.repos}</td>
                            <td className={`${TABLE.td} whitespace-nowrap tabular-nums text-muted-foreground`}>{fmtDate(p.ultimo_commit_at)}</td>
                            <td className={`${TABLE.td} text-right tabular-nums`}>
                              {p.dias_sem_commit == null ? (
                                "—"
                              ) : p.dias_sem_commit > 90 ? (
                                <Pill tone="amber" dot>{p.dias_sem_commit}</Pill>
                              ) : (
                                p.dias_sem_commit
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                    Um repositório compartilhado por mais de um produto conta para todos eles — por isso a
                    soma desta aba pode superar o total de commits do período.
                  </p>
                </SectionCard>
              )
            )}

            {aba === "commits" && (
              <SectionCard
                title={commits ? `${commits.total} commits` : "Commits"}
                flush
                right={
                  commits && commits.total > commits.page_size ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={commitsPage <= 1 || loadingCommits}
                        onClick={() => setCommitsPage((p) => p - 1)}
                      >
                        Anterior
                      </Button>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {commitsPage} / {totalPaginas}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={commitsPage >= totalPaginas || loadingCommits}
                        onClick={() => setCommitsPage((p) => p + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  ) : null
                }
              >
                {loadingCommits ? (
                  <div className="p-5"><Skeleton className="h-64 rounded-xl" /></div>
                ) : !commits || commits.items.length === 0 ? (
                  <EmptyState icon={GitCommitHorizontal} title="Nenhum commit" description="Ajuste os filtros ou sincronize os repositórios." />
                ) : (
                  <div className={TABLE.wrap}>
                    <table className={`${TABLE.table} min-w-[900px]`}>
                      <thead className={TABLE.thead}>
                        <tr>
                          <th className={TABLE.thFirst}>Data</th>
                          <th className={TABLE.th}>Autor</th>
                          <th className={TABLE.th}>Repositório</th>
                          <th className={TABLE.th}>Mensagem</th>
                          <th className={TABLE.th}>Produto(s)</th>
                          <th className={TABLE.th}>Commit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commits.items.map((c) => (
                          <tr key={c.id} className={TABLE.tr}>
                            <td className={`${TABLE.tdFirst} whitespace-nowrap tabular-nums text-muted-foreground`}>
                              {fmtDateTime(c.author_date)}
                            </td>
                            <td className={TABLE.td}>
                              {c.person_name ?? c.author_name ?? c.author_email ?? "—"}
                              {!c.person_id && (
                                <Pill tone="amber" className="ml-2">sem vínculo</Pill>
                              )}
                            </td>
                            <td className={`${TABLE.td} text-muted-foreground`}>
                              {c.project}/{c.repository}
                            </td>
                            <td className={`${TABLE.td} max-w-[320px] truncate`} title={c.comment ?? ""}>
                              {c.is_merge && (
                                <Pill tone="violet" className="mr-2">merge</Pill>
                              )}
                              {c.comment ?? "—"}
                            </td>
                            <td className={`${TABLE.td} text-xs text-muted-foreground`}>
                              {c.produtos.join(", ") || "—"}
                            </td>
                            <td className={`${TABLE.td} font-mono text-xs`}>
                              {c.remote_url ? (
                                <a href={c.remote_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                  {c.short_id}
                                </a>
                              ) : (
                                c.short_id
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            )}
          </div>
        </>
      )}

      <RepositoriosConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        onChanged={carregar}
      />
    </div>
  )
}
