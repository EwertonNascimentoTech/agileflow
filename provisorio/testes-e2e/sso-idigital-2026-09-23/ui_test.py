"""Telas do SSO IDigital (Playwright/Chromium) contra o sistema no ar.
O IdP é simulado no navegador (discovery, authorize, token, end_session): a CSP e o fluxo PKCE do
oidc-client-ts são reais. A troca /auth/sso/exchange é simulada (recusa e sucesso com a sessão real
de um usuário [E2E] obtida pelo login por senha), porque o SSO segue desligado no servidor."""
import base64, json, os, time, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

W = "/work"
URL = "http://localhost:18082"
AUTH = "https://sso.idigital.sistemafiea.com.br/sso/oidc"
ISS = "https://sso.idigital.sistemafiea.com.br"
CLIENT = "agileflow-e2e"
F = json.load(open(f"{W}/fixture.json"))
os.makedirs(f"{W}/prints", exist_ok=True)
report = []


def check(name, cond, detail=""):
    report.append((name, bool(cond)))
    print(("OK   " if cond else "FALHA"), name, "" if cond else detail)


def b64(d):
    return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()


def fake_id_token(nonce):
    now = int(time.time())
    claims = {"iss": ISS, "aud": CLIENT, "sub": "e2e-sub", "email": F["email"], "iat": now, "exp": now + 3600}
    if nonce:
        claims["nonce"] = nonce
    return b64({"alg": "RS256", "kid": "e2e"}) + "." + b64(claims) + ".assinatura-e2e"


def real_session():
    req = urllib.request.Request(f"{URL}/api/v1/auth/login", data=json.dumps({"email": F["email"], "password": F["password"]}).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


CORS = {"access-control-allow-origin": URL, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS"}
META = {"issuer": ISS, "authorization_endpoint": AUTH + "/auth", "token_endpoint": AUTH + "/token",
        "end_session_endpoint": AUTH + "/session/end", "jwks_uri": AUTH + "/jwks", "userinfo_endpoint": AUTH + "/me",
        "response_types_supported": ["code"], "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"]}


def idp(ctx, exchange):
    cap = {"discovery": 0}

    def config(route):
        route.fulfill(json={"enabled": True, "provider": "idigital", "authority": AUTH, "client_id": CLIENT,
                            "resource": URL, "scope": "openid email profile"})

    def discovery(route):
        cap["discovery"] += 1
        route.fulfill(status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps(META))

    def authorize(route):
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(route.request.url).query))
        cap["authorize"] = q
        back = f"{URL}/sso/callback?" + urllib.parse.urlencode({"code": "e2e-code", "state": q.get("state", "")})
        route.fulfill(status=302, headers={"location": back})

    def token(route):
        if route.request.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        cap["token"] = dict(urllib.parse.parse_qsl(route.request.post_data or ""))
        cap["id_token"] = fake_id_token(cap.get("authorize", {}).get("nonce"))
        route.fulfill(status=200, headers={**CORS, "content-type": "application/json"},
                      body=json.dumps({"access_token": "e2e-access-token", "token_type": "Bearer", "expires_in": 3600,
                                       "id_token": cap["id_token"], "scope": "openid email profile"}))

    def exchange_route(route):
        cap["exchange"] = json.loads(route.request.post_data or "{}")
        if exchange == "deny":
            route.fulfill(status=403, json={"detail": f"O e-mail {F['email']} não tem acesso ao AgileFlow. Peça ao administrador para cadastrá-lo."})
        else:
            route.fulfill(status=200, json=real_session())

    def end_session(route):
        cap["end_session"] = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(route.request.url).query))
        route.fulfill(status=302, headers={"location": f"{URL}/login"})

    ctx.route("**/api/v1/auth/sso/config", config)
    ctx.route(AUTH + "/.well-known/openid-configuration", discovery)
    ctx.route(AUTH + "/auth?*", authorize)
    ctx.route(AUTH + "/token", token)
    ctx.route("**/api/v1/auth/sso/exchange", exchange_route)
    ctx.route(AUTH + "/session/end*", end_session)
    return cap


def new_ctx(browser):
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="pt-BR")
    page = ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    return ctx, page, errs


def shot(page, name):
    page.evaluate("window.scrollTo(0, 0)")
    page.screenshot(path=f"{W}/prints/{name}.png", full_page=True)


