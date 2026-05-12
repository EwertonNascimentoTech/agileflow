# CLAUDE.md — Contexto do Projeto Kore 2.0

Este arquivo é lido automaticamente pelo Claude Code a cada sessão.
Não deletar. Atualizar conforme o projeto evolui.

---

## Stack

- **Backend:** FastAPI + Uvicorn (Python 3.12)
- **Banco:** PostgreSQL 16 com schema-per-tenant
- **ORM:** SQLAlchemy 2.0 async (asyncpg) + Alembic
- **Cache:** Redis 7
- **Filas:** RabbitMQ + Celery (configuração ainda pendente)
- **Storage:** MinIO (S3-compatible)
- **Auth:** JWT com RBAC por módulo
- **Frontend:** React 18 + Vite + TypeScript + Tailwind v3 + shadcn/ui (componentes manuais)
- **Frontend libs:** react-hook-form + zod, @dnd-kit/core (kanban), axios, react-router v6, lucide-react
- **Deploy:** Docker Compose (dev rodando) / Kubernetes (prod, futuro)

---

## Layout do repositório

```
Kore2.0/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py        # Pydantic Settings — lê .env
│   │   │   ├── database.py      # engine async, get_db, get_tenant_db, TenantBase
│   │   │   ├── security.py      # JWT, bcrypt, guards de RBAC
│   │   │   └── dependencies.py  # require_module(slug) → ModuleContext
│   │   └── modules/
│   │       ├── super_admin/     # registry global, planos, tenants, módulos, users
│   │       ├── company/         # endpoints company-scope (/me/tenant, /users)
│   │       └── atendimento/     # primeiro módulo de negócio (CRM/Omnichannel)
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   │       ├── 001_initial_tables.py
│   │       └── 002_modules_registry.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api/                 # client axios + clients por módulo
│   │   ├── components/          # ui/ (shadcn), ProtectedRoute, EmptyState
│   │   ├── contexts/            # AuthContext
│   │   ├── lib/utils.ts
│   │   ├── types/index.ts
│   │   └── modules/
│   │       ├── auth/            # LoginPage
│   │       ├── super-admin/     # AdminLayout + páginas
│   │       ├── company/         # CompanyLayout + páginas
│   │       └── atendimento/     # módulo de atendimento (kanban, atendimentos, clientes, configs)
│   ├── Dockerfile               # multi-stage: node build → nginx
│   └── nginx.conf               # SPA fallback + proxy /api/ → api:8000
├── docker-compose.yml
└── .env
```

---

## Hierarquia de usuários (UserRole)

1. **`super_admin`** — opera a plataforma, cadastra empresas, planos e módulos
2. **`company_admin`** — admin da empresa, cadastra usuários, ativa/configura módulos
3. **`company_user`** — usuário operacional do tenant

---

## Multitenancy — schema-per-tenant

- **Tabelas globais** ficam no schema `public`: `modules`, `plans`, `plan_modules`, `tenants`, `tenant_modules`, `users`, `alembic_version`
- **Cada tenant** ganha um schema próprio: `tenant_<slug>` (ex: `tenant_acme`)
- `create_tenant_schema(schema_name)` é chamado automaticamente ao criar tenant
- `create_tenant_tables(schema_name)` cria as tabelas registradas em `TenantBase.metadata` no schema do tenant
- `get_tenant_db(schema_name)` seta `search_path TO {schema}, public` na sessão
- `require_module(slug)` produz `ModuleContext(db, user, schema)` com `search_path` já apontado

⚠️ **Pool reuse / search_path:** asyncpg mantém estado de sessão entre requests. Por isso:
- `get_db()` força `SET search_path TO public` na entrada
- `get_tenant_db()` reseta para `public` no `finally`
- `get_current_user()` em `security.py` também faz `SET search_path TO public` antes de consultar

---

## Modelos públicos (schema `public`)

