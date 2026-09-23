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

## Operação Assistida (clientes)

- Cliente da Operação Assistida é `project_clients` + login `public.users`; **não** é Pessoa do TeamOps.
- E-mail do cliente é único: cadastrar começa por `GET /projetos/clients/lookup`; cliente existente é reaproveitado, nunca duplicado.
- Cliente externo (Função "Cliente (Operação Assistida)") só acessa o Portal: `require_module` devolve 403 em tudo, exceto rotas com `allow_client=True`.
- Colaborador interno que também é cliente mantém a Função dele e ganha o Portal (`has_client_portal`).
- Vínculo cliente <-> projeto só com card-raiz do kanban Projetos e Programas.
- Notificação in-app passa por `core/notifications.py`; destinatário é users.id (resolver Person -> user com `user_ids_for_persons`).
- Raia Operação Assistida (`is_assisted_operation`) fica antes de Concluído e **não** é final. Projeto/Programa que vai a Concluído sem ter passado por ela exige justificativa (HTTP 428 -> diálogo -> `assisted_op_skip_reason`).
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
