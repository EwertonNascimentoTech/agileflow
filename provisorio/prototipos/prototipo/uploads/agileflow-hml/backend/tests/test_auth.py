"""Smoke tests de autenticação."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "nonexistent@test.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_missing_fields(client: AsyncClient):
    resp = await client.post("/api/v1/auth/login", json={"email": "test@test.com"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_me_without_token(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_me_with_invalid_token(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_forgot_password_unknown_email(client: AsyncClient):
    resp = await client.post("/api/v1/auth/forgot-password", json={"email": "nobody@nowhere.com"})
    # Pode retornar 404 (usuário não encontrado) ou 200 com reset_token em modo dev
    assert resp.status_code in (200, 404, 400)


@pytest.mark.asyncio
async def test_refresh_with_invalid_token(client: AsyncClient):
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": "invalid.refresh.token"})
    assert resp.status_code in (401, 400)


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
