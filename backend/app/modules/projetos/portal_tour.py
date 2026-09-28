"""
Tour guiado do Portal do Cliente: guarda, por pessoa, se o tour já foi oferecido.

Sem linha = ainda não ofereceu (o front oferece no 1º acesso de quem é cliente). Qualquer
resposta grava a linha — aceitar (iniciado → concluido/interrompido) ou recusar — e o convite
não volta. Refazer o tour pelo botão "?" só atualiza o status. O roteiro (telas e textos) fica
no front: `frontend/src/modules/portal/tour/tourSteps.ts`.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.projetos.models import ProjectPortalTour

# Versão do roteiro. Subir quando o tour mudar muito (hoje só fica registrada; o convite
# automático continua sendo só para quem nunca respondeu).
TOUR_VERSION = 1


class PortalTourService:
    @staticmethod
    async def get(db: AsyncSession, user_id: uuid.UUID) -> dict:
        row = (await db.execute(
            select(ProjectPortalTour).where(ProjectPortalTour.user_id == user_id)
        )).scalar_one_or_none()
        return {
            "offer": row is None,
            "status": row.status if row else None,
            "version": TOUR_VERSION,
            "updated_at": row.updated_at if row else None,
        }

    @staticmethod
    async def set(db: AsyncSession, user_id: uuid.UUID, status: str, step: Optional[int]) -> dict:
        row = (await db.execute(
            select(ProjectPortalTour).where(ProjectPortalTour.user_id == user_id)
        )).scalar_one_or_none()
        now = datetime.utcnow()
        if row is None:
            row = ProjectPortalTour(user_id=user_id, status=status, step=step, version=TOUR_VERSION, created_at=now)
            db.add(row)
        else:
            row.status, row.step, row.version = status, step, TOUR_VERSION
        row.updated_at = now
        await db.commit()
        return await PortalTourService.get(db, user_id)
