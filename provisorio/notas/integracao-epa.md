# Documentação de Integração com o EPA

Sistema: **IDReport** — Integração com o [EPA (Sistema de Planos de Ação)](https://sistemafiea.sysepa.com.br)

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Configuração](#configuração)
3. [Autenticação e Login](#autenticação-e-login)
4. [Gestão de Credenciais por Usuário](#gestão-de-credenciais-por-usuário)
5. [Planos de Ação](#planos-de-ação)
6. [Acompanhamentos](#acompanhamentos)
7. [Conclusão de Tarefa](#conclusão-de-tarefa)
8. [Indicadores (Painel BSC)](#indicadores-painel-bsc)
9. [Atividades — Gráfico de Planos](#atividades--gráfico-de-planos)
10. [Utilitários e Helpers](#utilitários-e-helpers)
11. [Tabela Resumo de Endpoints](#tabela-resumo-de-endpoints)

---

## Visão Geral

O IDReport se integra ao EPA por meio de dois mecanismos distintos:

| Mecanismo | Usado onde |
|-----------|-----------|
| **API REST com Bearer Token (JWT)** | Planos de Ação, Acompanhamentos, Gráfico |
| **Sessão web via HTTP (scraping de formulário)** | Conclusão de tarefa, Indicadores BSC |

As credenciais do EPA são **por usuário**: cada usuário do IDReport armazena seu próprio login/senha do EPA, criptografados no banco de dados. O token JWT é obtido, cacheado e renovado automaticamente.

---

## Configuração

Arquivo: `backend/.env`

```env
# URL base do EPA
EPA_API_BASE_URL=https://sistemafiea.sysepa.com.br

# Esquema de autenticação
EPA_API_AUTH_SCHEME=Bearer

# Paths do endpoint de acompanhamentos
EPA_API_ACOMPANHAMENTO_PATHS=/epa/api/planos-de-acoes/acompanhamentos/salvar

# Credenciais padrão (opcional, usadas como fallback)
EPA_LOGIN=<usuario>
EPA_SENHA=<senha>
```

---

## Autenticação e Login

**Arquivo principal:** `backend/epa_auth.py`

### Fluxo geral

```
[IDReport]
    │
    ├─ 1. Usuário informa login/senha do EPA na tela de conexão
    │
    ├─ 2. IDReport chama POST /epa/api/api/login → recebe JWT
    │
    ├─ 3. Token + credenciais criptografadas são salvas no banco
    │
    └─ 4. Em cada chamada à API do EPA, o token é injetado no header
           Authorization: Bearer {token}
           (renovado automaticamente antes de expirar)
```

### Obter token JWT

```
POST {EPA_API_BASE_URL}/epa/api/api/login

Form parameters:
  login: <login do EPA>
  senha: <senha do EPA>

Response (JSON):
  {
    "access_token": "<jwt>",
    ...
  }
```

Implementado em `authenticate_epa_credentials(login, password)` — `epa_auth.py:243`.

- O token é decodificado para extrair o campo `exp` (expiração).
- Fallback de vida útil: **13 horas** quando `exp` não está no JWT.

### Salvar credenciais do usuário

Função: `connect_user_epa(db, user, login, password)` — `epa_auth.py:280`

Persiste no modelo `User`:

| Campo | Descrição |
|-------|-----------|
| `epa_login` | Login do usuário no EPA |
| `epa_password_encrypted` | Senha criptografada com Fernet |
| `epa_token_encrypted` | Token JWT criptografado |
| `epa_token_expires_at` | Timestamp de expiração do token |
| `epa_id` | ID do usuário no EPA |
| `epa_connected_at` | Data da conexão |
| `epa_last_validated_at` | Última validação bem-sucedida |

A criptografia usa **Fernet (criptografia simétrica)** via módulo `credential_crypto`.

### Obter contexto de autenticação

Função: `get_user_epa_auth_context(db, user, force_refresh=False)` — `epa_auth.py:299`

Retorna `(base_url, headers)` já com o Bearer token.

- Renova o token automaticamente se faltar **menos de 5 minutos** para expirar.
- Suporta migração de credenciais criptografadas em formato legado.

---

## Gestão de Credenciais por Usuário

**Arquivo:** `backend/routers/users.py`

Esses endpoints permitem que cada usuário conecte, verifique e desconecte sua conta do EPA.

### Verificar status da conexão

```
GET /api/users/me/epa-status

Response:
{
  "hasEpaCredentials": true,
  "status": "connected",          // "connected" | "token_expired" | "not_connected"
  "epaId": "12345",
  "loginHint": "jo***@...",       // login mascarado
  "tokenExpiresAt": "2026-03-30T20:00:00Z",
  "connectedAt": "2026-03-01T10:00:00Z",
  "lastValidatedAt": "2026-03-30T08:00:00Z"
}
```

### Salvar/atualizar credenciais

```
PUT /api/users/me/epa-credentials

Request:
{
  "username": "meu.login",
  "password": "minha.senha"
}

Response: (mesmo formato do GET acima)
```

### Remover credenciais

```
DELETE /api/users/me/epa-credentials

Response: (mesmo formato do GET acima, com status "not_connected")
```

---

## Planos de Ação

**Arquivo:** `backend/routers/planos_acao.py`

### Verificar conexão EPA do contexto de planos

```
GET /planos-acao/epa-status

Response:
{
  "connected": true,
  "epa_id": "12345",
  "token_expires_at": "2026-03-30T20:00:00Z",
  "last_validated_at": "2026-03-30T08:00:00Z",
  "base_url": "https://sistemafiea.sysepa.com.br"
}
```

### Vincular plano ao IDReport

```
POST /planos-acao/vincular

Request:
{
  "id_externo": 9999
}

Response: PlanoAcaoEPAResponse
```

- Busca o plano no EPA pelo `id_externo`.
- Normaliza os dados e faz upsert no banco local.

### Buscar plano por código (sem persistir)

```
GET /planos-acao/buscar?id_externo=9999

Response: PlanoAcaoEPAResponse  (id retornado é negativo — não persistido)
```

### Buscar árvore de planos (grid/gráfico)

```
GET /planos-acao/buscar-grid?id_externo=9999

Response: List[PlanoAcaoEPAResponse]  (estrutura hierárquica)
```

### Endpoints EPA chamados internamente

| Método | Endpoint EPA | Uso |
|--------|-------------|-----|
| GET | `/epa/api/planos-de-acao` | Listar planos com filtros |
| GET | `/epa/api/planos-de-acoes` | Endpoint alternativo |
| GET | `/epa/api/planos-de-acoes/grid/Grafico` | Estrutura hierárquica |

**Parâmetros de query comuns:**

| Parâmetro | Descrição |
|-----------|-----------|
| `codigoorigem` | Código do plano pai/origem |
| `codigo` | Código do item |
| `quem` | EPA ID do usuário (escopo) |
| `with` | Relações para eager loading |
| `limit` | Máximo de resultados (até 200) |

---

## Acompanhamentos

**Arquivos:** `backend/routers/acompanhamentos.py` e `backend/routers/planos_acao_epa.py`

### Registrar acompanhamento

```
POST /planos-acao/{plano_id}/acompanhamento

Request:
{
  "acao_id_externo": 111,       // opcional
  "tarefa_id_externo": 222,     // opcional
  "descricao": "Realizei a reunião de alinhamento.",
  "horas_utilizadas": 1.5       // opcional, padrão 0.0
}

Response: AcompanhamentoEPAResponse
```

- Salva o acompanhamento tanto no **EPA** quanto no **banco local**.
- Pode ser vinculado a uma ação ou a uma tarefa.

#### Endpoint EPA chamado internamente

```
POST {EPA_API_BASE_URL}/epa/api/planos-de-acoes/acompanhamentos/salvar

Form data:
  descricao:           <texto do acompanhamento>
  horas:               <float, mínimo 0.0>
  emails:              <string>
  selecionarusuarios:  <string>
  codigo_acao:         <int>
```

### Listar acompanhamentos

```
GET /planos-acao/{plano_id}/acompanhamento?data_inicio=2026-01-01&data_fim=2026-03-31

Response: List[AcompanhamentoEPAResponse]
```

- Mescla registros **locais** (banco IDReport) com registros **remotos** (EPA).
- Filtro por intervalo de datas.

#### Endpoint EPA chamado internamente

```
POST {EPA_API_BASE_URL}/epa/api/planos-de-acoes/acompanhamentos/listar

Body (JSON):
{
  "draw": 1,
  "start": 0,
  "length": 100,
  "tipo_iniciativa": "",
  "codigo_iniciativa": <int>,
  "with": "usuario_inclusao,arquivos_count,_permissions,actions_tasks",
  "datatable": "true",
  "data_inclusao": "01/01/2026to31/03/2026"   // opcional, formato dd/mm/yyyytodd/mm/yyyy
}
```

---

## Conclusão de Tarefa

**Arquivo:** `backend/routers/planos_acao_epa.py` — função `_concluir_tarefa_no_epa()` (linha ~174)

A conclusão de tarefa **não usa a API REST** — exige uma sessão web autenticada (simulação de browser).

### Endpoint IDReport

```
POST /planos-acao/concluir-tarefa

Request:
{
  "tarefa_id_externo": 333,
  "codigo_origem": 9999
}

Response:
{
  "status": "ok",
  "message": "Tarefa concluída com sucesso."
}
```

### Fluxo interno (sessão web)

```
1. GET  /epa/login.php
   → Captura cookies da sessão

2. POST /epa/api/api/novo/login
   Body: { login, senha }
   → Retorna access_token + token_processa

3. POST /epa/processa_login.php
   Form data: { user, password, access_token, token_processa, cookies }
   → Estabelece sessão web (cookie de sessão PHP)

4. GET  /epa/epa_iniciativa5w2h/objetivo/ajax.php
   Query params:
     controller:                    Iniciativa5w2h
     action:                        concluir
     parameters[iniciativa]:        <tarefa_id_externo>
     parameters[codigoorigem]:      <codigo_origem>
   → Conclui a tarefa
```

---

## Indicadores (Painel BSC)

**Arquivos:** `backend/routers/epa.py` e `backend/epa_bsc.py`

O Painel BSC também usa **sessão web** (não API REST), pois o EPA expõe esse recurso apenas via HTML.

### Obter painel BSC

```
GET /api/epa/painel-bsc

Response:
{
  "column_groups": [ ... ]   // estrutura do painel parseada do HTML
}
```

#### Fluxo interno — criar sessão BSC

```
1. GET  /epa/login.php
2. POST /epa/api/api/novo/login  →  access_token
3. POST /epa/processa_login.php  →  sessão PHP ativa
```

Implementado em `_create_bsc_session()` — `epa_bsc.py:57`.

### Listar indicadores filhos

```
POST /api/epa/painel-bsc/indicadores/{indicator_id}/filhos

Request:
{
  "indicador": "optional",
  "etapa": "...",
  "espaco": "---",
  "planejamento": "...",
  "cbocolaborador": "todos",
  "linkconfiguracao": "...",
  "cbounidadeorigem": "...",
  "cbounidade": "...",
  "cbotipo": "...",
  "codigo_objetivo": "...",
  "indicador_origem": "optional",
  "fonte": "painel_bsc"
}

Response: List[dict]   // indicadores filhos
```

#### Endpoint EPA chamado internamente

```
POST /epa/tabela_indicador_filho.php

Headers:
  X-Requested-With: XMLHttpRequest
  Content-Type: application/x-www-form-urlencoded; charset=UTF-8

Body: form data com todos os parâmetros de contexto acima
```

### Obter formulário de valor do indicador

```
POST /api/epa/painel-bsc/indicadores/{indicator_id}/valor-form

Request: (mesmo corpo de contexto acima + campos opcionais)
{
  "request_context": { ... },
  "period_label": "Jan/2026",      // opcional
  "target_date": "2026-01-31"      // opcional
}

Response: dict com HTML do formulário e campos
```

> Requer usuário **admin**.

#### Endpoint EPA chamado internamente

```
GET /epa/incluir_valor_indicador_bsc.php?{query_params_do_contexto}
```

### Salvar valor do indicador

```
POST /api/epa/painel-bsc/indicadores/{indicator_id}/valor-form/salvar

Request:
{
  "request_context": { ... },
  "values": {
    "campo1": "valor1",
    "campo2": "valor2"
  },
  "period_label": "Jan/2026",
  "target_date": "2026-01-31"
}

Response:
{
  "status": "saved",           // "saved" | "needs_review"
  "message": "Valor salvo com sucesso.",
  "form": null                 // formulário atualizado (quando needs_review)
}
```

> Requer usuário **admin**.

#### Fluxo interno

1. Extrai o formulário HTML (`id="form1"`) do endpoint EPA.
2. Mescla os valores padrão do formulário com os novos valores fornecidos.
3. Submete via POST para a action URL do formulário.

---

## Atividades — Gráfico de Planos

**Arquivo:** `backend/routers/epa.py` — linhas ~49-80

Retorna os planos de ação do usuário em formato gráfico/grid, conforme exibido no EPA.

### Endpoint IDReport

```
GET /api/epa/planos-de-acoes/grafico

Response: JSON com estrutura de gráfico de planos
```

#### Endpoint EPA chamado internamente

```
GET {EPA_API_BASE_URL}/epa/api/planos-de-acoes/grid/Grafico

Headers:
  Authorization: Bearer {token}

Query params:
  quem: <epa_id do usuário>   // obrigatório para escopo por usuário
```

---

## Utilitários e Helpers

**Arquivo:** `backend/routers/planos_acao_utils.py`

| Função | Descrição |
|--------|-----------|
| `_get_epa_auth_context(db, user)` | Retorna `(base_url, headers)` com Bearer token |
| `_epa_get(client, url, params, headers, ...)` | GET com retry automático em 401 |
| `_epa_post_form(client, url, data, headers, ...)` | POST form com retry automático em 401 |
| `_epa_login_page(base_url)` | Retorna URL da página de login: `/epa/login.php` |
| `_epa_panel_page(base_url)` | Retorna URL do painel: `/epa/painel_iniciativa5w2h.php` |
| `_build_epa_browser_headers(base_url, token, referer)` | Monta headers com Origin, Referer, User-Agent, Authorization |

**Arquivo:** `backend/epa_bsc_models.py` — parsing de HTML do EPA

| Função | Descrição |
|--------|-----------|
| `_decode_epa_response_content()` | Trata encoding UTF-8/CP1252/Latin1 com reparo de mojibake |
| `_clean_text()` | Normaliza espaços e encoding de texto |
| `_parse_anchor_title()` | Extrai descrição e unidade dos títulos |
| `_parse_responsible_title()` | Extrai nome do analista, login e unidade |
| `_build_indicator_request_context()` | Monta contexto de query para indicadores |

---

## Tabela Resumo de Endpoints

### Endpoints do IDReport (chamados pelo frontend)

| Método | Rota | Autenticação | Descrição |
|--------|------|-------------|-----------|
| GET | `/api/users/me/epa-status` | Sessão IDReport | Status da conexão EPA do usuário |
| PUT | `/api/users/me/epa-credentials` | Sessão IDReport | Salvar credenciais EPA |
| DELETE | `/api/users/me/epa-credentials` | Sessão IDReport | Remover credenciais EPA |
| GET | `/planos-acao/epa-status` | Sessão IDReport | Status EPA no contexto de planos |
| POST | `/planos-acao/vincular` | Sessão IDReport | Vincular plano do EPA ao IDReport |
| GET | `/planos-acao/buscar` | Sessão IDReport | Buscar plano por código |
| GET | `/planos-acao/buscar-grid` | Sessão IDReport | Buscar árvore de planos |
| POST | `/planos-acao/{id}/acompanhamento` | Sessão IDReport | Registrar acompanhamento |
| GET | `/planos-acao/{id}/acompanhamento` | Sessão IDReport | Listar acompanhamentos |
| POST | `/planos-acao/concluir-tarefa` | Sessão IDReport | Concluir tarefa no EPA |
| GET | `/api/epa/planos-de-acoes/grafico` | Sessão IDReport | Gráfico de planos do usuário |
| GET | `/api/epa/painel-bsc` | Sessão IDReport | Painel BSC de indicadores |
| POST | `/api/epa/painel-bsc/indicadores/{id}/filhos` | Sessão IDReport | Indicadores filhos |
| POST | `/api/epa/painel-bsc/indicadores/{id}/valor-form` | Sessão IDReport (admin) | Formulário de valor |
| POST | `/api/epa/painel-bsc/indicadores/{id}/valor-form/salvar` | Sessão IDReport (admin) | Salvar valor do indicador |

### Endpoints do EPA chamados pelo backend

| Método | Endpoint EPA | Mecanismo | Uso |
|--------|-------------|-----------|-----|
| POST | `/epa/api/api/login` | REST | Obter token JWT |
| POST | `/epa/api/api/novo/login` | REST | Obter token para sessão web |
| POST | `/epa/processa_login.php` | Form HTML | Estabelecer sessão web PHP |
| GET | `/epa/api/planos-de-acao` | REST + Bearer | Listar planos |
| GET | `/epa/api/planos-de-acoes` | REST + Bearer | Listar planos (alternativo) |
| GET | `/epa/api/planos-de-acoes/grid/Grafico` | REST + Bearer | Gráfico de planos |
| POST | `/epa/api/planos-de-acoes/acompanhamentos/salvar` | REST + Bearer | Salvar acompanhamento |
| POST | `/epa/api/planos-de-acoes/acompanhamentos/listar` | REST + Bearer | Listar acompanhamentos |
| GET | `/epa/epa_iniciativa5w2h/objetivo/ajax.php` | Sessão web | Concluir tarefa |
| POST | `/epa/tabela_indicador_filho.php` | Sessão web | Listar indicadores filhos |
| GET | `/epa/incluir_valor_indicador_bsc.php` | Sessão web | Formulário de valor de indicador |
