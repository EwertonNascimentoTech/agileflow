# Mem?rias do AgileFlow (`.claude/`)

O **`CLAUDE.md` da raiz** ? o arquivo lido em toda sess?o (Claude Code / Cursor). Estes arquivos em `.claude/` s?o a **mem?ria viva** do que o sistema j? faz — para um pedido novo n?o apagar o que j? existe.

| Arquivo | Para qu? |
| :--- | :--- |
| [`../CLAUDE.md`](../CLAUDE.md) | Contexto curto, sempre carregado |
| [sistema-atual.md](sistema-atual.md) | Invent?rio: m?dulos, telas, APIs ativas |
| [invariantes.md](invariantes.md) | Regras que **n?o se quebra** sem pedido expl?cito |
| [historico.md](historico.md) | O que mudou e por qu? (append-only) |

H? uma c?pia velha em `prototipo/uploads/agileflow-hml/CLAUDE.md`. **N?o usar.** A fonte ? s? o `CLAUDE.md` da raiz.

## Obrigat?rio em toda altera??o

1. Ler `invariantes.md` e o trecho relevante de `sistema-atual.md` **antes** de editar.
2. N?o remover, simplificar nem “limpar” funcionalidade existente para caber o pedido novo.
3. Ao terminar, **acrescentar uma entrada em `historico.md`** (data, o qu?, por qu?, o que n?o mexer).
4. Se nasceu tela, rota, regra de kanban ou invariante nova, atualizar `sistema-atual.md` / `invariantes.md` **e** o resumo no `CLAUDE.md` da raiz, se a regra for permanente.
