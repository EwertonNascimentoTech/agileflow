"""E2E HTTP da Operação Assistida (Fases 1–5) contra o sistema no ar, via nginx do frontend.
Dados isolados [E2E]; IDs gravados em e2e_state.json para a limpeza."""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request, uuid
from datetime import date, timedelta

SP = os.path.dirname(os.path.abspath(__file__))
BASE = "http://localhost:18082/api/v1"
PWD = "E2e!Teste2026x"
IDS = json.load(open(f"{SP}/e2e_ids.json"))
ST = IDS["statuses"]
CONTAINER = IDS["container"]
ROOT_OA, ROOT_SKIP = IDS["roots"]["oa"], IDS["roots"]["skip"]
state = {"users": {}, "occ": {}, "uploads": [], "release": None, "client_id": None}
results = []


def req(method, path, token=None, body=None, raw=None, ctype=None):
    url = BASE + path
    data, headers = None, {}
    if body is not None:
        data = json.dumps(body).encode(); headers["Content-Type"] = "application/json"
    if raw is not None:
        data = raw; headers["Content-Type"] = ctype
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt


def check(fase, nome, cond, detalhe=""):
    results.append((fase, nome, bool(cond), detalhe))
    print(f"[{'OK' if cond else 'FALHA'}] F{fase} {nome}" + (f" — {detalhe}" if detalhe and not cond else ""))


def first_access(email, token=None):
    """Primeiro acesso pelo link (token gerado por quem cadastrou a pessoa)."""
    token = token or IDS["links"][email.split("@")[0].split(".", 1)[1]]
    s, b = req("POST", "/auth/first-access/complete", body={"token": token, "password": PWD})
    assert s == 200, (s, b)
    return b["access_token"], b["user"]


def notifs(token):
    s, b = req("GET", "/company/admin/notifications?limit=50", token)
    return b if s == 200 else []


def patch_status(token, task_id, status_id, **extra):
    return req("PATCH", f"/projetos/projects/{CONTAINER}/tasks/{task_id}", token, {"status_id": status_id, **extra})


def upload(token, name, content):
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
            f"Content-Type: text/plain\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return req("POST", "/projetos/portal/uploads", token, raw=body, ctype=f"multipart/form-data; boundary={boundary}")


# ═════════════ FASE 1 — clientes, login, portal ═════════════
PO, po_user = first_access("e2e.po@e2e-agileflow.com.br")
DEV, dev_user = first_access("e2e.dev@e2e-agileflow.com.br")
COORD, coord_user = first_access("e2e.coord@e2e-agileflow.com.br")
state["users"].update(po=po_user["id"], dev=dev_user["id"], coord=coord_user["id"])
check(1, "primeiro acesso do PO/dev/coordenador (login criado pelo cargo)", po_user["permissions"] and "projetos.client.manage" in po_user["permissions"])

CLIENT_EMAIL = "e2e.cliente@e2e-agileflow.com.br"
s, b = req("GET", f"/projetos/clients/lookup?email={urllib.parse.quote(CLIENT_EMAIL)}", PO)
check(1, "PO verifica e-mail novo → 'new'", s == 200 and b["status"] == "new", f"{s} {b}")
s, b = req("POST", "/projetos/clients", PO, {"email": CLIENT_EMAIL, "full_name": "Cliente Teste E2E", "organization": "FIEA E2E",
                                             "project_task_ids": [ROOT_OA, ROOT_SKIP]})
