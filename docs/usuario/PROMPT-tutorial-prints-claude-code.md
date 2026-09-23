# Prompt — tutorial passo a passo com prints (Claude Code)

Copie o bloco abaixo e cole numa sess?o do **Claude Code** (com browser/Playwright dispon?vel). Ajuste `BASE_URL`, e-mail e senha antes de colar.

---

```
Voc? ? um redator de tutorial de produto. Sua miss?o ? NAVEGAR na aplica??o AgileFlow (Kore 2.0) como um usu?rio real, TIRAR PRINTS de cada tela relevante e GERAR um tutorial passo a passo em Markdown, em portugu?s do Brasil, com as imagens embutidas.

N?o invente labels, bot?es ou fluxos. S? documente o que aparecer na tela. Se um passo n?o existir no tenant, registre como “n?o dispon?vel neste ambiente” e siga.

????????????????????????????????????????
AMBIENTE
????????????????????????????????????????
- App: ${BASE_URL}   # ex.: http://localhost  ou  https://agileflow.exemplo.com
- Login: ${EMAIL}    # usu?rio company_admin ou coordenador (n?o use PO Externo)
- Senha: ${SENHA}
- Viewport principal: 1440ª900 (desktop). Se sobrar tempo, um print extra em 390ª844 (mobile) s? da home do quadro.
- Pasta de prints: docs/usuario/prints/tutorial-fluxos/
- Tutorial de sa?da: docs/usuario/06-tutorial-passos-com-prints.md
- Regras de neg?cio de refer?ncia (N?O copiar o texto; usar s? para escolher o roteiro):
  docs/processo/04-regras-negocio-fluxos-cronograma.md

Antes de come?ar:
1. Confirme que o app responde (abra /login).
2. Crie a pasta de prints se n?o existir.
3. Nomeie arquivos: 01-login.png, 02-dashboard.png, … (dois d?gitos, kebab-case, sem espa?os).
4. Prints em PNG. ?rea vis?vel da p?gina (n?o a tela inteira do SO). Recorte UI chrome do browser (barra de endere?o) se a ferramenta permitir.
5. Espere a rede/idle: skeleton sumir, kanban carregar colunas, drawers animarem (~500–800 ms).
6. N?o commite. N?o altere c?digo de produto. N?o apague dados. Evite criar cards reais; se precisar, use t?tulo prefixo [TUTORIAL] e avise no MD.
7. N?o coloque senha, token nem dados pessoais reais no tutorial. Mascare e-mails se necess?rio.

????????????????????????????????????????
COMO NAVEGAR E PRINTAR
????????????????????????????????????????
- Use as ferramentas de browser (abrir, clicar, preencher, screenshot).
- Sempre: abrir URL ? esperar conte?do ? print ? anotar o texto vis?vel (t?tulo H1, tabs, bot?o prim?rio).
- Se um modal/drawer abrir, print DEPOIS de aberto, com o conte?do vis?vel (role para baixo se necess?rio).
- Se o kanban tiver v?rios funis, use o seletor de funil/processo da tela e print o quadro de CADA fluxo do roteiro.
- Se pedir login de novo, autentique e continue.
- Se 403/p?gina vazia, print o estado + anote a permiss?o que faltou; n?o force.

Rotas ?teis (prefixo ${BASE_URL}):
- /login
- /app/dashboard
- /app/modules/projetos/solicitacoes
- /app/modules/projetos/minhas
- /app/modules/projetos          (quadro / board)
- /app/modules/projetos/board
- /app/modules/projetos/gantt    ou /cronograma
- /app/modules/projetos/matriz
- /app/modules/projetos/capacidade
- /app/modules/projetos/config/cronograma
- /app/modules/projetos/config/statuses
- /app/modules/projetos/config/funnels
- /app/modules/projetos/config/priorizacao
- /app/modules/teamops
- /app/modules/teamops/people
- /app/modules/teamops/absences
- /app/modules/produtos
- /app/modules/indicadores
- /app/modules/rtd/reunioes

Funis a localizar no seletor do quadro (nomes aproximados; use o r?tulo REAL da tela):
1. Prospectar Solu??es
2. Contratar
3. Projetos e Programas
4. Features
5. User Story (ou US)

????????????????????????????????????????
ROTEIRO DE PRINTS (obrigat?rio, nesta ordem)
????????????????????????????????????????

A) Entrar
1. Tela de login (vazia, sem senha vis?vel).
2. Ap?s entrar: dashboard / vis?o geral da empresa.
3. Menu lateral expandido mostrando Processos, Times, Produtos (o que existir).

B) Abrir solicita??o
4. Nova Solicita??o — formul?rio.
5. Minhas Solicita??es — lista.

C) Prospectar
6. Quadro Prospectar (vis?o kanban completa).
7. Abrir um card (drawer): cabe?alho, etapa, campos de classifica??o se existirem.
8. Se existir di?logo “Classificar” / “Ser? contratado?”, print aberto.
9. Colunas finais vis?veis (Conclu?do / Rejeitado / Cancelado / Contrata??o).

D) Contratar (se o funil existir)
10. Quadro Contratar.
11. Card em Proposta/Negocia??o (drawer), destacando anexo/valor se a UI mostrar.
12. Etapas Conclu?do e Cancelado vis?veis no quadro.

E) Projetos e Programas
13. Quadro Projetos e Programas.
14. Card de Projeto aberto (drawer) — datas in?cio/prazo se existirem.
15. Card de Programa (selo de itens / % / ?ltima entrega), se houver.
16. Aba Filhos ou a??o “Enviar para desenvolvimento”, se existir.
17. Di?logo de convers?o “Aprovar e criar Projeto/Programa”, se conseguir abrir sem gravar; sen?o, print da etapa que dispara a convers?o.

F) Cronograma
18. Configura??es ? Cronograma (etapas com obrigat?rio).
19. Gantt / Cronograma de um projeto com barras.
20. Banner/trava de baseline se o projeto estiver travado; sen?o, print do Gantt + nota “baseline n?o vis?vel neste dado”.
21. Tentativa visual do gate: card numa etapa que exige datas (drawer com in?cio/prazo vazios, se houver). N?O force erro destrutivo.

G) Features e US
22. Quadro Features.
23. Feature aberta mostrando filhas / selos.
24. Quadro User Story.
25. US aberta: checklist e (se existir) evid?ncia de commit / justificativa.

H) Times e impacto
26. TeamOps ? Pessoas (lista; sem bot?o de criar se o usu?rio n?o for gestor — documente o que vir).
27. Aus?ncias: Calend?rio (m?s correto), Lista, Aprova??es.
28. Aba An?lise de impacto, se existir.

I) Fechamento
29. Matriz de prioriza??o (se houver cards pontuados).
30. Capacidade (cockpit).
31. Configura??es ? Etapas (para mostrar SLA / gerar card / mover kanban), um print panor?mico.

????????????????????????????????????????
TUTORIAL DE SA?DA
????????????????????????????????????????
Gere docs/usuario/06-tutorial-passos-com-prints.md com esta estrutura:

# Tutorial visual — da solicita??o ? entrega

Introdu??o (1 par?grafo): para quem ?, o que vai conseguir fazer, ambiente (sem senha).

Para cada cap?tulo A–I:
## N. T?tulo do fluxo
Objetivo em 1 frase.
### Passo n — a??o do usu?rio
- Onde clicar (nome EXATO do bot?o/menu).
- O que acontece.
- Print: ![descri??o](prints/tutorial-fluxos/XX-arquivo.png)
- Dica / regra de neg?cio em 1 linha (gate de datas, trava de contratar, etc.) quando a tela ilustrar isso.

No fim:
## Mapa r?pido das telas (tabela: fluxo | URL | print)
## O que n?o foi poss?vel capturar (lista honesta)
## Pr?ximos passos sugeridos ao leitor

Estilo:
- Portugu?s do Brasil, voc? (tutoriais de produto), frases curtas.
- N?o use jarg?o de c?digo (n?o citar require_fill, locks_schedule, UUIDs).
- M?x. ~2 prints por passo; n?o despeje 40 imagens sem texto.
- Alt text em portugu?s descrevendo o que a imagem mostra.

Quando terminar, devolva:
1. Caminho do MD.
2. Quantidade de prints gerados.
3. Funis/telas que faltaram.
4. Qualquer dado [TUTORIAL] que voc? tenha criado.
```

---

## Vari?veis para preencher

| Vari?vel | Exemplo |
| :--- | :--- |
| `BASE_URL` | `http://localhost` |
| `EMAIL` | usu?rio **admin da empresa** ou **coordenador** |
| `SENHA` | n?o grave no git; passe s? no chat |

Seed local t?pico (s? se o tenant ainda for o de desenvolvimento): ver `CLAUDE.md` / `README.md` (`admin@kore.com`). Em produ??o use uma conta de demonstra??o.

## Dicas se o Claude travar

- Funil com outro nome: use o seletor da UI; n?o procure o slug.
- Drawer corta o print: role at? o bloco (datas, classifica??o, filhos) e tire um segundo crop.
- Login em loop: limpe cookies do dom?nio e tente de novo.
- App atr?s de nginx na porta 80: n?o use `:5173` a menos que o Vite esteja exposto.
