# Portal do Cliente — Portfólio, Programas e Roadmap

O cliente acompanha pelo **Portal do Cliente** a posição estratégica dos projetos, a evolução, a saúde e os próximos marcos, agrupados por **Programa** e por **Pilar**. Tudo é só leitura; ocorrências e Soluções com IA continuam nas telas próprias.

## Menu do Portal

| Tela | O que mostra |
| :--- | :--- |
| Visão geral (`/portal`) | Mapa Estratégico (impacto × esforço), resumo por classificação, critérios e a tabela dos projetos agrupada por programa |
| Programas (`/portal/programas`) | Os programas que o cliente acompanha (favoritos primeiro) |
| Programa (`/portal/programas/:id`) | Indicadores do programa e três visões: por Pilares, por Projetos (Projeto → Feature → User Story) e Roadmap |
| Projetos (`/portal/projetos`) | Todos os projetos em lista, com filtros; cada um abre a tela do projeto |
| Projeto (`/portal/projetos/:id`) | Mesmo layout do programa: indicadores do projeto e as visões por Features (Feature → User Story) e Roadmap (fases do projeto + uma linha por Feature). Em "Mais ações": abrir/ver ocorrências e ir ao programa |
| Entregas e Marcos (`/portal/entregas`) | Features previstas e concluídas (últimos 4 meses) e a entrega de cada projeto |
| Ocorrências, Soluções com IA | Sem mudança |
| Assistente (botão de chat, em todas as telas) | Perguntas sobre o que a pessoa vê no Portal; ver "Assistente do Portal" abaixo |

## Quem vê o quê

- **Cliente do programa** (cadastro de Programas → Gerenciar → Clientes do programa): vê **todos** os projetos do programa.
- **Cliente do projeto** (card do projeto → Clientes do projeto): vê só esse projeto; na tela do programa aparecem só os projetos dele, com o aviso "Você acompanha alguns projetos deste programa".
- **Equipe em "modo cliente"**: quem está em Times (Pessoas) vê o módulo **Modo Cliente** na coluna de módulos do AgileFlow, com as telas do Portal dentro do app, só para leitura (o módulo precisa estar ativo no tenant). A **coordenação** (admin ou cargo de coordenação/gestão) vê todos os projetos; o **PO**, os projetos em que é responsável e os programas de que é responsável; o **desenvolvedor**, os projetos em que tem Feature/US atribuída ou é dev de atendimento da Operação Assistida. Ocorrências e Soluções com IA: a coordenação/gestão (inclui Administrativo) vê as duas telas só para leitura; PO e desenvolvedor não veem. Pedir análise de Solução com IA é aberto a todos.
- O vínculo com o programa **não** permite abrir ocorrência: ocorrência continua exigindo o vínculo com o projeto na raia Operação Assistida.
- **Patrocinador** do programa = cliente com a função **Sponsor** no programa (o cargo vem da folha ou do cadastro).
- Projeto **cancelado** não aparece no portfólio nem no programa; quem tem o link ainda abre a tela do projeto, com o aviso de cancelado.
- **Abrir ocorrência** na tela do projeto: só com vínculo direto com o projeto e o projeto na raia Operação Assistida.
- **Patrocinador** do projeto = cliente com a função Sponsor no projeto; sem ele, o do programa.

## De onde vêm os números

