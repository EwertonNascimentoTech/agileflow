/**
 * SSO IDigital (OIDC) no navegador — Authorization Code + PKCE via `oidc-client-ts`, com a
 * mesma configuração do `@fiea-al/idigital-sso-sdk` (e a mesma API: login / handleCallback /
 * logout). Não usamos o pacote em si porque ele vem de feed npm privado (exigiria PAT no build)
 * e o botão dele carrega fonte do Google, bloqueada pela CSP.
 *
 * O token do IDigital só prova a identidade uma vez: o callback manda o id_token para
 * `/auth/sso/exchange` e a sessão passa a ser a do AgileFlow (mesmos tokens do login por senha).
 */
import axios from "axios"
import { UserManager, WebStorageStateStore } from "oidc-client-ts"

import type { TokenResponse } from "@/types"

export interface SsoConfig {
  enabled: boolean
  provider?: string
  authority?: string
  client_id?: string
  resource?: string | null
  scope?: string
}

export const SSO_CALLBACK_PATH = "/sso/callback"
const AUTH_VIA_KEY = "auth_via"

// Chamadas sem o interceptor do `api` (um 401 aqui não é sessão vencida: é login recusado).
const http = axios.create({ baseURL: "/api/v1", timeout: 20000 })

let configPromise: Promise<SsoConfig> | null = null
let manager: UserManager | null = null

export function loadSsoConfig(): Promise<SsoConfig> {
  if (!configPromise) {
    configPromise = http
      .get<SsoConfig>("/auth/sso/config")
      .then((r) => r.data)
      .catch(() => {
        configPromise = null
        return { enabled: false }
      })
  }
  return configPromise
}

async function getManager(): Promise<UserManager> {
  if (manager) return manager
  const cfg = await loadSsoConfig()
  if (!cfg.enabled || !cfg.authority || !cfg.client_id) throw new Error("Login pelo IDigital não está habilitado.")
  const origin = window.location.origin
  manager = new UserManager({
    authority: cfg.authority.replace(/\/$/, ""),
    client_id: cfg.client_id,
    redirect_uri: `${origin}${SSO_CALLBACK_PATH}`,
    post_logout_redirect_uri: `${origin}/login`,
    ...(cfg.resource ? { resource: cfg.resource } : {}),
    scope: cfg.scope || "openid email profile",
    response_type: "code",
    automaticSilentRenew: false,
    // Tokens do IDigital na aba (só para o id_token_hint do logout); estado do PKCE no localStorage.
    userStore: new WebStorageStateStore({ prefix: "idigital-sso.", store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ prefix: "idigital-sso.", store: window.localStorage }),
  })
  return manager
}

/** Vai para o login do IDigital. */
export async function ssoLogin(): Promise<void> {
  await (await getManager()).signinRedirect()
}

/** Na rota de callback: troca code+state por tokens no IdP e o id_token por uma sessão AgileFlow. */
export async function ssoHandleCallback(): Promise<TokenResponse> {
  const params = new URLSearchParams(window.location.search)
  const oidcError = params.get("error")
  if (oidcError) {
    const desc = params.get("error_description")
    throw new Error(
      oidcError === "access_denied" ? "Login no IDigital cancelado." : `O IDigital recusou o login${desc ? `: ${desc}` : "."}`,
    )
  }
  if (!params.has("code") || !params.has("state")) throw new Error("Retorno do IDigital sem código de login.")

  let idToken: string
  let accessToken: string
  try {
    const user = await (await getManager()).signinRedirectCallback()
    idToken = user.id_token ?? ""
    accessToken = user.access_token
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      msg === "Failed to fetch"
        ? "Não foi possível concluir o login com o IDigital (IdP inacessível)."
        : "Não foi possível concluir o login com o IDigital. Tente de novo.",
    )
  }
  if (!idToken) throw new Error("O IDigital não devolveu a identificação do usuário.")
  try {
    const { data } = await http.post<TokenResponse>("/auth/sso/exchange", { id_token: idToken, access_token: accessToken })
    localStorage.setItem(AUTH_VIA_KEY, "sso")
    return data
  } catch (err) {
    const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
    throw new Error(typeof detail === "string" ? detail : "Não foi possível entrar com o IDigital.")
  }
}

/** Marca o login por senha (o logout não passa pelo IDigital). */
export function markPasswordLogin(): void {
  localStorage.removeItem(AUTH_VIA_KEY)
}

/** Sessão veio do IDigital: encerra lá também (logout RP-initiated) e volta para /login. */
export async function ssoLogoutIfNeeded(): Promise<boolean> {
  if (localStorage.getItem(AUTH_VIA_KEY) !== "sso") return false
  localStorage.removeItem(AUTH_VIA_KEY)
  try {
    await (await getManager()).signoutRedirect()
    return true
  } catch {
    return false
  }
}
