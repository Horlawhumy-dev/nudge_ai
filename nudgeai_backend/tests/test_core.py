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
    # a has used the Free plan's three habits, so try the foreign trigger as a fresh user
    c = await _authed(client, session, "loop-c@example.com")
    stolen = await client.post(
        H, json={"name": "Mine", "stacked_after_id": theirs["id"]}, headers=c
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


# =========================================================== check-ins, history, streak


async def _set_zone(session: AsyncSession, email: str, zone: str) -> None:
    user = await session.scalar(select(User).where(User.email == email))
    assert user is not None
    user.timezone = zone
    await session.commit()


def _local_today(zone: str) -> date:
    from zoneinfo import ZoneInfo

    return datetime.now(UTC).astimezone(ZoneInfo(zone)).date()


async def test_habit_reports_done_today_and_last_seven_days(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "progress@example.com")
    habit = await _habit(client, h)
    assert habit["done_today"] is False and habit["done_last_7d"] == 0

    done = (await client.post(f"{H}/{habit['id']}/complete", headers=h)).json()
    assert done["done_today"] is True and done["done_last_7d"] == 1

    listed = (await client.get(H, headers=h)).json()
    assert listed[0]["done_today"] is True
    undone = (await client.post(f"{H}/{habit['id']}/uncomplete", headers=h)).json()
    assert undone["done_today"] is False and undone["done_last_7d"] == 0


async def test_checkin_for_a_past_day_and_the_streak_is_judged_from_today(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "backfill@example.com")
    habit = await _habit(client, h)
    three_ago = (TODAY - timedelta(days=3)).isoformat()
    r = await client.post(f"{H}/{habit['id']}/complete", json={"on": three_ago}, headers=h)
    assert r.status_code == 200
    body = r.json()
    # A lone check-in three days ago is not a live streak, and today isn't done.
    assert body["streak"]["current"] == 0 and body["streak"]["best"] == 1
    assert body["done_today"] is False and body["done_last_7d"] == 1

    # Filling the gap up to yesterday makes the run alive again.
    for back in (2, 1):
        await client.post(
            f"{H}/{habit['id']}/complete",
            json={"on": (TODAY - timedelta(days=back)).isoformat()},
            headers=h,
        )
    after = (await client.get(f"{H}/{habit['id']}", headers=h)).json()
    assert after["streak"]["current"] == 3


async def test_checkin_day_limits(client: AsyncClient, session: AsyncSession) -> None:
    h = await _authed(client, session, "limits@example.com")
    habit = await _habit(client, h)
    tomorrow = (TODAY + timedelta(days=2)).isoformat()
    future = await client.post(f"{H}/{habit['id']}/complete", json={"on": tomorrow}, headers=h)
    assert future.status_code == 422
    ancient = (TODAY - timedelta(days=90)).isoformat()
    old = await client.post(f"{H}/{habit['id']}/complete", json={"on": ancient}, headers=h)
    assert old.status_code == 422
    assert (
        await client.post(f"{H}/{habit['id']}/complete", json={"on": "nope"}, headers=h)
    ).status_code == 422


async def test_complete_is_idempotent(client: AsyncClient, session: AsyncSession) -> None:
    h = await _authed(client, session, "idem@example.com")
    habit = await _habit(client, h)
    for _ in range(3):
        assert (await client.post(f"{H}/{habit['id']}/complete", headers=h)).status_code == 200
    days = (await client.get(f"{H}/{habit['id']}/completions", headers=h)).json()["days"]
    assert len(days[habit["id"]]) == 1


async def test_today_follows_the_users_timezone(client: AsyncClient, session: AsyncSession) -> None:
    """A check-in is recorded on the user's local date, not the UTC date."""
    email = "tz@example.com"
    h = await _authed(client, session, email)
    await _set_zone(session, email, "Pacific/Kiritimati")  # UTC+14: often a day ahead of UTC
    habit = await _habit(client, h)
    await client.post(f"{H}/{habit['id']}/complete", headers=h)
    days = (await client.get(f"{H}/{habit['id']}/completions", headers=h)).json()["days"]
    assert days[habit["id"]] == [_local_today("Pacific/Kiritimati").isoformat()]


async def test_completions_history_over_a_range(client: AsyncClient, session: AsyncSession) -> None:
    h = await _authed(client, session, "history@example.com")
    a = await _habit(client, h, name="A")
    b = await _habit(client, h, name="B")
    for back in (0, 1, 5):
        await client.post(
            f"{H}/{a['id']}/complete",
            json={"on": (TODAY - timedelta(days=back)).isoformat()},
            headers=h,
        )
    await client.post(f"{H}/{b['id']}/complete", headers=h)

    allr = (await client.get(f"{H}/completions", headers=h)).json()
    assert len(allr["days"][a["id"]]) == 3 and len(allr["days"][b["id"]]) == 1
    assert allr["days"][a["id"]] == sorted(allr["days"][a["id"]])

    narrow = (
        await client.get(
            f"{H}/completions",
            params={"from": (TODAY - timedelta(days=2)).isoformat(), "to": TODAY.isoformat()},
            headers=h,
        )
    ).json()
    assert len(narrow["days"][a["id"]]) == 2

    bad = await client.get(f"{H}/completions", params={"from": "2020-01-01"}, headers=h)
    assert bad.status_code == 422  # a range of years is refused
    flipped = await client.get(
        f"{H}/completions", params={"from": "2026-05-10", "to": "2026-05-01"}, headers=h
    )
    assert flipped.status_code == 422


async def test_history_excludes_deleted_habits_and_other_users(
    client: AsyncClient, session: AsyncSession
) -> None:
    a = await _authed(client, session, "own@example.com")
    b = await _authed(client, session, "peer@example.com")
    mine = await _habit(client, a, name="Mine")
    gone = await _habit(client, a, name="Gone")
    theirs = await _habit(client, b, name="Theirs")
    for hid, hdr in ((mine, a), (gone, a), (theirs, b)):
        await client.post(f"{H}/{hid['id']}/complete", headers=hdr)
    await client.delete(f"{H}/{gone['id']}", headers=a)

    days = (await client.get(f"{H}/completions", headers=a)).json()["days"]
    assert set(days) == {mine["id"]}
    # someone else's habit is a 404, not an empty list
    other = await client.get(f"{H}/{theirs['id']}/completions", headers=a)
    assert other.status_code == 404


async def test_overall_streak_counts_any_habit(client: AsyncClient, session: AsyncSession) -> None:
    h = await _authed(client, session, "overall@example.com")
    empty = (await client.get("/api/v1/streak", headers=h)).json()
    assert empty == {"current": 0, "best": 0, "active_today": False, "last_active_on": None}

    a = await _habit(client, h, name="A")
    b = await _habit(client, h, name="B")
    # A covers days 0 and 1; B fills day 2, so together the streak is three days.
    for habit, back in ((a, 0), (a, 1), (b, 2)):
        await client.post(
            f"{H}/{habit['id']}/complete",
            json={"on": (TODAY - timedelta(days=back)).isoformat()},
            headers=h,
        )
    streak = (await client.get("/api/v1/streak", headers=h)).json()
    assert streak["current"] == 3 and streak["best"] == 3 and streak["active_today"] is True
    assert streak["last_active_on"] == TODAY.isoformat()


# ================================================================ task fields


async def _task(client: AsyncClient, headers: dict[str, str], **body: object) -> dict:  # type: ignore[type-arg]
    r = await client.post(T, json={"title": "Plan sprint", **body}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def test_task_defaults_to_an_all_day_task_today(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "t-default@example.com")
    task = await _task(client, h)
    assert task["priority"] == "medium" and task["repeat"] is False
    assert task["date"] == TODAY.isoformat()
    assert task["all_day"] is True and task["start_time"] is None
    assert task["status"] == "upcoming" and task["done"] is False


async def test_task_with_a_time_range_derives_due_in_the_users_zone(
    client: AsyncClient, session: AsyncSession
) -> None:
    from zoneinfo import ZoneInfo

    email = "t-zone@example.com"
    h = await _authed(client, session, email)
    await _set_zone(session, email, "Asia/Tokyo")
    day = (TODAY + timedelta(days=3)).isoformat()
    task = await _task(
        client, h, date=day, start_time="09:00", end_time="10:45", priority="high", repeat=True
    )
    assert task["all_day"] is False and task["priority"] == "high" and task["repeat"] is True
    due = datetime.fromisoformat(task["due_at"]).astimezone(ZoneInfo("Asia/Tokyo"))
    assert (due.date().isoformat(), due.strftime("%H:%M")) == (day, "10:45")


async def test_end_time_defaults_to_one_hour_and_late_starts_clamp(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "t-end@example.com")
    assert (await _task(client, h, start_time="14:30"))["end_time"] == "15:30"
    assert (await _task(client, h, start_time="23:30"))["end_time"] == "23:59"


async def test_task_validation(client: AsyncClient, session: AsyncSession) -> None:
    h = await _authed(client, session, "t-valid@example.com")
    for bad in (
        {"priority": "urgent"},
        {"end_time": "10:00"},
        {"start_time": "10:00", "end_time": "09:00"},
        {"start_time": "25:00"},
        {"title": "   "},
    ):
        r = await client.post(T, json={"title": "X", **bad}, headers=h)
        assert r.status_code == 422, bad


async def test_legacy_due_at_still_works_and_sets_the_day(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "t-legacy@example.com")
    due = datetime.now(UTC) + timedelta(days=2, hours=1)
    task = await _task(client, h, due_at=due.isoformat())
    assert datetime.fromisoformat(task["due_at"]) == due
    assert task["date"] == due.date().isoformat()


async def test_status_overdue_completed_and_filters(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "t-status@example.com")
    yesterday = (TODAY - timedelta(days=1)).isoformat()
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    late = await _task(client, h, title="Late", date=yesterday, start_time="08:00")
    soon = await _task(client, h, title="Soon", date=tomorrow, start_time="08:00")
    done = await _task(client, h, title="Done", date=yesterday)
    await client.post(f"{T}/{done['id']}/complete", headers=h)

    assert late["status"] == "overdue" and soon["status"] == "upcoming"

    def titles(rows: list[dict]) -> list[str]:  # type: ignore[type-arg]
        return [r["title"] for r in rows]

    async def listing(**params: str) -> list[str]:
        r = await client.get(T, params=params, headers=h)
        assert r.status_code == 200, r.text
        return titles(r.json())

    assert await listing() == ["Late", "Soon"]  # default hides completed, ordered by due
    assert sorted(await listing(status="all")) == ["Done", "Late", "Soon"]
    assert await listing(status="overdue") == ["Late"]
    assert await listing(status="upcoming") == ["Soon"]
    assert await listing(status="completed") == ["Done"]
    assert await listing(status="all", **{"from": tomorrow}) == ["Soon"]
    assert (await client.get(T, params={"status": "bogus"}, headers=h)).status_code == 422


async def test_complete_uncomplete_and_restore_a_task(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "t-cycle@example.com")
    task = await _task(client, h)
    done = (await client.post(f"{T}/{task['id']}/complete", headers=h)).json()
    assert done["done"] is True and done["status"] == "completed" and done["done_at"]
    again = (await client.post(f"{T}/{task['id']}/complete", headers=h)).json()
    assert again["done_at"] == done["done_at"]  # idempotent, keeps the original time
    undone = (await client.post(f"{T}/{task['id']}/uncomplete", headers=h)).json()
    assert undone["done"] is False and undone["done_at"] is None

    assert (await client.delete(f"{T}/{task['id']}", headers=h)).status_code == 204
    assert (await client.get(f"{T}/{task['id']}", headers=h)).status_code == 404
    assert (await client.get(T, params={"status": "all"}, headers=h)).json() == []
    restored = await client.post(f"{T}/{task['id']}/restore", headers=h)
    assert restored.status_code == 200 and restored.json()["id"] == task["id"]
    other = await _authed(client, session, "t-cycle2@example.com")
    assert (await client.post(f"{T}/{task['id']}/restore", headers=other)).status_code == 404


async def test_rescheduling_a_task_recomputes_due(
    client: AsyncClient, session: AsyncSession
) -> None:
    h = await _authed(client, session, "t-move@example.com")
    task = await _task(client, h, start_time="09:00", end_time="10:00")
    moved = (
        await client.patch(f"{T}/{task['id']}", json={"start_time": "13:00"}, headers=h)
    ).json()
    assert (moved["start_time"], moved["end_time"]) == ("13:00", "14:00")  # end follows start

    all_day = (await client.patch(f"{T}/{task['id']}", json={"start_time": None}, headers=h)).json()
    assert all_day["all_day"] is True and all_day["end_time"] is None

    bad = await client.patch(
        f"{T}/{task['id']}", json={"start_time": "15:00", "end_time": "14:00"}, headers=h
    )
    assert bad.status_code == 422
    renamed = await client.patch(f"{T}/{task['id']}", json={"title": "  New   name "}, headers=h)
    assert renamed.json()["title"] == "New name"
