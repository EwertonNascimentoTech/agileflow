"""Rotas do módulo Produtos (Portfólio)."""

import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.core import storage
from app.core.dependencies import ModuleContext, require_module, require_permission
from app.modules.produtos import azure_devops_client, schemas
from app.modules.produtos.repos_service import (
    CommitAuthorService,
    RepoMetricsService,
    RepoSyncService,
    RepositoryImportService,
    RepositoryService,
)
from app.modules.produtos.service import (
    AlertaService,
    DocumentationService,
    FornecedorService,
    HealthConfigService,
    IndicadorService,
    ProcessoService,
    ProcessPortfolioService,
    ProductService,
    ReleaseService,
    SupportService,
)

router = APIRouter(prefix="/produtos", tags=["Produtos"])

_ctx = require_module("produtos")
_can_manage = require_permission("produtos.manage")
_can_view_repos = require_permission("produtos.repos.view")
_MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def _csv(value: Optional[str]) -> Optional[list[str]]:
    """"a,b, c" → ["a","b","c"] — mesmo formato dos filtros do painel de desempenho."""
    if not value:
        return None
    return [v.strip() for v in value.split(",") if v.strip()] or None


def _uuids(value: Optional[str]) -> Optional[list[uuid.UUID]]:
    items = _csv(value)
    if not items:
        return None
    try:
        return [uuid.UUID(v) for v in items]
    except ValueError:
        raise HTTPException(422, "Lista de identificadores inválida.")


# ── Dashboard / lookups / projetos finalizados ──
@router.get("/dashboard", response_model=schemas.DashboardKpis)
async def dashboard(ctx: ModuleContext = Depends(_ctx)):
    return await ProductService.dashboard(ctx.db)


@router.get("/inteligencia/portfolio", response_model=schemas.PortfolioInteligencia)
async def inteligencia_portfolio(ctx: ModuleContext = Depends(_ctx)):
    return await ProductService.portfolio_intelligence(ctx.db)


@router.get("/inteligencia/contratos", response_model=schemas.ContratosInteligencia)
async def inteligencia_contratos(ctx: ModuleContext = Depends(_ctx)):
    return await ProductService.contratos_intelligence(ctx.db)


@router.get("/config/health", response_model=schemas.HealthConfigResponse)
async def get_health_config(ctx: ModuleContext = Depends(_ctx)):
    return await HealthConfigService.get(ctx.db)


