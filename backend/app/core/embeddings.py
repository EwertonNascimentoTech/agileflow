"""Busca semântica com pgvector: indexa texto de qualquer registro e acha os trechos parecidos.

Os vetores vêm do container `embeddings` (BAAI/bge-m3, 1024 dimensões, roda no próprio
servidor — o texto não sai dele). O que for mandado depois ao IDCortex continua passando por
`anonymize.py`: o IDCortex recebe os TRECHOS em texto, nunca os vetores.

Tabela `{schema}.embeddings` (step 145), uma linha por pedaço de texto de uma origem
(`source_type` livre, ex. "project_task"; `source_id` = id do registro). Tudo em SQL cru e com
o schema explícito: a tabela e o tipo `vector` não estão no TenantBase (ver o step).

Uso típico: `celery_app.send_task("embeddings.index_source", args=[schema, "project_task", id, texto])`
ao salvar o registro, e `EmbeddingService.search(db, schema, pergunta)` na hora de buscar.
"""
import hashlib
import logging
import re
import uuid
from datetime import datetime
from typing import Optional, Sequence

import httpx
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

# Dimensão do bge-m3. Trocar de modelo com outra dimensão exige coluna nova (e reindexar tudo).
EMBEDDING_DIM = 1024
# ~500 tokens por pedaço (português ≈ 4 caracteres/token), com sobreposição para não cortar
# uma ideia ao meio entre dois pedaços.
CHUNK_CHARS = 2000
CHUNK_OVERLAP = 200
_BATCH = 32

_SCHEMA_RE = re.compile(r"tenant_[a-z0-9_]+")


class EmbeddingsUnavailable(Exception):
    """Serviço de embeddings fora do ar ou desligado (a tarefa do Celery tenta de novo)."""


def _schema(schema: str) -> str:
    if not _SCHEMA_RE.fullmatch(schema or ""):
        raise ValueError(f"schema inválido: {schema!r}")
    return schema


def _vector_literal(values: Sequence[float]) -> str:
    return "[" + ",".join(f"{v:.7g}" for v in values) + "]"