with sync_playwright() as p:
    browser = p.chromium.launch()

    # 1) Estado real (SSO desligado no servidor): tela de login como antes.
    ctx, page, errs = new_ctx(browser)
    page.goto(f"{URL}/login"); page.wait_for_load_state("networkidle")
    check("SSO desligado: login sem o botão IDigital", page.get_by_role("button", name="Entre com o IDigital").count() == 0)
    check("SSO desligado: formulário de senha segue lá", page.get_by_label("E-mail").count() == 1)
    shot(page, "01-login-sso-desligado")
    ctx.close()

    # 2) SSO ligado, e-mail sem acesso: fluxo PKCE até a troca, recusa com mensagem.
    ctx, page, errs = new_ctx(browser)
    cap = idp(ctx, "deny")
    page.goto(f"{URL}/login"); page.wait_for_load_state("networkidle")
    btn = page.get_by_role("button", name="Entre com o IDigital")
    check("SSO ligado: botão 'Entre com o IDigital' + separador", btn.count() == 1 and page.get_by_text("ou entre com e-mail e senha").count() == 1)
    shot(page, "02-login-com-idigital")
    btn.click()
    page.wait_for_url("**/sso/callback**", timeout=15000)
    page.get_by_text("não tem acesso ao AgileFlow").wait_for(timeout=15000)
    a = cap.get("authorize", {})
    check("discovery do IdP liberada pela CSP", cap["discovery"] >= 1)
    check("authorize: client, redirect exato, code + PKCE S256",
          a.get("client_id") == CLIENT and a.get("redirect_uri") == f"{URL}/sso/callback" and a.get("response_type") == "code"
          and a.get("code_challenge_method") == "S256" and len(a.get("code_challenge", "")) >= 43 and a.get("state"), f"{a}")
    check("authorize: scope openid email profile e resource", set(a.get("scope", "").split()) >= {"openid", "email", "profile"} and a.get("resource") == URL, f"{a}")
    t = cap.get("token", {})
    check("token: authorization_code com code_verifier (sem client_secret)",
          t.get("grant_type") == "authorization_code" and t.get("code") == "e2e-code" and len(t.get("code_verifier", "")) >= 43
          and t.get("client_id") == CLIENT and "client_secret" not in t and t.get("redirect_uri") == f"{URL}/sso/callback", f"{t}")
    ex = cap.get("exchange", {})
    check("troca manda id_token e access_token ao backend", ex.get("id_token") == cap.get("id_token") and ex.get("access_token") == "e2e-access-token", f"{list(ex)}")
    check("recusa mostrada na tela, com 'Voltar ao login'", page.get_by_role("link", name="Voltar ao login").count() == 1)
    check("sem violação de CSP nem erro de JS", not [e for e in errs if "Content Security Policy" in e or "pageerror" in e], f"{errs[:3]}")
    shot(page, "03-callback-sem-acesso")
    page.get_by_role("link", name="Voltar ao login").click()
    page.wait_for_url("**/login", timeout=10000)
    check("'Voltar ao login' volta para /login", page.url.endswith("/login"))
    ctx.close()

    # 3) Sucesso: sessão AgileFlow aberta pelo SSO; "Sair" encerra no IdP e volta ao /login.
    ctx, page, errs = new_ctx(browser)
    cap = idp(ctx, "ok")
    page.goto(f"{URL}/login"); page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Entre com o IDigital").click()
    page.wait_for_url("**/dashboard", timeout=20000)
    page.wait_for_load_state("networkidle")
    via = page.evaluate("localStorage.getItem('auth_via')")
    tok = page.evaluate("localStorage.getItem('access_token')")
    check("login SSO abre a sessão AgileFlow e cai no /dashboard", via == "sso" and bool(tok), f"{via} {bool(tok)}")
    shot(page, "04-dashboard-via-sso")
    page.get_by_role("button", name="Sair").first.click()
    page.wait_for_url("**/login", timeout=15000)
    es = cap.get("end_session", {})
    check("'Sair' passa pelo end_session do IdP (id_token_hint + post_logout_redirect_uri)",
          es.get("id_token_hint") == cap.get("id_token") and es.get("post_logout_redirect_uri") == f"{URL}/login", f"{es}")
    check("depois do 'Sair' a sessão local some", page.evaluate("localStorage.getItem('access_token')") is None
          and page.evaluate("localStorage.getItem('auth_via')") is None)
    ctx.close()

    # 4) Login por senha continua valendo e o 'Sair' não passa pelo IdP.
    ctx, page, errs = new_ctx(browser)
    cap = idp(ctx, "ok")
    page.goto(f"{URL}/login"); page.wait_for_load_state("networkidle")
    page.fill("#email", F["email"]); page.fill("#password", F["password"])
    page.get_by_role("button", name="Entrar", exact=True).click()
    page.wait_for_url("**/dashboard", timeout=20000)
    check("login por senha com o SSO ligado", page.evaluate("localStorage.getItem('auth_via')") is None)
    page.get_by_role("button", name="Sair").first.click()
    page.wait_for_url("**/login", timeout=15000)
    page.wait_for_timeout(1500)
    check("'Sair' de sessão por senha não chama o IdP", "end_session" not in cap)
    ctx.close()

    # 5) Usuário cancelou no IdP.
    ctx, page, errs = new_ctx(browser)
    idp(ctx, "ok")
    page.goto(f"{URL}/sso/callback?error=access_denied&state=x"); page.wait_for_load_state("networkidle")
    check("cancelamento no IdP vira mensagem clara", page.get_by_text("Login no IDigital cancelado.").count() == 1)
    shot(page, "05-callback-cancelado")
    ctx.close()
    browser.close()

print(f"\n=== SSO telas: {sum(ok for _, ok in report)}/{len(report)} OK")
