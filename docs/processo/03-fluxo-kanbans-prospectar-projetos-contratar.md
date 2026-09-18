# Fluxo BPMN — Prospectar → Projetos → Features → US → Contratar

Visão das **etapas reais** dos cinco kanbans do processo TD, com bifurcações de classificação, contratação e rollup Feature/US.

| Artefacto | Descrição |
| :--- | :--- |
| [03-fluxo-kanbans-prospectar-projetos-contratar-bpmn.xml](03-fluxo-kanbans-prospectar-projetos-contratar-bpmn.xml) | BPMN 2.0 (5 pools) — abrir em Documentação ou [demo.bpmn.io](https://demo.bpmn.io) |

## Ordem do fluxo

1. **Prospectar Soluções** — entrada da demanda; classifica (Desenvolvimento / Implantação / Melhoria).
2. **Contratar** (lateral) — se produto sistema externo e “Será contratado? = Sim”: origem fica na raia Contratação (travada) e nasce card neste kanban.
3. **Projetos e Programas** — conversão no Concluído da prospecção (Projeto ou Programa).
4. **Features** — a partir de Pronto para Desenvolvimento / Em Desenvolvimento (criar ou importar planilha).
5. **User Story** — filhas da Feature; rollup de conclusão devolve a Feature para Homologação (PO).

## Bifurcações principais

1. **Classificar** (saída do Backlog em Prospectar): Desenvolvimento | Implantação | Melhoria
2. **Produto sistema externo?** — se sim, **Será contratado?**
3. **Sim** — origem vai para raia **Contratação** (travada) + nasce card no kanban **Contratar**
4. **Avaliar Classificação**: Ajustes | Impedimento | Rejeitado | Aprovado → Concluído (converte p/ Projetos)
5. **Contratar / Negociação**: Ganhou (contrato no Produto + libera origem) | Perdeu (origem → Cancelado)
6. **Projetos**: Impedimento, escopo, homologação (loops de retorno); **Pausado** existe como raia operacional
7. **Feature**: Homologação (PO) → Ajustar (volta a Em Dev) ou Concluído
8. **US**: Impedimento; Homologação (PO) pode devolver a Em Desenvolvimento

## Etapas por kanban (ordem atual no tenant)

**Prospectar Soluções:** Backlog → Ajustes → Classificação → Avaliar Classificação → Contratação → Impedimento → Rejeitado → Concluído → Cancelado

**Projetos e Programas:** Backlog → Contratação → Agendar Reunião → Conduzir Reunião de Levantamento → Impedimento → Pausado → Requisitos / Protótipo → Refinamento PO & Tech → Validar Escopo (Cliente) → Pronto para Desenvolvimento → Em Desenvolvimento → DevOps (HML) → Homologando (Cliente) → DEVSECOPS (PROD) → Concluído → Cancelado

**Features:** Backlog → Em Desenvolvimento → Homologação (PO) → Ajustar → Concluído

**User Story:** Backlog → Impedimento → Em Desenvolvimento → Code Review → Homologação (PO) → Concluído

**Contratar:** Backlog → Prospectar → Análise de aderência → Proposta → Negociação → Concluído | Cancelado
