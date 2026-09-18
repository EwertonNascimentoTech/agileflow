"""GZip seletivo - nao comprime rotas publicas consumidas por clientes simples."""

from __future__ import annotations

from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

# Clientes como Hermes/curl sem decompress interpretam o binario gzip como texto
# e o json.loads acusa "Invalid control character".
_SKIP_PREFIXES = (
    "/api/v1/public/",
)


class SelectiveGZipMiddleware(GZipMiddleware):
    def __init__(self, app: ASGIApp, minimum_size: int = 500, compresslevel: int = 9) -> None:
        super().__init__(app, minimum_size=minimum_size, compresslevel=compresslevel)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            path = scope.get("path") or ""
            if any(path.startswith(p) for p in _SKIP_PREFIXES):
                await self.app(scope, receive, send)
                return
        await super().__call__(scope, receive, send)
