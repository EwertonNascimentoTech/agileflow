# Fluxo de uma Demanda → **Programa** (da triagem ao DevOps)

> Guia operacional do módulo **Projetos** (Kore 2.0) para o caso em que a demanda aprovada
> vira um **Programa** que agrupa **vários projetos (itens)**, entregues em **datas
> diferentes**. Para o caso de Projeto único, veja [fluxo-projeto.md](fluxo-projeto.md).

---

## Visão geral do ciclo

```
Demanda (triagem) → Priorização (Impacto × Esforço) → Aprovação como PROGRAMA
   → Programa (guarda-chuva no planejamento) + N Projetos-filhos (com datas próprias)
   → Envio projeto a projeto para Desenvolvimento → DevOps/Entrega (em datas distintas)
```

Conceito-chave: o **Programa** é o **guarda-chuva** (fica no planejamento, agrega progresso e
mostra a última entrega). Cada **item** é um **Projeto independente**, que segue para o
desenvolvimento **individualmente**, com seu próprio cronograma/SLA.

---

## 1. Triagem e 2. Priorização

Idênticas ao fluxo de Projeto (ver [fluxo-projeto.md](fluxo-projeto.md) §1 e §2): preencher a
demanda, pontuar Impacto × Esforço (config em **Configurações → Priorização**), respeitando os
controles **OBRIG./EDIT./VISIB.** por etapa.

## 3. Aprovação como **Programa** (com itens)

Ao mover a demanda para a etapa de conversão (`creates_demand_type_id`), no diálogo
**"Aprovar e criar Item de planejamento"**:

1. Escolha **Tipo = Programa**.
2. Informe o **Nome do Programa** (e descrição).
3. **Itens do programa** (campo multivalorado, botão **+ Adicionar item**): para cada projeto
   informe **Título**, **Descrição** e **Início/Prazo** (datas — *definidas já no planejamento*).
4. **Aprovar e criar** → o sistema cria:
   - **1 card de Programa** (`planning_kind = "programa"`, `origin_task_id` = demanda);
   - **1 card-filho por item** (`planning_kind = "projeto"`, `parent_task_id` = Programa), cada
     um com **suas próprias datas**.

> Itens em branco são ignorados; é exigido ao menos 1 item com título.

## 4. Programa como guarda-chuva (planejamento)

- **No quadro/lista**, os **itens ficam escondidos** por padrão — aparecem agrupados dentro do
  Programa. O card do Programa mostra o selo **"Programa · N itens · X%"** e **"Última entrega:
  <maior prazo dos filhos>"**.
- Para ver os itens como cards, ative **Hierarquia → Mostrar itens no quadro** (filtro da barra),
  ou abra o Programa → aba **Filhos** (lista clicável).
- A regra de ocultar vale **apenas enquanto o item está no mesmo kanban do Programa**. Quando o
  item vai para o desenvolvimento (outro funil), ele **reaparece** como card próprio.
- **Priorização** propaga por toda a família (Programa ↔ itens): pontuar em qualquer um reflete
  nos demais; recalcular a config atualiza todos.

## 5. Cronograma por projeto

- Cada item já tem **início/prazo** (definidos no passo 3, editáveis no drawer do item).
- O **gate de cronograma** (Config → Cronograma, `require_fill`) garante que o projeto não saia do
  planejamento sem datas — então cada projeto entra no desenvolvimento com sua entrega definida.
- O **Gantt** mostra cada projeto na sua faixa de datas.

## 6. Envio para o Desenvolvimento — **projeto a projeto (manual)**

Como os projetos são entregues em **datas diferentes**, cada um é promovido individualmente:

- **No Programa → aba Filhos**: cada projeto tem a ação **"Enviar para desenvolvimento"**.
- **Na Lista** (com "Mostrar itens" ligado): cada linha de projeto tem o atalho **"Enviar p/ dev"**.

O envio usa a etapa do funil de planejamento configurada com **"mover para o kanban"**
(`moves_to_funnel_id` = Desenvolvimento): o **mesmo card** do projeto transita para a etapa inicial
do desenvolvimento, **mantendo o vínculo com o Programa** e suas datas.

> Pré-requisito: ter uma etapa do funil de planejamento com **"mover para o kanban" =
> Desenvolvimento** (Config → Etapas). Sem ela, o sistema avisa para configurar.

## 7. Desenvolvimento e DevOps (cada projeto, individualmente)

- No kanban de desenvolvimento, **cada projeto aparece como card próprio** e anda
  **independente** (etapas, SLA, cronograma) — entregas em datas distintas.
- O **Programa permanece no planejamento** acompanhando: progresso (% concluído dos filhos) e
  última entrega (maior prazo).
- Conforme cada projeto chega às etapas finais (build/deploy/validação) e entra numa etapa
  **final** (`is_final`), ele recebe `completed_at`. O progresso do Programa sobe.
- Quando todos os projetos são entregues, o Programa reflete 100%.

---

## Linha do tempo (exemplo)

```
Planejamento                          Desenvolvimento
┌───────────────────────────┐        ┌───────────────────────────┐
│ [PROGRAMA] Alfa            │        │ Projeto A  (prazo 20/07)   │ ← enviado 1º
│  Programa · 3 itens · 33%  │        │ Projeto B  (prazo 15/09)   │ ← enviado depois
│  Última entrega: 15/09     │        │                            │
│  (itens A, B, C dentro)    │        │ (Projeto C ainda no plan.) │
└───────────────────────────┘        └───────────────────────────┘
```

## Resumo de configuração (admin)

| Configuração | Onde | Papel no fluxo de Programa |
|---|---|---|
| Etapa de conversão | Config → Etapas (`creates_demand_type_id`) | Abre o diálogo Projeto/Programa na aprovação |
| Etapa de transição | Config → Etapas ("mover para o kanban") | Define o kanban de **Desenvolvimento** (destino do "Enviar p/ dev") |
| Cronograma | Config → Cronograma (`require_fill`) | Garante datas por projeto antes do dev |
| Layout do card | Config → Layout do card | Selo/itens/última entrega no card (por kanban) |
| Priorização | Config → Priorização | Critérios/pesos/pilares/confiança/quadrantes |

## Diferenças Projeto × Programa

| Aspecto | Projeto | Programa |
|---|---|---|
| Cards criados na aprovação | 1 | 1 Programa + N filhos |
| `planning_kind` | `projeto` | `programa` (filhos = `projeto`) |
| No quadro/lista | card normal | Programa visível; itens escondidos (com selo) |
| Ida ao desenvolvimento | o próprio card transita | **cada filho** é promovido individualmente |
| Datas | do próprio card | uma por filho (entregas distintas) |
| Acompanhamento | o próprio card | Programa agrega % e última entrega |

## Glossário rápido

- **Conversão** (`creates_demand_type_id`): cria card(s) novo(s) na aprovação.
- **Transição** (`moves_to_funnel_id`): move o mesmo card para o kanban de desenvolvimento.
- **Família**: conjunto ligado por origem + pai/filho; a priorização é compartilhada.
- **Guarda-chuva**: o Programa permanece no planejamento agregando os projetos.
- **Gate de cronograma** (`require_fill`): trava a saída sem início+prazo.
