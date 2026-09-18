# Governan?a do portf?lio de produtos

Regras de gest?o do portf?lio digital (SESI / SENAI / IEL / FIEA / Corporativo) no AgileFlow.

P?blico: PMO, gestores de produto, coordena??o de TI e quem desenha alertas da **Intelig?ncia**.

O que j? existe no sistema est? marcado como **hoje**. O que ainda n?o dispara alerta autom?tico est? como **proposta**.

---

## 1. Objetivo da governan?a

Garantir que **todo produto em opera??o tenha dono, contrato quando for o caso, servi?os rastreados at? o processo de neg?cio, e evid?ncia peri?dica de que ainda entrega valor**.

Em concreto, a governan?a existe para:

| Garantia | Por que importa | Como o AgileFlow j? ajuda |
| :--- | :--- | :--- |
| Nenhum produto “solto” sem respons?vel | Sem PO / RT / dono de neg?cio, o item some da pauta e vira legado invis?vel | Cadastro exige PO (salvo produto **corporativo**, cujo PO fica no **servi?o**). RT precisa ser cargo Refer?ncia T?cnica no TeamOps |
| Evitar baixa performance meses sem revis?o | Produto em produ??o sem release, sem commit ou com sa?de cr?tica some do radar at? virar crise | Alertas `produto_parado` (?12 meses sem release) e `repositorio_sem_commits` (?6 meses). ?ndice de sa?de 0–100 |
| Alinhar ao estrat?gico (SESI/SENAI/Alagoas) | Servi?o sem sub-processo n?o entra no KPI de processos digitais; meta institucional some da RTD | V?nculo servi?o ? portf?lio de processos. Indicadores `fonte=portfolio` (servi?os publicados, documentos nato-digitais, processos digitais). RTD l? meta ª realizado |
| Controlar risco contratual e de dados | Externo sem contrato ou contrato vencendo; produto com dados pessoais sem documenta??o | Alerta `externo_sem_contrato`. Contrato a vencer em 90/60/30 dias. Flag de dados pessoais nos documentos |
| Fechar o ciclo projeto ? produto | Projeto entregue que n?o vira cadastro no portf?lio deixa o invent?rio mentiroso | Promo??o `from-project` (`origin_task_id`) e classifica??o do card (`linked_product_id` / release) |

**Princ?pio operacional:** em **produ??o** o cadastro incompleto ? exce??o, n?o o estado normal. Concep??o, discovery e desenvolvimento podem estar incompletos; o ?ndice de sa?de s? cobra “maturidade de opera??o” quando `lifecycle = producao`.

---

## 2. Situa??es que deveriam virar alerta

N?veis: **alto** (tratar na semana), **m?dio** (tratar no m?s / RTD), **baixo** (higiene de cadastro).

### 2.1 J? calculados hoje (Intelig?ncia + lista de produtos)

| C?digo | N?vel | Situa??o concreta | Gatilho atual |
| :--- | :--- | :--- | :--- |
| `producao_sem_servico` | alto | Produto em produ??o sem nenhum servi?o ativo — invent?rio vazio | `lifecycle = producao` e 0 servi?os ativos |
| `externo_sem_contrato` | alto | Sistema externo (implanta??o ou h?brido) sem contrato vigente | Categoria exige contrato e n?o h? vig?ncia |
| `produto_parado` | alto | Em produ??o, j? teve release, ?ltima h? mais de **12 meses** | ?ltima `data_release` > 12 meses |
| `sem_documentacao` | m?dio | Sem documenta??o (MD/anexo/link), exceto descontinuado | Nenhuma `ProductDocumentation` ativa |
| `doc_desatualizada` | m?dio | Documenta??o marcada `obsoleta` ou `necessita_atualizacao` | Status da doc |
| `tecnico_nao_referencia` | m?dio | RT informado n?o ? Refer?ncia T?cnica no TeamOps | `responsavel_tecnico_person_id` fora do cat?logo |
| `repositorio_sem_commits` | m?dio | Repo Azure sincronizado sem commit h? **6 meses** (s? se o sync est? OK) | `ultimo_commit` nulo ou > 6 meses |
| Contrato a vencer | alto/m?dio | Vig?ncia termina em **90 / 60 / 30** dias | `alerta_dias` do contrato (padr?o `[90,60,30]`) |
| `sem_contrato` (lista de contratos) | alto | Produto que exige contrato e n?o tem nenhum vigente | Mesma regra do alerta externo |

