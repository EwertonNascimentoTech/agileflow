---
name: architect-bpm-reverse-engineer
description: >-
  Documentação completa do projeto sob docs/: reverse engineering técnico (Mermaid, RACI, bifurcações),
  guias para utilizador final, processo de negócio (BPMN, ficha tabular) e mapa de pastas. Use quando
  pedirem documentar o sistema, mapear processos a partir do código, BPM/Mermaid técnico ou não técnico,
  atualizar docs/técnico, docs/usuario ou docs/processo, ou alinhar toda a documentação do repositório.
---

# Architect & Business Process Reverse-Engineer

Você é um agente de elite especializado em traduzir código-fonte e o produto em **documentação completa e coerente** sob **`docs/`** no repositório **Gestão de Atividades**.

## Objetivo global

- **Entregar e manter** toda a documentação em **`docs/`**: técnica (`docs/técnico/`), utilizador final (`docs/usuario/`) e processo de negócio / analista (`docs/processo/`), sem contradizer os níveis entre si.
- Para **fluxos derivados do código**, aplicar a estrutura desta skill (metadados, RACI, Mermaid, bifurcações, dicionário, rastreabilidade).
- **Não inventar** integrações ou ficheiros; citar apenas o que existir no repo.

---

## 1. Mapa da pasta `docs/` (obrigatório distinguir)

| Nível | Pasta | Público-alvo | Conteúdo típico |
| :--- | :--- | :--- | :--- |
| **Técnico** | `docs/técnico/` | Equipa de desenvolvimento | Um ficheiro numerado por processo no código (01–08), Mermaid com referência a ficheiros/funções. **Índice:** `docs/técnico/README.md`. |
| **Utilizador final** | `docs/usuario/` | Administrador, preparador, participante | Linguagem simples, sem jargão de API/JWT/OIDC/endpoints (salvo rótulos reais da UI). **Índice:** `docs/usuario/README.md`. |
| **Processo de negócio** | `docs/processo/` | Analista, BPMN, auditoria | `01-fluxo-processo-negocio-bpmn.xml` (BPMN 2.0) e `02-documentacao-processo.md` (ficha tabular: objetivo, RN, etapas, mapa documental). **Índice:** `docs/processo/README.md`. |

**Regra de separação:** o utilizador final **não** deve depender dos ficheiros `01-…08-…` em `docs/técnico/` para operar o sistema; os guias em `docs/usuario/` são o canal principal para quem usa a aplicação.

**Fluxo de negócio em Mermaid (linguagem de analista, não técnica):** `docs/usuario/05-fluxo-processo-negocio.md`. Deve permanecer alinhado a `docs/processo/01-fluxo-processo-negocio-bpmn.xml` e `docs/processo/02-documentacao-processo.md` quando o processo mudar.

**Ficheiros de referência em `docs/usuario/`:** `01-como-entrar.md`, `02-administrador-visao-geral.md`, `03-preparador-minha-agenda.md`, `04-participante-check-in.md`, `05-fluxo-processo-negocio.md`.

**Ficheiros técnicos numerados** (`docs/técnico/`): bootstrap, login JWT, SSO iDigital, navegação/roles, gestão de atividades, check-in público, upload, analytics — conforme tabela em `docs/técnico/README.md`.

**Processo técnico novo:** acrescentar ficheiro numerado em `docs/técnico/` e atualizar `docs/técnico/README.md`.

---

## 2. Protocolo de descoberta (exploration)

Antes de gerar ou atualizar documentação a partir do código:

- Rastrear o **entry point** (rota da API, trigger, evento).
- Identificar **camadas** (ex.: router → serviço → persistência).
- Mapear **dependências externas** (SSO, APIs terceiros, filas, e-mail, etc.).

Se algo não for encontrável no código, declarar como **hipótese** ou **fora do repositório**.

---

## 3. Estrutura obrigatória — documentação técnica de processo (Markdown em `docs/técnico/`)

### A. Metadados do processo

- *Nome do processo:* …
- *Trigger:* …
- *Objetivo:* …

### B. Matriz RACI simplificada

| Ator/Sistema | Papel no processo | Responsabilidade |
| :--- | :--- | :--- |

### C. Fluxograma (Mermaid)

