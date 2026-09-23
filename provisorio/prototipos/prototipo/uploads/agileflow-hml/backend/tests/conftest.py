"""
Fixtures de teste: tenant, user, JWT token.
Usa banco de dados real (PostgreSQL de teste) via DATABASE_URL apontada pelo .env.
"""
import asyncio
import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text

from app.main import app
from app.core.config import settings
from app.core.security import get_password_hash, create_tokens


# ─────────────────────────────────────────────
# Event loop
# ─────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# ─────────────────────────────────────────────
# HTTP client
# ─────────────────────────────────────────────

@pytest_asyncio.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


# ─────────────────────────────────────────────
# Test user JWT token
# ─────────────────────────────────────────────

@pytest.fixture(scope="session")
def super_admin_token():
    """JWT de super_admin para testes — retorna string vazia (placeholder)."""
    return ""


async def _get_real_token(email: str, password: str) -> str:
    """Faz login real e retorna o access_token."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        resp = await c.post("/api/v1/auth/login", json={"email": email, "password": password})
        if resp.status_code == 200:
            return resp.json()["access_token"]
    return ""
