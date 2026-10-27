"""Habits, tasks, and streak arithmetic."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.services.core_service import recompute_streak

H = "/api/v1/habits"
T = "/api/v1/tasks"
TODAY = datetime.now(UTC).date()


async def _authed(client: AsyncClient, session: AsyncSession, email: str) -> dict[str, str]:
    """Create a verified user directly and return an auth header."""
    from app.core.security import hash_password

    user = User(
        email=email,
        password_hash=hash_password("garden42"),
        timezone="UTC",
        is_email_verified=True,
    )
    session.add(user)
    await session.commit()
    from app.core.security import create_access_token

    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


# ============================================================ streak algebra


@pytest.mark.parametrize(
    ("days", "today", "current", "longest"),
    [
        ([], TODAY, 0, 0),
        ([TODAY], TODAY, 1, 1),
        ([TODAY - timedelta(days=1)], TODAY, 1, 1),
        # Not completed today yet, but yesterday keeps the streak alive.
        ([TODAY - timedelta(days=2), TODAY - timedelta(days=1)], TODAY, 2, 2),
        # Missed two days: broken.
        ([TODAY - timedelta(days=3), TODAY - timedelta(days=2)], TODAY, 0, 2),
        # Gap in the middle: current is the trailing run, longest is historical.
        (
            [TODAY - timedelta(days=3), TODAY - timedelta(days=2), TODAY],
            TODAY,
            1,
            2,
        ),
        ([TODAY, TODAY, TODAY], TODAY, 1, 1),
        # Future dates cannot make a streak "alive".
        ([TODAY + timedelta(days=1)], TODAY, 0, 1),
    ],
)
def test_recompute_streak(days: list[date], today: date, current: int, longest: int) -> None:
    got_current, got_longest, last = recompute_streak(days, today=today)
    assert (got_current, got_longest) == (current, longest)
    assert last == (max(days) if days else None)


# ==================================================================== habits


async def test_create_habit_seeds_streak_row(client: AsyncClient, session: AsyncSession) -> None:
    headers = await _authed(client, session, "h1@example.com")
    r = await client.post(H, json={"name": "Morning run"}, headers=headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Morning run"
    assert body["streak"] == {"current": 0, "best": 0, "last_completed_on": None}


async def test_habit_lifecycle(client: AsyncClient, session: AsyncSession) -> None:
    headers = await _authed(client, session, "h2@example.com")
    hid = (await client.post(H, json={"name": "Read"}, headers=headers)).json()["id"]

    got = await client.get(f"{H}/{hid}", headers=headers)
    assert got.status_code == 200

    patched = await client.patch(f"{H}/{hid}", json={"cue": "after coffee"}, headers=headers)
    assert patched.status_code == 200
    assert patched.json()["cue"] == "after coffee"

    deleted = await client.delete(f"{H}/{hid}", headers=headers)
    assert deleted.status_code == 204
    # Delete is a soft archive, so the row is still readable but inactive.
    after = await client.get(f"{H}/{hid}", headers=headers)
    assert after.status_code == 200
    assert after.json()["active"] is False

    listed = await client.get(H, headers=headers)
    assert listed.json() == []


async def test_complete_is_idempotent_same_day(client: AsyncClient, session: AsyncSession) -> None:
    headers = await _authed(client, session, "h3@example.com")
    hid = (await client.post(H, json={"name": "Stretch"}, headers=headers)).json()["id"]
    a = await client.post(f"{H}/{hid}/complete", headers=headers)
    b = await client.post(f"{H}/{hid}/complete", headers=headers)
    assert a.status_code == b.status_code == 200
    assert a.json()["streak"]["current"] == 1
    assert b.json()["streak"]["current"] == 1

    from app.db.models import HabitCompletion

    rows = list(
        await session.scalars(select(HabitCompletion).where(HabitCompletion.habit_id == hid))
    )
    assert len(rows) == 1


async def test_streak_grows_over_consecutive_days(
    client: AsyncClient, session: AsyncSession
) -> None:
    from app.services import core_service

    headers = await _authed(client, session, "h4@example.com")
    hid = (await client.post(H, json={"name": "Journal"}, headers=headers)).json()["id"]
    for offset in (2, 1, 0):
        habit = await core_service.complete_habit(
            session, _user_id(headers), hid, on=TODAY - timedelta(days=offset)
        )
    assert habit.streak is not None
    assert habit.streak.current == 3
    assert habit.streak.best == 3


async def test_best_survives_a_broken_streak(client: AsyncClient, session: AsyncSession) -> None:
    from app.services import core_service

    headers = await _authed(client, session, "h5@example.com")
    hid = (await client.post(H, json={"name": "Walk"}, headers=headers)).json()["id"]
    uid = _user_id(headers)
    for offset in (6, 5, 4, 3):
        await core_service.complete_habit(session, uid, hid, on=TODAY - timedelta(days=offset))
    habit = await core_service.complete_habit(session, uid, hid, on=TODAY)
    assert habit.streak is not None
    assert habit.streak.best == 4
    assert habit.streak.current == 1


async def test_uncomplete_reduces_streak(client: AsyncClient, session: AsyncSession) -> None:
    headers = await _authed(client, session, "h6@example.com")
    hid = (await client.post(H, json={"name": "Meditate"}, headers=headers)).json()["id"]
    await client.post(f"{H}/{hid}/complete", headers=headers)
    await client.post(f"{H}/{hid}/complete", headers=headers)
    r = await client.post(f"{H}/{hid}/uncomplete", headers=headers)
    assert r.status_code == 200
    assert r.json()["streak"]["current"] == 0
    # best is history and must not fall back with the current run.
    assert r.json()["streak"]["best"] == 1


def _user_id(headers: dict[str, str]):
    from uuid import UUID

    import jwt

    from app.core.config import get_settings

    raw = headers["Authorization"].removeprefix("Bearer ")
    return UUID(jwt.decode(raw, get_settings().jwt_secret, algorithms=["HS256"])["sub"])


# ==================================================================== tasks


async def test_task_crud(client: AsyncClient, session: AsyncSession) -> None:
    headers = await _authed(client, session, "t1@example.com")
    created = await client.post(T, json={"title": "Email Ada"}, headers=headers)
    assert created.status_code == 201, created.text
    tid = created.json()["id"]

    listed = await client.get(T, headers=headers)
    assert [t["title"] for t in listed.json()] == ["Email Ada"]

    patched = await client.patch(
        f"{T}/{tid}", json={"done_at": "2026-01-01T09:00:00Z"}, headers=headers
    )
    assert patched.status_code == 200
    assert patched.json()["done_at"] is not None

    # Done tasks drop out of the default listing.
    assert (await client.get(T, headers=headers)).json() == []
    with_done = await client.get(T, params={"include_done": True}, headers=headers)
    assert len(with_done.json()) == 1

    assert (await client.delete(f"{T}/{tid}", headers=headers)).status_code == 204
    assert (await client.get(f"{T}/{tid}", headers=headers)).status_code == 404


# ================================================================= isolation


async def test_habits_are_scoped_per_user(client: AsyncClient, session: AsyncSession) -> None:
    a = await _authed(client, session, "iso-a@example.com")
    b = await _authed(client, session, "iso-b@example.com")
    hid = (await client.post(H, json={"name": "A secret habit"}, headers=a)).json()["id"]

    assert (await client.get(f"{H}/{hid}", headers=b)).status_code == 404
    assert (await client.patch(f"{H}/{hid}", json={"name": "hijack"}, headers=b)).status_code == 404
    assert (await client.post(f"{H}/{hid}/complete", headers=b)).status_code == 404
    assert (await client.get(H, headers=b)).json() == []


async def test_tasks_are_scoped_per_user(client: AsyncClient, session: AsyncSession) -> None:
    a = await _authed(client, session, "iso-t-a@example.com")
    b = await _authed(client, session, "iso-t-b@example.com")
    tid = (await client.post(T, json={"title": "private"}, headers=a)).json()["id"]
    assert (await client.get(f"{T}/{tid}", headers=b)).status_code == 404
    assert (await client.delete(f"{T}/{tid}", headers=b)).status_code == 404
    assert len((await client.get(T, headers=a)).json()) == 1