| Item da tela | Regra |
| :--- | :--- |
| Programa e seus projetos | Cadastro de Programas; projetos = cards de Projetos e Programas vinculados ao programa |
| Classificação | Quadrante da priorização (impacto efetivo × esforço, cortes da Config → Priorização). Os nomes e cores são os da configuração |
| Classificação do programa | Quadrante da média de impacto e esforço dos projetos |
| Tamanho da bolha | Horas estimadas das User Stories do projeto (sem horas nas US: das Features; sem elas: do card) |
| Fase | Etapa do card do projeto, mesma régua do PO Sync; no roadmap, Operação Assistida é fase própria |
| Status (Visão geral) | Planejamento, Em execução, Concluído, Com impedimento ou Pausado, a partir da fase |
| Evolução | % de execução do PO Sync (média do peso de etapa das US); projeto em planejamento conta 0%, concluído 100%. Programa e pilar = média dos projetos |
| "+X p.p. desde o último mês" | Evolução de hoje menos a evolução recalculada 30 dias atrás pelo histórico de etapas (existe desde 04/08/2026) |
| Saúde | **Crítico**: item vencido, SLA estourado ou execução mais de 15 p.p. atrás do esperado pelo período do projeto (o atraso de execução não vale em planejamento). **Em atenção**: impedimento, pausa ou bloqueio por dependência. **No prazo**: o resto. **Concluído**: entregue |
| Saúde do programa/pilar | Crítico se metade ou mais dos projetos ativos está crítica; Em atenção se algum não está no prazo |
| Próximo marco | Feature não concluída com o prazo mais próximo (a partir de hoje) |
| Status do item (visão por projetos) | Concluída, Com impedimento, Atrasado (prazo vencido), Não iniciada (Backlog), No prazo (com prazo) ou Em andamento (sem prazo) |
| Subtítulo do projeto | Nome do Produto vinculado ao card |

## Roadmap

- **Realizado:** mudanças de etapa do card do projeto. Antes do primeiro registro, a fase vale desde o início do card.
- **Previsto** (barra clara e tracejada): Desenvolvimento até o maior prazo das User Stories; Homologação até a previsão do projeto; Operação Assistida pelos dias configurados no programa (padrão 30).
- Projeto sem datas no cronograma mostra só a fase atual até hoje.
- Projeto em impedimento: a barra laranja listrada vai até hoje e a previsão retoma a fase em que parou.
- Losango = fim previsto do desenvolvimento e entrega prevista.
- Projeto concluído vira uma barra só, "Concluído", até a entrega.

## Como configurar um programa

Em **Processos → Programa** (permissão `projetos.program.manage`):

1. **Editar:** descrição, responsável (PO), ícone, cor e dias previstos de Operação Assistida.
2. **Gerenciar:**
   - **Pilares:** crie os pilares (nome, descrição, ícone, cor). "Sugerir pela Área" cria um pilar por Área dos cards sem pilar e os classifica — é só o ponto de partida; renomeie e reatribua depois.
   - **Projetos do programa:** escolha o pilar de cada card. Card sem pilar aparece no grupo "Sem pilar".
   - **Clientes do programa:** quem vê o programa inteiro no Portal, com a função (Sponsor = Patrocinador).

## Assistente do Portal (chat)

O botão de chat no canto inferior direito (Portal e módulo Modo Cliente) abre o assistente. Ele responde perguntas sobre os programas e projetos que a pessoa vê: andamento, saúde, fase, próximos marcos, entregas previstas e concluídas, datas e as Features/histórias do projeto aberto na tela.

- Usa só os dados que a pessoa já vê no Portal (mesma regra de "Quem vê o quê"). Sobre projeto fora do que ela vê, responde que não encontrou.
- Na tela de um projeto ou programa, as perguntas valem para ele ("quando este projeto termina?").
- Cada resposta traz links para os projetos e programas citados.
- A conversa fica só no navegador (some ao recarregar ou em "Nova conversa") e não é gravada.
- Privacidade: a IA (Azure AI Foundry) recebe os dados anonimizados. Nomes de pessoas viram códigos e só voltam na resposta mostrada na tela; e-mails, telefones e termos sensíveis também são tratados.
- Limite de 15 perguntas por minuto por pessoa. Se a IA estiver sobrecarregada, o assistente pede para tentar de novo em um minuto.
- Configuração: `AZURE_AI_PORTAL_AGENT_ID` no `.env` para um agente próprio. Vazio = usa o agente da primeira etapa com agente ativo, com as instruções do assistente.

## Fora desta entrega

- Indicadores do Programa (indicador ainda não tem vínculo com programa).
- Custo/investimento: a bolha usa horas estimadas.
