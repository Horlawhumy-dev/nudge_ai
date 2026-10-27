from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime, timedelta
from typing import NamedTuple
from uuid import UUID

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import CacheResponse, EmbeddingCost, Memory
from app.infra.embeddings import Embedder, get_embedder

log = logging.getLogger(__name__)


class ScoredMemory(NamedTuple):
    """A retrieved memory with both of its scores kept distinct.

    `similarity` is the bounded cosine distance score, so it is what callers may
    present as a confidence. `score` is the hybrid vector+lexical blend and is
    unbounded because ts_rank_cd is not normalised, so it is only ever used to
    rank. Conflating the two produced an observed live "similarity" of 1.025.
    """

    memory: Memory
    score: float
    similarity: float


class MemoryError_(Exception):
    pass


def _to_pgvector(vec: list[float]) -> str:
    return "[" + ",".join(f"{v:.7f}" for v in vec) + "]"


# =================================================================== memory


async def add_memory(
    session: AsyncSession,
    user_id: UUID,
    *,
    body: str,
    kind: str = "note",
    embedder: Embedder | None = None,
) -> Memory:
    s = get_settings()
    embedder = embedder or get_embedder()
    vec = await embedder.embed_one(body)
    if len(vec) != s.embedding_dim:
        # Matryoshka models allow truncation; keep the stored dim in lockstep.
        if len(vec) > s.embedding_dim:
            vec = vec[: s.embedding_dim]
        else:
            raise MemoryError_(f"embedding dim {len(vec)} != configured {s.embedding_dim}")

    row = Memory(
        user_id=user_id,
        body=body,
        embedding=vec,
        embedding_model=s.embedding_model,
        kind=kind,
    )
    session.add(row)
    session.add(EmbeddingCost(user_id=user_id, model_id=s.embedding_model))
    await session.commit()
    await session.refresh(row)
    return row


async def search_memories(
    session: AsyncSession,
    user_id: UUID,
    *,
    query: str,
    top_k: int | None = None,
    kind: str | None = None,
    include_lexical: bool = True,
    embedder: Embedder | None = None,
) -> list[ScoredMemory]:
    """Hybrid retrieval: vector cosine + ts_rank, always scoped to one user.

    `user_id` is in the WHERE clause on every branch below. The HNSW index is not
    tenant-aware, so dropping that filter is a data leak.
    """
    s = get_settings()
    top_k = top_k or s.memory_top_k
    embedder = embedder or get_embedder()
    qvec = await embedder.embed_one(query)
    if len(qvec) > s.embedding_dim:
        qvec = qvec[: s.embedding_dim]

    kind_clause = "AND m.kind = :kind" if kind else ""
    lexical = (
        """
        ts_rank_cd(m.tsv, websearch_to_tsquery('simple', :q)) AS lex
    """
        if include_lexical
        else "0::float8 AS lex"
    )
    vec_sim_sql = "1 - (m.embedding <=> CAST(:qvec AS vector))"
    # The lexical term must vanish from the score too, not just the projection.
    score_expr = (
        f"({vec_sim_sql})::float8 + 0.25 * ts_rank_cd(m.tsv, websearch_to_tsquery('simple', :q))"
        if include_lexical
        else f"({vec_sim_sql})::float8"
    )

    # Only fixed fragments are interpolated; every user-controlled value is a
    # bound parameter (:q, :qvec, :uid, :kind).
    sql = text(
        f"""
        SELECT m.id, m.body, m.kind, m.created_at,
               ({vec_sim_sql})::float8 AS vec_sim,
               {lexical},
               {score_expr} AS score
        FROM memories m
        WHERE m.user_id = :uid {kind_clause}
        ORDER BY score DESC
        LIMIT :k
        """
    )
    params: dict[str, object] = {
        "uid": user_id,
        "q": query,
        "qvec": _to_pgvector(qvec),
        "k": top_k,
    }
    if kind:
        params["kind"] = kind

    rows = (await session.execute(sql, params)).mappings().all()

    out: list[ScoredMemory] = []
    for r in rows:
        vec_sim = float(r["vec_sim"])
        if vec_sim < s.memory_min_similarity and float(r["lex"] or 0) == 0.0:
            continue
        mem = await session.get(Memory, r["id"])
        if mem is not None:
            out.append(ScoredMemory(memory=mem, score=float(r["score"]), similarity=vec_sim))
    return out


async def delete_memory(session: AsyncSession, user_id: UUID, memory_id: UUID) -> bool:
    row = await session.scalar(
        select(Memory).where(Memory.id == memory_id, Memory.user_id == user_id)
    )
    if row is None:
        return False
    await session.delete(row)
    await session.commit()
    return True


# ========================================================= semantic cache


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def cache_lookup(
    session: AsyncSession,
    user_id: UUID,
    *,
    prompt: str,
    embedder: Embedder | None = None,
) -> tuple[str, str, float] | None:
    """Return (response, model_id, similarity) on a hit, else None."""
    s = get_settings()
    embedder = embedder or get_embedder()

    # Exact-hash fast path: no embedding call, no vector scan.
    digest = _hash(prompt)
    exact = await session.scalar(
        select(CacheResponse).where(
            CacheResponse.user_id == user_id,
            CacheResponse.prompt_hash == digest,
            CacheResponse.expires_at > datetime.now(UTC),
        )
    )
    if exact is not None:
        exact.hit_count += 1
        await session.commit()
        return exact.response, exact.model_id or "cache", 1.0

    qvec = await embedder.embed_one(prompt)
    if len(qvec) > s.embedding_dim:
        qvec = qvec[: s.embedding_dim]

    sql = text(
        """
        SELECT id, response, model_id,
               (1 - (prompt_embedding <=> CAST(:qvec AS vector)))::float8 AS sim
        FROM cache_responses
        WHERE user_id = :uid
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY prompt_embedding <=> CAST(:qvec AS vector)
        LIMIT 1
        """
    )
    result = await session.execute(sql, {"uid": user_id, "qvec": _to_pgvector(qvec)})
    row = result.mappings().first()
    if row is None:
        return None
    sim = float(row["sim"])
    if sim < (1.0 - s.semantic_cache_threshold):
        return None
    cached = await session.get(CacheResponse, row["id"])
    if cached is not None:
        cached.hit_count += 1
        await session.commit()
    return str(row["response"]), str(row["model_id"] or "cache"), sim


async def cache_store(
    session: AsyncSession,
    user_id: UUID,
    *,
    prompt: str,
    response: str,
    model_id: str | None = None,
    embedder: Embedder | None = None,
) -> None:
    s = get_settings()
    embedder = embedder or get_embedder()
    vec = await embedder.embed_one(prompt)
    if len(vec) > s.embedding_dim:
        vec = vec[: s.embedding_dim]
    session.add(
        CacheResponse(
            user_id=user_id,
            prompt_hash=_hash(prompt),
            prompt_text=prompt,
            prompt_embedding=vec,
            response=response,
            model_id=model_id,
            expires_at=datetime.now(UTC) + timedelta(days=s.semantic_cache_ttl_days),
        )
    )
    await session.commit()


async def cache_purge_expired(session: AsyncSession) -> int:
    result = await session.execute(
        delete(CacheResponse).where(
            CacheResponse.expires_at.is_not(None),
            CacheResponse.expires_at < datetime.now(UTC),
        )
    )
    await session.commit()
    return int(result.rowcount or 0)  # type: ignore[attr-defined]


async def embedding_call_count(session: AsyncSession) -> int:
    return int(await session.scalar(select(func.count()).select_from(EmbeddingCost)) or 0)
