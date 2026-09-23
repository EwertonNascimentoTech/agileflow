# Hist?rico do produto

Append-only. Toda mudan?a relevante ganha um bloco no topo.

Modelo:

```
## AAAA-MM-DD — t?tulo curto
- **Pedido:** —
- **Feito:** —
- **N?o mexer:** —
- **Arquivos:** —
```

---

## 2026-09-23 — SSO IDigital ligado em produção

- **Pedido:** Cadastrar o client no IdP e ligar o SSO.
- **Feito:** Na tela do IdP: URI de redirecionamento `https://agileflow.tdsistemafiea.com.br/sso/callback`, Servidor de Recurso `https://agileflow.tdsistemafiea.com.br`, pós logout `/login`, backchannel vazio (fase 2). Client ID gerado pelo IdP no `.env` do servidor (`SSO_ENABLED`, `SSO_CLIENT_ID`, `SSO_RESOURCE`; backup do `.env` antes) e `docker compose up -d api`. Conferido: CORS do IdP liberado para a origem (discovery e token), API alcança discovery e JWKS, e no domínio público o botão leva ao login do IDigital sem erro de client/redirect/resource.
- **Achado (anterior ao SSO):** o `location /` do `frontend/nginx.conf` tem `add_header` próprio, então o nginx não manda CSP, X-Frame-Options nem nosniff no HTML. Corrigir à parte, testando as telas.
- **1º login real:** 23:05, colaborador vinculado pelo e-mail (id_token traz `email`), auditoria `sso_login` ok. Teste de backend passou a contar só vínculos de teste (a tabela agora tem vínculos reais).
- **Arquivos:** `.env` (servidor, fora do git), `docs/técnico/09-sso-idigital.md`, `provisorio/testes-e2e/sso-idigital-2026-09-23/{ui_test.py,RESULTADO.md}`

## 2026-09-23 — Login pelo IDigital (SSO OIDC), desligado até o client existir

- **Pedido:** Analisar a doc do SDK IDigital SSO e integrar. Decisões: vincular pelo e-mail; manter senha e SSO; clientes externos (sem IDigital) seguem com senha.
- **Feito:**
  - Backend: `super_admin/sso.py` (discovery + JWKS com cache; valida id_token RS256, iss, aud, exp, iat, at_hash; uso único no Redis; vínculo por e-mail no 1º login e depois pelo `sub`; sem auto-cadastro; auditoria `sso_login` / `sso_login_denied`). Rotas `GET /auth/sso/config` e `POST /auth/sso/exchange` (10/min), que devolvem o mesmo `TokenResponse` do login. Tabela `public.user_sso_identities` (Alembic 007, aplicada). Config `SSO_*` (padrão desligado).
  - Front: `src/lib/sso.ts` com `oidc-client-ts` (mesma config do SDK: code + PKCE S256, resource, sessionStorage); botão "Entre com o IDigital" (logo oficial) acima do formulário de senha, só com o SSO ligado; tela `/sso/callback`; "Sair" de sessão SSO passa pelo `end_session` do IdP. CSP `connect-src` libera o host do IdP.
  - Não usei o pacote `@fiea-al/idigital-sso-sdk`: feed npm privado (PAT no build) e o botão dele carrega Google Fonts (bloqueado pela CSP). Mesma API em `sso.ts`.
  - Fatos do IdP de produção (discovery): `iss` sem `/sso/oidc`; só client público; sem refresh_token.
- **Testes:** `provisorio/testes-e2e/sso-idigital-2026-09-23/run.sh`: backend 29/29 (IdP falso, transação desfeita) e telas 17/17 (IdP simulado no Playwright; CSP e PKCE reais). OA 76/76 + 36/36 depois da mudança no login.
- **Para ligar:** cadastro do client `agileflow` no IdP e `SSO_*` no `.env` (ver `docs/técnico/09-sso-idigital.md`).
- **Não mexer:** troca termina em `create_tokens`; chamadas do SSO no front fora do interceptor do axios; CSP com o host do IdP.
- **Arquivos:** `backend/app/modules/super_admin/{sso.py,models.py,api/routes.py}`, `backend/app/core/config.py`, `backend/alembic/versions/007_user_sso_identities.py`, `frontend/src/lib/sso.ts`, `frontend/src/modules/auth/{IDigitalButton.tsx,SsoCallbackPage.tsx,LoginPage.tsx}`, `frontend/src/contexts/AuthContext.tsx`, `frontend/src/App.tsx`, `frontend/nginx.conf`, `frontend/package*.json`, `docs/técnico/09-sso-idigital.md`, `.env.example`

## 2026-09-23 — Portal do Cliente: novo layout (UI/UX)

- **Pedido:** Melhorar o layout do Portal do Cliente olhando para UI e UX.
- **Feito:**
  - Casca: cabeçalho fixo alinhado ao conteúdo (marca AgileFlow + "Portal do Cliente", abas com indicador, iniciais do usuário); fundo cinza com cartões brancos; no celular o menu vira ícones. `shrink-0` na casca: dentro do `#root` (flex, 100%) ela encolhia até a janela e o fundo parava no meio da rolagem.
  - Início: faixa de boas-vindas com "Abrir ocorrência"; contadores clicáveis (Aguardando você, Minhas em aberto, Minhas resolvidas, Projetos em OA); lista "Precisa da sua atenção" (responder/validar); cartões de projeto com "Aceitando ocorrências" ou "Não aceita novas ocorrências" e plural correto.
  - Lista: abas Em aberto / Aguardando você / Encerradas / Todas com contadores (`?situacao=`), no lugar do checkbox "Mostrar encerradas"; busca por código/título; código e título separados (`occTitle` tira o "OC-0001 ·" do título); coluna Atualizada (tempo relativo); "Responder"/"Validar" na linha; no celular, cartões.
  - Detalhe: cabeçalho com etapas (Recebida, Em atendimento, Validação, Resolvida; melhoria tem trilha própria) e faixa de próximo passo com a ação (Responder / Validar agora); validação com cartões e NPS colorido; solução em destaque; conversa em balões ("Você" / selo "Time"); caixa de resposta com "Anexar arquivo" compacto e Ctrl+Enter; resumo lateral fixo.
  - Nova ocorrência: 4 seções numeradas; tipo, impacto e abrangência em cartões com explicação; obrigatórios marcados e erro junto do campo; painel "Como funciona" e dicas. Sem `<form>`: dentro de um form o Select do Radix cria um select nativo que zerava a escolha automática do único projeto (e mandaria projeto vazio).
  - `AttachmentField` ganhou `compact` (botão no lugar da área de arrastar).
