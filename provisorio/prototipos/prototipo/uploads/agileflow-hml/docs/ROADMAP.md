# Kore 2.0 — Roadmap de Implementação

Checklist do que falta. Marcar `[x]` quando concluído. Ordem sugerida por dependência/valor.

---

## 🎯 Fase 6 — Finalizar Propostas e Contratos ✅

Continuação do módulo `propostas_contratos`.

- [x] **PDF da proposta (cliente-side)** — geração via `window.print()` + view dedicada `/p/propostas/.../print`
- [x] **Tab "Propostas" no AttendanceDetailPage** — `ProposalsListPanel` reutilizável; botão "Nova" já vem com `attendance_id` pré-preenchido
- [x] **Tab "Propostas" no ClientDetailPage** — mesma coisa, escopo cliente
- [x] **Cross-module: proposta aceita → atendimento muda pra etapa de ganho** — `_move_attendance_to_won` em ProposalService busca stage com `outcome=won` no funil atual e dispara automações
- [x] **Templates de proposta** — `ProposalTemplate` + items, página de CRUD, dropdown "Aplicar template" no NewProposalPage
- [x] **Link público de aceitação** — `public_token` + rota `/p/propostas/:token` sem auth, registra IP/nome/data
- [x] **Contratos** — `Contract` + `ContractTemplate`, geração a partir de proposta aceita (com ou sem template), fluxo `draft → ready → sent → signed`
- [x] **Assinatura eletrônica (stub)** — hash SHA-256 de `body|signer|timestamp` registrado junto com IP, nome e documento do signatário

---

## 🔌 Fase 7 — Integrações reais ✅

- [x] **WhatsApp Cloud API** — webhook receber + envio outbound usando credenciais do `ChannelConfig`; assinatura X-Hub-Signature-256 validada
- [x] **Instagram Direct API** — idem; parser de DMs + envio via Graph API
- [x] **Worker de envio** (Celery + RabbitMQ) — tasks `send_whatsapp_message_task` e `send_instagram_message_task` com retry automático
- [x] **Webhook receiver público** — `/webhooks/whatsapp/{tenant_slug}` e `/webhooks/instagram/{tenant_slug}`; roteia para atendimento existente
- [x] **Anexos** (imagens, áudios, PDFs) via MinIO — `storage.py`, modelo `MessageAttachment`, endpoint upload com presigned URL
- [ ] **Templates aprovados WhatsApp Business** — sync e seleção em FollowUpTemplate

---

## ⏰ Fase 8 — Async e agendamentos (Celery) ✅

- [x] **Celery app** em `backend/app/core/celery_app.py` (broker = RabbitMQ, backend = Redis) — tasks registradas
- [x] **Worker container** no docker-compose — `saas_celery` + `saas_beat` ativos
- [x] **FollowUpTemplate.delay_minutes** finalmente funcional — `send_followup_delayed_task.apply_async(countdown=...)`
- [x] **Tarefas vencendo** — beat periódico (`scheduled.notify_due_tasks`) cria notificações para tasks com `due_date <= now`
- [x] **Propostas expirando** — beat (`scheduled.expire_proposals`) muda status pra `expired` quando `valid_until < now`
- [x] **Envio assíncrono de mensagens** — `_dispatch_outbound()` despacha para fila Celery por canal
- [ ] **Relatório por e-mail** — agendamento diário/semanal de resumos

---

## 📊 Fase 9 — Dashboards e Relatórios ✅

- [x] **Dashboard CRM (Atendimento)** — funil visual com barras por etapa, contagem + valor, top 10 oportunidades; aba "Dashboard" no AtendimentoLayout
- [x] **Dashboard Propostas** — taxa de aceitação, valor pipeline, propostas vencendo em 7 dias, distribuição por status
- [ ] **Dashboard Super Admin** — tenants ativos, MRR, módulos mais usados
- [x] **Relatório de atendimentos** — exportação CSV com filtros (período, canal, status, responsável)
- [x] **Relatório de propostas** — exportação CSV com filtros (período, status)
- [x] **Endpoint `/atendimento/metrics`** — `/funnel/{id}/metrics` retorna agregados + `/metrics/overview`

