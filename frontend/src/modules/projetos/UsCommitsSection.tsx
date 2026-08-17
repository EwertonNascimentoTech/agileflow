import { useCallback, useEffect, useState } from "react"
import { ExternalLink, GitCommitHorizontal, Loader2, Plus, Search, Trash2 } from "lucide-react"

import type { UsCommitEvidenceState, UsCommitItem } from "@/api/projetos"
import { projetosApi } from "@/api/projetos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"

/** Mesma extração usada no drawer: o backend manda a causa em `detail`. */
function erroDaApi(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e?.response?.data?.detail
  return typeof d === "string" ? d : ""
}

const ENV_LABEL: Record<string, { texto: string; classe: string }> = {
  prod: { texto: "PROD", classe: "bg-emerald-100 text-emerald-800" },
  hml: { texto: "HML", classe: "bg-amber-100 text-amber-800" },
  dev: { texto: "DEV", classe: "bg-slate-100 text-slate-700" },
}

function EnvChip({ env }: { env: string | null }) {
  const cfg = ENV_LABEL[env ?? ""] ?? { texto: "—", classe: "bg-slate-100 text-slate-500" }
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${cfg.classe}`}>
      {cfg.texto}
    </span>
  )
}

function CommitRow({
  commit,
  action,
}: {
  commit: UsCommitItem
  action: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border px-2 py-1.5">
      <EnvChip env={commit.environment} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{commit.comment ?? "(sem mensagem)"}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          <code>{commit.short_id}</code>
          {commit.repository ? ` · ${commit.repository}` : ""}
          {commit.author_name ? ` · ${commit.author_name}` : ""}
          {commit.author_date ? ` · ${new Date(commit.author_date).toLocaleDateString("pt-BR")}` : ""}
        </p>
      </div>
      {commit.remote_url && (
        <a
          href={commit.remote_url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-muted-foreground hover:text-primary"
          title="Abrir no Azure DevOps"
        >
          <ExternalLink size={13} />
        </a>
      )}
      {action}
    </div>
  )
}

/** Evidência de código da User Story: commits vinculados + justificativa quando não há commit.
 *  O servidor é quem decide (400 ao concluir sem evidência); aqui a seção só torna o
 *  requisito visível antes de o dev tentar arrastar o card. */
export function UsCommitsSection({
  projectId,
  taskId,
  readOnly,
  justificativa,
  onSaveJustificativa,
}: {
  projectId: string
  taskId: string
  readOnly: boolean
  justificativa: string | null
  /** Persistido via updateTask no drawer — mantém um único caminho de escrita do card. */
  onSaveJustificativa: (texto: string) => Promise<void>
}) {
  const [linked, setLinked] = useState<UsCommitItem[]>([])
  const [state, setState] = useState<UsCommitEvidenceState | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [abrirBusca, setAbrirBusca] = useState(false)
  const [termo, setTermo] = useState("")
  const [opcoes, setOpcoes] = useState<UsCommitItem[]>([])
  const [salvando, setSalvando] = useState(false)
  const [rascunho, setRascunho] = useState(justificativa ?? "")

  const recarregar = useCallback(async () => {
    // Tolerante a falha: o módulo Produtos pode estar inativo no tenant.
    const [l, s] = await Promise.all([
      projetosApi.listUsCommits(projectId, taskId).catch(() => [] as UsCommitItem[]),
      projetosApi.getUsCommitState(projectId, taskId).catch(() => null),
    ])
    setLinked(l)
    setState(s)
  }, [projectId, taskId])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  useEffect(() => {
    setRascunho(justificativa ?? "")
  }, [justificativa])

  async function buscar(q: string) {
    setBuscando(true)
    try {
      setOpcoes(await projetosApi.listUsCommitsAvailable(projectId, taskId, { search: q, limit: 20 }))
    } catch (err) {
      toast.error(erroDaApi(err) || "Não foi possível buscar commits.")
      setOpcoes([])
    } finally {
      setBuscando(false)
    }
  }

  async function vincular(commitId: string) {
    setSalvando(true)
    try {
      setLinked(await projetosApi.linkUsCommits(projectId, taskId, [commitId]))
      setOpcoes((prev) => prev.filter((o) => o.id !== commitId))
      await recarregar()
    } catch (err) {
      toast.error(erroDaApi(err) || "Não foi possível vincular o commit.")
    } finally {
      setSalvando(false)
    }
  }

  async function desvincular(commitId: string) {
    const antes = linked
    setLinked((prev) => prev.filter((c) => c.id !== commitId))   // otimista
    try {
      await projetosApi.unlinkUsCommit(projectId, taskId, commitId)
      await recarregar()
    } catch (err) {
      setLinked(antes)                                           // rollback
      toast.error(erroDaApi(err) || "Não foi possível desvincular o commit.")
    }
  }

  async function salvarJustificativa() {
    setSalvando(true)
    try {
      await onSaveJustificativa(rascunho.trim())
      await recarregar()
      toast.success("Justificativa registrada.")
    } catch (err) {
      toast.error(erroDaApi(err) || "Não foi possível salvar a justificativa.")
    } finally {
      setSalvando(false)
    }
  }

  const semProduto = state ? !state.tem_produto : false
  const semCommitsNoProduto = !!state?.tem_produto && state.commits_disponiveis === 0
  const justificativaMudou = rascunho.trim() !== (justificativa ?? "").trim()

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-primary" />
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
          Evidência de código
        </p>
        {state && (
          <span className="text-[11px] text-muted-foreground">
            {state.commits_vinculados > 0
              ? `${state.commits_vinculados} commit(s) vinculado(s)`
              : `${state.commits_disponiveis} disponível(is) no produto`}
          </span>
        )}
      </div>

      {semProduto && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
          Este card não está sob um projeto com produto vinculado. Vincule o produto ao card do
          projeto para poder anexar commits e concluir a User Story.
        </p>
      )}

      {!semProduto && (
        <>
          <div className="space-y-1.5">
            {linked.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum commit vinculado.</p>
            ) : (
              linked.map((c) => (
                <CommitRow
                  key={c.id}
                  commit={c}
                  action={
                    readOnly ? null : (
                      <button
                        type="button"
                        onClick={() => void desvincular(c.id)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        title="Desvincular"
                      >
                        <Trash2 size={13} />
                      </button>
                    )
                  }
                />
              ))
            )}
          </div>

          {!readOnly && state && state.commits_disponiveis > 0 && (
            <div className="space-y-2">
              {!abrirBusca ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAbrirBusca(true)
                    void buscar("")
                  }}
                >
                  <GitCommitHorizontal size={14} className="mr-1" /> Vincular commit
                </Button>
              ) : (
                <div className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <Search size={14} className="text-muted-foreground" />
                    <Input
                      autoFocus
                      value={termo}
                      onChange={(e) => setTermo(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void buscar(termo)}
                      placeholder="Buscar por mensagem, autor ou hash"
                      className="h-8 text-xs"
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => void buscar(termo)}>
                      {buscando ? <Loader2 size={14} className="animate-spin" /> : "Buscar"}
                    </Button>
                  </div>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto">
                    {opcoes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {buscando ? "Buscando…" : "Nenhum commit encontrado."}
                      </p>
                    ) : (
                      opcoes.map((c) => (
                        <CommitRow
                          key={c.id}
                          commit={c}
                          action={
                            <button
                              type="button"
                              disabled={salvando || c.linked}
                              onClick={() => void vincular(c.id)}
                              className="shrink-0 text-muted-foreground hover:text-primary disabled:opacity-40"
                              title={c.linked ? "Já vinculado" : "Vincular"}
                            >
                              <Plus size={14} />
                            </button>
                          }
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {(semCommitsNoProduto || linked.length === 0) && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">
                {semCommitsNoProduto
                  ? "O produto deste projeto ainda não tem commits importados — justifique para concluir."
                  : "Sem commit para vincular? Justifique."}
              </p>
              <Textarea
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                disabled={readOnly || salvando}
                rows={2}
                maxLength={2000}
                placeholder="Ex.: ajuste apenas de configuração, sem alteração de código."
                className="text-xs"
              />
              {!readOnly && justificativaMudou && (
                <Button type="button" size="sm" onClick={() => void salvarJustificativa()} disabled={salvando}>
                  {salvando && <Loader2 size={14} className="mr-1 animate-spin" />}
                  Salvar justificativa
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