- **E2E:** OA 76/76 + 36/36. Novos: início com "Precisa da sua atenção", aba Encerradas, projeto pré-selecionado, validação, celular 390 px sem rolagem horizontal (4 telas), tema escuro. Prints 01 a 09, 07b e 30 a 35.
- **Não mexer:** regras e API do Portal sem mudança; linha da lista abre o detalhe; só um botão "Responder" no detalhe (o E2E depende disso); sem `<form>` em volta de Select Radix com valor escolhido automaticamente.
- **Arquivos:** `frontend/src/modules/portal/*`, `frontend/src/components/AttachmentField.tsx`, `provisorio/testes-e2e/operacao-assistida-2026-09-23/*`

## 2026-09-23 — Portal: Andamento da ocorrência no formato da Timeline de raias

- **Pedido:** Deixar a timeline do detalhe da ocorrência (Portal) parecida com a "Timeline de raias" do drawer do card.
- **Feito:** `_detail` passa a mandar em cada item do histórico `from_stage_name`, `moved_by_name` e `source`, além de `stage_name`/`moved_at`. No Portal, o "Andamento" foi para a coluna principal, abaixo da conversa. Segue o visual do drawer: título com barra azul, linha com pontos, mais recente primeiro, "de" (cinza) e "para", ícone, quem moveu, data/hora e origem. Sem o nome do funil, que é sempre o mesmo. Origem para o cliente: "Portal do cliente", "Automático" ou "Time de atendimento". O 1º item mostra "Abertura" e "Backlog". No drawer, a origem `client` agora aparece como "Portal do cliente" (antes, "client" cru). E2E da OA 76/76 + 23/23, prints 04/05/06/09.
- **Não mexer:** `history` do Portal continua sem dados internos além do nome de quem moveu (o cliente já vê autores dos comentários e o responsável).
- **Arquivos:** `backend/app/modules/projetos/assisted_ops.py`, `frontend/src/modules/portal/ClientOccurrenceDetailPage.tsx`, `frontend/src/api/clientes.ts`, `frontend/src/api/projetos.ts`

## 2026-09-23 — Portal: linha da ocorrência abre o detalhe e "Responder" em destaque

- **Pedido:** O dev mandou para Aguardando Cliente, mas clicar na linha da lista não abria o detalhe e o requisitante não conseguiu responder ao dev.
- **Causa:** Na lista do Portal só o título era link. O backend estava certo (comentário público do dev chegou e o cliente foi notificado), mas o cliente nunca abriu o detalhe, que é onde fica a caixa de resposta (os logs só mostravam a lista).
- **Feito:** `ClientOccurrencesPage`: a linha inteira navega (clique fora de link/botão, sem seleção de texto; Enter pelo teclado); linha "Aguardando sua resposta" destacada, com botão "Responder". `ClientOccurrenceDetailPage`: o aviso de Aguardando Cliente tem botão "Responder", que rola e foca a caixa de mensagem; o toast diz que a ocorrência voltou para o time. E2E da OA com o cenário novo (pergunta pública pelo drawer, clique na linha, Responder, enviar, volta para Ajustando e dev notificado): 76/76 + 23/23, prints 08/09.
- **Não mexer:** resposta do cliente em Aguardando Cliente move para Ajustando (`portal_comment`); só quem abriu interage (`can_interact`).
- **Arquivos:** `frontend/src/modules/portal/ClientOccurrencesPage.tsx`, `frontend/src/modules/portal/ClientOccurrenceDetailPage.tsx`, `provisorio/testes-e2e/operacao-assistida-2026-09-23/*`

## 2026-09-23 — Portal: coluna Responsável na lista de ocorrências

- **Pedido:** Trazer o nome do dev que assumiu na lista de ocorrências do Portal do Cliente.
- **Feito:** Coluna "Responsável" em `ClientOccurrencesPage` com `assignee_name` (já vinha na API do Portal); sem responsável mostra "Aguardando atendimento" (ou "—" se encerrada). O detalhe da ocorrência já mostrava. E2E da OA 72/72 + 18/18, prints 02/03 atualizados.
- **Arquivos:** `frontend/src/modules/portal/ClientOccurrencesPage.tsx`

## 2026-09-23 — Ocorrências visíveis só para PO do projeto, devs de atendimento e coordenação

- **Pedido:** O card da ocorrência só pode ser visto pelo PO do projeto, pelos devs que o PO informou ao mover para a Operação Assistida e pela coordenação (vê todas).
- **Feito:** `AssistedOpsService.hidden_occurrence_task_ids` (vazio para admin/coordenação; senão, ocorrências de projetos em que a pessoa não é PO nem dev de atendimento; sem Pessoa = nenhuma). Aplicado em `_assert_task_in_scope`/`_assert_all_in_scope` (404, como o PO Externo — cobre card, painel, comentários, histórico, assumir, encaminhar, mover) e nas listas (board, /tasks, retorno do recalcular). Memoizado por requisição. Verificado por perfil: 22/22 (PO e dev de cada projeto veem só a sua; dev de fora nenhuma; coordenação/admin todas); board 0,46 s; E2E da OA 72/72 + 18/18.
- **Não mexer:** toda rota por card precisa passar por `_assert_task_in_scope`; listas de cards filtram com `_drop_hidden`.
- **Arquivos:** `projetos/assisted_ops.py`, `projetos/api/routes.py`

## 2026-09-23 — Ocorrência: "Assumir" visível e coordenação também assume

- **Pedido:** Na ocorrência gerada não ficava claro como o dev assume e vira responsável.
- **Feito:** Painel da ocorrência mostra, enquanto ninguém assumiu, o aviso "Ninguém assumiu esta ocorrência" com o botão Assumir (explica: vira responsável, vai para Ajustando, horas úteis começam, cliente avisado); para quem não pode, lista quem pode (devs de atendimento, PO e coordenação — `assisted_ops_dev_names` no detalhe). Assumir aceita também a coordenação (`_is_coordination`). No drawer da ocorrência o responsável do cabeçalho é só leitura (o responsável vem do Assumir, que marca `assumed_at`); após assumir o cabeçalho atualiza. Verificado: dev de atendimento e coordenador assumem, dev de fora vê quem pode (9/9); E2E da OA 72/72 + 18/18.
- **Não mexer:** responsável da ocorrência só pelo Assumir (não pelo seletor genérico do card).
- **Arquivos:** `projetos/assisted_ops.py`, `projetos/schemas.py`, `frontend/src/api/clientes.ts`, `OccurrenceTeamPanel.tsx`, `ProjectTaskDrawer.tsx`

## 2026-09-23 — Card da ocorrência: dados da ocorrência, projeto/PO/produto e anexos da abertura