check(1, "PO cadastra cliente vinculado a 2 projetos", s == 201 and len(b["projects"]) == 2 and b["first_access_pending"], f"{s} {b}")
state["client_id"] = b.get("id") if isinstance(b, dict) else None
state["users"]["client"] = b.get("user_id") if isinstance(b, dict) else None
s, b = req("GET", f"/projetos/clients/lookup?email={urllib.parse.quote(CLIENT_EMAIL.upper())}", PO)
check(1, "e-mail já cadastrado → 'client' (reaproveita, sem diferenciar maiúsculas)", s == 200 and b["status"] == "client")
s, b = req("POST", "/projetos/clients", PO, {"email": CLIENT_EMAIL, "full_name": "Duplicado", "project_task_ids": []})
check(1, "cadastro duplicado é recusado (409)", s == 409, f"{s}")
s, _ = req("GET", "/projetos/clients", DEV)
check(1, "dev sem permissão não acessa Clientes (403)", s == 403, f"{s}")

s, link = req("POST", f"/projetos/clients/{state['client_id']}/first-access-link", PO)
check(1, "PO gera o link de primeiro acesso do cliente", s == 200 and "token=" in link["path"], f"{s} {link}")
CLIENT, client_user = first_access(CLIENT_EMAIL, link["path"].split("token=", 1)[1])
s, b = req("POST", "/auth/login", body={"email": CLIENT_EMAIL, "password": PWD})
check(1, "cliente faz login com a senha criada no 1º acesso", s == 200, f"{s}")
CLIENT = b["access_token"] if s == 200 else CLIENT
s, me = req("GET", "/auth/me", CLIENT)
check(1, "/auth/me marca is_client e has_client_portal", s == 200 and me["is_client"] and me["has_client_portal"], f"{me}")
s1, _ = req("GET", "/projetos/projects", CLIENT)
s2, _ = req("GET", "/teamops/dashboard", CLIENT)
check(1, "cliente é barrado no resto do sistema (Processos e Pessoas = 403)", s1 == 403 and s2 == 403, f"{s1} {s2}")
s, b = req("GET", "/projetos/portal/projects", CLIENT)
check(1, "Portal lista os 2 projetos do cliente", s == 200 and {p["task_id"] for p in b} == {ROOT_OA, ROOT_SKIP}, f"{s} {b}")
check(1, "nenhum projeto aceita ocorrência antes da Operação Assistida", all(not p["accepts_occurrences"] for p in b))
s, b = req("POST", "/projetos/portal/occurrences", CLIENT, {"project_task_id": ROOT_OA, "tipo": "erro", "title": "Antes da OA",
                                                           "description": "não deveria abrir", "impacto": "baixo", "abrangencia": "eu"})
check(1, "abrir ocorrência fora da Operação Assistida é recusado (400)", s == 400, f"{s} {b}")

# ═════════════ FASE 2 — raia Operação Assistida ═════════════
s, b = patch_status(PO, ROOT_OA, ST["Operação Assistida"])
detail = b.get("detail") if isinstance(b, dict) else None
check(2, "sem devs de atendimento o projeto não entra na OA (428 → modal do PO)",
      s == 428 and isinstance(detail, dict) and detail.get("code") == "assisted_ops_devs_required", f"{s} {b}")
s, _ = req("PUT", f"/projetos/tasks/{ROOT_OA}/assisted-ops-devs", PO, {"person_ids": [IDS["people"]["dev"]]})
check(2, "PO define os devs de atendimento (modal)", s == 200, f"{s}")
s, b = patch_status(PO, ROOT_OA, ST["Operação Assistida"])
check(2, "PO move o projeto para Operação Assistida", s == 200 and b.get("assisted_op_entered_at"), f"{s} {b if s != 200 else ''}")
titles = [n["title"] for n in notifs(CLIENT)]
check(2, "cliente é notificado de que o projeto aceita ocorrências", "Projeto em Operação Assistida" in titles, f"{titles}")
s, b = req("GET", "/projetos/portal/projects", CLIENT)
check(2, "Portal passa a aceitar ocorrência no projeto em OA", any(p["task_id"] == ROOT_OA and p["accepts_occurrences"] for p in b))
s, b = patch_status(PO, ROOT_SKIP, ST["Concluído"])
check(2, "concluir sem passar pela OA exige justificativa (428)", s == 428, f"{s} {b}")
s, b = patch_status(PO, ROOT_SKIP, ST["Concluído"], assisted_op_skip_reason="Cliente dispensou a operação assistida (teste E2E).")
check(2, "com justificativa conclui e grava o motivo", s == 200 and b.get("assisted_op_skip_reason"), f"{s}")
s, b = req("GET", "/projetos/po-sync", PO)
blob = json.dumps(b)
check(2, "PO Sync traz o projeto como entregue com selo em_operacao_assistida", s == 200 and ROOT_OA in blob and '"em_operacao_assistida": true' in blob, f"{s}")

