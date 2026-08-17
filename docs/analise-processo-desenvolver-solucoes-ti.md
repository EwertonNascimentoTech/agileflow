# Análise de aderência — Processo "Desenvolver Soluções de TI" × AgileFlow

**Processo analisado:** `02. Processo De Gerenciar Prospecção E Desenvolvimento De Soluções De TI / 02. Desenvolver Soluções de TI`  
**Fontes:** PDF `Desenvolver Soluções de TI.pdf` (diagnóstico + To Be 1/3–3/3), BPMN, `Documento de Mapeamento - Desenvolver Soluções de TI.xlsx`  
**Ferramenta avaliada:** AgileFlow — Projetos, Indicadores, Produtos, TeamOps, RTD, Docs  
**Data da reavaliação:** 30/07/2026  
**Método:** mesma estrutura de [`analise-processo-prospectar-solucoes-ti.md`](analise-processo-prospectar-solucoes-ti.md)

---

## 1. O processo em uma tela (To Be do PDF)

Entrada típica: **SB01 Prospectar Soluções de TI** (decisão = desenvolver) ou demanda já encaminhada.

```
SB01 Prospectar (entrada)
  └─ Design Sprint (protótipo)
       └─ Avaliar priorização e origem
            └─ Abertura do Projeto (+ plano de comunicação)
                 └─ Cadastrar na ferramenta de gestão
                      └─ Kick-off / reunião de inicialização
                           └─ ciclo de sprint:
                                Refinar ↔ Corrigir histórias
                                Planejar Sprint → Executar → Review ↔ Corrigir
                                Status Report
                           └─ Validação de Segurança ↔ Aprimorar SI
                                └─ Homologar com o cliente ↔ Corrigir
                                     └─ Capacitar usuários
                                          └─ Disponibilizar em produção
                                               └─ Reunião de entrega
                                                    └─ Pesquisa de satisfação (NPS)
                                                         └─ Operação assistida / Service Desk
```

**Raias no PDF:** Product Owner – TI · Líder de Projetos · Desenvolvedores & SM · Infra/DevSecOps · (DevOps / Service Desk no fim).

**Problemas / objetivos do PDF:** ferramenta de gestão atualizada para indicadores; Discovery claro; fluxo simples com processos mapeados; stakeholders informados; alinhamento Processo × Projeto; esteira Azure DevOps (Plano de Ação nº 5).

---

## 2. Como o AgileFlow modela isso HOJE (processo TD)

| Kanban | Etapas (resumo) | Papel no MSN 02 |
|---|---|---|
| **Prospectar Soluções** | … → Concluído (converte) | Entrada SB01 quando veio da prospecção |
| **Projetos e Programas** | Backlog → Agendar Reunião → Levantamento → Impedimento → Requisitos/Protótipo → Refinamento PO & Tech → Validar Escopo → Pronto p/ Dev → Em Desenvolvimento → DevOps (HML) → Homologando → DEVSECOPS (PROD) → Concluído | Espinha dorsal do To Be (abertura → go-live) |
| **Features** | Backlog → Em Dev → Homologação (PO) → Ajustar → Concluído | Incremento / épicos |
| **User Story** | Backlog → Impedimento → Em Dev → Code Review → Homologação (PO) → Concluído | Histórias do ciclo de sprint |
| **Contratar** | (se produto externo no meio do caminho) | Bifurcação lateral — não é o núcleo do 02 |

---

## 3. Veredito resumido (reavaliação)

