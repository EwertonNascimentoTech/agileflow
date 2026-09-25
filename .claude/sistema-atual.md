# Sistema atual (set/2026)

Produto: **AgileFlow** (c?digo ainda cita Kore/SaaS). Tenant principal: `tenant_ss` (FIEA).

## Stack e deploy

- Backend: FastAPI + Uvicorn, Python 3.12, SQLAlchemy 2 async (asyncpg), Alembic (schema `public`).
- Tenant tables: `TenantBase.metadata` + `tenant_migrations.py` (idempotente no startup).
- Redis 7, RabbitMQ + Celery (workers `saas_celery` / `saas_beat`), MinIO.
- Frontend: React 18 + Vite + TS + Tailwind v3 + shadcn manual + dnd-kit + RHF/zod.
- Compose: `saas_api` :18084, `saas_frontend` :18082, postgres :5437, redis :6380, minio :9002/:9003, rabbit :5672/:15672.
- P?blico: https://agileflow.tdsistemafiea.com.br (Caddy ? 18082).

## M?dulos ATIVOS (seed em `main.py`)

| Slug | Nome na UI | Backend | Frontend |
| :--- | :--- | :--- | :--- |
| `projetos` | Processos | `modules/projetos` | `modules/projetos` |
| `teamops` | Gest?o de Times e Capacidade | `modules/teamops` | `modules/teamops` |
| `produtos` | Portf?lio de Produtos | `modules/produtos` | `modules/produtos` |
| `indicadores` | Indicadores | `modules/indicadores` | `modules/indicadores` |
| `rtd` | Reuni?o de Tomada de Decis?o | `modules/rtd` | `modules/rtd` |
| `documentacao` | Documenta??o | `modules/docs` | `modules/documentacao` |
| `portal_cliente` | Modo Cliente | `modules/projetos` (`program_portal.py`) | `modules/portal` |

## M?dulos DESATIVADOS (c?digo pode existir; registry `is_active=false`)

`crm`, `estoque`, `pdv`, `atendimento`, `propostas_contratos` — rotas UI ainda no `App.tsx` por legado; n?o tratar como produto ativo.

## Pap?is

1. `super_admin` — plataforma (tenants, m?dulos, admins). UI `/admin`.
2. `company_admin` — empresa: usu?rios, pap?is, m?dulos.
3. `company_user` — operacional; permiss?es por cargo ? fun??o.