# ═════════════ FASE 3 — ocorrências e portal ═════════════
s, up = upload(CLIENT, "print-erro.txt", b"print do erro (E2E)")
check(3, "cliente envia anexo pelo Portal", s == 200 and up.get("object_name", "").startswith("projetos/tenant_ss/ocorrencias/"), f"{s} {up}")
if s == 200:
    state["uploads"].append(up["object_name"])
s, occ1 = req("POST", "/projetos/portal/occurrences", CLIENT, {
    "project_task_id": ROOT_OA, "tipo": "erro", "title": "Relatório não gera PDF",
    "description": "Ao clicar em exportar, nada acontece.", "passos": "1. Abrir relatório\n2. Exportar",
    "esperado": "Baixar o PDF", "funcionalidade": "Relatórios", "impacto": "impede", "abrangencia": "todos",
    "anexos": [up] if isinstance(up, dict) else None})
check(3, "cliente abre ocorrência (Impede × Todos → P1, Backlog)", s == 201 and occ1["prioridade"] == "P1" and occ1["stage_key"] == "backlog", f"{s} {occ1}")
OCC1 = occ1["task_id"]; state["occ"]["occ1"] = OCC1
check(3, "numeração OC-xxxx", occ1["code_label"].startswith("OC-"), occ1.get("code_label"))
check(3, "PO do projeto é notificado da nova ocorrência", any("Nova ocorrência" in n["title"] for n in notifs(PO)))
s, t = req("GET", f"/projetos/occurrences/{OCC1}", PO)
check(3, "time vê a ocorrência com os dados do cliente", s == 200 and t["passos"] and t["anexos"], f"{s}")
s, _ = req("POST", f"/projetos/projects/{CONTAINER}/tasks/{OCC1}/comments", PO, {"content": "<p>nota interna E2E</p>", "visibility": "internal"})
s2, _ = req("POST", f"/projetos/projects/{CONTAINER}/tasks/{OCC1}/comments", PO, {"content": "<p>Qual navegador você usa?</p>", "visibility": "public"})
check(3, "time comenta (nota interna + mensagem pública)", s == 201 and s2 == 201, f"{s} {s2}")
s, d = req("GET", f"/projetos/portal/occurrences/{OCC1}", CLIENT)
contents = [c["content"] for c in d["comments"]]
check(3, "cliente vê só a mensagem pública", "<p>Qual navegador você usa?</p>" in contents and not any("interna" in c for c in contents), f"{contents}")
check(3, "cliente não vê causa raiz/classificação", d.get("causa_raiz") is None and d.get("classificacao") is None)
check(3, "cliente é notificado da mensagem pública", any("nova mensagem do time" in n["title"] for n in notifs(CLIENT)))
s, _ = req("GET", f"/projetos/portal/uploads/url?object_name={urllib.parse.quote(up['object_name'])}", CLIENT)
s2, _ = req("GET", f"/projetos/portal/uploads/url?object_name=projetos/tenant_ss/qualquer.pdf", CLIENT)
check(3, "cliente baixa o próprio anexo, mas não arquivos de terceiros (404)", s == 200 and s2 == 404, f"{s} {s2}")
s, b = patch_status(PO, ROOT_OA, ST["Concluído"])
check(3, "projeto com ocorrência aberta não conclui (400)", s == 400 and "ocorrência" in json.dumps(b, ensure_ascii=False), f"{s} {b}")

