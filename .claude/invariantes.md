# Invariantes — n?o quebrar

Pedido novo **n?o autoriza** remover, inverter ou “simplificar” o que est? abaixo. S? mude se o usu?rio pedir explicitamente.

## Plataforma

- Schema-per-tenant. Tabelas de neg?cio em `tenant_<slug>`; registry/auth em `public`.
- `asyncpg` reusa sess?o: `get_db()` / `get_current_user()` for?am `search_path TO public`; `get_tenant_db()` reseta no `finally`.
- Enums SQLAlchemy: `SAEnum(..., values_callable=lambda obj: [e.value for e in obj])`.
- Services n?o importam `routes.py`. Commit no service, n?o na route.
- Sem `<SelectItem value="">` (Radix). Sentinela `__none__` / `__all__`.
- M?dulos **desativados de prop?sito** (n?o reativar nem apagar c?digo sem pedido): `crm`, `estoque`, `pdv`, `atendimento`, `propostas_contratos`.

## Pessoas e acesso

- `assigned_to` nas tarefas de Processos ? **Person.id** (TeamOps), n?o `users.id`.
- PO Externo: s? projetos em que ? respons?vel; sem Pessoas, Indicadores, RTD, Capacidade, Relat?rios, Status Reports.
- Coordenador e Administrativo: mesmo n?vel operacional.
- S? o respons?vel da US (ou coordena??o/admin) move card no kanban User Story, exceto Homologa??o (PO) — a? ? o PO do card-raiz.

## Kanban Feature ? User Story

- Feature **n?o** vai para o kanban User Story. US **n?o** vai para o kanban Features (nomes de raia iguais, ex. Homologa??o).
- Cascata (`cascade_children_on_move`, `children_to_funnel`) **n?o** arrasta US para Features nem Feature para US.
- T?tulo `US-123` / `FEAT-12` identifica o n?vel mesmo sem `demand_type_id`.
- US criada sob Feature nasce no funil User Story (etapa hom?nima ou inicial), com tipo `user_story` quando der para inferir.
- Filhos no **mesmo funil** do pai ficam agrupados/escondidos no quadro — US no funil Features some dos dois boards.
- Capacidade conta s? **User Story** (tipo efetivo ou funil US). Feature ? rollup — n?o entra como demanda.

## Capacidade e cronograma

- Heatmap/cockpit: clique na **c?lula** pessoa–dia abre modal (demandas do dia + atrasadas). N?o fechar no mesmo clique.
- Grade ancora em **hoje** (passado ? esquerda). Bot?o “Ir para hoje”.
- Janela da aba Carga (Desempenho) come?a em hoje e projeta o futuro — n?o 90 dias atr?s.
- Aus?ncia aprovada que `affects_capacity` zera/reduz horas do dia.
- Homologa??o (PO) da **Feature pai** faz a US contar no PO do card-raiz (n?o no executor).
- Import Excel Features/US: Configura??es ? Cronograma **e** modal do Projeto/Programa nas raias de planejamento (Requisitos, Prot?tipo, Refinamento, Validar Escopo, Pronto para Desenvolvimento). Colunas: Tipo, T?tulo, Descri??o, Respons?vel (e-mail), In?cio, Fim, Horas. Cada US ? filha da Feature da linha acima.

## Cronograma / Gantt

- Datas e horas da US alimentam Gantt, capacidade e SLA.
- `require_fill` no binding de cronograma bloqueia sa?da da etapa sem in?cio e prazo.
- Baseline/commit de cronograma: n?o editar ? revelia se o projeto estiver travado (`assert_editable`).

## Contrata??o e convers?o

- Produto externo + “Ser? contratado? = Sim” trava a origem e nasce card no kanban Contratar. N?o duplicar.
- Ganhou ? libera origem + contrato no Produto. Perdeu ? origem Cancelado.
- Aprovado em Prospectar converte em Projeto ou Programa (`origin_task_id` + `planning_kind`). N?o perder o v?nculo Origem ? Criados.

## Deploy

