"""Recurring tasks: the date rules, completing into the next occurrence, and the worker catch-up."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Task
from app.services import recurrence

API = "/api/v1"
Headers = dict[str, str]
TODAY = datetime.now(UTC).date()


def iso(d: date) -> str:
    return d.isoformat()


# --------------------------------------------------------------- the date rules (pure)


def test_next_after_for_each_rule() -> None:
    wed = date(2026, 5, 13)
    assert recurrence.next_after(wed, "daily") == date(2026, 5, 14)
    assert recurrence.next_after(wed, "weekly") == date(2026, 5, 20)
    assert recurrence.next_after(wed, "weekdays") == date(2026, 5, 14)
    friday, saturday = date(2026, 5, 15), date(2026, 5, 16)
    assert recurrence.next_after(friday, "weekdays") == date(2026, 5, 18)  # skips the weekend
    assert recurrence.next_after(saturday, "weekdays") == date(2026, 5, 18)
    assert recurrence.next_after(date(2026, 12, 31), "daily") == date(2027, 1, 1)


def test_first_on_or_after_catches_up_without_overshooting() -> None:
    start = date(2026, 5, 14)
    assert recurrence.first_on_or_after(start, "daily", date(2026, 5, 20)) == date(2026, 5, 20)
    assert recurrence.first_on_or_after(start, "daily", date(2026, 5, 10)) == start  # already ahead
    # weekly keeps its weekday: the next Thursday on/after the 20th is the 21st
    assert recurrence.first_on_or_after(start, "weekly", date(2026, 5, 20)) == date(2026, 5, 21)
    # weekdays never lands on a weekend
    landed = recurrence.first_on_or_after(date(2026, 5, 15), "weekdays", date(2026, 5, 16))
    assert landed == date(2026, 5, 18)


# ---------------------------------------------------------------------- the API


async def _task(client: AsyncClient, h: Headers, **body: object) -> dict:  # type: ignore[type-arg]
    r = await client.post(f"{API}/tasks", json={"title": "Water plants", **body}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


async def _all(client: AsyncClient, h: Headers, **params: str) -> list[dict]:  # type: ignore[type-arg]
    r = await client.get(f"{API}/tasks", params={"status": "all", **params}, headers=h)
    return sorted(r.json(), key=lambda t: t["date"])


async def test_repeat_defaults_and_validation(client: AsyncClient, auth_headers: Headers) -> None:
    plain = await _task(client, auth_headers)
    assert plain["repeat"] is False and plain["repeat_rule"] is None and plain["series_id"] is None
    daily = await _task(client, auth_headers, title="Daily", repeat=True)
    assert daily["repeat_rule"] == "daily" and daily["series_id"] == daily["id"]
    weekly = await _task(client, auth_headers, title="Weekly", repeat_rule="weekly")
    assert weekly["repeat"] is True and weekly["repeat_rule"] == "weekly"
    bad = await client.post(
        f"{API}/tasks", json={"title": "x", "repeat_rule": "hourly"}, headers=auth_headers
    )
    assert bad.status_code == 422


async def test_completing_creates_the_next_occurrence_once(
    client: AsyncClient, auth_headers: Headers
) -> None:
    task = await _task(client, auth_headers, repeat=True, start_time="09:00")
    for _ in range(3):  # idempotent: re-completing never spawns more
        assert (
            await client.post(f"{API}/tasks/{task['id']}/complete", headers=auth_headers)
        ).status_code == 200
    rows = await _all(client, auth_headers)
    assert [r["date"] for r in rows] == [iso(TODAY), iso(TODAY + timedelta(days=1))]
    nxt = rows[1]
    assert nxt["done"] is False and nxt["series_id"] == task["id"] and nxt["repeat_rule"] == "daily"
    assert (nxt["start_time"], nxt["end_time"], nxt["title"]) == ("09:00", "10:00", "Water plants")
    assert nxt["due_at"] and nxt["status"] == "upcoming"
    # un-ticking the first keeps the next one
    await client.post(f"{API}/tasks/{task['id']}/uncomplete", headers=auth_headers)
    assert len(await _all(client, auth_headers)) == 2


async def test_weekdays_skip_the_weekend_and_weekly_adds_seven_days(
    client: AsyncClient, auth_headers: Headers
) -> None:
    friday = date(2026, 5, 15)
    wk = await _task(
        client, auth_headers, title="Standup", date=iso(friday), repeat_rule="weekdays"
    )
    await client.post(f"{API}/tasks/{wk['id']}/complete", headers=auth_headers)
    weekly = await _task(
        client, auth_headers, title="Review", date=iso(friday), repeat_rule="weekly"
    )
    await client.post(f"{API}/tasks/{weekly['id']}/complete", headers=auth_headers)
    by_title = {}
    for t in await _all(client, auth_headers):
        by_title.setdefault(t["title"], []).append(t["date"])
    assert by_title["Standup"] == ["2026-05-15", "2026-05-18"]  # Friday -> Monday
    assert by_title["Review"] == ["2026-05-15", "2026-05-22"]


async def test_non_repeating_tasks_do_not_spawn(client: AsyncClient, auth_headers: Headers) -> None:
    task = await _task(client, auth_headers)
    await client.post(f"{API}/tasks/{task['id']}/complete", headers=auth_headers)
    assert len(await _all(client, auth_headers)) == 1


async def test_turning_repeat_on_off_and_changing_the_rule(
    client: AsyncClient, auth_headers: Headers
) -> None:
    task = await _task(client, auth_headers)
    on = (
        await client.patch(f"{API}/tasks/{task['id']}", json={"repeat": True}, headers=auth_headers)
    ).json()
    assert on["repeat_rule"] == "daily" and on["series_id"] == task["id"]
    await client.post(f"{API}/tasks/{task['id']}/complete", headers=auth_headers)
    nxt = [t for t in await _all(client, auth_headers) if t["id"] != task["id"]][0]

    changed = await client.patch(
        f"{API}/tasks/{task['id']}", json={"repeat_rule": "weekly"}, headers=auth_headers
    )
    assert changed.json()["repeat_rule"] == "weekly"
    same_series = [t for t in await _all(client, auth_headers) if t["id"] == nxt["id"]][0]
    assert same_series["repeat_rule"] == "weekly"  # later occurrences follow the new rule

    off = await client.patch(
        f"{API}/tasks/{task['id']}", json={"repeat": False}, headers=auth_headers
    )
    assert off.json()["repeat"] is False and off.json()["repeat_rule"] is None
    assert all(t["repeat"] is False for t in await _all(client, auth_headers))  # the series stopped


async def test_deleting_a_series_removes_later_days_and_stops_it(
    client: AsyncClient, auth_headers: Headers
) -> None:
    task = await _task(client, auth_headers, repeat=True)
    await client.post(f"{API}/tasks/{task['id']}/complete", headers=auth_headers)
    assert len(await _all(client, auth_headers)) == 2
    gone = await client.delete(
        f"{API}/tasks/{task['id']}", params={"series": "true"}, headers=auth_headers
    )
    assert gone.status_code == 204
    assert await _all(client, auth_headers) == []
    # a single-occurrence delete leaves the rest of the series alone
    again = await _task(client, auth_headers, title="Other", repeat=True)
    await client.post(f"{API}/tasks/{again['id']}/complete", headers=auth_headers)
    await client.delete(f"{API}/tasks/{again['id']}", headers=auth_headers)
    assert len(await _all(client, auth_headers)) == 1


# --------------------------------------------------------------------- the worker


async def test_roll_all_gives_a_neglected_series_an_occurrence_today(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    old = await _task(client, auth_headers, repeat=True, date=iso(TODAY - timedelta(days=5)))
    created = await recurrence.roll_all(session)
    assert created == 1
    rows = await _all(client, auth_headers)
    assert [r["date"] for r in rows] == [iso(TODAY - timedelta(days=5)), iso(TODAY)]
    assert rows[1]["series_id"] == old["id"]
    # running again changes nothing
    assert await recurrence.roll_all(session) == 0


async def test_roll_all_respects_deleted_days_and_stopped_series(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    ran = await _task(
        client, auth_headers, title="Ran", repeat=True, date=iso(TODAY - timedelta(days=2))
    )
    await recurrence.roll_all(session)
    today_row = (await _all(client, auth_headers))[-1]
    await client.delete(f"{API}/tasks/{today_row['id']}", headers=auth_headers)  # skip today
    assert await recurrence.roll_all(session) == 0  # not re-created
    session.expire_all()

    stopped = await _task(
        client, auth_headers, title="Stopped", repeat=True, date=iso(TODAY - timedelta(days=4))
    )
    await client.patch(f"{API}/tasks/{stopped['id']}", json={"repeat": False}, headers=auth_headers)
    assert await recurrence.roll_all(session) == 0
    assert ran["series_id"]


async def test_roll_all_uses_each_users_own_day_and_weekly_dates(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    last_week = TODAY - timedelta(days=9)
    await _task(client, auth_headers, title="Weekly", repeat_rule="weekly", date=iso(last_week))
    await recurrence.roll_all(session)
    dates = [r["date"] for r in await _all(client, auth_headers)]
    assert dates == [iso(last_week), iso(last_week + timedelta(days=14))] or dates == [
        iso(last_week),
        iso(last_week + timedelta(days=7)),
    ]
    assert date.fromisoformat(dates[-1]) >= TODAY  # never schedules in the past
    rows = (await session.scalars(select(Task))).all()
    assert all(t.series_id is not None for t in rows)


async def test_maintenance_pass_rolls_recurring_tasks(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    from contextlib import asynccontextmanager

    from app.services import maintenance

    @asynccontextmanager
    async def _scope():  # type: ignore[no-untyped-def]
        yield session  # the test session stands in for a worker session

    monkeypatch.setattr(maintenance, "session_scope", _scope)
    await _task(client, auth_headers, repeat=True, date=iso(TODAY - timedelta(days=3)))
    report = await maintenance.run_maintenance()
    assert report.recurring_created == 1
    assert (await maintenance.run_maintenance()).recurring_created == 0
