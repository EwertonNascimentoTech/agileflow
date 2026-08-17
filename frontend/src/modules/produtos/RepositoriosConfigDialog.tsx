import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Download, GitBranch, RefreshCw, Users } from "lucide-react"

import {
  reposApi,
  type AzureRepoMini,
  type CommitAuthor,
  type RepoImportPreview,
  type RepoLinkPreviewItem,
  type Repositorio,
} from "@/api/produtos"
import { teamopsApi, type Person } from "@/api/teamops"
import { EmptyState } from "@/components/EmptyState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/lib/toast"

const NONE = "__none__"

const KIND_LABEL: Record<string, string> = {
  azure_repo: "Repositório Azure",
  azure_projeto: "Só o projeto (sem repositório)",
  outro_provider: "Outro provider",
  nao_repositorio: "Não é repositório",
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function StatusBadge({ repo }: { repo: Repositorio }) {
  if (repo.last_sync_status === "ok") {
    return (
      <Badge variant="outline" className="text-success">
        <CheckCircle2 size={12} className="mr-1" />
        OK
      </Badge>
    )
  }
  if (repo.last_sync_status === "nunca") return <Badge variant="outline">Nunca sincronizado</Badge>
  return (
    <Badge variant="outline" className="text-warning" title={repo.last_sync_error ?? ""}>
      <AlertTriangle size={12} className="mr-1" />
      {repo.last_sync_status === "not_found" ? "Não encontrado" : "Erro"}
    </Badge>
  )
}

export function RepositoriosConfigDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onChanged?: () => void
}) {
  const [aba, setAba] = useState("repos")
  const [repos, setRepos] = useState<Repositorio[] | null>(null)
  const [preview, setPreview] = useState<RepoImportPreview | null>(null)
  const [autores, setAutores] = useState<CommitAuthor[] | null>(null)
  const [pessoas, setPessoas] = useState<Person[]>([])
  const [reposPorProjeto, setReposPorProjeto] = useState<Record<string, AzureRepoMini[] | null>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const carregarRepos = useCallback(() => {
    reposApi.list().then(setRepos).catch(() => setRepos([]))
  }, [])

  useEffect(() => {
    if (!open) return
    carregarRepos()
    reposApi.listAuthors().then(setAutores).catch(() => setAutores([]))
    teamopsApi.listPersons().then(setPessoas).catch(() => setPessoas([]))
  }, [open, carregarRepos])

  const pendentes = useMemo(() => (autores ?? []).filter((a) => !a.person_id && !a.ignored), [autores])
  const projetoSemRepo = useMemo(
    () => (preview?.itens ?? []).filter((i) => i.kind === "azure_projeto"),
    [preview],
  )

  /** Lista os repos de um projeto Azure sob demanda. null = falhou (normalmente falta o PAT). */
  async function carregarReposDoProjeto(project: string) {
    if (!project || project in reposPorProjeto) return
    try {
      const lista = await reposApi.descobrirRepos(project)
      setReposPorProjeto((prev) => ({ ...prev, [project]: lista }))
    } catch {
      setReposPorProjeto((prev) => ({ ...prev, [project]: null }))
      toast.error("Não foi possível listar os repositórios — verifique o PAT do Azure DevOps no .env.")
    }
  }

  /** Converte um link "só projeto" num vínculo real, com o repositório escolhido pelo gestor. */
  async function vincularProjeto(item: RepoLinkPreviewItem, repository: string) {
    setBusy(`proj-${item.product_id}`)
    try {
      await reposApi.applyImport([{ ...item, kind: "azure_repo", repository }])
      toast.success(`${repository} vinculado a ${item.product_name}.`)
      setPreview((prev) =>
        prev
          ? { ...prev, itens: prev.itens.filter((i) => !(i.product_id === item.product_id && i.url === item.url)) }
          : prev,
      )
      carregarRepos()
      onChanged?.()
    } catch {
      toast.error("Não foi possível vincular o repositório.")
    } finally {
      setBusy(null)
    }
  }

  async function carregarPreview() {
    setBusy("preview")
    try {
      setPreview(await reposApi.previewImport())
    } catch {
      toast.error("Não foi possível ler os links dos produtos.")
    } finally {
      setBusy(null)
    }
  }

  async function importar() {
    if (!preview) return
    const itens = preview.itens.filter((i) => i.kind === "azure_repo" && !i.ja_vinculado)
    if (itens.length === 0) {
      toast.success("Nada novo para importar.")
      return
    }
    setBusy("import")
    try {
      const r = await reposApi.applyImport(itens)
      toast.success(`${r.repos_criados} repositórios criados, ${r.vinculos_criados} vínculos.`)
      setPreview(null)
      carregarRepos()
      onChanged?.()
    } catch {
      toast.error("Falha ao importar os repositórios.")
    } finally {
      setBusy(null)
    }
  }

  async function sincronizar(repo?: Repositorio) {
    setBusy(repo ? repo.id : "sync-all")
    try {
      const r = repo ? await reposApi.sync(repo.id) : await reposApi.syncAll()
      toast.success(`${r.commits_novos} commits importados de ${r.repositorios} repositório(s).`)
      if (r.erros.length) toast.error(r.erros[0])
      carregarRepos()
      reposApi.listAuthors().then(setAutores).catch(() => undefined)
      onChanged?.()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || "Falha ao sincronizar.")
    } finally {
      setBusy(null)
    }
  }

  async function vincularAutor(autor: CommitAuthor, personId: string) {
    setBusy(autor.id)
    try {
      const atualizado =
        personId === NONE
          ? await reposApi.updateAuthor(autor.id, { ignored: true })
          : await reposApi.updateAuthor(autor.id, { person_id: personId })
      setAutores((prev) => (prev ?? []).map((a) => (a.id === atualizado.id ? atualizado : a)))
      toast.success(personId === NONE ? "Autor marcado como bot." : "Autor vinculado — vale para o histórico.")
      onChanged?.()
    } catch {
      toast.error("Não foi possível vincular o autor.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Repositórios e autores</DialogTitle>
        </DialogHeader>

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="repos">Repositórios {repos ? `(${repos.length})` : ""}</TabsTrigger>
            <TabsTrigger value="autores">
              Autores {pendentes.length > 0 ? `(${pendentes.length} pendentes)` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="repos" className="space-y-3 pt-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={carregarPreview} disabled={busy === "preview"}>
                <Download size={14} />
                Ler links dos produtos
              </Button>
              <Button size="sm" onClick={() => sincronizar()} disabled={busy === "sync-all"}>
                <RefreshCw size={14} className={busy === "sync-all" ? "animate-spin" : ""} />
                Sincronizar tudo
              </Button>
            </div>

            {preview && (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {preview.total_produtos_com_link} produtos com link preenchido
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(preview.resumo_por_tipo).map(([kind, qtd]) => (
                    <Badge key={kind} variant="outline">
                      {KIND_LABEL[kind] ?? kind}: {qtd}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-muted-foreground">
                  {preview.total_importaveis} link(s) importável(is), gerando {preview.total_repos_novos}{" "}
                  repositório(s) novo(s).
                </p>
                <Button size="sm" className="mt-3" onClick={importar} disabled={busy === "import"}>
                  Importar {preview.total_importaveis} vínculo(s)
                </Button>

                {projetoSemRepo.length > 0 && (
                  <div className="mt-4 border-t pt-3">
                    <p className="font-medium">
                      {projetoSemRepo.length} link(s) apontam só para o projeto Azure
                    </p>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Não dá para adivinhar qual repositório do projeto pertence ao produto — três produtos
                      apontam para o mesmo projeto <code>portais</code>. Escolha um a um.
                    </p>
                    {projetoSemRepo.map((item) => (
                      <div
                        key={`${item.product_id}-${item.url}`}
                        className="flex flex-wrap items-center gap-2 border-t py-2 first:border-t-0"
                      >
                        <span className="min-w-[180px] flex-1 text-sm">
                          <span className="font-medium">{item.product_name}</span>
                          <span className="block text-xs text-muted-foreground">projeto {item.project}</span>
                        </span>
                        <Select
                          value=""
                          onValueChange={(repoName) => vincularProjeto(item, repoName)}
                          disabled={busy === `proj-${item.product_id}`}
                          onOpenChange={(o) => o && carregarReposDoProjeto(item.project ?? "")}
                        >
                          <SelectTrigger className="h-8 w-72">
                            <SelectValue
                              placeholder={
                                reposPorProjeto[item.project ?? ""] === null
                                  ? "Precisa do PAT configurado"
                                  : "Escolher repositório…"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {(reposPorProjeto[item.project ?? ""] ?? []).map((r) => (
                              <SelectItem key={r.id} value={r.name}>
                                {r.name}
                                {r.ja_cadastrado ? " (já cadastrado)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!repos ? (
              <Skeleton className="h-48" />
            ) : repos.length === 0 ? (
              <EmptyState
                icon={GitBranch}
                title="Nenhum repositório cadastrado"
                description="Use “Ler links dos produtos” para importar a partir do campo de repositório dos produtos."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-3">Repositório</th>
                      <th className="py-2 pr-3">Produto(s)</th>
                      <th className="py-2 pr-3 text-right">Commits</th>
                      <th className="py-2 pr-3">Último sync</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {repos.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <span className="font-medium">{r.repository}</span>
                          <span className="block text-xs text-muted-foreground">{r.project}</span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {r.produtos.map((p) => p.name).join(", ") || "—"}
                        </td>
                        <td className="py-2 pr-3 text-right">{r.commits_count}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{fmtDateTime(r.last_sync_at)}</td>
                        <td className="py-2 pr-3">
                          <StatusBadge repo={r} />
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => sincronizar(r)}
                            disabled={busy === r.id}
                            title="Sincronizar este repositório"
                          >
                            <RefreshCw size={14} className={busy === r.id ? "animate-spin" : ""} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="autores" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              E-mails de commit que não casaram com o cadastro de pessoas. Vincular aqui vale também para os
              commits já importados.
            </p>
            {!autores ? (
              <Skeleton className="h-40" />
            ) : autores.length === 0 ? (
              <EmptyState icon={Users} title="Nenhum autor ainda" description="Sincronize os repositórios primeiro." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-3">E-mail</th>
                      <th className="py-2 pr-3 text-right">Commits</th>
                      <th className="py-2 pr-3">Pessoa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autores.map((a) => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <span className="font-mono text-xs">{a.email}</span>
                          <span className="block text-xs text-muted-foreground">{a.display_name ?? ""}</span>
                        </td>
                        <td className="py-2 pr-3 text-right">{a.commits_count}</td>
                        <td className="py-2 pr-3">
                          <Select
                            value={a.ignored ? NONE : (a.person_id ?? "")}
                            onValueChange={(v) => vincularAutor(a, v)}
                            disabled={busy === a.id}
                          >
                            <SelectTrigger className="h-8 w-64">
                              <SelectValue placeholder="Não vinculado" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Ignorar (bot/pipeline)</SelectItem>
                              {pessoas.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.full_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
