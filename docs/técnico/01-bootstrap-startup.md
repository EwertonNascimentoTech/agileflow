# 01 — Bootstrap / Startup da API

## A. Metadados do processo

- *Nome do processo:* Arranque da aplicação FastAPI (lifespan)
- *Trigger:* Subida do processo Uvicorn / workers; execução de `lifespan` em `backend/app/main.py`
- *Objetivo:* Serializar inicialização entre workers, sincronizar catálogo de permissões, aplicar DDL incremental em todos os tenants, seedar módulos conhecidos e desativar módulos removidos do produto

## B. Matriz RACI simplificada

| Ator/Sistema | Papel no processo | Responsabilidade |
| :--- | :--- | :--- |
| Uvicorn / Gunicorn | A | Dispara lifespan em cada worker |
| PostgreSQL (`pg_advisory_lock`) | C | Serializa o bloco de startup entre workers |
| `sync_permissions` | R | Upsert do catálogo global `module_permissions` |
| `upgrade_all_tenants` | R | Aplica `tenant_migrations.STEPS` em cada schema |
| `_seed_known_modules` | R | Upsert de `projetos`, `teamops`, `produtos`, `indicadores`, `rtd` |
| `_deactivate_removed_modules` | R | Desativa slugs legados no registry e em tenants |

## C. Fluxograma (Mermaid)

```mermaid
flowchart TD
  A([Início lifespan]) --> B[Adquire pg_advisory_lock]
  B --> C{sync_permissions}
  C -->|ok| D{upgrade_all_tenants}
  C -->|exceção| C1[Log skip permissions]
  C1 --> D
  D -->|ok| E{_seed_known_modules}
  D -->|exceção| D1[Log skip tenant_migrations]
  D1 --> E
  E -->|ok| F{_deactivate_removed_modules}
  E -->|exceção| E1[Log skip modules_seed]
  E1 --> F
  F -->|ok| G[Libera advisory unlock]
  F -->|exceção| F1[Log skip modules_cleanup]
  F1 --> G
  G --> H([yield — API pronta])
  H --> I[Registra routers /api/v1]
  I --> J([Fim ready])

  style A fill:#22c55e,color:#fff
  style J fill:#22c55e,color:#fff
  style C1 fill:#ef4444,color:#fff
  style D1 fill:#ef4444,color:#fff
  style E1 fill:#ef4444,color:#fff
  style F1 fill:#ef4444,color:#fff
  style C fill:#eab308,color:#000
  style D fill:#eab308,color:#000
  style E fill:#eab308,color:#000
  style F fill:#eab308,color:#000
  style B fill:#3b82f6,color:#fff
  style G fill:#3b82f6,color:#fff
  style I fill:#3b82f6,color:#fff
```

## D. Bifurcações e regras

| Condição | Sucesso | Exceção | Código referência |
| :--- | :--- | :--- | :--- |
| Vários workers sobem juntos | Um worker executa; outros esperam no lock | Sem lock → corrida de DDL (evitado) | `main.py::lifespan` (`_STARTUP_LOCK_KEY`) |
| `sync_permissions` falha | Continua startup | Log `[permissions] sync skipped` | `main.py::lifespan` → `core/permissions.py::sync_permissions` |
| Step de migration falha | Step logado e pulado (idempotente) | Tenant pode ficar parcial | `tenant_migrations.py::upgrade_tenant_schema` |
| Slug em `removed` | `modules` e `tenant_modules` → `is_active=FALSE` | — | `main.py::_deactivate_removed_modules` |

### Strict mode (erros)

Cada etapa do lifespan está em `try/except Exception`: falha **não** aborta a API; apenas imprime log e segue. O unlock do advisory lock está no `finally`.

## E. Dicionário de dados

| Item | Descrição |
| :--- | :--- |
| `_STARTUP_LOCK_KEY` | `748291043` — chave `pg_advisory_lock` |
| `KNOWN_MODULES` | Lista de dicts com `slug`, `name`, `icon`, `color`, paths |
| `removed` | `["crm","estoque","pdv","atendimento","propostas_contratos"]` |
| Routers | `auth`, `super-admin`, `company/admin`, `projetos`, `teamops`, `produtos`, `indicadores`, `rtd` |
| Middleware | `GZipMiddleware`, `CORSMiddleware`, SlowAPI rate limit |

## Rastreabilidade

- `backend/app/main.py::lifespan`
- `backend/app/main.py::_seed_known_modules`
- `backend/app/main.py::_deactivate_removed_modules`
- `backend/app/core/permissions.py::sync_permissions`
- `backend/app/core/tenant_migrations.py::upgrade_all_tenants`
