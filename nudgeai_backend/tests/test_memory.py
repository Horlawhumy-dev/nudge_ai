"""Memory retrieval, tenant isolation, and the semantic cache.

Recall quality splits in two:

  * Lexical recall (shared words) is verified here unconditionally, because it
    depends on the generated tsvector column and the GIN index.
  * Paraphrased recall is verified only with a real Meta embedding model. The
  * StaticEmbedder is a token-hash, so it cannot possibly match a paraphrase;
  * asserting it would be asserting a falsehood rather than testing recall.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password
from app.db.models import CacheResponse, EmbeddingCost, User
from app.infra.embeddings import Embedder, StaticEmbedder
from app.services import memory_service

M = "/api/v1/memories"

NOTES = [
    "I go for a run every morning at six",
    "My dentist appointment is on the third Thursday",
    "I take vitamin D with breakfast",
    "Call mom back on Sunday evening",
]


async def _user(session: AsyncSession, email: str) -> User:
    user = User(
        email=email,
        password_hash=hash_password("garden42"),
        timezone="UTC",
        is_email_verified=True,
    )
    session.add(user)
    await session.commit()
    return user


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture
def embedder() -> StaticEmbedder:
    return StaticEmbedder(get_settings().embedding_dim)


# ============================================================ storage basics


async def test_create_memory_stores_vector_and_cost(
    session: AsyncSession, embedder: Embedder
) -> None:
    user = await _user(session, "m1@example.com")
    mem = await memory_service.add_memory(
        session, user.id, body=NOTES[0], kind="habit", embedder=embedder
    )
    assert mem.id is not None
    assert mem.embedding_model == get_settings().embedding_model
    assert len(mem.embedding) == get_settings().embedding_dim

    cost = list(await session.scalars(select(EmbeddingCost)))
    assert len(cost) == 1
    assert cost[0].user_id == user.id


async def test_generated_tsv_column_is_populated(session: AsyncSession, embedder: Embedder) -> None:
    """The lexical half of hybrid search depends on PostgreSQL filling this in."""
    user = await _user(session, "m2@example.com")
    mem = await memory_service.add_memory(session, user.id, body=NOTES[1], embedder=embedder)
    await session.refresh(mem)
    assert mem.tsv is not None and mem.tsv != ""
    row = await session.execute(text("SELECT tsv::text FROM memories WHERE id = :i"), {"i": mem.id})
    assert "dentist" in row.scalar_one()


async def test_lexical_recall(session: AsyncSession, embedder: Embedder) -> None:
    user = await _user(session, "m3@example.com")
    for note in NOTES:
        await memory_service.add_memory(session, user.id, body=note, embedder=embedder)

    hits = await memory_service.search_memories(
        session, user.id, query="dentist", top_k=2, embedder=embedder
    )
    assert hits, "expected a lexical hit for 'dentist'"
    assert "dentist" in hits[0].memory.body


async def test_kind_filter(session: AsyncSession, embedder: Embedder) -> None:
    user = await _user(session, "m4@example.com")
    await memory_service.add_memory(
        session, user.id, body=NOTES[2], kind="health", embedder=embedder
    )
    await memory_service.add_memory(
        session, user.id, body=NOTES[3], kind="social", embedder=embedder
    )
    hits = await memory_service.search_memories(
        session, user.id, query="vitamin", top_k=5, kind="social", embedder=embedder
    )
    assert all(h.memory.kind == "social" for h in hits)


async def test_include_lexical_false_drops_lexical_hits(
    session: AsyncSession, embedder: Embedder
) -> None:
    """Without the lexical term, a word-disjoint query must not match."""
    user = await _user(session, "m5@example.com")
    await memory_service.add_memory(session, user.id, body=NOTES[0], embedder=embedder)
    hits = await memory_service.search_memories(
        session, user.id, query="zzzzz", top_k=5, include_lexical=False, embedder=embedder
    )
    assert hits == []


# ============================================================== isolation


async def test_search_never_leaks_across_users(session: AsyncSession, embedder: Embedder) -> None:
    """The HNSW index is not tenant-aware, so the user_id filter is the only guard."""
    ada = await _user(session, "iso-ada@example.com")
    bob = await _user(session, "iso-bob@example.com")
    await memory_service.add_memory(session, ada.id, body=NOTES[1], embedder=embedder)
    await memory_service.add_memory(
        session, bob.id, body="Bob dislikes the dentist", embedder=embedder
    )

    hits = await memory_service.search_memories(
        session, bob.id, query="dentist", top_k=10, embedder=embedder
    )
    assert hits
    assert all(h.memory.user_id == bob.id for h in hits)


async def test_delete_memory_is_scoped_to_owner(session: AsyncSession, embedder: Embedder) -> None:
    ada = await _user(session, "del-ada@example.com")
    bob = await _user(session, "del-bob@example.com")
    mem = await memory_service.add_memory(session, ada.id, body=NOTES[2], embedder=embedder)

    assert await memory_service.delete_memory(session, bob.id, mem.id) is False
    assert await memory_service.delete_memory(session, ada.id, mem.id) is True


async def test_cache_is_scoped_to_owner(session: AsyncSession, embedder: Embedder) -> None:
    ada = await _user(session, "cache-ada@example.com")
    bob = await _user(session, "cache-bob@example.com")
    await memory_service.cache_store(
        session, ada.id, prompt="how many habits", response="three", model_id="m", embedder=embedder
    )
    assert (
        await memory_service.cache_lookup(
            session, bob.id, prompt="how many habits", embedder=embedder
        )
        is None
    )
    hit = await memory_service.cache_lookup(
        session, ada.id, prompt="how many habits", embedder=embedder
    )
    assert hit is not None and hit[0] == "three"


# ============================================================ cache hits


async def test_exact_hash_cache_hit_increments_count(
    session: AsyncSession, embedder: Embedder
) -> None:
    user = await _user(session, "c1@example.com")
    await memory_service.cache_store(
        session, user.id, prompt="ping", response="pong", embedder=embedder
    )
    first = await memory_service.cache_lookup(session, user.id, prompt="ping", embedder=embedder)
    assert first is not None
    assert first[0] == "pong"
    assert first[2] == 1.0
    await memory_service.cache_lookup(session, user.id, prompt="ping", embedder=embedder)
    row = await session.scalar(select(CacheResponse).where(CacheResponse.user_id == user.id))
    assert row is not None and row.hit_count == 2


async def test_near_duplicate_prompt_hits_semantically(
    session: AsyncSession, embedder: Embedder
) -> None:
    """A reworded prompt must hit via vector search, not the exact-hash path.

    The assertion that matters is `similarity < 1.0`: an exact-hash hit returns
    exactly 1.0, so anything less proves the cosine branch ran. Using the
    identical string here would pass while testing nothing.
    """
    user = await _user(session, "c2@example.com")
    await memory_service.cache_store(
        session, user.id, prompt="how many habits do I have", response="three", embedder=embedder
    )
    # Non-identical, but shares every content word, so the token-hash embedder
    # scores it 0.926 — above the 0.92 cut, below the 1.0 of a hash hit.
    hit = await memory_service.cache_lookup(
        session, user.id, prompt="how many habits do I have now", embedder=embedder
    )
    assert hit is not None
    response, _model_id, similarity = hit
    assert response == "three"
    assert 0.92 <= similarity < 1.0


async def test_exact_prompt_takes_the_hash_fast_path(
    session: AsyncSession, embedder: Embedder
) -> None:
    """The identical prompt must short-circuit, so no embedding call is made."""
    user = await _user(session, "c2b@example.com")
    await memory_service.cache_store(
        session, user.id, prompt="how many habits do I have", response="three", embedder=embedder
    )

    calls = 0
    original = embedder.embed_one

    async def counting(text: str) -> list[float]:
        nonlocal calls
        calls += 1
        return await original(text)

    embedder.embed_one = counting  # type: ignore[method-assign]
    try:
        hit = await memory_service.cache_lookup(
            session, user.id, prompt="how many habits do I have", embedder=embedder
        )
    finally:
        embedder.embed_one = original  # type: ignore[method-assign]

    assert hit is not None
    assert hit[2] == 1.0
    assert calls == 0, "the exact-hash path must not pay for an embedding"


async def test_unrelated_prompt_misses(session: AsyncSession, embedder: Embedder) -> None:
    user = await _user(session, "c3@example.com")
    await memory_service.cache_store(
        session, user.id, prompt="how many habits do I have", response="three", embedder=embedder
    )
    miss = await memory_service.cache_lookup(
        session, user.id, prompt="zqxjkv unrelated gibberish", embedder=embedder
    )
    assert miss is None


async def test_expired_cache_entry_is_ignored(session: AsyncSession, embedder: Embedder) -> None:
    from datetime import UTC, datetime, timedelta

    user = await _user(session, "c4@example.com")
    await memory_service.cache_store(
        session, user.id, prompt="ping", response="pong", embedder=embedder
    )
    row = await session.scalar(select(CacheResponse).where(CacheResponse.user_id == user.id))
    assert row is not None
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await session.commit()
    assert (
        await memory_service.cache_lookup(session, user.id, prompt="ping", embedder=embedder)
        is None
    )


async def test_purge_expired(session: AsyncSession, embedder: Embedder) -> None:
    from datetime import UTC, datetime, timedelta

    user = await _user(session, "c5@example.com")
    await memory_service.cache_store(session, user.id, prompt="a", response="1", embedder=embedder)
    row = await session.scalar(select(CacheResponse).where(CacheResponse.user_id == user.id))
    assert row is not None
    row.expires_at = datetime.now(UTC) - timedelta(days=1)
    await session.commit()
    assert await memory_service.cache_purge_expired(session) == 1
    assert await memory_service.cache_purge_expired(session) == 0


# =================================================================== HTTP


async def test_memory_endpoints(client: AsyncClient, session: AsyncSession) -> None:
    user = await _user(session, "http-m@example.com")
    headers = _headers(user)

    created = await client.post(M, json={"body": NOTES[0], "kind": "habit"}, headers=headers)
    assert created.status_code == 201, created.text

    found = await client.post(
        f"{M}/search", json={"query": "morning run", "top_k": 3}, headers=headers
    )
    assert found.status_code == 200, found.text
    assert found.json()["results"]

    listed = await client.get(M, headers=headers)
    assert len(listed.json()) == 1

    mid = listed.json()[0]["id"]
    assert (await client.delete(f"{M}/{mid}", headers=headers)).status_code == 204
    assert (await client.delete(f"{M}/{mid}", headers=headers)).status_code == 404


async def test_memory_endpoints_require_auth(client: AsyncClient) -> None:
    assert (await client.post(M, json={"body": "x"})).status_code == 401
    assert (await client.get(M)).status_code == 401


# =============================================== paraphrased recall (real key)


@pytest.mark.skipif(
    not (get_settings().meta_api_key and get_settings().embedding_model),
    reason=(
        "needs META_API_KEY and EMBEDDING_MODEL; StaticEmbedder is a token-hash "
        "and cannot recall paraphrases"
    ),
)
async def test_paraphrased_recall(session: AsyncSession) -> None:
    user = await _user(session, "para@example.com")
    await memory_service.add_memory(session, user.id, body="I go for a run every morning at six")
    hits = await memory_service.search_memories(
        session, user.id, query="I exercise before work most days", top_k=3
    )
    assert hits, "paraphrase should retrieve the morning-run memory"
    assert hits[0].similarity >= get_settings().memory_min_similarity


async def test_reported_similarity_is_a_true_cosine(session: AsyncSession) -> None:
    """`similarity` must stay in [-1, 1] even when the lexical term is non-zero.

    The hybrid blend adds 0.25 * ts_rank_cd, which is unbounded. Publishing that
    blend as `similarity` returned 1.025 live. Ranking keeps using the blend, so
    only the reported number is constrained.
    """
    user = await _user(session, "cos@example.com")
    await memory_service.add_memory(session, user.id, body="dentist appointment in march")
    hits = await memory_service.search_memories(
        session, user.id, query="dentist appointment in march", top_k=3
    )
    assert hits, "an exact lexical match must be retrieved"
    top = hits[0]
    assert -1.0 <= top.similarity <= 1.0, f"similarity out of range: {top.similarity}"
    assert top.score >= top.similarity, "the blend must not rank below pure cosine"


# =================================================== static embedder sanity


def test_static_embedder_is_deterministic_and_normalised() -> None:
    e = StaticEmbedder(2048)
    import asyncio

    a = asyncio.run(e.embed_one("hello world"))
    b = asyncio.run(e.embed_one("hello world"))
    assert a == b
    assert len(a) == 2048
    assert abs(sum(x * x for x in a) ** 0.5 - 1.0) < 1e-9


def test_static_embedder_handles_empty_text() -> None:
    import asyncio

    v = asyncio.run(StaticEmbedder(2048).embed_one(""))
    assert len(v) == 2048
    assert any(x != 0.0 for x in v)