- **Pedido:** No detalhe do card da ocorrência (kanban), mostrar os dados da ocorrência e, do projeto, só nome, PO responsável e produto vinculado; o anexo enviado na abertura não aparecia.
- **Feito:** `OccurrenceDetail` ganha `project_po_name` e `product_name` (visão do time; produto via `linked_product_id` do card-raiz, consulta em savepoint). `OccurrenceTeamPanel` mostra Projeto · PO · Produto, "O que aconteceu" (descrição do cliente), passos/esperado/tela e "Anexos enviados na abertura" (download). No drawer, para ocorrência, somem os campos genéricos do card (diretoria, área, datas, formulário do tipo), a matriz de priorização e "Trabalho relacionado"; ficam painel, timeline e conversa. Os anexos estavam em `task.anexos`, mas o drawer só os mostrava pelo campo padrão da etapa.
- **Não mexer:** descrição e anexos da ocorrência aparecem no painel, não no bloco de campos padrão (`if (isOccurrence) return null`).
- **Arquivos:** `projetos/assisted_ops.py`, `projetos/schemas.py`, `frontend/src/api/clientes.ts`, `OccurrenceTeamPanel.tsx`, `ProjectTaskDrawer.tsx`

## 2026-09-23 — Portal: tipo "Ajuste (diferente do combinado)" retirado

- **Pedido:** Tirar o tipo "Ajuste (diferente do combinado)" da nova ocorrência no Portal do Cliente.
- **Feito:** Portal oferece só Erro / Falha, Dúvida de uso e Sugestão de melhoria (`OCCURRENCE_TIPO_ABERTURA`); a abertura no backend usa `OccurrenceTipoAbertura` e recusa "ajuste" (422). O rótulo e o valor continuam em `OccurrenceTipo`/`OCCURRENCE_TIPO_LABEL` para exibir ocorrências antigas (hoje não há nenhuma). A classificação do time "Ajuste" não mudou. E2E da OA: 72/72 + 18/18.
- **Não mexer:** "ajuste" segue válido na resposta e na classificação do time; só a abertura pelo cliente não aceita.
- **Arquivos:** `projetos/schemas.py`, `frontend/src/api/clientes.ts`, `ClientNewOccurrencePage.tsx`, E2E `e2e_http.py`

## 2026-09-23 — Cadastro de cliente lista só projetos em Operação Assistida

- **Pedido:** No cadastro/edição de cliente, "Projetos vinculados" deve listar apenas os projetos em Operação Assistida.
- **Feito:** `list_linkable_projects` (GET /projetos/clients/linkable-projects) devolve só cards-raiz na raia Operação Assistida (`_is_assisted_operation_status`). Na tela, vínculos que o cliente já tem com projetos fora da raia continuam aparecendo marcados (para o PO ver e desfazer; salvar não os apaga sem querer), com o aviso "Só aparecem os projetos em Operação Assistida". Hoje: 2 de 124 projetos na raia.
- **Não mexer:** o backend não recusa vínculo com projeto fora da raia (a tela é que limita) — o cadastro via API do E2E vincula antes da OA.
- **Arquivos:** `projetos/clients.py`, `ProjectClientsPage.tsx`

## 2026-09-23 — Coordenação define o atendimento da OA no próprio modal

- **Pedido:** O modal da Operação Assistida não é só aviso: quem move (o coordenador) faz a ação ali.
- **Feito:** `set_devs` aceita PO do projeto, admin ou coordenação (`_is_coordination`); o modal (board e drawer) abre o editor para o PO ou a coordenação (`isCoordination`), e o aviso fica só para os demais. Dev continua 403. Verificado: coordenador escolhe o dev no modal e o card entra na OA (14/14 telas); E2E da OA 71/71 + 18/18.
- **Não mexer:** quem define os devs de atendimento = PO do projeto, admin ou coordenação.
- **Arquivos:** `projetos/assisted_ops.py`, `AssistedOpsDevsDialog.tsx`, `ProjectBoardPage.tsx`, `ProjectTaskDrawer.tsx`

## 2026-09-23 — Operação Assistida só com devs de atendimento definidos

- **Pedido:** Ao mover o projeto para Operação Assistida, abrir o modal para o PO definir o atendimento; o card só entra na raia depois de salvar.
- **Feito:** Backend `_guard_assisted_op_devs`: Projeto/Programa (card-raiz do kanban de planejamento) só entra na raia com ao menos um dev em `project_assisted_ops_devs`; senão 428 com `detail.code = assisted_ops_devs_required` (o 428 de texto continua sendo a justificativa de pular a OA). Front: `AssistedOpsDevsDialog` (board e drawer) abre a seção de atendimento já em edição, exige ao menos um dev e, ao salvar, reenvia o movimento; cancelar deixa o card onde estava. Quem não é o PO do projeto (nem admin) vê o aviso de que só o PO define. `isAssistedOpSkipRequired` ignora o 428 com código. E2E da OA ajustado: 71/71 API + 18/18 telas.
- **Não mexer:** código `assisted_ops_devs_required` no 428; o modal reenvia o mesmo movimento (performMove / persistStatus); definir devs segue só do PO/admin.
- **Arquivos:** `projetos/service.py`, `AssistedOpsDevsDialog.tsx`, `AssistedOpsDevsSection.tsx`, `AssistedOpSkipDialog.tsx`, `ProjectBoardPage.tsx`, `ProjectTaskDrawer.tsx`, E2E `e2e_http.py`

## 2026-09-23 — Coordenação conclui a Homologação (PO) da Feature

- **Pedido:** No kanban Features o coordenador também deve conseguir mover.
- **Feito:** Única regra de board por papel nas Features era "sair da Homologação (PO) = só o PO do projeto". Agora, na Feature, a coordenação (`_is_coordination` / `isCoordination`) também tira o card da Homologação (PO), no backend (`_check_us_move_authorship`) e no board; mensagem própria para quem não pode. Na User Story a Homologação (PO) continua só do PO. Verificado: coordenador (inclusive o usuário real do Ewerton) passa na Feature; dev bloqueado; coordenador segue bloqueado na US.
- **Não mexer:** a exceção é só para funil de Features (`_is_feature_funnel_name`); US continua PO.
- **Arquivos:** `projetos/service.py`, `ProjectBoardPage.tsx`

## 2026-09-23 — Coordenador move US de outro responsável também no board

- **Pedido:** Coordenador (Ewerton) recebia "Só o responsável pela User Story ou a coordenação podem movê-la" ao arrastar US.
- **Feito:** O F9 corrigiu só o backend; o board tinha a mesma checagem no frontend, só com admin da empresa, e barrava antes de chamar a API. `isCoordination` em `lib/permissions.ts` com os mesmos termos do `_is_coordination` do backend (coord, administrativ, gerente, gestor, diretor no slug do Cargo). Verificado no navegador: coordenador move (servidor 200), dev não responsável segue bloqueado sem chamada.
- **Não mexer:** regra de coordenação igual no frontend (`isCoordination`) e no backend (`_is_coordination`) — mudar uma exige mudar a outra.
- **Arquivos:** `frontend/src/lib/permissions.ts`, `ProjectBoardPage.tsx`

