# 04 — Navegação, papéis e permissões

## A. Metadados do processo

- *Nome do processo:* Autorização em camadas e navegação do shell
- *Trigger:* Login / `/auth/me`; acesso a rotas frontend; dependency `require_permission` / guards de role
- *Objetivo:* Restringir rotas e menus conforme `UserRole`, Role do tenant, permissões por código e módulos ativos

## B. Matriz RACI simplificada

| Ator/Sistema | Papel no processo | Responsabilidade |
| :--- | :--- | :--- |
| Super Admin | A | Opera `/admin/*`; registry, planos, tenants |
| Company Admin | A | Usuários, funções, branding; bypass de permissões granulares |
| Company User | R | Opera módulos conforme `role_permissions` |
| `ProtectedRoute` | C | Filtra por `allowedRoles` |
| `moduleNavConfig` | C | Itens de sidebar por slug + `requiredAnyPermission` |
| TeamOps Position | C | Cargo pode ligar a Role (`position.role_id`) |

## C. Fluxograma (Mermaid)

```mermaid
flowchart TD
  A([Utilizador autenticado]) --> B{role}
  B -->|super_admin| C[/admin dashboard tenants modules admins/]
  B -->|company_admin / company_user| D[/app shell AppLayout/]
  D --> E[GET /company/admin/me/tenant]
  E --> F[active_modules]
  F --> G{admin?}
  G -->|sim| H[Mostra todos módulos ativos]
  G -->|não| I[Filtra por prefixo de permission]
  I --> J{role_name basic?}
  J -->|sim| K[Atalhos Nova / Minhas Solicitações]
  J -->|não| L[ModuleRail + ContextualSidebar]
  L --> M{rota /config?}
  M -->|sim| N[ModuleConfigGuard]
  N -->|sem perm| X1[Bloqueia config]
  N -->|ok| O[Página config]
  M -->|não| P[Página do módulo]

  Q([API require_permission code]) --> R{super_admin ou company_admin?}
  R -->|sim| S([Passa])
  R -->|não| T{role_id?}
  T -->|não| X2[403 sem função]
  T -->|sim| U{RolePermission?}
  U -->|não| X3[403 sem permissão]
  U -->|sim| S

  style A fill:#22c55e,color:#fff
  style C fill:#22c55e,color:#fff
  style S fill:#22c55e,color:#fff
  style B fill:#eab308,color:#000
  style G fill:#eab308,color:#000
  style J fill:#eab308,color:#000
  style M fill:#eab308,color:#000
  style R fill:#eab308,color:#000
  style T fill:#eab308,color:#000
  style U fill:#eab308,color:#000
  style X1 fill:#ef4444,color:#fff
  style X2 fill:#ef4444,color:#fff
  style X3 fill:#ef4444,color:#fff
  style E fill:#3b82f6,color:#fff
  style H fill:#3b82f6,color:#fff
  style I fill:#3b82f6,color:#fff
```

## D. Bifurcações e regras

| Condição | Sucesso | Exceção | Código referência |
| :--- | :--- | :--- | :--- |
| Role não permitida na rota | — | Redirect `/dashboard` | `ProtectedRoute` |
| Sem auth | — | Redirect `/login` | `ProtectedRoute` |
| `company_user` sem `role_id` | — | 403 `"Usuário sem função atribuída."` | `require_permission` |
| Sem código na Role | — | 403 com nome do code | `require_permission` |
| Admins | `permissions: ["*"]` no payload | — | `_attach_role_name` |
| Limite de usuários do plano | — | Erro no POST user | `company` routes |

### Camadas (resumo)

1. `UserRole` — `require_super_admin` / `require_company_admin` / `require_authenticated`
2. Catálogo `module_permissions` — sync no startup
3. `roles` + `role_permissions` por tenant
4. `require_permission(code)`
5. `require_module(slug)`
6. Permissões por cargo TeamOps
7. Checks inline (ex.: projetos `_has_permission`)

## E. Dicionário de dados

| Tipo | Valores / campos |
| :--- | :--- |
| `UserRole` | `super_admin`, `company_admin`, `company_user` |
| `RolePermission` | `role_id`, `permission_code` |
| Frontend `User` | `permissions: string[]`, `role_name`, `position_slug` |
| Nav item | `to`, `label`, `requiredAnyPermission?` |

Exemplos de codes: `projetos.task.manage`, `teamops.person.view`, `rtd.manage`, `produtos.view`, `indicadores.manage`.

## Rastreabilidade

- `backend/app/core/security.py::require_super_admin`
- `backend/app/core/security.py::require_company_admin`
- `backend/app/core/dependencies.py::require_permission`
- `backend/app/core/permissions.py::sync_permissions`
- `frontend/src/components/ProtectedRoute.tsx`
- `frontend/src/modules/crm/AppLayout.tsx`
- `frontend/src/modules/crm/moduleNavConfig.ts`
- `frontend/src/components/ModuleConfigGuard.tsx`
- `frontend/src/lib/permissions.ts`