def chunk_text(content: str, size: int = CHUNK_CHARS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Quebra em pedaços de até `size` caracteres, preferindo cortar em parágrafo/frase/espaço."""
    content = re.sub(r"[ \t]+", " ", (content or "")).strip()
    if not content:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(content):
        end = min(start + size, len(content))
        if end < len(content):
            window = content[start:end]
            for sep in ("\n\n", "\n", ". ", " "):
                cut = window.rfind(sep)
                if cut > size // 2:
                    end = start + cut + len(sep)
                    break
        piece = content[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= len(content):
            break
        start = max(end - overlap, start + 1)
    return chunks


class EmbeddingService:

    @staticmethod
    def enabled() -> bool:
        return settings.VECTOR_ENABLED

    @staticmethod
    async def embed(texts: list[str]) -> list[list[float]]:
        if not EmbeddingService.enabled():
            raise EmbeddingsUnavailable("VECTOR_ENABLED desligado")
        vectors: list[list[float]] = []
        async with httpx.AsyncClient(timeout=settings.EMBEDDINGS_TIMEOUT) as client:
            for i in range(0, len(texts), _BATCH):
                try:
                    resp = await client.post(
                        settings.EMBEDDINGS_URL.rstrip("/") + "/embed", json={"texts": texts[i:i + _BATCH]}
                    )
                    resp.raise_for_status()
                except httpx.HTTPError as exc:
                    raise EmbeddingsUnavailable(str(exc) or exc.__class__.__name__) from exc
                data = resp.json()
                if data.get("dim") != EMBEDDING_DIM:
                    raise EmbeddingsUnavailable(
                        f"modelo {data.get('model')} devolveu {data.get('dim')} dimensões (esperado {EMBEDDING_DIM})"
                    )
                vectors.extend(data["embeddings"])
        return vectors

    @staticmethod
    async def index(
        db: AsyncSession, schema: str, source_type: str, source_id: uuid.UUID, content: str
    ) -> int:
        """Grava (ou atualiza) os pedaços de um registro. Pedaço sem mudança não é recalculado.
        Devolve quantos pedaços foram (re)calculados."""
        schema = _schema(schema)
        chunks = chunk_text(content)
        hashes = [hashlib.sha256(c.encode()).hexdigest() for c in chunks]
        model = settings.EMBEDDINGS_MODEL
        rows = (await db.execute(
            text(f"SELECT chunk_index, content_hash, model FROM {schema}.embeddings "
                 "WHERE source_type = :t AND source_id = :id"),
            {"t": source_type, "id": source_id},
        )).all()
        current = {r.chunk_index: (r.content_hash, r.model) for r in rows}
        changed = [i for i, h in enumerate(hashes) if current.get(i) != (h, model)]

        vectors = await EmbeddingService.embed([chunks[i] for i in changed]) if changed else []
        now = datetime.utcnow()
        for i, vec in zip(changed, vectors):
            await db.execute(
                text(f"""
                    INSERT INTO {schema}.embeddings
                        (source_type, source_id, chunk_index, content, content_hash, model, embedding, updated_at)
                    VALUES (:t, :id, :i, :content, :hash, :model, CAST(CAST(:vec AS text) AS public.vector), :now)
                    ON CONFLICT (source_type, source_id, chunk_index) DO UPDATE SET
                        content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
                        model = EXCLUDED.model, embedding = EXCLUDED.embedding, updated_at = EXCLUDED.updated_at
                """),
                {"t": source_type, "id": source_id, "i": i, "content": chunks[i], "hash": hashes[i],
                 "model": model, "vec": _vector_literal(vec), "now": now},
            )
        # Texto encolheu: some com os pedaços que sobraram do fim.
        await db.execute(
            text(f"DELETE FROM {schema}.embeddings WHERE source_type = :t AND source_id = :id AND chunk_index >= :n"),
            {"t": source_type, "id": source_id, "n": len(chunks)},
        )
        await db.commit()
        return len(changed)

    @staticmethod
    async def delete(db: AsyncSession, schema: str, source_type: str, source_id: uuid.UUID) -> None:
        schema = _schema(schema)
        await db.execute(
            text(f"DELETE FROM {schema}.embeddings WHERE source_type = :t AND source_id = :id"),
            {"t": source_type, "id": source_id},
        )
        await db.commit()

    @staticmethod
    async def search(
        db: AsyncSession,
        schema: str,
        query: str,
        source_types: Optional[Sequence[str]] = None,
        limit: int = 10,
    ) -> list[dict]:
        """Trechos mais parecidos com `query` (score 0–1, maior = mais parecido)."""
        schema = _schema(schema)
        query = (query or "").strip()
        if not query:
            return []
        try:
            [vec] = await EmbeddingService.embed([query])
        except EmbeddingsUnavailable as exc:
            logger.warning("embeddings: busca indisponível (%s)", exc)
            raise HTTPException(status_code=503, detail="Busca semântica indisponível no momento.")
        where = "WHERE source_type = ANY(:types)" if source_types else ""
        rows = (await db.execute(
            text(f"""
                SELECT source_type, source_id, chunk_index, content,
                       1 - (embedding OPERATOR(public.<=>) CAST(CAST(:q AS text) AS public.vector)) AS score
                FROM {schema}.embeddings
                {where}
                ORDER BY embedding OPERATOR(public.<=>) CAST(CAST(:q AS text) AS public.vector)
                LIMIT :limit
            """),
            {"q": _vector_literal(vec), "types": list(source_types or []), "limit": max(1, min(limit, 100))},
        )).all()
        return [
            {"source_type": r.source_type, "source_id": r.source_id, "chunk_index": r.chunk_index,
             "content": r.content, "score": float(r.score)}
            for r in rows
        ]
