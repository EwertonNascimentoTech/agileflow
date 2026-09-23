import asyncio, json
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.modules.teamops.models import Person, Position, PersonStatus
from app.modules.projetos.models import ProjectFunnel, ProjectStatusConfig, ProjectTask, ProjectDemandType

async def main():
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO tenant_ss, public"))
        pos = {p.slug: p for p in (await db.execute(select(Position))).scalars()}
        people = {}
        for key, slug, name in (("po", "po", "PO Teste E2E"), ("dev", "desenvolvedor", "Dev Teste E2E"), ("coord", "coordenador", "Coord Teste E2E")):
            p = Person(full_name=name, email=f"e2e.{key}@e2e-agileflow.com.br", position_id=pos[slug].id,
                       daily_hours=8, weekly_hours=40, project_allocation_pct=100, status=PersonStatus.ATIVO, visible_in_org_chart=False)
            db.add(p); await db.flush(); people[key] = str(p.id)
        f = (await db.execute(select(ProjectFunnel).where(ProjectFunnel.name.ilike("projetos e programas")))).scalars().first()
        sts = {s.name: s for s in (await db.execute(select(ProjectStatusConfig).where(ProjectStatusConfig.funnel_id == f.id))).scalars()}
        dt = (await db.execute(select(ProjectDemandType).where(ProjectDemandType.slug == "item_planejamento"))).scalar_one()
        roots = {}
        for key, title in (("oa", "[E2E] Projeto com Operação Assistida"), ("skip", "[E2E] Projeto sem Operação Assistida")):
            t = ProjectTask(project_id=f.project_id, status_id=sts["DEVSECOPS (PROD)"].id, demand_type_id=dt.id,
                            title=title, assigned_to=people["po"], planning_kind="projeto")
            db.add(t); await db.flush(); roots[key] = str(t.id)
            if key == "oa":
                # Projeto que chegou em produção: Feature + US concluídas no cronograma.
                from datetime import datetime, timedelta
                fts = {fu.name.lower(): fu for fu in (await db.execute(select(ProjectFunnel).where(ProjectFunnel.project_id == f.project_id))).scalars()}
                def final_of(fname):
                    return next(s_ for s_ in all_sts if s_.funnel_id == fts[fname].id and s_.is_final and "conclu" in s_.name.lower())
                all_sts = list((await db.execute(select(ProjectStatusConfig))).scalars())
                dt_f = (await db.execute(select(ProjectDemandType).where(ProjectDemandType.slug == "feature"))).scalar_one()
                dt_u = (await db.execute(select(ProjectDemandType).where(ProjectDemandType.slug == "user_story"))).scalar_one()
                now = datetime.utcnow()
                feat = ProjectTask(project_id=f.project_id, status_id=final_of("features").id, demand_type_id=dt_f.id,
                                   parent_task_id=t.id, title="FEAT-E2E Relatórios", completed_at=now,
                                   start_date=now - timedelta(days=20), due_date=now - timedelta(days=5))
                db.add(feat); await db.flush()
                db.add(ProjectTask(project_id=f.project_id, status_id=final_of("user story").id, demand_type_id=dt_u.id,
                                   parent_task_id=feat.id, title="US-E2E Exportar relatório", assigned_to=people["dev"],
                                   estimated_hours=16, start_date=now - timedelta(days=20), due_date=now - timedelta(days=5),
                                   completed_at=now, schedule_committed_at=None))
                t.schedule_committed_at = now - timedelta(days=15)
        pre = {
            "oa_funnel_existed": bool((await db.execute(select(ProjectFunnel.id).where(ProjectFunnel.is_assisted_ops == True))).first()),
            "client_role_existed": bool((await db.execute(text("select 1 from public.roles where name='Cliente (Operação Assistida)'"))).first()),
        }
        await db.commit()
        print(json.dumps({"container": str(f.project_id), "people": people, "roots": roots,
                          "statuses": {k: str(v.id) for k, v in sts.items()}, "pre": pre}))
asyncio.run(main())
