export type UserRole = "super_admin" | "company_admin" | "company_user"

// Slug é dinâmico — qualquer string registrada na tabela `modules` no backend.
export type ModuleSlug = string

// ── Modules registry ───────────────────────────

export interface Module {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  color: string
  backend_path: string
  frontend_path: string
  is_active: boolean
  created_at: string
}

export interface ModuleCreate {
  slug: string
  name: string
  description?: string
  icon?: string
  color?: string
  backend_path: string
  frontend_path: string
  is_active?: boolean
}

export interface ModuleUpdate {
  name?: string
  description?: string
  icon?: string
  color?: string
  backend_path?: string
  frontend_path?: string
  is_active?: boolean
}

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  role_id: string | null
  tenant_id: string | null
  is_active: boolean
  last_login: string | null
  created_at: string
}

// ── Permissions / Roles ────────────────────────

export interface ModulePermission {
  code: string
  name: string
  description: string | null
  module_slug: string
}

export interface Role {
  id: string
  tenant_id: string
  name: string
  description: string | null
  is_system: boolean
  permissions: string[]
  user_count: number
  created_at: string
}

export interface RoleCreate {
  name: string
  description?: string
  permissions: string[]
}

export interface RoleUpdate {
  name?: string
  description?: string
  permissions?: string[]
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export interface LoginRequest {
  email: string
  password: string
}

// ── Plans ──────────────────────────────────────

export interface Plan {
  id: string
  name: string
  description: string | null
  price: number
  max_users: number
  is_active: boolean
  modules: ModuleSlug[]
  created_at: string
}

export interface PlanCreate {
  name: string
  description?: string
  price: number
  max_users: number
  modules: ModuleSlug[]
}

export interface PlanUpdate {
  name?: string
  description?: string
  price?: number
  max_users?: number
  is_active?: boolean
  modules?: ModuleSlug[]
}

// ── Tenants ────────────────────────────────────

export interface TenantModule {
  module_slug: ModuleSlug
  is_active: boolean
  activated_at: string
}

export interface TenantSummary {
  id: string
  name: string
  slug: string
  is_active: boolean
  plan_id: string | null
  created_at: string
}

export interface Tenant {
  id: string
  name: string
  slug: string
  schema_name: string
  plan_id: string | null
  is_active: boolean
  plan_expires_at: string | null
  active_modules: TenantModule[]
  created_at: string
}

export interface TenantCreate {
  name: string
  slug: string
  plan_id?: string
  plan_expires_at?: string
}

export interface TenantUpdate {
  name?: string
  plan_id?: string | null
  plan_expires_at?: string | null
  is_active?: boolean
}

export interface ApiError {
  detail: string | { msg: string; type: string }[]
}
