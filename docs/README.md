# Documentação AgileFlow (`docs/`)

Estratégia de documentação em três níveis (skill `architect-bpm-reverse-engineer`):

| Nível | Pasta | Público |
| :--- | :--- | :--- |
| Técnico | [`técnico/`](técnico/README.md) | Desenvolvimento — Mermaid, RACI, rastreabilidade ao código |
| Utilizador | [`usuario/`](usuario/README.md) | Quem opera a aplicação — sem jargão de API |
| Processo | [`processo/`](processo/README.md) | Analista / BPMN / ficha tabular |

## Coerência do fluxo principal

O ciclo **Solicitação → Priorização → Projeto/Programa → Entrega** (e RTD opcional) deve permanecer alinhado entre:

1. `usuario/05-fluxo-processo-negocio.md`
2. `processo/01-fluxo-processo-negocio-bpmn.xml`
3. `processo/02-documentacao-processo.md`
4. `técnico/05-gestao-projetos-demandas.md`

## Material legado / complementar (raiz de `docs/`)

| Ficheiro | Nota |
| :--- | :--- |
| `MODULES.md` | Guia para criar módulos |
| `ARQUITETURA_MODULARIZADA.md` | Arquitetura modular |
| `fluxo-projeto.md` / `fluxo-programa.md` | Detalhe operacional PMO |
| `ROADMAP.md`, `crm-extensions-backlog.md` | Planeamento / backlog (inclui CRM legado) |
| `analise-processo-prospectar-solucoes-ti.md` + `de-para-prospectar-solucoes-ti.md` | MSN — processo 05 Prospectar |
| `analise-processo-desenvolver-solucoes-ti.md` + `de-para-desenvolver-solucoes-ti.md` | MSN — processo 02 Desenvolver |

> Em 2026-07 o backend **seedativo** ativa `projetos`, `teamops`, `produtos`, `indicadores`, `rtd` e desativa no registry `crm`, `estoque`, `pdv`, `atendimento`, `propostas_contratos`. Documentação nova reflete esse estado do código.
