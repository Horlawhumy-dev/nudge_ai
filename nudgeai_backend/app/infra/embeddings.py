from __future__ import annotations

import logging
from functools import lru_cache
from typing import Protocol

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)


class EmbeddingError(RuntimeError):
    pass


class Embedder(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]: ...
    async def embed_one(self, text: str) -> list[float]: ...


class MetaEmbedder:
    """Calls an OpenAI-compatible /embeddings endpoint for a Meta model.

    Uses raw httpx with a minimal OpenAI body rather than the openai SDK, so
    the exact request shape stays visible and adjustable. Gate 2b confirms it
    against the live Meta endpoint.
    """

    def __init__(self, api_key: str, base_url: str, model: str, dim: int) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._dim = dim

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if not self._api_key:
            raise EmbeddingError("META_API_KEY is not set")
        payload = {
            "model": self._model,
            "input": texts,
            "encoding_format": "float",
        }
        headers = {"Authorization": f"Bearer {self._api_key}"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{self._base_url}/embeddings", json=payload, headers=headers)
            if resp.status_code >= 400:
                raise EmbeddingError(f"embeddings {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
        items = sorted(data["data"], key=lambda d: d.get("index", 0))
        return [[float(x) for x in item["embedding"]] for item in items]

    async def embed_one(self, text: str) -> list[float]:
        out = await self.embed([text])
        if not out:
            raise EmbeddingError("empty embedding response")
        return out[0]


class StaticEmbedder:
    """Deterministic embedder for tests and offline runs.

    Hashes token overlap into a fixed-width vector. Not semantic — it exists so
    tests can run without an API key. Real recall quality requires a Meta
    embedding model, which does not exist yet (Gate 2b open item).
    """

    def __init__(self, dim: int = 2048) -> None:
        self._dim = dim

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    async def embed_one(self, text: str) -> list[float]:
        return self._vec(text)

    def _vec(self, text: str) -> list[float]:
        import hashlib
        import math

        vec = [0.0] * self._dim
        for tok in text.lower().split():
            h = hashlib.sha256(tok.encode()).digest()
            idx = int.from_bytes(h[:4], "big") % self._dim
            sign = 1.0 if h[4] % 2 == 0 else -1.0
            vec[idx] += sign
        norm = math.sqrt(sum(v * v for v in vec))
        if norm == 0:
            vec[0] = 1.0
            return vec
        return [v / norm for v in vec]


@lru_cache
def get_embedder() -> Embedder:
    s = get_settings()
    if s.meta_api_key and s.meta_api_base_url and s.embedding_model:
        return MetaEmbedder(s.meta_api_key, s.meta_api_base_url, s.embedding_model, s.embedding_dim)
    log.warning(
        "no Meta embedding configured (need META_API_KEY + META_API_BASE_URL + "
        "EMBEDDING_MODEL) — using StaticEmbedder (test-grade, not semantic)"
    )
    # Must match embedding_dim, or every write fails the dim check in
    # memory_service.add_memory and the memories.embedding column.
    return StaticEmbedder(s.embedding_dim)
