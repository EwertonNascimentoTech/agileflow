# Módulo CRM / Vendas — Especificação funcional e técnica

Este documento descreve o **módulo CRM** da aplicação **Kore Serviços** (stack FastAPI + PostgreSQL + React), tal como implementado no repositório. Serve de base para **replicar ou integrar** as mesmas capacidades noutro sistema.

**Âmbito do menu “CRM / Vendas”** (navegação lateral): Dashboard (parcialmente CRM), Kanban, Atendimento (chat), Contatos, Empresas. Páginas de configuração relacionadas: Funis e regras, Acompanhamento automático, Campos personalizados, Integrações (inclui CRM config), Utilizadores.

---

## 1. Visão geral

O CRM gira em torno de **Leads** posicionados em **funis** (`Funnel`) e **etapas** (`Stage`), com **estado comercial** configurável por funil. Há ligação opcional a **Contact** e **Company**, **mensagens** por lead, **propostas** versionadas, **tarefas**, **eventos de timeline**, **regras de automação** e **campos personalizados** em Lead / Contact / Company.

A comunicação com o backend faz-se por **REST** sob o prefixo `/api`, com autenticação **JWT** (`Authorization: Bearer …`). No frontend, a fachada `crmApi` (`frontend/src/api/crmApi.js`) expõe entidades genéricas, `auth`, `users`, `functions`, `integrations.Core.UploadFile` e bloco `operacao` (fora do núcleo CRM puro, mas ligado a propostas aceites).

---

## 2. Rotas da interface (React Router)

| Rota | Página | Função resumida |
|------|--------|-----------------|
| `/` | Dashboard | Resumo: leads, mensagens, funis, propostas, mini-Kanban, tarefas a vencer, etc. |
| `/kanban` | Kanban | Board completo por funil: arrastar leads entre etapas, filtros, novo lead, atribuição a utilizadores. |
| `/chat` | Atendimento | Lista de leads + janela de mensagens (mesmo modelo `Message` que no detalhe do lead). |
| `/contacts` | Lista de contatos | Listagem com pesquisa, filtros por estado/data, paginação. |
| `/contacts/:id` | Contato | Detalhe, empresa associada, leads, mensagens por lead, campos personalizados. |
| `/companies` | Lista de empresas | Idem padrão de lista + métricas de leads. |
| `/companies/:id` | Empresa | Detalhe, contatos, leads, mensagens. |
| `/leads/:id` | Lead | Ficha completa: chat, timeline, propostas, tarefas, valor, tipo cliente, status, vínculos, política de tabs por etapa. |
| `/funnels` | Funis e regras | CRUD de funis, etapas, catálogo de status do lead, automações por etapa e por “proposta aceite”. |
| `/follow-up` | Acompanhamento automático | CRUD de **templates** de mensagem por funil/etapa/canal (ver secção 11 — execução). |
| `/custom-fields` | Campos personalizados | Gestão de `CustomFieldDefinition`. |
| `/settings` | Integrações | WhatsApp / Instagram / branding / moeda / fuso + bloco de campos personalizados. |
| `/users` | Utilizadores | Lista e convite (`crmApi.users.inviteUser`), alteração de role. |

Login: `/login` (fora do layout CRM autenticado).

---

## 3. Contrato REST genérico de entidades

Todas as entidades “de negócio” seguem o mesmo padrão (exceto `User`, que mapeia para `/api/users`):

- **Listagem**: `GET /api/{entidade_snake}`  
  - Query opcional: `sort` (ex.: `-created_date`, `order`), `limit`, e **filtros** por igualdade exata de campo (`?funnel_id=x&status=active`).  
  - Resposta: array JSON de objetos com `id`, campos de negócio em snake_case / camelCase conforme gravado, e `created_date`.

- **Criação**: `POST /api/{entidade_snake}` — body JSON; o servidor preenche `created_date` / `updated_date` se aplicável.

- **Atualização**: `PATCH /api/{entidade_snake}/{id}` — merge parcial no registo.

