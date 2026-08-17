# De-para nível tarefa — "Prospectar Soluções de TI" × AgileFlow

Companheiro de [analise-processo-prospectar-solucoes-ti.md](analise-processo-prospectar-solucoes-ti.md).  
**Reavaliação:** 30/07/2026 — inclui kanban **Contratar** e etapas reais do processo TD.

Legenda: 🟢 configurar · 🟡 adaptar · 🔴 desenvolver · ⚪ fora de escopo

---

## 1. Modelo atual (já implantado) + modelo proposto

### Já existe no processo TD

```
Kanban Prospectar Soluções
  Backlog → Ajustes → Classificação → Avaliar Classificação
       → Contratação (hold) | Impedimento | Rejeitado | Concluído | Cancelado

Kanban Contratar  (is_procurement)
  Backlog → Prospectar → Análise de aderência → Proposta → Negociação
       → Concluído (contrato no Produto + libera origem)
       → Cancelado (origem → Cancelado)
```

Gatilho: classificação `implantacao|melhoria` + produto `sistema_externo_*` + `procurement_required=true`.

### Ainda proposto (sem código)

```
Tipo "Prospecção"  → card-raiz
  └─ allowed_child: "Solução candidata"  → 1 filho por ferramenta
```

---

## 2. De-para das atividades (BPMN / PDF)

| # | Atividade | Responsável | AgileFlow — objeto concreto | |
|---|---|---|---|---|
| SB01 | Administrar mapeamento de processos | Gestão por Processos | Produtos › Processos + Docs. Card de prospecção manual | 🟡 |
| T01 | Prospectar soluções no mercado | PO – TI | Contratar › **Prospectar** (+ anexos). Sem tipo “Solução candidata” | 🟡 |
| CE01 | Existe ferramenta? → SB02 | PO – TI | Classificação / Prospectar › Concluído → Projetos. Sem handoff automático | 🟡 |
| T02 | Levantar requisitos de aderência | PO – TI | Contratar › **Análise de aderência** + formulário/anexo. Sem % ponderado | 🟡 |
| T03 | Apresentar à Diretoria | PO – TI | **RTD** + etapa Avaliar Classificação | 🟢 |
| CE02 | Decisão da Diretoria | Diretoria | RTD › Deliberação | 🟢 |
| T04 | Elaborar TSC | PO – TI | Contratar › **Proposta** (anexo + valor obrigatórios p/ avançar) | 🟢 |
| CE02 | TSC aprovado? | Dir. / Suprimentos / Jurídico | Negociação / etapas. **Sem alçada** | 🔴 |
| — | Correção do TSC ⟲ | PO – TI | Voltar etapa no kanban (nativo) | 🟢 |
| T05 | PoC | PO – TI | Cronograma + baseline no card de planejamento | 🟢 |
| T05.1 | PoC — SI | PO / SI | Sem checklist na etapa | 🔴 |
| CE02 | Ferramenta atende? | PO – TI | Contratar › Concluído **ou** Cancelado | 🟢 |
| T06 | Requisição de Suprimentos | Analista Adm. | Sem Orquestra | 🔴 |
| SB04/05 | Implantar / adquirir | Analista Adm. | Fora. Resultado em Produtos › Contrato | ⚪ |

---

## 3. Artefatos

| Artefato (PDF) | AgileFlow | |
|---|---|---|
| Relatório de Pesquisa de Mercado | `file` / formulário na etapa Prospectar | 🟢 |
| Análise de Aderência | Etapa + anexo; **sem %** | 🟡 |
| TSC | Anexo na Proposta/Negociação | 🟢 |
| Relatório de PoC | `file` + cronograma; template ainda não publicado | 🟡 |
| Requisição de compra | Orquestra — sem par | 🔴 |
| Contrato / fornecedor | Produtos ao concluir Contratar | 🟢 |

---

## 4. Indicadores do PDF

| Indicador | Dado no AgileFlow? | Lacuna |
|---|---|---|
| Cumprimento do cronograma (PoC) | ✅ baseline + `completed_at` | Métrica PORTFOLIO filtrada |
| Aderência ao orçamento | ❌ | Orçamento planejado × realizado |
| Tempo médio pesquisa de mercado | ✅ `status_entered_at` | Agregar tempo em etapa |
| Tempo médio aprovação TSC | ✅ etapa Proposta/Negociação + SLA | Idem |
| Cobertura de requisitos (%) | ❌ | Depende do motor de % |
| Tempo médio análise de aderência | ✅ etapa Aderência | Agregar |
| Nº médio de soluções prospectadas | 🟡 | Precisa filhos “Solução candidata” |

---

## 5. Resumo

| | Atividades | Artefatos | Indicadores |
|---|---|---|---|
| 🟢 | 5 | 3 | — |
| 🟡 | 4 | 2 | 5 |
| 🔴 | 3 | 1 | 2 |

**Código ainda necessário:** alçadas TSC, checklist SI, Orquestra, entidade candidato + % de aderência.  
**Já destravado nesta entrega:** funil Contratar com gates e sincronismo da origem.
