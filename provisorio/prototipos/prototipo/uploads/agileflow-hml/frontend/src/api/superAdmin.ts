import api from "./client"
import type {
  Tenant, TenantSummary, TenantCreate, TenantUpdate,
  TenantModule, ModuleSlug, User,
  Module, ModuleCreate, ModuleUpdate,
} from "@/types"

// ── Modules registry ──────────────────────────

export const modulesApi = {
  list: (activeOnly = false) =>
    api.get<Module[]>("/super-admin/modules", { params: { active_only: activeOnly } }).then(r => r.data),

  get: (id: string) =>
    api.get<Module>(`/super-admin/modules/${id}`).then(r => r.data),

  create: (data: ModuleCreate) =>
    api.post<Module>("/super-admin/modules", data).then(r => r.data),

  update: (id: string, data: ModuleUpdate) =>
    api.patch<Module>(`/super-admin/modules/${id}`, data).then(r => r.data),

  remove: (id: string) =>
    api.delete<void>(`/super-admin/modules/${id}`).then(r => r.data),
}

// ── Tenants ───────────────────────────────────

export const tenantsApi = {
  list: (params?: { skip?: number; limit?: number; active_only?: boolean }) =>
    api.get<TenantSummary[]>("/super-admin/tenants", { params }).then(r => r.data),

  get: (id: string) =>
    api.get<Tenant>(`/super-admin/tenants/${id}`).then(r => r.data),

  create: (data: TenantCreate) =>
    api.post<Tenant>("/super-admin/tenants", data).then(r => r.data),

  update: (id: string, data: TenantUpdate) =>
    api.patch<Tenant>(`/super-admin/tenants/${id}`, data).then(r => r.data),

  activateModule: (tenantId: string, moduleSlug: ModuleSlug) =>
    api.post<TenantModule>(`/super-admin/tenants/${tenantId}/modules`, { module_slug: moduleSlug }).then(r => r.data),

  deactivateModule: (tenantId: string, moduleSlug: ModuleSlug) =>
    api.delete<TenantModule>(`/super-admin/tenants/${tenantId}/modules/${moduleSlug}`).then(r => r.data),

  listUsers: (tenantId: string) =>
    api.get<User[]>(`/super-admin/tenants/${tenantId}/users`).then(r => r.data),

  createAdmin: (tenantId: string, data: { email: string; full_name: string; password: string }) =>
    api.post<User>(`/super-admin/tenants/${tenantId}/admin`, data).then(r => r.data),
}

// ── Users (Super Admin only) ─────────────────

export const usersApi = {
  update: (id: string, data: { full_name?: string; is_active?: boolean; role?: "company_admin" | "company_user" }) =>
    api.patch<User>(`/super-admin/users/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/super-admin/users/${id}`).then(r => r.data),
}

// ── Super Admins ──────────────────────────────

export const adminsApi = {
  list: () =>
    api.get<User[]>("/super-admin/admins").then(r => r.data),
  create: (data: { email: string; full_name: string; password: string }) =>
    api.post<User>("/super-admin/admins", data).then(r => r.data),
  update: (id: string, data: { full_name?: string; is_active?: boolean }) =>
    api.patch<User>(`/super-admin/admins/${id}`, data).then(r => r.data),
  remove: (id: string) =>
    api.delete<void>(`/super-admin/admins/${id}`).then(r => r.data),
}

// ── Platform Stats ────────────────────────────

export interface PlatformStats {
  total_tenants: number
  active_tenants: number
  inactive_tenants: number
  mrr: number
  expiring_soon: number
  top_modules: { slug: string; name: string; tenant_count: number }[]
  recent_tenants: { id: string; name: string; slug: string; is_active: boolean; created_at: string }[]
}

export const statsApi = {
  get: () => api.get<PlatformStats>("/super-admin/stats").then(r => r.data),
}
