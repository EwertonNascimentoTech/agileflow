# De-para nível tarefa — "Desenvolver Soluções de TI" × AgileFlow

Companheiro de [analise-processo-desenvolver-solucoes-ti.md](analise-processo-desenvolver-solucoes-ti.md).  
**Reavaliação:** 30/07/2026 — etapas reais de Projetos e Programas / Features / User Story.

Legenda: 🟢 configurar · 🟡 adaptar · 🔴 desenvolver · ⚪ fora / outro sistema

---

## 1. Modelo atual (processo TD)

```
Prospectar (entrada SB01)
  └─ Concluído → cria card em Projetos e Programas

Projetos e Programas (card-raiz planejamento)
  Backlog → Agendar Reunião → Conduzir Levantamento → Impedimento
       → Requisitos / Protótipo → Refinamento PO & Tech → Validar Escopo
       → Pronto para Desenvolvimento → Em Desenvolvimento
       → DevOps (HML) → Homologando (Cliente) → DEVSECOPS (PROD) → Concluído
       (+ Contratação / Cancelado se externo)

Features / User Story (execução)
  Feature: Backlog → Em Dev → Homologação (PO) → Ajustar → Concluído
  US: Backlog → Impedimento → Em Dev → Code Review → Homologação (PO) → Concluído
```

---

## 2. De-para das atividades (To Be do PDF)

| # | Atividade | Responsável | AgileFlow — objeto concreto | |
|---|---|---|---|---|
| SB01 | Prospectar (entrada) | PO – TI | Conversão Prospectar → Projetos. Sem auto-handoff | 🟡 |
| 2 | Design Sprint | PO – TI | Etapa Requisitos/Protótipo + `file`/`url`. Sem método orquestrado | 🔴 |
| 3 | Priorização e origem | Líder / PO | Matriz de Priorização + formulário | 🟢 |
| 4 | Abertura do Projeto | PO – TI | Etapas iniciais + anexos. Template Kick-off/plano = lacuna | 🟡 |
| 5 | Cadastrar na ferramenta | Líder | Projeto/Programa + membros + cronograma | 🟢 |
| 6–7 | Refinar / corrigir histórias | Dev + SM + PO | Features/US + retorno de etapa | 🟢 |
| 8 | Kick-off | PO + Líder | **RTD** + Agendar/Conduzir Reunião | 🟢 |
| 9–11 | Planejar / executar / review | Dev + SM | US + capacidade + checklist + Homologação (PO) | 🟢 |
| 12 | Status Report | PO – TI | Status Reports nativos | 🟢 |
| 13 | Corrigir desenvolvidas | Dev | Loop no board | 🟢 |
| 14–15 | Validar / aprimorar SI | Infra / DevSecOps | Etapa DEVSECOPS — **falta checklist/gate** | 🟡 |
| 15b | Homologar com cliente | PO – TI | Homologando (Cliente) — **sem alçada** | 🟡 |
| 16 | Capacitar usuários | PO – TI | Etapa + anexo Manual | 🟡 |
| 17 | Produção | PO + DevOps | Etapa PROD (rastro). Deploy = Azure | ⚪/🔴 |
| 18 | Reunião de entrega | Líder + PO | **RTD** | 🟢 |
| 19 | NPS | PO – TI | Sem módulo | 🔴 |
| — | Operação assistida / Service Desk | SD | Sem integração | 🔴 |

---

## 3. Artefatos (PDF / Plano de Ação)

| Artefato | AgileFlow | |
|---|---|---|
| Documento de requisitos | Formulário / `file` | 🟢 |
| Protótipo (Figma) | `url` + `file` | 🟢 |
| Cronograma | Cronograma nativo + baseline | 🟢 |
| Plano de comunicação / Kick-off | Anexo + RTD — **falta template** (ações 1–2) | 🟡 |
| Status Report | Módulo nativo — template institucional (ação 3) pendente | 🟡 |
| Relatório de métricas | Indicadores + Status Report (ação 4) | 🟡 |
| Relatório de homologação | `file` na etapa | 🟢 |
| Manual do usuário | `file` / Docs | 🟡 |
| NPS / feedback | — | 🔴 |
| Pipeline deploy | Azure DevOps (ação 5) | ⚪ |

---

## 4. Plano de ação do PDF × status

| # | Ação (PDF) | Status na ferramenta |
|---|---|---|
| 1 | Modelo Design Sprint | 🔴 Não publicado |
| 2 | Modelo Kick-off | 🔴 Não publicado |
| 3 | Modelo Status Report | 🟡 Editor existe; modelo institucional não |
| 4 | Relatório de métricas | 🟡 Dados parciais; modelo não |
| 5 | Esteira Azure DevOps | ⚪ Fora do AgileFlow |
| 6 | Bastão com Marketing | ⚪ Processo / RTD pontual |
| 7 | Matriz RACI de TI | 🔴 Não há objeto RACI |

---

## 5. Indicadores (leitura)

Lead time por etapa, cumprimento de cronograma e desvio vs baseline **já são graváveis** no AgileFlow. O PDF ainda cita Azure DevOps / planilha como fonte — a oportunidade é aposentar planilha com métricas PORTFOLIO filtradas pelo tipo/funil de desenvolvimento.

---

## 6. Resumo

| | Atividades | Artefatos | Ações do plano |
|---|---|---|---|
| 🟢 | 8 | 4 | — |
| 🟡 | 5 | 4 | 2 |
| 🔴 | 3 | 1 | 3 |
| ⚪ | 1 | 1 | 2 |

**Conclusão do de-para:** configurar e operar o que já existe em Projetos/Features/US/RTD cobre a maior parte do To Be de execução. O que exige produto novo ou outro sistema: Design Sprint, SI formal, NPS, Service Desk, RACI e pipeline Azure.
