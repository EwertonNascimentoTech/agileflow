"""Serviço interno de embeddings (BAAI/bge-m3, vetor denso de 1024 dimensões).

Fica num container só dele para o modelo (~1,5 GB de RAM) ser carregado UMA vez — nos 6 workers da
API e nos 4 do Celery seriam 10 cópias. Sem porta publicada: só a rede do Compose o alcança.
O texto não sai do servidor (não precisa anonimizar para gerar o vetor; o que vai ao IDCortex
continua passando por `anonymize.py`).

O modelo é baixado do Hugging Face no 1º uso e fica no volume `/models`.
"""
import os
import threading
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL_NAME = os.getenv("EMBEDDINGS_MODEL", "BAAI/bge-m3")
# O bge-m3 aceita até 8192 tokens, mas o custo em CPU/memória cresce com o tamanho: o backend
# já manda o texto em pedaços, então o teto aqui só protege de um pedaço fora do padrão.
MAX_TOKENS = int(os.getenv("EMBEDDINGS_MAX_TOKENS", "1024"))
MAX_BATCH = int(os.getenv("EMBEDDINGS_MAX_BATCH", "64"))

app = FastAPI(title="AgileFlow Embeddings", docs_url=None, redoc_url=None)

_model = None
_load_lock = threading.Lock()
# Um encode por vez: dois lotes grandes em paralelo dobram o pico de memória sem ganhar tempo
# (o torch já usa todos os núcleos em cada um).
_encode_lock = threading.Lock()


def _get_model():
    global _model
    if _model is None:
        with _load_lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer

                model = SentenceTransformer(MODEL_NAME, device="cpu")
                model.max_seq_length = MAX_TOKENS
                _model = model
    return _model


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1)


class EmbedResponse(BaseModel):
    model: str
    dim: int
    embeddings: list[list[float]]


@app.get("/health")
def health(load: Optional[bool] = False) -> dict:
    """`?load=true` carrega o modelo (aquece o serviço depois do deploy)."""
    if load:
        _get_model()
    return {"status": "ok", "model": MODEL_NAME, "loaded": _model is not None}


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    if len(req.texts) > MAX_BATCH:
        raise HTTPException(status_code=413, detail=f"Máximo de {MAX_BATCH} textos por chamada.")
    model = _get_model()
    with _encode_lock:
        # normalize: com vetor de norma 1, distância de cosseno (<=> no pgvector) = 1 - produto interno.
        vectors = model.encode(req.texts, normalize_embeddings=True, batch_size=16, convert_to_numpy=True)
    return EmbedResponse(model=MODEL_NAME, dim=int(vectors.shape[1]), embeddings=vectors.tolist())
