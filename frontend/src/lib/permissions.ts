/** Permissões efetivas do usuário autenticado (payload de /auth/me). */

export function hasPermission(permissions: string[] | undefined, code: string): boolean {
  if (!permissions?.length) return false
  if (permissions.includes("*")) return true
  return permissions.includes(code)
}

export function hasAnyPermission(permissions: string[] | undefined, codes: readonly string[]): boolean {
  return codes.some((c) => hasPermission(permissions, c))
}

/** Permissões que liberam a área de configuração de cada módulo. */
export const MODULE_CONFIG_PERMISSIONS: Record<string, readonly string[]> = {
  projetos: [
    "projetos.project.manage",
    "projetos.status.manage",
    "projetos.demand_type.manage",
    "projetos.form.manage",
    "projetos.automation.manage",
    "projetos.priority.manage",
  ],
  teamops: ["teamops.config.manage"],
  produtos: ["produtos.config.manage"],
  indicadores: ["indicadores.config.manage"],
  crm: ["atendimento.config.manage", "crm.config.manage"],
  estoque: ["estoque.config.manage"],
  pdv: ["pdv.config.manage"],
}

export function canAccessModuleConfig(
  permissions: string[] | undefined,
  moduleSlug: string,
): boolean {
  const codes = MODULE_CONFIG_PERMISSIONS[moduleSlug]
  if (!codes?.length) return false
  return hasAnyPermission(permissions, codes)
}

export function isConfigNavPath(path: string): boolean {
  return path.includes("/config")
}

/** Cargos (TeamOps) do Product Owner (Externo): PO que só enxerga os projetos onde é o
 * responsável. As visões consolidadas do portfólio ficam fora do menu dele — e o backend
 * responde 403 nesses endpoints, então isto é só o espelho da regra na navegação. */
export const EXTERNAL_PO_POSITION_SLUGS: readonly string[] = ["po_externo", "product_owner_externo"]

/** Módulos inteiros vedados ao PO Externo — espelha PO_EXTERNAL_BLOCKED_MODULES
 * (backend/app/core/dependencies.py), que responde 403 nesses módulos. */
export const EXTERNAL_PO_BLOCKED_MODULES: readonly string[] = ["teamops", "indicadores", "rtd"]

export function isExternalProductOwner(
  user: { role?: string; position_slug?: string | null } | null | undefined,
): boolean {
  if (!user) return false
  if (user.role === "super_admin" || user.role === "company_admin") return false
  return EXTERNAL_PO_POSITION_SLUGS.includes((user.position_slug ?? "").trim())
}

/** Cargos de coordenação/gestão — mesmo critério do backend (`_is_coordination` em
 *  projetos/service.py): palavra-chave no slug do Cargo, cobre cargos customizados. */
const COORDINATION_CARGO_TOKENS: readonly string[] = ["coord", "administrativ", "gerente", "gestor", "diretor"]

/** Coordenação para as regras de board (ex.: mover US de outro responsável): admin da
 *  empresa ou Pessoa com Cargo de coordenação/gestão (Coordenador, Administrativo, Gerente). */
export function isCoordination(
  user: { role?: string; position_slug?: string | null } | null | undefined,
): boolean {
  if (!user) return false
  if (user.role === "super_admin" || user.role === "company_admin") return true
  const slug = (user.position_slug ?? "").trim().toLowerCase()
  return COORDINATION_CARGO_TOKENS.some((t) => slug.includes(t))
}

export const TEAMOPS_PEOPLE_MANAGER_SLUGS: readonly string[] = [
  "coordenador",
  "administrativo_coordenacao",
  "coord_de_arq_dev_e_sustenta_o",
  "administrativo",
]

export function canManageTeamopsPeople(
  user: { role?: string; position_slug?: string | null; permissions?: string[] } | null | undefined,
): boolean {
  if (!user) return false
  if (user.role === "super_admin" || user.role === "company_admin") return true
  return (
    TEAMOPS_PEOPLE_MANAGER_SLUGS.includes((user.position_slug ?? "").trim()) &&
    hasPermission(user.permissions, "teamops.person.manage")
  )
}

/** Nível de acesso de um usuário a um kanban (funil) conforme o access_control por função. */
export type FunnelAccessLevel = "manage" | "view" | "none"

export function funnelAccessLevel(
  accessControl: Record<string, string> | null | undefined,
  user: { role?: string; role_id?: string | null; permissions?: string[] } | null | undefined,
): FunnelAccessLevel {
  // Admins (e curingas) sempre gerenciam.
  if (!user) return "manage"
  if (user.role === "super_admin" || user.role === "company_admin") return "manage"
  if (user.permissions?.includes("*")) return "manage"
  if (!accessControl || !user.role_id) return "manage"
  const level = accessControl[user.role_id]
  return level === "view" || level === "none" ? level : "manage"
}
