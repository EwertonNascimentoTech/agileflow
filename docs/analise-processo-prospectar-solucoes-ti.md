# Análise de aderência — Processo "Prospectar Soluções de TI" × AgileFlow

**Processo analisado:** `02. Processo De Gerenciar Prospecção E Desenvolvimento De Soluções De TI / 05. Prospectar Soluções de TI`  
**Fontes:** PDF `Prospectar Soluções de TI.pdf` (diagnóstico + To Be), BPMN (`.png` / `.bpm`), `Documento de Mapeamento - Prospectar Soluções de TI.xlsx`  
**Ferramenta avaliada:** AgileFlow — módulos Projetos, Indicadores, Produtos, TeamOps, RTD, Docs  
**Data da reavaliação:** 30/07/2026  
**Contexto novo desde a 1ª análise:** kanban **Contratar**, classificação com “Será contratado?”, trava da origem e contrato no Produto.

---

## 1. O processo em uma tela (To Be do PDF)

Raia **Product Owner – TI**:

```
SB01 Administrar Mapeamento e Implantação de Processos
  └─ T01 Prospectar Soluções no Mercado
       └─ CE01 Existe ferramenta no mercado? ──não──► SB02 Desenvolver Soluções de TI
            └─ T02 Levantar Requisitos de Aderência
                 └─ T03 Apresentar Soluções para a Diretoria
                      └─ CE02 Decisão da Diretoria ──desenvolver──► SB02
                           └─ T04 Elaborar TSC
                                └─ CE02 TSC aprovado? ──não──► Aguardando correção ⟲
                                     └─ T05 Realizar PoC (+ SI)
                                          └─ CE02 Ferramenta atende? ──sim──► contratação / implantação
```

Raia **Analista Administrativo**:

```
T06 Realizar requisição de Suprimentos (Orquestra)
  └─ EP01 Suprimentos
       ├─ SB04 Implantar Soluções de TI de Mercado
       └─ SB05 Administrar Aquisição…
```

**Problemas citados no PDF:** falta de requisitos na escolha; controle fraco de PoC; integração deficiente Prospecção ↔ Desenvolvimento; desalinhamento estratégico; monitoramento frágil do cronograma da PoC.

**Documentos do subprocesso:** Relatório de Pesquisa de Mercado, Análise de Aderência, TSC, Relatório de PoC.

---

## 2. Como o AgileFlow modela isso HOJE (processo TD)

| Kanban | Etapas (ordem) | Papel no processo MSN |
|---|---|---|
| **Prospectar Soluções** | Backlog → Ajustes → Classificação → Avaliar Classificação → Contratação → Impedimento → Rejeitado → Concluído → Cancelado | Núcleo do subprocesso 05 + gate comprar/desenvolver |
| **Contratar** *(novo)* | Backlog → Prospectar → Análise de aderência → Proposta → Negociação → Concluído \| Cancelado | T01–T04 + caminho até contratação (parcial) |
| **Projetos e Programas** | Backlog → … → Em Desenvolvimento → … → Concluído (+ Contratação / Cancelado) | Destino quando CE01/CE02 = desenvolver (SB02) e execução |

**Bifurcação nativa:** na classificação (`implantacao` / `melhoria`) + produto `sistema_externo_*` + “Será contratado? = Sim” → origem travada na raia **Contratação** e nasce card no kanban **Contratar**.

---

## 3. Veredito resumido (reavaliação)

