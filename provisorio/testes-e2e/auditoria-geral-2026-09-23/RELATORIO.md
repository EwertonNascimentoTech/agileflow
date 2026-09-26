# Auditoria geral do AgileFlow — teste de ponta a ponta (23/09/2026)

> **Documento sensível:** contém falhas de segurança com passos de reprodução. Não publicar fora do time.

Executado contra o sistema no ar (`tenant_ss`), com identidades de teste isoladas (admin da empresa,
super admin, coordenador, PO, dev, PO Externo) e dados marcados `[E2E]`. Tudo foi removido ao final
(varredura de 445 colunas de texto: zero resíduos).

| Frente | Cobertura |
|---|---|
| A — API (leitura) | 185 rotas GET × 3 execuções; matriz de 91 rotas × 5 perfis |
| B — Telas (Chromium) | 77 rotas (admin) + ~100 interações; 6 perfis; 390 px; 321 prints |
| C1 — Escrita em Processos | 291 chamadas: solicitação → conversão → contratação → Features/US → cronograma/baseline/import → OA → PO Externo |
| C2 — Escrita nos demais módulos | 517 chamadas: Pessoas, áreas, stacks, ausências, desligamento, Produtos, Indicadores, RTD, Docs, Configurações, Super admin |
| D — Causa da lentidão | perfis cProfile, contagem de queries, EXPLAIN, concorrência, bundle, infra |

**Banco não é o gargalo** (100% cache, board executa em 11 ms no Postgres). A lentidão é do
Python: a tabela `project_tasks` inteira (~2,4 mil linhas × 46 colunas) é recarregada várias vezes
por requisição, N+1 no caminho crítico, serializador lento, chamadas externas em série e trabalho
de CPU segurando os 4 workers.

---

## P0 — Segurança (corrigir primeiro)

| # | Falha | Onde | Evidência |
|---|---|---|---|
| S1 | **Admin da empresa promove qualquer usuário a `super_admin`** (controle da plataforma inteira) | `company/api/routes.py:184-199` não valida `role`; `super_admin/service.py:448-461` aplica tudo com `setattr` | PATCH `{"role":"super_admin"}` → 200; usuário passou a ler `/super-admin/tenants` (revertido) |
| S2 | **Sequestro de conta pelo "primeiro acesso"**: quem só sabe o e-mail de um usuário/Pessoa/cliente que ainda não logou define a senha dele | `super_admin/service.py:537-580` devolve o `setup_token` na resposta de `/auth/first-access/check` | Senha definida pelo admin foi trocada; a original passou a dar 401. Afeta também clientes da Operação Assistida |
| S3 | **PO Externo lê dados de todo o portfólio e escreve fora do escopo** | rotas sem `_assert_task_in_scope`/`_po_external_scope` em `projetos/api/routes.py`: `form-values` (1762), `planning-nodes` (1142), `priority/matrix` (2115), `baselines` GET/POST (1678/1688), `close-revision` (1703), `schedule-lock(s)` (1636-1665), `workload` (1329), `dependencies` (1299), `schedule-overload` (1366), `assignee-absences` (1348), `uploads/url` (832), `config/stage-agents` (1953) | 860 formulários com e-mails/cargos; 2.341 cards da matriz; URL assinada de anexo alheio; **abriu revisão de cronograma em projeto de outro PO** |
| S4 | **Catálogo de Programas sem permissão**: qualquer usuário cria e apaga (DELETE físico) | `projetos/api/routes.py:1081-1093` | PO Externo criou, Dev apagou |
| S5 | **Permissões de "visualizar" não são checadas no backend** — o controle é só o menu | `require_module` só confere módulo ativo; GETs de Produtos/Indicadores/RTD/Pessoas usam só `_ctx` | Dev/PO Externo leem 112 produtos com contratos e valores; PO lê 58 Pessoas com e-mail; dev/PO leem Indicadores e RTD e **geram link público de RTD** (`rtd/api/routes.py:66-78`); `/teamops/absences/calendar` (`teamops/api/routes.py:522`) mostra ausências de todos com observações (inclui afastamento médico); `/company/admin/users` lista os 48 usuários com e-mail para qualquer um |
| S6 | **Desligar ou excluir Pessoa não revoga o login** | `teamops/service.py:875-884` e `PersonService.delete` (1217-1227) | Pessoa desligada logou, renovou token e leu módulos; excluída deixa usuário ativo órfão |
| S7 | **Qualquer cargo com `task.manage` (inclusive Dev) salva baseline e abre revisão de qualquer projeto** | `projetos/api/routes.py:1688` | — |

