"""
cache.py — Cache Redis fail-open para dados quentes de autorização.

Todas as operações são "fail-open": se o Redis estiver indisponível/lento, os
helpers retornam None / viram no-op e o chamador cai no caminho do banco. O cache
NUNCA pode derrubar uma request.

Chaves de auth (TTL curto = settings.AUTH_CACHE_TTL, default 30s):
  auth:user:{user_id}            → snapshot do User (sem hashed_password)
  auth:modctx:{tenant_id}:{slug} → fatos de validação de módulo/tenant
  auth:perm:{role_id}:{code}     → bool (role tem a permissão)

Como o TTL é curto, invalidação explícita é um reforço (limita a janela de
inconsistência a segundos), não um pré-requisito de correção.
"""
import json
from typing import Any, Optional

import redis.asyncio as aioredis

from app.core.config import settings

_redis: Optional[aioredis.Redis] = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        # from_url é lazy (não conecta aqui). Timeouts baixos garantem fail-open
        # rápido se o Redis cair — a request não fica pendurada esperando o cache.
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
        )
    return _redis


# ─────────────────────────────────────────────
# Operações base (fail-open)
# ─────────────────────────────────────────────

async def cache_get(key: str) -> Any:
    """Retorna o valor desserializado, ou None em miss/erro."""
    try:
        raw = await get_redis().get(key)
    except Exception:  # noqa: BLE001 — fail-open
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None


async def cache_set(key: str, value: Any, ttl: int) -> None:
    try:
        await get_redis().set(key, json.dumps(value), ex=ttl)
    except Exception:  # noqa: BLE001 — fail-open
        pass


async def cache_delete(*keys: str) -> None:
    if not keys:
        return
    try:
        await get_redis().delete(*keys)
    except Exception:  # noqa: BLE001 — fail-open
        pass


async def cache_delete_pattern(pattern: str) -> None:
    """Remove todas as chaves que casam com o glob `pattern` (via SCAN, não KEYS)."""
    try:
        r = get_redis()
        batch: list[str] = []
        async for k in r.scan_iter(match=pattern, count=200):
            batch.append(k)
            if len(batch) >= 200:
                await r.delete(*batch)
                batch = []
        if batch:
            await r.delete(*batch)
    except Exception:  # noqa: BLE001 — fail-open
        pass


# ─────────────────────────────────────────────
# Chaves + invalidação da cadeia de auth
# ─────────────────────────────────────────────

def user_key(user_id: Any) -> str:
    return f"auth:user:{user_id}"


def modctx_key(tenant_id: Any, module_slug: str) -> str:
    return f"auth:modctx:{tenant_id}:{module_slug}"


def perm_key(role_id: Any, code: str) -> str:
    return f"auth:perm:{role_id}:{code}"


def po_external_key(user_id: Any) -> str:
    """Cargo Product Owner (Externo) do usuário — decide o bloqueio de módulos inteiros."""
    return f"auth:po_external:{user_id}"


def person_key(user_id: Any) -> str:
    """person_id (teamops) do login — sondado em toda carga de kanban."""
    return f"auth:person:{user_id}"


def po_external_person_key(user_id: Any) -> str:
    """person_id quando o login é PO Externo; sentinela quando não é.

    Separado de `po_external_key` porque ali guardamos um booleano; aqui o próprio
    id, que é o que o recorte de visibilidade do kanban precisa.
    """
    return f"auth:po_person:{user_id}"


async def invalidate_po_external(user_id: Any) -> None:
    """Chamar após mudar o Cargo de uma Pessoa (ou seu vínculo com um login)."""
    await cache_delete(
        po_external_key(user_id), person_key(user_id), po_external_person_key(user_id)
    )


async def invalidate_user(user_id: Any) -> None:
    """Chamar após mudar role, role_id, is_active ou tenant de um usuário."""
    await cache_delete(user_key(user_id))


async def invalidate_tenant_modules(tenant_id: Any) -> None:
    """Chamar após (des)ativar módulos de um tenant ou (in)ativar o tenant."""
    await cache_delete_pattern(f"auth:modctx:{tenant_id}:*")


async def invalidate_module_registry(module_slug: str) -> None:
    """Chamar após mudar is_active de um módulo no registry global."""
    await cache_delete_pattern(f"auth:modctx:*:{module_slug}")


async def invalidate_role_permissions(role_id: Any) -> None:
    """Chamar após alterar as permissões de uma Role."""
    await cache_delete_pattern(f"auth:perm:{role_id}:*")


# ─────────────────────────────────────────────
# Marcadores de bootstrap idempotente
# ─────────────────────────────────────────────

def bootstrap_key(schema: str, name: str, scope_id: Any) -> str:
    """Marca que um bootstrap idempotente já rodou, para tirá-lo do caminho de leitura.

    Alguns GETs disparam um `ensure_*` que faz dezenas de queries e um commit a cada
    request só para garantir que uma estrutura existe. O marcador transforma isso em
    "uma vez por TTL" em vez de "toda leitura".

    Como o cache é fail-open, perder a chave só custa uma re-execução do bootstrap —
    que é idempotente por construção. Nunca é fonte de verdade.
    """
    return f"bootstrap:{name}:{schema}:{scope_id}"


async def invalidate_bootstrap(schema: str, name: str, scope_id: Any) -> None:
    """Força a próxima leitura a rodar o bootstrap de novo."""
    await cache_delete(bootstrap_key(schema, name, scope_id))