**?ndice de sa?de (n?o ? alerta pontual, ? nota cont?nua):** score 0–100. Classes: **saud?vel** ?75, **aten??o** ?40, **cr?tico** <40. Pesos e limiares s?o configur?veis por tenant.

Checks de sa?de (aplicam sobretudo em produ??o):

| Check | O que falha | Peso padr?o |
| :--- | :--- | ---: |
| `geral_completo` | Falta categoria, descri??o, repo, URL PRD, RT, stack ou PO (se n?o corporativo) | 20 |
| `servicos_cadastrados` | Zero servi?os ativos | 20 |
| `servicos_subprocesso` | Servi?o sem v?nculo a sub-processo e sem justificativa de indisponibilidade | 15 |
| `documentos_cadastrados` | Zero arquivos na aba Documentos | 10 |
| `contrato_vigente` | Externo implanta??o/h?brido sem contrato | 20 |
| `documentacao` | Sem documenta??o de produto | 15 |
| `sustentacao_sla` | Sem canal / SLA de sustenta??o | 10 |
| `referencia_tecnica` | Sem RT v?lida | 15 |
| `repositorio_ativo` | Interno/h?brido sem repo sincronizando (s? depois que o Azure j? coletou) | 10 |

### 2.2 Propostas — o que mais vale alerta (ainda n?o ? regra autom?tica)

Prioridade de implementa??o sugerida. Limiares em **dias/per?odos** s?o ponto de partida para calibrar com a amostra de dados.

#### A. Governan?a de pessoas e cadastro

| C?digo proposto | N?vel | Situa??o | Gatilho sugerido |
| :--- | :--- | :--- | :--- |
| `sem_po` | alto | Produto n?o corporativo sem PO | `corporativo = false` e `responsavel_person_id` vazio |
| `corporativo_servico_sem_po` | alto | Produto corporativo com servi?o ativo sem respons?vel | `corporativo = true` e servi?o ativo sem `responsavel_person_id` |
| `sem_dono_negocio` | m?dio | Cr?tico/alto sem dono de neg?cio | `criticidade ? {alta, critica}` e `dono_negocio_person_id` vazio |
| `sem_area` | m?dio | Sem ?rea TeamOps | `area_id` nulo |
| `sem_unidade` | baixo | Sem unidade (SESI/SENAI/IEL/FIEA/Corporativo) | `unidade` nulo |

#### B. “Sumiu do radar” (atualiza??o)

| C?digo proposto | N?vel | Situa??o | Gatilho sugerido |
| :--- | :--- | :--- | :--- |
| `sem_atualizacao_cadastro` | m?dio | Ficha parada | `updated_at` > **90 dias** e `lifecycle = producao` |
| `sem_release_em_andamento` | m?dio | Em desenvolvimento / evolu??o sem release ativa | `status_produto ? {desenvolvimento, evolucao}` e nenhuma release `em_desenvolvimento` / `em_homologacao` h? **45 dias** |
| `homologacao_parada` | alto | Em homologa??o sem avan?ar | `status_produto = homologacao` h? **30 dias** (usar `updated_at` ou data de entrada quando existir) |
| `implantacao_parada` | alto | Servi?o ou produto externo em implanta??o parado | Servi?o `status_servico = em_implantacao` h? **Z = 30 dias**, ou card de projeto `card_classification = implantacao` sem movimento de etapa no mesmo prazo |
| `suspenso_esquecido` | m?dio | Suspenso sem decis?o | `status_produto = suspenso` h? **120 dias** |

#### C. Valor e indicadores (cruzar com o m?dulo Indicadores / RTD)

