"""Smoke tests do módulo atendimento."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_attendances_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/atendimento/attendances")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_clients_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/atendimento/clients")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_webhooks_verify_missing_token(client: AsyncClient):
    resp = await client.get("/api/v1/webhooks/whatsapp/unknown-tenant", params={
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong",
        "hub.challenge": "abc123",
    })
    assert resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_public_proposal_nonexistent_token(client: AsyncClient):
    resp = await client.get("/api/v1/public/propostas/nonexistent-token-xyz")
    assert resp.status_code == 404