- Frontend ? **build est?tico nginx** (`saas_frontend` :18082). Mudan?a de UI exige `docker compose up -d --build frontend`.
- API **n?o monta o c?digo-fonte**. Mudan?a Python exige `docker compose up -d --build api`.
- P?blico: `agileflow.tdsistemafiea.com.br` ? 18082. Tenant operacional: `tenant_ss`.
- API roda 6 workers com DB_MAX_OVERFLOW=7 (compose): 6 × (5+7) + Celery 4 × (5+10) = 132 <= 147 conexões. Mudar workers/pool exige refazer essa conta.
- Produção com DEBUG=false: /docs, /redoc e /openapi.json fechados (404).

## Operação Assistida (clientes)

- Cliente da Operação Assistida é `project_clients` + login `public.users`; **não** é Pessoa do TeamOps.
- E-mail do cliente é único: cadastrar começa por `GET /projetos/clients/lookup`; cliente existente é reaproveitado, nunca duplicado.
- Cliente externo (Função "Cliente (Operação Assistida)") só acessa o Portal: `require_module` devolve 403 em tudo, exceto rotas com `allow_client=True`.
- Colaborador interno que também é cliente mantém a Função dele e ganha o Portal (`has_client_portal`).
- Vínculo cliente <-> projeto só com card-raiz do kanban Projetos e Programas.
- Notificação in-app passa por `core/notifications.py`; destinatário é users.id (resolver Person -> user com `user_ids_for_persons`).
- Raia Operação Assistida (`is_assisted_operation`) fica antes de Concluído e **não** é final. Projeto/Programa só entra nela com devs de atendimento definidos (428 `assisted_ops_devs_required`: modal do PO e reenvio do movimento). Projeto/Programa que vai a Concluído sem ter passado por ela exige justificativa (HTTP 428 -> diálogo -> `assisted_op_skip_reason`).
- Nos relatórios, Operação Assistida conta como **entregue** (data = `assisted_op_entered_at`) com selo `em_operacao_assistida`; travas de movimento continuam usando só Concluído.
- Ocorrência = ProjectTask no funil `is_assisted_ops` + linha em `project_occurrences`; regras leem `assisted_stage_key`, não o nome da etapa.
- Só abre ocorrência cliente vinculado a projeto que está na raia Operação Assistida. Projeto não vai a Concluído com ocorrência aberta. Ocorrência encerrada (etapa final) não reabre.
- Portal: cliente vê todas as ocorrências dos projetos dele, só interage nas que abriu, só vê comentários `visibility = public`.
- Ocorrência: Finalizado vem da homologação do cliente no Portal (NPS); o time só finaliza sendo PO do projeto/admin. "Encaminhada p/ Release" só via `forward-release`.
- Horas úteis da ocorrência começam no 1º "Assumir" e pausam em Aguardando Cliente/Homologando; calendário do TeamOps no fuso do tenant.
- Capacidade de Projetos conta só User Story; Operação Assistida e Chamados são fatias separadas (`reserves`), pela divisão da jornada em Pessoas.
- Divisão da jornada (Pessoas): Projetos % + Operação Assistida % <= 100; Chamados = o resto. `project_hours_per_day` continua só a fatia de Projetos.

## Permissões sensíveis (auditoria 2026-09-23)

- Admin da empresa só atribui `company_admin`/`company_user` e Funções do próprio tenant; `super_admin` só via /super-admin.
- Catálogo de Programas = `projetos.program.manage`; baseline/revisão do cronograma = `projetos.schedule.manage` (+ escopo do PO Externo). `task.manage` sozinho (Dev) não basta.
- PATCH do card com `form_values` grava o merge com o formulário salvo — nunca substitui pelo parcial.
- PO Externo: toda rota por card/projeto/raiz aplica `_assert_task_in_scope`/`_po_external_scope` (leitura e escrita); lista de travas, matriz etc. filtradas pelo escopo.
- Permissão `.view` é checada no backend (`require_any_permission`), não só no menu. Exceções deliberadas: detalhe do produto/versões e lista de Pessoas (diretório sem contato pessoal).
- Primeiro acesso: token só no link gerado por quem cadastra (72 h, uso único). `/auth/first-access/check` nunca devolve token.
- Desligar/excluir Pessoa desativa o login vinculado.
- Tarefas Celery: `_run` descarta o pool (engine.dispose) e o Redis ao fim de cada execução.

## Desempenho (auditoria 2026-09-23 · bloco 3)