Auth: `POST /api/v1/auth/login`, refresh token no interceptor axios. Primeiro acesso: `/primeiro-acesso`.
Campo de formulário `clients` (Clientes da solicitação): `ClientsFieldInput.tsx` + `ClientPicker.tsx` (compartilhado com o card); busca `GET /projetos/clients/candidates?q=` (qualquer usuário do módulo). Soluções com IA: kanban criado por `projetos/ai_solutions.py`; Portal `/portal/solucoes-ia` (lista, nova, detalhe) com rotas `/projetos/portal/ai-solutions/*` (form, create, resubmit, ready, homologation, cancel, comments); diálogo `StageReasonDialog` (428 `stage_reason_required`) no quadro e no card. Doc: `docs/processo/06-solucoes-com-ia.md`.
Modo Cliente (módulo `portal_cliente`): as telas do Portal dentro do AgileFlow em `/app/modules/portal_cliente/*` (mesmos componentes do `/portal`; links pelo `usePortalBase`). Aparece para Pessoa ativa em Times (`has_team_portal`, exige o módulo ativo no tenant) ou quem tem cadastro de cliente; escopo de `PortalPortfolioService._team_scope` (coordenação = todos; PO e dev = projetos em que atuam). Ocorrências e Soluções com IA só no menu de quem é cliente.
Assistente do Portal (chat): `POST /projetos/portal/assistant` (pergunta + últimas trocas + projeto/programa em tela) -> `{answer, sources}`; `projetos/portal_assistant.py` (`PortalAssistantService`, `Codes`, `build_context`); front `portal/PortalAssistant.tsx` (botão flutuante no `ClientPortalLayout` e no `PortalModuleLayout`). Agente: `AZURE_AI_PORTAL_AGENT_ID` (.env) ou o do 1º binding de etapa ativo, com `instructions` por execução. Doc: `docs/processo/07-portal-cliente-programas.md`.
Portal do Cliente — Programas: `GET /projetos/portal/portfolio` (Visão geral: mapa impacto × esforço, programas e projetos visíveis), `GET /projetos/portal/programs/{id}` (pilares, árvore Projeto -> Feature -> US, roadmap), `GET /projetos/portal/projects/{id}` (projeto no mesmo layout: indicadores, Feature -> US, roadmap), `GET /projetos/portal/deliveries` (Entregas e Marcos); telas `/portal`, `/portal/programas`, `/portal/programas/:id?aba=pilares|projetos|roadmap`, `/portal/projetos`, `/portal/entregas`. Cálculo em `projetos/program_portal.py` (`PortalPortfolioService`, cache pela versão dos dados). Gestão do programa: `/app/modules/projetos/programas/:programId` (pilares, pilar de cada projeto, clientes do programa) com `GET /projetos/programs/{id}/admin`, `POST/PATCH/DELETE .../pillars`, `POST .../pillars/suggest`, `PUT .../projects/{task_id}/pillar`, `GET/POST/PATCH/DELETE .../clients`. Doc: `docs/processo/07-portal-cliente-programas.md`.
Clientes do projeto: `GET/POST /projetos/tasks/{id}/project-clients`, `PATCH/DELETE .../{client_id}`, busca `.../candidates?q=` (clientes, Pessoas, usuários; Genus só por e-mail - a folha não devolve nome); bloco no card (`ProjectClientsSection.tsx`). Portal: `GET /projetos/portal/projects/{id}` -> `/portal/projetos/:id` (mesmo layout do programa: indicadores, Features/US e roadmap; o antigo `/report` saiu em 2026-09-25).
SSO IDigital (OIDC, desligado até o client existir no IdP): `GET /api/v1/auth/sso/config` (pública), `POST /api/v1/auth/sso/exchange` (id_token do IdP, sessão AgileFlow); tela `/sso/callback`; botão "Entre com o IDigital" no `/login` só com `SSO_ENABLED`. Vínculo em `public.user_sso_identities` (Alembic 007). 1º login sem cadastro: em Pessoas = colaborador; fora = cliente do Portal sem projetos. Detalhe: `docs/técnico/09-sso-idigital.md`. No 1º login pelo IDigital, tarefa Celery `payroll.sync_user` busca o e-mail na folha (Genus, `GENUS_API_URL`/`GENUS_API_TOKEN`) e grava matrícula, organização, departamento, cargo funcional e função de confiança em `public.user_payroll_profiles` (Alembic 008, sem CPF); aparece na ficha da Pessoa (aba Organização) e preenche o Departamento do cliente vazio.

## Processos (`projetos`) — o n?cleo

Kanbans configur?veis (funis + etapas) no mesmo `Project` container:

- Prospectar Solu??es ? (opcional) Contratar ? Projetos e Programas ? Features ? User Story.
- Cards: `ProjectTask` com `parent_task_id`, `planning_kind` (`projeto`/`programa`), `demand_type_id`, `assigned_to` = Person.
- Gates: prioriza??o obrigat?ria, `require_fill` de datas, restri??o de cargo na raia, SLA, agentes Azure por etapa.
- Convers?o: etapa com `creates_demand_type_id` gera Projeto/Programa ligado por `origin_task_id`.
- Transi??o: `moves_to_funnel_id` muda o **mesmo** card de kanban; `children_to_funnel_id` / `grandchildren_to_funnel_id` envia filhos.
- Homologa??o (PO): Feature em Homologa??o (PO) ? capacidade da US conta no PO do raiz.

### Telas (n?o apagar)

- Quadro / Lista / Calend?rio / Gantt (`/board`, `/lista`, `/calendario`, `/cronograma`).
- Capacidade: cockpit (`/capacidade`) — lentes pessoa, time, projeto, gargalos, livres, cross-team, simulador; clique no dia ? `CapacityDayDetailDialog`.
- PMO: Portf?lio, Desempenho (devs/POs/carga), PO Sync, Relat?rios, Entregas US, Status Reports.
- Programas, Matriz Impacto–Esfor?o.
- Nova Solicita??o / Minhas Solicita??es (usu?rio b?sico).
- Config: processos, demandas, formul?rio padr?o, tipos, funis, etapas, **cronograma + import Excel**, agentes, prioriza??o, layout do card.
- Clientes (`/clientes`, permissão `projetos.client.manage`): cadastro de clientes da Operação Assistida e vínculo aos projetos.
- Portal do Cliente (`/portal`, fora do `/app`): cliente externo cai direto aqui; interno com cadastro de cliente acessa pelo cabeçalho.

### Operação Assistida (API)

