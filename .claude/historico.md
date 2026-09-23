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