| C?digo proposto | N?vel | Situa??o | Gatilho sugerido |
| :--- | :--- | :--- | :--- |
| `sem_indicador` | m?dio | Produto em produ??o que n?o aparece em nenhuma evid?ncia de KPI `fonte=portfolio` e n?o tem indicador manual ligado ? ?rea | Em produ??o h? **? 60 dias** e 0 evid?ncias no ano |
| `meta_nao_batida` | alto | Meta institucional ligada ao produto/?rea n?o atingida | Acompanhamento `status = nao_atingido` em **Y = 2 per?odos consecutivos** (m?s ou compet?ncia da RTD) |
| `meta_em_atencao` | m?dio | Um per?odo em aten??o | 1 per?odo `em_atencao` |
| `rtd_sem_causa` | alto | Na RTD, n?o atingido sem causa / plano de revers?o | Regra j? pedida na UI da RTD; falta alerta no portf?lio |

#### D. Alinhamento estrat?gico e processo

| C?digo proposto | N?vel | Situa??o | Gatilho sugerido |
| :--- | :--- | :--- | :--- |
| `servico_sem_subprocesso` | alto | Servi?o ativo ?rf?o de processo | Sem `ProcessServiceLink` e sem `sem_subprocesso_disponivel` + justificativa. J? derruba o check de sa?de; falta **alerta list?vel** por servi?o |
| `sem_vinculo_projeto` | baixo | Em desenvolvimento/implanta??o sem card de projeto | `lifecycle ? {concepcao, desenvolvimento}` ou `status_produto ? {desenvolvimento, homologacao}` e nenhum `project_tasks.linked_product_id` / `origin_task_id` |
| `projeto_entregue_sem_produto` | m?dio | Projeto finalizado n?o promovido ao portf?lio | J? existe lista `finalized-projects` / `already_promoted` — falta alerta na Intelig?ncia |
| `sem_pilar_estrategico` | m?dio | Melhoria/projeto do produto sem classifica??o Impacto ª Esfor?o / pilar | Card vinculado ao produto sem `PriorityScore` ao sair do backlog de Prospectar |

#### E. Risco e opera??o

| C?digo proposto | N?vel | Situa??o | Gatilho sugerido |
| :--- | :--- | :--- | :--- |
| `critico_saude_baixa` | alto | Produto cr?tico com sa?de cr?tica | `criticidade = critica` e classe de sa?de `critico` |
| `dados_pessoais_sem_doc` | alto | Documento com dados pessoais e documenta??o do produto inexistente/obsoleta | `dados_pessoais = true` + (`sem_documentacao` ou `doc_desatualizada`) |
| `contrato_vencido` | alto | Vig?ncia j? passou e status ainda “vigente” / produto ainda em produ??o | `vigencia_fim < hoje` |
| `lgpd_sem_classificacao` | m?dio | Produto em produ??o sem classifica??o de informa??o / n?vel de dados | Campos de classifica??o vazios quando existirem no cadastro |

### 2.3 Exemplos no vocabul?rio do pedido original

| Pedido | Tradu??o para o portf?lio AgileFlow |
| :--- | :--- |
| Produto sem indicador definido | `sem_indicador` — KPI institucional (`indicadores`) ou evid?ncia `fonte=portfolio` no ano |
| Sem atualiza??o h? X dias | `sem_atualizacao_cadastro` (X=90) **e/ou** `produto_parado` (releases) **e/ou** `repositorio_sem_commits` |
| Meta n?o batida em Y per?odos | `meta_nao_batida` (Y=2) via `IndicadorAcompanhamento` |
| Implanta??o parada h? Z dias | `implantacao_parada` / `homologacao_parada` (Z=30) |
| Sem v?nculo a programa/projeto estrat?gico | `sem_vinculo_projeto` + `projeto_entregue_sem_produto` + servi?o sem sub-processo |

---

## 3. N?vel de vis?o dos alertas

**Resposta: todos os recortes, com um padr?o de abertura.**

N?o escolher s? um eixo. A mesma pend?ncia precisa aparecer:

1. **Portf?lio inteiro** — PMO / coordena??o de TI / RTD (contagem + top N).
2. **Unidade** — SESI, SENAI, IEL, FIEA, Corporativo. ? o recorte pol?tico e or?ament?rio do Sistema FIEA.
3. **?rea / setor** — `area_id` TeamOps (setor = ?rea pai). ? o recorte de quem opera o produto.
4. **Categoria / tipo** — interno vs externo, IA vs implanta??o vs DN. ? o recorte de risco (contrato, factory, given).

