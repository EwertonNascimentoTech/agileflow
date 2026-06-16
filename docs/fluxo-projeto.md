# Fluxo de uma Demanda → **Projeto** (da triagem ao DevOps)

> Guia operacional do módulo **Projetos** (Kore 2.0) para o caso em que a demanda
> aprovada vira **um único Projeto**. Para o caso de **Programa** (vários projetos
> agrupados), veja [fluxo-programa.md](fluxo-programa.md).

---

## Visão geral do ciclo

```
Demanda (triagem)  →  Priorização (Impacto × Esforço)  →  Aprovação/Conversão  →  Projeto (planejamento)
      →  Cronograma (início/prazo)  →  Desenvolvimento (kanban de execução)  →  DevOps/Entrega
```

Cada etapa abaixo indica **quem faz**, **onde** na tela e **o que o sistema faz** por baixo.

---

## 1. Triagem da demanda

1. **Abertura**: a demanda entra no kanban de triagem (Quadro do módulo Projetos).
2. **Preenchimento**: título, descrição, responsável, diretoria/área e os campos do
   formulário do tipo de demanda.
3. **Layout do card**: o que aparece no card do quadro é definido **por kanban** em
   **Configurações → Layout do card** (tipo, prioridade, SLA, prazo, responsável, etc.),
   com ordem e rótulos personalizáveis.

## 2. Priorização (Matriz de Impacto × Esforço)

A priorização é **100% configurável por tenant** em **Configurações → Priorização**:

- **Critérios & Pesos** (eixos *Impacto* e *Esforço*), cada um com **escala editável**
  (valor → descrição) e peso; a soma de cada eixo deve fechar **100%**.
- **Pilares estratégicos** (Mapa) com **modulador** (×0,8 / ×1,0 / ×1,3).
- **Confiança** (fator global da metodologia — Alta/Média/Baixa com divisor).
- **Quadrantes & Corte** (linha em 3,0 ajustável): Quick Win / Big Bet / Fill In / Money Pit.

**Onde pontuar:** no detalhe da demanda (drawer), seção **Priorização** — disponível
conforme o **modo da etapa** (ver §3). Preenche-se cada critério (escala 1–N) + pilar; o
sistema calcula **Impacto efetivo**, **Esforço** e o **Quadrante**, mostrando o badge.

> Fórmula: `Impacto efetivo = (Σ critério×peso × modulador do pilar) ÷ divisor de confiança`;
> `Esforço = Σ critério×peso`; quadrante por corte nos dois eixos.

A **Matriz 2×2** (menu **Matriz de Priorização**) plota todas as demandas pontuadas.

### Controles por etapa do kanban (Configurações → Etapas)
Cada etapa define, em checkboxes **OBRIG. / EDIT. / VISIB.**, como a priorização se comporta:
- **VISIB.** — mostra a priorização nos cards da etapa.
- **EDIT.** — permite preencher/editar.
- **OBRIG.** — exige a demanda **pontuada** para **sair** da etapa (gate).

## 3. Aprovação e conversão em Projeto

Ao mover a demanda para a etapa configurada com **"gerar card do tipo"**
(`creates_demand_type_id`), abre-se o diálogo **"Aprovar e criar Item de planejamento"**:

1. Escolha **Tipo = Projeto**.
2. Informe **Nome** e **Descrição**.
3. **Aprovar e criar** → o sistema cria **um card de Projeto** no kanban de destino do tipo,
   com `planning_kind = "projeto"` e `origin_task_id` apontando para a demanda (rastreabilidade).

- A demanda de origem e o Projeto ficam ligados: no drawer, a demanda mostra **"Criados a
  partir deste"** e o Projeto mostra **"Origem"** — ambos clicáveis (abrem o card no kanban dele).
- A **priorização é herdada/propagada** por toda a família (demanda ↔ projeto): pontuar em um
  reflete no outro; mudar a config recalcula todos.

## 4. Planejamento do Projeto + Cronograma

- **Datas próprias**: o Projeto tem **início** e **prazo** (`start_date`/`due_date`), editáveis
  no drawer.
- **Cronograma**: em **Configurações → Cronograma**, define-se em quais etapas o cronograma é
  obrigatório (`require_fill`). Com isso, o card **só sai** da etapa com início+prazo preenchidos
  (gate). A visão **Gantt/Cronograma** mostra o Projeto na linha do tempo.
- **SLA por etapa**: cada etapa pode ter `sla_hours` + % de alerta; o card exibe estado
  **No prazo / Alerta / Atrasado** (selo "Situação SLA/cronograma" no card).

## 5. Desenvolvimento (kanban de execução)

- A transição planejamento → desenvolvimento usa a etapa configurada com **"mover para o
  kanban"** (`moves_to_funnel_id`): o **mesmo card** transita para a etapa inicial do kanban de
  desenvolvimento, preservando identidade, vínculos e datas.
- No desenvolvimento o Projeto anda etapa a etapa, com SLA/cronograma próprios.
- Ações de etapa disponíveis (Configurações → Etapas): automações de entrada (atribuir,
  criar subtarefa, notificar, comentar), restrição de movimentação por função, conversão e
  sincronização do card de origem (`updates_origin_status_id`).

## 6. DevOps / Entrega

- O Projeto percorre as etapas finais do kanban de desenvolvimento (build/deploy/validação,
  conforme as etapas que o tenant configurar).
- Ao entrar numa etapa **final** (`is_final`), o card recebe `completed_at` (concluído).
- Se a etapa final tiver `updates_origin_status_id`, a **demanda de origem** é sincronizada
  automaticamente (ex.: "Entregue" → demanda avança/encerra).

---

## Resumo de configuração (admin)

| Configuração | Onde | Para quê |
|---|---|---|
| Tipos de demanda + funil | Config → Tipos de demanda | Define o tipo e em qual kanban ele vive |
| Etapas do kanban | Config → Etapas | Ordem, cores, SLA, conversão, transição, OBRIG./EDIT./VISIB. da priorização |
| Priorização | Config → Priorização | Critérios/pesos/escala, pilares, confiança, quadrantes/corte |
| Cronograma | Config → Cronograma | Em quais etapas exigir início/prazo |
| Layout do card | Config → Layout do card | O que aparece no card (por kanban) |

## Glossário rápido

- **Conversão** (`creates_demand_type_id`): cria um card **novo** de outro tipo (Demanda → Projeto).
- **Transição** (`moves_to_funnel_id`): move o **mesmo** card para outro kanban (Planejamento → Dev).
- **Gate de cronograma** (`require_fill`): trava a saída da etapa sem início+prazo.
- **Quadrante**: classificação Impacto × Esforço (Quick Win / Big Bet / Fill In / Money Pit).
- **planning_kind**: marca o card como `projeto` ou `programa`.