## 2026-09-23 — RTD: EPA desligável por reunião (B8 da auditoria)

- **Pedido:** Poder desligar o EPA numa reunião (último item da auditoria).
- **Feito:** Códigos da reunião: null = padrão do .env; lista = esses planos; [] = EPA desligado nesta reunião (antes [] caía no padrão). PATCH aceita null explícito para voltar ao padrão (`model_fields_set`), e editar outro campo não mexe nos planos. Resposta de planos-epa ganha `origem` (padrao/reuniao/desligado). Tela: "Desligar nesta reunião" e "Usar os planos padrão" na configuração dos códigos, aviso "EPA desligado nesta reunião". Desligado: 11 ms em vez de ~7 s de consulta ao EPA, inclusive no relatório e no link público. As 3 reuniões existentes seguem no padrão.
- **Não mexer:** `salvos is not None` em `_codigos_epa`; `model_fields_set` no update dos planos.
- **Arquivos:** `rtd/service.py`, `frontend/src/api/rtd.ts`, `RtdPlanosEpaSection.tsx`

## 2026-09-23 — Produção sem modo debug

- **Pedido:** Deixar DEBUG=false em produção (achado ao revisar os workers).
- **Feito:** `.env` de produção com DEBUG=false (arquivo fora do git). `openapi_url` passa a seguir o DEBUG como `docs_url`/`redoc_url` — antes o /openapi.json (mapa de todas as rotas) continuava aberto na porta 18084 mesmo sem o Swagger. `.env.example` explica o flag.
- **Não mexer:** DEBUG=true só em desenvolvimento. A porta 18084 da API segue publicada em todas as interfaces (sem pedido para restringir ao nginx).
- **Arquivos:** `backend/app/main.py`, `.env.example`, `.env` (servidor)

## 2026-09-23 — API com 6 workers (D8 da auditoria)

- **Pedido:** Subir os processos da API (D8): relatório pesado atrasava requisições leves do mesmo worker.
- **Feito:** `--workers ${API_WORKERS:-6}` e `DB_MAX_OVERFLOW=7` só na API (docker-compose). Conexões: API 6 × (5+7) = 72 + Celery 4 × (5+10) = 60 = 132, dentro das 147 do max_connections=150 — sem reiniciar o Postgres. Medido (sino com relatórios pesados simultâneos): 4 pesados p95 482 para 22–35 ms; 8 pesados p50 158 para 14 ms, p95 681 para 94–171 ms, máx 1,45 para 0,35–0,58 s. Pico de conexões 13–17. Memória da API 1,1 para 1,4 GB.
- **Não mexer:** subir workers ou pool exige refazer a conta N × (pool + overflow) + Celery <= 147 (ou aumentar max_connections, que reinicia o Postgres).
- **Arquivos:** `docker-compose.yml`, `backend/app/core/config.py` (comentário)

## 2026-09-23 — Sobrecarga do cronograma e lentes de capacidade mais rápidas

- **Pedido:** Sobrecarga do cronograma lenta (pendente da auditoria: ~0,9 s sem raiz; ~0,84 s com raiz).
- **Feito:** `compute_schedule_overload` carrega só a subárvore do card-raiz (`_subtree_tasks`, agora com `options`) ou, sem raiz, o processo sem colunas pesadas (`_light_task_options`). `_select_tasks_in_window` aceita o `assignee_of` já carregado: sobrecarga, grade de capacidade, detalhe do dia, janela da pessoa e cenário de fim deixaram de montar o índice de responsável duas vezes. `_norm_col` com `lru_cache` (função pura do texto; ~8 mil chamadas por requisição). Rota da sobrecarga serializa direto pelo Pydantic. Saídas idênticas nos 9 casos comparados (ordem das linhas pode variar; o Gantt indexa por task_id). HTTP: com raiz 0,84 para 0,16–0,45 s; sem raiz 0,92 para 0,69 s; detalhe do dia 0,78 para 0,23 s; grade por pessoas 0,69 para 0,23 s.
- **Não mexer:** `assignee_of=` nas chamadas de `_select_tasks_in_window`; `lru_cache` do `_norm_col` (só para funções puras de texto).
- **Arquivos:** `projetos/service.py`, `projetos/api/routes.py`

## 2026-09-23 — Gantt: visão completa rolável, com zoom e travas resumidas

- **Pedido:** Visão completa do Gantt ("Ver cronograma completo") não rolava para os lados — só apareciam as ~5 primeiras semanas de uma janela de 2025 a 2032.
- **Feito:** Área de rolagem nos dois eixos com a coluna "Demanda" e o cabeçalho de datas fixos; abre posicionada em hoje. Zoom da barra (afastar/aproximar/ajustar) e Ctrl + roda passam a valer na visão completa; o cabeçalho troca dias, semanas e meses (em semanas, meses em cima; em meses, anos em cima e só a inicial quando estreito); "ajustar" pode ir abaixo do zoom mínimo do projeto (portfólio cobre anos). Grade por zoom (dia, linha semanal, nenhuma). Linhas com `minmax(0, 1fr)` (com `1fr` o cabeçalho impedia o ajuste). As travas de todos os projetos (53 travados + 20 em revisão) viraram um resumo com "Ver", e o gráfico aparece sem rolar a página.
- **Não mexer:** `FULL_LABEL_W` = coluna do CSS; `skipZoomAnchor` (roda e ajustar não re-centralizam); `minmax(0, 1fr)` das linhas da visão completa; resumo das travas.
- **Arquivos:** `GanttPage.tsx`, `styles/agileflow.css`

## 2026-09-23 — Auditoria · bloco 6 (itens menores P3)

