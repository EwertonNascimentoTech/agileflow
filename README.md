# Kore 2.0

Plataforma SaaS modular para gestão empresarial. Cada empresa (tenant) ativa os módulos que precisa — CRM, Propostas, Financeiro, PDV — e opera em ambiente completamente isolado dentro do mesmo banco de dados.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| **API** | FastAPI 0.115 + Uvicorn (Python 3.12) |
| **Banco** | PostgreSQL 16 — schema-per-tenant |
| **ORM** | SQLAlchemy 2.0 async (asyncpg) + Alembic |
| **Filas** | Celery + RabbitMQ |
| **Cache** | Redis 7 |
| **Storage** | MinIO (S3-compatible) |
| **Auth** | JWT (access + refresh) + RBAC por módulo |
| **Frontend** | React 18 + Vite + TypeScript + Tailwind v3 |
| **UI** | shadcn/ui (Radix) + lucide-react |
| **Deploy** | Docker Compose (dev) |

---

## Módulos disponíveis

| Módulo | Slug | Descrição |
|--------|------|-----------|
| Atendimento (CRM) | `atendimento` | Kanban, clientes, omnichannel (WhatsApp/Instagram), tarefas, automações |
| Propostas e Contratos | `propostas_contratos` | Propostas versionadas, templates, assinatura eletrônica, contratos |

Novos módulos seguem o guia em [MODULES.md](MODULES.md).

---

## Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) + [Docker Compose](https://docs.docker.com/compose/) v2
- Porta 80, 8000, 5432, 6379, 5672, 9000 livres

---

## Subindo o ambiente

### 1. Clonar e configurar

```bash
git clone <repo-url>
cd Kore2.0

cp .env.example .env
# Edite .env com suas senhas (mínimo: POSTGRES_PASSWORD, JWT_SECRET_KEY, etc.)
```

### 2. Subir todos os serviços

```bash
docker compose up -d --build
```

### 3. Rodar migrations do schema público

```bash
docker exec saas_api alembic upgrade head
```

A API aplica automaticamente no startup:
- Registro dos módulos no registry
- Migrations idempotentes em todos os schemas de tenant existentes

### 4. Acessar

| Serviço | URL |
|---------|-----|
| Aplicação | http://localhost |
| API / Swagger | http://localhost:8000/docs |
| RabbitMQ Management | http://localhost:15672 |
| Celery Flower | http://localhost:5555 |
| MinIO Console | http://localhost:9001 |

**Login padrão (super admin seed):**
```
Email:  admin@kore.com
Senha:  kore@2026
```

---

## Estrutura do repositório

```
Kore2.0/
├── backend/
│   ├── app/
│   │   ├── main.py                  # App FastAPI, lifespan, routers
│   │   ├── core/
│   │   │   ├── config.py            # Pydantic Settings — lê .env
│   │   │   ├── database.py          # Engine async, Base/TenantBase, get_db
│   │   │   ├── security.py          # JWT, bcrypt, guards RBAC
│   │   │   ├── dependencies.py      # require_module() → ModuleContext
│   │   │   ├── permissions.py       # Sync de permissions no startup
│   │   │   ├── tenant_migrations.py # DDL idempotente por tenant (sem Alembic)
│   │   │   ├── celery_app.py        # Celery + beat schedule
│   │   │   ├── storage.py           # Cliente MinIO
│   │   │   └── limiter.py           # slowapi rate limiter
│   │   └── modules/
│   │       ├── super_admin/         # Registry de módulos, planos, tenants, usuários
│   │       ├── company/             # Endpoints escopados à empresa logada
│   │       ├── atendimento/         # Módulo CRM/Omnichannel
│   │       ├── propostas_contratos/ # Módulo de Propostas e Contratos
│   │       └── integrations/        # Webhooks WhatsApp/Instagram
│   ├── alembic/                     # Migrations do schema public
│   │   └── versions/
│   ├── tests/                       # pytest + httpx async
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # Roteamento principal
│   │   ├── api/                     # Clientes axios por módulo
│   │   ├── components/              # UI compartilhada (shadcn, EmptyState, etc.)
│   │   ├── contexts/                # AuthContext, ThemeContext
│   │   ├── lib/                     # utils, toast
│   │   └── modules/
│   │       ├── auth/                # Login, ForgotPassword
│   │       ├── super-admin/         # Painel do Super Admin
│   │       ├── company/             # Painel da Empresa
│   │       ├── atendimento/         # Kanban, clientes, config
│   │       └── propostas_contratos/ # Propostas, contratos, templates
│   ├── Dockerfile                   # multi-stage: node build → nginx
│   └── nginx.conf                   # SPA fallback + proxy /api/ → api:8000
│
├── docs/
│   ├── ROADMAP.md                   # Status de fases e próximos passos
│   └── MODULES.md                   # Guia para criar novos módulos
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Multitenancy — como funciona

Cada empresa tem um **schema isolado** no PostgreSQL (`tenant_<slug>`). As tabelas globais (usuários, planos, módulos) ficam no schema `public`.

```
public
 ├── modules        (registry de módulos da plataforma)
 ├── plans          (planos comerciais)
 ├── tenants        (empresas cadastradas)
 ├── users          (todos os usuários)
 └── ...

