# Operação Assistida — regras do POP.COR.GTD.003

O **POP.COR.GTD.003** é o procedimento oficial da Operação Assistida. Esta página resume o que o AgileFlow já aplica (Onda 1) e o que falta (Ondas 2 e 3).

## Entrada na raia

O projeto ou programa só entra na raia **Operação Assistida** (kanban Projetos e Programas) depois de:

1. **Desenvolvedores de atendimento** definidos (quem recebe as ocorrências).
2. **Pré-requisitos do POP** confirmados pelo PO do projeto ou pela coordenação:

| Pré-requisito | Aceita "não se aplica" |
| :--- | :--- |
| Papéis e responsáveis nomeados | Não |
| Dados migrados e validados | Sim |
| Integrações com legados testadas e ativas | Sim |
| Solução homologada | Não |
| Treinamento dos usuários-chave concluído | Não |
| Canais de suporte e ferramenta de chamados configurados | Não |
| Go-live realizado e solução disponível em produção | Não |

Se faltar algo, o sistema abre o modal ao mover o card. Os demais usuários veem só o aviso e o card não entra na raia.

## Duração

- **Fim previsto:** até **15 dias**. É escolhido no modal. Se ninguém escolher, vale hoje + 15.
- **Prorrogação:** feita no card do projeto (bloco "Operação Assistida · preparação e prazo"), com nova data e justificativa. Fica registrada no card, com histórico.
- **Vencida:** o PO e a coordenação recebem aviso uma vez por dia até o projeto ser encerrado ou prorrogado.
- **Projeto que já estava na raia antes da regra:** o PO define o fim previsto no card, sem justificativa.

## Tipos de ocorrência (POP, item 7)

| Tipo | Quando | Criticidade e prazo |
| :--- | :--- | :--- |
| **Correção (erro)** | O sistema não faz o que foi combinado na entrega | Sim |
| **Dúvida de uso** | O usuário não sabe como fazer algo | Não |
| **Melhoria** | Algo novo ou diferente do combinado. Vai para análise do PO e pode seguir para um Release | Não |

**Triagem guiada na abertura (8.2.4):** o Portal faz até 3 perguntas:

1. É dúvida de uso?
2. Impede um processo crítico?
3. O sistema deixou de fazer algo que foi combinado?

**Na dúvida, é melhoria, salvo bloqueio.** O time pode reclassificar. Quando há classificação do time, é ela que vale.

## Criticidade e prazo-alvo (8.2.3)

Só **correção** tem criticidade. A sugestão vem do impacto e de quem é afetado. O PO pode ajustar.

| Criticidade | Prazo-alvo de resolução (horas úteis) |
| :--- | :--- |
| Crítica | 4 |
| Alta | 8 |
| Média | 24 |
| Baixa | 40 |

- O POP não fixa números: estes são **valores de referência, a calibrar** pelo SLA institucional.
- O prazo conta horas úteis desde a abertura, pelo calendário do TeamOps. O tempo com o cliente (Aguardando Cliente e Homologando) não conta.
- Estado do prazo: **no prazo**, **perto do prazo** (a partir de 80%) ou **estourado**. No estouro, o PO, os desenvolvedores de atendimento e o responsável recebem um aviso.

## Encerramento da ocorrência

- A correção só vai para a validação do cliente (ou para Finalizado) com **solução** e **causa raiz** preenchidas (8.3.3).
- O cliente valida no Portal: aprova com **satisfação de 1 a 5** (meta: média de 4 ou mais) ou reprova dizendo o que falta.

## Próximas ondas

- **Onda 2:** N1 pelos responsáveis de nível 1 cadastrados no Produto; papéis do POP nos clientes do projeto; escalonamento N3/IE; fases e atas dos ritos.
- **Onda 3:** painel de indicadores da Operação Assistida; encerramento formal (critérios, aceite do Dono do Processo e análise crítica).
