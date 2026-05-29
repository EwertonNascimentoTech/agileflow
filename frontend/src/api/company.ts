import api from "./client"
import type {
  User as _User,
  Role,
  RoleCreate,
  RoleUpdate,
  ModulePermission,
} from "@/types"

export type User = _User

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

export interface Branding {
  name: string
  logo_url: string | null
  primary_color: string | null
}

export const companyApi = {
  getMyTenant: () =>
    api.get<MyTenant>("/company/admin/me/tenant").then((r) => r.data),

  getBranding: () =>
    api.get<Branding>("/company/admin/branding").then((r) => r.data),

  listUsers: (params?: { search?: string; active_only?: boolean }) =>
    api.get<User[]>("/company/admin/users", { params }).then((r) => r.data),

  createUser: (data: UserCreatePayload) =>
    api.post<User>("/company/admin/users", data).then((r) => r.data),

  updateUser: (id: string, data: UserUpdatePayload) =>
    api.patch<User>(`/company/admin/users/${id}`, data).then((r) => r.data),

  listPermissions: () =>
    api.get<ModulePermission[]>("/company/admin/permissions").then((r) => r.data),

  listRoles: () =>
    api.get<Role[]>("/company/admin/roles").then((r) => r.data),

  getRole: (id: string) =>
    api.get<Role>(`/company/admin/roles/${id}`).then((r) => r.data),

  createRole: (data: RoleCreate) =>
    api.post<Role>("/company/admin/roles", data).then((r) => r.data),

  updateRole: (id: string, data: RoleUpdate) =>
    api.patch<Role>(`/company/admin/roles/${id}`, data).then((r) => r.data),

  deleteRole: (id: string) =>
    api.delete<void>(`/company/admin/roles/${id}`).then((r) => r.data),
}

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
    api.get<Notification[]>("/company/admin/notifications", { params }).then((r) => r.data),
  unreadCount: () =>
    api.get<{ count: number }>("/company/admin/notifications/unread-count").then((r) => r.data),
  markRead: (id: string) =>
    api.post<void>(`/company/admin/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () =>
    api.post<void>("/company/admin/notifications/read-all").then((r) => r.data),
}
