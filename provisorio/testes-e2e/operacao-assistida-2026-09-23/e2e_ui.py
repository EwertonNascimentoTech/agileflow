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
    page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
    page.wait_for_load_state("networkidle")


def shot(page, name, url=None, wait_text=None):
    if url:
        page.goto(f"{URL}{url}")
    page.wait_for_load_state("networkidle")
    ok = True
    if wait_text:
        try:
            page.get_by_text(wait_text, exact=False).locator("visible=true").first.wait_for(timeout=15000)
        except Exception:
            ok = False
    page.evaluate("window.scrollTo(0, 0)")  # cabeçalho fixo: print de página inteira a partir do topo
    page.wait_for_timeout(300)
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
        # Falhas de rede vão pelo evento "response" (com URL). /company/admin/roles no dashboard
        # da empresa é o 403 conhecido (anterior à Operação Assistida) — não conta.
        page.on("console", lambda m, errors=errors: errors.append(f"console.{m.type}: {m.text}")
                if m.type == "error" and "Failed to load resource" not in m.text else None)
        page.on("response", lambda r, errors=errors: errors.append(f"http {r.status}: {r.url.replace(URL, '')}")
                if r.status >= 400 and "/api/" in r.url and "/company/admin/roles" not in r.url else None)
        login(page, email)
        if who == "cliente":
            report.append({"tela": "cliente-login-redireciona", "url": page.url.replace(URL, ""), "ok": page.url.endswith("/portal")})
            shot(page, "01-portal-meus-projetos", wait_text="Meus projetos")
            report.append({"tela": "inicio-mostra-o-que-depende-do-cliente", "ok": page.get_by_text("Precisa da sua atenção").count() == 1})
            shot(page, "02-portal-ocorrencias", "/portal/ocorrencias?minhas=1", wait_text="Ocorrências")
            page.get_by_role("tab", name="Encerradas").click()
            shot(page, "03-portal-ocorrencias-com-encerradas", wait_text="Relatório não gera PDF")
            shot(page, "04-portal-ocorrencia-homologada", f"/portal/ocorrencias/{OCC['occ1']}", wait_text="Homologada em")
            shot(page, "05-portal-ocorrencia-melhoria", f"/portal/ocorrencias/{OCC['occ2']}", wait_text="classificada como melhoria")
            shot(page, "06-portal-dúvida-em-aberto", f"/portal/ocorrencias/{OCC['occ3']}", wait_text="Como filtro por data")
            shot(page, "07-portal-nova-ocorrencia", "/portal/ocorrencias/nova", wait_text="Nova ocorrência")
            report.append({"tela": "nova-seleciona-o-unico-projeto",
                           "ok": "[E2E] Projeto com Operação Assistida" in page.get_by_role("combobox").first.inner_text()})
            page.get_by_role("button", name="Enviar ocorrência").click()
            shot(page, "07b-portal-nova-validacao", wait_text="Escolha o tipo da ocorrência.")
            # Aguardando Cliente: clicar na linha (fora do título) abre o detalhe; "Responder" leva à caixa de mensagem.
            page.goto(f"{URL}/portal/ocorrencias?minhas=1"); page.wait_for_load_state("networkidle")
            row = page.locator("tr", has_text="Botão Salvar não responde")
            shot(page, "08-portal-lista-aguardando-resposta", wait_text="Aguardando sua resposta")
            row.locator("td").nth(1).click()
            try:
                page.wait_for_url(f"**/portal/ocorrencias/{OCC['occ4']}", timeout=10000); nav = True
            except Exception:
                nav = False
            report.append({"tela": "clique-na-linha-abre-detalhe", "url": page.url.replace(URL, ""), "ok": nav})
            page.get_by_text("Qual navegador você usa?").first.wait_for(timeout=15000)
            page.get_by_role("button", name="Responder").click()
            page.wait_for_timeout(600)
            focused = page.evaluate("document.activeElement && document.activeElement.tagName === 'TEXTAREA'")
            report.append({"tela": "responder-foca-a-caixa", "ok": bool(focused)})
            page.get_by_placeholder("Escreva sua mensagem").fill("Uso o Chrome 128.")
            page.get_by_role("button", name="Enviar").click()
            shot(page, "09-portal-resposta-enviada", wait_text="voltou para o time")
            report.append({"tela": "resposta-sai-de-aguardando", "ok": page.get_by_text("Aguardando sua resposta").count() == 0})
            # Celular (390 px): sem rolagem horizontal em nenhuma tela do Portal.
            page.set_viewport_size({"width": 390, "height": 844})
            for nome, url, txt in (("30-celular-inicio", "/portal", "Como podemos ajudar hoje?"),
                                   ("31-celular-ocorrencias", "/portal/ocorrencias?minhas=1&situacao=todas", "Relatório não gera PDF"),
                                   ("32-celular-detalhe", f"/portal/ocorrencias/{OCC['occ1']}", "Homologada em"),
                                   ("33-celular-nova", "/portal/ocorrencias/nova", "Nova ocorrência")):
                shot(page, nome, url, wait_text=txt)
                sobra = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                report.append({"tela": f"{nome}-sem-rolagem-horizontal", "ok": sobra <= 0, "erros": [f"sobra {sobra}px"]})
            page.set_viewport_size({"width": 1440, "height": 900})
            # Tema escuro: início e detalhe (contraste dos cartões, faixas e etapas).
            page.goto(f"{URL}/portal"); page.wait_for_load_state("networkidle")
            page.get_by_role("button", name="Alternar tema").click()
            shot(page, "34-escuro-inicio", wait_text="Como podemos ajudar hoje?")
            shot(page, "35-escuro-detalhe", f"/portal/ocorrencias/{OCC['occ1']}", wait_text="Homologada em")
            page.get_by_role("button", name="Alternar tema").click()
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
