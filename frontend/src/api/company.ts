import api from "./client"
import type { User, Role, RoleCreate, RoleUpdate, ModulePermission } from "@/types"

export type ModuleSlug = string

export interface ActiveModule {
  slug: string
  name: string
  description: string | null
  icon: string | null
  color: string
}

export interface MyTenant {
  id: string
  name: string
  slug: string
  is_active: boolean
  plan_expires_at: string | null
  active_modules: ActiveModule[]
}

export interface UserCreatePayload {
  full_name: string
  email: string
  password: string
  role?: "company_admin" | "company_user"
  role_id?: string | null
}

export interface UserUpdatePayload {
  full_name?: string
  is_active?: boolean
  role?: "company_admin" | "company_user"
  role_id?: string | null
}

export const companyApi = {
  getMyTenant: () =>
    api.get<MyTenant>("/company/me/tenant").then(r => r.data),

  listUsers: (params?: { search?: string; active_only?: boolean }) =>
    api.get<User[]>("/company/users", { params }).then(r => r.data),

  createUser: (data: UserCreatePayload) =>
    api.post<User>("/company/users", data).then(r => r.data),

  updateUser: (id: string, data: UserUpdatePayload) =>
    api.patch<User>(`/company/users/${id}`, data).then(r => r.data),

  // ── Permissions / Roles ─────────────────────
  listPermissions: () =>
    api.get<ModulePermission[]>("/company/permissions").then(r => r.data),

  listRoles: () =>
    api.get<Role[]>("/company/roles").then(r => r.data),

  getRole: (id: string) =>
    api.get<Role>(`/company/roles/${id}`).then(r => r.data),

  createRole: (data: RoleCreate) =>
    api.post<Role>("/company/roles", data).then(r => r.data),

  updateRole: (id: string, data: RoleUpdate) =>
    api.patch<Role>(`/company/roles/${id}`, data).then(r => r.data),

  deleteRole: (id: string) =>
    api.delete<void>(`/company/roles/${id}`).then(r => r.data),
}

// ── Notifications API ─────────────────────────

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  created_at: string
}

export const notificationsApi = {
  list: (params?: { limit?: number; unread_only?: boolean }) =>
    api.get<Notification[]>("/company/notifications", { params }).then(r => r.data),
  unreadCount: () =>
    api.get<{ count: number }>("/company/notifications/unread-count").then(r => r.data),
  markRead: (id: string) =>
    api.post<void>(`/company/notifications/${id}/read`).then(r => r.data),
  markAllRead: () =>
    api.post<void>("/company/notifications/read-all").then(r => r.data),
}