tenant_acme
 ├── attendances    (atendimentos da empresa Acme)
 ├── clients
 ├── proposals
 └── ...

tenant_beta
 ├── attendances    (dados isolados da empresa Beta)
 └── ...
```

Migrations de tenant são gerenciadas por `tenant_migrations.py` (DDL idempotente, sem Alembic) e aplicadas automaticamente no startup para todos os tenants existentes.

---

## Hierarquia de usuários

| Role | Acesso |
|------|--------|
| `super_admin` | Plataforma inteira — gerencia tenants, planos, módulos |
| `company_admin` | Empresa própria — gerencia usuários, roles, configurações |
| `company_user` | Funcionalidades do tenant conforme permissions da role |

---

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
# App
PROJECT_NAME="Kore SaaS"
DEBUG=true
JWT_SECRET_KEY=troque-por-uma-chave-aleatoria-longa

# Banco
POSTGRES_USER=saas_user
POSTGRES_PASSWORD=sua_senha_aqui
POSTGRES_DB=saas_db
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest

# MinIO
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=kore-attachments

# JWT
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS
ALLOWED_ORIGINS=["http://localhost","http://localhost:80"]
```

---

## Comandos úteis

```bash
# Subir tudo
docker compose up -d --build

# Parar tudo
docker compose down

# Ver logs da API em tempo real
docker compose logs -f api

# Rodar migrations (após adicionar nova migration Alembic)
docker exec saas_api alembic upgrade head

# Criar nova migration Alembic (schema public)
docker exec saas_api alembic revision --autogenerate -m "descricao"

# Rodar testes
docker exec saas_api pytest

# Rodar testes com cobertura
docker exec saas_api pytest --cov=app --cov-report=term-missing

# Acessar o banco
docker exec -it saas_postgres psql -U saas_user -d saas_db

# Rebuild apenas um serviço
docker compose up -d --build api
docker compose up -d --build frontend
```

---

## Fluxo de desenvolvimento

### Branches

```
main                           ← produção / releases
feature/modulo-<slug>          ← novo módulo (cada dev na sua)
fix/<descricao>                ← correções
```

### Criar novo módulo

Siga o guia completo em **[MODULES.md](MODULES.md)**. Resumo:

1. Criar `backend/app/modules/<slug>/` com `models.py`, `schemas.py`, `service.py`, `permissions.py`, `api/routes.py`
2. Registrar o model em `database.py` → `create_tenant_tables()`
3. Adicionar step de migration em `tenant_migrations.py`
4. Registrar router em `main.py` + adicionar em `_seed_known_modules()`
5. Criar `frontend/src/modules/<slug>/` com páginas e cliente de API
6. Registrar rotas em `App.tsx`

### Migrations

- **Schema `public`** (tabelas globais): use Alembic normalmente.
- **Schema de tenant** (tabelas de negócio): use `tenant_migrations.py` com DDL idempotente — nunca Alembic.

---

## Testes

```bash
# Todos os testes
docker exec saas_api pytest -v

# Módulo específico
docker exec saas_api pytest tests/test_proposals.py -v

# Com cobertura
docker exec saas_api pytest --cov=app
```

Os testes usam `httpx.AsyncClient` com `ASGITransport` — sem servidor real necessário.

---

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [MODULES.md](MODULES.md) | Guia completo para criar novos módulos |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Status das fases e backlog |
| http://localhost:8000/docs | Swagger UI interativo (apenas `DEBUG=true`) |