- **Pedido:** Corrigir os itens menores (P3) da auditoria geral.
- **Feito:** Área com id do TeamOps: `assert_select_values` barra Diretoria/Área fora das opções do formulário (valor igual ao já salvo passa); os 2 cards VisitasHUB foram para "Tecnologia e Inovação" (opcao_8), decisão do usuário. PDF da RTD com acentos certos ("Voltar à reunião"). Dashboard usa `role_name` do /auth/me (sem 403 em /company/admin/roles). Sino sem tenant (super admin): lista vazia/contador 0 em vez de 500. Rota de módulo desativado mostra "Módulo não disponível" e não monta a tela (espera a lista de módulos; erro = não bloqueia). Atalho "Solicitações" do Coordenador/Administrativo removido quando ele vê Processos (decisão do usuário). Ausências: 409 para sobreposição pendente/aprovada da mesma pessoa; calendário sem recusadas/canceladas; aprovar devolve o aprovador (populate_existing). Análise de RTD: 404 para indicador inexistente. /health checa banco (503) e Redis (degraded) e o nginx encaminha /health para a API. Celery "idle in transaction": 24 amostras em 4 min com as tarefas rodando, nenhuma — já resolvido pelo dispose do bloco 2. Prompt do tutorial saiu de docs/usuario para provisorio/notas.
- **Não mexer:** `assert_select_values` no create/update; `moduleCheckPending`/`moduleUnavailable` no AppLayout (não reativa nem apaga módulos); `_assert_no_overlap`; `populate_existing` no `AbsenceService.get`; `location = /health` do nginx.
- **Arquivos:** `projetos/service.py`, `teamops/service.py`, `rtd/service.py`, `company/api/routes.py`, `main.py`, `frontend/nginx.conf`, `AppLayout.tsx`, `crm/admin/DashboardPage.tsx`, `RtdPresentationPrintPage.tsx`, `docs/usuario/README.md`, `provisorio/`

## 2026-09-23 — Auditoria · bloco 5 (desempenho D4, D5, D6, D9; D8 medido)

- **Pedido:** Bloco de desempenho restante da auditoria.
- **Feito:** D5 — mover card: `_rollup_tree` carrega só a subárvore (CTE recursiva, resultado idêntico nas 123 raízes, 143 para 10 ms por raiz); `sync_family` só quando muda etapa ou pai. PATCH de mover 360–440 para 160–200 ms; editar progresso 325 para 36 ms. D4 — board: lista slim não lê description/anexos/procurement_meta (prévia vem do SQL; JSON idêntico), requisitante só pela chave do formulário; colunas desenham 40 cards e a Lista 60 linhas por etapa, com "Mostrar mais" (kanban US 3,9 s/2,95 s travado/30 mil nós para 1,6 s/0,5 s/3,8 mil; Lista 1,7 s travada para 0,45 s). D6 — relatórios: `_light_task_options` (defer com raiseload) em PO Sync, US delivery, janela de capacidade e dataset de Indicadores; `health_by_po` carrega só as coleções usadas e tem cache de 60 s; Desempenho não calcula saúde de Produtos; PO Sync com cache chaveado pela versão dos dados (`_VERSION_SQL`), recalcula na hora quando qualquer card muda (PO Sync 0,76 para 0,38 s e 8–22 ms no cache; RTD 1,2 para 0,73 s; Desempenho 1,3 para 0,7 s; saídas idênticas). D9 — Vite/Rolldown `codeSplitting.groups` com vendor-react em prioridade: a primeira tela não baixa mais gráficos, markdown e dnd (~160 kB gzip). D8 — medido: com 2 relatórios pesados simultâneos o sino fica em 16 ms (p95 160 ms); com 4, p95 0,6 s. Subir para 6 workers exige max_connections maior (restart do Postgres) — não feito.
- **Não mexer:** `_subtree_tasks`; `COLUMN_RENDER_STEP`/`LIST_RENDER_STEP`; `validation_alias` do `ProjectTaskCardResponse`; `_light_task_options` (se um relatório passar a usar description, tirar a opção dele); `_VERSION_SQL` (tabela nova lida pelo PO Sync entra na versão); grupos do `codeSplitting` (não voltar ao `manualChunks`).
- **Arquivos:** `projetos/service.py`, `projetos/schemas.py`, `projetos/api/routes.py`, `produtos/service.py`, `indicadores/portfolio_projetos.py`, `ProjectBoardPage.tsx`, `frontend/vite.config.ts`

## 2026-09-23 — Auditoria · bloco 4 (funções quebradas F7–F15)

- **Pedido:** Corrigir F7 a F15 da auditoria geral.
- **Feito:** F7 — Contratação ganha devolve a origem para a etapa para onde ela ia quando foi desviada (coluna `procurement_resume_status_id`, step 136), não mais para Impedimento; ganho/perda gravam histórico (fonte Contratação). F8 — trava de cronograma também em criar item com pai, excluir item com pai e importar Excel no projeto travado (423). F9 — no kanban US, coordenação = admin ou Cargo de coordenação/gestão (`_is_coordination`: coord, administrativ, gerente, gestor, diretor). F10 — todas as US concluídas levam a Feature para Homologação (PO), não para Concluído; US em homologação + concluídas também; rollup grava histórico (fonte reconcile). F11 — datas puras da RTD em meio-dia local (não caem no dia anterior). F12 — triagem (review_and_route) vê e cobra só o que a etapa mostra (mesma regra da tela: `_stage_field_modes`); lacuna = campo obrigatório vazio (Descrição sempre que visível); risco = Não dispensa a descrição dos riscos; classificação segue com o contexto completo. F13 — link sem o processo mantém visão (/lista, /calendario) e ?funnel=; barra lateral troca de kanban sem sair da visão; abrir card de outro kanban atualiza ?funnel=. F14 — PO Sync e Status Reports mantêm os filtros quando o recorte fica vazio. F15 — Esc fecha o detalhe do dia da Capacidade.
- **Não mexer:** `resume_status_after_win`; `assert_editable` em create/delete/import; `_is_coordination` no `_check_us_move_authorship` (sair de Homologação (PO) continua só do PO); regra 1 do `_feature_target_status`; `for_review` no contexto do agente; clique fora do modal da Capacidade continua bloqueado.
- **Arquivos:** `projetos/service.py`, `projetos/procurement.py`, `projetos/models.py`, `core/tenant_migrations.py`, `RtdReuniaoPage.tsx`, `RtdReunioesPage.tsx`, `ProjectBoardPage.tsx`, `crm/AppLayout.tsx`, `PoSyncPage.tsx`, `StatusReportsPage.tsx`, `CapacityDayDetailDialog.tsx`, `api/projetos.ts`

## 2026-09-23 — Auditoria · bloco 3 (desempenho do dia a dia)

