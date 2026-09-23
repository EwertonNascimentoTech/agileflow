# provisorio/

Arquivos que **não são usados para rodar o sistema**. Nada aqui é lido pelo backend, pelo
frontend, pelo Docker Compose ou pelo módulo de Documentação. Pode ser consultado, reaproveitado ou
apagado sem afetar o AgileFlow.

O que roda o sistema fica na raiz: `backend/`, `frontend/`, `docker-compose.yml`, `.env`
(`.env.example` é o modelo), `docs/` (montado na API em `/docs` — módulo Documentação),
`backup/` (imagem do serviço de backup) e `backups/` (dumps gerados por ele).

| Pasta | Conteúdo |
|---|---|
| `planilhas/` | `cronograma_dev_jul2026.csv` — itens de User Story com prazo, conclusão e resultado (jul/2026) |
| | `denominador_dev_jul2026.csv` — User Stories com prazo e situação (jul/2026) |
| | `produtos_repositorios.csv` / `.xlsx` — produtos com os repositórios Azure DevOps (organização, projeto, repositório, link) |
| | `projetos_fora_da_regra.xlsx` — planilha de projetos "fora da regra" (exportação) |
| `notas/` | `integracao-epa.md` — integração IDReport × EPA (planos de ação); citado em `docs/técnico/07-rtd-epa.md` |
| | `epa_acompanhamentos.md` — endpoints de acompanhamento de planos de ação do EPA |
| | `PROMPT-tutorial-prints-claude-code.md` — prompt para gerar o tutorial com prints (saiu de `docs/usuario/`: a Documentação mostrava a todos) |
| `scripts/` | `e2e_flow_pmo.py` — simulação antiga do fluxo PMO → Planejamento → Desenvolvimento no `tenant_ga` |
| `prototipos/` | `prototipo/` — protótipo HTML/JSX do layout (citado em `frontend/src/styles/agileflow.css`), com prints e uma cópia antiga do `CLAUDE.md` em `uploads/agileflow-hml/` (**não usar**) |
| | `prototipo2/` — protótipo do Cronograma/Gantt (citado em `GanttChart.tsx`) |
| `skills/` | `architect-bpm-reverse-engineer/SKILL.md` — skill de documentação/BPM a partir do código |
| `testes-e2e/` | `operacao-assistida-2026-09-23/` — roteiros, prints e resultado do E2E das Fases 1–5 (ver `RESULTADO.md`) |

`*.xlsx` continuam fora do git (`.gitignore`); os CSVs de jul/2026 não são versionados.
