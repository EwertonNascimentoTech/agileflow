"""Rotas públicas (sem JWT) da análise diária de ociosidade.

Prefix: /api/v1/public/projetos
Autenticação: token fixo em PUBLIC_OCIOSIDADE_TOKEN.
Tenant: PUBLIC_OCIOSIDADE_TENANT_SLUG (default: ss).
"""

from __future__ import annotations

import hmac
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.strict_json import StrictJSONResponse
from app.modules.projetos.ociosidade import DEFAULT_POSITION_SLUGS, OciosidadeService
from app.modules.projetos.schemas import OciosidadeResponse
from app.modules.super_admin.models import Tenant

router = APIRouter(prefix="/public/projetos", tags=["Projetos - Publico"])


def _check_token(token: str) -> None:
    expected = (settings.PUBLIC_OCIOSIDADE_TOKEN or "").strip()
    if not expected:
        raise HTTPException(503, "Endpoint publico de ociosidade nao configurado.")
    provided = (token or "").strip()
    try:
        valid = bool(provided) and hmac.compare_digest(provided, expected)
    except Exception:
        valid = False
    if not valid:
        raise HTTPException(404, "Link invalido ou expirado.")


async def _resolve_tenant() -> Tenant:
    slug = (settings.PUBLIC_OCIOSIDADE_TENANT_SLUG or "ss").strip().lower()
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET search_path TO public"))
        tenant = (
            await db.execute(
                select(Tenant).where(Tenant.slug == slug, Tenant.is_active.is_(True))
            )
        ).scalar_one_or_none()
        if tenant is None:
            raise HTTPException(503, f"Tenant '{slug}' nao encontrado ou inativo.")
        return tenant


@router.get(
    "/ociosidade/{token}",
    response_model=OciosidadeResponse,
    response_class=StrictJSONResponse,
)
async def public_ociosidade(
    token: str,
    day: Optional[date] = Query(None, description="Dia da análise (ISO). Default: hoje."),
    positions: Optional[str] = Query(
        None,
        description="Slugs de cargo separados por vírgula. Default: desenvolvedor, estagiário e RT.",
    ),
):
    """Ociosidade do dia: horas alocadas × capacidade (com % de jornada) + US atrasadas."""
    _check_token(token)
    tenant = await _resolve_tenant()

    slugs: set[str] | None = None
    if positions:
        parsed = {p.strip() for p in positions.split(",") if p.strip()}
        slugs = parsed or None
    if slugs is None:
        slugs = set(DEFAULT_POSITION_SLUGS)

    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET search_path TO {tenant.schema_name}, public"))
        try:
            return await OciosidadeService.build(
                db,
                day or date.today(),
                position_slugs=slugs,
                tenant_slug=tenant.slug,
            )
        finally:
            await db.execute(text("SET search_path TO public"))
