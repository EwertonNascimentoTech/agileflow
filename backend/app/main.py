from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter

from app.core.config import settings
from app.core.permissions import sync_permissions
from app.core.tenant_migrations import upgrade_all_tenants
from app.modules.super_admin.api.routes import router as super_admin_router
from app.modules.super_admin.api.routes import auth_router
from app.modules.atendimento.api.routes import router as atendimento_router
from app.modules.propostas_contratos.api.routes import router as propostas_router
from app.modules.propostas_contratos.api.public_routes import router as propostas_public_router
from app.modules.company.api.routes import router as company_router
from app.modules.integrations.api.webhook_routes import router as webhooks_router
from app.modules.estoque.api.routes import router as estoque_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Sincroniza permissões declaradas pelos módulos no startup.
    try:
        await sync_permissions()
    except Exception as e:  # noqa: BLE001
        # Não derruba o app se a tabela ainda não existe (ex: antes da migration).
        print(f"[permissions] sync skipped: {e}")

    # Aplica migrations idempotentes nos schemas dos tenants existentes.
    try:
        await upgrade_all_tenants()
    except Exception as e:  # noqa: BLE001
        print(f"[tenant_migrations] skipped: {e}")

    # Garante que módulos conhecidos estão registrados (idempotente).
    try:
        await _seed_known_modules()
    except Exception as e:  # noqa: BLE001
        print(f"[modules_seed] skipped: {e}")

    yield


async def _seed_known_modules() -> None:
    """Cadastra os módulos do core no registry se ainda não estiverem cadastrados."""
    from sqlalchemy import select, text as _text
    from app.core.database import AsyncSessionLocal
    from app.modules.super_admin.models import Module

    KNOWN_MODULES = [
        {
            "slug": "propostas_contratos",
            "name": "Propostas e Contratos",
            "description": "Propostas comerciais versionadas, com itens, status e geração de PDF.",
            "icon": "FileText",
            "color": "#8B5CF6",
            "backend_path": "backend/app/modules/propostas_contratos",
            "frontend_path": "frontend/src/modules/propostas_contratos",
        },
        {
            "slug": "estoque",
            "name": "Estoque",
            "description": "Catálogo de produtos, depósitos, fornecedores, lotes, números de série e movimentações.",
            "icon": "Package",
            "color": "#F59E0B",
            "backend_path": "backend/app/modules/estoque",
            "frontend_path": "frontend/src/modules/estoque",
        },
    ]

    async with AsyncSessionLocal() as db:
        await db.execute(_text("SET search_path TO public"))
        for m in KNOWN_MODULES:
            result = await db.execute(select(Module).where(Module.slug == m["slug"]))
            if result.scalar_one_or_none() is None:
                db.add(Module(**m, is_active=True))
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
app.include_router(atendimento_router, prefix="/api/v1")
app.include_router(propostas_router, prefix="/api/v1")
app.include_router(propostas_public_router, prefix="/api/v1")
app.include_router(company_router, prefix="/api/v1")
app.include_router(webhooks_router, prefix="/api/v1")
app.include_router(estoque_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}
