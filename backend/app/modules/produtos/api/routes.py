"""Rotas do módulo Produtos (Portfólio)."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.core import storage
from app.core.dependencies import ModuleContext, require_module, require_permission
from app.modules.produtos import schemas
from app.modules.produtos.service import (
    AlertaService,
    FornecedorService,
    IndicadorService,
    ProcessoService,
    ProductService,
)

router = APIRouter(prefix="/produtos", tags=["Produtos"])

_ctx = require_module("produtos")
_can_manage = require_permission("produtos.manage")
_MAX_UPLOAD_BYTES = 20 * 1024 * 1024


# ── Dashboard / lookups / projetos finalizados ──
@router.get("/dashboard", response_model=schemas.DashboardKpis)
async def dashboard(ctx: ModuleContext = Depends(_ctx)):
    return await ProductService.dashboard(ctx.db)


@router.get("/areas", response_model=list[schemas.AreaRefMini])
async def list_areas(ctx: ModuleContext = Depends(_ctx)):
    try:
        return await ProductService.list_areas(ctx.db)
    except Exception:
        return []


@router.get("/setores", response_model=list[schemas.AreaRefMini])
async def list_setores(ctx: ModuleContext = Depends(_ctx)):
    try:
        return await ProductService.list_setores(ctx.db)
    except Exception:
        return []


@router.get("/persons", response_model=list[schemas.PersonMini])
async def list_persons(ctx: ModuleContext = Depends(_ctx)):
    try:
        return await ProductService.list_persons(ctx.db)
    except Exception:
        return []


@router.get("/finalized-projects", response_model=list[schemas.FinalizedProjectItem])
async def list_finalized_projects(ctx: ModuleContext = Depends(_ctx)):
    return await ProductService.list_finalized_projects(ctx.db)


@router.post("/from-project", response_model=schemas.ProductResponse, status_code=201)
async def create_from_project(data: schemas.CreateFromProjectRequest, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProductService.create_from_project(ctx.db, data, ctx.user.id)


# ── Uploads ───────────────────────────────────
@router.post("/uploads", response_model=schemas.ProductUploadResponse)
async def upload_file(file: UploadFile = File(...), ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo excede o limite de 20 MB.")
    object_name = storage.upload_file(data=data, content_type=file.content_type or "application/octet-stream", folder=f"produtos/{ctx.schema}")
    return schemas.ProductUploadResponse(object_name=object_name, filename=file.filename or "arquivo",
                                         content_type=file.content_type or "application/octet-stream", size=len(data))


@router.get("/uploads/url", response_model=schemas.ProductUploadUrlResponse)
async def get_file_url(object_name: str = Query(...), ctx: ModuleContext = Depends(_ctx)):
    if not object_name.startswith(f"produtos/{ctx.schema}/"):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    url = storage.get_presigned_url(object_name)
    if not url:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    return schemas.ProductUploadUrlResponse(url=url)


# ── Catálogo global de processos ──────────────
@router.get("/processos", response_model=list[schemas.ProcessoResponse])
async def list_processos(ctx: ModuleContext = Depends(_ctx)):
    return await ProcessoService.list_tree(ctx.db)


@router.post("/processos", response_model=schemas.ProcessoResponse, status_code=201)
async def create_processo(data: schemas.ProcessoCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProcessoService.create(ctx.db, data, ctx.user.id)


@router.patch("/processos/{processo_id}", response_model=schemas.ProcessoResponse)
async def update_processo(processo_id: uuid.UUID, data: schemas.ProcessoUpdate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProcessoService.update(ctx.db, processo_id, data, ctx.user.id)


@router.delete("/processos/{processo_id}", status_code=204)
async def delete_processo(processo_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await ProcessoService.delete(ctx.db, processo_id, ctx.user.id)


# ── Fornecedores ──────────────────────────────
@router.get("/fornecedores", response_model=list[schemas.FornecedorResponse])
async def list_fornecedores(ctx: ModuleContext = Depends(_ctx)):
    return await FornecedorService.list(ctx.db)


@router.post("/fornecedores", response_model=schemas.FornecedorResponse, status_code=201)
async def create_fornecedor(data: schemas.FornecedorCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await FornecedorService.create(ctx.db, data, ctx.user.id)


@router.patch("/fornecedores/{fornecedor_id}", response_model=schemas.FornecedorResponse)
async def update_fornecedor(fornecedor_id: uuid.UUID, data: schemas.FornecedorUpdate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await FornecedorService.update(ctx.db, fornecedor_id, data, ctx.user.id)


@router.delete("/fornecedores/{fornecedor_id}", status_code=204)
async def delete_fornecedor(fornecedor_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await FornecedorService.delete(ctx.db, fornecedor_id, ctx.user.id)


# ── Indicadores ───────────────────────────────
@router.get("/indicadores", response_model=schemas.IndicadorResponse)
async def indicadores(ano: int | None = Query(None),
                      group_by: schemas._GROUP_BY = Query("produto"), ctx: ModuleContext = Depends(_ctx)):
    return await IndicadorService.indicadores(ctx.db, ano or date.today().year, group_by)


@router.get("/indicadores/series", response_model=list[schemas.IndicadorSeriesPoint])
async def indicadores_series(anos: list[int] = Query(...), ctx: ModuleContext = Depends(_ctx)):
    return await IndicadorService.series(ctx.db, anos)


@router.get("/indicadores/processos", response_model=list[schemas.ProcessoConsolidacaoNode])
async def indicadores_processos(ano: int | None = Query(None),
                                product_id: uuid.UUID | None = Query(None), ctx: ModuleContext = Depends(_ctx)):
    return await IndicadorService.consolidacao(ctx.db, ano or date.today().year, product_id)


# ── Alertas ───────────────────────────────────
@router.get("/alertas/contratos", response_model=list[schemas.AlertaContrato])
async def alertas_contratos(ctx: ModuleContext = Depends(_ctx)):
    return await AlertaService.contratos(ctx.db)


# ── Produtos (CRUD) ───────────────────────────
@router.get("", response_model=list[schemas.ProductListItem])
async def list_products(ctx: ModuleContext = Depends(_ctx)):
    return await ProductService.list_products(ctx.db)


@router.post("", response_model=schemas.ProductResponse, status_code=201)
async def create_product(data: schemas.ProductCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProductService.create(ctx.db, data, ctx.user.id)


@router.get("/{product_id}", response_model=schemas.ProductResponse)
async def get_product(product_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await ProductService.get(ctx.db, product_id)


@router.patch("/{product_id}", response_model=schemas.ProductResponse)
async def update_product(product_id: uuid.UUID, data: schemas.ProductUpdate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProductService.update(ctx.db, product_id, data, ctx.user.id)


@router.delete("/{product_id}", status_code=204)
async def delete_product(product_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await ProductService.delete(ctx.db, product_id, ctx.user.id)


# ── Serviços ──────────────────────────────────
@router.post("/{product_id}/servicos", response_model=schemas.ServicoResponse, status_code=201)
async def add_servico(product_id: uuid.UUID, data: schemas.ServicoCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProductService.add_servico(ctx.db, product_id, data, ctx.user.id)


@router.patch("/{product_id}/servicos/{servico_id}", response_model=schemas.ServicoResponse)
async def update_servico(product_id: uuid.UUID, servico_id: uuid.UUID, data: schemas.ServicoCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProductService.update_servico(ctx.db, product_id, servico_id, data, ctx.user.id)


@router.delete("/{product_id}/servicos/{servico_id}", status_code=204)
async def delete_servico(product_id: uuid.UUID, servico_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await ProductService.delete_servico(ctx.db, product_id, servico_id, ctx.user.id)


# ── Documentos ────────────────────────────────
@router.post("/{product_id}/documentos", response_model=schemas.DocumentoResponse, status_code=201)
async def add_documento(product_id: uuid.UUID, data: schemas.DocumentoCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProductService.add_documento(ctx.db, product_id, data, ctx.user.id)


@router.delete("/{product_id}/documentos/{doc_id}", status_code=204)
async def delete_documento(product_id: uuid.UUID, doc_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await ProductService.delete_documento(ctx.db, product_id, doc_id, ctx.user.id)


# ── Vínculo Produto–Processo ──────────────────
@router.post("/{product_id}/processos", response_model=schemas.ProdutoProcessoResponse, status_code=201)
async def link_processo(product_id: uuid.UUID, data: schemas.ProdutoProcessoCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProductService.link_processo(ctx.db, product_id, data, ctx.user.id)


@router.patch("/{product_id}/processos/{link_id}", response_model=schemas.ProdutoProcessoResponse)
async def update_link(product_id: uuid.UUID, link_id: uuid.UUID, data: schemas.ProdutoProcessoUpdate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProductService.update_link(ctx.db, product_id, link_id, data, ctx.user.id)


@router.delete("/{product_id}/processos/{link_id}", status_code=204)
async def unlink_processo(product_id: uuid.UUID, link_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await ProductService.unlink_processo(ctx.db, product_id, link_id, ctx.user.id)


# ── Contratos ─────────────────────────────────
@router.post("/{product_id}/contratos", response_model=schemas.ContratoResponse, status_code=201)
async def add_contrato(product_id: uuid.UUID, data: schemas.ContratoCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProductService.add_contrato(ctx.db, product_id, data, ctx.user.id)


@router.patch("/{product_id}/contratos/{contrato_id}", response_model=schemas.ContratoResponse)
async def update_contrato(product_id: uuid.UUID, contrato_id: uuid.UUID, data: schemas.ContratoUpdate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProductService.update_contrato(ctx.db, product_id, contrato_id, data, ctx.user.id)


@router.delete("/{product_id}/contratos/{contrato_id}", status_code=204)
async def delete_contrato(product_id: uuid.UUID, contrato_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await ProductService.delete_contrato(ctx.db, product_id, contrato_id, ctx.user.id)
