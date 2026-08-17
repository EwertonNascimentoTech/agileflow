"""Rotas do módulo RTD (Reunião de Tomada de Decisão) — Parte 1."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select

from app.core.dependencies import ModuleContext, require_module, require_permission
from app.modules.rtd import models, schemas
from app.modules.rtd.service import RtdService

router = APIRouter(prefix="/rtd", tags=["RTD"])

_ctx = require_module("rtd")
_can_manage = require_permission("rtd.manage")


# ── Reuniões ──
@router.get("/reunioes", response_model=list[schemas.ReuniaoOut])
async def list_reunioes(ctx: ModuleContext = Depends(_ctx)):
    return await RtdService.list_reunioes(ctx.db)


@router.post("/reunioes", response_model=schemas.ReuniaoOut, status_code=201)
async def create_reuniao(
    data: schemas.ReuniaoCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage),
):
    try:
        return await RtdService.create_reuniao(ctx.db, data, ctx.user.id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/reunioes/{reuniao_id}", response_model=schemas.ReuniaoOut)
async def get_reuniao(reuniao_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    r = await RtdService.get_reuniao(ctx.db, reuniao_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")
    n = await ctx.db.scalar(
        select(func.count()).select_from(models.RtdDeliberacao)
        .where(models.RtdDeliberacao.reuniao_id == r.id)
    )
    return RtdService._reuniao_out(r, n or 0)


@router.patch("/reunioes/{reuniao_id}", response_model=schemas.ReuniaoOut)
async def update_reuniao(
    reuniao_id: uuid.UUID, data: schemas.ReuniaoUpdate,
    ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage),
):
    out = await RtdService.update_reuniao(ctx.db, reuniao_id, data, ctx.user.id)
    if out is None:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")
    return out


@router.delete("/reunioes/{reuniao_id}", status_code=204)
async def delete_reuniao(
    reuniao_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage),
):
    ok = await RtdService.delete_reuniao(ctx.db, reuniao_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")


@router.get("/reunioes/{reuniao_id}/report")
async def get_report(reuniao_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    r = await RtdService.get_reuniao(ctx.db, reuniao_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")
    return await RtdService.build_report(ctx.db, r)


# ── Slides de Planos do EPA (Estratégicos e Táticos) ──
@router.get("/reunioes/{reuniao_id}/planos-epa")
async def get_planos_epa(
    reuniao_id: uuid.UUID,
    categoria: str = "estrategico",
    ctx: ModuleContext = Depends(_ctx),
):
    """Planos do EPA configurados na reunião — ao vivo (aberta) ou foto (fechada)."""
    if categoria not in ("estrategico", "tatico"):
        raise HTTPException(status_code=422, detail="categoria deve ser 'estrategico' ou 'tatico'")
    r = await RtdService.get_reuniao(ctx.db, reuniao_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")
    return await RtdService.planos_epa(r, categoria)


# ── Seção 1: análise por indicador ──
@router.put(
    "/reunioes/{reuniao_id}/indicadores/{indicador_id}/analise",
    response_model=schemas.IndicadorAnaliseOut,
)
async def upsert_indicador_analise(
    reuniao_id: uuid.UUID, indicador_id: uuid.UUID,
    data: schemas.IndicadorAnaliseUpsert,
    ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage),
):
    r = await RtdService.get_reuniao(ctx.db, reuniao_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")
    if r.status == models.ReuniaoStatus.FECHADA:
        raise HTTPException(
            status_code=423,
            detail="Reunião fechada — reabra para editar as análises.",
        )
    return await RtdService.upsert_indicador_analise(ctx.db, r, indicador_id, data, ctx.user.id)


@router.get("/persons", response_model=list[schemas.PersonMiniOut])
async def list_persons(ctx: ModuleContext = Depends(_ctx)):
    return await RtdService.list_persons(ctx.db)


@router.post(
    "/reunioes/{reuniao_id}/indicadores/{indicador_id}/analise/sugerir",
    response_model=schemas.IndicadorAnaliseSugestao,
)
async def sugerir_indicador_analise(
    reuniao_id: uuid.UUID, indicador_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage),
):
    """Gera sugestão de análise via agente de IA (Azure AI Foundry). Nada é persistido —
    o resultado preenche o formulário e passa por revisão humana."""
    r = await RtdService.get_reuniao(ctx.db, reuniao_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")
    if r.status == models.ReuniaoStatus.FECHADA:
        raise HTTPException(status_code=423, detail="Reunião fechada — reabra para gerar análises.")
    return await RtdService.sugerir_analise(ctx.db, r, indicador_id)


# ── Deliberações ──
@router.get("/reunioes/{reuniao_id}/deliberacoes", response_model=list[schemas.DeliberacaoOut])
async def list_deliberacoes(reuniao_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await RtdService.list_deliberacoes(ctx.db, reuniao_id)


@router.post("/reunioes/{reuniao_id}/deliberacoes", response_model=schemas.DeliberacaoOut, status_code=201)
async def create_deliberacao(
    reuniao_id: uuid.UUID, data: schemas.DeliberacaoCreate,
    ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage),
):
    r = await RtdService.get_reuniao(ctx.db, reuniao_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Reunião não encontrada")
    return await RtdService.create_deliberacao(ctx.db, reuniao_id, data, ctx.user.id)


@router.patch("/deliberacoes/{delib_id}", response_model=schemas.DeliberacaoOut)
async def update_deliberacao(
    delib_id: uuid.UUID, data: schemas.DeliberacaoUpdate,
    ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage),
):
    out = await RtdService.update_deliberacao(ctx.db, delib_id, data, ctx.user.id)
    if out is None:
        raise HTTPException(status_code=404, detail="Deliberação não encontrada")
    return out


@router.delete("/deliberacoes/{delib_id}", status_code=204)
async def delete_deliberacao(
    delib_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage),
):
    ok = await RtdService.delete_deliberacao(ctx.db, delib_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Deliberação não encontrada")