@router.put("/config/health", response_model=schemas.HealthConfigResponse)
async def update_health_config(data: schemas.HealthConfigUpdate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await HealthConfigService.update(ctx.db, data, ctx.user.id)


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


@router.get("/pos", response_model=list[schemas.PersonMini])
async def list_pos(ctx: ModuleContext = Depends(_ctx)):
    """Pessoas com cargo PO/Product Owner — para o campo Responsável do produto."""
    try:
        return await ProductService.list_pos(ctx.db)
    except Exception:
        return []


@router.get("/tech-references", response_model=list[schemas.PersonMini])
async def list_tech_references(ctx: ModuleContext = Depends(_ctx)):
    """Pessoas com cargo Referência Técnica — para o Responsável técnico do produto."""
    try:
        return await ProductService.list_tech_references(ctx.db)
    except Exception:
        return []


@router.get("/stacks", response_model=list[schemas.StackMini])
async def list_stacks(ctx: ModuleContext = Depends(_ctx)):
    """Catálogo de stacks (reusa team_stacks) — para o multi-select do produto."""
    try:
        return await ProductService.list_stacks(ctx.db)
    except Exception:
        return []


@router.get("/finalized-projects", response_model=list[schemas.FinalizedProjectItem])
async def list_finalized_projects(ctx: ModuleContext = Depends(_ctx)):
    return await ProductService.list_finalized_projects(ctx.db)


# Modelo Markdown padrão para nova documentação (registrado antes de /{product_id}).
@router.get("/documentation-template", response_model=dict)
async def documentation_template(ctx: ModuleContext = Depends(_ctx)):
    return {"conteudo_md": DocumentationService.template()}


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


# ── Portfólio de Processos (versionado) ───────
# IMPORTANTE: registrado ANTES das rotas /{product_id} para não colidir com o catch-all.
@router.get("/process-portfolios", response_model=list[schemas.ProcessPortfolioResponse])
async def list_process_portfolios(ctx: ModuleContext = Depends(_ctx)):
    return await ProcessPortfolioService.list_portfolios(ctx.db)


@router.post("/process-portfolios", response_model=schemas.ProcessPortfolioResponse, status_code=201)
async def create_process_portfolio(data: schemas.ProcessPortfolioCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProcessPortfolioService.create_portfolio(ctx.db, data, ctx.user.id)


@router.patch("/process-portfolios/{portfolio_id}", response_model=schemas.ProcessPortfolioResponse)
async def update_process_portfolio(portfolio_id: uuid.UUID, data: schemas.ProcessPortfolioUpdate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProcessPortfolioService.update_portfolio(ctx.db, portfolio_id, data, ctx.user.id)


@router.delete("/process-portfolios/{portfolio_id}", status_code=204)
async def delete_process_portfolio(portfolio_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await ProcessPortfolioService.delete_portfolio(ctx.db, portfolio_id, ctx.user.id)


@router.get("/process-portfolios/{portfolio_id}/current", response_model=schemas.ProcessVersionTree)
async def get_current_portfolio_tree(portfolio_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await ProcessPortfolioService.get_current_tree(ctx.db, portfolio_id)


@router.get("/process-portfolios/{portfolio_id}/versions", response_model=list[schemas.ProcessVersionSummary])
async def list_portfolio_versions(portfolio_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await ProcessPortfolioService.list_versions(ctx.db, portfolio_id)


@router.post("/process-portfolios/{portfolio_id}/versions", response_model=schemas.ProcessVersionTree, status_code=201)
async def create_portfolio_version(portfolio_id: uuid.UUID, data: schemas.CreateVersionRequest, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProcessPortfolioService.create_version(ctx.db, portfolio_id, data, ctx.user.id)


@router.get("/process-portfolios/versions/{version_id}/tree", response_model=schemas.ProcessVersionTree)
async def get_version_tree(version_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await ProcessPortfolioService.get_version_tree(ctx.db, version_id)


@router.post("/process-portfolios/versions/{version_id}/consolidate", response_model=schemas.ProcessVersionTree)
async def consolidate_version(version_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProcessPortfolioService.consolidate_version(ctx.db, version_id, ctx.user.id)


@router.post("/process-portfolios/versions/{version_id}/items", response_model=schemas.ProcessItemResponse, status_code=201)
async def create_portfolio_item(version_id: uuid.UUID, data: schemas.ProcessItemCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProcessPortfolioService.create_item(ctx.db, version_id, data, ctx.user.id)


# IMPORTANTE: 'reorder' antes de '{item_id}' para não ser capturado como UUID.
@router.patch("/process-portfolios/versions/{version_id}/items/reorder", response_model=schemas.ProcessVersionTree)
async def reorder_portfolio_items(version_id: uuid.UUID, data: schemas.ProcessItemReorderRequest, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProcessPortfolioService.reorder_items(ctx.db, version_id, data, ctx.user.id)


@router.patch("/process-portfolios/versions/{version_id}/items/{item_id}", response_model=schemas.ProcessItemResponse)
async def update_portfolio_item(version_id: uuid.UUID, item_id: uuid.UUID, data: schemas.ProcessItemUpdate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProcessPortfolioService.update_item(ctx.db, version_id, item_id, data, ctx.user.id)


@router.delete("/process-portfolios/versions/{version_id}/items/{item_id}", status_code=204)
async def delete_portfolio_item(version_id: uuid.UUID, item_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await ProcessPortfolioService.delete_item(ctx.db, version_id, item_id, ctx.user.id)


# ── Vínculo serviço ↔ sub-processo ────────────
@router.get("/servicos/{servico_id}/process-links", response_model=list[schemas.ServiceLinkItem])
async def list_service_process_links(servico_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await ProcessPortfolioService.list_service_links(ctx.db, servico_id)


@router.put("/servicos/{servico_id}/process-links", response_model=list[schemas.ServiceLinkItem])
async def set_service_process_links(servico_id: uuid.UUID, data: schemas.ServiceLinkSetRequest, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProcessPortfolioService.set_service_links(ctx.db, servico_id, data, ctx.user.id)


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


# ── Repositórios de código e commits ──────────
# Antes das rotas de produto: `/{product_id}` capturaria "repositorios"/"commits" e daria 422.
@router.get("/repositorios", response_model=list[schemas.RepositoryResponse])
async def list_repositorios(ctx: ModuleContext = Depends(_ctx), _=Depends(_can_view_repos)):
    return await RepositoryService.list_repositories(ctx.db)


@router.post("/repositorios", response_model=schemas.RepositoryResponse, status_code=201)
async def create_repositorio(data: schemas.RepositoryCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await RepositoryService.create(ctx.db, data, ctx.user.id)


@router.get("/repositorios/import/preview", response_model=schemas.RepoImportPreview)
async def preview_import_repositorios(ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    """Classifica os links de `link_repositorio` sem gravar nada."""
    return await RepositoryImportService.preview(ctx.db)


@router.post("/repositorios/import/apply", response_model=schemas.RepoImportResult)
async def apply_import_repositorios(data: schemas.RepoImportApply, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await RepositoryImportService.apply(ctx.db, data, ctx.user.id)


@router.get("/repositorios/azure/projetos", response_model=list[schemas.AzureProjectMini])
async def list_azure_projetos(_ctx_=Depends(_ctx), __=Depends(_can_manage)):
    try:
        return await azure_devops_client.list_projects()
    except azure_devops_client.AzureDevOpsError as e:
        raise HTTPException(503, str(e))


@router.get("/repositorios/azure/projetos/{project}/repos", response_model=list[schemas.AzureRepoMini])
async def descobrir_azure_repos(project: str, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    """Repositórios de um projeto Azure — resolve os links que apontam só para o projeto."""
    try:
        return await RepositoryImportService.descobrir(ctx.db, project)
    except azure_devops_client.AzureDevOpsError as e:
        raise HTTPException(503, str(e))


@router.post("/repositorios/sync", response_model=schemas.RepoSyncResult)
async def sync_todos_repositorios(ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await RepoSyncService.sync_schema(ctx.db)


@router.get("/repositorios/{repository_id}", response_model=schemas.RepositoryResponse)
async def get_repositorio(repository_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_view_repos)):
    return await RepositoryService.get_one(ctx.db, repository_id)


@router.patch("/repositorios/{repository_id}", response_model=schemas.RepositoryResponse)
async def update_repositorio(repository_id: uuid.UUID, data: schemas.RepositoryUpdate,
                             ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await RepositoryService.update(ctx.db, repository_id, data, ctx.user.id)


@router.delete("/repositorios/{repository_id}", status_code=204)
async def delete_repositorio(repository_id: uuid.UUID, purgar: bool = Query(False, description="Apaga também os commits."),
                             ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await RepositoryService.delete(ctx.db, repository_id, purgar)


@router.post("/repositorios/{repository_id}/sync", response_model=schemas.RepoSyncResult)
async def sync_repositorio(repository_id: uuid.UUID, full: bool = Query(False, description="Refaz o backfill inteiro."),
                           ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await RepoSyncService.sync_one(ctx.db, repository_id, full=full)


@router.get("/commits/overview", response_model=schemas.RepoOverviewResponse)
async def commits_overview(
    date_from: str = Query(..., alias="from", description="Início da janela (ISO date)."),
    date_to: str = Query(..., alias="to", description="Fim da janela, inclusivo (ISO date)."),
    products: Optional[str] = Query(None, description="UUIDs de produto, vírgula-separados."),
    repositories: Optional[str] = Query(None, description="UUIDs de repositório, vírgula-separados."),
    persons: Optional[str] = Query(None, description="UUIDs de pessoa, vírgula-separados."),
    teams: Optional[str] = Query(None, description="UUIDs de time (área folha do TeamOps)."),
    positions: Optional[str] = Query(None, description="Slugs de cargo, vírgula-separados."),
    incluir_bots: bool = Query(False),
    environments: Optional[str] = Query(
        None,
        description="Ambientes, vírgula-separados: prod (main), hml (preview), dev (demais).",
    ),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_view_repos),
):
    """Painel de commits: KPIs, série mensal, ranking por dev e visão por produto."""
    return await RepoMetricsService.build(
        ctx.db, date.fromisoformat(date_from), date.fromisoformat(date_to),
        environments=[e.strip() for e in environments.split(",") if e.strip()] if environments else None,
        product_ids=_uuids(products), repository_ids=_uuids(repositories),
        person_ids=_uuids(persons), team_area_ids=_uuids(teams),
        positions=_csv(positions), incluir_bots=incluir_bots,
    )


@router.get("/commits/autores", response_model=list[schemas.CommitAuthorResponse])
async def list_commit_autores(apenas_pendentes: bool = Query(False), ctx: ModuleContext = Depends(_ctx),
                              _=Depends(_can_view_repos)):
    return await CommitAuthorService.list_authors(ctx.db, apenas_pendentes)


@router.put("/commits/autores/{author_id}", response_model=schemas.CommitAuthorResponse)
async def update_commit_autor(author_id: uuid.UUID, data: schemas.CommitAuthorUpdate,
                              ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    """Vincula o e-mail a uma pessoa (ou marca como bot) e reaplica ao histórico."""
    return await CommitAuthorService.update_author(ctx.db, author_id, data, ctx.user.id)


@router.get("/commits", response_model=schemas.RepoCommitPage)
async def list_commits(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    products: Optional[str] = Query(None),
    repositories: Optional[str] = Query(None),
    persons: Optional[str] = Query(None),
    incluir_bots: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_view_repos),
):
    return await RepoMetricsService.list_commits(
        ctx.db, date.fromisoformat(date_from), date.fromisoformat(date_to),
        product_ids=_uuids(products), repository_ids=_uuids(repositories),
        person_ids=_uuids(persons), incluir_bots=incluir_bots, page=page, page_size=page_size,
    )


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


@router.patch("/{product_id}/fornecedor", response_model=schemas.ProductResponse)
async def definir_fornecedor(
    product_id: uuid.UUID,
    data: schemas.DefinirFornecedorRequest,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_manage),
):
    return await ProductService.definir_fornecedor(ctx.db, product_id, data.fornecedor_id, ctx.user.id)


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


@router.patch("/{product_id}/servicos/{servico_id}/subprocesso-dispensa", response_model=schemas.ServicoResponse)
async def set_servico_subprocesso_dispensa(
    product_id: uuid.UUID,
    servico_id: uuid.UUID,
    data: schemas.ServicoSubprocessoDispensa,
    ctx: ModuleContext = Depends(_ctx),
    _=Depends(_can_manage),
):
    return await ProductService.set_servico_subprocesso_dispensa(ctx.db, product_id, servico_id, data, ctx.user.id)


@router.delete("/{product_id}/servicos/{servico_id}", status_code=204)
async def delete_servico(product_id: uuid.UUID, servico_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await ProductService.delete_servico(ctx.db, product_id, servico_id, ctx.user.id)


# ── Documentos ────────────────────────────────
@router.post("/{product_id}/documentos", response_model=schemas.DocumentoResponse, status_code=201)
async def add_documento(product_id: uuid.UUID, data: schemas.DocumentoCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProductService.add_documento(ctx.db, product_id, data, ctx.user.id)


@router.patch("/{product_id}/documentos/{doc_id}", response_model=schemas.DocumentoResponse)
async def update_documento(product_id: uuid.UUID, doc_id: uuid.UUID, data: schemas.DocumentoUpdate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ProductService.update_documento(ctx.db, product_id, doc_id, data, ctx.user.id)


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


# ── Releases / Versões ────────────────────────
@router.get("/{product_id}/releases", response_model=list[schemas.ReleaseResponse])
async def list_releases(product_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await ReleaseService.list(ctx.db, product_id)


@router.post("/{product_id}/releases", response_model=schemas.ReleaseResponse, status_code=201)
async def add_release(product_id: uuid.UUID, data: schemas.ReleaseCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ReleaseService.create(ctx.db, product_id, data, ctx.user.id)


@router.patch("/{product_id}/releases/{release_id}", response_model=schemas.ReleaseResponse)
async def update_release(product_id: uuid.UUID, release_id: uuid.UUID, data: schemas.ReleaseUpdate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await ReleaseService.update(ctx.db, product_id, release_id, data, ctx.user.id)


@router.delete("/{product_id}/releases/{release_id}", status_code=204)
async def delete_release(product_id: uuid.UUID, release_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await ReleaseService.delete(ctx.db, product_id, release_id, ctx.user.id)


# ── Documentação (Markdown) ───────────────────
@router.get("/{product_id}/documentations", response_model=list[schemas.DocumentationResponse])
async def list_documentations(product_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await DocumentationService.list(ctx.db, product_id)


@router.post("/{product_id}/documentations", response_model=schemas.DocumentationResponse, status_code=201)
async def add_documentation(product_id: uuid.UUID, data: schemas.DocumentationCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await DocumentationService.create(ctx.db, product_id, data, ctx.user.id)


@router.patch("/{product_id}/documentations/{doc_id}", response_model=schemas.DocumentationResponse)
async def update_documentation(product_id: uuid.UUID, doc_id: uuid.UUID, data: schemas.DocumentationUpdate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await DocumentationService.update(ctx.db, product_id, doc_id, data, ctx.user.id)


@router.delete("/{product_id}/documentations/{doc_id}", status_code=204)
async def delete_documentation(product_id: uuid.UUID, doc_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await DocumentationService.delete(ctx.db, product_id, doc_id, ctx.user.id)


# ── Sustentação / SLA ─────────────────────────
# ── Sustentação / SLA ─────────────────────────
@router.get("/{product_id}/supports", response_model=list[schemas.SupportResponse])
async def list_supports(product_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx)):
    return await SupportService.list(ctx.db, product_id)


@router.post("/{product_id}/supports", response_model=schemas.SupportResponse)
async def create_support(product_id: uuid.UUID, data: schemas.SupportCreate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await SupportService.create(ctx.db, product_id, data, ctx.user.id)


@router.patch("/{product_id}/supports/{support_id}", response_model=schemas.SupportResponse)
async def update_support(product_id: uuid.UUID, support_id: uuid.UUID, data: schemas.SupportUpdate, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    return await SupportService.update(ctx.db, product_id, support_id, data, ctx.user.id)


@router.delete("/{product_id}/supports/{support_id}", status_code=204)
async def delete_support(product_id: uuid.UUID, support_id: uuid.UUID, ctx: ModuleContext = Depends(_ctx), _=Depends(_can_manage)):
    await SupportService.delete(ctx.db, product_id, support_id, ctx.user.id)
