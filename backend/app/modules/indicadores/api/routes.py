"""Rotas do módulo Indicadores (KPIs institucionais)."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.core import storage
from app.core.dependencies import ModuleContext, require_module, require_permission
from app.modules.indicadores import schemas
from app.modules.indicadores.service import IndicadorService

router = APIRouter(prefix="/indicadores", tags=["Indicadores"])

_ctx = require_module("indicadores")
_can_manage = require_permission("indicadores.manage")
_MAX_UPLOAD_BYTES = 20 * 1024 * 1024


@router.get("/areas", response_model=list[schemas.AreaRefMini])
async def list_areas(ctx: ModuleContext = Depends(_ctx)):
    try:
        return await IndicadorService.list_areas(ctx.db)
    except Exception:
        return []


@router.get("/persons", response_model=list[schemas.PersonMini])
async def list_persons(ctx: ModuleContext = Depends(_ctx)):
    try:
        return await IndicadorService.list_persons(ctx.db)
    except Exception:
        return []


@router.get("/dashboard", response_model=schemas.DashboardKpis)
async def dashboard(
    ano: Optional[int] = Query(None),
    categoria: Optional[str] = Query(None),
    area_id: Optional[uuid.UUID] = Query(None),
    responsavel_id: Optional[uuid.UUID] = Query(None),
    granularidade: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await IndicadorService.dashboard(
        ctx.db,
        categoria=categoria,
        area_id=area_id,
        responsavel_id=responsavel_id,
        granularidade=granularidade,
        status=status,
        ano=ano,
    )


@router.post("/uploads", response_model=schemas.UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_manage),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo excede o limite de 20 MB.")
    object_name = storage.upload_file(
        data=data,
        content_type=file.content_type or "application/octet-stream",
        folder=f"indicadores/{ctx.schema}",
    )
    return schemas.UploadResponse(
        object_name=object_name,
        filename=file.filename or "arquivo",
        content_type=file.content_type or "application/octet-stream",
        size=len(data),
    )


@router.get("/uploads/url", response_model=schemas.UploadUrlResponse)
async def get_file_url(object_name: str = Query(...), ctx: ModuleContext = Depends(_ctx)):
    allowed = (f"indicadores/{ctx.schema}/", f"produtos/{ctx.schema}/")
    if not any(object_name.startswith(p) for p in allowed):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    url = storage.get_presigned_url(object_name)
    if not url:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    return schemas.UploadUrlResponse(url=url)


@router.get("", response_model=list[schemas.IndicadorListItem])
async def list_indicadores(
    ano: Optional[int] = Query(None),
    categoria: Optional[str] = Query(None),
    area_id: Optional[uuid.UUID] = Query(None),
    responsavel_id: Optional[uuid.UUID] = Query(None),
    granularidade: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await IndicadorService.list_indicadores(
        ctx.db,
        categoria=categoria,
        area_id=area_id,
        responsavel_id=responsavel_id,
        granularidade=granularidade,
        status=status,
        ano=ano,
    )


@router.post("", response_model=schemas.IndicadorResponse, status_code=201)
async def create_indicador(
    data: schemas.IndicadorCreate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_manage),
):
    return await IndicadorService.create(ctx.db, data, ctx.user.id)


@router.get("/{indicador_id}", response_model=schemas.IndicadorResponse)
async def get_indicador(indicador_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await IndicadorService.get(ctx.db, indicador_id)


@router.patch("/{indicador_id}", response_model=schemas.IndicadorResponse)
async def update_indicador(
    indicador_id: uuid.UUID,
    data: schemas.IndicadorUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_manage),
):
    return await IndicadorService.update(ctx.db, indicador_id, data, ctx.user.id)


@router.delete("/{indicador_id}", status_code=204)
async def delete_indicador(
    indicador_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_manage),
):
    await IndicadorService.delete(ctx.db, indicador_id, ctx.user.id)


@router.get("/{indicador_id}/acompanhamentos", response_model=list[schemas.AcompanhamentoResponse])
async def list_acompanhamentos(
    indicador_id: uuid.UUID,
    ano: Optional[int] = Query(None),
    ctx: ModuleContext = Depends(_ctx),
):
    return await IndicadorService.list_acompanhamentos(ctx.db, indicador_id, ano)


@router.post("/{indicador_id}/acompanhamentos/gerar", response_model=list[schemas.AcompanhamentoResponse])
async def gerar_acompanhamentos(
    indicador_id: uuid.UUID,
    ano: int = Query(...),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_manage),
):
    return await IndicadorService.gerar_ano(ctx.db, indicador_id, ano, ctx.user.id)


@router.post("/{indicador_id}/portfolio/atualizar", response_model=schemas.IndicadorResponse)
async def atualizar_portfolio(
    indicador_id: uuid.UUID,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_manage),
):
    return await IndicadorService.atualizar_portfolio(ctx.db, indicador_id, ctx.user.id)


@router.patch("/acompanhamentos/{acomp_id}", response_model=schemas.AcompanhamentoResponse)
async def update_acompanhamento(
    acomp_id: uuid.UUID,
    data: schemas.AcompanhamentoUpdate,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_manage),
):
    return await IndicadorService.update_acompanhamento(ctx.db, acomp_id, data, ctx.user.id)


@router.get("/acompanhamentos/{acomp_id}/evidencias", response_model=schemas.AcompanhamentoEvidenciasResponse)
async def get_acompanhamento_evidencias(acomp_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await IndicadorService.get_evidencias(ctx.db, acomp_id)