### Module (registry global) — adicionado na migration 002
Lista os módulos **desenvolvidos** na plataforma. Só módulos cadastrados aqui podem ser incluídos em planos / ativados em tenants.
Campos: `id`, `slug` (unique), `name`, `description`, `icon` (lucide-react), `backend_path`, `frontend_path`, `is_active`.
- Atendimento já vem cadastrado pelo seed da 002.
- Validação centralizada em `ModuleService.validate_slugs(db, [slug...])`.

### Plan
Planos comerciais. Campos: `id`, `name`, `description`, `price`, `max_users`, `is_active`.

### PlanModule
Módulos incluídos no plano. `plan_id` + `module_slug` (varchar, FK lógica para `modules.slug`).

### Tenant
Empresas. Campos: `id`, `name`, `slug`, `schema_name`, `plan_id`, `is_active`, `plan_expires_at`.

### TenantModule
Módulos ativos no tenant (avulso, independente do plano). `tenant_id` + `module_slug` (varchar) + `is_active` + `activated_at`.

### User
Todos os usuários da plataforma. `tenant_id = NULL` → super_admin. `role` é enum `userrole`.

⚠️ **Importante:** o enum PostgreSQL `moduleslug` foi **removido** na migration 002. `module_slug` agora é `varchar(50)`. A validação acontece via `modules` table.

---

## Enum único restante

```python
class UserRole(str, enum.Enum):
    SUPER_ADMIN   = "super_admin"
    COMPANY_ADMIN = "company_admin"
    COMPANY_USER  = "company_user"
```

Para enums Python mapeados em colunas SQLAlchemy, sempre usar:
```python
SAEnum(UserRole, values_callable=lambda obj: [e.value for e in obj])
```
(senão o SQLAlchemy persiste o `.name` ao invés do `.value`).

---

## Guards de RBAC (`backend/app/core/security.py`)

```python
require_super_admin       # Apenas super_admin
require_company_admin     # super_admin ou company_admin
require_authenticated     # Qualquer usuário ativo
```

E em `core/dependencies.py`:
```python
require_module(slug: str)  # valida registry + tenant ativo + módulo ativo no tenant
                           # retorna ModuleContext(db, user, schema)
```

---

## Rotas implementadas

### Auth (`/api/v1/auth`)
- `POST /login` — login unificado
- `GET  /me` — usuário autenticado

### Super Admin (`/api/v1/super-admin`)
- `GET/POST/GET-{id}/PATCH/DELETE   /modules` — registry de módulos desenvolvidos
- `GET/POST/GET-{id}/PATCH          /plans`
- `GET/POST/GET-{id}/PATCH          /tenants`
- `POST                             /tenants/{id}/modules`
- `DELETE                           /tenants/{id}/modules/{slug}`
- `POST                             /tenants/{id}/admin`
- `POST                             /admins`

### Company (`/api/v1/company`)
- `GET  /me/tenant` — devolve tenant + `active_modules` (com metadata do registry)
- `GET/POST/GET-{id}/PATCH /users`

### Atendimento (`/api/v1/atendimento`) — exige `require_module("atendimento")`
- `GET/POST/PATCH/DELETE /config/statuses` — kanban configurável
- `POST                  /config/statuses/reorder`
- `GET/POST/DELETE       /config/statuses/{id}/transitions`
- `GET/POST/PATCH/DELETE /config/custom-fields`
- `GET/POST/PATCH/DELETE /config/channels` — WhatsApp / Instagram / etc
- `GET/POST/PATCH/DELETE /config/assignment-rules`
- `GET/POST/PATCH/DELETE /clients`
- `GET/POST/PATCH/DELETE /attendances`
- `POST                  /attendances/{id}/status`
- `POST                  /attendances/{id}/assign`
- `GET                   /attendances/{id}/messages`
- `POST                  /attendances/{id}/messages`

---

## Services

- `ModuleService`  — CRUD do registry de módulos + `validate_slugs()`
- `PlanService`    — CRUD de planos (valida slugs no registry)
- `TenantService`  — CRUD de tenants + ativação/desativação de módulos (valida slugs)
- `UserService`    — auth + CRUD de usuários
- `ConfigService`, `ClientService`, `AttendanceService` — atendimento