| # | Atividade / artefato | Situação | Onde vive hoje |
|---|---|---|---|
| SB01 | Entrada via mapeamento de processo | 🟡 Parcial | Produtos › Processos + Docs (BPMN). Gatilho do card ainda manual |
| T01 | Prospectar soluções no mercado | 🟡 Parcial | Etapas em Prospectar **e** etapa “Prospectar” no kanban Contratar. **Ainda sem entidade “solução candidata”** (N ferramentas = N cards soltos ou campos repetidos) |
| CE01 | Existe ferramenta? → Desenvolver | 🟡 Parcial | Classificação + conversão Prospectar → Projetos/Programas. Desvio **não automático** |
| T02 | Requisitos de aderência | 🟡 Parcial ↑ | Etapa **Análise de aderência** no Contratar + formulário/anexo. **% ponderado ainda não existe** (Plano de Ação nº 3 do PDF) |
| T03 | Apresentar à Diretoria | 🟢 Atende | RTD (reunião + deliberações) |
| CE02 | Decisão da Diretoria | 🟢 Atende | RTD › Deliberação |
| T04 | Elaborar TSC + aprovação | 🟡 Parcial | Etapas Proposta / Negociação + anexos. **Sem alçadas formais** |
| T05 | PoC — cronograma | 🟢 Atende | Cronograma + baseline + SLA por etapa |
| T05 | PoC — Segurança da Informação | 🔴 Não atende | Conceitos SI só em Produtos (pós-cadastro) |
| T06 | Requisição Suprimentos / Orquestra | 🔴 Não atende | Fora do produto |
| Contratação | Fechar compra e registrar contrato | 🟢 Atende ↑ | Kanban **Contratar** → Concluído anexa **Contrato** no Produto e libera a origem |
| Cancelamento | Perdeu a contratação | 🟢 Atende ↑ | Contratar → Cancelado + origem → raia Cancelado |
| — | Indicadores do PDF | 🟡 Parcial | Cadastro ok; medição automática parcial (`status_entered_at`, baseline) |
| — | Riscos | 🔴 Não atende | Por design no EPA |
| — | Templates / Wiki (PoC, docs) | 🟡 Parcial | Docs somente leitura |

**Contagem (reavaliação):** 5 atende · 7 parcial · 3 não atende · (aquisição SB04/05 continua fora de escopo operacional).

**O que mudou vs. análise anterior:** o bloco **Contratar** elevou T02/T04/contratação de “só etapa genérica” para um funil dedicado com gates (proposta+valor; fornecedor+contrato) e efeito na origem — ainda sem matriz % e sem Orquestra.

---

## 4. Detalhamento

### 4.1 O que já atende bem

**T03/CE02 — Diretoria.** RTD cobre a cerimônia e o rastro da decisão.

**T05 — Cronograma da PoC.** Baseline, dependências, caminho crítico e trava continuam o ponto mais forte frente à dor do PDF (“monitoramento inexistente”).

**Contratação (novo).** O fluxo Backlog → … → Negociação → Concluído/Cancelado materializa o desfecho comprar/não comprar com lock da origem e registro do contrato no portfólio de Produtos.

### 4.2 Onde ainda é parcial

**T01 — N candidatos.** Continua faltando o tipo filho “Solução candidata” (mesmo padrão Feature→US) para medir o controle “nº médio de soluções prospectadas (meta 3)”.

**CE01 — Comprar vs desenvolver.** Classificação + kanbans permitem o desvio; automações atuais não abrem sozinhas o card em Desenvolver/Projetos.

**T02 — % de aderência.** Há etapa e anexos; não há scoring ponderado com percentual (a Matriz de Priorização é Impacto×Esforço, outro semântica).

**T04 — TSC.** Anexo + etapas bastam para o documento; falta alçada (impacto financeiro → suprimentos/jurídico).

### 4.3 O que não atende

- Checklist SI na PoC  
- Integração Orquestra (T06)  
- Riscos no produto (EPA)

---

## 5. De-para rápido: PDF → kanbans atuais

| Passo To Be (PDF) | AgileFlow hoje |
|---|---|
| Prospectar no mercado | Prospectar (Classificação…) **ou** Contratar › Prospectar |
| Levantar aderência | Contratar › Análise de aderência |
| Apresentar / decidir | RTD + Avaliar Classificação |
| Elaborar TSC / negociar | Contratar › Proposta → Negociação |
| PoC | Cronograma no card de planejamento / projeto |
| Contratar / implantar | Contratar › Concluído (+ Produto.Contrato); implantação = outro subprocesso |
| Desenvolver interno | Prospectar › Concluído → Projetos e Programas (+ Features/US) |

---

## 6. Lacunas prioritárias (código / produto)

1. Tipo **Solução candidata** (filho da Prospecção) + métrica de contagem  
2. Motor de **% de aderência** (ou adaptação da Matriz de Priorização)  
3. **Alçadas** de aprovação do TSC  
4. Checklist **SI** na PoC  
5. Integração **Orquestra** (fora do escopo curto)

---

## 7. Conclusão

O subprocesso 05 está **bem melhor coberto** após o kanban Contratar e a trava por classificação. O núcleo “pesquisar → aderir → propor → negociar → contratar/cancelar” já tem casa no AgileFlow. O que o PDF ainda exige e a ferramenta não fecha: **comparação estruturada de N soluções**, **% de aderência**, **aprovação formal** e **Orquestra**.
