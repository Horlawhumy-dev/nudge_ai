"""Phase 3 Gate 3: the engine end to end against a real database.

- 3 habits → plausible nudges, none in quiet hours
- an at-risk streak fires early, with priority
- snooze twice stops the nudge
- completing (via feedback) increments the streak
- a worker killed mid-flight loses and double-sends nothing
- one nudge carries the full trace: rule log → model → tokens → text

Model calls use the scripted FakeClient; Redis tests skip when it is down.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Nudge, User
from app.engine.scheduler import Claim, claim_due, complete, enqueue, fail, requeue_stale
from app.engine.worker import evaluate_user
from app.infra.redis import (
    get_redis,
    k_nudge_dlq,
    k_nudge_due,
    k_nudge_inflight,
    redis_ping,
)
from app.models.client import FakeClient, set_client
from app.models.registry import spec_for
from app.services.core_service import complete_habit

NUDGE_BODY = "Time for deep work now — small steps keep the streak alive."
DIGEST_BODY = "Morning digest: deep work, reading, and a walk are all due today."


def scripted(body: str = NUDGE_BODY) -> FakeClient:
    return FakeClient(default={"content": body})


async def make_habit(client: AsyncClient, headers: dict[str, str], name: str) -> UUID:
    # Habits default to a reminder time of day; pin midnight so "due now" ignores the clock.
    r = await client.post(
        "/api/v1/habits", json={"name": name, "preferred_time": "00:00"}, headers=headers
    )
    assert r.status_code == 201, r.text
    return UUID(r.json()["id"])


async def user_id(session: AsyncSession, email: str = "chat1@example.com") -> UUID:
    user = await session.scalar(select(User).where(User.email == email))
    assert user is not None
    return user.id


# ------------------------------------------------- three habits → nudges


async def test_three_habits_get_nudges_with_full_trace(
    client: AsyncClient, session: AsyncSession, auth_headers: dict[str, str]
) -> None:
    set_client(scripted())
    for name in ("Deep work", "Read 20 pages", "Walk after lunch"):
        await make_habit(client, auth_headers, name)

    r = await client.post("/api/v1/nudges/evaluate", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["evaluated"]) == 3
    assert body["errors"] == []
    assert not body["digest_sent"]
    for decision in body["evaluated"]:
        assert decision["action"] == "allow"
        assert decision["log"], "every decision carries its rule log"

    sent = await client.get("/api/v1/nudges", params={"status": "sent"}, headers=auth_headers)
    assert sent.status_code == 200
    rows = sent.json()
    assert len(rows) == 3
    for row in rows:
        assert row["body"] == NUDGE_BODY
        assert row["model_id"] == spec_for("fast").id
        assert row["prompt_tokens"] > 0
        assert row["completion_tokens"] > 0
        assert row["sent_at"] is not None


async def test_dry_run_decides_without_writing(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    set_client(scripted())
    await make_habit(client, auth_headers, "Deep work")

    r = await client.post("/api/v1/nudges/evaluate", params={"dry_run": True}, headers=auth_headers)
    assert r.status_code == 200, r.text
    assert len(r.json()["evaluated"]) == 1

    nudges = await client.get("/api/v1/nudges", headers=auth_headers)
    assert nudges.json() == []


async def test_evaluate_is_tenant_isolated(
    client: AsyncClient, auth_headers: dict[str, str], other_headers: dict[str, str]
) -> None:
    set_client(scripted())
    await make_habit(client, auth_headers, "Deep work")

    r = await client.post("/api/v1/nudges/evaluate", headers=other_headers)
    assert r.status_code == 200, r.text
    assert r.json()["evaluated"] == []

    nudges = await client.get("/api/v1/nudges", headers=other_headers)
    assert nudges.json() == []


# ------------------------------------------------------------- quiet hours


async def test_quiet_hours_defers_to_quiet_end(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    set_client(scripted())
    await make_habit(client, auth_headers, "Deep work")
    now = datetime.now(UTC)
    start = (now - timedelta(hours=1)).strftime("%H:%M")
    end = (now + timedelta(hours=1)).strftime("%H:%M")

    prefs = await client.put(
        "/api/v1/preferences",
        json={"quiet_start": start, "quiet_end": end},
        headers=auth_headers,
    )
    assert prefs.status_code == 200, prefs.text

    r = await client.post("/api/v1/nudges/evaluate", headers=auth_headers)
    assert r.status_code == 200, r.text
    (decision,) = r.json()["evaluated"]
    assert decision["action"] == "defer"
    assert decision["rule"] == "respects_quiet_hours"
    assert decision["defer_until"] is not None

    scheduled = await client.get(
        "/api/v1/nudges", params={"status": "scheduled"}, headers=auth_headers
    )
    assert len(scheduled.json()) == 1
    sent = await client.get("/api/v1/nudges", params={"status": "sent"}, headers=auth_headers)
    assert sent.json() == []


# ------------------------------------------------------------ snooze × 2


async def test_snooze_twice_stops_the_nudge(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    set_client(scripted())
    await make_habit(client, auth_headers, "Deep work")

    async def latest_sent_id() -> str:
        sent = await client.get("/api/v1/nudges", params={"status": "sent"}, headers=auth_headers)
        return sent.json()[-1]["id"]

    await client.post("/api/v1/nudges/evaluate", headers=auth_headers)
    first = await client.post(
        f"/api/v1/nudges/{await latest_sent_id()}/snooze", headers=auth_headers
    )
    assert first.json()["status"] == "snoozed"

    # One snooze is forgiveness: the nudge fires again.
    await client.post("/api/v1/nudges/evaluate", headers=auth_headers)
    second = await client.post(
        f"/api/v1/nudges/{await latest_sent_id()}/snooze", headers=auth_headers
    )
    assert second.json()["status"] == "snoozed"

    # Two snoozes is a pattern: the engine backs off and says why.
    r = await client.post("/api/v1/nudges/evaluate", headers=auth_headers)
    (decision,) = r.json()["evaluated"]
    assert decision["action"] == "suppress"
    assert decision["rule"] == "avoids_nag"

    skipped = await client.get("/api/v1/nudges", params={"status": "skipped"}, headers=auth_headers)
    assert len(skipped.json()) == 1
    assert skipped.json()[0]["skip_reason"] == "avoids_nag"


# ------------------------------------------------- feedback → streak


async def test_feedback_completed_increments_the_streak(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    set_client(scripted())
    habit_id = await make_habit(client, auth_headers, "Deep work")
    await client.post("/api/v1/nudges/evaluate", headers=auth_headers)
    sent = await client.get("/api/v1/nudges", params={"status": "sent"}, headers=auth_headers)
    nudge_id = sent.json()[0]["id"]

    fb = await client.post(
        f"/api/v1/nudges/{nudge_id}/feedback", json={"kind": "completed"}, headers=auth_headers
    )
    assert fb.status_code == 200, fb.text

    habit = await client.get(f"/api/v1/habits/{habit_id}", headers=auth_headers)
    assert habit.json()["streak"]["current"] == 1

    r = await client.post("/api/v1/nudges/evaluate", headers=auth_headers)
    (decision,) = r.json()["evaluated"]
    assert decision["action"] == "suppress"
    assert decision["rule"] == "habit_is_due"


# ------------------------------------------- streak at risk (fixed clock)


async def test_at_risk_streak_fires_early_with_priority(
    client: AsyncClient, session: AsyncSession, auth_headers: dict[str, str]
) -> None:
    uid = await user_id(session)
    habit_id = await make_habit(client, auth_headers, "Deep work")
    today = datetime.now(UTC).date()
    await complete_habit(session, uid, habit_id, on=today - timedelta(days=2))
    await complete_habit(session, uid, habit_id, on=today - timedelta(days=1))

    evening = datetime(today.year, today.month, today.day, 18, 0, tzinfo=UTC)
    report = await evaluate_user(session, uid, model_client=scripted(), redis=None, now_utc=evening)
    assert not report.errors
    (ec,) = report.evaluated
    assert ec.decision.allowed
    assert ec.decision.verdict.rule == "protects_streak"
    assert ec.decision.verdict.priority

    row = await session.scalar(select(Nudge).where(Nudge.habit_id == habit_id))
    assert row is not None and row.status == "sent"


# -------------------------------------------------- digest collapse


async def test_burst_at_digest_time_collapses_to_one_nudge(
    client: AsyncClient, session: AsyncSession, auth_headers: dict[str, str]
) -> None:
    for name in ("Deep work", "Read 20 pages", "Walk after lunch"):
        await make_habit(client, auth_headers, name)
    prefs = await client.put(
        "/api/v1/preferences", json={"digest_time": "09:00"}, headers=auth_headers
    )
    assert prefs.status_code == 200, prefs.text

    uid = await user_id(session)
    today = datetime.now(UTC).date()
    morning = datetime(today.year, today.month, today.day, 9, 0, tzinfo=UTC)
    report = await evaluate_user(
        session, uid, model_client=scripted(DIGEST_BODY), redis=None, now_utc=morning
    )
    assert not report.errors
    assert report.digest_sent
    assert len(report.nudge_ids) == 4  # 1 digest + 3 collapsed

    digest = await session.scalar(select(Nudge).where(Nudge.kind == "summary"))
    assert digest is not None and digest.status == "sent" and digest.title
    assert digest.body == DIGEST_BODY


# -------------------------------------------------- crash mid-flight


async def test_claim_requeue_loses_and_dupes_nothing() -> None:
    if not await redis_ping():
        pytest.skip("redis not running")
    redis = get_redis()
    now = datetime.now(UTC)
    user = uuid4()
    ours = [Claim(user, uuid4()), Claim(user, uuid4())]
    members = [c.member for c in ours]
    try:
        await redis.zrem(k_nudge_due(), *members)
        await redis.zrem(k_nudge_inflight(), *members)
        for c in ours:
            await enqueue(redis, c.user_id, c.habit_id, now)

        # Worker A claims both, then dies without completing.
        claims = await claim_due(redis, now_utc=now, batch=10)
        assert {c.member for c in claims if c.member in members} == set(members)
        assert await redis.zcard(k_nudge_due()) == 0

        # Worker B, after the lease lapses, requeues and claims the same two.
        later = now + timedelta(seconds=601)
        assert await requeue_stale(redis, now_utc=later) >= 2
        again = await claim_due(redis, now_utc=later, batch=10)
        assert {c.member for c in again if c.member in members} == set(members)

        # Completing releases them; a failure lands in the DLQ, not limbo.
        for c in again:
            if c.member in members:
                await complete(redis, c)
        assert await redis.zcard(k_nudge_inflight()) == 0
        before = await redis.xlen(k_nudge_dlq())
        await fail(redis, ours[0], "boom")
        assert await redis.xlen(k_nudge_dlq()) == before + 1
    finally:
        await redis.zrem(k_nudge_due(), *members)
        await redis.zrem(k_nudge_inflight(), *members)