---

## Migrations Alembic

- `001_initial_tables.py` — schema public (plans, plan_modules, tenants, tenant_modules, users)
- `002_modules_registry.py` — cria `modules`, converte `module_slug` de enum → varchar, dropa enum `moduleslug`, faz seed de Atendimento

Rodar:
```bash
docker exec saas_api alembic upgrade head
```
Alembic usa `DATABASE_URL_SYNC` (psycopg2). Async é só para o app.

---

## Variáveis de ambiente

`backend/app/core/config.py` (pydantic-settings) lê `.env` na raiz.
Propriedades computadas: `DATABASE_URL` (asyncpg), `DATABASE_URL_SYNC` (psycopg2), `REDIS_URL`, `CELERY_BROKER_URL`.

---

## Docker Compose (dev)

```bash
docker-compose up -d --build
docker exec saas_api alembic upgrade head    # se vier migration nova
```

Serviços rodando:
- `saas_postgres` (5432) · `saas_redis` (6379) · `saas_rabbitmq` (5672/15672) · `saas_minio` (9000/9001)
- `saas_api` (FastAPI em 8000)
- `saas_frontend` (nginx servindo build do Vite na porta 80)

URLs locais:
- App: `http://localhost`
- API docs: `http://localhost:8000/docs`
- Super admin seed: `admin@kore.com` / `kore@2026`

---

## Como adicionar um módulo novo

1. **Backend:** criar `backend/app/modules/<slug>/` com `models.py` (usar `TenantBase` para tabelas que ficam no schema do tenant), `schemas.py`, `service.py`, `api/routes.py`. Registrar o router em `app/main.py`. Usar `require_module("<slug>")` como dependency.
2. **Migration de tenant tables (se houver):** importar models em `create_tenant_tables()` em `core/database.py`. Alembic só cobre o schema public — tenant tables vêm de `TenantBase.metadata.create_all()` no momento da criação do tenant.
3. **Frontend:** criar `frontend/src/modules/<slug>/` (Layout + páginas + api client). Registrar rotas em `App.tsx` aninhadas em `/app/modules/<slug>`.
4. **Cadastrar no registry:** logar como Super Admin → **Módulos** → **Cadastrar Módulo**, preencher slug, nome, ícone (lucide-react), `backend_path`, `frontend_path`, marcar ativo.
5. Pronto. Agora o módulo aparece para inclusão em planos e ativação em tenants. O sidebar do company admin mostra automaticamente.

---

## Convenções

- Services nunca importam de `routes.py`. Routes só delegam.
- Sempre `selectinload(...)` para eager loading.
- Commits sempre no service (`await db.commit()`), nunca na route.
- UUID como PK em todas as tabelas.
- `updated_at` atualizado manualmente com `datetime.utcnow()` no service.
- Slug de módulo: lowercase + `[a-z0-9_]`. Slug de tenant: lowercase + `[a-z0-9-]`.
- `<SelectItem value="">` é proibido pelo Radix — usar sentinela `"__none__"` e mapear para `null` no handler.
- TypeScript estrito: `z.coerce.number()` + `zodResolver` precisa de cast `as Resolver<FormData>` (o input type vira `unknown`).
- Frontend: ícones de módulo são strings (nome do componente em `lucide-react`) e resolvidos via `(Icons as Record<string, ElementType>)[name]`.

---

## Próximos passos mapeados

- [ ] Refresh token endpoint + interceptor
- [ ] Implementar Celery (`backend/app/core/celery_app.py`) e workers
- [ ] Configurar client MinIO em `core/storage.py`
- [ ] Middleware que resolve tenant por subdomínio (alternativa ao JWT-only hoje)
- [ ] Próximo módulo de negócio (Financeiro? PDV?)
- [ ] Tests (pytest + httpx async client)
