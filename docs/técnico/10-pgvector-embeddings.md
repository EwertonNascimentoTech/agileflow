# 10 — pgvector e embeddings (busca semântica)

## A. Metadados do processo

- *Nome do processo:* Busca semântica — texto dos registros vira vetor (BAAI/bge-m3) guardado no Postgres (pgvector)
- *Trigger:* código que salva um registro enfileira `embeddings.index_source`; quem busca chama `EmbeddingService.search`
- *Objetivo:* achar registros **pelo significado** (não só palavra igual) e dar contexto (RAG) aos agentes do IDCortex
- *Estado:* **ligado em produção desde 2026-09-27** (`VECTOR_ENABLED=true`, `COMPOSE_PROFILES=ia`, `saas_embeddings` no ar). O padrão do código continua desligado (`VECTOR_ENABLED=false`). Primeiro consumidor: o Assistente do Portal (seção E)

Decisões:

- **Imagem do Postgres própria** (`db/Dockerfile`): a mesma `postgres:16-alpine` + pgvector compilado. **Não** usar `pgvector/pgvector:pg16` (Debian/glibc): o banco usa collation `en_US.utf8` do musl; no glibc a ordem de texto muda e os índices de texto existentes ficam inconsistentes sem erro.
- **Modelo BAAI/bge-m3** (gratuito, multilíngue, 1024 dimensões, até 8192 tokens). Roda **no próprio servidor**: o texto não sai para gerar o vetor.
- **Compatível com o IDCortex** porque são papéis separados: o embedding só acha os trechos; o IDCortex recebe os trechos **em texto** (anonimizados por `anonymize.py`, como hoje), nunca os vetores.
- **Container separado** (`saas_embeddings`): o modelo carregado ocupa ~1,5 GB de RAM (`mem_limit: 3g` no compose); carregado na API (6 workers) e no Celery (4) seriam 10 cópias.
- **Fora do TenantBase:** tabela e tipo `vector` em SQL cru. O `create_all` de tenant novo não pode depender da extensão.

## B. Peças

| Peça | Onde | Papel |
| :--- | :--- | :--- |
| Imagem do banco | `db/Dockerfile` | pgvector 0.8.0 compilado (`OPTFLAGS=""`, sem JIT) |
| Serviço de embeddings | `embeddings/` (compose `embeddings`, profile `ia`) | `POST /embed {texts}` → vetores normalizados; `GET /health?load=true` aquece |
| Extensão | `ensure_vector_extension()` (`core/tenant_migrations.py`) | No startup, com `VECTOR_ENABLED`: `CREATE EXTENSION vector` em `public` se a imagem tiver |
| Tabela | step `145_embeddings` | `{tenant}.embeddings` (pedaço de texto + `vector(1024)`, HNSW cosseno), só com a extensão |
| Serviço | `core/embeddings.py` (`EmbeddingService`) | `index` (pedaços de ~2000 caracteres, recalcula só o que mudou), `delete`, `search` |
| Tarefa | `embeddings.index_source` (`tasks/scheduled.py`) | Indexa fora da requisição; serviço fora do ar = tenta de novo (1, 5, 25 min, ~2 h, 6 h) |

## C. Como usar num módulo

```python
# ao salvar (fora da requisição):
celery_app.send_task("embeddings.index_source", args=[schema, "project_task", str(task.id), f"{task.title}\n\n{task.description}"])

# ao buscar (503 se o serviço estiver fora):
hits = await EmbeddingService.search(db, schema, "pergunta do usuário", source_types=["project_task"], limit=5)
# [{source_type, source_id, chunk_index, content, score}]  (score 0–1)

# ao apagar o registro:
await EmbeddingService.delete(db, schema, "project_task", task.id)
```

`source_type` é livre (um por tipo de registro). Medido no teste local (Mac M, CPU): busca ~160 ms (inclui gerar o vetor da pergunta); 4 textos curtos indexados em 1,4 s; perguntas com outras palavras acharam o registro certo em 1º (ex. "não consigo pagar a fatura, o site congela" → "erro ao emitir boleto… a página trava").

Registro que o usuário não pode ver continua sendo filtrado pelo módulo: a busca devolve ids, a permissão é de quem chama.

## E. Assistente do Portal (primeiro consumidor)

O chat do Portal (`projetos/portal_assistant.py`) usa a base `projetos/assistant_knowledge.py`. Regras em `.claude/invariantes.md` ("Assistente do Portal: busca por significado").

