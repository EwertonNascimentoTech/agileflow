import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle, GitBranch, GitCommitHorizontal, Package, RefreshCw, Users,
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
import { KpiCard } from "@/components/KpiCard"
import { SectionCard } from "@/components/SectionCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RepositoriosConfigDialog } from "@/modules/produtos/RepositoriosConfigDialog"

type WindowPreset = "30d" | "90d" | "180d" | "365d" | "year"
const WINDOW_OPTS: { value: WindowPreset; label: string }[] = [
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "180d", label: "Últimos 6 meses" },
  { value: "365d", label: "Últimos 12 meses" },
  { value: "year", label: "Ano atual" },
]

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
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-left">{triggerLabel}</span>
        <span className="ml-2 shrink-0 text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full min-w-[240px] overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
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
  const [aba, setAba] = useState("devs")

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Repositórios e commits</h1>
          <p className="text-sm text-muted-foreground">
            Evolução das entregas de código dos devs, a partir dos repositórios vinculados aos produtos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setConfigOpen(true)}>
            <GitBranch size={14} />
            Repositórios
          </Button>
        </div>
      </div>

      {data && !data.integracao_configurada && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Integração com o Azure DevOps não configurada.</p>
            <p className="text-muted-foreground">
              Defina <code>AZURE_DEVOPS_PAT</code> no <code>.env</code> (escopo Code → Read). Até lá o
              inventário de repositórios funciona, mas nenhum commit é importado.
            </p>
          </div>
        </div>
      )}

      {k && k.autores_pendentes > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <span>
            <strong>{k.autores_pendentes}</strong>{" "}
            {k.autores_pendentes === 1 ? "autor de commit não vinculado" : "autores de commit não vinculados"} a
            uma pessoa — esses commits ficam fora do ranking por dev.
          </span>
          <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
            Vincular
          </Button>
        </div>
      )}

      {/* Filtros compartilhados pelas três abas */}
      <SectionCard>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Período</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as WindowPreset)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Repositório</label>
            <FilterMultiSelect
              options={(data?.repo_options ?? []).map((r) => ({ value: r.id, label: r.name }))}
              selected={repositories}
              onChange={setRepositories}
              emptyLabel="Todos os repositórios"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Cargo</label>
            <FilterMultiSelect
              options={(data?.position_options ?? []).map((p) => ({ value: p.slug, label: p.name }))}
              selected={positions}
              onChange={setPositions}
              emptyLabel="Todos os cargos"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Time</label>
            <FilterMultiSelect
              options={(data?.team_options ?? []).map((t) => ({ value: t.id, label: t.name }))}
              selected={teams}
              onChange={setTeams}
              emptyLabel="Todos os times"
            />
          </div>
          <div className="flex items-end">
            <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={incluirBots}
                onChange={(e) => setIncluirBots(e.target.checked)}
              />
              Incluir bots/pipelines
            </label>
          </div>
        </div>
      </SectionCard>

      {erro ? (
        <EmptyState icon={AlertTriangle} title="Não foi possível carregar" description={erro} />
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Commits no período"
              value={k?.commits_total ?? 0}
              icon={GitCommitHorizontal}
              sub={
                k
                  ? [
                      `PROD ${k.commits_prod} · HML ${k.commits_hml} · DEV ${k.commits_dev}`,
                      k.commits_sem_autor ? `${k.commits_sem_autor} sem autor` : null,
                    ].filter(Boolean).join(" — ")
                  : undefined
              }
            />
            <KpiCard label="Devs com commit" value={k?.devs_ativos ?? 0} icon={Users} />
            <KpiCard
              label="Repositórios ativos"
              value={k?.repos_ativos ?? 0}
              icon={GitBranch}
              sub={k?.repos_sem_commit ? `${k.repos_sem_commit} sem commit no período` : undefined}
            />
            <KpiCard
              label="Produtos com repositório"
              value={k?.produtos_com_repo ?? 0}
              icon={Package}
              sub={k?.produtos_sem_commit ? `${k.produtos_sem_commit} sem commit no período` : undefined}
            />
          </div>

          <SectionCard
            title="Evolução mensal"
            action={
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

          <Tabs value={aba} onValueChange={setAba}>
            <TabsList>
              <TabsTrigger value="devs">Por Dev</TabsTrigger>
              <TabsTrigger value="produtos">Por Produto</TabsTrigger>
              <TabsTrigger value="commits">Commits</TabsTrigger>
            </TabsList>

            <TabsContent value="devs" className="space-y-4 pt-4">
              {(data?.by_dev ?? []).length === 0 ? (
                <EmptyState icon={GitCommitHorizontal} title="Sem commits no período" description="Ajuste os filtros ou sincronize os repositórios." />
              ) : (
                <>
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

                  <SectionCard title="Detalhamento" bodyClassName="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead className="text-left text-xs uppercase text-muted-foreground">
                        <tr className="border-b">
                          <th className="py-2 pr-3">Dev</th>
                          <th className="py-2 pr-3">Cargo</th>
                          <th className="py-2 pr-3 text-right">Commits</th>
                          <th className="py-2 pr-3 text-right">Merges</th>
                          <th className="py-2 pr-3 text-right">Dias com commit</th>
                          <th className="py-2 pr-3 text-right">Repos</th>
                          <th className="py-2 pr-3 text-right">Produtos</th>
                          <th className="py-2 pr-3 text-right">Arquivos tocados</th>
                          <th className="py-2 pr-3">Último commit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.by_dev ?? []).map((d) => (
                          <tr key={d.person_id ?? d.person_name} className="border-b last:border-0">
                            <td className="py-2 pr-3 font-medium">
                              {d.person_name}
                              {!d.person_id && (
                                <Badge variant="outline" className="ml-2 text-[10px]">
                                  não vinculado
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">{d.position ?? "—"}</td>
                            <td className="py-2 pr-3 text-right font-semibold">{d.commits}</td>
                            <td className="py-2 pr-3 text-right text-muted-foreground">{d.merges}</td>
                            <td className="py-2 pr-3 text-right">{d.dias_com_commit}</td>
                            <td className="py-2 pr-3 text-right">{d.repos_tocados}</td>
                            <td className="py-2 pr-3 text-right">{d.produtos_tocados}</td>
                            <td className="py-2 pr-3 text-right text-muted-foreground">
                              {d.arquivos_add + d.arquivos_edit + d.arquivos_delete}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">{fmtDate(d.ultimo_commit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Commit mede atividade de código, não valor entregue — leia junto com o painel de
                      Desempenho do Time, que mede User Stories concluídas. “Arquivos tocados” vem do
                      <code> changeCounts</code> do Azure, que conta arquivos, não linhas.
                    </p>
                  </SectionCard>
                </>
              )}
            </TabsContent>

            <TabsContent value="produtos" className="pt-4">
              {(data?.by_product ?? []).length === 0 ? (
                <EmptyState icon={GitCommitHorizontal} title="Sem commits no período" description="Ajuste os filtros ou sincronize os repositórios." />
              ) : (
                <SectionCard title="Atividade por produto" bodyClassName="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-2 pr-3">Produto</th>
                        <th className="py-2 pr-3 text-right">Commits</th>
                        <th className="py-2 pr-3 text-right">Devs</th>
                        <th className="py-2 pr-3 text-right">Repos</th>
                        <th className="py-2 pr-3">Último commit</th>
                        <th className="py-2 pr-3 text-right">Dias parado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.by_product ?? []).map((p) => (
                        <tr key={p.product_id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">
                            {p.product_name}
                            {p.sigla && <span className="ml-2 text-xs text-muted-foreground">{p.sigla}</span>}
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold">{p.commits}</td>
                          <td className="py-2 pr-3 text-right">{p.devs}</td>
                          <td className="py-2 pr-3 text-right">{p.repos}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{fmtDate(p.ultimo_commit_at)}</td>
                          <td className="py-2 pr-3 text-right">
                            {p.dias_sem_commit == null ? (
                              "—"
                            ) : p.dias_sem_commit > 90 ? (
                              <Badge variant="outline" className="text-warning">
                                {p.dias_sem_commit}
                              </Badge>
                            ) : (
                              p.dias_sem_commit
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Um repositório compartilhado por mais de um produto conta para todos eles — por isso a
                    soma desta aba pode superar o total de commits do período.
                  </p>
                </SectionCard>
              )}
            </TabsContent>

            <TabsContent value="commits" className="pt-4">
              <SectionCard
                title={commits ? `${commits.total} commits` : "Commits"}
                bodyClassName="overflow-x-auto"
                action={
                  commits && commits.total > commits.page_size ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={commitsPage <= 1 || loadingCommits}
                        onClick={() => setCommitsPage((p) => p - 1)}
                      >
                        Anterior
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {commitsPage} / {Math.ceil(commits.total / commits.page_size)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={commitsPage >= Math.ceil(commits.total / commits.page_size) || loadingCommits}
                        onClick={() => setCommitsPage((p) => p + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  ) : null
                }
              >
                {loadingCommits ? (
                  <Skeleton className="h-64" />
                ) : !commits || commits.items.length === 0 ? (
                  <EmptyState icon={GitCommitHorizontal} title="Nenhum commit" description="Ajuste os filtros ou sincronize os repositórios." />
                ) : (
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-2 pr-3">Data</th>
                        <th className="py-2 pr-3">Autor</th>
                        <th className="py-2 pr-3">Repositório</th>
                        <th className="py-2 pr-3">Mensagem</th>
                        <th className="py-2 pr-3">Produto(s)</th>
                        <th className="py-2 pr-3">Commit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commits.items.map((c) => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                            {fmtDateTime(c.author_date)}
                          </td>
                          <td className="py-2 pr-3">
                            {c.person_name ?? c.author_name ?? c.author_email ?? "—"}
                            {!c.person_id && (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                sem vínculo
                              </Badge>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {c.project}/{c.repository}
                          </td>
                          <td className="max-w-[320px] truncate py-2 pr-3" title={c.comment ?? ""}>
                            {c.is_merge && (
                              <Badge variant="outline" className="mr-2 text-[10px]">
                                merge
                              </Badge>
                            )}
                            {c.comment ?? "—"}
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">
                            {c.produtos.join(", ") || "—"}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">
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
                )}
              </SectionCard>
            </TabsContent>
          </Tabs>
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
