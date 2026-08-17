# Ficha de processo — Ciclo Solicitação → Entrega (AgileFlow)

## 1. Identificação

| Campo | Valor |
| :--- | :--- |
| Nome | Ciclo de solicitação / demanda até entrega |
| Sistema | AgileFlow (Kore 2.0) |
| Módulo principal | Processos (`projetos`) |
| Módulos de apoio | TeamOps, Indicadores, RTD, Produtos (opcionais) |
| Versão documental | 2026-07-28 |
| Origem | Reverse engineering do código + `docs/fluxo-projeto.md` |

## 2. Objetivo

Padronizar o caminho desde o pedido de um colaborador até a conclusão do trabalho no kanban, com rastreabilidade entre demanda de origem e item de planejamento (projeto ou programa), priorização configurável e gates de cronograma/SLA.

## 3. Escopo

**Inclui:** abertura de solicitação, triagem, priorização Impacto × Esforço, conversão em projeto/programa, planejamento de datas, execução, entrega e sincronização opcional da origem; apoio opcional de RTD.

**Não inclui (neste processo):** onboarding Super Admin de tenants (processo de plataforma); CRM/estoque/PDV (módulos desativados no produto atual).

## 4. Atores (RACI de negócio)

| Ator | R | A | C | I |
| :--- | :---: | :---: | :---: | :---: |
| Solicitante | x | | | x |
| Gestor / PMO | x | x | | |
| Equipa de execução | x | | x | |
| Admin da empresa (config) | | x | | |
| Facilitador RTD | | x | x | |

## 5. Regras de negócio (RN)

| ID | Regra |
| :--- | :--- |
| RN01 | Só utilizadores autenticados da empresa, com módulo Processos ativo, operam o fluxo. |
| RN02 | O tipo de demanda define formulário e kanban inicial. |
| RN03 | Se a etapa marcar priorização como obrigatória, a saída exige pontuação. |
| RN04 | Conversão cria novo card com vínculo à origem (`origin_task_id` / navegação Origem ↔ Criados). |
| RN05 | Transição entre kanbans pode mover o **mesmo** card (planejamento → desenvolvimento). |
| RN06 | Etapas com cronograma obrigatório exigem início e prazo para avançar. |
| RN07 | Etapa final marca conclusão e pode atualizar o status da demanda de origem. |
| RN08 | Reunião RTD com status fechado não admite novas edições. |
| RN09 | Priorização é configurável por empresa (critérios, pesos, pilares, confiança, quadrantes). |

## 6. Etapas

| # | Etapa | Entradas | Saídas | Sistema / ecrã |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Abrir solicitação | Tipo, formulário | Card na triagem | Nova Solicitação |
| 2 | Triagem | Card incompleto/completo | Card pronto a priorizar/avançar | Quadro Processos |
| 3 | Priorizar | Critérios + pilar | Score + quadrante | Detalhe do card / Matriz |
| 4 | Aprovar conversão | Nome, tipo Projeto/Programa | Item de planejamento ligado | Diálogo de aprovação |
| 5 | Planear datas | Início, prazo | Card apto a executar | Drawer / Gantt |
| 6 | Executar | Movimentos, comentários, subtarefas | Progresso no kanban | Board / Capacidade |
| 7 | Entregar | Entrada em etapa final | Concluído + sync origem | Board |
| 8 | RTD (opc.) | Indicadores, planos, deliberações | Ata / report da reunião | Módulo RTD |

## 7. Eventos e exceções

| Evento | Tratamento |
| :--- | :--- |
| Sem permissão | Utilizador não vê a ação / mensagem de falta de permissão |
| Gate de priorização | Bloqueio de movimento até pontuar |
| Gate de datas | Bloqueio até preencher início/prazo |
| SLA estourado | Indicação visual No prazo / Alerta / Atrasado; scan periódico em background |
| Integração EPA indisponível | Slides de planos RTD sem dados externos |
| Plano da empresa expirado | Acesso ao módulo bloqueado (pagamento/plano) |

## 8. Mapa documental

| Documento | Público |
| :--- | :--- |
| `docs/usuario/05-fluxo-processo-negocio.md` | Negócio / Mermaid |
| `docs/processo/01-fluxo-processo-negocio-bpmn.xml` | BPMN 2.0 |
| `docs/técnico/05-gestao-projetos-demandas.md` | Desenvolvimento |
| `docs/fluxo-projeto.md` / `docs/fluxo-programa.md` | Operação detalhada PMO |

## 9. Indicadores sugeridos (negócio)

- Tempo médio triagem → aprovação
- % demandas com priorização preenchida
- % entregas dentro do SLA da etapa
- Lead time solicitação → etapa final
