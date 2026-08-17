# Fluxo BPMN � Prospectar � Projetos � Contratar

Vis?o das **etapas reais** dos tr?s kanbans do processo TD, com bifurca??es de classifica??o e contrata??o.

| Artefacto | Descri??o |
| :--- | :--- |
| [03-fluxo-kanbans-prospectar-projetos-contratar-bpmn.xml](03-fluxo-kanbans-prospectar-projetos-contratar-bpmn.xml) | BPMN 2.0 (pools dos 3 kanbans) � abrir em Documenta??o ou [demo.bpmn.io](https://demo.bpmn.io) |

## Bifurca??es principais

1. **Classificar** (sa?da do Backlog em Prospectar): Desenvolvimento | Implanta??o | Melhoria  
2. **Produto sistema externo?** ? se sim, **Ser? contratado?**  
3. **Sim** ? origem vai para raia **Contrata??o** (travada) + nasce card no kanban **Contratar**  
4. **Avaliar Classifica??o**: Ajustes | Impedimento | Rejeitado | Aprovado ? Conclu?do (converte p/ Projetos)  
5. **Contratar / Negocia??o**: Ganhou (contrato no Produto + libera origem) | Perdeu (origem ? Cancelado)  
6. **Projetos e Programas**: Impedimento, escopo, homologa??o (loops de retorno)

## Etapas por kanban (ordem atual)

**Prospectar Solu??es:** Backlog ? Ajustes ? Classifica??o ? Avaliar Classifica??o ? Contrata??o ? Impedimento ? Rejeitado ? Conclu?do ? Cancelado  

**Projetos e Programas:** Backlog ? Agendar Reuni?o ? Conduzir Reuni?o ? Impedimento ? Requisitos/Prot?tipo ? Refinamento ? Validar Escopo ? Pronto p/ Dev ? Em Desenvolvimento ? DevOps HML ? Homologando ? DEVSECOPS ? Conclu?do (+ Contrata??o / Cancelado)  

**Contratar:** Backlog ? Prospectar ? An?lise de ader?ncia ? Proposta ? Negocia??o ? Conclu?do | Cancelado  
