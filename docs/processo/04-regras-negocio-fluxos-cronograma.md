# Regras de neg?cio — fluxos, cronograma e sistema

Documento para apresenta??o. Consolida as regras operacionais do AgileFlow **por fluxo**, com ?nfase em cronograma.

P?blico: gestores, PMO, coordena??o e administrativo.  
Vers?o: 2026-08-24.

---

## Como ler

- Cada fluxo tem um conjunto de regras numeradas (P1, CR1, US1…).
- Regras do **sistema** (S) valem para todos os kanbans.
- O bloco **Cronograma** (CR) ? transversal: aplica-se a Projeto, Programa, Feature e User Story.

Artefactos relacionados:

- [02-documentacao-processo.md](02-documentacao-processo.md) — ficha do ciclo solicita??o ? entrega
- [03-fluxo-kanbans-prospectar-projetos-contratar.md](03-fluxo-kanbans-prospectar-projetos-contratar.md) — etapas e bifurca??es
- [fluxo-projeto.md](../fluxo-projeto.md) / [fluxo-programa.md](../fluxo-programa.md) — opera??o PMO

---

## 0. Regras do sistema (todos os fluxos)

| ID | Regra |
| :--- | :--- |
| S1 | S? opera quem est? autenticado, no tenant certo e com o m?dulo ativo. |
| S2 | Acesso ? por **cargo ? fun??o ? permiss?es**. Super Admin e Admin da empresa passam em tudo. |
| S3 | **Coordenador** e **Administrativo** t?m o mesmo n?vel operacional (pessoas, kanbans, aprova??es). |
| S4 | PO Externo s? v? os projetos em que ? respons?vel; n?o acessa Pessoas, Indicadores e RTD. |
| S5 | Tipo de demanda define formul?rio, kanban inicial e campos. |
| S6 | Movimento de etapa pode ser restrito por cargo (quem pode entrar / sair da raia). |
| S7 | Card em etapa **final** recebe data de conclus?o. |
| S8 | Prioriza??o Impacto ª Esfor?o ? configur?vel (crit?rios, pesos, pilares, confian?a, quadrantes). |
| S9 | SLA por etapa: **No prazo / Alerta / Atrasado** (selo no card). |
| S10 | Aus?ncia aprovada/pendente reduz capacidade e aparece no Gantt. |

---

## 1. Fluxo Prospectar Solu??es

**Etapas:** Backlog ? Ajustes ? Classifica??o ? Avaliar Classifica??o ? Contrata??o ? Impedimento ? Rejeitado ? Conclu?do ? Cancelado

| ID | Regra |
| :--- | :--- |
| P1 | Entrada da demanda. Sem classifica??o, o card n?o segue o caminho de desenvolvimento/implanta??o. |
| P2 | Classificar em **Desenvolvimento / Implanta??o / Melhoria**. |
| P3 | Se produto for **sistema externo** e **“Ser? contratado?” = Sim**: origem vai para a raia **Contrata??o (travada)** e nasce um card no kanban **Contratar**. |
| P4 | Avaliar classifica??o: Ajustes \| Impedimento \| Rejeitado \| Aprovado. |
| P5 | **Aprovado ? Conclu?do** converte em **Projeto ou Programa** (card novo, ligado ? origem). |
| P6 | Convers?o exige nome; Programa exige **pelo menos 1 item** com t?tulo. |
| P7 | Origem e item criado ficam naveg?veis (Origem ? Criados). |
| P8 | Prioriza??o, se obrigat?ria na etapa, **bloqueia a sa?da** at? pontuar. |

---

## 2. Fluxo Contratar (lateral)

**Etapas:** Backlog ? Prospectar ? An?lise de ader?ncia ? Proposta ? Negocia??o ? Conclu?do \| Cancelado

| ID | Regra |
| :--- | :--- |
| C1 | S? existe se a origem disparou contrata??o (produto externo + contratar = Sim). |
| C2 | Enquanto o funil Contratar est? aberto, a **origem fica travada** na raia Contrata??o. |
| C3 | Proposta: anexo + valor para avan?ar. |
| C4 | **Ganhou (Conclu?do):** contrato no Produto + **libera a origem**. |
| C5 | **Perdeu (Cancelado):** origem vai para **Cancelado**. |
| C6 | N?o duplica contrata??o: se j? existe card travado, reusa o mesmo. |

