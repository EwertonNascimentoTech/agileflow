"""Respostas JSON estritas para consumidores rigorosos (Hermes, scripts, etc.)."""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi.encoders import jsonable_encoder
from starlette.responses import Response

# ASCII controls + DEL - nao podem aparecer literais em strings JSON "strict".
_CTRL_RE = re.compile(r"[\x00-\x1f\x7f]")


def sanitize_for_strict_json(value: Any) -> Any:
    """Remove caracteres de controle de strings (recursive)."""
    if isinstance(value, str):
        return _CTRL_RE.sub(" ", value)
    if isinstance(value, dict):
        return {k: sanitize_for_strict_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize_for_strict_json(v) for v in value]
    return value


class StrictJSONResponse(Response):
    """JSON com ensure_ascii + allow_nan=False + strings sem controles literais."""

    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        payload = sanitize_for_strict_json(jsonable_encoder(content))
        return json.dumps(
            payload,
            ensure_ascii=True,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
