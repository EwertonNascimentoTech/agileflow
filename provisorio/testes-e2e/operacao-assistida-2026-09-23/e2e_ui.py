"""E2E visual (Playwright/Chromium) nas telas da Operação Assistida. Salva prints em /work/ui/."""
import json, os
from playwright.sync_api import sync_playwright

W = "/work"
S = json.load(open(f"{W}/e2e_state.json"))
OCC = S["state"]["occ"]
URL = "http://localhost:18082"
PWD = "E2e!Teste2026x"
os.makedirs(f"{W}/ui", exist_ok=True)
report = []


def login(page, email):
    page.goto(f"{URL}/login")
    page.fill('input[name="email"]', email)
    page.fill('input[name="password"]', PWD)
    page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle")


def shot(page, name, url=None, wait_text=None):
    if url:
        page.goto(f"{URL}{url}")
    page.wait_for_load_state("networkidle")
    ok = True
    if wait_text:
        try:
            page.get_by_text(wait_text, exact=False).first.wait_for(timeout=15000)
        except Exception:
            ok = False
    page.screenshot(path=f"{W}/ui/{name}.png", full_page=True)
    report.append({"tela": name, "url": page.url.replace(URL, ""), "achou": wait_text, "ok": ok})


with sync_playwright() as p:
    browser = p.chromium.launch()
    for who, email in (("cliente", "e2e.cliente@e2e-agileflow.com.br"),
                       ("po", "e2e.po@e2e-agileflow.com.br"),
                       ("coord", "e2e.coord@e2e-agileflow.com.br")):
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="pt-BR")
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e, errors=errors: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m, errors=errors: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        login(page, email)
        if who == "cliente":
            report.append({"tela": "cliente-login-redireciona", "url": page.url.replace(URL, ""), "ok": page.url.endswith("/portal")})
            shot(page, "01-portal-meus-projetos", wait_text="Meus projetos")
            shot(page, "02-portal-ocorrencias", "/portal/ocorrencias?minhas=1", wait_text="Ocorrências")
            page.get_by_label("Mostrar encerradas").check()
            shot(page, "03-portal-ocorrencias-com-encerradas", wait_text="Relatório não gera PDF")
            shot(page, "04-portal-ocorrencia-homologada", f"/portal/ocorrencias/{OCC['occ1']}", wait_text="Homologada em")
            shot(page, "05-portal-ocorrencia-melhoria", f"/portal/ocorrencias/{OCC['occ2']}", wait_text="classificada como melhoria")
            shot(page, "06-portal-dúvida-em-aberto", f"/portal/ocorrencias/{OCC['occ3']}", wait_text="Como filtro por data")
            shot(page, "07-portal-nova-ocorrencia", "/portal/ocorrencias/nova", wait_text="Nova ocorrência")
            page.goto(f"{URL}/app/modules/projetos/board"); page.wait_for_load_state("networkidle")
            report.append({"tela": "cliente-barrado-no-app", "url": page.url.replace(URL, ""), "ok": "/portal" in page.url})
        elif who == "po":
            shot(page, "10-clientes", "/app/modules/projetos/clientes", wait_text="Cliente Teste E2E")
            page.get_by_role("button", name="Novo cliente").first.click()
            page.fill("#cl-email", "e2e.cliente@e2e-agileflow.com.br")
            page.get_by_role("button", name="Verificar").click()
            shot(page, "11-clientes-email-ja-cadastrado", wait_text="já é de um cliente cadastrado")
            page.keyboard.press("Escape")
            shot(page, "12-capacidade", "/app/modules/projetos/capacidade", wait_text="Dev Teste E2E")
        else:
            shot(page, "20-pessoas-lista", "/app/modules/teamops/people", wait_text="Jornada")
            shot(page, "21-pessoa-detalhe", f"/app/modules/teamops/people/{json.load(open(f'{W}/e2e_ids.json'))['people']['dev']}", wait_text="Operação Assistida")
            shot(page, "22-teamops-dashboard", "/app/modules/teamops", wait_text="Capacidade diária do time")
        report.append({"tela": f"erros-js-{who}", "ok": not [e for e in errors if "favicon" not in e], "erros": errors[:8]})
        ctx.close()
    browser.close()
json.dump(report, open(f"{W}/ui/report.json", "w"), ensure_ascii=False, indent=1)
for r in report:
    print(("OK   " if r["ok"] else "FALHA"), r["tela"], r.get("url", ""), "" if r["ok"] else r.get("erros", r.get("achou")))
