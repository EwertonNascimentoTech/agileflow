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