- Agente de etapa roda no Celery (`dispatch_on_enter` enfileira `agents.run_stage_agent`); criar/mover card não espera a IA. Não voltar a chamar `run_on_enter` dentro do request.
- Painel PO: CPM calculado uma vez por projeto (`critical_path(..., cache=)`); visão de Gestão = uma chamada de `build` agrupada por `po_id`, nunca uma por PO.
- Gantt: nada de um elemento por dia por linha (grade = fundo CSS); a visão completa só aparece sem `?root` e depois da auto-seleção resolvida.
- Drawer do card: efeito principal chaveado por `task.id`; cada ação que muda etapa/pai/produto recarrega só a parte afetada.

## Fluxos corrigidos (auditoria 2026-09-23 · bloco 4)

- Contratação ganha: a origem retoma a etapa para onde ia quando a Contratação a desviou (`procurement_resume_status_id`); sem destino guardado, a próxima etapa depois da Contratação. Ganho e perda gravam histórico.
- Trava de cronograma (`assert_editable`) vale também para criar item com pai, excluir item com pai e importar Excel no projeto travado.
- Kanban US: coordenação = admin ou Cargo de coordenação/gestão (`_is_coordination` no backend, `isCoordination` no board — mesma regra nos dois). Sair de Homologação (PO): na User Story só o PO do card-raiz; na Feature o PO ou a coordenação.
- Rollup Feature: todas as US concluídas levam a Feature para Homologação (PO); quem conclui a Feature é o PO. Todo movimento automático grava histórico.
- Agente de triagem (review_and_route): contexto e lacunas seguem a visibilidade da etapa (`_stage_field_modes`, mesma regra da tela). Campo oculto ou opcional não é lacuna; Descrição é cobrada sempre que visível. Classificação recebe o contexto completo.
- Link do board sem o processo mantém a visão (/lista, /calendario) e a query (?funnel=).

## Desempenho (auditoria 2026-09-23 · bloco 5)

- Rollup do cronograma (`_rollup_tree`) carrega só a subárvore da raiz (`_subtree_tasks`), nunca o processo inteiro.
- Board e Lista desenham em lotes com "Mostrar mais" (40 cards por coluna, 60 linhas por etapa); contador, busca e rollups usam todos os cards.
- Lista slim do board não lê description/anexos/procurement_meta; `ProjectTaskCardResponse` não pode ler esses atributos (alias inexistente).
- Relatórios que não mostram texto do card carregam tarefas com `_light_task_options()` (raiseload): se passarem a usar description, tirar a opção daquele relatório.
- PO Sync usa cache chaveado pela versão dos dados (`_VERSION_SQL`); toda tabela nova que o PO Sync ler precisa entrar nessa versão. `health_by_po` tem cache de 60 s.
- Frontend: `codeSplitting.groups` com vendor-react na maior prioridade; a primeira tela não pode importar vendor-charts/markdown/dnd.

## Itens menores (auditoria 2026-09-23 · bloco 6)

- Diretoria e Área do card só aceitam as opções do formulário padrão (opcao_N); nunca id de área do TeamOps. Valor legado igual ao salvo não trava a edição.
- Rota de módulo desativado no tenant mostra "Módulo não disponível" e não monta a tela; o código do módulo continua (não reativar nem apagar sem pedido).
- Mesma pessoa não tem duas ausências pendentes/aprovadas sobrepostas; calendário mostra só pendentes e aprovadas.
- /health (API e domínio público) checa o banco (503 se cair) e o Redis (degraded).
- docs/ é lido pelo módulo Documentação e aparece para todos: prompt, rascunho ou material interno vai para provisorio/.

## Gantt — visão completa

- Visão completa rola nos dois eixos com coluna "Demanda" e cabeçalho fixos, abre em hoje e respeita o zoom da barra; grade = fundo CSS (nunca um elemento por dia por linha).
- Linhas da visão completa usam `grid-template-columns: 320px minmax(0, 1fr)`; `FULL_LABEL_W` acompanha os 320px.
- Travas de cronograma na visão completa ficam num resumo que abre a lista; o cronograma do projeto (com root) continua com o banner próprio.

## RTD — planos do EPA

- Códigos do EPA na reunião: null = padrão do .env; lista = esses planos; [] = EPA desligado nesta reunião (não consulta o EPA nos slides, relatório nem link público).
