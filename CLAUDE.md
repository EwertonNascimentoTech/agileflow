# CLAUDE.md — AgileFlow (contexto vivo)

Lido em toda sessão. **Não deletar.** Detalhe e histórico: [`.claude/`](.claude/README.md).

Se o pedido for funcionalidade nova: ler `.claude/invariantes.md` e o trecho de `.claude/sistema-atual.md` **antes** de editar. Ao terminar, **acrescentar** entrada em `.claude/historico.md` e atualizar inventário/invariantes se nasceu tela, rota ou regra.

---

## O que é

Plataforma **AgileFlow** (código ainda cita Kore/SaaS): processos (kanban), times/capacidade, produtos, indicadores e RTD. Tenant operacional: `tenant_ss` (FIEA).

O texto antigo deste arquivo descrevia só Atendimento/CRM. Isso **não é mais o produto**. CRM/estoque/PDV/atendimento estão **desativados** no seed.

---

## Stack

- **Backend:** FastAPI + Uvicorn (Python 3.12)
- **Banco:** PostgreSQL 16, schema-per-tenant
- **ORM:** SQLAlchemy 2.0 async (asyncpg) + Alembic (`public` only)
- **Tenant DDL:** `TenantBase.metadata` + `core/tenant_migrations.py` (idempotente no startup)
- **Cache / filas / storage:** Redis 7, RabbitMQ + Celery, MinIO
- **Auth:** JWT + refresh; RBAC por cargo → função → permissão
- **Frontend:** React 18 + Vite + TypeScript + Tailwind v3 + shadcn manual + dnd-kit + RHF/zod
- **Deploy:** Docker Compose. `saas_frontend` :18082 (nginx **build estático**), `saas_api` :18084 (código **não** é volume). Público: `agileflow.tdsistemafiea.com.br`. UI nova → rebuild frontend. Python novo → rebuild api.

---

## Módulos ativos

`projetos` (Processos) · `teamops` · `produtos` · `indicadores` · `rtd` · `documentacao`

Desativados (não reativar sem pedido): `crm`, `estoque`, `pdv`, `atendimento`, `propostas_contratos`.

Routers: `backend/app/main.py`. Inventário de telas/APIs: `.claude/sistema-atual.md`.

---

## Hierarquia (UserRole)

```python
SUPER_ADMIN = "super_admin"      # plataforma; /admin
COMPANY_ADMIN = "company_admin"  # empresa
COMPANY_USER = "company_user"    # operacional
```

`assigned_to` em Processos = **Person.id** (TeamOps), não `users.id`.  
PO Externo: só os projetos dele; sem Pessoas/Indicadores/RTD/Capacidade/Relatórios.

Enums SQLAlchemy: sempre `SAEnum(..., values_callable=lambda obj: [e.value for e in obj])`.

---

## Multitenancy

- `public`: modules, plans, tenants, users, alembic_version, …
- Tenant: `tenant_<slug>` (ex. `tenant_ss`)
- `require_module(slug)` → `ModuleContext(db, user, schema)` com `search_path` certo
- **Pool reuse:** `get_db()` / `get_current_user()` forçam `SET search_path TO public`; `get_tenant_db()` reseta no `finally`

---

## Regras que o pedido novo não pode apagar

Lista completa: `.claude/invariantes.md`. Em resumo:

- Feature ≠ kanban User Story e vice-versa (título `US-`/`FEAT-` conta).
- Cascata de funil não arrasta US para Features.
- Capacidade de Projetos = só User Story; Operação Assistida e Chamados são fatias separadas (divisão da jornada em Pessoas: Projetos % + OA %, Chamados = o resto). Clique no dia abre modal (não fechar no mesmo clique); grade ancora em hoje.
- Import Excel Features/US: Config → Cronograma **e** modal do Projeto/Programa nas raias de planejamento.
- Contratação/conversão Prospectar → Projeto/Programa: não perder `origin_task_id` nem travar/duplicar Contratar.
- Services não importam routes; commit no service; UUID PK; sem `<SelectItem value="">`.

---

## Convenções de código

- Services nunca importam `routes.py`. Routes só delegam.
- `selectinload(...)` para relações usadas na response.
- `updated_at = datetime.utcnow()` no service.
- Slug módulo: `[a-z0-9_]`. Slug tenant: `[a-z0-9-]`.
- Zod + `z.coerce.number()`: cast `as Resolver<FormData>`.
- Ícone de módulo: string lucide resolvida em runtime.

---

## Como adicionar módulo

1. `backend/app/modules/<slug>/` (models com `TenantBase`, schemas, service, routes). Registrar em `main.py` + `require_module`.
2. Importar models em `create_tenant_tables()` / step em `tenant_migrations.py`.
3. `frontend/src/modules/<slug>/` + rotas em `App.tsx` + item em `moduleNavConfig.ts`.
4. Entrada em `KNOWN_MODULES` no `main.py` (seed).
5. Atualizar `.claude/sistema-atual.md` e `historico.md`.

---

## Docs existentes (não substituir — complementar)

- `docs/usuario/` · `docs/processo/` · `docs/técnico/` · `docs/MODULES.md`
- Processo/cronograma: `docs/processo/04-regras-negocio-fluxos-cronograma.md`