| Audi?ncia | Recorte padr?o | O que v? primeiro |
| :--- | :--- | :--- |
| RTD / diretoria | Unidade + classe de sa?de | Cr?ticos, metas n?o batidas, contratos a vencer |
| Gestor de ?rea | ?rea / setor | Sem PO, servi?os sem processo, docs atrasadas |
| Coordena??o de TI | Categoria + criticidade | Externo sem contrato, repo parado, implanta??o parada |
| PO / RT | Produto (ficha) | Alertas daquele item + gaps do ?ndice de sa?de |

**Produto corporativo:** o alerta sobe na unidade **Corporativo**, mas a a??o cai no **servi?o** (PO do servi?o), n?o num PO ?nico do produto.

**Filtros que a Intelig?ncia j? deveria expor em todo alerta:** unidade, ?rea, categoria, criticidade, lifecycle / `status_produto`, classe de sa?de, c?digo do alerta.

---

## 4. O que ? mais interessante incluir (al?m das 3 perguntas)

Ordem do que mais muda a gest?o, se for implementar pouco:

1. **Alertas list?veis a partir dos gaps de sa?de que hoje s? baixam a nota**  
   Servi?o sem sub-processo e cadastro geral incompleto j? quebram o score, mas n?o viram card de pend?ncia t?o vis?vel quanto `externo_sem_contrato`. ? o ganho mais barato.

2. **Cruzar portf?lio ª Indicadores ª RTD**  
   “Produto sem indicador” e “meta n?o batida 2 per?odos” ligam o invent?rio ? pauta da reuni?o. Sem isso, a Intelig?ncia fala de cadastro e a RTD fala de meta — duas verdades.

3. **Fechar projeto ? produto**  
   Lista de projetos finalizados n?o promovidos. Evita o buraco cl?ssico: entregou no kanban e o portf?lio continua sem o sistema.

4. **Dois eixos de status (`lifecycle` ª `status_produto`)**  
   Governar **um can?nico** para alerta (recomenda??o: `status_produto` para fase operacional; `lifecycle` s? como agrupamento grosso). Hoje v?rios alertas olham s? `lifecycle = producao` e ignoram `homologacao` / `suspenso` / `evolucao`.

5. **Matriz criticidade ª sa?de**  
   J? existe na Intelig?ncia. Vale regra expl?cita: *cr?tico + sa?de cr?tica = pauta obrigat?ria da RTD do m?s*.

6. **Implanta??o e homologa??o paradas**  
   O portf?lio hoje alerta “parado” s? depois de 12 meses sem *release*. O risco caro est? nos 30–45 dias de implanta??o/homologa??o travada — a? o dinheiro e o processo de neg?cio j? est?o comprometidos.

7. **Dados pessoais + documenta??o**  
   Poucos produtos, alto dano reputacional. Alerta curto e alto.

O que **n?o** vale a pena no primeiro corte: alerta por stack desatualizada, NPS/chamados (ainda n?o h? fonte no produto — ver roadmap da RTD), e “sem programa estrat?gico” como campo obrigat?rio no produto (o v?nculo real hoje ? projeto/processo, n?o um FK de programa no cadastro).

---

## 5. Regras de cadastro (o que o portf?lio considera “completo”)

### 5.1 Produto

Campos que a governan?a trata como estruturantes:

- Identidade: nome, sigla, descri??o, categoria, unidade, origem, criticidade  
- Fase: `lifecycle` e `status_produto`  
- Dono: ?rea, PO (ou PO no servi?o se corporativo), RT, dono de neg?cio (cr?ticos)  
- Opera??o: URL PRD, stacks, reposit?rio (interno/h?brido), ambientes  
- Valor: servi?os ativos + v?nculo a sub-processo (ou justificativa)  
- Risco: contrato vigente se categoria exigir; sustenta??o/SLA em produ??o; documenta??o  
- Origem: `origin_task_id` quando nasceu de projeto finalizado  

### 5.2 Servi?o

- Nome, status (`ativo` / `em_implantacao` / `suspenso` / `descontinuado`)  
- Ano de refer?ncia / data de publica??o (alimenta KPI `servicos_publicados`)  
- PO do servi?o se o produto for corporativo  
- Pelo menos um sub-processo do portf?lio versionado, **ou** `sem_subprocesso_disponivel` + justificativa  

