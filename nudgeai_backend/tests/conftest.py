"""Shared test fixtures.

These are integration tests against a real PostgreSQL 16 + pgvector database.
pgvector cannot be faithfully faked: HNSW, the generated tsvector column, and
cosine distance are all part of what we are verifying.

Point TEST_DATABASE_URL at a scratch database before running:

    createdb nudgeai_test
    export TEST_DATABASE_URL=postgresql+psycopg://haroffcode@/nudgeai_test?host=/var/run/postgresql
    pytest
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.db.models import Base
from app.db.session import get_session
from app.infra.embeddings import StaticEmbedder
from app.main import app as fastapi_app
from app.models.client import FakeClient

_CREATE_VECTOR = text("CREATE EXTENSION IF NOT EXISTS vector")


def pytest_configure(config: pytest.Config) -> None:
    # Keep the suite off the real Meta endpoints and off stray API keys.
    os.environ["META_API_KEY"] = ""
    os.environ["BASETEN_API_KEY"] = ""
    os.environ["EMBEDDING_MODEL"] = ""
    os.environ["ENVIRONMENT"] = "test"


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def engine():  # type: ignore[no-untyped-def]
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip(
            "TEST_DATABASE_URL unset — skipping database tests. Create a scratch "
            "database and export TEST_DATABASE_URL, e.g.\n"
            "  sudo -u postgres createdb -O haroffcode nudgeai_test\n"
            "  sudo -u postgres psql -d nudgeai_test -c 'CREATE EXTENSION IF NOT EXISTS vector;'\n"
            "  export TEST_DATABASE_URL="
            "postgresql+psycopg://haroffcode@/nudgeai_test?host=/var/run/postgresql"
        )
    eng = create_async_engine(url, echo=False)
    try:
        # A no-op when the extension is already installed, which is the normal
        # case: pgvector is not a trusted extension, so it must be created by a
        # superuser before the test role can use it. CREATE EXTENSION cannot run
        # inside the transaction that create_all uses, hence AUTOCOMMIT.
        async with eng.connect() as conn:
            await conn.execution_options(isolation_level="AUTOCOMMIT")
            await conn.execute(_CREATE_VECTOR)
    except Exception as exc:  # noqa: BLE001
        await eng.dispose()
        hint = ""
        if "permission denied" in str(exc) and "extension" in str(exc):
            hint = (
                "\npgvector must be installed by a superuser, because it is not a "
                "trusted extension:\n"
                "  sudo -u postgres psql -d <dbname> -c 'CREATE EXTENSION IF NOT EXISTS vector;'"
            )
        pytest.skip(f"cannot prepare TEST_DATABASE_URL ({url}): {exc}{hint}")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield eng
    finally:
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await eng.dispose()


@pytest.fixture
async def session(engine) -> AsyncIterator[AsyncSession]:  # type: ignore[no-untyped-def]
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as s:
        yield s


@pytest.fixture
def embedder() -> StaticEmbedder:
    # Must match embedding_dim, or add_memory rejects the vector.
    return StaticEmbedder(get_settings().embedding_dim)


@pytest.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    """HTTP client wired to the real app with the test session injected."""

    async def _override() -> AsyncIterator[AsyncSession]:
        yield session

    fastapi_app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    fastapi_app.dependency_overrides.clear()


async def _authed_email(client: AsyncClient, session: AsyncSession, email: str) -> dict[str, str]:
    """Sign up, verify, log in, and return a bearer header.

    The verification code is read from the table rather than scraped from a log,
    so the fixture does not depend on log formatting.
    """
    from app.db.models import User, VerificationCode

    r = await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": "Sup3rSecret!", "name": "Test"},
    )
    assert r.status_code == 201, r.text
    user = await session.scalar(select(User).where(User.email == email))
    assert user is not None
    code = await session.scalar(
        select(VerificationCode).where(
            VerificationCode.user_id == user.id,
            VerificationCode.purpose == "email_verification",
        )
    )
    assert code is not None
    verified = await client.post(
        "/api/v1/auth/verify-email", json={"email": email, "code": code.code}
    )
    assert verified.status_code == 200, verified.text
    me = await client.post("/api/v1/auth/login", json={"email": email, "password": "Sup3rSecret!"})
    assert me.status_code == 200, me.text
    return {"Authorization": f"Bearer {me.json()['access_token']}"}


@pytest.fixture
async def auth_headers(client: AsyncClient, session: AsyncSession) -> dict[str, str]:
    return await _authed_email(client, session, "chat1@example.com")


@pytest.fixture
async def other_headers(client: AsyncClient, session: AsyncSession) -> dict[str, str]:
    """A second user, for tenant-isolation assertions."""
    return await _authed_email(client, session, "chat2@example.com")


@pytest.fixture(autouse=True)
async def _reset_redis() -> AsyncIterator[None]:
    """Drop the cached Redis client between tests.

    `get_redis()` caches a module global, and its connection pool is bound to
    whichever event loop first used it. Every test gets a fresh loop, so without
    this the pool points at a closed loop and commands raise "Event loop is
    closed" — which the budget guard swallows as "fail open", silently disabling
    rate limits and budgets in exactly the tests that assert on them.
    """
    from app.infra.redis import close_redis

    try:
        yield
    finally:
        await close_redis()


@pytest.fixture(autouse=True)
def _fake_models() -> AsyncIterator[None]:
    """Install the offline fake for every test, then restore the real client.

    Without this, a stray META_API_KEY in the developer's shell would make the
    suite call the live endpoint and cost money.
    """
    from app.models.client import set_client

    set_client(FakeClient())
    try:
        yield
    finally:
        set_client(None)
