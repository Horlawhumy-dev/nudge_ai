"""The scheduled weekly report: when it is due, who gets it, and that it never repeats."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Nudge
from app.services import insights, report_service

API = "/api/v1"
Headers = dict[str, str]
MONDAY_10 = datetime(2026, 5, 11, 10, 0, tzinfo=UTC)  # a Monday


def test_is_due_only_monday_from_nine() -> None:
    assert not report_service.is_due(datetime(2026, 5, 11, 8, 59, tzinfo=UTC))
    assert report_service.is_due(datetime(2026, 5, 11, 9, 0, tzinfo=UTC))
    assert report_service.is_due(
        datetime(2026, 5, 11, 23, 0, tzinfo=UTC)
    )  # a late pass still sends
    assert not report_service.is_due(datetime(2026, 5, 12, 10, 0, tzinfo=UTC))  # Tuesday
    assert not report_service.is_due(datetime(2026, 5, 10, 10, 0, tzinfo=UTC))  # Sunday


def _report(**kw: Any) -> insights.WeeklyReport:
    base: dict[str, Any] = {
        "habit_rate": 40,
        "check_ins": 10,
        "possible": 25,
        "tasks_done": 2,
        "tasks_total": 5,
        "best_day": None,
        "best_day_count": 0,
        "top_habit": None,
        "needs_love": None,
        "headline": "A solid week",
        "tips": [],
    }
    base.update(kw)
    return insights.WeeklyReport(**base)


def test_message_mentions_only_what_exists() -> None:
    assert (
        report_service.message_for(_report())
        == "A solid week. 10/25 habit check-ins, 2/5 tasks done."
    )
    assert (
        report_service.message_for(_report(tasks_total=0)) == "A solid week. 10/25 habit check-ins."
    )
    assert (
        report_service.message_for(_report(possible=0, check_ins=0))
        == "A solid week. 2/5 tasks done."
    )
    assert report_service.message_for(_report(possible=0, tasks_total=0)) == "A solid week."


async def _opt_in(client: AsyncClient, h: Headers, **prefs: object) -> None:
    body = {"weekly_report_enabled": True, "timezone": "UTC", **prefs}
    assert (await client.patch(f"{API}/preferences", json=body, headers=h)).status_code == 200


async def _reports(session: AsyncSession) -> list[Nudge]:
    session.expire_all()
    return list(
        await session.scalars(
            select(Nudge).where(Nudge.kind == "insight", Nudge.title == report_service.REPORT_TITLE)
        )
    )


async def test_sent_on_monday_morning_to_opted_in_users_only(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers, other_headers: Headers
) -> None:
    await _opt_in(client, auth_headers)
    await client.get(f"{API}/preferences", headers=other_headers)  # has prefs, but not opted in
    await client.post(f"{API}/habits", json={"name": "Read"}, headers=auth_headers)

    assert await report_service.send_due_weekly_reports(session, MONDAY_10) == 1
    (row,) = await _reports(session)
    assert row.kind == "insight" and row.status == "sent" and row.body
    inbox = (await client.get(f"{API}/notifications", headers=auth_headers)).json()
    assert report_service.REPORT_TITLE in [i["title"] for i in inbox["items"]]
    theirs = (await client.get(f"{API}/notifications", headers=other_headers)).json()
    assert report_service.REPORT_TITLE not in [i["title"] for i in theirs["items"]]


async def test_never_twice_in_a_week_and_not_off_schedule(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    await _opt_in(client, auth_headers)
    tuesday = datetime(2026, 5, 12, 10, 0, tzinfo=UTC)
    early = datetime(2026, 5, 11, 7, 0, tzinfo=UTC)
    assert await report_service.send_due_weekly_reports(session, tuesday) == 0
    assert await report_service.send_due_weekly_reports(session, early) == 0
    assert await report_service.send_due_weekly_reports(session, MONDAY_10) == 1
    assert await report_service.send_due_weekly_reports(session, MONDAY_10) == 0  # same pass again
    later_monday = datetime(2026, 5, 11, 22, 0, tzinfo=UTC)
    assert await report_service.send_due_weekly_reports(session, later_monday) == 0  # a late pass
    assert len(await _reports(session)) == 1
    next_week = datetime(2026, 5, 18, 10, 0, tzinfo=UTC)
    assert await report_service.send_due_weekly_reports(session, next_week) == 1
    assert len(await _reports(session)) == 2


async def test_it_follows_the_users_time_zone(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    await _opt_in(client, auth_headers, timezone="Pacific/Kiritimati")  # UTC+14
    sunday_evening_utc = datetime(2026, 5, 10, 20, 0, tzinfo=UTC)  # already Monday 10:00 there
    assert await report_service.send_due_weekly_reports(session, sunday_evening_utc) == 1
    # and for a US user the same instant is still Sunday afternoon
    other = datetime(2026, 5, 11, 10, 0, tzinfo=UTC)
    await _opt_in(client, auth_headers, timezone="America/Los_Angeles")
    session.expire_all()
    assert await report_service.send_due_weekly_reports(session, other) == 0


async def test_push_respects_the_push_switch(
    client: AsyncClient,
    session: AsyncSession,
    auth_headers: Headers,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[dict[str, Any]] = []

    async def fake_send(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        sent.extend(messages)
        return [{"status": "ok"} for _ in messages]

    monkeypatch.setattr("app.infra.push.send_expo", fake_send)
    await client.post(
        f"{API}/devices",
        json={"token": "ExponentPushToken[weekly-1234]", "platform": "ios"},
        headers=auth_headers,
    )
    await _opt_in(client, auth_headers, push_enabled=False)
    await report_service.send_due_weekly_reports(session, MONDAY_10)
    assert sent == []  # push is off...
    assert len(await _reports(session)) == 1  # ...but the inbox still gets it

    await _opt_in(client, auth_headers, push_enabled=True)
    next_week = datetime(2026, 5, 18, 10, 0, tzinfo=UTC)
    await report_service.send_due_weekly_reports(session, next_week)
    assert [m["title"] for m in sent] == [report_service.REPORT_TITLE]
    assert sent[0]["data"]["kind"] == "insight"


async def test_maintenance_pass_reports_both_jobs(
    client: AsyncClient,
    session: AsyncSession,
    auth_headers: Headers,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from contextlib import asynccontextmanager

    from app.services import maintenance

    @asynccontextmanager
    async def _scope():  # type: ignore[no-untyped-def]
        yield session

    monkeypatch.setattr(maintenance, "session_scope", _scope)
    await _opt_in(client, auth_headers)
    out = await maintenance.run_maintenance(MONDAY_10)
    assert out.weekly_reports_sent == 1 and out.recurring_created == 0