---

## 3. Fluxo Projetos e Programas

**Etapas t?picas:** Backlog ? Contrata??o ? Agendar Reuni?o ? Levantamento ? Impedimento ? Pausado ? Requisitos/Prot?tipo ? Refinamento ? Validar Escopo ? Pronto para Desenvolvimento ? Em Desenvolvimento ? DevOps (HML) ? Homologando (Cliente) ? DEVSECOPS (PROD) ? Conclu?do \| Cancelado

| ID | Regra |
| :--- | :--- |
| PP1 | **Projeto** = 1 card. **Programa** = 1 guarda-chuva + N projetos-filhos, cada um com datas pr?prias. |
| PP2 | Itens do Programa ficam ocultos no mesmo kanban; ao ir para desenvolvimento, **reaparecem** como card. |
| PP3 | Envio para desenvolvimento ? **projeto a projeto** (n?o o Programa inteiro). |
| PP4 | Transi??o planejamento ? execu??o **move o mesmo card** (n?o cria outro). |
| PP5 | Prioriza??o ? **da fam?lia** (demanda ? projeto ? filhos). |
| PP6 | Etapa final pode **sincronizar o status da demanda de origem**. |
| PP7 | Impedimento, pausa, homologa??o e retorno de escopo s?o loops oficiais. |
| PP8 | Sem etapa configurada “mover para o kanban”, o sistema **n?o envia para o desenvolvimento**. |

### Projeto ª Programa

| Aspecto | Projeto | Programa |
| :--- | :--- | :--- |
| Cards na convers?o | 1 | 1 Programa + N filhos |
| No quadro | Card normal | Programa vis?vel; itens ocultos no mesmo kanban |
| Ida ao desenvolvimento | O pr?prio card transita | Cada filho ? promovido individualmente |
| Datas | Do pr?prio card | Uma por filho (entregas distintas) |
| Acompanhamento | O pr?prio card | Programa agrega % e ?ltima entrega |

---

## 4. Fluxo Cronograma

Tr?s camadas: **preencher**, **completar para desenvolver**, **governar (baseline)**.

> Planejar ? livre. Executar exige cronograma completo. Depois de comprometido, mudar ? governan?a (baseline + justificativa).

### 4.1 Gate de preenchimento (sair da etapa)

| ID | Regra |
| :--- | :--- |
| CR1 | Em etapas marcadas em **Configura??es ? Cronograma** (obrigat?rio), o card **n?o sai** sem **in?cio + prazo**. |
| CR2 | Vale para o movimento no kanban (tela e API). |
| CR3 | SLA da etapa ? independente do prazo do projeto: um card pode estar no prazo do projeto e atrasado na etapa. |

### 4.2 Gate para entrar em desenvolvimento

| ID | Regra |
| :--- | :--- |
| CR4 | Para ir a **Pronto para Desenvolvimento / Em Desenvolvimento** (ou etapa que **trava o cronograma**), a **?rvore precisa estar completa**. |
| CR5 | Completo = cada **folha** com **in?cio, prazo, horas (> 0) e respons?vel**. |
| CR6 | Pais (Feature, etapa, Programa) s?o **rollup dos filhos** — n?o se exige respons?vel no agrupador. |
| CR7 | **Cronograma vazio bloqueia** a entrada em desenvolvimento. |
| CR8 | Folha j? **conclu?da** n?o trava o gate. |

### 4.3 Baseline (controle de mudan?a)

| Estado | Quando | O que pode |
| :--- | :--- | :--- |
| **Aberto** | Ainda n?o entrou em etapa que trava | Edi??o livre |
| **Travado** | Card-raiz entrou em etapa que trava o cronograma | N?o altera datas, horas nem estrutura |
| **Revis?o** | Salvou baseline + justificativa | Edita; ao encerrar, **re-trava** |

