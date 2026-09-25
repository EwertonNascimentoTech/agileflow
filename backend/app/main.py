from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.selective_gzip import SelectiveGZipMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.core.limiter import limiter
from app.core.config import settings
from app.core.permissions import sync_permissions
from app.core.tenant_migrations import upgrade_all_tenants
from app.modules.super_admin.api.routes import router as super_admin_router
from app.modules.super_admin.api.routes import auth_router
from app.modules.company.api.routes import router as company_admin_router
from app.modules.projetos.api.routes import router as projetos_router
from app.modules.projetos.api.public_routes import router as projetos_public_router
from app.modules.projetos.api.client_routes import router as projetos_clients_router
from app.modules.teamops.api.routes import router as teamops_router
from app.modules.produtos.api.routes import router as produtos_router
from app.modules.produtos.api.webhooks import router as produtos_webhooks_router
from app.modules.produtos.api.public_routes import router as produtos_public_router
from app.modules.indicadores.api.routes import router as indicadores_router
from app.modules.rtd.api.routes import router as rtd_router
from app.modules.rtd.api.public_routes import router as rtd_public_router
from app.modules.docs.api.routes import router as docs_router


# Chave arbitrária (int64) para o advisory lock de startup. Com múltiplos workers
# uvicorn/gunicorn, cada processo roda o lifespan; sem serializar, todos executam
# as migrations de tenant / seed concorrentemente → corrida de DDL. O lock faz o
# primeiro worker rodar tudo e os demais esperarem; como os steps são idempotentes,
# a re-execução dos outros vira no-op rápido.
_STARTUP_LOCK_KEY = 748291043


@asynccontextmanager
async def lifespan(app: FastAPI):
    from sqlalchemy import text as _text
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as _lock_db:
        await _lock_db.execute(_text("SELECT pg_advisory_lock(:k)"), {"k": _STARTUP_LOCK_KEY})
        try:
            try:
                await sync_permissions()
            except Exception as e:  # noqa: BLE001
                print(f"[permissions] sync skipped: {e}")

            try:
                await upgrade_all_tenants()
            except Exception as e:  # noqa: BLE001
                print(f"[tenant_migrations] skipped: {e}")

            try:
                await _seed_known_modules()
            except Exception as e:  # noqa: BLE001
                print(f"[modules_seed] skipped: {e}")

            try:
                await _deactivate_removed_modules()
            except Exception as e:  # noqa: BLE001
                print(f"[modules_cleanup] skipped: {e}")
        finally:
            await _lock_db.execute(_text("SELECT pg_advisory_unlock(:k)"), {"k": _STARTUP_LOCK_KEY})

    yield


async def _deactivate_removed_modules() -> None:
    """Desativa módulos removidos do produto (registry + tenants)."""
    from sqlalchemy import text as _text
    from app.core.database import AsyncSessionLocal

    removed = ["crm", "estoque", "pdv", "atendimento", "propostas_contratos"]
    async with AsyncSessionLocal() as db:
        await db.execute(_text("SET search_path TO public"))
        await db.execute(
            _text("UPDATE modules SET is_active = FALSE WHERE slug = ANY(:slugs)"),
            {"slugs": removed},
        )
        await db.execute(
            _text("UPDATE tenant_modules SET is_active = FALSE WHERE module_slug = ANY(:slugs)"),
            {"slugs": removed},
        )
        await db.commit()


