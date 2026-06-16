"""Sincroniza status da pessoa (férias / afastado) com ausências vigentes."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.teamops.models import (
    Absence,
    AbsenceStatus,
    AbsenceType,
    Person,
    PersonStatus,
)


class PersonStatusSync:
    """Deriva status da pessoa a partir de ausências ativas no dia de hoje.

    Mapeamento por slug do tipo de ausência:
    - ferias → PersonStatus.FERIAS
    - afastamento_medico → PersonStatus.AFASTADO

    Folga, banco de horas e treinamento não alteram o status global.
    Ausências pendentes ou aprovadas contam (solicitação já reflete no status).
    Desligado nunca é alterado automaticamente.
    """

    ABSENCE_SLUG_TO_STATUS: dict[str, PersonStatus] = {
        "ferias": PersonStatus.FERIAS,
        "afastamento_medico": PersonStatus.AFASTADO,
    }
    _STATUS_PRIORITY: dict[PersonStatus, int] = {
        PersonStatus.AFASTADO: 30,
        PersonStatus.FERIAS: 20,
    }
    _ACTIVE_ABSENCE_STATUSES = (AbsenceStatus.PENDENTE, AbsenceStatus.APROVADA)

    @staticmethod
    async def sync_many(
        db: AsyncSession,
        person_ids: list[uuid.UUID],
        *,
        commit: bool = False,
    ) -> bool:
        if not person_ids:
            return False
        today = date.today()
        persons_q = await db.execute(
            select(Person).where(
                Person.id.in_(person_ids),
                Person.status != PersonStatus.DESLIGADO,
            )
        )
        persons = {p.id: p for p in persons_q.scalars().all()}
        if not persons:
            return False

        rows = await db.execute(
            select(Absence.person_id, AbsenceType.slug)
            .join(AbsenceType, Absence.absence_type_id == AbsenceType.id)
            .where(
                Absence.person_id.in_(list(persons.keys())),
                Absence.status.in_(PersonStatusSync._ACTIVE_ABSENCE_STATUSES),
                Absence.start_date <= today,
                Absence.end_date >= today,
            )
        )

        resolved: dict[uuid.UUID, PersonStatus] = {
            pid: PersonStatus.ATIVO for pid in persons
        }
        best_pri: dict[uuid.UUID, int] = {pid: 0 for pid in persons}
        for person_id, slug in rows.all():
            mapped = PersonStatusSync.ABSENCE_SLUG_TO_STATUS.get(slug)
            if not mapped:
                continue
            pri = PersonStatusSync._STATUS_PRIORITY.get(mapped, 0)
            if pri > best_pri[person_id]:
                best_pri[person_id] = pri
                resolved[person_id] = mapped

        changed = False
        now = datetime.utcnow()
        for pid, person in persons.items():
            new_status = resolved[pid]
            if person.status != new_status:
                person.status = new_status
                person.updated_at = now
                changed = True
        if changed and commit:
            await db.commit()
        return changed

    @staticmethod
    async def sync_one(
        db: AsyncSession,
        person_id: uuid.UUID,
        *,
        commit: bool = False,
    ) -> bool:
        return await PersonStatusSync.sync_many(db, [person_id], commit=commit)
