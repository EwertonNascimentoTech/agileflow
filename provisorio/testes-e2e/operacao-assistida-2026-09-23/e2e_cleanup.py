"""Remove tudo que o E2E criou (marcadores: e-mail e2e.*@e2e-agileflow.com.br e títulos [E2E]).
Não toca no funil de Ocorrências real nem em projetos reais."""
import asyncio, json, sys
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

PRE = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
UPLOADS = json.loads(sys.argv[2]) if len(sys.argv) > 2 else []

async def main():
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO tenant_ss, public"))
        q = lambda s, p=None: db.execute(text(s), p or {})
        users = [r[0] for r in (await q("select id from public.users where email like 'e2e.%@e2e-agileflow.com.br'")).all()]
        # raízes [E2E] + descendentes + ocorrências ligadas + release [E2E] e filhos
        tasks = [r[0] for r in (await q("""
            with recursive roots as (
                select id from project_tasks where title like '[E2E]%%'
                union select o.task_id from project_occurrences o where o.project_task_id in (select id from project_tasks where title like '[E2E]%%')
            ), tree as (
                select id from roots union select t.id from project_tasks t join tree on t.parent_task_id = tree.id
            ) select id from tree""")).all()]
        n = {}
        n["notifications"] = (await q("delete from notifications where user_id = any(cast(:u as uuid[])) or entity_id = any(cast(:t as uuid[]))",
                                      {"u": [str(x) for x in users], "t": [str(x) for x in tasks]})).rowcount
        n["tasks"] = (await q("delete from project_tasks where id = any(cast(:t as uuid[]))", {"t": [str(x) for x in tasks]})).rowcount
        n["clients"] = (await q("delete from project_clients where email like 'e2e.%@e2e-agileflow.com.br'")).rowcount
        n["persons"] = (await q("delete from team_persons where email like 'e2e.%@e2e-agileflow.com.br'")).rowcount
        n["audit"] = (await q("delete from public.audit_logs where user_id = any(cast(:u as uuid[]))", {"u": [str(x) for x in users]})).rowcount
        n["users"] = (await q("delete from public.users where id = any(cast(:u as uuid[]))", {"u": [str(x) for x in users]})).rowcount
        if PRE.get("client_role_existed") is False:
            n["client_role"] = (await q("delete from public.roles where name = 'Cliente (Operação Assistida)' and not exists (select 1 from public.users u where u.role_id = roles.id)")).rowcount
        mx = (await q("select max(code) from project_occurrences")).scalar()
        if mx:
            await q("select setval('project_occurrence_code_seq', :m, true)", {"m": mx})
        else:
            await q("select setval('project_occurrence_code_seq', 1, false)")
        await db.commit()
        for obj in UPLOADS:
            try:
                from app.core import storage
                storage.delete_object(obj); n.setdefault("uploads", 0); n["uploads"] += 1
            except Exception as e:  # noqa: BLE001
                print("upload não removido:", obj, e)
        print(json.dumps(n), flush=True)
        try:
            from app.core.cache import cache_delete, user_key, person_key, po_external_key, po_external_person_key
            for u in users:
                await cache_delete(user_key(u), person_key(u), po_external_key(u), po_external_person_key(u))
        except Exception:  # noqa: BLE001 — cache expira sozinho (TTL)
            pass
asyncio.run(main())