# ═════════════ FASE 4 — atendimento, horas, homologação, release ═════════════
s, _ = req("PUT", f"/projetos/tasks/{ROOT_OA}/assisted-ops-devs", DEV, {"person_ids": [IDS["people"]["dev"]]})
check(4, "dev não define os devs de atendimento (403)", s == 403, f"{s}")
s, devs = req("PUT", f"/projetos/tasks/{ROOT_OA}/assisted-ops-devs", PO, {
    "person_ids": [IDS["people"]["dev"]],
    "allocations": [{"person_id": IDS["people"]["dev"], "project_allocation_pct": 50, "assisted_ops_allocation_pct": 30}]})
check(4, "PO define dev fixo e ajusta a divisão (50/30/20)", s == 200 and devs[0]["tickets_allocation_pct"] == 20, f"{s} {devs}")
s, a = req("POST", f"/projetos/occurrences/{OCC1}/assume", DEV)
check(4, "dev assume: responsável + Ajustando + início das horas", s == 200 and a["assignee_name"] == "Dev Teste E2E" and a["stage_key"] == "ajustando" and a["assumed_at"], f"{s} {a if s != 200 else ''}")
s, a = req("POST", f"/projetos/occurrences/{OCC1}/assume", PO)
check(4, "outro autorizado (PO) pode assumir no lugar", s == 200 and a["assignee_name"] == "PO Teste E2E", f"{s}")
s, a = req("POST", f"/projetos/occurrences/{OCC1}/assume", DEV)
check(4, "dev retoma a ocorrência", s == 200 and a["assignee_name"] == "Dev Teste E2E", f"{s}")
# chaves das etapas do funil de Ocorrências
s, funnels = req("GET", f"/projetos/projects/{CONTAINER}/funnels", PO)
oa_funnel = next(f for f in funnels if f.get("is_assisted_ops"))
s, sts = req("GET", f"/projetos/projects/{CONTAINER}/statuses?funnel_id={oa_funnel['id']}", PO)
K = {x["assisted_stage_key"]: x["id"] for x in sts if x.get("assisted_stage_key")}
check(4, "funil de Ocorrências com as 7 etapas", len(K) == 7, f"{list(K)}")
s, _ = patch_status(DEV, OCC1, K["aguardando_cliente"])
check(4, "dev pede informação (Aguardando Cliente)", s == 200, f"{s}")
check(4, "cliente é notificado para responder", any("precisa da sua resposta" in n["title"] for n in notifs(CLIENT)))
s, d = req("POST", f"/projetos/portal/occurrences/{OCC1}/comments", CLIENT, {"content": "Uso o Chrome."})
check(4, "resposta do cliente devolve para Ajustando", s == 201 and d["stage_key"] == "ajustando", f"{s} {d.get('stage_key') if isinstance(d, dict) else d}")
check(4, "dev é notificado da resposta do cliente", any("resposta do cliente" in n["title"] for n in notifs(DEV)))
s, _ = patch_status(DEV, OCC1, K["finalizado"])
check(4, "dev não finaliza direto (quem finaliza é o cliente) — 403", s == 403, f"{s}")
patch_status(DEV, OCC1, K["homologando"])
s, d = req("POST", f"/projetos/portal/occurrences/{OCC1}/homologation", CLIENT, {"approve": False, "comment": "ok"})
check(4, "reprovar sem motivo é recusado (400)", s == 400, f"{s}")
s, d = req("POST", f"/projetos/portal/occurrences/{OCC1}/homologation", CLIENT, {"approve": False, "comment": "O PDF sai sem o cabeçalho."})
check(4, "cliente reprova com motivo → Ajustando (1 reprovação)", s == 200 and d["stage_key"] == "ajustando" and d["rejection_count"] == 1, f"{s}")
patch_status(DEV, OCC1, K["homologando"])
s, d = req("POST", f"/projetos/portal/occurrences/{OCC1}/homologation", CLIENT, {"approve": True, "nps_score": 9, "comment": "Resolvido, obrigado!"})
check(4, "cliente aprova com NPS 9 → Finalizado, horas congeladas", s == 200 and d["stage_key"] == "finalizado" and d["nps_score"] == 9 and d["worked_hours"] is not None, f"{s} {d.get('worked_hours') if isinstance(d, dict) else d}")
s, _ = patch_status(DEV, OCC1, K["ajustando"])
check(4, "ocorrência finalizada não reabre (400)", s == 400, f"{s}")
s, _ = req("POST", f"/projetos/portal/occurrences/{OCC1}/comments", CLIENT, {"content": "mais uma"})
check(4, "cliente não comenta em ocorrência encerrada (400)", s == 400, f"{s}")