A confirmar (pode ser intencional): Dev/PO/Coordenador acessam as visões consolidadas (PO Sync,
Portfólio, Relatórios, Capacidade); `team-performance` dá 403 até para o coordenador.

---

## P1 — Funções quebradas

| # | Problema | Onde | Evidência |
|---|---|---|---|
| F1 | **PMO › Painel PO (Portfólio e Gestão) aparece vazio** — "Sem projetos", mensagem enganosa | `po-portfolio` 21–25 s e `/overview` 33–38 s > timeout do axios de 20 s (`frontend/src/api/client.ts:8`); `PODashboardPage.tsx:280/298` | Tela vazia para admin/PMO; o servidor segue processando e trava um worker |
| F2 | **Gantt/Cronograma trava a aba por 40–85 s** (e derrubou o Chromium uma vez) | `GanttPage.tsx` ~496–507 renderiza as ~2.448 tarefas antes de autoselecionar o projeto | 43–48 s de long tasks; com `?root=` abre em 0,6 s |
| F3 | **TeamOps: Dashboard, Alertas e Mapa de competências dão 500** assim que existir uma stack vinculada a alguém (hoje há 0 vínculos) | `teamops/service.py:1733` usa `person.team_role` (coluna removida) | Reproduzido pelas frentes A e C2 |
| F4 | **Aba "Aprovações" de ausências vazia para o coordenador** | `teamops/api/routes.py:507-511` força "só as próprias" para todo company_user | Coord recebe `[]`, admin recebe as 4 pendentes |
| F5 | **Criar usuário descarta a Função escolhida** | `super_admin/service.py:479-485` | `role_id` enviado, gravado nulo |
| F6 | **Salvar parte do formulário apaga o resto** (risco real no drawer ao mover antes do formulário carregar) | `projetos/service.py:4315` valida o merge, `:4723` grava só o parcial | 18 campos viraram 2 |
| F7 | **Contratação ganha manda o card de Prospectar para "Impedimento"** | `procurement.py:431/631` pega a próxima raia por ordem | — |
| F8 | **Trava de cronograma com brechas**: criar US, importar Excel e excluir funcionam com o projeto travado | `create()` (service.py:3858), `delete()` (5485), `import_xlsx()` (12237) sem `assert_editable` | Prazo/horas do projeto mudaram (36 h → 40 h) sem revisão |
| F9 | **Coordenador/Administrativo não movem US de outro responsável** (contradiz a regra "responsável ou coordenação") | `_check_us_move_authorship` (service.py:2567-2572) só libera company_admin | 403 para o coordenador |
| F10 | **Feature concluída automaticamente sem histórico e sem passar pela Homologação (PO)** | reconciliação em service.py:2834 | Timeline da Feature vazia |
| F11 | **Datas da RTD com 1 dia a menos** (Agosto aparece 31/07–30/08) | `new Date('YYYY-MM-DD')` em `RtdReuniaoPage.tsx:16`, `RtdReunioesPage.tsx:30` | — |
| F12 | Agente "Triagem Backlog" devolve a solicitação por campos ocultos na etapa (Início/Prazo/Horas) e "riscos" com risco = Não | prompt/config do agente | 3 devoluções seguidas |
| F13 | Deep link perde kanban/visão (`?funnel=`, `/lista`, `/calendario`) | `ProjectBoardPage.tsx:1248` | Abre sempre Prospectar/Quadro |
| F14 | Status Reports e PO Sync: filtro sem resultado some com a barra de filtros (não dá para desfazer) | `PoSyncPage.tsx:917` | — |
| F15 | Modal "detalhe do dia" da Capacidade não fecha com Esc | `CapacityDayDetailDialog.tsx` | Só pelo botão |

---

## P2 — Desempenho