| ID | Regra |
| :--- | :--- |
| CR9 | Travamento grava o momento do compromisso. |
| CR10 | Alterar cronograma travado exige **baseline versionado + justificativa**. |
| CR11 | N?o abre nova revis?o se j? existe uma aberta. |
| CR12 | Rec?lculo autom?tico **n?o sobrescreve** datas manuais da sub?rvore sem revis?o aberta. |
| CR13 | Gantt usa calend?rio corporativo (expediente, almo?o, feriados, dias ?teis). |
| CR14 | Aus?ncias que afetam capacidade **cortam horas** no per?odo. |
| CR15 | Relat?rios PMO comparam **previsto (baseline) ª realizado**; sem baseline aparece lacuna. |

---

## 5. Fluxo Features

**Etapas:** Backlog ? Em Desenvolvimento ? Homologa??o (PO) ? Ajustar ? Conclu?do

| ID | Regra |
| :--- | :--- |
| F1 | Nascem a partir de **Pronto / Em Desenvolvimento** do Projeto (criar ou importar planilha). |
| F2 | Feature ? **pai** das User Stories (datas, horas e progresso = rollup). |
| F3 | Homologa??o (PO): **Ajustar** volta para Em Desenvolvimento; **Conclu?do** encerra. |
| F4 | Impedimento / Code Review nas US **sobe selo** para a Feature. |
| F5 | Quando **todas as US filhas concluem**, a Feature pode voltar para Homologa??o (PO). |

---

## 6. Fluxo User Story

**Etapas:** Backlog ? Impedimento ? Em Desenvolvimento ? Code Review ? Homologa??o (PO) ? Conclu?do

| ID | Regra |
| :--- | :--- |
| US1 | US ? filha da Feature; o respons?vel da US ? quem entra no cronograma (folha). |
| US2 | Homologa??o (PO) pode **devolver para Em Desenvolvimento**. |
| US3 | Para concluir: evid?ncia de c?digo (**commit** do reposit?rio do produto) **ou justificativa** audit?vel. |
| US4 | Checklist da US deriva o percentual de conclus?o. |
| US5 | Impedimento na US marca a Feature. |

---

## 7. Fluxo Pessoas / Aus?ncias (apoio ao cronograma)

| ID | Regra |
| :--- | :--- |
| T1 | **S? Coordenador e Administrativo** cadastram, editam ou excluem pessoas. |
| T2 | Aus?ncia: colaborador solicita a pr?pria; gestor cadastra de terceiros; aprova??o ? permiss?o ? parte. |
| T3 | Status da pessoa (f?rias / afastado) **vem das aus?ncias**, n?o do cadastro manual. |
| T4 | An?lise de impacto: pendentes + aprovadas; conflito se **2+ do mesmo time** no mesmo per?odo; cruza tarefas abertas de projetos. |

---

## 8. Linha do tempo (vis?o ?nica)

```
Solicita??o
  ? Prospectar (classificar)
      ?? Contratar? Sim ? Contratar (origem travada) ? Ganhou / Perdeu
      ?? Desenvolver ? Conclu?do
            ? Projeto ou Programa
                 ? Preencher cronograma (in?cio + prazo)
                 ? Completar folhas (horas + respons?vel)
                 ? Pronto / Em Desenvolvimento  ?  TRAVA BASELINE
                      ? Features
                           ? User Stories (execu??o)
                                ? Homologa??o ? Entrega
                                     ? Sync da demanda de origem
```

---

## 9. Frases para fechar a apresenta??o

1. **Demanda n?o some:** convers?o cria v?nculo; transi??o muda o mesmo card de kanban.
2. **Comprar e desenvolver n?o se misturam:** contratar trava a origem at? ganhar ou perder.
3. **Programa n?o executa: o projeto-filho executa**, cada um na sua data.
4. **Cronograma tem tr?s portas:** preencher ? completar para desenvolver ? governar com baseline.
5. **Feature consolida; US executa.**
6. **Pessoas e f?rias alimentam capacidade** — aus?ncia simult?nea no time ? risco expl?cito.

---

## 10. ?ndice r?pido das regras

| Prefixo | Fluxo | IDs |
| :--- | :--- | :--- |
| S | Sistema | S1–S10 |
| P | Prospectar | P1–P8 |
| C | Contratar | C1–C6 |
| PP | Projetos e Programas | PP1–PP8 |
| CR | Cronograma | CR1–CR15 |
| F | Features | F1–F5 |
| US | User Story | US1–US5 |
| T | Pessoas / Aus?ncias | T1–T4 |
