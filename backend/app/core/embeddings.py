"""Busca semântica com pgvector: indexa texto de qualquer registro e acha os trechos parecidos.

Os vetores vêm do container `embeddings` (BAAI/bge-m3, 1024 dimensões, roda no próprio
servidor — o texto não sai dele). O que for mandado depois à IA externa (Azure AI Foundry)
continua passando por `anonymize.py`: ela recebe os TRECHOS em texto, nunca os vetores.

Tabela `{schema}.embeddings` (step 145), uma linha por pedaço de texto de uma origem
(`source_type` livre, ex. "project_task"; `source_id` = id do registro). Tudo em SQL cru e com
o schema explícito: a tabela e o tipo `vector` não estão no TenantBase (ver o step).

Uso típico: `celery_app.send_task("embeddings.index_source", args=[schema, "project_task", id, texto])`
ao salvar o registro, e `EmbeddingService.search(db, schema, pergunta)` na hora de buscar.

`scope_id` (step 146) = o que dá acesso ao trecho (ex.: card-raiz do projeto ou programa). A
busca filtra por ele no SQL (`scopes`), então quem busca só recebe trechos do próprio recorte.
Base inteira de uma vez (docs montados pelo módulo): `EmbeddingService.sync`, que compara com o
que já está gravado e só recalcula o que mudou.
"""
import hashlib
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Awaitable, Callable, Optional, Sequence

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


def _hash(chunk: str) -> str:
    return hashlib.sha256(chunk.encode()).hexdigest()


@dataclass
class Doc:
    """Um registro a indexar: texto inteiro + o que dá acesso a ele (`scope_id`)."""
    source_type: str
    source_id: uuid.UUID
    scope_id: Optional[uuid.UUID]
    content: str


@dataclass
class SyncPlan:
    """O que falta para o índice ficar igual aos docs (ver `plan_sync`)."""
    upserts: list[tuple[Doc, int, str, str]] = field(default_factory=list)  # doc, pedaço, texto, hash
    rescope: list[Doc] = field(default_factory=list)       # só o scope_id mudou
    trims: list[tuple[str, uuid.UUID, int]] = field(default_factory=list)  # tipo, id, nº de pedaços que ficam
    removals: list[tuple[str, uuid.UUID]] = field(default_factory=list)    # origem que saiu da base
    docs_total: int = 0
    changed: dict[str, int] = field(default_factory=dict)  # tipo → registros a (re)gravar
    removed: dict[str, int] = field(default_factory=dict)  # tipo → registros a apagar

    @property
    def empty(self) -> bool:
        return not (self.upserts or self.rescope or self.trims or self.removals)