| # | Onde | Tempo medido | Causa | Correção e ganho estimado |
|---|---|---|---|---|
| D1 | PMO › Portfólio / Gestão | 21–25 s / 33–38 s | `PoPortfolioService.build` (service.py:11826) chama `critical_path` ~120× (5419-5427), cada vez recarregando calendário, todas as tarefas e dependências; `build_overview` (11995) repete tudo por PO — 521 queries, ~300 mil hidratações ORM | Carregar uma vez + CPM só na subárvore + overview num `build` único. **Protótipo validado: 23 s → 2,4–3,5 s, saída idêntica** |
| D2 | RTD › Planos EPA / link público / relatório (reunião em rascunho) | 5–16 s por categoria; público 11,8 s | `rtd/epa_client.py:249-269` faz 5 POSTs ao EPA em série; cache em memória de cada worker (19 MB); link público sem login dispara as chamadas; `epa_planos: []` cai no padrão do `.env` (`rtd/service.py:886-899`) | `asyncio.gather` + cache Redis (TTL 5–10 min): ~50 ms quente |
| D3 | Criar/mover solicitação para Backlog/Classificação | 9–15 s | agentes de IA rodam dentro da requisição (service.py:3973 e 4739) | Rodar no Celery e atualizar o card depois |
| D4 | Board do kanban | 0,6–1,0 s, 2,9 MB, 1.872 cards de todos os kanbans; User Story renderiza 1.359 cards (3–7 s) | `jsonable_encoder` (routes.py:1066) 260–364 ms vs `dump_json` 25 ms; gzip nível 9; carrega todas as colunas; cada salvamento no drawer recarrega o board inteiro e refaz 14 chamadas (`ProjectBoardPage.tsx:2411`, `ProjectTaskDrawer.tsx:286`); chamadas duplicadas (`fields` ×4) | Serializar com `dump_json`, gzip 6, filtrar por kanban, recarregar só quando outro card mudou: ~0,6 s → 0,25 s |
| D5 | Mover card de projeto (PATCH) | ~1 s | `_rollup_tree` e o gate de desenvolvimento carregam todas as tarefas do tenant (service.py:5277, 4061) | Carregar só a árvore do card-raiz |
| D6 | Relatórios compostos: RTD report, Desempenho, PO Sync, Indicadores | 1,2–2,4 s | recarregam a mesma base 4–7× por requisição; `produtos/models.py:388-412` com ~12 `selectin`; indicador PORTFOLIO devolve 2,6 MB | Snapshot por requisição + `load_only` + cache Redis ~60 s: RTD 2,2 → <0,8 s |
| D7 | Matriz de priorização | 0,35–1,1 s, 600 KB | carrega `ProjectTask` completo para devolver `task_id → quadrante` (service.py:11547) | Endpoint enxuto: ~40 ms |
| D8 | Infra | — | 4 workers uvicorn com trabalho de CPU nos handlers; 1 requisição pesada atrasa as leves do mesmo worker (sino: p99 1,7 s durante o Portfólio) | Resolver D1–D6; depois `API_WORKERS=6` |
| D9 | Primeiro carregamento do site | +555 KB | `vite.config.ts:26-31` (`manualChunks`) faz pré-carregar gráficos e markdown | Isolar helpers comuns: −150 KB gzip |

Rápidos (OK): `/auth/me` 15 ms, sino 12–21 ms, heatmap 0,2–0,5 s, drawer 14 chamadas em ~100 ms,
Produtos < 250 ms, Documentação < 20 ms. Não falta nenhum índice para as consultas quentes.

---

## P3 — Menores

- Filtro de Área mostra UUID cru (2 cards "VisitasHUB" com `area` = id do TeamOps).
- PDF da RTD com "Voltar ? reuni?o" (`RtdPresentationPrintPage.tsx:50`).
- `/app/dashboard` chama `/company/admin/roles` (403 no console) para todo usuário comum (comportamento de 17/08).
- Notificações dão 500 para super admin (`company/api/routes.py:282`).
- Módulos desativados (CRM, estoque, PDV, atendimento, propostas) ainda têm rotas montadas; abrem com erro.
- Coordenador tem item duplicado no menu lateral ("Solicitações" e "Processos").
- Ausências sobrepostas da mesma pessoa são aceitas; calendário mostra ausências recusadas.
- Aprovar ausência devolve `approver_person: null` (grava certo no banco).
- Análise de RTD aceita indicador inexistente.
- `/health` pelo domínio público devolve a SPA (sempre 200); o da API não checa banco/Redis.
- Celery deixa conexões "idle in transaction" por 5–30 min.
- Documentação expõe `docs/usuario/PROMPT-tutorial-prints-claude-code.md` a todos.

---

## Efeitos colaterais do teste (todos revertidos)

- A automação "Atribuir Responsável" do Backlog de Prospectar atribuiu um card de teste à Pessoa
  real "Ewerton Costa do Nascimento" 2× por <10 s (sem notificação; card apagado).
- 2 consultas somente-leitura ao EPA externo (sem dados pessoais), por causa de D2.
- Produto de teste visível no portfólio público por ~10 min; US de teste no quadro real por ~1 min.
- Durante S1, um usuário de teste virou super admin e foi revertido na hora.

## Ordem recomendada de correção

1. **Hoje:** S1 (validar `role` no PATCH), S4, S7, F3 (1 linha), F5, F6.
2. **Segurança em seguida:** S3 (escopo do PO Externo em todas as rotas por card/projeto), S5
   (checar permissões `.view` no backend), S6 (revogar login), S2 (primeiro acesso só com token
   enviado por e-mail — depende do envio de e-mail da Fase 6; medida provisória: o admin gera o
   link de primeiro acesso).