- **Pedido:** Terceiro bloco da auditoria: Painel PO vazio/lento, Gantt travando a aba, agentes de IA atrasando a criação, EPA na RTD e board lento.
- **Feito:** Painel PO: CPM uma vez por projeto (`_cpm_context` + `cache` em `critical_path`) e Gestão numa passada só agrupada por PO (`_aggregate`), de 22–38 s para cerca de 3 s. Agentes de etapa no Celery (`agents.run_stage_agent` via `dispatch_on_enter`, com fallback inline): criar/mover card não espera a IA (~15 s). EPA: planos + acompanhamentos em cache Redis por 10 min e acompanhamentos em paralelo (5 por vez), de 7–9 s para 0,02 s no cache. Board: lista serializada por TypeAdapter (7× mais rápida), GZip nível 6 e selo de quadrante por `GET /priority/quadrants-by-task`; após salvar, só recarrega o board se a mudança repercute em outros cards. Drawer: efeito principal chaveado por `task.id` (não refaz ~14 requisições a cada save); produto/release em efeito próprio; mudança de etapa/pai recarrega trava e filhos. Gantt: skeleton até o `?root` chegar (React Router 7 troca a URL em startTransition) e grade da visão completa como fundo CSS em vez de um div por dia (~4 milhões de nós), de 60 s para 3 s.
- **Não mexer:** `dispatch_on_enter` (não chamar `run_on_enter` no request); listener `after_begin` em `_run_stage_agent`; `cache` do `critical_path`; `autoSelectPending` e `trackBg` no `GanttPage`; deps `[open, task?.id, ...]` do drawer.
- **Arquivos:** `projetos/service.py`, `projetos/api/routes.py`, `tasks/scheduled.py`, `rtd/epa_client.py`, `main.py`, `GanttPage.tsx`, `ProjectBoardPage.tsx`, `ProjectTaskDrawer.tsx`, `api/projetos.ts`

## 2026-09-23 — Auditoria · bloco 2 (escopo, permissões de leitura, desligamento, primeiro acesso)

- **Pedido:** Segundo bloco da auditoria geral.
- **Feito:** S3 — PO Externo recortado em planning-nodes, form-values, matriz, dependências, workload, ausências, sobrecarga, travas/baselines, URL de anexo, reorder, import e criação com pai alheio; config dos agentes sem prompt/credencial para quem não tem `automation.manage`. S5 — `require_any_permission`: leituras de Produtos (exceto detalhe/versões, usados no card), Indicadores e RTD exigem `.view`; TeamOps: dashboard/alertas (`teamops.view`), organograma (`org.view`), competências (`stack.view`), detalhe da Pessoa (`person.view`); lista de Pessoas sem contato pessoal para quem não tem `person.view`; ausências (lista e calendário) do time só para `view_team`/`approve`/`manage` — corrige a aba Aprovações do coordenador; `/company/admin/users` barra cliente externo e PO Externo vê só a si. S6 — desligar/excluir Pessoa desativa o login (e o formulário não reativa). S2 — `/auth/first-access/check` não devolve token; link de 72 h gerado por quem cadastra (Pessoas, Clientes, Usuários) + `/auth/first-access/inspect`; tela `/primeiro-acesso?token=`. Celery: `_run` descarta o pool do banco/Redis ao fim de cada tarefa (SLA, commits e ocorrências falhavam de forma intermitente).
- **Não mexer:** detalhe do produto e versões seguem abertos a quem usa o módulo; lista de Pessoas continua aberta como diretório (sem contato pessoal); o token de primeiro acesso nunca volta numa consulta por e-mail.
- **Arquivos:** `core/dependencies.py`, `core/security.py`, `super_admin/service.py`, `super_admin/api/routes.py`, `company/api/routes.py`, `projetos/api/routes.py`, `projetos/api/client_routes.py`, `projetos/service.py`, `produtos|indicadores|rtd/api/routes.py`, `teamops/api/routes.py`, `teamops/service.py`, `tasks/scheduled.py`; front `FirstAccessPage.tsx`, `FirstAccessLinkButton.tsx`, `ProjectClientsPage.tsx`, `PersonDetailPage.tsx`, `crm/admin/UsersPage.tsx`, `api/*`.

## 2026-09-23 — Correções rápidas da auditoria (segurança + quebras)

- **Pedido:** Primeiro bloco da auditoria geral (`provisorio/testes-e2e/auditoria-geral-2026-09-23/RELATORIO.md`).
- **Feito:** S1 — admin da empresa não atribui papel `super_admin` nem Função de outro tenant (`company/api/routes.py`, `_assert_tenant_role_assignment`). F5 — criar usuário grava a Função escolhida (`create_company_user`). S4 — catálogo de Programas exige `projetos.program.manage`. S7 — baseline/revisão do cronograma exige `projetos.schedule.manage` + escopo do PO Externo. Step 135 concede as duas permissões aos cargos de PO/coordenação/gestão (PO Externo só `schedule.manage`). F3 — mapa de competências usava `Person.team_role` (coluna removida) e derrubava Dashboard/Alertas do TeamOps. F6 — PATCH com `form_values` parcial grava o merge, não apaga o formulário. Front esconde os botões sem permissão.
- **Não mexer:** Dev não gerencia Programas nem baseline; o papel `super_admin` só é concedido pelas rotas /super-admin.
- **Arquivos:** `company/api/routes.py`, `super_admin/service.py`, `projetos/permissions.py`, `projetos/api/routes.py`, `projetos/service.py`, `teamops/service.py`, `core/tenant_migrations.py` (step 135); front `ScheduleLockBanner.tsx`, `ProjectProgramsPage.tsx`, `ProjectBoardPage.tsx`.

## 2026-09-23 — E2E Operação Assistida + organização da raiz

- **Pedido:** Teste de ponta a ponta das Fases 1–5; mover para uma pasta provisória o que não é usado para rodar o sistema.
- **Feito:** E2E pela API real (68/68) e pelas telas com Playwright (18/18), dados [E2E] isolados e removidos — roteiros, prints e resultado em `provisorio/testes-e2e/operacao-assistida-2026-09-23/` (`run.sh` refaz). Raiz ficou só com o que roda: `backend/`, `frontend/`, `docker-compose.yml`, `.env*`, `docs/` (montado em /docs), `backup/`, `backups/`. Movidos para `provisorio/`: planilhas (CSV/XLSX), notas EPA, `e2e_flow_pmo.py`, `prototipo/`, `prototipo2/`, `skills/`. A cópia antiga do CLAUDE.md agora está em `provisorio/prototipos/prototipo/uploads/agileflow-hml/`.
- **Não mexer:** `docs/` e `backups/` são montados pelo Compose — não mover.
- **Arquivos:** `provisorio/**`, `docs/técnico/07-rtd-epa.md` (link), `frontend/src/styles/agileflow.css` (comentário), `.claude/README.md`, `.cursor/rules/nao-regredir.mdc`, `CLAUDE.md`.

## 2026-09-23 — Operação Assistida · Fase 5 (divisão da jornada e Capacidade)