- `GET/POST /projetos/clients`, `GET /projetos/clients/lookup?email=`, `GET /projetos/clients/linkable-projects`, `GET/PATCH /projetos/clients/{id}`, `PUT /projetos/clients/{id}/projects`, `GET /projetos/tasks/{task_id}/clients`.
- Portal: `GET /projetos/portal/projects` (`require_module("projetos", allow_client=True)`).
- `/auth/me`: `is_client` (cliente externo) e `has_client_portal`.
- Raia "Operação Assistida" no kanban Projetos e Programas (antes de Concluído): conta como entregue nos relatórios; pular exige justificativa.
- Kanban "Ocorrências – Operação Assistida" (criado ao 1º projeto entrar na raia). Portal: `/portal`, `/portal/ocorrencias`, `/portal/ocorrencias/nova`, `/portal/ocorrencias/:id`. Lista aceita `?projeto=`, `?minhas=1` e `?situacao=acao|encerradas|todas` (padrão: em aberto); o início linka para elas.
- API Portal: `GET /projetos/portal/projects`, `GET/POST /projetos/portal/occurrences`, `GET /projetos/portal/occurrences/{id}`, `POST .../{id}/comments`, `POST /projetos/portal/uploads`, `GET /projetos/portal/uploads/url`. Time: `GET/PATCH /projetos/occurrences/{task_id}`. `POST /projetos/occurrences/{id}/assume`, `POST .../forward-release`, `GET /projetos/occurrences/release-candidates`, `GET/PUT /projetos/tasks/{id}/assisted-ops-devs`, `POST /projetos/portal/occurrences/{id}/homologation`. Celery: `check_unassigned_occurrences` (5 min).

### Import Excel Features/US

- Config ? Cronograma **e** drawer do Projeto/Programa nas raias de planejamento.
- Modelo: Tipo, T?tulo, Descri??o, Respons?vel (e-mail), In?cio, Fim, Horas.
- API: `ProjectImportService.import_xlsx` — Feature no funil Features, US no funil User Story.

### Capacidade (API)

`/projetos/capacity/heatmap`, `/day-detail`, `/by-project`, `/gaps`, `/available-people`, `/person-window`, `/simulate`, `/cross-team`, `/suggest-scenarios`.

## TeamOps

Pessoas, ?reas, cargos, organograma, stacks/compet?ncias, aus?ncias (tipos com `affects_capacity`), calend?rio (jornada/feriados). Alimenta capacidade e Gantt.

Telas: Dashboard, Organograma, Pessoas, Stacks, Aus?ncias, Config.

## Produtos

Portf?lio derivado de projetos, ?reas/diretorias, fornecedores, documentos, processos, indicadores do produto, reposit?rios Azure DevOps (webhook sem JWT). P?blico: `PUBLIC_PRODUTOS_PORTFOLIO_TOKEN`.

## Indicadores

Estrat?gicos/t?ticos, metas por per?odo, dashboard. Usados na RTD.

## RTD

Reuni?o de comit? (mensal/trimestral): portf?lio, POs, indicadores, planos EPA, ata, apresenta??o p?blica (`/p/rtd/:token`).

## Documenta??o in-app

`/app/modules/documentacao` — guias em `docs/` (usu?rio, processo, t?cnico).

## Integra??es

- Azure AI Foundry: agentes por etapa do kanban (texto anonimizado).
- Azure DevOps: repos + webhook Basic.
- IDigital (SSO OIDC): `super_admin/sso.py` + `src/lib/sso.ts` (`oidc-client-ts`, PKCE, client público).
- EPA (Sysepa): planos estrat?gicos/t?ticos na RTD.
- Genus: token de API (chamados).
- MinIO: anexos (`POST /projetos/uploads`).
- P?blico ociosidade: `PUBLIC_OCIOSIDADE_TOKEN`.

## Onde est? o c?digo (atalhos)

| Assunto | Arquivo-chave |
| :--- | :--- |
| Routers | `backend/app/main.py` |
| Tarefas/kanban/capacidade | `backend/app/modules/projetos/service.py` |
| Import xlsx | `ProjectImportService` no mesmo service |
| Rotas processos | `backend/app/modules/projetos/api/routes.py` |
| Heatmap UI | `frontend/src/modules/projetos/WorkloadView.tsx` |
| Modal do dia | `CapacityDayDetailDialog.tsx` + `CapacityCockpitPage.tsx` |
| Import UI | `ScheduleImportPanel.tsx` |
| Quadro | `ProjectBoardPage.tsx` |
| Rotas SPA | `frontend/src/App.tsx` |
| Menu | `frontend/src/modules/crm/moduleNavConfig.ts` |
| Migrations tenant | `backend/app/core/tenant_migrations.py` |
