from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from app.core.config import settings


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,   # revalida conexões da pool antes de usar — evita "aborted transaction" acumulado
    # Multi-tenant via search_path muda o schema entre requests. asyncpg cacheia
    # prepared statements pelo plano gerado no schema ativo — se a conexão volta
    # pra pool com search_path de tenant antigo, os statements cacheados apontam
    # pra tabelas em schema errado e quebram com "relation does not exist".
    # Desabilita o cache pra evitar essa contaminação.
    connect_args={"prepared_statement_cache_size": 0, "statement_cache_size": 0},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base para tabelas do schema public (Super Admin)."""
    pass


class TenantBase(DeclarativeBase):
    """Base para tabelas dos schemas de tenant (módulos de negócio)."""
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(text("SET search_path TO public"))
            yield session
        finally:
            await session.close()


async def get_tenant_db(schema_name: str) -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            await session.execute(text(f"SET search_path TO {schema_name}, public"))
            yield session
        finally:
            await session.execute(text("SET search_path TO public"))
            await session.close()


async def create_tenant_schema(schema_name: str) -> None:
    """Cria o schema isolado do tenant no PostgreSQL."""
    async with engine.begin() as conn:
        await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema_name}"))


async def create_tenant_tables(schema_name: str) -> None:
    """Cria todas as tabelas de negócio no schema do tenant."""
    # Importa todos os módulos pra registrar modelos no TenantBase.metadata
    import app.modules.crm.models  # noqa
    import app.modules.estoque.models  # noqa
    import app.modules.pdv.models  # noqa

    async with engine.begin() as conn:
        await conn.execute(text(f"SET search_path TO {schema_name}"))
        await conn.run_sync(TenantBase.metadata.create_all)
