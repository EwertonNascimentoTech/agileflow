# Fluxo — Soluções com IA

A área de negócio pede, pelo **Portal do Cliente**, a análise de uma solução que ela mesma vai construir numa ferramenta de IA autorizada (ex.: Base44). Aprovada e construída, a TI adequa, publica e sustenta.

- **Kanban:** "Soluções com IA" (processo TD), criado pelo sistema (`AiSolutionsService.ensure`).
- **Tipo:** "Solicitar análise de solução com IA" (slug `solucao_ia`) — só o Portal abre; não aparece em "Solicitar".
- **Código:** IA-0001, IA-0002…
- **Cliente:** quem entra pelo IDigital com acesso de cliente. Age só pelo Portal.
- **Fluxo livre:** o time pode mover para qualquer raia; o que trava é o formulário da etapa e o motivo obrigatório.
- **Fora de:** Capacidade e relatórios de portfólio (PO Sync, Status Report).

## Raias

| # | Raia (chave) | Quem age | Para sair |
| :--- | :--- | :--- | :--- |
| 1 | Solicitação (`solicitacao`) | Cliente (Portal) | Pedido completo — o card vai sozinho para Análise |
| 2 | Análise e Aprovação (`analise`) | Coordenação | Checklist dos 9 pontos + parecer (opcionais) |
| 3 | Aguardando Desenvolvimento pelo Cliente (`aguardando_cliente`) | Cliente (Portal) | "Tenho uma versão funcional": link da versão + repositório Git |
| 4 | Apresentação da Solução (`apresentacao`) | Coordenação / PO | **Responsável (PO) obrigatório**; checklist dos 8 itens |
| 5 | Desenvolvimento / Adequação Técnica (`adequacao`) | Desenvolvimento | **Repositório oficial** |
| 6 | DevOps — Preparação e Homologação (`devops_hml`) | DevOps | **URL de homologação** + **pipeline validada** |
| 7 | Homologação Funcional (`homologacao`) | Cliente (Portal) | Aprova → Segurança; reprova (com o que falhou) → Adequação |
| 8 | Segurança da Informação (`seguranca`) | Segurança | **Parecer de segurança** |
| 9 | Liberação para Produção (`liberacao`) | Coordenação / PO | Os **7 itens** marcados |
| 10 | DevOps — Deploy em Produção (`devops_prod`) | DevOps | URL, data, repositório, pipeline, ambiente, responsáveis, banco, sustentação |
| 11 | Produção (`producao`, final) | — | — |
| — | Necessita Ajustes (`necessita_ajustes`) | Cliente (Portal) ajusta e reenvia → Análise | Motivo obrigatório ao entrar |
| — | Não Aprovado (`nao_aprovado`, final) | — | Justificativa obrigatória ao entrar |
| — | Cancelado (`cancelado`, final) | Cliente (Portal) ou time | Motivo obrigatório ao entrar |

Negrito = obrigatório para avançar (formulário da etapa). Os checklists não obrigatórios são guia da etapa.

## Regras

- **Motivo obrigatório** (HTTP 428 `stage_reason_required` → diálogo "Motivo"): ao entrar em Necessita Ajustes, Não Aprovado e Cancelado (`entry_reason_required` na etapa, vale para qualquer kanban) e ao **voltar** etapa no fluxo principal. O motivo vira comentário: **público** (cliente vê no Portal) quando o destino é do cliente ou a volta sai da Homologação; **interno** entre etapas do time (ex.: achados de Segurança).
- **Formulário por etapa:** cada seção é editável na sua etapa e visível depois; o pedido do cliente é editável em Solicitação e Necessita Ajustes.
- **Comentários do time:** no card, "Visível ao cliente" manda a mensagem ao Portal e avisa o cliente; o padrão é nota interna.
- **Avisos:** pedido novo, Apresentação e Liberação → coordenação (Coordenador, Administrativo (Coordenação), Coord. de Arq./Dev) e o PO; Adequação → responsável; DevOps → cargo DevOps; Segurança → cargo Segurança da Informação; cliente → aprovada, precisa de ajustes, não aprovada, pronta para homologação, em produção, cancelada e mensagens públicas.
- **Cargos:** as pessoas de DevOps e de Segurança da Informação são cadastradas em Times com esses cargos.

## Portal do Cliente

Menu **Soluções com IA**: lista, "Solicitar análise", detalhe com linha do tempo em 8 passos, "Sua vez" (ajustar e reenviar · informar versão funcional · aprovar ou reprovar a homologação), mensagens com a TI e cancelamento com motivo.
