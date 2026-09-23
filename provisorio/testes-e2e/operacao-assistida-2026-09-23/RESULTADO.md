# E2E — Operação Assistida (Fases 1 a 5) — 23/09/2026

Executado contra o sistema no ar (`tenant_ss`, `agileflow` via nginx `:18082`), com dados isolados:
PO / Dev / Coordenador / Cliente de teste (`e2e.*@e2e-agileflow.com.br`) e projetos `[E2E] …`.
Tudo foi removido ao final (`run.sh cleanup-only` refaz a limpeza se preciso).

**Resultado: 72/72 verificações de API + 18/18 verificações de tela** (reexecutado após a auditoria de segurança: primeiro acesso agora é por link gerado por quem cadastra).

## API (HTTP real, com login)

| Fase | Verificação | Resultado |
|---|---|---|
| 1 | Primeiro acesso do PO/Dev/Coordenador (pelo link gerado no cadastro) cria o login pelo cargo | OK |
| 1 | PO verifica e-mail novo → `new`; cadastra cliente vinculado a 2 projetos | OK |
| 1 | E-mail já cadastrado → `client` (sem diferenciar maiúsculas); duplicado → 409 | OK |
| 1 | Dev sem permissão não acessa Clientes (403) | OK |
| 1 | Cliente cria senha no 1º acesso e faz login; `/auth/me` = `is_client` | OK |
| 1 | Cliente barrado em Processos e Pessoas (403); Portal lista os 2 projetos | OK |
| 1 | Abrir ocorrência fora da Operação Assistida → 400 | OK |
| 2 | Sem devs de atendimento o projeto não entra na OA (428 → modal do PO); PO define e move | OK |
| 2 | PO move projeto para Operação Assistida; cliente notificado; Portal passa a aceitar ocorrência | OK |
| 2 | Concluir sem passar pela OA → 428; com justificativa → conclui e grava o motivo | OK |
| 2 | PO Sync mostra o projeto como entregue com selo `em_operacao_assistida` | OK |
| 3 | Tipo "Ajuste (diferente do combinado)" não é mais aceito na abertura (422) | OK |
| 3 | Cliente envia anexo; abre ocorrência (Impede × Todos → P1, Backlog, `OC-0001`) | OK |
| 3 | PO notificado; time vê os dados do cliente | OK |
| 3 | Nota interna + mensagem pública: cliente vê só a pública e é notificado | OK |
| 3 | Cliente não vê causa raiz/classificação; baixa só anexos das próprias ocorrências | OK |
| 3 | Projeto com ocorrência aberta não conclui (400) | OK |
| 4 | Só o PO define devs fixos (dev → 403); divisão 50/30/20 gravada em Pessoas | OK |
| 4 | Dev assume (Ajustando + início das horas); PO assume no lugar; dev retoma | OK |
| 4 | Aguardando Cliente notifica o cliente; resposta volta para Ajustando e notifica o dev | OK |
| 4 | Dev não finaliza direto (403) | OK |
| 4 | Reprovar sem motivo → 400; reprovar com motivo → Ajustando (1 reprovação) | OK |
| 4 | Aprovar com NPS 9 → Finalizado, horas congeladas; não reabre; não aceita mensagem | OK |
| 4 | Melhoria (P4) notifica o dev fixo; classificar → Melhoria – Análise PO | OK |
| 4 | Arrastar para Encaminhada → 400; dev encaminhar → 403 | OK |
| 4 | PO cria projeto de Release, melhoria vira Feature, cliente é avisado | OK |
| 4 | Job Celery real: 1h útil sem responsável avisa PO e dev fixo | OK |
| 4 | PO finaliza sem homologação (registrado `finalized_by_team`) | OK |
| 5 | Pessoas mostra 50/30/20; Projetos + OA > 100% → 400; ajuste 40/40/20 | OK |
| 5 | Lista de Pessoas e dashboard do TeamOps trazem a divisão | OK |
| 5 | Heatmap: reservas do dev (OA 3,2h / Chamados 1,6h por dia) mesmo sem US | OK |
| 5 | Detalhe do dia com as 3 fatias; horas da ocorrência nas horas realizadas | OK |
| 2 | Sem ocorrências abertas o projeto conclui; Portal deixa de aceitar ocorrências | OK |

## Telas (Chromium/Playwright) — prints em `prints/`

Cliente: login cai no Portal; Meus projetos; Ocorrências (com filtro e encerradas); ocorrência
homologada (NPS, conversa pública, anexo, andamento); melhoria encaminhada; dúvida em aberto;
nova ocorrência; tentativa de abrir `/app/...` volta ao Portal. PO: Clientes; verificação de
e-mail já cadastrado; Capacidade (sub-linhas Operação Assistida / Chamados). Coordenador: lista de
Pessoas (coluna Jornada), detalhe da pessoa (barra 40/40/20), dashboard (Capacidade diária do time).

Sem erros de JavaScript nas telas novas. Único aviso no console: `403 /company/admin/roles` no
Dashboard da empresa para usuário comum — comportamento anterior (DashboardPage de 17/08), não
relacionado à Operação Assistida.

## Achado durante o teste

A raia Operação Assistida trava o cronograma (`locks_schedule`), como DEVSECOPS: projeto sem
Features/US não entra nela ("Cronograma vazio"). Para projetos reais não há impacto — quem chega
em DEVSECOPS já passou por esse gate.

## Como rodar de novo

```bash
cd provisorio/testes-e2e/operacao-assistida-2026-09-23
./run.sh              # ciclo completo (cria, testa, limpa)
./run.sh cleanup-only # só limpeza
```
