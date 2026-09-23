"""Parte 2 do E2E: alerta 1h útil (job Celery real), Fase 5 (divisão da jornada / capacidade).
Uso: e2e_http2.py [final]  — 'final' também finaliza a ocorrência pendente e conclui o projeto."""
import json, os, subprocess, sys, time
from datetime import date, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
SP = os.path.dirname(os.path.abspath(__file__))
import importlib.util
spec = importlib.util.spec_from_file_location("h", f"{SP}/e2e_http.py")
# reaproveita helpers sem reexecutar o fluxo da parte 1
src = open(f"{SP}/e2e_http.py").read().split("# ═════════════ FASE 1")[0]
ns: dict = {"__file__": f"{SP}/e2e_http.py"}
exec(compile(src, "helpers", "exec"), ns)
req, check, notifs, patch_status, results = ns["req"], ns["check"], ns["notifs"], ns["patch_status"], ns["results"]
IDS = ns["IDS"]; ST = ns["ST"]; ROOT_OA = ns["ROOT_OA"]
S = json.load(open(f"{SP}/e2e_state.json"))
T, K, OCC = S["tokens"], S["K"], S["state"]["occ"]
PO, DEV, COORD, CLIENT = T["PO"], T["DEV"], T["COORD"], T["CLIENT"]
DEV_PID = IDS["people"]["dev"]

if "final" not in sys.argv:
    # ── F4: 1h útil sem responsável → avisa o PO (pelo worker Celery de verdade) ──
    subprocess.run(["docker", "exec", "saas_postgres", "sh", "-c",
                    "psql -U $POSTGRES_USER -d $POSTGRES_DB -qc \"update tenant_ss.project_occurrences "
                    f"set created_at = now() - interval '3 days' where task_id = '{OCC['occ3']}'\""], check=True)
    subprocess.run(["docker", "exec", "-w", "/app", "saas_celery", "celery", "-A", "app.core.celery_app", "call",
                    "scheduled.check_unassigned_occurrences"], check=True, capture_output=True)
    ok = False
    for _ in range(20):
        time.sleep(2)
        if any("sem responsável há 1h útil" in n["title"] for n in notifs(PO)):
            ok = True; break
    check(4, "job Celery avisa o PO: ocorrência sem responsável há 1h útil", ok)
    check(4, "dev fixo também recebe o alerta", any("sem responsável há 1h útil" in n["title"] for n in notifs(DEV)))

    # ── F5: divisão da jornada (Gestão de Times) ──
    s, p = req("GET", f"/teamops/persons/{DEV_PID}", COORD)
    check(5, "Pessoas mostra a divisão definida pelo PO (50/30/20)", s == 200 and (p["project_allocation_pct"], p["assisted_ops_allocation_pct"], p["tickets_allocation_pct"]) == (50, 30, 20), f"{s} {p if s != 200 else ''}")
    s, _ = req("PATCH", f"/teamops/persons/{DEV_PID}", COORD, {"assisted_ops_allocation_pct": 60})
    check(5, "Projetos + OA acima de 100% é recusado (400)", s == 400, f"{s}")
    s, p = req("PATCH", f"/teamops/persons/{DEV_PID}", COORD, {"project_allocation_pct": 40, "assisted_ops_allocation_pct": 40})
    check(5, "coordenador ajusta para 40/40 → Chamados 20", s == 200 and p["tickets_allocation_pct"] == 20, f"{s}")
    s, lst = req("GET", "/teamops/persons", COORD)
    row = next((x for x in lst if x["id"] == DEV_PID), {}) if s == 200 else {}
    check(5, "lista de Pessoas traz a divisão (coluna Jornada)", row.get("assisted_ops_allocation_pct") == 40)
    s, k = req("GET", "/teamops/dashboard", COORD)
    cs = k.get("capacity_split", {}) if s == 200 else {}
    check(5, "dashboard do TeamOps soma as fatias (OA ≥ 3,2h/dia do dev)", s == 200 and cs.get("assisted_ops_hours", 0) >= 3.2, f"{cs}")
    s, _ = req("GET", "/teamops/dashboard", DEV)
    s2, devs = req("GET", f"/projetos/tasks/{ROOT_OA}/assisted-ops-devs", PO)
    check(5, "devs de atendimento refletem o cadastro em Pessoas", s2 == 200 and devs[0]["assisted_ops_allocation_pct"] == 40, f"{s2}")

    # ── F5: Capacidade ──
    today = date.today()
    mon = today - timedelta(days=today.weekday())
    s, hm = req("GET", f"/projetos/capacity/heatmap?from={mon}&to={mon + timedelta(days=4)}&unit=day", PO)
    res = [r for r in hm.get("reserves", []) if r["user_id"] == DEV_PID] if s == 200 else []
    check(5, "heatmap traz as reservas do dev (OA 3,2h e Chamados 1,6h por dia útil)",
          len(res) == 5 and res[0]["oa_capacity_hours"] == 3.2 and res[0]["tickets_capacity_hours"] == 1.6, f"{s} {res[:1]}")
    meta = next((m for m in hm.get("persons", []) if m["id"] == DEV_PID), None) if s == 200 else None
    check(5, "dev aparece na grade mesmo sem User Story na semana", meta is not None and meta["assisted_ops_pct"] == 40)
    s, dd = req("GET", f"/projetos/capacity/day-detail?person={DEV_PID}&date={mon}", PO)
    check(5, "detalhe do dia traz as 3 fatias", s == 200 and dd["capacity_hours"] == 3.2 and dd["oa_capacity_hours"] == 3.2 and dd["tickets_capacity_hours"] == 1.6, f"{s} {dd if s != 200 else (dd['capacity_hours'], dd['oa_capacity_hours'], dd['tickets_capacity_hours'])}")
    s, d1 = req("GET", f"/projetos/occurrences/{OCC['occ1']}", PO)
    check(5, "horas da ocorrência finalizada gravadas nas horas realizadas", s == 200 and d1["worked_hours"] is not None)
else:
    # ── resposta do cliente pela tela (e2e_ui.py): linha da lista → detalhe → Responder ──
    s, d = req("GET", f"/projetos/occurrences/{OCC['occ4']}", DEV)
    check(4, "resposta enviada pela tela devolve para Ajustando", s == 200 and d["stage_key"] == "ajustando"
          and any("Chrome" in c["content"] and c["from_client"] for c in d["comments"]), f"{s} {d.get('stage_key') if isinstance(d, dict) else d}")
    check(4, "dev é notificado da resposta dada pela tela",
          any("resposta do cliente" in n["title"] and n.get("entity_id") == OCC["occ4"] for n in notifs(DEV)))
    patch_status(PO, OCC["occ4"], K["finalizado"])
    # ── encerramento: PO finaliza a dúvida sem homologação e conclui o projeto ──
    s, _ = patch_status(PO, OCC["occ3"], K["finalizado"])
    s2, d = req("GET", f"/projetos/occurrences/{OCC['occ3']}", PO)
    check(4, "PO do projeto pode finalizar sem homologação (fica registrado)", s == 200 and d["finalized_by_team"], f"{s}")
    s, b = patch_status(PO, ROOT_OA, ST["Concluído"])
    check(2, "sem ocorrências abertas, o projeto conclui", s == 200 and b.get("completed_at"), f"{s} {b if s != 200 else ''}")
    s, b = req("GET", "/projetos/portal/projects", CLIENT)
    check(2, "após concluir, o Portal deixa de aceitar ocorrências", all(not p["accepts_occurrences"] for p in b))

print("\n=== parte 2:", sum(r[2] for r in results), "/", len(results), "OK")
