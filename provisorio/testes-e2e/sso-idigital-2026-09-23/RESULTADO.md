# E2E — Login pelo IDigital (SSO OIDC) — 23/09/2026

Executado contra o sistema no ar (`tenant_ss`, nginx `:18082`). Os testes não mudam a configuração real
(SSO ligado em produção desde 23/09/2026, client cadastrado no IdP).

**Resultado: 37/37 verificações de backend + 17/17 verificações de tela.**

## Backend (`service_test.py`, dentro do `saas_api`)

IdP falso: chave RSA gerada no teste, discovery/JWKS injetados no cache do `SsoService`. Tudo numa
transação desfeita no fim (commit vira flush); chaves de reuso no Redis apagadas.

- 1º login vincula pelo e-mail (sem diferenciar maiúsculas); último acesso e auditoria `sso_login`.
- Mesmo id_token não serve duas vezes; logins seguintes casam pelo `sub` mesmo com o e-mail trocado no IdP.
- Sem login e fora de Pessoas: vira cliente do Portal (project_clients + login com a função de cliente), nome do IDigital
  (nome + sobrenome), sem projetos, observação "IDigital", auditoria `provisioned=cliente`; 2º login casa pelo `sub`.
- Em Pessoas sem login: vira colaborador ligado à Pessoa, role do cargo, nome de Pessoas, `provisioned=colaborador`.
  Pessoa desligada: 403 e não vira cliente. Tenant de clientes inexistente: 403 auditado.
- Recusas: usuário já ligado a outra conta (409), inativo (403, sem vínculo),
  `aud`/`iss` errados, outra chave, HS256, expirado, `iat` antigo, `kid` desconhecido, sem e-mail, `at_hash` sem/errado, lixo.
- SSO desligado: troca 404 e config `{"enabled": false}`; ligado: config só com dados do client público.
- Rota HTTP `/auth/sso/exchange` devolve o mesmo formato do `/login`, com token do próprio usuário (sub, role, tenant); reuso 401.
- Nada fica no banco.

## Telas (`ui_test.py`, Playwright) — prints em `prints/`

IdP simulado no navegador (discovery, authorize, token, end_session); a CSP e o PKCE do `oidc-client-ts` são reais.
A troca é simulada (recusa, e sucesso com a sessão real de um usuário `[E2E]` obtida pelo login por senha).

1. Config real do servidor: botão IDigital só se `/auth/sso/config` disser `enabled`; formulário de senha sempre.
2. SSO ligado: botão "Entre com o IDigital" + separador; discovery liberada pela CSP; authorize com client, redirect exato,
   code + PKCE S256, scope e resource; token com `code_verifier` e sem `client_secret`; troca recebe id_token + access_token;
   recusa com mensagem e "Voltar ao login"; sem violação de CSP nem erro de JS.
3. Sucesso: sessão AgileFlow aberta, cai no `/dashboard` (`auth_via = sso`); "Sair" passa pelo `end_session`
   (`id_token_hint`, `post_logout_redirect_uri = /login`) e limpa a sessão.
4. Login por senha com o SSO ligado; "Sair" não chama o IdP.
5. Cancelamento no IdP vira "Login no IDigital cancelado."

## Como rodar

```bash
cd provisorio/testes-e2e/sso-idigital-2026-09-23
./run.sh
```

## Ativação em produção (23/09/2026)

Client público cadastrado no IdP (redirect `/sso/callback`, recurso = origem, pós-logout `/login`, backchannel vazio).
`SSO_*` no `.env` + `docker compose up -d api`. Smoke no domínio público: botão aparece; o clique leva ao login do
IDigital (`/interaction/...`, sem erro de client/redirect/resource). A API alcança discovery (`iss` = host) e JWKS (3 chaves).
1º login real no mesmo dia (23:05): colaborador vinculado pelo e-mail (o id_token traz `email`), auditoria `sso_login` com `linked_now`.

Observação: o `nginx.conf` do front não entrega os cabeçalhos de segurança (CSP, X-Frame-Options, nosniff) no HTML,
porque o `location /` tem `add_header` próprio. A checagem "discovery liberada pela CSP" do teste de tela, portanto,
não exercita CSP. É anterior ao SSO; corrigir à parte, com teste das telas.
