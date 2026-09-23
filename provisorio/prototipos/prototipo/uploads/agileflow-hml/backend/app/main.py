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
from app.modules.integrations.api.webhook_routes import router as webhooks_router
from app.modules.crm.api.routes import router as crm_router
from app.modules.crm.api.proposals_routes import router as crm_proposals_router
from app.modules.crm.api.proposals_public_routes import router as crm_proposals_public_router
from app.modules.crm.api.admin_routes import router as crm_admin_router
from app.modules.projetos.api.routes import router as projetos_router
from app.modules.estoque.api.routes import router as estoque_router
from app.modules.pdv.api.routes import router as pdv_router
from app.modules.teamops.api.routes import router as teamops_router


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

    # Migra tenants/roles antigos (atendimento + propostas_contratos) para o módulo unificado crm.
    try:
        await _auto_migrate_to_crm()
    except Exception as e:  # noqa: BLE001
        print(f"[auto_migrate_to_crm] skipped: {e}")

    yield


async def _auto_migrate_to_crm() -> None:
    """
    Para cada tenant que tem 'atendimento' ou 'propostas_contratos' ativo,
    ativa 'crm' automaticamente. Adiciona todas as permissions crm.* para
    roles que tinham atendimento.* ou propostas_contratos.*.
    """
    from sqlalchemy import select, text as _text, or_
    from app.core.database import AsyncSessionLocal
    from app.modules.super_admin.models import TenantModule, Role, RolePermission
    from datetime import datetime

    async with AsyncSessionLocal() as db:
        await db.execute(_text("SET search_path TO public"))

        # 1. Ativar crm para tenants que tinham atendimento OU propostas_contratos
        tenants_to_migrate = await db.execute(
            select(TenantModule.tenant_id).where(
                TenantModule.module_slug.in_(["atendimento", "propostas_contratos"]),
                TenantModule.is_active == True,  # noqa: E712
            ).distinct()
        )
        tenant_ids = [row[0] for row in tenants_to_migrate.all()]

        for tid in tenant_ids:
            existing = await db.execute(
                select(TenantModule).where(
                    TenantModule.tenant_id == tid,
                    TenantModule.module_slug == "crm",
                )
            )
            if not existing.scalar_one_or_none():
                db.add(TenantModule(
                    tenant_id=tid,
                    module_slug="crm",
                    is_active=True,
                    activated_at=datetime.utcnow(),
                ))
        await db.commit()

        # 2. Migrar permissions de roles
        roles_result = await db.execute(
            select(RolePermission).where(
                or_(
                    RolePermission.permission_code.like("atendimento.%"),
                    RolePermission.permission_code.like("propostas_contratos.%"),
                )
            )
        )
        existing_role_perms = roles_result.scalars().all()

        for rp in existing_role_perms:
            old_code = rp.permission_code
            new_code = old_code.replace("atendimento.", "crm.").replace("propostas_contratos.", "crm.")

            check = await db.execute(
                select(RolePermission).where(
                    RolePermission.role_id == rp.role_id,
                    RolePermission.permission_code == new_code,
                )
            )
            if not check.scalar_one_or_none():
                db.add(RolePermission(
                    role_id=rp.role_id,
                    permission_code=new_code,
                ))
        await db.commit()

        # 3. Desativar módulos antigos no registry e nos tenants
        from app.modules.super_admin.models import Module
        deprecated_slugs = ["atendimento", "propostas_contratos"]
        await db.execute(_text(
            "UPDATE modules SET is_active = FALSE WHERE slug = ANY(:slugs)"
        ), {"slugs": deprecated_slugs})
        await db.execute(_text(
            "UPDATE tenant_modules SET is_active = FALSE WHERE module_slug = ANY(:slugs)"
        ), {"slugs": deprecated_slugs})
        await db.commit()


async def _seed_known_modules() -> None:
    """Cadastra os módulos do core no registry se ainda não estiverem cadastrados."""
    from sqlalchemy import select, text as _text
    from app.core.database import AsyncSessionLocal
    from app.modules.super_admin.models import Module

    # Cores alinhadas ao design system institucional:
    #   Brand:  #001834 #014898 #164194 #112A59
    #   Ações:  #6AB42F #008BD2 #E84E0F #66C1BF
    KNOWN_MODULES = [
        {
            "slug": "crm",
            "name": "CRM",
            "description": "CRM completo: atendimentos, kanban, propostas, contratos, automações e relatórios.",
            "icon": "Briefcase",
            "color": "#014898",
            "backend_path": "backend/app/modules/crm",
            "frontend_path": "frontend/src/modules/crm",
        },
        {
            "slug": "estoque",
            "name": "Estoque",
            "description": "Catálogo de produtos, depósitos, fornecedores, lotes, números de série e movimentações.",
            "icon": "Package",
            "color": "#E84E0F",
            "backend_path": "backend/app/modules/estoque",
            "frontend_path": "frontend/src/modules/estoque",
        },
        {
            "slug": "projetos",
            "name": "Projetos",
            "description": "Gestão de projetos com board kanban, tarefas, responsáveis, prazos e acompanhamento.",
            "icon": "FolderKanban",
            "color": "#164194",
            "backend_path": "backend/app/modules/projetos",
            "frontend_path": "frontend/src/modules/projetos",
        },
        {
            "slug": "pdv",
            "name": "PDV",
            "description": "Ponto de venda: sessão de caixa, vendas com carrinho, recibos e relatórios.",
            "icon": "ShoppingCart",
            "color": "#6AB42F",
            "backend_path": "backend/app/modules/pdv",
            "frontend_path": "frontend/src/modules/pdv",
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
    ]

    async with AsyncSessionLocal() as db:
        await db.execute(_text("SET search_path TO public"))
        for m in KNOWN_MODULES:
            result = await db.execute(select(Module).where(Module.slug == m["slug"]))
            existing = result.scalar_one_or_none()
            if existing is None:
                db.add(Module(**m, is_active=True))
            else:
                # Mantém visual alinhado ao design system institucional (cor + ícone + nome + descrição).
                existing.color = m["color"]
                existing.icon = m["icon"]
                existing.name = m["name"]
                existing.description = m["description"]
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
app.include_router(webhooks_router, prefix="/api/v1")
app.include_router(crm_router, prefix="/api/v1")
app.include_router(crm_proposals_router, prefix="/api/v1")
app.include_router(crm_proposals_public_router, prefix="/api/v1")
app.include_router(crm_admin_router, prefix="/api/v1")
app.include_router(projetos_router, prefix="/api/v1")
app.include_router(estoque_router, prefix="/api/v1")
app.include_router(pdv_router, prefix="/api/v1")
app.include_router(teamops_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}