- **Eliminação**: `DELETE /api/{entidade_snake}/{id}`.

**Convenção de nomes**: no cliente, `crmApi.entities.NomeEmPascalCase` → URL em `snake_case` (ex.: `ContaAReceber` → `conta_a_receber` via override explícito em `crmApi.js`).

**Modelo de persistência no backend**:

- Entidades “core” CRM (`lead`, `funnel`, `stage`, `task`, `message`) têm **tabelas/modelos dedicados** mas o payload exposto continua a ser essencialmente um documento JSON em `data` (ver `backend/app/routers/entities.py`).
- As restantes entidades usam **`EntityRecord`** com coluna `entity` = nome da entidade (ex.: `contact`, `company`, `proposal`, `automation_rule`).

---

## 4. Entidades do domínio CRM (referência de implementação)

### 4.1 Lead (`lead`)

Representa oportunidade / card no funil.

**Campos usados na UI (não exclusivos)**:

- `name`, `phone`, `email`
- `funnel_id`, `stage_id` — obrigatórios para o Kanban; a API **valida** que `stage_id` pertence ao mesmo `funnel_id` do lead ao atualizar `stage_id`.
- `status` — identificador dentro do **catálogo do funil** (ex.: `active`, `won`, `lost`, `archived` ou IDs customizados com `mapsTo`).
- `value` — valor monetário da oportunidade.
- `channel` — ex.: `whatsapp`, `instagram`, `manual`, `demo` (afeta ícones e envio no chat).
- `client_type` — ex.: `pj` / `PF` (propostas e UI).
- `contact_id`, `company_id` — opcionais.
- `assigned_to` / utilizador associado (Kanban: lista de `User` para atribuir).
- `last_interaction` — ISO datetime; atualizado ao enviar mensagem no chat.
- `created_date`, `updated_date`

**Operações relevantes**:

- Movimentação no Kanban: `PATCH` com `stage_id` e, quando a coluna é de **ganho/perda**, também `status` alinhado ao catálogo do funil.
- Após mover card / mudar resultado, o frontend chama `POST /api/functions/runAutomations` (ver secção 9).

### 4.2 Funnel (`funnel`)

- `name`, `is_active`
- **`lead_status_catalog`**: array de `{ id, label, color, order, mapsTo }` onde `mapsTo ∈ { active, won, lost, archived }`. Define os estados comerciais possíveis do lead **naquele funil**.
- **`column_won_status_id`**, **`column_lost_status_id`**: qual ID do catálogo gravar quando o lead “ganha” ou “perde” por coluna Kanban ou fluxo de proposta.
- Campos legacy ainda suportados na UI: `lead_status_on_won`, `lead_status_on_lost` (mapeados para o catálogo efetivo quando necessário).

### 4.3 Stage (`stage`)

Coluna do Kanban.

- `name`, `funnel_id`, `order`, `color`
- **`outcome`**: `neutral` | `won` | `lost` — define se a coluna é de resultado (tem prioridade sobre heurística de nome).
- **`lead_page_policy`**: objeto por “área” da ficha do lead (`tab_chat`, `tab_timeline`, `tab_proposals`, `tab_tasks`, `sidebar_value`, etc.) com valores como `full` / `hidden` — controla visibilidade de secções na página do lead consoante a **etapa atual**.

### 4.4 Contact (`contact`) e Company (`company`)

- Contact: dados pessoais, `company_id` opcional, estado comercial do contacto na lista, datas, etc.
- Company: dados da empresa, `status` / `crm_status` (lista trata ambos).
- Relação **N contatos → 1 empresa**; leads podem referenciar contacto e/ou empresa.

### 4.5 Message (`message`)

Mensagem ou nota associada a um **lead** (não a um thread global independente do lead na API).

Campos típicos:

- `lead_id`, `content`
- `direction`: `inbound` | `outbound`
- `channel`: `whatsapp` | `instagram` | `manual`
- `media_type`: ex. `text`
- `sent_by`: ex. `note` para notas internas
- `status`: ex. `sent`
- `created_date`, `updated_date`

