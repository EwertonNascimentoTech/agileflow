"""Rotas publicas (sem JWT) do portfolio de produtos.

Prefix: /api/v1/public/produtos
Autenticacao: token fixo em PUBLIC_PRODUTOS_PORTFOLIO_TOKEN.
Tenant: PUBLIC_PRODUTOS_TENANT_SLUG (default: ss).
"""

from __future__ import annotations

import hmac
import math
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.strict_json import StrictJSONResponse
from app.modules.produtos import schemas
from app.modules.produtos.service import ProductService
from app.modules.super_admin.models import Tenant

router = APIRouter(prefix="/public/produtos", tags=["Produtos - Publico"])


def _check_token(token: str) -> None:
    expected = (settings.PUBLIC_PRODUTOS_PORTFOLIO_TOKEN or "").strip()
    if not expected:
        raise HTTPException(503, "Endpoint publico de portfolio nao configurado.")
    provided = (token or "").strip()
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(404, "Link invalido ou expirado.")


async def _resolve_tenant() -> Tenant:
    slug = (settings.PUBLIC_PRODUTOS_TENANT_SLUG or "ss").strip().lower()
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
    "/portfolio/{token}",
    response_model=schemas.PublicProductPortfolioPage,
    response_class=StrictJSONResponse,
)
async def public_product_portfolio(
    token: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    unidade: Optional[str] = Query(None, description="sesi|senai|iel|fiea|corporativo"),
    area_id: Optional[uuid.UUID] = Query(None),
    categoria: Optional[str] = Query(None),
    criticidade: Optional[str] = Query(None, description="baixa|media|alta|critica"),
    classe: Optional[str] = Query(None, description="saudavel|atencao|critico"),
    q: Optional[str] = Query(None, description="Busca por nome ou sigla"),
):
    """Portfolio enriquecido da aba Produtos (pessoas, servicos, contratos, projetos, LGPD)."""
    _check_token(token)
    tenant = await _resolve_tenant()

    async with AsyncSessionLocal() as db:
        await db.execute(text(f"SET search_path TO {tenant.schema_name}, public"))
        try:
            items, total, finalizados_nao_promovidos = await ProductService.list_public_portfolio(
                db,
                page=page,
                page_size=page_size,
                unidade=unidade,
                area_id=area_id,
                categoria=categoria,
                criticidade=criticidade,
                classe=classe,
                q=q,
            )
        finally:
            await db.execute(text("SET search_path TO public"))

    total_pages = max(1, math.ceil(total / page_size)) if total else 1
    return schemas.PublicProductPortfolioPage(
        tenant_slug=tenant.slug,
        tenant_name=tenant.name,
        generated_at=datetime.now(timezone.utc),
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
        finalizados_nao_promovidos=finalizados_nao_promovidos,
        items=items,
    )
