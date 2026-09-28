"""Meu desempenho (tela de perfil): as métricas do painel de desempenho do time, calculadas só
para a pessoa logada, com as médias do time como referência (sem nomes).

Mesmos critérios de `TeamPerformanceService.build`: User Story pelo tipo ou pelo funil,
responsável efetivo (US filha da homologação conta no PO), entregue = concluída na janela, no
prazo = concluída até o prazo (ou sem prazo), atrasada = aberta com SLA estourado ou prazo
vencido. Carga/capacidade vêm de `CapacityService.find_available_people`, a fonte canônica.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.projetos.models import ProjectFunnel, ProjectTask
from app.modules.projetos.schemas import (
    MyPerfKpis,
    MyPerfMonth,
    MyPerfPo,
    MyPerfPoProject,
    MyPerfTask,
    MyPerfTeam,
    MyPerformanceResponse,
)
from app.modules.projetos.service import (
    CapacityService,
    PoSyncService,
    ProjectTaskService,
    TeamPerformanceService,
)
from app.modules.teamops.models import Person

_MESES_SERIE = 6
_LISTA_MAX = 20


def _avg(vals: list[float]) -> Optional[float]:
    return round(sum(vals) / len(vals), 1) if vals else None


def _month_start(d: date, back: int = 0) -> date:
    y, m = d.year, d.month - back
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


class MyPerformanceService:
    @staticmethod
    async def build_for_user(db: AsyncSession, user_id: uuid.UUID, date_from: date, date_to: date) -> MyPerformanceResponse:
        if date_to < date_from or (date_to - date_from).days > 366:
            raise HTTPException(status_code=400, detail="Período inválido (até 1 ano).")
        person_id = (await db.execute(select(Person.id).where(Person.user_id == user_id))).scalar_one_or_none()
        if not person_id:
            raise HTTPException(status_code=404, detail="Seu usuário não está vinculado a uma pessoa do Times.")
        return await MyPerformanceService.build(db, person_id, date_from, date_to)

    @staticmethod
    async def build(db: AsyncSession, person_id: uuid.UUID, date_from: date, date_to: date) -> MyPerformanceResponse:
        now = datetime.utcnow()
        win_start = datetime(date_from.year, date_from.month, date_from.day)
        win_end = datetime(date_to.year, date_to.month, date_to.day) + timedelta(days=1)
        serie_start = datetime.combine(_month_start(date_to, _MESES_SERIE - 1), datetime.min.time())

        person = (await db.execute(
            select(Person).options(selectinload(Person.position)).where(Person.id == person_id)
        )).scalar_one()

        all_tasks = list((await db.execute(
            select(ProjectTask).options(selectinload(ProjectTask.status), selectinload(ProjectTask.demand_type))
        )).scalars().all())
        funnel_by_id = {f.id: f for f in (await db.execute(select(ProjectFunnel))).scalars().all()}
        effective_assignee_of = await ProjectTaskService.make_effective_assignee_fn_from_tasks(db, all_tasks)
        root_of, root_title = await CapacityService._root_index(db)

        def is_us(t: ProjectTask) -> bool:
            dt = t.demand_type
            if dt is not None and ProjectTaskService._is_user_story_type(dt.slug, dt.name):
                return True
            fn = funnel_by_id.get(t.status.funnel_id) if t.status else None
            return bool(t.status) and ProjectTaskService._is_user_story_funnel_name(fn.name if fn else None)

        def item(t: ProjectTask, **extra) -> MyPerfTask:
            return MyPerfTask(
                task_id=t.id, title=t.title, project_title=root_title(root_of(t.id)),
                status_name=t.status.name if t.status else None,
                status_color=t.status.color if t.status else None,
                due_date=t.due_date, completed_at=t.completed_at, **extra,
            )

        k = MyPerfKpis()
        aging: list[float] = []
        cycle: list[float] = []
        lead: list[float] = []
        month: dict[str, list[int]] = {}
        abertas: list[MyPerfTask] = []
        entregues: list[MyPerfTask] = []
        # Time: entregas por pessoa (quem teve US na janela ou aberta agora) e médias gerais.
        team_people: set[uuid.UUID] = set()
        team_delivered = team_on_time = 0
        team_cycle: list[float] = []
        team_lead: list[float] = []

        for t in all_tasks:
            if not is_us(t):
                continue
            pid = effective_assignee_of(t)
            mine = pid == person_id
            is_final = bool(t.status and t.status.is_final) or t.completed_at is not None
            done = t.completed_at
            if done is not None and win_start <= done < win_end:
                on_time = t.due_date is None or done <= t.due_date
                base = t.start_date or t.created_at
                lead_d = (done - base).total_seconds() / 86400.0 if base else None
                cyc_d = (done - t.left_backlog_at).total_seconds() / 86400.0 if t.left_backlog_at else None
                if pid is not None:
                    team_people.add(pid)
                team_delivered += 1
                team_on_time += int(on_time)
                if lead_d is not None:
                    team_lead.append(lead_d)
                if cyc_d is not None:
                    team_cycle.append(cyc_d)
                if mine:
                    k.delivered += 1
                    k.on_time += int(on_time)
                    if lead_d is not None:
                        lead.append(lead_d)
                    if cyc_d is not None:
                        cycle.append(cyc_d)
                    entregues.append(item(t, on_time=on_time))
            if mine and done is not None and serie_start <= done < win_end:
                mk = done.strftime("%Y-%m")
                acc = month.setdefault(mk, [0, 0])
                acc[0] += 1
                acc[1] += int(t.due_date is None or done <= t.due_date)
            if not is_final:
                if pid is not None:
                    team_people.add(pid)
                if mine:
                    overdue = t.sla_state == "breached" or (t.due_date is not None and t.due_date < now)
                    age = (now - t.status_entered_at).total_seconds() / 86400.0 if t.status_entered_at else None
                    k.wip += 1
                    k.overdue += int(overdue)
                    if age is not None:
                        aging.append(age)
                    abertas.append(item(t, overdue=overdue, aging_days=round(age, 1) if age is not None else None))

        k.on_time_pct = round(100 * k.on_time / k.delivered, 1) if k.delivered else None
        k.avg_aging_days, k.avg_cycle_time_days, k.avg_lead_time_days = _avg(aging), _avg(cycle), _avg(lead)

        free = await CapacityService.find_available_people(db, date_from, date_to)
        mine_row = next((r for r in free.rows if r.person_id == person_id), None)
        if mine_row is not None:
            k.utilization_pct = mine_row.utilization_pct
            k.allocated_hours_total = mine_row.allocated_hours_total
            k.capacity_hours_total = mine_row.capacity_hours_total
            k.free_hours_total = mine_row.free_hours_total
        k.status = TeamPerformanceService._dev_status(k.utilization_pct)
        # Mesmo universo das outras médias: quem teve User Story no período.
        utils = [r.utilization_pct for r in free.rows if r.person_id in team_people and r.utilization_pct is not None]

        team = MyPerfTeam(
            devs=len(team_people),
            delivered_avg=round(team_delivered / len(team_people), 1) if team_people else None,
            on_time_pct=round(100 * team_on_time / team_delivered, 1) if team_delivered else None,
            avg_cycle_time_days=_avg(team_cycle), avg_lead_time_days=_avg(team_lead),
            utilization_avg_pct=_avg(utils),
        )

        series = []
        for back in range(_MESES_SERIE - 1, -1, -1):
            mk = _month_start(date_to, back).strftime("%Y-%m")
            d, ot = month.get(mk, [0, 0])
            series.append(MyPerfMonth(month=mk, delivered=d, on_time=ot))

        abertas.sort(key=lambda x: (not x.overdue, x.due_date or datetime.max))
        entregues.sort(key=lambda x: x.completed_at or datetime.min, reverse=True)

        # Carteira de PO: só para quem é responsável por algum card-raiz de projeto/programa.
        po = None
        if any(t.assigned_to == person_id and t.planning_kind in ("projeto", "programa") for t in all_tasks):
            posync = await PoSyncService.build(db, include_produtos=False)
            grupo = next((g for g in posync.get("por_po", []) if g.get("po_id") == str(person_id)), None)
            if grupo:
                kp = grupo.get("kpis", {})
                po = MyPerfPo(
                    total=int(kp.get("total") or 0), avg_exec_pct=kp.get("avg_exec_pct"),
                    em_risco=int(kp.get("em_risco") or 0), atrasados=int(kp.get("atrasados") or 0),
                    projetos=[
                        MyPerfPoProject(
                            task_id=g["task_id"], title=g["title"], planning_kind=g.get("planning_kind"),
                            fase=g.get("fase"), stage_name=g.get("stage_name"), exec_pct=g.get("exec_pct"),
                            health=g.get("health"), prazo_status=g.get("prazo_status"),
                            due_date=g.get("due_date"), overdue=bool(g.get("overdue")),
                        )
                        for g in grupo.get("projetos", [])
                    ],
                )

        return MyPerformanceResponse(
            person_id=person.id, full_name=person.full_name,
            position_label=person.position.name if person.position else None,
            date_from=date_from, date_to=date_to, kpis=k, team=team, series=series,
            open_tasks=abertas[:_LISTA_MAX], delivered_tasks=entregues[:_LISTA_MAX], po=po,
        )
