import type { ProjectStatus } from "@/api/projetos"
import { funnelAccessLevel } from "@/lib/permissions"

/** Lista vazia/null = qualquer função pode (mesma regra do backend). */
export function roleAllowedForStatusMove(
  user: { role?: string; role_id?: string | null } | null | undefined,
  roleIds: string[] | null | undefined,
): boolean {
  if (!roleIds?.length) return true
  if (!user) return true
  if (user.role === "super_admin" || user.role === "company_admin") return true
  if (!user.role_id) return true
  return roleIds.includes(user.role_id)
}

export function canMoveBetweenStatuses(
  user: { role?: string; role_id?: string | null } | null | undefined,
  fromStatus: ProjectStatus | undefined,
  toStatus: ProjectStatus | undefined,
): boolean {
  if (!fromStatus || !toStatus) return false
  const canLeave = roleAllowedForStatusMove(user, fromStatus.move_out_role_ids ?? null)
  const canEnter = roleAllowedForStatusMove(user, toStatus.move_in_role_ids ?? null)
  return canLeave && canEnter
}

/** Pode editar card na etapa atual (move_in e/ou move_out da etapa incluem a função). */
export function roleCanWorkInStatus(
  user: { role?: string; role_id?: string | null } | null | undefined,
  status: ProjectStatus | undefined,
): boolean {
  if (!status) return false
  const moveIn = status.move_in_role_ids
  const moveOut = status.move_out_role_ids
  const hasGate = (moveIn?.length ?? 0) > 0 || (moveOut?.length ?? 0) > 0
  if (!hasGate) return false
  const inOk = !moveIn?.length || roleAllowedForStatusMove(user, moveIn)
  const outOk = !moveOut?.length || roleAllowedForStatusMove(user, moveOut)
  return inOk && outOk
}

/** Pode editar dados do card no board/drawer. */
export function canEditTaskOnBoard(
  user: { role?: string; role_id?: string | null } | null | undefined,
  currentStatus: ProjectStatus | undefined,
  funnelAccessControl: Record<string, string> | null | undefined,
  isAssignee: boolean,
): boolean {
  const level = funnelAccessLevel(funnelAccessControl, user)
  if (level === "none") return false
  if (level === "manage") return true
  if (isAssignee) return true
  return roleCanWorkInStatus(user, currentStatus)
}

/** Pode arrastar/mover card no board: manage no funil, responsável do card, ou permissão por etapa. */
export function canMoveTaskOnBoard(
  user: { role?: string; role_id?: string | null } | null | undefined,
  fromStatus: ProjectStatus | undefined,
  toStatus: ProjectStatus | undefined,
  funnelAccessControl: Record<string, string> | null | undefined,
  isAssignee: boolean,
): boolean {
  const level = funnelAccessLevel(funnelAccessControl, user)
  if (level === "none") return false
  if (level === "manage") return true
  if (isAssignee) return true
  return canMoveBetweenStatuses(user, fromStatus, toStatus)
}
