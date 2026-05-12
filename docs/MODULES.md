# Kore 2.0 — Guia de Criação de Módulos

Este documento é o guia oficial para desenvolvedores que vão criar novos módulos.
Leia antes de escrever qualquer linha de código.

---

## Sumário

1. [Visão geral da arquitetura](#visão-geral-da-arquitetura)
2. [Estrutura de arquivos de um módulo](#estrutura-de-arquivos-de-um-módulo)
3. [Backend — passo a passo](#backend--passo-a-passo)
4. [Frontend — passo a passo](#frontend--passo-a-passo)
5. [Registro e ativação do módulo](#registro-e-ativação-do-módulo)
6. [Convenções obrigatórias](#convenções-obrigatórias)
7. [Padrões de código a seguir](#padrões-de-código-a-seguir)
8. [Checklist de entrega](#checklist-de-entrega)
9. [Fluxo Git entre equipes](#fluxo-git-entre-equipes)

---

## Visão geral da arquitetura

```
┌──────────────────────────────────────────────────────┐
│  PostgreSQL                                          │
│  ┌─────────────────────┐  ┌───────────────────────┐ │
│  │ schema: public       │  │ schema: tenant_acme    │ │
│  │  modules             │  │  (tabelas de negócio)  │ │
│  │  plans               │  │  attendances           │ │
│  │  tenants             │  │  proposals             │ │
│  │  users               │  │  <seu_modulo>_...      │ │
│  └─────────────────────┘  └───────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Regras de onde cada coisa fica

| O quê | Onde fica | Base SQLAlchemy |
|-------|-----------|-----------------|
| Autenticação, usuários, planos, tenants | `schema public` | `Base` |
| Tabelas de negócio do módulo | `schema tenant_<slug>` | `TenantBase` |

- **Módulos são completamente isolados por schema.** Um tenant tem seu próprio conjunto de dados.
- **Cross-module references usam UUID sem FK.** O módulo Financeiro pode guardar `proposal_id uuid` mas não cria `FOREIGN KEY` para a tabela de propostas — os módulos podem ser ativados/desativados independentemente.
- **Cada tenant roda todos os steps de migration idempotentes** (`tenant_migrations.py`) no startup.

---

## Estrutura de arquivos de um módulo

```
backend/app/modules/<slug>/
├── __init__.py          # vazio
├── models.py            # SQLAlchemy models (TenantBase)
├── schemas.py           # Pydantic schemas (request/response)
├── service.py           # Lógica de negócio (sem acesso a HTTP)
├── permissions.py       # Declaração das permissions do módulo
└── api/
    ├── __init__.py      # vazio
    └── routes.py        # FastAPI router

frontend/src/modules/<slug>/
├── <Slug>Layout.tsx     # Layout com sidebar/nav do módulo (opcional)
├── <Slug>Page.tsx       # Página principal / listagem
├── <EntidadeDetail>Page.tsx
├── New<Entidade>Page.tsx
└── ...
```

---

## Backend — passo a passo

### 1. Criar `models.py`

Use sempre `TenantBase` para tabelas que vivem no schema do tenant.

```python
# backend/app/modules/financeiro/models.py
import uuid, enum
from datetime import datetime
from sqlalchemy import String, Numeric, DateTime, Enum as SAEnum, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import TenantBase

_ev = lambda obj: [e.value for e in obj]  # noqa

class TransactionType(str, enum.Enum):
    INCOME  = "income"
    EXPENSE = "expense"

class Transaction(TenantBase):
    __tablename__ = "transactions"

    id:          Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type:        Mapped[str]        = mapped_column(SAEnum(TransactionType, values_callable=_ev))
    description: Mapped[str]        = mapped_column(String(255))
    amount:      Mapped[float]      = mapped_column(Numeric(14, 2))
    notes:       Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at:  Mapped[datetime]   = mapped_column(DateTime, default=datetime.utcnow)
    updated_at:  Mapped[datetime]   = mapped_column(DateTime, default=datetime.utcnow)
```

**Regras dos models:**
- PK sempre `UUID` gerado pelo Python (`default=uuid.uuid4`).
- Enums: sempre `SAEnum(MeuEnum, values_callable=lambda obj: [e.value for e in obj])`. Sem isso o SQLAlchemy persiste o `.name` (ex: `"INCOME"`) em vez do `.value` (ex: `"income"`).
- Campos `nullable` devem ter `nullable=True` explícito.
- Sem `ForeignKey` para tabelas de outros módulos — use `UUID` simples.
- Relacionamentos dentro do próprio módulo podem usar `ForeignKey` normalmente.

---

### 2. Registrar o model em `create_tenant_tables()`

Edite `backend/app/core/database.py` e adicione o import:

```python
# backend/app/core/database.py
async def create_tenant_tables(schema_name: str) -> None:
    import app.modules.atendimento.models         # noqa
    import app.modules.propostas_contratos.models # noqa
    import app.modules.financeiro.models          # noqa  ← ADD

    async with engine.begin() as conn:
        await conn.execute(text(f"SET search_path TO {schema_name}"))
        await conn.run_sync(TenantBase.metadata.create_all)
```

> Isso só importa para novos tenants criados depois do seu módulo. Para tenants existentes, use migration step.

---

### 3. Criar migration step em `tenant_migrations.py`

Tenants já existentes precisam de DDL idempotente aplicado no startup.
Adicione um novo step em `backend/app/core/tenant_migrations.py`:

```python
async def _step_014_financeiro(conn: AsyncConnection, schema: str) -> None:
    await conn.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {schema}.transactions (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            type        text NOT NULL,
            description varchar(255) NOT NULL,
            amount      numeric(14,2) NOT NULL,
            notes       text,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        )
    """))
    # Se precisar adicionar coluna a tabela já existente:
    # if not await _column_exists(conn, schema, "transactions", "due_date"):
    #     await conn.execute(text(f"ALTER TABLE {schema}.transactions ADD COLUMN due_date date"))
```

E registre no array `STEPS`:

```python
STEPS: list[tuple[str, Step]] = [
    ...
    ("013_tags",        _step_013_tags),
    ("014_financeiro",  _step_014_financeiro),  # ← ADD ao final
]
```

**Regras dos steps:**
- Sempre `IF NOT EXISTS` — o step é executado toda vez no startup.
- Nunca alterar ou remover steps antigos — apenas adicionar novos.
- Verificar colunas com `_column_exists()` antes de `ALTER TABLE ADD COLUMN`.
- O nome do step (`"014_financeiro"`) é a chave de idempotência — nunca reutilize.

---

### 4. Criar `permissions.py`

```python
# backend/app/modules/financeiro/permissions.py
MODULE_SLUG = "financeiro"

PERMISSIONS: list[tuple[str, str, str | None]] = [
    ("financeiro.transaction.view",   "Visualizar lançamentos",  "Acessa a lista de receitas e despesas."),
    ("financeiro.transaction.manage", "Gerenciar lançamentos",   "Cria, edita e exclui lançamentos."),
    ("financeiro.report.view",        "Visualizar relatórios",   "Acessa o fluxo de caixa e relatórios financeiros."),
]
```

**Regras:**
- `code` segue o padrão `<slug>.<entidade>.<ação>`.
- Ações comuns: `view`, `create`, `update`, `delete`, `manage` (cobre create+update+delete).
- O sync acontece automaticamente no startup — basta criar o arquivo.

---

### 5. Criar `schemas.py`

```python
# backend/app/modules/financeiro/schemas.py
import uuid
from datetime import datetime
from pydantic import BaseModel

class TransactionCreate(BaseModel):
    type: str
    description: str
    amount: float
    notes: str | None = None

class TransactionUpdate(BaseModel):
    description: str | None = None
    amount: float | None = None
    notes: str | None = None

class TransactionResponse(BaseModel):
    id: uuid.UUID
    type: str
    description: str
    amount: float
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

---

### 6. Criar `service.py`

```python
# backend/app/modules/financeiro/service.py
import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException

from app.modules.financeiro.models import Transaction
from app.modules.financeiro.schemas import TransactionCreate, TransactionUpdate


class TransactionService:

    @staticmethod
    async def list(db: AsyncSession) -> list[Transaction]:
        result = await db.execute(select(Transaction).order_by(Transaction.created_at.desc()))
        return list(result.scalars().all())

    @staticmethod
    async def get(db: AsyncSession, id: uuid.UUID) -> Transaction:
        result = await db.execute(select(Transaction).where(Transaction.id == id))
        obj = result.scalar_one_or_none()
        if not obj:
            raise HTTPException(404, "Lançamento não encontrado.")
        return obj

    @staticmethod
    async def create(db: AsyncSession, data: TransactionCreate) -> Transaction:
        obj = Transaction(**data.model_dump())
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def update(db: AsyncSession, id: uuid.UUID, data: TransactionUpdate) -> Transaction:
        obj = await TransactionService.get(db, id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        obj.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(obj)
        return obj

    @staticmethod
    async def delete(db: AsyncSession, id: uuid.UUID) -> None:
        obj = await TransactionService.get(db, id)
        await db.delete(obj)
        await db.commit()
```

**Regras do service:**
- Nunca importar de `routes.py` ou `fastapi.Request`.
- `commit()` sempre no service, nunca na route.
- `HTTPException` pode ser levantada no service — é re-propagada pelo FastAPI.
- Para evitar `MissingGreenlet`, nunca atribua a um relacionamento lazy após `flush()`. Se precisar do relacionamento na resposta, re-consulte com `selectinload`:

```python
# ✅ CORRETO — re-consulta após commit para garantir eager load
await db.commit()
result = await db.execute(
    select(Transaction).options(selectinload(Transaction.items)).where(Transaction.id == obj.id)
)
return result.scalar_one()

# ❌ ERRADO — atribui à coleção lazy antes do commit
obj.items = list(items_result.scalars().all())  # MissingGreenlet!
```

---

### 7. Criar `api/routes.py`

```python
# backend/app/modules/financeiro/api/routes.py
import uuid
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_module, ModuleContext
from app.core.dependencies import require_permission
from app.modules.financeiro.schemas import TransactionCreate, TransactionUpdate, TransactionResponse
from app.modules.financeiro.service import TransactionService

router = APIRouter(prefix="/financeiro", tags=["Financeiro"])


@router.get("/transactions", response_model=List[TransactionResponse])
async def list_transactions(
    ctx: ModuleContext = Depends(require_module("financeiro")),
    _: None = Depends(require_permission("financeiro.transaction.view")),
):
    return await TransactionService.list(ctx.db)


@router.post("/transactions", response_model=TransactionResponse, status_code=201)
async def create_transaction(
    data: TransactionCreate,
    ctx: ModuleContext = Depends(require_module("financeiro")),
    _: None = Depends(require_permission("financeiro.transaction.manage")),
):
    return await TransactionService.create(ctx.db, data)


@router.patch("/transactions/{id}", response_model=TransactionResponse)
async def update_transaction(
    id: uuid.UUID,
    data: TransactionUpdate,
    ctx: ModuleContext = Depends(require_module("financeiro")),
    _: None = Depends(require_permission("financeiro.transaction.manage")),
):
    return await TransactionService.update(ctx.db, id, data)


@router.delete("/transactions/{id}", status_code=204)
async def delete_transaction(
    id: uuid.UUID,
    ctx: ModuleContext = Depends(require_module("financeiro")),
    _: None = Depends(require_permission("financeiro.transaction.manage")),
):
    await TransactionService.delete(ctx.db, id)
```

**O que `require_module("financeiro")` valida automaticamente:**
1. O slug `"financeiro"` está cadastrado e ativo no registry global.
2. O usuário pertence a um tenant ativo.
3. O plano do tenant não expirou.
4. O módulo `"financeiro"` está ativado para esse tenant.
5. Retorna `ModuleContext(db, user, schema)` com `search_path` já apontado para o schema do tenant.

---

### 8. Registrar router em `main.py`

```python
# backend/app/main.py
from app.modules.financeiro.api.routes import router as financeiro_router

# ...
app.include_router(financeiro_router, prefix="/api/v1")
```

E adicionar o módulo no seed `_seed_known_modules()`:

```python
KNOWN_MODULES = [
    # ... módulos existentes ...
    {
        "slug": "financeiro",
        "name": "Financeiro",
        "description": "Controle de receitas, despesas e fluxo de caixa.",
        "icon": "DollarSign",          # nome do ícone no lucide-react
        "color": "#10B981",
        "backend_path": "backend/app/modules/financeiro",
        "frontend_path": "frontend/src/modules/financeiro",
    },
]
```

---

## Frontend — passo a passo

### 1. Criar o cliente de API

```typescript
// frontend/src/api/financeiro.ts
import api from "./client"

export interface Transaction {
  id: string
  type: "income" | "expense"
  description: string
  amount: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TransactionCreate {
  type: "income" | "expense"
  description: string
  amount: number
  notes?: string
}

export const transactionsApi = {
  list: () =>
    api.get<Transaction[]>("/financeiro/transactions").then(r => r.data),

  create: (data: TransactionCreate) =>
    api.post<Transaction>("/financeiro/transactions", data).then(r => r.data),

  update: (id: string, data: Partial<TransactionCreate>) =>
    api.patch<Transaction>(`/financeiro/transactions/${id}`, data).then(r => r.data),

  remove: (id: string) =>
    api.delete<void>(`/financeiro/transactions/${id}`),
}
```

### 2. Criar as páginas do módulo

Siga o padrão dos módulos existentes:

```
frontend/src/modules/financeiro/
├── FinanceiroLayout.tsx   # Nav lateral com links do módulo
├── TransacoesPage.tsx     # Listagem + filtros
├── NewTransacaoPage.tsx   # Formulário de criação
└── DashboardPage.tsx      # KPIs e gráficos
```

**Padrões de UI obrigatórios:**
- Estados de loading: use `<Skeleton>` (componente shadcn), não spinners inline.
- Estados vazios: use `<EmptyState>` de `@/components/EmptyState`.
- Erros de formulário: use `<Alert>` para erros de servidor + `toast.error()` para feedback imediato.
- Sucesso em mutações: sempre `toast.success("Mensagem de sucesso!")`.
- Listas: `space-y-1.5` com `<Card>` clicáveis.
- Formulários: `react-hook-form` + `zod` + `zodResolver`.

```typescript
// Padrão de toast após ação
try {
  const result = await transactionsApi.create(payload)
  toast.success("Lançamento criado com sucesso!")
  navigate(`/app/modules/financeiro/transacoes/${result.id}`)
} catch (err) {
  const msg = getApiError(err)
  setServerError(msg)
  toast.error(msg)
}
```

### 3. Registrar rotas em `App.tsx`

```tsx
// frontend/src/App.tsx
import FinanceiroLayout from "@/modules/financeiro/FinanceiroLayout"
import TransacoesPage from "@/modules/financeiro/TransacoesPage"
import NewTransacaoPage from "@/modules/financeiro/NewTransacaoPage"

// Dentro do <Routes> no módulo de módulos:
<Route path="financeiro" element={<FinanceiroLayout />}>
  <Route index element={<Navigate to="transacoes" replace />} />
  <Route path="transacoes" element={<TransacoesPage />} />
  <Route path="transacoes/new" element={<NewTransacaoPage />} />
</Route>
```

O `CompanyLayout.tsx` já exibe automaticamente os módulos ativos no sidebar — o link `frontend_path` do registry resolve o ícone e a rota.

---

## Registro e ativação do módulo

Após subir o código, o módulo precisa ser **registrado** e **ativado** antes que algum tenant possa usá-lo:

```
┌────────────────────────────────────────────────────────┐
│  1. Subir o código (merge para main ou branch dev)     │
│  2. Rebuild + restart da API (docker compose up -d api)│
│     → o seed automático cadastra o módulo no registry  │
│  3. Super Admin → Planos → adicionar o módulo ao plano │
│  4. Super Admin → Empresas → ativar o módulo no tenant │
│     (ou é ativado automaticamente via plano)           │
└────────────────────────────────────────────────────────┘
```

O seed em `_seed_known_modules()` é idempotente — roda toda vez que a API inicia mas só insere se o slug não existir.

---

## Convenções obrigatórias

### Nomenclatura

| Contexto | Convenção | Exemplo |
|----------|-----------|---------|
| Slug do módulo | `snake_case` | `financeiro`, `pdv`, `suprimentos` |
| Schema PostgreSQL | `tenant_<tenant_slug>` | `tenant_acme` (gerado pelo platform) |
| Tabelas do módulo | `snake_case`, plural | `transactions`, `cash_entries` |
| Permission codes | `<slug>.<entidade>.<ação>` | `financeiro.transaction.view` |
| Arquivos Python | `snake_case.py` | `models.py`, `service.py` |
| Arquivos TypeScript | `PascalCase.tsx` | `TransacoesPage.tsx` |
| API client TS | `camelCase` | `transactionsApi` |
| Prefix do router FastAPI | `/<slug>` | `/financeiro` |

### Proibições

- ❌ Nunca criar tabelas em `Base` (schema public) para dados de tenant.
- ❌ Nunca usar `FOREIGN KEY` entre módulos — use UUID sem FK.
- ❌ Nunca fazer `commit()` em routes — apenas nos services.
- ❌ Nunca atribuir a relacionamento lazy sem re-consultar com `selectinload`.
- ❌ Nunca usar `SelectItem value=""` — use sentinela `"__none__"` ou `"__all__"` e mapeie para `null/undefined` no handler.
- ❌ Nunca criar alembic migrations para tabelas de tenant — use `tenant_migrations.py`.
- ❌ Nunca remover ou renumerar steps do `tenant_migrations.py` — só adicionar.
- ❌ Nunca usar `lazy="select"` implícito em relacionamentos async — use `selectinload` explícito.

---

## Padrões de código a seguir

### Relação entre entidades cross-module

```python
# ✅ Referência por UUID sem FK — módulos independentes
class Transaction(TenantBase):
    __tablename__ = "transactions"
    proposal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Sem ForeignKey — propostas_contratos pode estar desativado

# ❌ FK entre módulos — trava o schema se um módulo for removido
class Transaction(TenantBase):
    proposal_id = mapped_column(UUID, ForeignKey("proposals.id"))  # PROIBIDO cross-module
```

### Eager loading obrigatório em relacionamentos

```python
# ✅ Sempre selectinload para relacionamentos que precisam ser retornados
from sqlalchemy.orm import selectinload

result = await db.execute(
    select(Transaction).options(selectinload(Transaction.items)).where(Transaction.id == id)
)
return result.scalar_one()

# ❌ Nunca acessar relacionamento sem carregar — gera MissingGreenlet
transaction = await db.get(Transaction, id)
print(transaction.items)  # ERRO em contexto async
```

### Search path em sessões manuais

Se precisar abrir uma sessão fora de `require_module()` ou `get_db()`:

```python
from app.core.database import AsyncSessionLocal
from sqlalchemy import text

async with AsyncSessionLocal() as db:
    await db.execute(text("SET search_path TO public"))  # obrigatório
    # ... queries em tabelas do public
```

Para queries no schema de tenant:

```python
async with AsyncSessionLocal() as db:
    await db.execute(text(f"SET search_path TO {schema}, public"))
    # ... queries no tenant
```

### Enums Python + PostgreSQL

```python
class Status(str, enum.Enum):
    DRAFT  = "draft"
    ACTIVE = "active"

# Mapeamento correto — persiste o .value ("draft"), não o .name ("DRAFT")
status: Mapped[str] = mapped_column(
    SAEnum(Status, values_callable=lambda obj: [e.value for e in obj])
)
```

---

## Checklist de entrega

Antes de abrir PR para o módulo, confirme:

### Backend
- [ ] `models.py` — todas as tabelas usam `TenantBase`
- [ ] `models.py` — todos os enums usam `values_callable`
- [ ] `models.py` importado em `create_tenant_tables()` em `database.py`
- [ ] Step de migration adicionado em `tenant_migrations.py` (ao final do array `STEPS`)
- [ ] `permissions.py` criado com os permissions do módulo
- [ ] `service.py` — commits apenas no service, sem lógica HTTP
- [ ] `api/routes.py` — todas as rotas usam `require_module()` como dependency
- [ ] Router registrado em `main.py`
- [ ] Módulo adicionado em `_seed_known_modules()` em `main.py`
- [ ] API testada localmente (docker compose up + curl ou /docs)

### Frontend
- [ ] `api/<slug>.ts` — tipos e funções de chamada criados
- [ ] Páginas criadas com skeleton loading, empty state e toast
- [ ] Rotas registradas em `App.tsx`
- [ ] TypeScript compila sem erros (`npm run build` no container)

### Banco
- [ ] `docker exec saas_api alembic upgrade head` (se houver migration Alembic no public)
- [ ] Restart da API sobe sem erros e aplica o migration step no tenant existente
- [ ] Super Admin → Módulos → módulo aparece na lista
- [ ] Ativar o módulo para o tenant de teste → funcionalidades acessíveis

---

## Fluxo Git entre equipes

Cada módulo é desenvolvido em uma branch própria. O trunk é `main`.

```
main
 ├── feature/modulo-financeiro      ← desenvolvedor A
 ├── feature/modulo-pdv             ← desenvolvedor B
 └── feature/modulo-suprimentos     ← desenvolvedor C
```

### Regras de branch

```bash
# Nomenclatura
feature/modulo-<slug>

# Criar a branch a partir de main atualizado
git fetch origin
git checkout -b feature/modulo-financeiro origin/main
```

### Arquivos de integração — alto risco de conflito

Os seguintes arquivos são tocados por todo módulo novo. Resolva conflitos com cuidado:

| Arquivo | O que muda |
|---------|------------|
| `backend/app/core/database.py` | Adiciona import do model em `create_tenant_tables()` |
| `backend/app/core/tenant_migrations.py` | Adiciona step ao final do array `STEPS` |
| `backend/app/main.py` | Import + `app.include_router()` + entry em `KNOWN_MODULES` |
| `frontend/src/App.tsx` | Import + `<Route>` do módulo |

### Como evitar conflitos

1. **Sempre rebease em `main` antes de abrir PR:**
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Para `STEPS` em `tenant_migrations.py`:** o step sempre vai ao **final** do array. Se dois módulos adicionarem ao final simultaneamente, o merge resolve adicionando ambos (um após o outro, mantendo a ordem crescente de numeração).

3. **Para `main.py`:** cada módulo adiciona linhas independentes. Conflitos são triviais — aceite ambas as mudanças.

4. **Nunca altere o número de steps existentes** — isso quebraria tenants em produção que já aplicaram os steps antigos.

### Exemplo de merge de `tenant_migrations.py`

```python
# Situação: feature/modulo-financeiro adicionou step 014
# e feature/modulo-pdv adicionou step 014 também
# → no merge, renumere um deles para 015

STEPS = [
    ...
    ("013_tags",       _step_013_tags),
    ("014_financeiro", _step_014_financeiro),  # ← financeiro
    ("015_pdv",        _step_015_pdv),         # ← PDV renumerado
]
```

---

> **Dúvidas?** Consulte um módulo existente como referência:
> - Backend simples: `backend/app/modules/propostas_contratos/`
> - Backend complexo (config, kanban, integrações): `backend/app/modules/atendimento/`
> - Frontend: `frontend/src/modules/propostas_contratos/`
