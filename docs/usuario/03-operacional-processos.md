# 03 — Operacional — Processos e times

Para gestores, PMO, coordenadores e quem configura o dia a dia (não é o guia do solicitante básico — ver [04](04-solicitante-minhas-solicitacoes.md)).

## Processos (kanban)

No menu do módulo **Processos** encontrará, entre outros:

- **Nova Solicitação** / **Minhas Solicitações**
- **Programa** — agrupamento de projetos
- **Capacidade** — visão de carga
- **Relatórios** / **Entregas US**
- **Configurações** — funis, etapas, tipos, priorização, cronograma, agentes, layout do card

### Ciclo que você opera

1. **Triagem** — demandas entram no quadro; complete título, responsável, área e formulário do tipo.
2. **Priorização** — no detalhe do card, pontue Impacto × Esforço quando a etapa permitir (ou exigir).
3. **Aprovação** — ao avançar para etapa que “gera” projeto/programa, confirme nome e tipo.
4. **Planejamento** — datas de início e prazo; Gantt e capacidade.
5. **Execução** — o card segue no kanban de desenvolvimento até etapa final (entrega).

Detalhe passo a passo alinhado ao negócio: [05 — fluxo de processo](05-fluxo-processo-negocio.md).

### Configurações que mais impactam o fluxo

| Onde | Efeito |
| :--- | :--- |
| Tipos de demanda | Que formulário e em que kanban a solicitação nasce |
| Etapas | SLA, obrigatoriedade de priorização, conversão e mudança de kanban |
| Priorização | Critérios, pesos, pilares, quadrantes |
| Cronograma | Em que etapas início/prazo são obrigatórios |
| Layout do card | O que aparece visualmente no quadro |

### Clientes do projeto

No card do projeto/programa (kanban Projetos e Programas), o bloco **Clientes do projeto** lista quem acompanha o projeto pelo **Portal do Cliente**, com a função de cada um (Solicitante, Sponsor, Usuário-chave, Homologador, Gestor da área ou Outro).

- Quem mexe: o **PO do projeto** e a **coordenação**, em qualquer fase. Os demais só veem (e, sem clientes, o bloco não aparece).
- **Adicionar:** digite nome ou e-mail — aparecem clientes já cadastrados, Pessoas e usuários. Digitando o e-mail, a folha (Genus) completa departamento e cargo quando está acessível. Não achou? "Cadastrar pelo e-mail" (nome + e-mail).
- **Retirar:** a pessoa deixa de ver o projeto no Portal; o cadastro dela continua.
- O cliente entra pelo **IDigital** e vê, em **Ver andamento**, a fase, o % de execução, a previsão de entrega e as entregas (Features) do projeto. Ocorrências continuam só para projetos na raia Operação Assistida.

## Gestão de Times

Menu típico:

- **Dashboard** — pessoas, férias, alertas
- **Organograma**
- **Pessoas** (ficha do colaborador)
- **Stacks** — competências
- **Ausências** — pedidos e aprovações
- **Configurações** — áreas, cargos, feriados, calendário

### Ausências

1. O colaborador regista o pedido.
2. Quem tem permissão **aprova** ou **rejeita**.
3. A capacidade e calendários refletem os períodos aprovados.

### Cargos e permissões

Em configurações de cargos é possível ligar permissões da função ao cargo — útil para alinhar o que cada posição vê nos módulos.

## Indicadores e RTD

- **Indicadores:** painel, cadastro de KPIs e acompanhamentos por período (atingido / em atenção / não atingido).
- **RTD:** lista de reuniões; em cada reunião, slides de indicadores e planos (quando a integração externa estiver disponível), mais deliberações. Reunião **fechada** deixa de aceitar edições.

## Produtos

Portfólio de produtos, inteligência, portfólio de processos e fornecedores — útil após projetos finalizados ou para inventário de serviços da área.

Regras de governança, alertas e recortes (unidade / área / categoria): [05 — governança do portfólio de produtos](../processo/05-regras-governanca-portfolio-produtos.md).