| Origem (`source_type`) | Texto | `scope_id` |
| :--- | :--- | :--- |
| `portal_projeto` | nome, produto, programa, pilar, área | card-raiz |
| `portal_feature` / `portal_historia` | código + título (+ Feature e projeto) | card-raiz |
| `portal_programa` | nome + descrição do programa ou do pilar | programa |
| `portal_ocorrencia` | campos que o cliente vê + comentários públicos | card-raiz (recorte das ocorrências) |
| `portal_ata` / `portal_encerramento` | resumo e decisões / decisão e análise crítica (só com OA iniciada) | card-raiz |

- **Só o que o Portal mostra.** Projetos, Features e histórias saem de `PortalPortfolioService._base` (o mesmo das telas). Descrição de card e comentário interno nunca entram.
- **Recorte no SQL:** `EmbeddingService.search(..., scopes=[(tipos, ids), ...])` soma pares (tipo, scope_id) com OU; com filtro, `SET LOCAL hnsw.iterative_scan = strict_order` (pgvector 0.8) para o HNSW não devolver menos do que o pedido.
- **Dado vivo:** o trecho só acha o item. A linha que vai para a IA (`semantic_lines`) usa situação, datas e % atuais; ocorrência ganha código e raia atuais (`_enrich_occurrences`). Projetos com trecho ganham peso na escolha do detalhe (`semantic_boost`).
- **Sincronização:** `EmbeddingService.sync` compara os docs com o gravado (hash por pedaço + modelo + scope) e só recalcula o que mudou; grava em grupos de 64 com commit e pulso (`heartbeat_at`). Celery beat `scheduled.sync_portal_knowledge` a cada 10 min (sem mudança não vira execução no log); manual/reindexar pela tela (`embeddings.sync_portal_knowledge`). Trava Redis `ai-knowledge-sync:{schema}` (15 min, renovada no pulso).
- **Sessão do Celery:** `tenant_session(schema)` reaplica o `search_path` a cada transação (`after_begin`), como o `require_module`. Sem isso, depois do 1º commit o asyncpg volta ao `public` e o ORM falha com "relation ... does not exist".
- **Tabelas (step 146):** `embeddings.scope_id`; `project_ai_assistant_settings` (linha única: usar busca, trechos por pergunta, nota mínima, origens, automática); `project_ai_sync_runs`; `project_ai_assistant_logs` (só métricas). Logs e execuções com mais de 90 dias são apagados na sincronização.
- **Tela:** Processos → Configurações → Assistente IA do Portal (`/app/modules/projetos/config/assistente-ia`, permissão `projetos.automation.manage`). Rotas `GET /projetos/config/ai-assistant/status`, `PUT .../settings`, `POST .../sync` (`{force}`), `POST .../warmup`, `POST .../search`, `GET .../runs`, `GET .../logs`.
- **Números medidos (2026-09-27, tenant_ss):** 2.152 registros, 1 trecho cada. Carga inicial ~12 min em CPU (~3 trechos/s, o container usa ~7 núcleos). Sincronização sem mudança: ~3,5 s. Busca no recorte: ~250 ms. Nota: relacionado 0,47–0,62; sem relação ≤ 0,42 (padrão da nota mínima: 0,45).

## D. Implantação (ordem segura)

1. **Backup** (`docker exec saas_backup backup.sh`) e, em produção, cópia do volume `postgres_data`.
2. **Imagem do banco:** `docker compose build postgres && docker compose up -d postgres`. Segundos fora do ar; dados e collation iguais. Conferir `SELECT default_version FROM pg_available_extensions WHERE name='vector'` → `0.8.0`.
3. **Serviço de embeddings:** `COMPOSE_PROFILES=ia` no `.env`, `docker compose up -d embeddings`, aquecer com `GET /health?load=true` pela rede interna (1º uso baixa ~3,6 GB para o volume `embeddings_models`).
4. **Ligar:** `VECTOR_ENABLED=true` no `.env` e recriar `api`, `celery_worker`, `celery_beat`. No log não pode aparecer "imagem do Postgres não tem pgvector".

Voltar atrás:

- Passo 4: `VECTOR_ENABLED=false` e recriar (a tabela fica, sem uso).
- Passo 3: parar o `embeddings` (busca responde 503; indexação fica tentando de novo).
- Passo 2: `image: postgres:16-alpine` no compose e recriar — **só antes** de criar a extensão; depois, `DROP EXTENSION vector CASCADE` antes (apaga as tabelas `embeddings`).
- **torch ≥ 2.6** é obrigatório: o bge-m3 publica os pesos em `.bin` e o transformers recusa `torch.load` em versões antigas (falha de segurança).
- Backup restaurado em outro servidor precisa da mesma imagem (o dump traz `CREATE EXTENSION vector`).
