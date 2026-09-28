import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RotateCcw } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { reposApi } from "@/api/produtos"
import { azureRepoStatus, type AzureRepoDraft } from "@/modules/produtos/components/azureRepo"

function apiDetail(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

/**
 * Repositório no Azure DevOps no cadastro do produto: o nome acompanha o nome do produto
 * (kebab-case) até o usuário editar, e a disponibilidade é conferida no Azure enquanto digita.
 * Quem cria de fato é `createRepoForProduct`, depois que o produto é salvo.
 */
export default function AzureRepoField({ productName, draft, setDraft, disabled }: {
  productName: string
  draft: AzureRepoDraft
  setDraft: Dispatch<SetStateAction<AzureRepoDraft>>
  disabled?: boolean
}) {
  const [projects, setProjects] = useState<{ id: string; name: string }[] | null>(null)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const { state, name } = azureRepoStatus(draft, productName)

  // Projetos da organização: carrega uma vez, quando o campo é ligado.
  useEffect(() => {
    if (!draft.enabled || projects !== null) return
    let vivo = true
    reposApi.listAzureProjects()
      .then((l) => { if (vivo) setProjects([...l].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))) })
      .catch((err) => { if (vivo) { setProjects([]); setProjectsError(apiDetail(err, "Não foi possível listar os projetos do Azure DevOps.")) } })
    return () => { vivo = false }
  }, [draft.enabled, projects])

  // Confere o nome no Azure com atraso (não dispara uma consulta por tecla).
  useEffect(() => {
    if (state !== "verificando") return
    const project = draft.project
    const timer = window.setTimeout(() => {
      reposApi.checkAzureRepoName(project, name)
        .then((check) => setDraft((d) => ({ ...d, check, checkError: null })))
        .catch((err) => setDraft((d) => ({
          ...d, checkError: { project, name, message: apiDetail(err, "Não foi possível consultar o Azure DevOps.") },
        })))
    }, 450)
    return () => window.clearTimeout(timer)
  }, [state, draft.project, name, setDraft])

  const msg: Record<Exclude<typeof state, "off">, { tone: "muted" | "ok" | "warn" | "err"; text: string }> = {
    sem_projeto: { tone: "muted", text: "Escolha o projeto do Azure DevOps onde o repositório será criado." },
    sem_nome: { tone: "muted", text: "O nome do repositório sai do nome do produto." },
    invalido: { tone: "err", text: "Use letras minúsculas, números e hífen (até 64), começando e terminando com letra ou número." },
    verificando: { tone: "muted", text: "Conferindo no Azure DevOps…" },
    ok: { tone: "ok", text: "Disponível. Será criado ao salvar e o link vai para o campo de repositório do produto." },
    existe: { tone: "warn", text: draft.check?.motivo ?? "Já existe um repositório com esse nome." },
    sem_permissao: { tone: "err", text: draft.check?.motivo ?? "Sem permissão para criar neste projeto." },
    erro: { tone: "err", text: draft.checkError?.message ?? "Não foi possível consultar o Azure DevOps." },
  }
  const status = state === "off" ? null : msg[state]
  const url = draft.check && draft.check.project === draft.project && draft.check.name === name ? draft.check.web_url : null

  return (
    <div className="space-y-2.5 rounded-md border border-dashed p-2.5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox" checked={draft.enabled} disabled={disabled}
          onChange={(e) => { const on = e.target.checked; setDraft((d) => ({ ...d, enabled: on })) }}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <span>Criar repositório no <strong>Azure DevOps</strong></span>
      </label>

      {draft.enabled && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Projeto no Azure</Label>
              <Select
                value={draft.project || undefined}
                onValueChange={(v) => setDraft((d) => ({ ...d, project: v }))}
                disabled={disabled || !projects?.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder={projects === null ? "Carregando projetos…" : "Selecione o projeto"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {draft.project && projects && !projects.some((p) => p.name === draft.project) && (
                    <SelectItem value={draft.project}>{draft.project}</SelectItem>
                  )}
                  {(projects ?? []).map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="azure-repo-nome">Nome do repositório</Label>
                {draft.customName !== null && (
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, customName: null }))}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    title="Voltar a gerar o nome a partir do nome do produto"
                  >
                    <RotateCcw size={11} /> Seguir o nome do produto
                  </button>
                )}
              </div>
              <Input
                id="azure-repo-nome" value={name} maxLength={64} disabled={disabled}
                placeholder="gerado a partir do nome do produto"
                onChange={(e) => { const v = e.target.value.toLowerCase(); setDraft((d) => ({ ...d, customName: v })) }}
                className="font-mono text-sm"
              />
            </div>
          </div>

          {projectsError && (
            <p className="flex items-start gap-1.5 text-[11px] text-destructive"><AlertTriangle size={13} className="mt-px shrink-0" /> {projectsError}</p>
          )}
          {status && (
            <p className={`flex items-start gap-1.5 text-[11px] ${
              status.tone === "ok" ? "text-emerald-700 dark:text-emerald-400"
                : status.tone === "warn" ? "text-amber-700 dark:text-amber-400"
                  : status.tone === "err" ? "text-destructive" : "text-muted-foreground"
            }`}>
              {state === "verificando" ? <Loader2 size={13} className="mt-px shrink-0 animate-spin" />
                : status.tone === "ok" ? <CheckCircle2 size={13} className="mt-px shrink-0" />
                  : status.tone === "muted" ? null : <AlertTriangle size={13} className="mt-px shrink-0" />}
              <span className="min-w-0">
                {status.text}
                {url && (
                  <a href={url} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 break-all font-mono text-muted-foreground hover:text-primary">
                    {url} {state === "existe" && <ExternalLink size={11} className="shrink-0" />}
                  </a>
                )}
              </span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