| # | Atividade / artefato (To Be) | Situação | Onde vive hoje |
|---|---|---|---|
| SB01 | Entrada via Prospecção | 🟡 Parcial | Conversão Prospectar → Projetos; sem handoff 100% automático |
| Design Sprint | Discovery / protótipo | 🔴 Não atende | Fora (Figma/Canva); só anexo/`url` na etapa Requisitos/Protótipo |
| Priorização e origem | Avaliar demanda | 🟢 Atende | Matriz de Priorização + formulário + Portfólio de Processos |
| Abertura / plano de comunicação | Kick-off prep | 🟡 Parcial | Etapas iniciais + Status Report; **template** (Plano nº 2) ainda não |
| Cadastrar na ferramenta | Portfólio do projeto | 🟢 Atende | Projetos/Programas + membros + cronograma |
| Refinar / corrigir histórias | T06–T07 / T13 | 🟢 Atende | Features/US + loops de etapa |
| Kick-off com Diretoria | Reunião de inicialização | 🟢 Atende | RTD |
| Planejar / executar / review | Ciclo de sprint | 🟢 Atende | US + capacidade + checklist + % |
| Status Report | Comunicação contínua | 🟢 Atende | `ProjectStatusReport` |
| Validar / aprimorar SI | DevSecOps | 🟡 Parcial ↑ | Etapa **DEVSECOPS (PROD)** existe; **sem checklist/gate RN formal** |
| Homologação cliente | Aceite | 🟡 Parcial | Etapa Homologando (Cliente) + anexo; sem alçada formal |
| Capacitar usuários | Treinamento | 🟡 Parcial | Etapa + anexo; sem turma/presença |
| Deploy produção | Go-live técnico | 🔴 Não atende | Rastro na etapa; deploy = Azure DevOps (Plano nº 5) |
| Reunião de entrega | Encerramento | 🟢 Atende | RTD + anexos |
| NPS / satisfação | Pesquisa | 🔴 Não atende | Sem módulo |
| Sustentação / Service Desk | Passagem de bastão | 🔴 Não atende | Sem integração |
| Cronograma / baseline | Acompanhamento | 🟢 Atende | Ponto mais forte vs. dor do As Is |
| Indicadores | PORTFOLIO | 🟡 Parcial | Cadastro ok; fonte ainda misturada com Azure/planilha |
| Templates / Wiki | Modelos do Plano de Ação | 🟡 Parcial | Docs read-only |
| Riscos | Aba do mapeamento | 🔴 Não atende | EPA (e conteúdo da aba no Excel segue genérico) |

**Contagem:** ~8 atende · ~7 parcial · ~5 não atende.

**O que mudou vs. 1ª análise:** o kanban **Projetos e Programas** do TD já espelha quase linha a linha o To Be 2/3–3/3 (levantamento → refinamento → HML → PROD). Features/US cobrem o ciclo de sprint. A lacuna continua em Discovery, SI formal, deploy, NPS e Service Desk — não no “miolo” de gestão do projeto.

---

## 4. Detalhamento

### 4.1 O que já atende bem

**Delivery (priorização → US → review → status report).** É o desenho central do módulo Processos. O PDF pede ferramenta atualizada para indicadores e foco do time — Gantt, baseline, SLA e capacidade endereçam a dor de acompanhamento.

**Cerimônias (kick-off e entrega).** RTD com deliberações tipadas.

**Alinhamento Processo × Projeto.** Vínculo a Portfólio de Processos + classificação (desenvolvimento/implantação/melhoria) + produto/release.

### 4.2 Parcial

**SB01.** Conversão na conclusão da prospecção existe; ainda depende de operação humana para o encaminhamento “desenvolver”.

**Plano de comunicação / templates** (ações 1–4 do PDF). Status Report existe; modelos padronizados de Design Sprint, Kick-off e métricas ainda não publicados no Docs.

**SI e homologação.** Há etapas DEVSECOPS e Homologando; faltam checklist obrigatório e aceite com alçada.

**Indicadores.** Dados de lead time e cronograma já nascem no AgileFlow; falta recorte oficial PORTFOLIO para este subprocesso.

### 4.3 Não atende

- Design Sprint como método (só artefatos anexos)  
- Pipeline Azure DevOps (explicitamente fora — Plano nº 5)  
- NPS  
- Service Desk / operação assistida  
- Riscos no produto  

---

## 5. De-para rápido: PDF → kanbans atuais

| Passo To Be (PDF) | AgileFlow hoje |
|---|---|
| Entrada Prospecção | Prospectar › Concluído → card em Projetos |
| Design Sprint / protótipo | Projetos › Requisitos / Protótipo (+ `file`/`url`) |
| Priorização | Matriz + etapa inicial |
| Abertura / cadastro | Card Projeto/Programa + cronograma |
| Kick-off | RTD + Agendar/Conduzir Reunião |
| Refinamento / execução | Refinamento PO & Tech → Features/US |
| Status Report | Módulo Status Report |
| Segurança | DEVSECOPS (PROD) |
| Homologação | Homologando (Cliente) |
| Produção | Etapa final (deploy externo) |
| Entrega / NPS | RTD / — |

---

## 6. Lacunas prioritárias

1. Templates do Plano de Ação (Kick-off, Status Report, métricas, Design Sprint) no Docs  
2. Checklist SI + gate antes de PROD  
3. Aceite formal de homologação  
4. NPS / pesquisa de satisfação  
5. Integração ou rito claro com Azure DevOps + Service Desk  
6. Handoff automático Prospectar → Desenvolver quando CE = desenvolver  

---

## 7. Conclusão

O subprocesso **Desenvolver** é o que o AgileFlow melhor cobre hoje: o kanban **Projetos e Programas** + **Features/US** implementam o To Be de execução. O PDF ainda cobra Discovery estruturado, segurança/homologação formais, deploy automatizado, NPS e sustentação — itens conscientes fora do núcleo de gestão de demanda/projeto.