async def _seed_known_modules() -> None:
    from sqlalchemy import select, text as _text
    from app.core.database import AsyncSessionLocal
    from app.modules.super_admin.models import Module

    KNOWN_MODULES = [
        {
            "slug": "projetos",
            "name": "Processos",
            "description": "Gestão de processos com board kanban, tarefas, responsáveis, prazos e acompanhamento.",
            "icon": "FolderKanban",
            "color": "#164194",
            "backend_path": "backend/app/modules/projetos",
            "frontend_path": "frontend/src/modules/projetos",
        },
        {
            "slug": "teamops",
            "name": "Gestão de Times e Capacidade",
            "description": "Gestão de pessoas, áreas, POs, organograma, stacks, mapa de competências e ausências.",
            "icon": "Users",
            "color": "#008BD2",
            "backend_path": "backend/app/modules/teamops",
            "frontend_path": "frontend/src/modules/teamops",
        },
        {
            "slug": "produtos",
            "name": "Portfólio de Produtos",
            "description": "Produtos derivados de projetos finalizados, com áreas/diretorias, serviços, documentos natos digitais e portfólio de processos.",
            "icon": "Package",
            "color": "#7C3AED",
            "backend_path": "backend/app/modules/produtos",
            "frontend_path": "frontend/src/modules/produtos",
        },
        {
            "slug": "indicadores",
            "name": "Indicadores",
            "description": "Indicadores institucionais (estratégicos e táticos) com metas, acompanhamento por período, atingimento e dashboard.",
            "icon": "TrendingUp",
            "color": "#059669",
            "backend_path": "backend/app/modules/indicadores",
            "frontend_path": "frontend/src/modules/indicadores",
        },
        {
            "slug": "rtd",
            "name": "Reunião de Tomada de Decisão",
            "description": "Cerimônia de comitê por competência (mensal/trimestral): panorama do portfólio, evolução por PO, impacto em indicadores e deliberações registradas (ata).",
            "icon": "Gavel",
            "color": "#B45309",
            "backend_path": "backend/app/modules/rtd",
            "frontend_path": "frontend/src/modules/rtd",
        },
        {
            "slug": "portal_cliente",
            "name": "Modo Cliente",
            "description": "Portal do Cliente dentro do AgileFlow: a equipe vê o que o cliente vê. Coordenação vê todos os projetos; PO e desenvolvedor, os projetos em que atuam.",
            "icon": "Eye",
            "color": "#7C3AED",
            "backend_path": "backend/app/modules/projetos",
            "frontend_path": "frontend/src/modules/portal",
        },
        {
            "slug": "documentacao",
            "name": "Documentação",
            "description": "Guias de utilizador, processo de negócio e referência técnica da plataforma.",
            "icon": "BookOpen",
            "color": "#0F766E",
            "backend_path": "backend/app/modules/docs",
            "frontend_path": "frontend/src/modules/documentacao",
        },
    ]

    async with AsyncSessionLocal() as db:
        await db.execute(_text("SET search_path TO public"))
        for m in KNOWN_MODULES:
            result = await db.execute(select(Module).where(Module.slug == m["slug"]))
            existing = result.scalar_one_or_none()
            if existing is None:
                db.add(Module(**m, is_active=True))
            else:
                existing.color = m["color"]
                existing.icon = m["icon"]
                existing.name = m["name"]
                existing.description = m["description"]
                existing.backend_path = m["backend_path"]
                existing.frontend_path = m["frontend_path"]
                existing.is_active = True
        await db.commit()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    # Swagger, ReDoc e o schema só com DEBUG (dev). Em produção o /openapi.json também
    # fica fechado — antes continuava público mesmo sem o /docs.
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Comprime JSON grandes (kanban, portfolio autenticado, indicadores).
# Rotas /api/v1/public/* ficam fora — clientes simples sem gzip quebram o parse.
# Nível 6: ~38% mais rápido que o 9 com ~2,5% a mais de bytes (board: 64 → 40 ms).
app.add_middleware(SelectiveGZipMiddleware, minimum_size=1000, compresslevel=6)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(super_admin_router, prefix="/api/v1")
app.include_router(company_admin_router, prefix="/api/v1")
app.include_router(projetos_router, prefix="/api/v1")
app.include_router(projetos_clients_router, prefix="/api/v1")
app.include_router(teamops_router, prefix="/api/v1")
app.include_router(produtos_router, prefix="/api/v1")
# Fora de require_module: o Azure DevOps não manda JWT (autenticação por Basic no hook).
app.include_router(produtos_webhooks_router, prefix="/api/v1")
# Portfólio público com token fixo (PUBLIC_PRODUTOS_PORTFOLIO_TOKEN).
app.include_router(produtos_public_router, prefix="/api/v1")
# Ociosidade diária pública com token fixo (PUBLIC_OCIOSIDADE_TOKEN).
app.include_router(projetos_public_router, prefix="/api/v1")
app.include_router(indicadores_router, prefix="/api/v1")
app.include_router(rtd_router, prefix="/api/v1")
app.include_router(rtd_public_router, prefix="/api/v1")
app.include_router(docs_router, prefix="/api/v1")


@app.get("/health")
async def health():
    """Saúde de verdade: banco é obrigatório (503 se cair); Redis é cache fail-open, então
    fora do ar só marca "degraded". Timeouts curtos para o monitor não pendurar."""
    import asyncio
    from fastapi.responses import JSONResponse
    from sqlalchemy import text as _text
    from app.core.database import engine
    from app.core.cache import get_redis

    async def _db() -> None:
        async with engine.connect() as conn:
            await conn.execute(_text("SELECT 1"))

    checks: dict[str, str] = {}
    for name, probe in (("database", _db), ("redis", lambda: get_redis().ping())):
        try:
            await asyncio.wait_for(probe(), timeout=2)
            checks[name] = "ok"
        except Exception:  # noqa: BLE001 — health nunca levanta
            checks[name] = "fail"
    if checks["database"] != "ok":
        return JSONResponse({"status": "fail", **checks}, status_code=503)
    return {"status": "ok" if checks["redis"] == "ok" else "degraded", **checks}
