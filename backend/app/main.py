from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
from app.modules.teamops.api.routes import router as teamops_router
from app.modules.produtos.api.routes import router as produtos_router


@asynccontextmanager
async def lifespan(app: FastAPI):
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
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
app.include_router(teamops_router, prefix="/api/v1")
app.include_router(produtos_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}
