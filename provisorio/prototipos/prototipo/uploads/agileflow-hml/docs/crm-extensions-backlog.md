# CRM Extensions — Backlog de Implementação
> Módulo: `atendimento` | Branch: `feature/crm`  
> Última atualização: 2026-05-17

Todas as histórias abaixo **estendem o módulo `atendimento` existente** — mesmas tabelas de tenant, mesma arquitetura, sem criar novo módulo. Ordenadas por prioridade e dependência técnica.

---

## Sumário

- [K-004 — Ganho/Perdido com motivo](#k-004--ganhoprerdido-com-motivo)
- [K-006 — Forecast de vendas](#k-006--forecast-de-vendas)
- [K-003 — Campos obrigatórios por etapa](#k-003--campos-obrigatórios-por-etapa)
- [K-013 — Playbook de tarefas por etapa](#k-013--playbook-de-tarefas-por-etapa)
- [K-019 — Funil de conversão visual](#k-019--funil-de-conversão-visual)
- [K-018 — Relatório de produtividade por vendedor](#k-018--relatório-de-produtividade-por-vendedor)
- [K-016 — Reativação de negócios perdidos](#k-016--reativação-de-negócios-perdidos)
- [K-020 — Ticket médio e receita](#k-020--ticket-médio-e-receita)

---

## K-004 — Ganho/Perdido com motivo
**Prioridade:** Alta | **Esforço estimado:** Pequeno

**Como** vendedor,  
**quero** marcar um atendimento como ganho ou perdido informando o motivo,  
**para que** os resultados apareçam nos relatórios e o sistema possa acionar automações de reativação.

**Contexto técnico:**
O modelo `StatusConfig` já possui o campo `outcome` com valores `won` e `lost`. Falta o modal de encerramento com motivo obrigatório e a lógica de mover o atendimento para histórico.

**Critérios de aceite:**
- [ ] Botões "Ganho" e "Perdido" visíveis na tela de detalhe do atendimento
- [ ] Campo de motivo obrigatório ao marcar como perdido
- [ ] Campo de motivo opcional ao marcar como ganho
- [ ] Atendimento encerrado some do kanban ativo e vai para aba "Histórico"
- [ ] Evento registrado na timeline com motivo e responsável
- [ ] Automação de reativação pode ser acionada após X dias (hook para K-016)

**Tarefas técnicas:**

**Backend:**
- [ ] Adicionar coluna `close_reason varchar(500)` na tabela `attendances` — migration step `014_close_reason`
- [ ] Adicionar coluna `closed_by uuid` na tabela `attendances`
- [ ] Endpoint `POST /atendimento/attendances/{id}/close` com body `{ outcome: "won"|"lost", reason?: string }`
- [ ] Validação: `reason` obrigatório quando `outcome = "lost"`
- [ ] Registrar evento na timeline: `"Negócio marcado como [ganho/perdido]: {reason}"`
- [ ] Disparar hook/evento para automações de reativação (K-016)

**Frontend:**
- [ ] Botões "Ganho 🏆" e "Perdido ✗" no header de `AttendanceDetailPage`
- [ ] Modal `CloseAttendanceModal.tsx` com select de motivo e campo de observação
- [ ] Atendimentos com `closed_at` filtrados do kanban por padrão
- [ ] Aba "Histórico" no `KanbanPage` listando ganhos e perdidos
- [ ] Badge colorido na timeline indicando desfecho

---

## K-006 — Forecast de vendas
**Prioridade:** Alta | **Esforço estimado:** Médio

**Como** diretor de vendas,  
**quero** visualizar a previsão de receita do mês com base nos negócios em aberto e na probabilidade de cada etapa,  
**para que** eu tome decisões de metas com antecedência.

**Contexto técnico:**
O modelo `StatusConfig` já existe com `order` e `color`. Basta adicionar o campo `probability`. O campo `value` já existe nos atendimentos. O endpoint de forecast é uma agregação simples.

**Critérios de aceite:**
- [ ] Campo de probabilidade (0–100%) configurável por etapa no painel de config
- [ ] Forecast calculado automaticamente: `sum(value × probability/100)` por etapa
- [ ] Página de Forecast com filtros por mês, trimestre e pipeline
- [ ] Comparativo entre meta configurada e forecast atual
- [ ] Drill-down por vendedor

**Tarefas técnicas:**

**Backend:**
- [ ] Adicionar coluna `probability smallint DEFAULT 50` na tabela `statuses` — migration step `015_stage_probability`
- [ ] Adicionar tabela `sales_targets (id, user_id, pipeline_id, period, target_value, created_at)` — migration step `016_sales_targets`
- [ ] Endpoint `GET /atendimento/reports/forecast?period=2026-05&funnel_id=...`
  - Retorna: `{ forecast_value, target_value, by_stage: [...], by_user: [...] }`
- [ ] Endpoint `POST /atendimento/reports/targets` — criar/atualizar meta por período e vendedor
- [ ] Cálculo: `SELECT SUM(a.value * s.probability / 100) FROM attendances a JOIN statuses s ON a.status_id = s.id WHERE ...`

**Frontend:**
- [ ] Campo `probability` no formulário de edição de etapa em `StatusConfigPage`
- [ ] Nova página `ForecastPage.tsx` no módulo atendimento
  - KPI cards: Forecast total, Meta do período, Delta (%)
  - Gráfico de barras: forecast vs meta por vendedor
  - Tabela detalhada por etapa com valor ponderado
- [ ] Selector de período (mês/trimestre) e pipeline
- [ ] Rota registrada no `AtendimentoLayout`

---

## K-003 — Campos obrigatórios por etapa
**Prioridade:** Alta | **Esforço estimado:** Médio

**Como** gestor comercial,  
**quero** definir quais campos precisam estar preenchidos para um atendimento avançar de etapa,  
**para que** os dados do pipeline estejam sempre completos e o forecast seja confiável.

**Contexto técnico:**
O sistema já possui `StatusTransition` para controlar quais etapas podem avançar para quais. A validação de campos obrigatórios é uma camada adicional no endpoint `POST /attendances/{id}/status`.

**Critérios de aceite:**
- [ ] Interface admin para mapear campos obrigatórios por etapa de destino
- [ ] Sistema bloqueia avanço com mensagem clara listando os campos faltantes
- [ ] Campos obrigatórios destacados no formulário de edição do atendimento
- [ ] Suporte a campos nativos (`value`, `expected_close_date`, `company_id`) e custom fields

**Tarefas técnicas:**

**Backend:**
- [ ] Criar tabela `stage_required_fields (id, status_id, field_name, field_type)` — migration step `017_stage_required_fields`
  - `field_type`: `native` | `custom`
  - `field_name`: ex: `"value"`, `"expected_close_date"`, `"cf_produto"`
- [ ] Endpoint `GET/POST/DELETE /atendimento/config/statuses/{id}/required-fields`
- [ ] Middleware de validação no endpoint `POST /attendances/{id}/status`:
  - Busca campos obrigatórios da etapa destino
  - Verifica se estão preenchidos no atendimento
  - Retorna `422` com lista de campos faltantes se inválido
- [ ] Registrar tentativa bloqueada no audit log

**Frontend:**
- [ ] Aba "Campos obrigatórios" na config de cada etapa em `StatusConfigPage`
- [ ] Checklist de campos nativos + custom fields disponíveis para marcar como obrigatório
- [ ] Ao tentar mover card no Kanban com campos faltando: toast de erro listando campos
- [ ] Campos obrigatórios não preenchidos marcados com borda vermelha em `AttendanceDetailPage`

---

## K-013 — Playbook de tarefas por etapa
**Prioridade:** Alta | **Esforço estimado:** Médio

**Como** gestor comercial,  
**quero** definir um conjunto de tarefas padrão que são criadas automaticamente quando um atendimento entra em uma etapa,  
**para que** o processo de vendas seja seguido de forma consistente por todos os vendedores.

**Contexto técnico:**
O sistema já possui o modelo `Task` e o evento de mudança de etapa em `AttendanceService.change_status()`. O Celery já está ativo. Basta adicionar os templates de playbook e o listener.

**Critérios de aceite:**
- [ ] Configurar lista de tarefas por etapa no painel de config
- [ ] Tarefas criadas automaticamente ao entrar na etapa, atribuídas ao responsável do atendimento
- [ ] Prazo configurável por tarefa em dias úteis
- [ ] Tarefas do playbook identificadas com badge "Playbook" na lista de tarefas
- [ ] Relatório de adesão: % de tarefas de playbook concluídas no prazo

**Tarefas técnicas:**

**Backend:**
- [ ] Criar tabela `playbook_steps (id, status_id, title, description, due_days, order, created_at)` — migration step `018_playbook_steps`
- [ ] Endpoint `GET/POST/PATCH/DELETE /atendimento/config/statuses/{id}/playbook`
- [ ] Listener em `AttendanceService.change_status()`: ao entrar em nova etapa, busca `playbook_steps` e cria `Task` para cada um
  - `due_date = now() + due_days` (dias corridos; melhorar para úteis em v2)
  - `assigned_to = attendance.assigned_to`
  - `title = step.title` com prefixo `[Playbook]`
  - `source = "playbook"` — novo campo na tabela `tasks`
- [ ] Adicionar coluna `source varchar(50) DEFAULT 'manual'` na tabela `tasks` — migration step `018`
- [ ] Endpoint `GET /atendimento/reports/playbook-compliance?period=...`

**Frontend:**
- [ ] Seção "Playbook" na tela de config de cada etapa
- [ ] Formulário de criação de step: título, descrição, prazo em dias
- [ ] Reordenação por drag & drop
- [ ] Badge `[Playbook]` nas tarefas criadas automaticamente em `TasksPanel`
- [ ] Aba "Playbook" no `DashboardPage` com taxa de adesão por vendedor

---

## K-019 — Funil de conversão visual
**Prioridade:** Alta | **Esforço estimado:** Médio

**Como** diretor de vendas,  
**quero** visualizar quantos atendimentos avançam ou caem em cada etapa do funil com percentuais de conversão,  
**para que** eu identifique os gargalos do processo e atue onde a perda é maior.

**Contexto técnico:**
A tabela `attendance_status_logs` já registra cada mudança de etapa com timestamp. É suficiente para calcular conversão cohort e tempo médio por etapa.

**Critérios de aceite:**
- [ ] Funil visual com barras proporcionais e percentual entre etapas
- [ ] Filtros por período, pipeline e responsável
- [ ] Motivos de perda mais frequentes agrupados
- [ ] Tempo médio de permanência em cada etapa
- [ ] Exportação CSV

**Tarefas técnicas:**

**Backend:**
- [ ] Endpoint `GET /atendimento/reports/funnel-conversion?funnel_id=&period=&assigned_to=`
  - Por etapa: `{ stage_name, entries, exits_forward, exits_lost, conversion_rate, avg_days }`
- [ ] Endpoint `GET /atendimento/reports/loss-reasons?period=&funnel_id=`
  - Agrupamento e ranking de `close_reason` dos atendimentos perdidos
- [ ] Query base: usar `attendance_status_logs` para calcular entradas/saídas por etapa

**Frontend:**
- [ ] Nova página `ConversionFunnelPage.tsx`
  - Funil visual SVG/CSS com largura proporcional ao volume
  - Percentual de conversão entre etapas (ex: `Qualificação → Proposta: 62%`)
  - Tempo médio por etapa (ex: `3,2 dias`)
- [ ] Card "Top motivos de perda" com ranking
- [ ] Filtros de período (mês, trimestre, custom) e pipeline
- [ ] Botão exportar CSV
- [ ] Rota registrada no `AtendimentoLayout`

---

## K-018 — Relatório de produtividade por vendedor
**Prioridade:** Alta | **Esforço estimado:** Pequeno

**Como** gestor comercial,  
**quero** ver quantas atividades cada vendedor realizou em um período e comparar com outros vendedores,  
**para que** eu identifique quem precisa de suporte e reconheça quem performa bem.

**Contexto técnico:**
`AttendanceMessage`, `Task`, `TimelineEvent` e `Attendance` já guardam `created_by` / `assigned_to`. A agregação é query SQL direta.

**Critérios de aceite:**
- [ ] Atividades por vendedor: mensagens enviadas, tarefas concluídas, atendimentos abertos/fechados
- [ ] Comparativo período atual vs. período anterior com delta %
- [ ] Ranking de vendedores por atividade e por negócios fechados
- [ ] Exportação em CSV

**Tarefas técnicas:**

**Backend:**
- [ ] Endpoint `GET /atendimento/reports/productivity?period=2026-05&compare=true`
  - Por usuário: `{ user_name, messages_sent, tasks_done, attendances_opened, attendances_won, attendances_lost, vs_previous_period: {...} }`
- [ ] Cálculo de delta percentual entre período atual e anterior
- [ ] Exportação CSV com `StreamingResponse`

**Frontend:**
- [ ] Nova página `ProductivityReportPage.tsx`
  - Tabela com ranking de vendedores e métricas
  - Setas ↑↓ com delta colorido (verde/vermelho) vs. período anterior
  - Gráfico de barras comparativo
- [ ] Filtros de período e pipeline
- [ ] Botão exportar CSV
- [ ] Rota registrada no `AtendimentoLayout`

---

## K-016 — Reativação de negócios perdidos
**Prioridade:** Média | **Esforço estimado:** Médio

**Como** gestor comercial,  
**quero** configurar uma sequência automática de reativação que dispara X dias após um atendimento ser marcado como perdido,  
**para que** leads que não fecharam sejam abordados novamente no momento certo.

**Contexto técnico:**
Celery beat já está ativo. O evento de `close` (K-004) vai gerar o hook necessário. Basta criar a config de reativação e o worker que verifica atendimentos perdidos com reativação pendente.

**Critérios de aceite:**
- [ ] Configurar intervalo de reativação por pipeline (ex: reativar após 30 dias)
- [ ] Pode ter sequência diferente por motivo de perda
- [ ] Reativação cria novo atendimento vinculado ao original (`parent_id`)
- [ ] Notificação in-app para o responsável quando reativação for criada
- [ ] Relatório de taxa de reativação (won-back rate)

**Tarefas técnicas:**

**Backend:**
- [ ] Criar tabela `reactivation_configs (id, funnel_id, loss_reason, delay_days, is_active)` — migration step `019_reactivation`
- [ ] Adicionar coluna `parent_attendance_id uuid` na tabela `attendances` — migration step `019`
- [ ] Endpoint `GET/POST/PATCH/DELETE /atendimento/config/reactivation`
- [ ] Celery beat task `scheduled.reactivate_lost_deals`:
  - Roda diariamente
  - Busca atendimentos com `outcome=lost` e `closed_at <= now() - delay_days` sem reativação ainda
  - Cria novo atendimento com `parent_attendance_id = original.id`
  - Cria notificação in-app para o responsável
- [ ] Endpoint `GET /atendimento/reports/wonback?period=`

**Frontend:**
- [ ] Seção "Reativação automática" na config do funil (`FunnelsConfigPage`)
  - Toggle ativo/inativo
  - Campo de dias para reativação
  - Lista de configurações por motivo de perda
- [ ] Badge "Reativação" no atendimento criado automaticamente
- [ ] Link "Ver original" no atendimento reativado

---

## K-020 — Ticket médio e receita
**Prioridade:** Média | **Esforço estimado:** Pequeno

**Como** diretor de vendas,  
**quero** ver o ticket médio por vendedor e a receita total gerada em um período,  
**para que** eu avalie a qualidade das vendas além do volume.

**Contexto técnico:**
O campo `value` já existe na tabela `attendances`. Atendimentos com `outcome=won` representam receita realizada. A agregação é simples.

**Critérios de aceite:**
- [ ] Ticket médio por vendedor e por pipeline
- [ ] Receita acumulada (ganhos) vs. meta do período
- [ ] Evolução mensal de receita em gráfico de linha
- [ ] Filtros por período e pipeline
- [ ] Exportação CSV

**Tarefas técnicas:**

**Backend:**
- [ ] Endpoint `GET /atendimento/reports/revenue?period=&funnel_id=`
  - `{ total_revenue, avg_ticket, by_user: [...], monthly_evolution: [...] }`
- [ ] Reaproveitar tabela `sales_targets` criada em K-006 para comparativo de meta
- [ ] Exportação CSV

**Frontend:**
- [ ] Nova página `RevenueReportPage.tsx`
  - KPI cards: Receita total, Ticket médio, Negócios ganhos
  - Gráfico de linha: evolução mensal
  - Tabela por vendedor com ticket médio e receita
- [ ] Rota registrada no `AtendimentoLayout`

---

## Dependências entre histórias

```
K-004 (ganho/perdido)
  └─► K-016 (reativação)       — precisa do evento close
  └─► K-019 (funil conversão)  — precisa de close_reason para loss-reasons

K-006 (forecast)
  └─► K-020 (receita)          — reutiliza sales_targets

K-003 (campos obrigatórios)   — independente

K-013 (playbook)               — depende de tasks existentes ✅

K-018 (produtividade)          — independente
K-019 (funil conversão)        — depende de K-004 para motivos de perda
```

---

## Migration steps a adicionar em `tenant_migrations.py`

| Step | Nome | História |
|------|------|----------|
| 014 | `close_reason` | K-004 |
| 015 | `stage_probability` | K-006 |
| 016 | `sales_targets` | K-006 |
| 017 | `stage_required_fields` | K-003 |
| 018 | `playbook_steps` | K-013 |
| 019 | `reactivation_configs` | K-016 |

---

## Ordem de implementação sugerida

```
Sprint 1 (alto impacto, baixo esforço)
  ├── K-004  Modal ganho/perdido com motivo
  └── K-018  Relatório de produtividade

Sprint 2 (alto impacto, médio esforço)
  ├── K-006  Forecast + probabilidade por etapa
  ├── K-003  Campos obrigatórios por etapa
  └── K-019  Funil de conversão visual

Sprint 3 (diferenciais)
  ├── K-013  Playbook de tarefas
  ├── K-020  Ticket médio e receita
  └── K-016  Reativação de negócios perdidos
```

---

## 🎯 Prioridade de execução — `feature/crm`

Ordem definida para desenvolvimento na branch atual, balanceando impacto, esforço e desbloqueio de dependências:

| # | ID | História | Justificativa |
|---|-----|----------|---------------|
| 1 | **K-004** | Modal ganho/perdido com motivo | Rápido, alto impacto — desbloqueia K-016 e K-019 |
| 2 | **K-006** | Forecast (probabilidade por etapa) | Médio esforço, muito pedido por gestores |
| 3 | **K-003** | Campos obrigatórios por etapa | Médio esforço — bloqueia qualidade dos dados |
| 4 | **K-013** | Playbook de tarefas por etapa | Médio esforço — diferencial competitivo |
| 5 | **K-019** | Funil de conversão visual | Médio esforço — relatório estratégico importante |
| 6 | **K-018** | Relatório de produtividade por vendedor | Médio esforço — visibilidade de equipe |

> **Regra:** cada item só começa após o anterior estar com PR aberto.  
> K-016 e K-020 entram após a conclusão dos 6 acima.