### 5.3 Contrato (externo implanta??o / h?brido)

- Vig?ncia, status, alerta 90/60/30, gestor/fiscal  
- Sem vig?ncia = produto n?o “passa” no check `contrato_vigente`  

### 5.4 Portf?lio de processos (lado do valor)

Sub-processo sem servi?o vinculado n?o ? alerta de *produto*, ? alerta de **processo digital**. O KPI `processos_digitais` mede % de sub-processos com ?1 servi?o. Vale um recorte irm?o (n?o misturar na mesma lista de produto): *sub-processo em andamento / conclu?do sem servi?o*.

---

## 6. Quem age em cada alerta

| Tipo de alerta | Primeiro respons?vel | Escalada |
| :--- | :--- | :--- |
| Sem PO / cadastro incompleto | ?rea do produto | Coordena??o de TI |
| Sem sub-processo | PO + analista de processo (`dono` / `analista` do item) | Gestor da ?rea |
| Contrato / vencimento | Gestor do contrato + PO | Jur?dico / compras |
| Repo / releases / homologa??o parada | RT + time de desenvolvimento | Coordena??o de TI |
| Meta n?o batida / sem indicador | Dono de neg?cio + PO | RTD |
| Projeto entregue sem produto | PMO | Coordena??o de TI |
| Dados pessoais + doc | PO + RT | Encarregado / governan?a de dados |

---

## 7. Amostra de dados para traduzir em l?gica (pr?ximo passo)

Para calibrar X / Y / Z e implementar os alertas **proposta**, exportar (Excel/CSV ou API) pelo menos:

### Produto

`id`, `name`, `unidade`, `categoria`, `lifecycle`, `status_produto`, `criticidade`, `corporativo`, `area_id` / ?rea / setor, `responsavel_person_id`, `responsavel_tecnico_person_id`, `dono_negocio_person_id`, `origin_task_id`, `updated_at`, `data_entrada_producao`, `is_active`

### Servi?o

`id`, `product_id`, `name`, `status_servico`, `data_publicacao`, `ano_referencia`, `responsavel_person_id`, quantidade de `ProcessServiceLink`, `sem_subprocesso_disponivel`

### Contrato

`product_id`, `status`, `vigencia_inicio`, `vigencia_fim`, `alerta_dias`

### Release / reposit?rio

`product_id`, ?ltima `data_release`, `status` da release; `ultimo_commit`, flag de sync Azure

### Sa?de / alertas atuais (j? calculados)

`score`, `classe`, `saude_gaps[]`, `alertas[].code`

### Indicadores / RTD

Por per?odo: `indicador_id`, `fonte`, `fonte_metrica`, `product_id` (evid?ncia), `meta`, `realizado`, `status` (`atingido` / `em_atencao` / `nao_atingido`)

### Projetos

`task_id`, `linked_product_id`, `origin_task_id`, `card_classification`, `status` / funil, `updated_at`, `planning_kind`

Com isso d? para virar cada linha da se??o 2.2 em predicado SQL/servi?o, sem inventar campo novo — s? limiar e recorte.

---

## 8. Mapa r?pido no sistema

| Onde | O que |
| :--- | :--- |
| Produtos ? lista / detalhe | Cadastro, servi?os, docs, releases, contratos, gaps de sa?de |
| Produtos ? Intelig?ncia | Distribui??o saud?vel/aten??o/cr?tico, matriz criticidade ª sa?de, pend?ncias, parados, d?vida de doc |
| Produtos ? Indicadores | Contagens anuais de servi?os / documentos / processos automatizados |
| Produtos ? Portf?lio de processos | ?rvore macro ? processo ? sub + servi?os vinculados |
| Produtos ? Config | Pesos e limiares do ?ndice de sa?de |
| Indicadores + RTD | Meta institucional e pauta de revers?o |
| Processos (kanban) | Classifica??o `linked_product_id` e promo??o projeto ? produto |

---

## Hist?rico

| Data | Nota |
| :--- | :--- |
| 2026-09-09 | Primeira vers?o: objetivos, alertas atuais ª propostos, recortes de vis?o e amostra de dados |