---

## 🔔 Fase 10 — Notificações in-app ✅

- [x] **Bell de notificações** no header do CompanyLayout — dropdown com lista, badge de contagem não lida
- [x] **Endpoint `/notifications/recent`** — `GET /company/notifications` + `GET /company/notifications/unread-count`
- [x] **Marcar como lida** — `POST /company/notifications/{id}/read` e `POST /company/notifications/read-all`
- [x] **Polling** — NotificationBell faz polling a cada 30s pro unread count
- [ ] **SSE** pra notificações em tempo real
- [ ] **Toast/snackbar** quando ações disparam eventos pro usuário atual

---

## 🛠 Fase 11 — Custom Fields + Tags ✅

- [x] **Renderizador genérico de custom fields** — `CustomFieldsRenderer.tsx` com suporte a text/number/date/boolean/select/textarea; editável inline
- [x] **Validação dinâmica** — required, tipos, options validados no componente
- [x] **Tags** — modelo `Tag` + junções `ClientTag`/`AttendanceTag` + migration 013; `TagBadge` + `TagList` com cor dinâmica; API CRUD + attach/detach
- [ ] **Filtros avançados** no Kanban e listagens (status, responsável, valor, datas, custom fields, tags)

---

## 🔐 Fase 12 — Auth e segurança ✅

- [x] **Refresh token endpoint** — `POST /auth/refresh` retorna novo access token + novo refresh token
- [x] **Interceptor de refresh** no frontend (axios) — fila de requisições pausada, retry automático após refresh
- [x] **Recuperação de senha** — `POST /auth/forgot-password` + `POST /auth/reset-password`; página `/forgot-password` no frontend; link "Esqueceu a senha?" no login
- [ ] **2FA opcional** (TOTP) pra super_admin e company_admin
- [x] **Audit log** — tabela `audit_log` (migration 005) + `AuditService.log()`
- [x] **Rate limiting** nos endpoints de auth — `slowapi` limita login e forgot-password a 10 req/min
- [x] **CSP / security headers** no nginx — X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Content-Security-Policy

---

## 🧪 Fase 13 — Tests ✅

- [x] **pytest + httpx async client** — fixtures em `tests/conftest.py` com ASGITransport
- [x] **Smoke tests** de cada módulo — `test_auth.py`, `test_proposals.py`, `test_atendimento.py` (25 passed)
- [ ] **Tests de migration de tenant** — garante que tenants antigos e novos passam todos os steps
- [x] **Tests do FollowUpService.interpolate** — 6 testes em `test_followup.py`
- [x] **Tests de transições de status de proposta** (VALID_TRANSITIONS) — 8 testes
- [ ] **CI** (GitHub Actions) — roda tests + lint + type-check em PR

---

## 🎨 Fase 14 — Polimento UX ✅

- [x] **Toast notifications** — sistema próprio via eventos DOM (`ToastContainer.tsx` + `lib/toast.ts`); tipos success/error/info/warning
- [x] **Error boundaries** — `ErrorBoundary.tsx` com fallback UI + botão "Tentar novamente"
- [x] **Dark mode** — `ThemeContext` + toggle Sun/Moon no header; variáveis CSS já configuradas no Tailwind
- [x] **Atalhos de teclado** — `Cmd+K` abre busca global
- [x] **Busca global** (`Cmd+K`) — `GlobalSearch.tsx`; busca clientes, empresas, atendimentos, propostas com navegação ↑↓↵
- [ ] **Loading skeletons consistentes** em todas as listagens (parcial — principais listagens já têm)
- [ ] **Responsividade mobile** — revisar todas as páginas
- [ ] **Internacionalização** (i18n)

