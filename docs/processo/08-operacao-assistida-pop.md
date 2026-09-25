# Operação Assistida — regras do POP.COR.GTD.003

O **POP.COR.GTD.003** é o procedimento oficial da Operação Assistida. Esta página resume o que o AgileFlow aplica e o que ainda falta.

## Papéis (POP 4)

Os papéis do POP são **funções dos clientes do projeto**, definidas no bloco "Clientes do projeto" do card:

| Papel do POP | Função no AgileFlow |
| :--- | :--- |
| Dono do Processo | Dono do Processo |
| Especialista do Processo (N1 junto com o Dono) | Especialista do Processo |
| Escritório de Processos (Assessoria de Gestão por Processos) | Escritório de Processos |
| Instância Executiva (Patrocinador) | Sponsor |
| Tecnologias Digitais (N2) | PO e desenvolvedores de atendimento do projeto |

O pré-requisito **"Papéis e responsáveis nomeados"** só pode ser confirmado quando o projeto (ou o programa dele) tem ao menos um **Dono do Processo** e um **Sponsor**.

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

## Fases e ritos (8.3.1 e 8.3.5)

- O projeto entra na raia na **Fase 1 — Estabilização intensiva**. O PO ou a coordenação mudam para a **Fase 2 — Acompanhamento assistido** e para a **Fase 3 — Preparação para encerramento** no card do projeto.
- O bloco **"Operação Assistida · ritos e atas"** registra as atas: rito **diário** (Fase 1, incidentes críticos), **semanal** (Fases 1 e 2, chamados, indicadores e ajustes) e **comitê** (sob demanda, escalonamento à Instância Executiva).
- Cada ata tem data, participantes, texto e decisões. Registram o PO, a coordenação e os desenvolvedores de atendimento. Quem registrou, o PO ou a coordenação editam ou excluem.

## Duração

- **Fim previsto:** até **15 dias**. É escolhido no modal. Se ninguém escolher, vale hoje + 15.
- **Prorrogação:** feita no card do projeto (bloco "Operação Assistida · preparação, prazo e fase"), com nova data e justificativa. Fica registrada no card, com histórico.
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

## Triagem N1 (8.2.1 e 8.2.2)

- **Quem é o N1 do projeto:** os responsáveis de Nível 1 cadastrados na Sustentação do **Produto** vinculado ao projeto (Pessoas de Times e Clientes, escolhidos no seletor da tela do Produto), mais os clientes com função **Dono do Processo** ou **Especialista do Processo** no projeto ou no programa. Nome digitado sem cadastro não recebe ocorrência.
- **Fluxo:** a ocorrência nova entra na raia **Triagem N1** e o N1 é avisado. No Portal, o N1 pode conversar com quem abriu e:
  - **Resolver aqui:** é dúvida de uso. Ele escreve a orientação e a ocorrência é encerrada.
  - **Encaminhar à TI:** como **Correção**, com a criticidade, vai para o Backlog e avisa o PO e os desenvolvedores de atendimento; como **Melhoria**, vai para "Melhoria – Análise PO".
- **Sem triagem:** se quem abriu já é do N1, ou se ninguém do N1 tem acesso ao sistema, a ocorrência vai direto para o Backlog.
- **Prazo:** triagem parada além do SLA do N1 do Produto (padrão 8 horas úteis) avisa o N1 e o PO. O aviso de "sem responsável há 1h" da TI conta a partir do encaminhamento.

## Escalonamento (8.2.1 e 8.4.1)

O kanban de Ocorrências tem duas raias depois de **Ajustando**:

| Raia | Quando | O que acontece |
| :--- | :--- | :--- |
| **N3 – Fornecedor** | A causa está em ferramenta, legado ou contrato de terceiro | Motivo obrigatório ao mover; o cliente é avisado |
| **Escalonada à Instância Executiva** | Inviabilidade de estabilização ou decisão estratégica | Motivo obrigatório; avisa o cliente, os Sponsors do projeto e do programa e a coordenação |

Nessas raias o prazo de resolução continua contando, mas o tempo não entra nas horas do desenvolvedor.

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

## Indicadores (8.1.3)

No card do projeto (bloco "Operação Assistida · indicadores") e no Portal (aba **Operação Assistida** do projeto):

| Indicador | Como é calculado | Meta de referência |
| :--- | :--- | :--- |
| Volume de chamados | Ocorrências por semana; compara as duas últimas semanas fechadas | Redução sustentada |
| % de atendimento no prazo | Correções encerradas dentro do prazo-alvo da criticidade | ≥ 90% |
| Reincidência de falhas | Correções reprovadas na validação do cliente | ≤ 5% |
| Satisfação dos usuários | Média das notas de 1 a 5 na homologação | ≥ 4 de 5 |
| Taxa de erros | Correções abertas no período por mil transações (volume lançado no card) | Tendência de queda |
| Disponibilidade do sistema | Percentual lançado no card por período | ≥ 99% |

O PO ou a coordenação podem **calibrar as metas** do projeto, sempre com justificativa (histórico institucional). Transações e disponibilidade são lançadas pelo PO, pela coordenação ou pelos desenvolvedores de atendimento.

## Encerramento da Operação Assistida (8.4 e 8.5)

O projeto só sai da raia Operação Assistida para **Concluído** com:

1. nenhuma ocorrência aberta;
2. os **critérios de saída** confirmados: estabilização do processo crítico, redução dos erros de alta criticidade, integrações funcionando e operação sem suporte intensivo. A alternativa é a **decisão estratégica** da Instância Executiva, registrada com o texto da decisão;
3. a **análise crítica** escrita: principais incidentes, riscos remanescentes, melhorias a avaliar, lições aprendidas e, quando houver, o plano de ações. O botão "Gerar rascunho" preenche os campos vazios com as ocorrências, os escalonamentos e as decisões das atas;
4. o **aceite do Dono do Processo**: o PO pede o aceite, e o Dono do Processo lê a análise e aceita ou recusa na aba Operação Assistida do Portal. Se o Dono do Processo não tiver acesso, a coordenação registra o aceite com justificativa. Com decisão estratégica, o aceite não é exigido.

Mudar os critérios ou a análise depois do pedido invalida o aceite. Ao concluir, o Dono do Processo, o Especialista, o Escritório de Processos, os Sponsors, o PO e a coordenação são avisados. O e-mail formal depende da integração com o Outlook.

## Encerramento da ocorrência

- A correção só vai para a validação do cliente (ou para Finalizado) com **solução** e **causa raiz** preenchidas (8.3.3).
- O cliente valida no Portal: aprova com **satisfação de 1 a 5** (meta: média de 4 ou mais) ou reprova dizendo o que falta.

## Próximas ondas

- **N1 com nomes sem cadastro:** trocar, na tela do Produto, os nomes digitados pelas pessoas cadastradas. A importação automática pelo Genus aguarda a liberação do servidor no Cloudflare.
- **E-mail formal de encerramento:** depende da integração com o Outlook (Fase 6).