Fluxo no chat: cria registo com `POST`, depois tenta `functions.invoke("sendMessage", { leadId, message, channel })` — no backend atual, **apenas** `runAutomations` tem lógica real; `sendMessage` devolve placeholder (ver secção 10).

### 4.6 Task (`task`)

- `title`, `lead_id`, `status` (`pending` | `done`), `due_date`, `notes`, datas.

Usado no **widget de tarefas**, calendário de tarefas no dashboard e automações.

### 4.7 LeadEvent (`lead_event`)

Eventos da **timeline** (notas, sistema, etc.): `lead_id`, `type`, `content`, `author`, `created_date`.  
As automações com ação “notificação interna” criam `Message` + `LeadEvent` com `author: "sistema"` (alimenta também o feed de notificações).

### 4.8 Proposal (`proposal`)

Proposta comercial ligada a um lead; suporta **versões** (`version`).

- Itens de linha: referência a **`servico_ficha_id`**, `desc`, `qty`, `unit`, etc. (modal de proposta).
- `status`: inclui `draft`, `sent`, `accepted`, … (histórico e modal tratam transições).
- **`lead_id`**, dados de cliente PJ/PF, condições de pagamento (`payment` pode ser JSON de parcelas), prazos, validade, texto de entrega, geração de PDF no cliente.

**Regra importante no backend**: só a **versão ativa** da proposta pode ser alterada; versões antigas rejeitam `PATCH` com erro explicativo.

**Quando `status` passa a `accepted`** (e antes não era aceite):

1. Sincronização **financeira** (contas a receber / lógica de proposta).
2. Cancelamento de reservas operacionais associadas, se a proposta deixa de estar aceite (reversão).
3. Execução de **`runAutomations`** com `trigger: proposal_accepted` (mover para ganho, tarefas, notas, etc.).
4. Tentativa de **reserva de material** operacional (`_operacao_reserva` na resposta).

Isto acopla CRM a **Financeiro** e **Operação**; para outro sistema, defina se replica só o CRM ou também estes efeitos.

### 4.9 AutomationRule (`automation_rule`)

Documento JSON em `EntityRecord`, entidade `automation_rule`.

**Gatilhos (`trigger`)**:

- `enter_stage` — requer `stage_id` igual à etapa onde o lead entrou; opcionalmente `funnel_id` para filtrar.
- `status_won` / `status_lost` — filtram pela `stage_id` **atual** do lead no momento do gatilho (conforme `automations_runner.py`).
- `proposal_accepted` — regras ao nível do **funil** (`funnel_id`); podem filtrar por `stage_id` do lead opcionalmente.

**Ações (`action`)**:

- `create_task` — `task_title`, `task_due_hours` (padrão 24).
- `send_notification` — `notification_message` (nota interna + evento).
- `update_lead_status` — `target_status` (string, ID no catálogo).
- `move_lead_to_won` — **só** no fluxo `proposal_accepted`; move o lead para a coluna de ganho do funil e alinha status; no máximo **uma** regra deste tipo por funil (validação na UI).

Campos comuns: `is_active`, `funnel_id`, `stage_id` (conforme gatilho).

### 4.10 CustomFieldDefinition (`custom_field_definition`)

Define campos extra:

- `label`, `key` (slug interno), `entity_type` (`Lead` | `Contact` | `Company`), `field_type` (`text` | `number` | `checkbox`), `order`.

Valores são guardados nos próprios documentos Lead/Contact/Company nas chaves correspondentes ao `key` (renderização genérica em `CustomFieldsRenderer`).

### 4.11 FollowUpTemplate (`follow_up_template`)

Templates de mensagem para “acompanhamento automático”:

- `stage_id`, `funnel_id`, `stage_name`, `funnel_name`, `message`, `channel` (`auto` | `whatsapp` | `instagram`), `is_active`.

A UI documenta variáveis `{{nome}}`, `{{etapa}}`, `{{funil}}`. **No backend analisado não existe worker** que dispare estes templates ao mudar de etapa: persistem-se e gerem-se via API, mas o **envio automático** teria de ser implementado (cron, fila, ou hook após `Lead.update`).

