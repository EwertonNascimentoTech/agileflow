# EPA — Endpoints de Acompanhamento

Documentação dos endpoints para consultar e registrar acompanhamentos de planos de ação do EPA.

---

## Visão Geral

O sistema mantém uma **camada dupla** de dados:

- **Local** (`acompanhamentos_epa` no PostgreSQL) — registros criados via IDReport
- **Remoto** (EPA externo) — todos os acompanhamentos cadastrados diretamente no EPA

No `GET`, os dois conjuntos são buscados e **mergeados** por chave (`colaborador + data + descricao`), evitando duplicatas. No `POST`, o registro é enviado primeiro ao EPA e depois persistido localmente.

---

## Autenticação

Todos os endpoints exigem JWT via `Authorization: Bearer <token>`.

- `GET` — qualquer usuário autenticado (`get_current_user`)
- `POST` — usuários com role `admin`, `po` ou `dev` (`get_current_non_client_user`)

---

## Endpoints

### GET `/api/planos-acao/{plano_id}/acompanhamento`

Lista os acompanhamentos de um plano, mesclando dados locais e do EPA externo.

**Path params**

| Param | Tipo | Descrição |
|---|---|---|
| `plano_id` | int | ID local ou `id_externo` do plano no EPA |

**Query params** (opcionais)

| Param | Formato | Exemplo |
|---|---|---|
| `data_inicio` | `YYYY-MM-DD` | `2026-01-01` |
| `data_fim` | `YYYY-MM-DD` | `2026-03-31` |

**Resposta `200`** — array de `AcompanhamentoEPAResponse`

```json
[
  {
    "id": 42,
    "plano_id": 7,
    "acao_id_externo": 1234,
    "tarefa_id_externo": null,
    "descricao": "Reunião de alinhamento com equipe",
    "horas_utilizadas": 2.0,
    "colaborador": "João Silva",
    "created_at": "2026-03-20T14:30:00",
    "origem": "local",
    "codigo_externo": 9876,
    "tipo_iniciativa": "acao",
    "codigo_iniciativa": 1234,
    "titulo": "Ação estratégica XYZ"
  }
]
```

**Fluxo interno:**
1. Busca registros locais no PostgreSQL com filtro de data
2. Chama `POST {EPA_API_BASE_URL}/epa/api/planos-de-acoes/acompanhamentos/listar` com `codigo_iniciativa = plano.id_externo`
3. Normaliza e mergeia os dois conjuntos — registros remotos sem correspondente local são incluídos com `origem: "epa"`

---

### POST `/api/planos-acao/{plano_id}/acompanhamento`

Registra um novo acompanhamento. Persiste no EPA externo **e** localmente.

**Path params**

| Param | Tipo | Descrição |
|---|---|---|
| `plano_id` | int | ID local ou `id_externo` do plano no EPA |

**Body** (`application/json`)

```json
{
  "descricao": "Reunião de alinhamento com equipe",
  "horas_utilizadas": 2.0,
  "acao_id_externo": 1234,
  "tarefa_id_externo": null
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `descricao` | string | sim | Texto do acompanhamento |
| `horas_utilizadas` | float | não (default `0.0`) | Horas gastas |
| `acao_id_externo` | int | condicional | ID da ação no EPA |
| `tarefa_id_externo` | int | condicional | ID da tarefa no EPA |

> **Regra:** ao menos um dos campos `acao_id_externo` ou `tarefa_id_externo` deve ser informado e maior que zero. Se ambos forem enviados, `tarefa_id_externo` tem precedência.

**Resposta `200`** — `AcompanhamentoEPAResponse` do registro criado

**Fluxo interno:**
1. Resolve o plano local pelo `plano_id` (ou `id_externo`)
2. Chama `POST {EPA_API_BASE_URL}/epa/api/planos-de-acoes/acompanhamentos/salvar` (form-urlencoded) com o token EPA do usuário
3. Captura `data_inclusao` retornada pelo EPA para usar como `created_at` local
4. Persiste o registro em `acompanhamentos_epa` no PostgreSQL
5. Retorna o registro local

**Erros possíveis**

| Status | Situação |
|---|---|
| `400` | `acao_id_externo` e `tarefa_id_externo` ausentes ou inválidos |
| `404` | Plano não encontrado |
| `502` | EPA externo retornou erro ou resposta inválida |

---

## Chamada ao EPA externo

O sistema chama o EPA via `httpx` usando token do próprio usuário logado (campo `User.epa_id` + token renovado automaticamente a cada 23h via `epa_auth.py`).

### Salvar acompanhamento

```
POST {EPA_API_BASE_URL}/epa/api/planos-de-acoes/acompanhamentos/salvar
Content-Type: application/x-www-form-urlencoded
X-Requested-With: XMLHttpRequest

descricao=...&horas=2.0&emails=&selecionarusuarios=&codigo_acao=1234
```

### Listar acompanhamentos

```
POST {EPA_API_BASE_URL}/epa/api/planos-de-acoes/acompanhamentos/listar
Content-Type: application/x-www-form-urlencoded
X-Requested-With: XMLHttpRequest

draw=1&start=0&length=100&tipo_iniciativa=&codigo_iniciativa=7&with=usuario_inclusao,arquivos_count,_permissions,actions_tasks&datatable=true
```

Filtro de data opcional: `data_inclusao=01/01/2026to31/03/2026`

---

## Arquivos relevantes

| Arquivo | Responsabilidade |
|---|---|
| [routers/planos_acao.py](../routers/planos_acao.py) | Endpoints (`registrar_acompanhamento`, `listar_acompanhamentos`) e helpers privados |
| [schemas.py](../schemas.py) | `AcompanhamentoEPACreate`, `AcompanhamentoEPAResponse` |
| [models.py](../models.py) | Model `AcompanhamentoEPA` (tabela `acompanhamentos_epa`) |
| [epa_auth.py](../epa_auth.py) | Gerenciamento e renovação automática do token EPA |
| [services/planosAcaoService.ts](../../frontend/src/services/planosAcaoService.ts) | Chamadas do frontend (`salvarAcompanhamento`, `listarAcompanhamentos`) |