- **Pedido:** Classificar a jornada da pessoa em % Projetos / % Operação Assistida / % Chamados (o que sobra), cadastrado em Pessoas, refletindo no módulo Gestão de Times e na grade de Capacidade (separado); PO vê e edita ao escolher os devs de atendimento.
- **Feito:** `team_persons.assisted_ops_allocation_pct` (step 134); Chamados derivado (`tickets_allocation_pct` na resposta); validação Projetos + OA <= 100. `calendar.allocation_split`. TeamOps: formulário com as 3 fatias, barra no detalhe, coluna "Jornada" na lista, card "Capacidade diária do time" no dashboard (`capacity_split`). Capacidade: `reserves` no heatmap (OA reservado + trabalhado em ocorrências por dia, Chamados reservado; ausências descontadas) -> sub-linhas "Operação Assistida"/"Chamados" no `WorkloadView`; detalhe do dia com as 3 fatias e ocorrências do dia. Devs de atendimento: split exibido e editável (grava em Pessoas).
- **Não mexer:** capacidade de Projetos continua `daily_hours × % Projetos` e só User Story; `reserves` não entram em `cells`/summary. Pessoas que já tinham % Projetos < 100 passam a mostrar o resto como Chamados.
- **Arquivos:** step 134, `teamops/models.py`, `teamops/schemas.py`, `teamops/service.py`, `teamops/calendar.py`, `projetos/service.py` (CapacityService), `projetos/schemas.py`, `projetos/assisted_ops.py`; front `teamops/AllocationSplit.tsx`, `PersonFormDialog.tsx`, `PersonDetailPage.tsx`, `PeoplePage.tsx`, `DashboardPage.tsx`, `WorkloadView.tsx`, `CapacityCockpitPage.tsx`, `CapacityTeamView.tsx`, `CapacityDayDetailDialog.tsx`, `AssistedOpsDevsSection.tsx`.

## 2026-09-23 — Operação Assistida · Fase 4 (atendimento, horas, homologação, Release)

- **Pedido:** PO define devs fixos; quem assumir primeiro fica responsável (outro dev pode tomar); horas úteis desde o assumir (8h/dia, pausa com o cliente); 1h útil sem assumir avisa o PO; cliente aprova/reprova com NPS; finalizada não reabre; melhoria -> PO encaminha para projeto de Release (Feature ou US).
- **Feito:** `project_assisted_ops_devs` + seção "Operação Assistida · atendimento" no card do projeto (só PO/admin edita). `POST /occurrences/{id}/assume` (dev fixo/PO/admin; no Backlog já vai para Ajustando). Horas úteis por `WorkingCalendar` no fuso do `team_work_calendar` (UTC -> local), pausando em Aguardando Cliente/Homologando; congeladas em `worked_hours` + `actual_hours` ao encerrar. Job Celery `check_unassigned_occurrences` (5 min) avisa PO + devs uma vez. Homologação no Portal (aprovar com NPS 0–10 / reprovar com motivo -> Ajustando). Time só finaliza sendo PO/admin (registra `finalized_by_team`); Encaminhada p/ Release só pela ação `forward-release` (cria projeto novo opcional + Feature ou US sob Feature). Classificar como melhoria move para "Melhoria – Análise PO".
- **Não mexer:** Finalizado = homologação do cliente; horas não contam com o cliente; worker/beat também precisam de rebuild (antes estavam no build de 2026-08-17).
- **Arquivos:** step 133, `projetos/assisted_ops.py`, `projetos/models.py`, `projetos/schemas.py`, `projetos/service.py`, `projetos/api/client_routes.py`, `tasks/scheduled.py`; front `AssistedOpsDevsSection.tsx`, `OccurrenceTeamPanel.tsx`, `ProjectTaskDrawer.tsx`, `ClientOccurrenceDetailPage.tsx`, `api/clientes.ts`.

## 2026-09-23 — Operação Assistida · Fase 3 (Ocorrências + Portal)

- **Pedido:** Kanban de Ocorrências (Backlog, Aguardando Cliente, Ajustando, Homologando, Finalizado, Melhoria – Análise PO, Encaminhada p/ Release); cliente abre no Portal; conversa pública/interna com anexos; notificar cliente em toda mudança de raia/comentário público; bloquear Concluído com ocorrência aberta.
- **Feito:** `projetos/assisted_ops.py` (AssistedOpsService: `ensure` do funil `is_assisted_ops` com etapas por `assisted_stage_key`, abertura OC-0001 via sequence, portal list/detail/comment/upload, hooks de movimento e comentário). Ocorrência = ProjectTask (origin_task_id = projeto) + `project_occurrences` (tipo, passos, esperado, funcionalidade, impacto, abrangência, prioridade P1–P4 sugerida, classificação, solução, causa raiz). Comentário ganhou `visibility` e `anexos`. Resposta do cliente em Aguardando Cliente move para Ajustando. Ocorrência finalizada não reabre e só se move no próprio kanban. PO Externo enxerga as ocorrências dos projetos dele. Portal: Meus projetos, Ocorrências (filtro projeto / abertas por mim / encerradas), Nova ocorrência, Detalhe com conversa. Drawer do time: `OccurrenceTeamPanel` + toggle "Visível ao cliente" + anexos no comentário.
- **Não mexer:** cliente só vê comentário `public` e nunca `causa_raiz`/`classificacao`; só quem abriu interage; funil de Ocorrências nasce no 1º projeto que entra em Operação Assistida.
- **Arquivos:** `core/tenant_migrations.py` (step 132), `projetos/assisted_ops.py`, `projetos/models.py`, `projetos/schemas.py`, `projetos/service.py`, `projetos/api/client_routes.py`; front `api/clientes.ts`, `api/projetos.ts`, `modules/portal/*`, `OccurrenceTeamPanel.tsx`, `ProjectTaskDrawer.tsx`, `NotificationBell.tsx`, `App.tsx`.

## 2026-09-23 — Operação Assistida · Fase 2 (raia no kanban Projetos e Programas)

- **Pedido:** Raia Operação Assistida antes de Concluído; opcional, mas pular exige justificativa; relatórios contam como entregue com selo.
- **Feito:** Step 131 cria a raia "Operação Assistida" (não final, `locks_schedule`, flag `is_assisted_operation`) antes de Concluído. `assisted_op_entered_at` = 1ª entrada (data de entrega). Ir a Concluído sem ter passado pela raia responde 428; o quadro e o drawer abrem `AssistedOpSkipDialog` e reenviam com `assisted_op_skip_reason` (gravado + comentário no card). Entregas de projetos, PO Sync (fase `concluido`) e painel mensal tratam Operação Assistida como entregue, com `em_operacao_assistida` (selo no PO Sync, Status Reports e Entregas). Checkbox "Raia de Operação Assistida" na config de etapas.
- **Não mexer:** `_is_concluded_planning_status` continua estrito (só Concluído) — usado nas travas de movimento; para relatório use `_is_delivered_planning_status` + `_delivered_at`.
- **Arquivos:** `core/tenant_migrations.py` (step 131), `projetos/models.py`, `projetos/schemas.py`, `projetos/service.py`; front `AssistedOpSkipDialog.tsx`, `ProjectBoardPage.tsx`, `ProjectTaskDrawer.tsx`, `config/ProjectStatusesConfigPage.tsx`, `PoSyncPage.tsx`, `StatusReportsPage.tsx`, `UsDeliveryReportPage.tsx`, `api/projetos.ts`.