### 4.12 User (`user` → `/api/users`)

Lista de utilizadores da app (não confundir com `AppUser` interno): usado para **atribuição de leads** no Kanban e página de utilizadores. Convite: `POST /api/users/invite` com `email`, `role`, campos extra.

---

## 5. Autenticação e perfil CRM

- `GET /api/auth/me` — utilizador corrente; inclui **`crm_config`** (objeto JSON) quando preenchido: tokens WhatsApp/Instagram, branding (`company_name`, `company_logo_url`), `timezone`, `currency`, `currency_symbol`, etc.
- `PATCH /api/auth/me` — atualiza entre outros `crm_config` (página Integrações).
- Login/logout: token em storage no browser; redirecionamento para `/login?from=…`.

**Roles** (labels na UI): `admin`, `atendente`, `preparador_fisico` — o CRM principal assume sobretudo **admin** e **atendente** para vendas/atendimento.

---

## 6. Comportamento do Kanban (regras de negócio na UI)

1. Carregar funis → escolher `funnel_id`.
2. Carregar `Stage` ordenado por `order` e `Lead` desse funil (no dashboard mini-Kanban filtra `status: active`; na página Kanban mostra todos os estados salvo filtros aplicados pelo utilizador).
3. Ao **largar** um card noutra coluna:
   - Determina-se `outcome` da etapa destino (`neutral` / `won` / `lost`).
   - Se `won`/`lost`, calcula-se o `status` do lead com `columnResultStatusId(funnel, won|lost)`.
   - Se `neutral`, ainda se pode **inferir** ganho/perda pelo **nome** da coluna (ex.: “Ganhou”, “Perdido”) — ver `frontend/src/utils/kanbanStageMeta.js`.
4. `PATCH` no lead com `stage_id` + `status` opcional.
5. Chamadas sequenciais a `runAutomations` com `trigger: enter_stage` e, se existirem, `status_won` / `status_lost`.
6. Invalidação do cache de **notificações** recentes.

**Erro de validação**: se `stage_id` não pertencer ao `funnel_id` do lead, a API responde **400** com mensagem clara.

---

## 7. Dashboard (trechos CRM)

- Contagens e listas recentes de **leads**, **mensagens**, **propostas**, **insumos** (ligação operacional), funil selecionado com etapas e leads ativos.
- **Tarefas pendentes** com `due_date` e conclusão com `PATCH` para `done`.
- Widgets reutilizam as mesmas entidades CRM.

---

## 8. Listagens de Contatos e Empresas

- Carregam **Contact** / **Company**, **Lead**, **Funnel** para agregar contagem de leads, estado visual, canal, etc.
- Filtros: texto livre, estado, intervalo de datas (campos dependem dos dados guardados em cada registo).
- Ações: navegar para ficha, criar (onde existir botão), associar empresa/contacto a partir dos modais de lead.

---

## 9. Página do Lead (`/leads/:id`)

Funcionalidades típicas:

- Cabeçalho: nome, telefone, **status** com badges do catálogo do funil, **tipo de cliente**, **valor**.
- **Vínculos**: associar / desassociar `Contact` e `Company` (modais com create ou update).
- **Tabs** (conforme `lead_page_policy` da etapa): conversa (`Message`), **timeline** (`LeadEvent` + mensagens), **propostas** (lista + modal + histórico), **tarefas**.
- **Campos personalizados** com persistência no documento do lead.
- Chat embutido (mesmo fluxo que `ChatWindow`: create `Message` + tentativa `sendMessage`).

---

## 10. Funções HTTP “tipo Base44” (`/api/functions/{nome}`)

| Função | Comportamento actual |
|--------|----------------------|
| `runAutomations` | Executa `execute_run_automations` no servidor: percorre `AutomationRule`, aplica ações, faz `commit`. Payload: `leadId` (obrigatório), `trigger`, `stageId`, `funnelId`, `proposalId` opcional. |
| `sendMessage` | **Stub**: resposta genérica `{ ok: true, function, payload }` — **não** envia WhatsApp/Instagram. A mensagem já ficou persistida em `Message` pelo cliente. |
| Outros nomes | Mesmo stub — útil para migrações futuras. |

