"""Análise diária de ociosidade (devs, estagiários e referências técnicas).

Capacidade do dia = jornada × project_allocation_pct, descontando ausência
aprovada que zera ou reduz horas. Ocioso se não há demanda no dia ou se a
alocação fica abaixo da capacidade (folga > 0,5 h).
"""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.projetos.schemas import (
    OciosidadeAbsence,
    OciosidadePerson,
    OciosidadeResponse,
    OciosidadeSummary,
    OciosidadeTask,
)
from app.modules.projetos.service import CapacityService, ProjectTaskService
from app.modules.teamops.calendar import load_calendar, project_hours_per_day
from app.modules.teamops.models import (
    Absence,
    AbsenceType,
    Person,
    PersonStatus,
)

DEFAULT_POSITION_SLUGS = frozenset({
    "desenvolvedor",
    "dev_backend",
    "dev_frontend",
    "dev_fullstack",
    "estagi_rio_dev",
    "intern",
    "refer_ncia_t_cnica",
    "tech_reference",
})

IDLE_GAP_HOURS = 0.5


def classify_idle(
    status: str,
    is_working_day: bool,
    capacity_hours: float,
    allocated_hours: float,
    gap: float = IDLE_GAP_HOURS,
) -> tuple[bool, str]:
    """Devolve (ocioso, motivo). Motivos estáveis para API e painel."""
    if status != PersonStatus.ATIVO.value:
        return False, f"status_{status}"
    if not is_working_day:
        return False, "nao_util"
    if capacity_hours <= 1e-6:
        return False, "sem_capacidade_hoje"
    if allocated_hours <= 1e-6:
        return True, "sem_demanda"
    if allocated_hours + gap < capacity_hours:
        return True, "abaixo_da_capacidade"
    if allocated_hours + 1e-6 < capacity_hours:
        return False, "folga_residual"
    return False, "ocupado"


class OciosidadeService:
    @staticmethod
    async def build(
        db: AsyncSession,
        day: date,
        position_slugs: set[str] | None = None,
        tenant_slug: str = "ss",
    ) -> OciosidadeResponse:
        slugs = position_slugs or set(DEFAULT_POSITION_SLUGS)
        calendar = await load_calendar(db)
        is_working = calendar.is_working_day(day)

        persons = list(
            (
                await db.execute(
                    select(Person)
                    .options(selectinload(Person.position))
                    .where(Person.status != PersonStatus.DESLIGADO)
                )
            ).scalars().all()
        )
        targets = [
            p for p in persons
            if p.position and p.position.slug in slugs
        ]

        abs_by: dict[uuid.UUID, list[OciosidadeAbsence]] = {}
        if targets:
            abs_rows = (
                await db.execute(
                    select(Absence, AbsenceType)
                    .join(AbsenceType, Absence.absence_type_id == AbsenceType.id)
                    .where(
                        Absence.person_id.in_([p.id for p in targets]),
                        Absence.start_date <= day,
                        Absence.end_date >= day,
                    )
                )
            ).all()
            for ab, typ in abs_rows:
                status = ab.status.value if hasattr(ab.status, "value") else str(ab.status)
                abs_by.setdefault(ab.person_id, []).append(
                    OciosidadeAbsence(
                        type=typ.name,
                        status=status,
                        partial_hours=(
                            float(ab.partial_hours) if ab.partial_hours is not None else None
                        ),
                        start=ab.start_date,
                        end=ab.end_date,
                        affects_capacity=bool(typ.affects_capacity),
                    )
                )

        parent, kind, owner = await ProjectTaskService.load_planning_owner_index(db)
        po_assignee_cache: dict[uuid.UUID, Optional[uuid.UUID]] = {}
        po_ids = {pid for pid in owner.values() if pid}
        po_by_id: dict[uuid.UUID, Person] = {p.id: p for p in persons if p.id in po_ids}
        missing_po = [pid for pid in po_ids if pid not in po_by_id]
        if missing_po:
            extra = (await db.execute(select(Person).where(Person.id.in_(missing_po)))).scalars().all()
            for ep in extra:
                po_by_id[ep.id] = ep

        def product_owner_of(task_id: uuid.UUID) -> Optional[Person]:
            pid = ProjectTaskService._planning_root_assignee(
                task_id,
                parent=parent,
                kind=kind,
                owner=owner,
                cache=po_assignee_cache,
            )
            return po_by_id.get(pid) if pid else None

        def to_task(i, *, overdue: bool = False) -> OciosidadeTask:
            po = product_owner_of(i.task_id)
            return OciosidadeTask(
                task=i.task_title,
                project=i.project_name,
                feature=i.feature_title,
                product_owner=(po.full_name if po else None),
                product_owner_email=(po.email if po else None),
                hours=i.hours,
                status=i.status_name,
                due=i.due_date,
                overdue=overdue or i.is_overdue,
                days_late=i.days_late,
            )

        people: list[OciosidadePerson] = []
        for p in sorted(
            targets,
            key=lambda x: ((x.position.name if x.position else ""), x.full_name),
        ):
            hpd = project_hours_per_day(p, calendar)
            detail = await CapacityService.compute_day_detail(db, p.id, day, day)
            cap = detail.capacity_hours
            alloc = detail.allocated_hours
            status = p.status.value if hasattr(p.status, "value") else str(p.status)
            idle, reason = classify_idle(status, is_working, cap, alloc)
            util = round(100.0 * alloc / cap, 1) if cap > 0 else None
            people.append(
                OciosidadePerson(
                    person_id=p.id,
                    name=p.full_name,
                    email=p.email,
                    status=status,
                    position=(p.position.name.strip() if p.position and p.position.name else None),
                    position_slug=(p.position.slug if p.position else None),
                    daily_hours=float(p.daily_hours),
                    project_allocation_pct=float(p.project_allocation_pct),
                    project_hours_per_day=round(hpd, 2),
                    capacity_hours=cap,
                    allocated_hours=alloc,
                    utilization_pct=util,
                    idle=idle,
                    idle_reason=reason,
                    absences_today=abs_by.get(p.id, []),
                    items=[to_task(i) for i in detail.items],
                    overdue=[to_task(i, overdue=True) for i in detail.overdue],
                )
            )

        idle_n = sum(1 for r in people if r.idle)
        residual_n = sum(1 for r in people if r.idle_reason == "folga_residual")
        occupied_n = sum(1 for r in people if r.idle_reason == "ocupado")
        away_n = sum(1 for r in people if r.idle_reason.startswith("status_"))
        overdue_us = sum(len(r.overdue) for r in people)
        idle_by = Counter(r.position or "—" for r in people if r.idle)
        by_pos = Counter(r.position or "—" for r in people)

        return OciosidadeResponse(
            tenant_slug=tenant_slug,
            date=day,
            is_working_day=is_working,
            generated_at=datetime.now(timezone.utc),
            summary=OciosidadeSummary(
                total=len(people),
                idle=idle_n,
                occupied=occupied_n,
                residual=residual_n,
                away=away_n,
                overdue_us=overdue_us,
                by_position=dict(by_pos),
                idle_by_position=dict(idle_by),
            ),
            people=people,
        )
