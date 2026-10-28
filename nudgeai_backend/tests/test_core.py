"""Habits, tasks, and streak arithmetic."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Habit, User
from app.services.core_service import recompute_streak

H = "/api/v1/habits"
T = "/api/v1/tasks"
TODAY = datetime.now(UTC).date()


async def _authed(client: AsyncClient, session: AsyncSession, email: str) -> dict[str, str]:
    """Create a verified user directly and return an auth header."""
    from app.core.security import hash_password

    user = User(
        email=email,
        password_hash=hash_password("Garden42!"),
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


# ============================================================ habit fields and stacking


async def _habit(client: AsyncClient, headers: dict[str, str], **body: object) -> dict:  # type: ignore[type-arg]
    r = await client.post(H, json={"name": "Stretch", **body}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def test_habit_defaults_follow_frequency_and_time_of_day(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "fields@example.com")
    plain = await _habit(client, h)
    assert plain["emoji"] == "🎯" and plain["time_of_day"] == "morning"
    assert plain["frequency"] == "daily" and plain["goal_days"] == 7
    assert plain["preferred_time"] == "08:00"

    gym = await _habit(
        client,
        h,
        name="Gym",
        emoji="💪",
        category="Fitness",
        frequency="weekdays",
        time_of_day="evening",
    )
    assert gym["goal_days"] == 5 and gym["preferred_time"] == "19:00"
    assert (gym["emoji"], gym["category"]) == ("💪", "Fitness")

    pinned = await _habit(client, h, name="Call mum", goal_days=2, preferred_time="17:30")
    assert pinned["goal_days"] == 2 and pinned["preferred_time"] == "17:30"


async def test_habit_validation_rejects_bad_cadence_and_blank_names(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "valid@example.com")
    for bad in (
        {"frequency": "hourly"},
        {"time_of_day": "night"},
        {"goal_days": 8},
        {"name": "  "},
    ):
        r = await client.post(H, json={"name": "X", **bad}, headers=h)
        assert r.status_code == 422, bad


async def test_updating_cadence_rederives_goal_and_reminder(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "update@example.com")
    habit = await _habit(client, h)
    r = await client.patch(
        f"{H}/{habit['id']}", json={"frequency": "weekly", "time_of_day": "afternoon"}, headers=h
    )
    body = r.json()
    assert body["goal_days"] == 1 and body["preferred_time"] == "14:00"
    # an explicitly pinned reminder time survives a change of time of day
    await client.patch(f"{H}/{habit['id']}", json={"preferred_time": "09:15"}, headers=h)
    r2 = await client.patch(f"{H}/{habit['id']}", json={"time_of_day": "evening"}, headers=h)
    assert r2.json()["preferred_time"] == "09:15"


async def test_stacking_orders_after_the_trigger_and_can_be_cleared(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "stack@example.com")
    coffee = await _habit(client, h, name="Coffee")
    journal = await _habit(client, h, name="Journal", stacked_after_id=coffee["id"])
    assert journal["stacked_after_id"] == coffee["id"]
    stored = await session.get(Habit, UUID(journal["id"]))
    assert stored is not None and stored.stack_position == 1

    cleared = await client.patch(f"{H}/{journal['id']}", json={"stacked_after_id": None}, headers=h)
    assert cleared.json()["stacked_after_id"] is None
    await session.refresh(stored)
    assert stored.stack_position == 0


async def test_stacking_rejects_self_loops_and_foreign_triggers(
    client: AsyncClient, session: AsyncSession
) -> None:
    a = await _authed(client, session, "loop-a@example.com")
    b = await _authed(client, session, "loop-b@example.com")
    first = await _habit(client, a, name="First")
    second = await _habit(client, a, name="Second", stacked_after_id=first["id"])
    third = await _habit(client, a, name="Third", stacked_after_id=second["id"])

    self_stack = await client.patch(
        f"{H}/{first['id']}", json={"stacked_after_id": first["id"]}, headers=a
    )
    assert self_stack.status_code == 422
    loop = await client.patch(
        f"{H}/{first['id']}", json={"stacked_after_id": third["id"]}, headers=a
    )
    assert loop.status_code == 422 and "loop" in loop.json()["detail"]

    theirs = await _habit(client, b, name="Theirs")
    stolen = await client.post(
        H, json={"name": "Mine", "stacked_after_id": theirs["id"]}, headers=a
    )
    assert stolen.status_code == 404  # another user's habit doesn't exist for you


async def test_deleting_a_trigger_unstacks_dependants_and_restore_brings_it_back(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "restore@example.com")
    trigger = await _habit(client, h, name="Trigger")
    child = await _habit(client, h, name="Child", stacked_after_id=trigger["id"])

    assert (await client.delete(f"{H}/{trigger['id']}", headers=h)).status_code == 204
    after = (await client.get(f"{H}/{child['id']}", headers=h)).json()
    assert after["stacked_after_id"] is None
    assert trigger["id"] not in [x["id"] for x in (await client.get(H, headers=h)).json()]

    restored = await client.post(f"{H}/{trigger['id']}/restore", headers=h)
    assert restored.status_code == 200 and restored.json()["active"] is True
    assert trigger["id"] in [x["id"] for x in (await client.get(H, headers=h)).json()]
    # a stranger can't restore it
    other = await _authed(client, session, "restore2@example.com")
    assert (await client.post(f"{H}/{trigger['id']}/restore", headers=other)).status_code == 404