Para reproduzir noutro sistema: implementar `runAutomations` com a mesma semântica de payload/gatilhos ou mapear para o vosso motor de regras.

---

## 11. Acompanhamento automático (`FollowUpTemplate`)

- **UI**: criação por funil + etapa, texto, canal, ativar/desativar, apagar.
- **Execução**: não está ligada a hooks de mudança de etapa no servidor neste código. Para equiparar ao produto desejado, implementar: ao `PATCH` de `lead` com `stage_id` alterado, procurar templates ativos `(funnel_id, stage_id)`, interpolar variáveis, chamar API Meta/WhatsApp ou Instagram, e registar `Message` / `LeadEvent`.

---

## 12. Notificações internas

- `GET /api/notifications/recent?limit=…` — devolve `LeadEvent` com `author == "sistema"` (últimas automações / notas de sistema).
- Usado pela campainha de notificações na barra superior após automações.

---

## 13. Upload de ficheiros

- `POST /api/upload` — multipart `file`; usado por integrações e anexos na UI quando aplicável.
- Cliente: `crmApi.integrations.Core.UploadFile({ file })` com `FormData`.

---

## 14. Dependências transversais (para portar com fidelidade)

| Área | Ligação ao CRM |
|------|------------------|
| **Proposta aceite** | Automações, financeiro, reserva operacional (ver `entities.py` no `PATCH` de `proposal`). |
| **Utilizadores** | Atribuição de leads, convites, roles. |
| **Operação / Produção** | Ordens de produção referenciam `lead_id`, `proposal_id`; não faz parte do menu CRM mas partilha entidades. |

Se o objectivo for **só CRM comercial**, pode omitir-se operação/financeiro e simplificar o `PATCH` de `proposal` para apenas gravar estado.

---

## 15. Checklist para implementação noutro sistema

1. **Modelo**: Lead, Funnel, Stage (com `outcome` e `lead_page_policy`), Contact, Company, Message, Task, Proposal (+ versões), LeadEvent, AutomationRule, CustomFieldDefinition, FollowUpTemplate, User directory.
2. **API**: CRUD genérico + regras especiais (validação `stage_id`⊂`funnel_id`, proposta só versão ativa, side-effects em aceite).
3. **Kanban**: ordenação de etapas, drag-and-drop, inferência ganho/perda, chamadas ao motor de automação.
4. **Automação**: gatilhos e acções descritos na secção 4.9; ordem determinística das regras (no código: ordenação por `created_at` das regras).
5. **UI ficha lead**: tabs condicionais, timeline unificada, propostas PDF no cliente (se desejarem paridade).
6. **Config**: objecto tipo `crm_config` no perfil ou tabela de settings global.
7. **Integrações reais**: implementar `sendMessage` + worker de **FollowUp** se quiserem paridade com a promessa da UI.

---

## 16. Ficheiros de referência no repositório

| Tema | Ficheiros |
|------|-----------|
| Cliente API | `frontend/src/api/crmApi.js`, `frontend/src/api/apiClient.js` |
| Rotas UI | `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx` |
| Entidades / regras API | `backend/app/routers/entities.py` |
| Automações | `backend/app/automations_runner.py`, `frontend/src/components/dashboard/DashboardKanban.jsx`, `frontend/src/pages/KanbanPage.jsx` |
| Funções | `backend/app/routers/functions.py` |
| Notificações | `backend/app/routers/notifications.py` |
| Catálogo de status | `frontend/src/utils/leadStatusCatalog.js` |
| Dados de exemplo | `backend/app/demo_seed.py` |

---

*Documento gerado com base na análise do código do repositório. Ajuste nomes de campos se o vosso domínio usar outro vocabulário; mantenha os contratos (`trigger`, `action`, validações) se quiserem compatibilidade com clientes existentes.*
