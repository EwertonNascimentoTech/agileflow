import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, ExternalLink, GitCommitHorizontal, Loader2, Plus, Search, Trash2 } from "lucide-react"

import type { UsCommitEvidenceState, UsCommitItem } from "@/api/projetos"
import { projetosApi } from "@/api/projetos"
import { Notice, Pill, type Tone } from "@/components/ds"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"
import { DrawerSection } from "@/modules/projetos/CollapsibleFormSection"

/** Mesma extração usada no drawer: o backend manda a causa em `detail`. */
function erroDaApi(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  const d = e?.response?.data?.detail
  return typeof d === "string" ? d : ""
}

const ENV_LABEL: Record<string, { texto: string; tom: Tone }> = {
  prod: { texto: "PROD", tom: "emerald" },
  hml: { texto: "HML", tom: "amber" },
  dev: { texto: "DEV", tom: "slate" },
}

function EnvChip({ env }: { env: string | null }) {
  const cfg = ENV_LABEL[env ?? ""] ?? { texto: "—", tom: "slate" as Tone }
  return (
    <Pill tone={cfg.tom} className="shrink-0">
      {cfg.texto}
    </Pill>
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
    <div className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2">
      <EnvChip env={commit.environment} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{commit.comment ?? "(sem mensagem)"}</p>
        <p className="truncate text-xs text-muted-foreground">
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
 *  O servidor exige isso ao concluir a US; a seção torna o requisito visível
 *  antes de o dev arrastar o card. */
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
    <DrawerSection
      title="Evidência de código"
      icon={GitCommitHorizontal}
      badges={
        state && (
          <Pill tone={state.commits_vinculados > 0 ? "emerald" : "slate"}>
            {state.commits_vinculados > 0
              ? `${state.commits_vinculados} commit(s) vinculado(s)`
              : `${state.commits_disponiveis} disponível(is) no produto`}
          </Pill>
        )
      }
    >
      {semProduto && (
        <Notice tone="red" icon={AlertTriangle}>
          <span className="min-w-0 flex-1">
            Este card não está sob um projeto com produto vinculado. Vincule o produto ao card do
            projeto para poder anexar commits e concluir a User Story.
          </span>
        </Notice>
      )}

      {!semProduto && (
        <>
          <div className="space-y-1.5">
            {linked.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum commit vinculado.</p>
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
                  className="gap-1.5"
                  onClick={() => {
                    setAbrirBusca(true)
                    void buscar("")
                  }}
                >
                  <GitCommitHorizontal size={14} /> Vincular commit
                </Button>
              ) : (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center gap-2">
                    <Search size={14} className="text-muted-foreground" />
                    <Input
                      autoFocus
                      value={termo}
                      onChange={(e) => setTermo(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void buscar(termo)}
                      placeholder="Buscar por mensagem, autor ou hash"
                      className="h-8 bg-background text-sm"
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => void buscar(termo)}>
                      {buscando ? <Loader2 size={14} className="animate-spin" /> : "Buscar"}
                    </Button>
                  </div>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto">
                    {opcoes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
                {semCommitsNoProduto
                  ? "O produto deste projeto ainda não tem commits importados — justifique para concluir a User Story."
                  : "Sem commit para vincular? Justifique antes de concluir a User Story."}
              </p>
              <Textarea
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                disabled={readOnly || salvando}
                rows={2}
                maxLength={2000}
                placeholder="Ex.: ajuste apenas de configuração, sem alteração de código."
                className="text-sm"
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
    </DrawerSection>
  )
}