## 2026-09-23 — Operação Assistida · Fase 1 (clientes + notificações)

- **Pedido:** Raia Operação Assistida antes de Concluído; clientes abrem Ocorrências em kanban próprio (Backlog -> Aguardando Cliente -> Ajustando -> Homologando -> Finalizado). Especificação completa em `/root/.claude/plans/vamos-criar-uma-nova-linked-sedgewick.md`. Fase 1 = base.
- **Feito:** Cadastro de clientes pelo PO (`projetos.client.manage`, e-mail único com verificação prévia), vínculo N:N cliente <-> projeto (card-raiz de Projetos e Programas), login de cliente externo com Função de sistema "Cliente (Operação Assistida)" e senha no primeiro acesso (fluxo existente), bloqueio do cliente externo em todos os módulos (`require_module(..., allow_client=True)` só no Portal), Portal do Cliente (`/portal`, lista projetos), atalho "Portal do Cliente" para colaborador interno que também é cliente. Serviço central `core/notifications.py`; corrigido `NOTIFY` de automação que gravava Person.id como user_id.
- **Não mexer:** cliente NÃO é Pessoa do TeamOps (não entra em Capacidade/organograma/responsável); colaborador interno cliente mantém a Função dele.
- **Arquivos:** `core/notifications.py`, `core/dependencies.py`, `core/cache.py`, `core/tenant_migrations.py` (step 130), `projetos/clients.py`, `projetos/api/client_routes.py`, `projetos/models.py`, `projetos/schemas.py`, `projetos/permissions.py`, `teamops/service.py`, `super_admin/api/routes.py`; front `api/clientes.ts`, `ProjectClientsPage.tsx`, `modules/portal/*`, `components/ClientGuards.tsx`, `App.tsx`, `LoginPage`, `FirstAccessPage`, `AppLayout`, `moduleNavConfig.ts`.

## 2026-09-22 — CLAUDE.md da raiz + c?pia HML

- **Pedido:** Incluir tamb?m o `CLAUDE.md` nas mem?rias.
- **Feito:** Confirmado que o `CLAUDE.md` da raiz j? ? o contexto vivo (AgileFlow, n?o Kore/Atendimento). A c?pia em `prototipo/uploads/agileflow-hml/CLAUDE.md` apontava o produto antigo e foi reduzida a um aviso para n?o ser usada. Mem?rias `.claude/*` regravadas em UTF-8.
- **N?o mexer:** `CLAUDE.md` da raiz; n?o reescrever a c?pia HML com o texto Kore antigo.
- **Arquivos:** `CLAUDE.md`, `prototipo/uploads/agileflow-hml/CLAUDE.md`, `.claude/*`

## 2026-09-22 — Mem?rias .claude alinhadas ao sistema atual

- **Pedido:** Parar de perder funcionalidade quando se pede algo novo; atualizar mem?rias.
- **Feito:** `CLAUDE.md` reescrito (n?o ? mais o Kore s?-atendimento). Criados `.claude/sistema-atual.md`, `invariantes.md`, este hist?rico e regra Cursor `nao-regredir`.
- **N?o mexer:** conte?do operacional dos m?dulos; s? documenta??o de contexto.
- **Arquivos:** `CLAUDE.md`, `.claude/*`, `.cursor/rules/nao-regredir.mdc`

## 2026-09-22 — US no funil errado (Altair / MetroLIMS + auditoria)

- **Pedido:** US do Altair na capacidade n?o aparecia no kanban User Story.
- **Feito:** US-104—108 sa?ram de Features e foram para User Story (104—107 Em Desenvolvimento, 108 Homologa??o PO). US-121 j? estava em Impedimento. FEATURE 04 + US-401—408 sa?ram de Prospectar ? Features/US Backlog. Tipagem em massa de t?tulos `US-` / `FEAT-` sem `demand_type_id`. C?digo: t?tulo `US-`/`FEAT-` identifica o n?vel; cascata n?o cruza Feature?US; etapa de cronograma sob Feature ganha tipo US e etapa hom?nima no funil US.
- **N?o mexer:** `_guard_feature_us_kanban_affinity`, `_skip_cross_kind_funnel`, `_title_looks_like_us`, `_coerce_status_for_demand_type` (etapa hom?nima).
- **Arquivos:** `backend/app/modules/projetos/service.py` + dados `tenant_ss`

## 2026-09-22 — Cockpit de capacidade: datas antigas + modal do dia

- **Pedido:** Relat?rio de capacidade mostrava o passado; clique no dia n?o abria o modal.
- **Feito:** Scroll para hoje com retry (aba escondida); bot?o —Ir para hoje—; `dateFrom`/`dateTo` no heatmap; janela da aba Carga come?a em hoje; modal n?o fecha no clique que abre (`ignoreCloseRef` + setTimeout); z-index 200; GET capacidade sem cache.
- **N?o mexer:** `onCellClick` no `WorkloadView`, `CapacityDayDetailDialog`, ?ncora em hoje.
- **Arquivos:** `WorkloadView.tsx`, `CapacityDayDetailDialog.tsx`, `CapacityCockpitPage.tsx`, `CapacityTeamView.tsx`, `TeamPerformancePage.tsx`, `frontend/src/api/projetos.ts`, `dialog.tsx`

## 2026-08 — Import Excel Features/US no modal e na config

- **Pedido:** Importar cronograma nas raias de planejamento (Requisitos, Prot?tipo, Refinamento, Valida??o, Pronto para Dev), al?m da tela de config.
- **Feito:** `ScheduleImportPanel` na config (`/config/cronograma`) e no drawer do Projeto/Programa quando `canImportScheduleInStatus`.
- **N?o mexer:** painel de import, modelo xlsx, funis can?nicos Feature/US no `import_xlsx`.
- **Arquivos:** `ScheduleImportPanel.tsx`, `ProjectTaskDrawer.tsx`, `ProjectScheduleConfigPage.tsx`

## Pr?-existente (n?o apagar — invent?rio)

Funcionalidades j? em produ??o antes desta s?rie; detalhe em `sistema-atual.md`:

- Multitenancy schema-per-tenant, JWT, RBAC por cargo, primeiro acesso.
- Processos: kanbans Prospectar / Contratar / Projetos-Programas / Features / US; convers?o; contrata??o; prioriza??o; SLA; Gantt; baseline; agentes; PMO; Status Reports; PO Sync; desempenho; solicita??es.
- TeamOps: pessoas, ?reas, aus?ncias, stacks, organograma, calend?rio.
- Produtos + Azure DevOps; Indicadores; RTD + EPA; docs in-app; MinIO; Celery SLA.
