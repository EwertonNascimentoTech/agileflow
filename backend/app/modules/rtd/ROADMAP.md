# RTD — Roadmap de dados futuros (Parte 1)

Este documento lista as seções da RTD Parte 1 que **ainda não têm dado no sistema**.
Na UI elas aparecem como **🚧 Em desenvolvimento** (flag `em_desenvolvimento` no payload de
`GET /rtd/reunioes/{id}/report`). Aqui fica o modelo de dados/fonte proposto para cada uma,
para implementação futura.

> Status atual: **placeholder**. Nada abaixo está implementado ainda.

---

## Já entregue (Parte 1, reaproveitando o que existe)
- **Panorama**: entregas concluídas no período e previstas no próximo ciclo (filtro por competência), riscos/impedimentos — reusa `projetos` (`PoSyncService`).
- **Por PO**: % execução (stage-weighted), prazo/atrasos, fase, saúde — reusa `PoSyncService`.
- **Impacto — Indicadores estratégicos/táticos**: reusa `indicadores` (`IndicadorService.dashboard`).
- **Impacto — Contagens digitais** (processos/documentos/serviços): reusa `produtos` (`ProductService.dashboard`).
- **Deliberações (ata)**: persistidas neste módulo (`rtd_deliberacoes`).

---

## Pendente (dados inexistentes — precisam de novo modelo/entrada/integração)

### 1. Orçamento / custo do projeto  (§2.2)
- **Hoje**: `projetos` só tem esforço (`ProjectTask.estimated_hours` / `actual_hours`). O único
  dado financeiro do sistema é `produtos` `Contrato.valor` (custo de contrato de produto).
- **Proposta**: campo(s) de orçamento no `ProjectTask` raiz (ex.: `orcamento_previsto`,
  `custo_realizado`) OU tabela `project_custos` (lançamentos por projeto). Exibir previsto × realizado.

### 2. ROI  (§2.3)
- **Hoje**: inexistente — só existe o lado do **custo** (contratos). Falta o lado do **benefício**.
- **Proposta**: depende de (1) custo e (4) benefícios monetizados. ROI = (benefício − custo) / custo.
  Implementar após orçamento/custo e benefícios.

### 3. Chamados gerados após implantação  (§2.3)
- **Hoje**: só **configuração** de SLA/suporte (`produtos` `ProductSupport`, `sla_*`), sem volume.
- **Proposta**: volume de chamados por produto/período. Preferencialmente **integração** com o
  helpdesk (ex.: importar contagem por produto por competência) ou tabela `product_chamados`
  (lançamento manual/importado: produto, período, abertos, resolvidos).

### 4. Satisfação dos usuários  (§2.3)
- **Hoje**: nenhum modelo (NPS/CSAT/pesquisa).
- **Proposta**: tabela `satisfacao_medicoes` (produto/projeto, período, tipo NPS|CSAT, valor,
  amostra) — alimentada por survey/integração. Exibir tendência por competência.

### 5. Benefícios (capturados / previstos)  (§2.4)
- **Hoje**: inexistente. O mais próximo é o score de priorização `impacto` de `projetos`
  (1/3/5, pré-execução — não é benefício capturado nem monetizado).
- **Proposta**: tabela `rtd_beneficios` ou `project_beneficios` (projeto, tipo, descrição,
  valor_previsto, valor_capturado, data, evidência). Base para o ROI (2).

### 6. Objetivo, Marcos e Plano de contingência  (§2.1 / §2.2)
- **Hoje**: `ProjectTask.description` (genérico); "próximo marco" é sintetizado como o menor
  `due_date` futuro (não há conceito de milestone first-class); plano de contingência só como
  narrativa não persistida.
- **Proposta**: `ProjectTask.objetivo` (Text) dedicado; flag `is_milestone` em `ProjectTask`
  (marcos first-class); e `plano_contingencia` (Text) por projeto — ou capturados por reunião
  como itens de pauta persistidos no RTD.

---

## Notas de implementação
- Seguir o padrão do módulo: models em `TenantBase`, migration idempotente em
  `core/tenant_migrations.py` (novo `_step_NNN_*` registrado em `STEPS`), commits no service.
- Ao ligar cada fonte, remover a respectiva flag em `em_desenvolvimento` (montada em
  `RtdService.build_report`) e renderizar a seção real no frontend
  (`frontend/src/modules/rtd/RtdReuniaoPage.tsx`).