def plan_sync(existing: Sequence, docs: Sequence[Doc], model: str, force: bool = False) -> SyncPlan:
    """Compara o gravado (`existing`: linhas com source_type, source_id, chunk_index,
    content_hash, model, scope_id) com os docs. Pedaço igual (mesmo hash e modelo) não é
    recalculado, a não ser com `force` (reindexar tudo). Doc sem texto sai do índice."""
    current: dict[tuple[str, uuid.UUID], dict[int, tuple[str, str, Optional[uuid.UUID]]]] = {}
    for r in existing:
        current.setdefault((r.source_type, r.source_id), {})[r.chunk_index] = (r.content_hash, r.model, r.scope_id)

    plan = SyncPlan()
    seen: set[tuple[str, uuid.UUID]] = set()
    kept: set[tuple[str, uuid.UUID]] = set()
    for doc in docs:
        key = (doc.source_type, doc.source_id)
        if key in seen:
            continue
        seen.add(key)
        chunks = chunk_text(doc.content)
        if not chunks:
            continue  # sem texto: sai do índice (abaixo)
        kept.add(key)
        plan.docs_total += 1
        have = current.get(key, {})
        touched = False
        for i, chunk in enumerate(chunks):
            h = _hash(chunk)
            old = have.get(i)
            if force or old is None or (old[0], old[1]) != (h, model):
                plan.upserts.append((doc, i, chunk, h))
                touched = True
        if any(i >= len(chunks) for i in have):
            plan.trims.append((doc.source_type, doc.source_id, len(chunks)))
            touched = True
        if have and any(v[2] != doc.scope_id for v in have.values()):
            plan.rescope.append(doc)
            touched = True
        if touched:
            plan.changed[doc.source_type] = plan.changed.get(doc.source_type, 0) + 1
    for key in current:
        if key not in kept:
            plan.removals.append(key)
            plan.removed[key[0]] = plan.removed.get(key[0], 0) + 1
    return plan


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
    async def health(load: bool = False, timeout: float = 5.0) -> dict:
        """Situação do serviço de embeddings: {ok, model, loaded, error}. `load` carrega o modelo
        (1º uso depois de subir o container leva ~1 min)."""
        if not EmbeddingService.enabled():
            return {"ok": False, "model": None, "loaded": False, "error": "VECTOR_ENABLED desligado"}
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(
                    settings.EMBEDDINGS_URL.rstrip("/") + "/health", params={"load": "true"} if load else None
                )
                resp.raise_for_status()
                data = resp.json()
            return {"ok": True, "model": data.get("model"), "loaded": bool(data.get("loaded")), "error": None}
        except (httpx.HTTPError, ValueError) as exc:
            return {"ok": False, "model": None, "loaded": False, "error": str(exc) or exc.__class__.__name__}

    @staticmethod
    async def table_ready(db: AsyncSession, schema: str) -> bool:
        """A tabela só existe com a extensão `vector` (step 145) e a coluna scope_id (step 146)."""
        schema = _schema(schema)
        return bool((await db.execute(
            text("SELECT 1 FROM information_schema.columns "
                 "WHERE table_schema = :s AND table_name = 'embeddings' AND column_name = 'scope_id'"),
            {"s": schema},
        )).scalar())

    @staticmethod
    async def _upsert(db: AsyncSession, schema: str, rows: list[dict]) -> None:
        if not rows:
            return
        await db.execute(
            text(f"""
                INSERT INTO {schema}.embeddings
                    (source_type, source_id, scope_id, chunk_index, content, content_hash, model, embedding, updated_at)
                VALUES (:t, :id, :scope, :i, :content, :hash, :model, CAST(CAST(:vec AS text) AS public.vector), :now)
                ON CONFLICT (source_type, source_id, chunk_index) DO UPDATE SET
                    scope_id = COALESCE(EXCLUDED.scope_id, embeddings.scope_id),
                    content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
                    model = EXCLUDED.model, embedding = EXCLUDED.embedding, updated_at = EXCLUDED.updated_at
            """),
            rows,
        )

    @staticmethod
    async def index(
        db: AsyncSession, schema: str, source_type: str, source_id: uuid.UUID, content: str,
        scope_id: Optional[uuid.UUID] = None,
    ) -> int:
        """Grava (ou atualiza) os pedaços de um registro. Pedaço sem mudança não é recalculado.
        Devolve quantos pedaços foram (re)calculados."""
        schema = _schema(schema)
        chunks = chunk_text(content)
        hashes = [_hash(c) for c in chunks]
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
        await EmbeddingService._upsert(db, schema, [
            {"t": source_type, "id": source_id, "scope": scope_id, "i": i, "content": chunks[i], "hash": hashes[i],
             "model": model, "vec": _vector_literal(vec), "now": now}
            for i, vec in zip(changed, vectors)
        ])
        if scope_id is not None:
            await db.execute(
                text(f"UPDATE {schema}.embeddings SET scope_id = :scope "
                     "WHERE source_type = :t AND source_id = :id AND scope_id IS DISTINCT FROM :scope"),
                {"t": source_type, "id": source_id, "scope": scope_id},
            )
        # Texto encolheu: some com os pedaços que sobraram do fim.
        await db.execute(
            text(f"DELETE FROM {schema}.embeddings WHERE source_type = :t AND source_id = :id AND chunk_index >= :n"),
            {"t": source_type, "id": source_id, "n": len(chunks)},
        )
        await db.commit()
        return len(changed)

    @staticmethod
    async def sync(
        db: AsyncSession,
        schema: str,
        docs: Sequence[Doc],
        source_types: Sequence[str],
        *,
        force: bool = False,
        dry_run: bool = False,
        on_progress: Optional[Callable[[int, int], Awaitable[None]]] = None,
        group: int = 64,
    ) -> SyncPlan:
        """Deixa as origens de `source_types` iguais aos `docs`: grava o que é novo ou mudou,
        apaga o que saiu. Commit a cada `group` pedaços (o progresso aparece durante a carga).
        `dry_run` só devolve o plano (tela de Configurações: pendências)."""
        schema = _schema(schema)
        existing = (await db.execute(
            text(f"SELECT source_type, source_id, chunk_index, content_hash, model, scope_id "
                 f"FROM {schema}.embeddings WHERE source_type = ANY(:types)"),
            {"types": list(source_types)},
        )).all()
        plan = plan_sync(existing, [d for d in docs if d.source_type in set(source_types)],
                         settings.EMBEDDINGS_MODEL, force=force)
        if dry_run or plan.empty:
            return plan

        total = len(plan.upserts)
        model = settings.EMBEDDINGS_MODEL
        for start in range(0, total, group):
            part = plan.upserts[start:start + group]
            vectors = await EmbeddingService.embed([chunk for _d, _i, chunk, _h in part])
            now = datetime.utcnow()
            await EmbeddingService._upsert(db, schema, [
                {"t": d.source_type, "id": d.source_id, "scope": d.scope_id, "i": i, "content": chunk,
                 "hash": h, "model": model, "vec": _vector_literal(vec), "now": now}
                for (d, i, chunk, h), vec in zip(part, vectors)
            ])
            await db.commit()
            if on_progress is not None:
                await on_progress(min(start + group, total), total)

        if plan.rescope:
            await db.execute(
                text(f"UPDATE {schema}.embeddings SET scope_id = :scope WHERE source_type = :t AND source_id = :id"),
                [{"t": d.source_type, "id": d.source_id, "scope": d.scope_id} for d in plan.rescope],
            )
        if plan.trims:
            await db.execute(
                text(f"DELETE FROM {schema}.embeddings WHERE source_type = :t AND source_id = :id AND chunk_index >= :n"),
                [{"t": t, "id": i, "n": n} for t, i, n in plan.trims],
            )
        if plan.removals:
            await db.execute(
                text(f"DELETE FROM {schema}.embeddings WHERE source_type = :t AND source_id = :id"),
                [{"t": t, "id": i} for t, i in plan.removals],
            )
        await db.commit()
        return plan

    @staticmethod
    async def stats(db: AsyncSession, schema: str, source_types: Optional[Sequence[str]] = None) -> list[dict]:
        """Por origem: registros, pedaços, última gravação e modelos no índice."""
        schema = _schema(schema)
        where = "WHERE source_type = ANY(:types)" if source_types else ""
        rows = (await db.execute(
            text(f"""
                SELECT source_type, count(DISTINCT source_id) AS docs, count(*) AS chunks,
                       max(updated_at) AS last_at, array_agg(DISTINCT model) AS models
                FROM {schema}.embeddings {where}
                GROUP BY source_type
            """),
            {"types": list(source_types or [])},
        )).all()
        return [
            {"source_type": r.source_type, "docs": r.docs, "chunks": r.chunks,
             "last_at": r.last_at, "models": list(r.models or [])}
            for r in rows
        ]

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
        *,
        scopes: Optional[Sequence[tuple[Sequence[str], Sequence[uuid.UUID]]]] = None,
        min_score: Optional[float] = None,
        raise_unavailable: bool = True,
    ) -> list[dict]:
        """Trechos mais parecidos com `query` (score 0–1, maior = mais parecido).

        `scopes`: pares (tipos, scope_ids) somados com OU — o trecho só volta se o tipo dele
        estiver no par e o scope_id na lista (ex.: Features dos projetos que a pessoa vê,
        ocorrências só dos projetos em que ela vê ocorrências). Lista vazia = nada.
        `raise_unavailable=False` devolve EmbeddingsUnavailable em vez de HTTP 503."""
        schema = _schema(schema)
        query = (query or "").strip()
        if not query:
            return []
        clauses: list[str] = []
        params: dict = {"limit": max(1, min(limit, 100))}
        if source_types:
            clauses.append("source_type = ANY(:types)")
            params["types"] = list(source_types)
        if scopes is not None:
            ors = []
            for n, (types, ids) in enumerate(scopes):
                if types and ids:
                    ors.append(f"(source_type = ANY(:st{n}) AND scope_id = ANY(:si{n}))")
                    params[f"st{n}"] = list(types)
                    params[f"si{n}"] = list(ids)
            if not ors:
                return []
            clauses.append("(" + " OR ".join(ors) + ")")
        try:
            [vec] = await EmbeddingService.embed([query])
        except EmbeddingsUnavailable as exc:
            logger.warning("embeddings: busca indisponível (%s)", exc)
            if not raise_unavailable:
                raise
            raise HTTPException(status_code=503, detail="Busca semântica indisponível no momento.")
        params["q"] = _vector_literal(vec)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        if scopes is not None:
            # Com filtro, o HNSW sozinho devolveria só os ~40 vizinhos mais próximos e o filtro
            # poderia zerar o resultado; a varredura iterativa (pgvector ≥ 0.8) continua até achar.
            try:
                async with db.begin_nested():
                    await db.execute(text("SET LOCAL hnsw.iterative_scan = strict_order"))
            except Exception:  # noqa: BLE001 — pgvector antigo: segue sem
                pass
        rows = (await db.execute(
            text(f"""
                SELECT source_type, source_id, scope_id, chunk_index, content,
                       1 - (embedding OPERATOR(public.<=>) CAST(CAST(:q AS text) AS public.vector)) AS score
                FROM {schema}.embeddings
                {where}
                ORDER BY embedding OPERATOR(public.<=>) CAST(CAST(:q AS text) AS public.vector)
                LIMIT :limit
            """),
            params,
        )).all()
        return [
            {"source_type": r.source_type, "source_id": r.source_id, "scope_id": r.scope_id,
             "chunk_index": r.chunk_index, "content": r.content, "score": float(r.score)}
            for r in rows
            if min_score is None or float(r.score) >= min_score
        ]