s, occ2 = req("POST", "/projetos/portal/occurrences", CLIENT, {"project_task_id": ROOT_OA, "tipo": "melhoria", "title": "Exportar também em Excel",
                                                              "description": "Seria útil exportar em Excel.", "impacto": "baixo", "abrangencia": "setor"})
OCC2 = occ2["task_id"]; state["occ"]["occ2"] = OCC2
check(4, "melhoria aberta (Baixo × Setor → P4); dev fixo é notificado", s == 201 and occ2["prioridade"] == "P4" and any("Nova ocorrência" in n["title"] for n in notifs(DEV)), f"{s}")
s, d = req("PATCH", f"/projetos/occurrences/{OCC2}", DEV, {"classificacao": "melhoria"})
check(4, "dev classifica como melhoria → Melhoria – Análise PO", s == 200 and d["stage_key"] == "melhoria_analise", f"{s} {d.get('stage_key') if isinstance(d, dict) else d}")
s, _ = patch_status(DEV, OCC2, K["encaminhada_release"])
check(4, "arrastar para 'Encaminhada p/ Release' é bloqueado (400)", s == 400, f"{s}")
s, _ = req("POST", f"/projetos/occurrences/{OCC2}/forward-release", DEV, {"new_release_title": "[E2E] Release", "item_kind": "feature"})
check(4, "dev não encaminha para Release (403)", s == 403, f"{s}")
s, cands = req("GET", "/projetos/occurrences/release-candidates", PO)
check(4, "PO lista projetos candidatos a Release", s == 200 and isinstance(cands, list), f"{s}")
s, d = req("POST", f"/projetos/occurrences/{OCC2}/forward-release", PO, {"new_release_title": "[E2E] Release de melhorias", "item_kind": "feature"})
check(4, "PO cria projeto de Release e a melhoria vira Feature → Encaminhada", s == 200 and d["stage_key"] == "encaminhada_release" and d["release_item_title"], f"{s} {d if s != 200 else ''}")
s, d = req("GET", f"/projetos/portal/occurrences/{OCC2}", CLIENT)
check(4, "cliente vê o encaminhamento e é avisado", d.get("release_project_title") == "[E2E] Release de melhorias" and any("encaminhada como melhoria" in n["title"] for n in notifs(CLIENT)))

s, occ3 = req("POST", "/projetos/portal/occurrences", CLIENT, {"project_task_id": ROOT_OA, "tipo": "duvida", "title": "Como filtro por data?",
                                                              "description": "Não achei o filtro por data.", "impacto": "contorno", "abrangencia": "eu"})
state["occ"]["occ3"] = occ3["task_id"]
check(4, "dúvida aberta e deixada sem responsável (para o alerta de 1h útil)", s == 201 and occ3["prioridade"] == "P3", f"{s}")

json.dump({"state": state, "tokens": {"PO": PO, "DEV": DEV, "COORD": COORD, "CLIENT": CLIENT}, "K": K,
           "results": results}, open(f"{SP}/e2e_state.json", "w"))
print("\n=== parte 1 concluída:", sum(r[2] for r in results), "/", len(results), "OK")