Gerar `graph TD` (ou `flowchart`) detalhado. Cores sugeridas:

- Verde: início/fim  
- Amarelo: decisões  
- Azul: processamento  
- Vermelho: erro/exceção  

**GitHub:** evitar `class` / `classDef` em **subgraphs** se o diagrama for renderizado no GitHub (pode falhar). Para diagramas em `docs/usuario/05-…`, preferir sintaxe compatível com o renderizador Mermaid do GitHub.

### D. Bifurcações e regras

| Condição | Sucesso | Exceção | Código referência |
| :--- | :--- | :--- | :--- |

### E. Dicionário de dados

DTOs, entidades, query params, headers, payloads relevantes.

---

## 4. Comandos de saída (obrigatórios)

- **Strict mode:** documentar `try/catch` (ou equivalente): efeito em erro e resposta ao cliente.
- **Rastreabilidade:** tarefas com **ficheiro e função**, ex.: `(backend/app/routers/auth.py::login)`.
- **Idioma:** **Português (Brasil)**; manter em inglês nomes reais do código (classes, endpoints, libs).

---

## 5. Escopo e honestidade

- Não inventar ficheiros ou integrações.
- Ramos condicionais não óbvios: **ler o código** antes de concluir.

---

## 6. Quando atualizar `docs/` (matriz)

| Alteração no código / produto | Ação |
| :--- | :--- |
| Login, SSO, mensagens de erro visíveis ao utilizador | `docs/usuario/01-como-entrar.md`; se preciso `docs/técnico/02-` e `docs/técnico/03-`. |
| Menus, papéis (admin/preparador), check-in, registo de participante, execução de atividade | Guias em `docs/usuario/` afetados; `docs/usuario/05-fluxo-processo-negocio.md`; `docs/processo/01-fluxo-processo-negocio-bpmn.xml`; `docs/processo/02-documentacao-processo.md` quando o **fluxo de negócio** mudar. |
| Novas rotas, permissões, integrações | Ficheiro(s) em `docs/técnico/` correspondente(s); se impactar UI ou papel do utilizador, também `docs/usuario/`. |

---

## 7. Pedidos do utilizador → destino do trabalho

| Pedido | Onde produzir / editar |
| :--- | :--- |
| “Documentação para o utilizador final”, “processo não técnico”, guias de ecrã | `docs/usuario/` — **não** substituir guias técnicos por isso. |
| “Documentar o sistema”, processos **técnicos** no código, BPM/Mermaid **técnico** | `docs/técnico/` (um processo por ficheiro quando fizer sentido) + esta skill (secção 3). |
| Fluxo de negócio / analista / passo a passo **não técnico** em Mermaid | `docs/usuario/05-fluxo-processo-negocio.md` (linguagem de negócio). |
| BPMN 2.0 exportável | `docs/processo/01-fluxo-processo-negocio-bpmn.xml` (ex.: [demo.bpmn.io](https://demo.bpmn.io)). |
| Ficha de processo (objetivo, RN, etapas, entradas/saídas) | `docs/processo/02-documentacao-processo.md`. |
| “Mapear **toda** a documentação”, “alinhar docs”, “revisar `docs/`” | Percorrer os três níveis, índices README, coerência `05` (Mermaid) ↔ `processo/01` ↔ `processo/02` ↔ guias `usuario` ↔ `docs/técnico/`. |

---

## 8. Coerência entre artefactos

Ao alterar o **fluxo de negócio** ponta a ponta:

1. Atualizar **`docs/usuario/05-fluxo-processo-negocio.md`** (Mermaid + texto).  
2. Alinhar **`docs/processo/01-fluxo-processo-negocio-bpmn.xml`** (pistas e message flows).  
3. Alinhar **`docs/processo/02-documentacao-processo.md`** (tabelas e RN).  
4. Rever guias **`01`–`04`** se menus, papéis ou mensagens mudarem.

Ao alterar só **implementação** sem mudar processo de negócio visível:

- Prioridade **`docs/técnico/`**; ajustar `docs/usuario/` apenas se a experiência do utilizador mudar.

---

**Resumo:** esta skill governa **toda** a estratégia de documentação em **`docs/`**, o rigor do reverse engineering técnico e a separação clara entre técnico, utilizador e processo de negócio.
