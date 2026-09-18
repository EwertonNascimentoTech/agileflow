"""Rotas publicas (sem autenticacao) da RTD — acesso via token opaco.

Prefix: /api/v1/public/rtd/{token}
Busca em todos os schemas de tenant (mesmo padrao das propostas publicas).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import select, text

from app.core.database import AsyncSessionLocal
from app.modules.rtd.models import RtdReuniao
from app.modules.rtd.service import RtdService
from app.modules.super_admin.models import Tenant

router = APIRouter(prefix="/public/rtd", tags=["RTD — Publico"])


async def _find_reuniao_by_token(token: str) -> tuple[Tenant, RtdReuniao]:
    token = (token or "").strip()
    if not token or len(token) > 64:
        raise HTTPException(status_code=404, detail="Link invalido ou expirado.")

    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        tenants = list(
            (await db.execute(select(Tenant).where(Tenant.is_active.is_(True)))).scalars().all()
        )
        for tenant in tenants:
            try:
                await db.execute(text(f"SET search_path TO {tenant.schema_name}, public"))
                reuniao = (
                    await db.execute(select(RtdReuniao).where(RtdReuniao.public_token == token))
                ).scalar_one_or_none()
                if reuniao is not None:
                    return tenant, reuniao
            except Exception:  # noqa: BLE001 — schema sem tabela RTD, etc.
                continue
        await db.execute(text("SET search_path TO public"))

    raise HTTPException(status_code=404, detail="Link invalido ou expirado.")


@router.get("/{token}")
async def view_public_rtd(token: str):
    """Apresentacao da RTD em modo somente leitura (sem login)."""
    tenant, reuniao = await _find_reuniao_by_token(token)

    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET search_path TO {tenant.schema_name}, public"))
        # Re-carrega na sessao atual (objeto da busca anterior pode estar detached).
        r = (
            await db.execute(select(RtdReuniao).where(RtdReuniao.id == reuniao.id))
        ).scalar_one()
        payload = await RtdService.build_public_view(db, r)
        payload["tenant_name"] = tenant.name
        return payload
