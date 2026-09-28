import { reposApi, type AzureRepoNameCheck } from "@/api/produtos"
import { toast } from "@/lib/toast"

/** Mesma regra do backend (`REPO_NAME_PATTERN`): minúsculas, números, ".", "_" e "-",
 *  começando e terminando com letra/número, até 64 caracteres. */
export const REPO_NAME_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/

/** Nome do produto → nome do repositório no padrão do time (kebab-case, sem acento).
 *  Ex.: "Form | Cadastro de Aluno SENAI" → "form-cadastro-de-aluno-senai". */
export function slugRepo(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "")
}

/** Rascunho do repositório no cadastro do produto. `customName` = o usuário editou o nome;
 *  sem ele, o nome acompanha o nome do produto. `check` = última resposta do Azure (vale só
 *  enquanto projeto e nome forem os mesmos da consulta). */
export interface AzureRepoDraft {
  enabled: boolean
  project: string
  customName: string | null
  check: AzureRepoNameCheck | null
  checkError: { project: string; name: string; message: string } | null
}

export function newAzureRepoDraft(enabled: boolean): AzureRepoDraft {
  return { enabled, project: lastAzureProject(), customName: null, check: null, checkError: null }
}

export type AzureRepoState = "off" | "sem_projeto" | "sem_nome" | "invalido" | "verificando" | "ok" | "existe" | "sem_permissao" | "erro"

/** Situação do repositório para a tela e para liberar o botão de salvar. */
export function azureRepoStatus(draft: AzureRepoDraft, productName: string): { state: AzureRepoState; name: string; ready: boolean } {
  const name = repoNameOf(draft, productName)
  const st = (state: AzureRepoState) => ({ state, name, ready: state === "off" || state === "ok" })
  if (!draft.enabled) return st("off")
  if (!draft.project) return st("sem_projeto")
  if (!name) return st("sem_nome")
  if (!REPO_NAME_RE.test(name)) return st("invalido")
  const e = draft.checkError
  if (e && e.project === draft.project && e.name === name) return st("erro")
  const c = draft.check
  if (!c || c.project !== draft.project || c.name !== name) return st("verificando")
  if (!c.valido) return st("invalido")
  if (!c.disponivel) return st("existe")
  if (c.pode_criar === false) return st("sem_permissao")
  return st("ok")
}

function apiDetail(err: unknown, fallback: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === "string" ? d : fallback
}

/** Depois de salvar o produto: cria o repositório (se marcado) e avisa o resultado. */
export async function createRepoForProduct(productId: string, draft: AzureRepoDraft, productName: string): Promise<boolean> {
  if (!draft.enabled) return false
  const name = repoNameOf(draft, productName)
  try {
    const r = await reposApi.createAzureRepo(productId, { project: draft.project, name })
    rememberAzureProject(draft.project)
    toast.success(
      r.link_salvo_no_produto
        ? `Repositório "${name}" criado no Azure DevOps e salvo no produto.`
        : `Repositório "${name}" criado no Azure DevOps (o produto já tinha outro link de repositório).`,
    )
    return true
  } catch (err) {
    toast.error(`Produto salvo, mas o repositório não foi criado: ${apiDetail(err, "falha no Azure DevOps.")}`)
    return false
  }
}

export function repoNameOf(draft: AzureRepoDraft, productName: string): string {
  return draft.customName ?? slugRepo(productName)
}

const LAST_PROJECT_KEY = "agileflow.azureRepoProject"

/** Último projeto do Azure usado (conveniência de quem cadastra; pode faltar). */
export function lastAzureProject(): string {
  try { return localStorage.getItem(LAST_PROJECT_KEY) ?? "" } catch { return "" }
}

export function rememberAzureProject(project: string): void {
  try { localStorage.setItem(LAST_PROJECT_KEY, project) } catch { /* sem storage: tudo bem */ }
}