---

## 🌐 Fase 15 — Multi-tenancy avançado ✅

- [ ] **Middleware de tenant por subdomínio** — `acme.kore.com` resolve `tenant_acme` automaticamente
- [x] **Branding por tenant** — campos `logo_url` + `primary_color` no `Tenant` (migration 006); endpoints `GET/PATCH /company/branding`
- [x] **Limites por plano** — `max_users` validado em `POST /company/users` com 403 ao atingir limite
- [ ] **Trial de N dias** — `plan_expires_at` + página de "trial expirando" + bloqueio após
- [ ] **Auto-cobrança** (stub) — preparar estrutura, integração com gateway fica pra futuro

---

## 📦 Fase 16 — Novos módulos de negócio

Cada um vira novo `app.modules.<slug>` seguindo o mesmo padrão.

- [ ] **Financeiro** — Contas a pagar/receber, fluxo de caixa, integração com proposta aceita
- [ ] **PDV / Caixa** — Venda direta, cupom, abertura/fechamento de caixa
- [ ] **Suprimentos** — Produtos, estoque, fornecedores, ordens de compra
- [ ] **RH** — Colaboradores, escalas, folha de pagamento básica
- [ ] **Agenda / Calendário** — Eventos vinculados a atendimentos, integração Google Calendar

---

## ⚙️ Fase 17 — DevOps e produção

- [ ] **Configuração de Kubernetes** — Helm chart ou manifestos puros
- [ ] **Backup automatizado** do PostgreSQL (por tenant)
- [ ] **Migrations CI** — sanity check de migration em PR
- [ ] **Observabilidade** — Prometheus metrics + Grafana dashboards
- [ ] **Sentry** ou similar pra error tracking
- [ ] **Logs estruturados** (JSON) com correlation IDs
- [ ] **Healthchecks robustos** (`/health/ready`, `/health/live`)
- [ ] **CDN para assets do frontend** (CloudFront, Cloudflare etc.)
- [ ] **HTTPS automático** (cert-manager + Let's Encrypt)

---

## 📚 Bugs conhecidos / dívida técnica

- [ ] Refatorar `service.py` do atendimento — já tem >1500 linhas, dá pra dividir em arquivos por contexto (config, client, company, attendance, message, task, timeline, automation, followup)
- [ ] Os imports de `_can_*` em `routes.py` do atendimento estão antes dos outros imports — reordenar
- [ ] Validar que `delete cascade` realmente funciona em todos os FKs entre módulos (proposta tem só UUID, sem FK)
- [ ] `AttendanceMessage` com `sender_type=BOT` vs `system` — uniformizar significado
- [ ] Adicionar índices que faltam: `attendances.assigned_to`, `attendances.opened_at`, `tasks.due_date`
- [ ] `crm_config` do super_admin existia no MD original mas não está implementado (currency, timezone, branding)
- [ ] Endpoint público de health do API ainda é `/health` — padronizar pra `/api/v1/health`

---

## 🧹 Ideias futuras (não priorizadas)

- [ ] App mobile nativo (React Native ou Flutter) consumindo a mesma API
- [ ] Plugin de IA — sugerir resposta automática, classificar lead, resumir conversa
- [ ] Integração ERP (NF-e, NF-S)
- [ ] Marketplace de módulos (terceiros desenvolvem e plugam)
- [ ] Webhooks de saída — tenant configura URL pra receber eventos (`proposal.accepted`, `attendance.created`)
- [ ] API pública versionada (`/api/public/v1/...`) com OAuth/API keys pra integrações de cliente

---

**Como usar:** Após concluir uma tarefa, marcar `[x]`. Quando uma fase inteira estiver pronta, ela serve como checkpoint pra um release.

**Princípios:** Cada fase deve ser deployável independentemente. Migrations sempre idempotentes (steps em `tenant_migrations.py`). Sempre adicionar tests pelo menos das transições críticas de estado.