3. **O que o usuário sente:** D1 (Painel PO — resolve F1), F2 (Gantt abre já com um projeto), D3
   (agentes no Celery), D2 (cache do EPA), D4/D5 (board e movimentos).
4. Demais P1, D6–D9 e P3.

---

## Status das correções

| Item | Status | Commit |
|---|---|---|
| S1, S4, S7, F3, F5, F6 | Corrigido e verificado (18/18) | `6cd0d5a` |
| S2, S3, S5, S6, F4 (aprovações do coordenador) | Corrigido e verificado (55/55 + telas) | `d10215b` |
| Celery: tarefas falhavam de forma intermitente (loop fechado) — achado durante a verificação | Corrigido (24/24 execuções) | `d10215b` |
| F1/D1 Painel PO (Portfólio 22,6 → 2,9 s; Gestão 34,7 → 2,8 s, saída idêntica), F2 Gantt (60 → 2,8–3,3 s; visão completa 1,5 s, de ~4 milhões para 16 mil nós), D2 EPA (7–9 s → 0,02 s em cache), D3 agentes no Celery (despacho 0,23 s; execução real de 16 s em segundo plano), D4 board (serialização 0,46 → 0,065 s, gzip 6, drawer sem recarga a cada save), D7 selo de quadrante (0,03 s) | Corrigido e verificado | `35ce50a` |
| F7 Contratação ganha retoma a etapa de destino (não Impedimento), F8 trava em criar/excluir/importar, F9 coordenação move US, F10 Feature vai para Homologação (PO) com histórico, F11 datas da RTD, F12 triagem pela visibilidade da etapa (agente real aprovou pedido completo com opcionais vazios), F13 link mantém visão e kanban, F14 filtros com recorte vazio, F15 Esc no detalhe do dia | Corrigido e verificado (22/22 backend + 11/11 telas) | (este bloco) |
| D4 board (slim sem colunas pesadas, colunas/Lista em lotes: kanban US 3,9 → 1,6 s), D5 mover card (360–440 → 160–200 ms), D6 relatórios (PO Sync 0,76 → 0,38 s e 8–22 ms em cache; RTD 1,2 → 0,73 s; Desempenho 1,3 → 0,7 s; saídas idênticas), D9 primeira tela sem gráficos/markdown/dnd (~160 kB gzip) | Corrigido e verificado (14/14 telas) | (bloco 5) |
| D8 workers | Medido: 2 pesados simultâneos → sino p95 160 ms; 4 → p95 0,6 s. Subir para 6 exige max_connections maior (restart do Postgres) | decisão do usuário |
| P3 — os 12 itens: área com UUID (validação + 2 cards corrigidos), PDF da RTD, 403 de /roles, sino do super admin, módulos desativados, atalho duplicado do coordenador, ausências sobrepostas/recusadas, aprovador na resposta, análise de indicador inexistente, /health, Celery idle in transaction (já resolvido no bloco 2, medido), prompt fora de docs/ | Corrigido e verificado (13/13 backend + 8/8 telas + menu; regressão OA 69/69 + 18/18) | (bloco 6) |
| Gantt completo: rolagem nos dois eixos, coluna/cabeçalho fixos, abre em hoje, zoom e ajustar funcionando, travas num resumo | Corrigido e verificado (17/17 telas) | (Gantt) |
| Sobrecarga do cronograma: com raiz 0,84 → 0,16–0,45 s; sem raiz 0,92 → 0,69 s; de brinde detalhe do dia 0,78 → 0,23 s e grade por pessoas 0,69 → 0,23 s (saídas idênticas) | Corrigido e verificado | (sobrecarga) |
| D8 API com 6 workers (pool 5+7, total 132 conexões, sem reiniciar o Postgres): sino com 4 pesados p95 482 → 22–35 ms; com 8, p95 681 → 94–171 ms | Aplicado e medido | (D8) |
| B8 EPA desligável por reunião ([] = desligado, null = padrão; 11 ms em vez de ~7 s) | Corrigido e verificado (10/10 API + 5/5 tela) | (B8) |
| Extra (achado no D8) | Produção com DEBUG=true: Swagger e /openapi.json abertos na porta 18084 → DEBUG=false e /openapi.json atrás do mesmo flag | Corrigido | `4e5703d` |
| Pendentes | Nenhum item da auditoria. Observação: a porta 18084 da API segue publicada em todas as interfaces do servidor | — |
| Achado novo (pré-existente) | Visão completa do Gantt não rola na horizontal (`.gantt { overflow: hidden }`): com dados de 2025-10 a 2032-03, só as ~5 primeiras semanas aparecem | — |
