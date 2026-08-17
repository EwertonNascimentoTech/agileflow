# Documentação técnica — AgileFlow (Kore 2.0)

Público-alvo: equipa de desenvolvimento. Cada ficheiro descreve um processo derivado do código, com metadados, RACI, Mermaid, bifurcações e dicionário de dados.

**Não** use estes ficheiros como guia operacional para utilizadores finais — ver [`docs/usuario/`](../usuario/README.md).

## Índice de processos

| # | Ficheiro | Processo | Trigger principal |
|---|----------|----------|-------------------|
| 01 | [01-bootstrap-startup.md](01-bootstrap-startup.md) | Arranque da API (seed, migrations, cleanup) | Lifespan FastAPI |
| 02 | [02-login-jwt.md](02-login-jwt.md) | Login JWT, refresh, primeiro acesso | `POST /api/v1/auth/*` |
| 03 | [03-multitenancy-require-module.md](03-multitenancy-require-module.md) | Schema-per-tenant e gate de módulo | `require_module(slug)` |
| 04 | [04-navegacao-roles-permissoes.md](04-navegacao-roles-permissoes.md) | RBAC, roles, permissões e shell frontend | Guards + `AuthContext` |
| 05 | [05-gestao-projetos-demandas.md](05-gestao-projetos-demandas.md) | Demandas, kanban, priorização, cronograma | Módulo `projetos` |
| 06 | [06-teamops.md](06-teamops.md) | Pessoas, organograma, ausências | Módulo `teamops` |
| 07 | [07-rtd-epa.md](07-rtd-epa.md) | Reuniões RTD + integração EPA / IA | Módulo `rtd` |
| 08 | [08-uploads-minio-celery.md](08-uploads-minio-celery.md) | Storage MinIO e jobs Celery (SLA) | Uploads / worker |

## Módulos backend ativos (seed em `main.py`)

| Slug | Nome | Router |
|------|------|--------|
| `projetos` | Processos | `/api/v1/projetos` |
| `teamops` | Gestão de Times e Capacidade | `/api/v1/teamops` |
| `produtos` | Portfólio de Produtos | `/api/v1/produtos` |
| `indicadores` | Indicadores | `/api/v1/indicadores` |
| `rtd` | Reunião de Tomada de Decisão | `/api/v1/rtd` |

Módulos desativados no startup (`_deactivate_removed_modules`): `crm`, `estoque`, `pdv`, `atendimento`, `propostas_contratos`. Rotas frontend legadas podem existir; o registry e `tenant_modules` ficam `is_active = FALSE`.

## Artefactos relacionados

- Processo de negócio (analista): [`docs/processo/`](../processo/README.md)
- Guias de utilizador: [`docs/usuario/`](../usuario/README.md)
- Guia de criação de módulos (legado): [`docs/MODULES.md`](../MODULES.md)
