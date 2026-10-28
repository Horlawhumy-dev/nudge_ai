"""Recurring tasks.

A recurring task is a series of ordinary task rows, one per occurrence, so each can be ticked,
moved or deleted on its own. The rule decides the dates; this module also keeps a series alive:
finishing an occurrence schedules the next one, and :func:`roll_all` (run by the worker) makes sure
a series that was neglected still has an occurrence waiting today.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Preference, Task, User

log = logging.getLogger(__name__)

RULES = ("daily", "weekdays", "weekly")
# A series that has been idle this long (no occurrence anywhere near today) is left alone rather
# than back-filled forever.
MAX_CATCH_UP_DAYS = 400


def next_after(day: date, rule: str) -> date:
    """The occurrence that follows ``day`` under ``rule``."""
    if rule == "weekly":
        return day + timedelta(days=7)
    nxt = day + timedelta(days=1)
    if rule == "weekdays":
        while nxt.weekday() >= 5:  # skip Saturday and Sunday
            nxt += timedelta(days=1)
    return nxt


def first_on_or_after(start: date, rule: str, floor: date) -> date:
    """The first occurrence at or after ``floor``, stepping the rule forward from ``start``.

    ``start`` must itself be a valid occurrence (for example ``next_after`` of a real one). The
    loop is bounded by :data:`MAX_CATCH_UP_DAYS`.
    """
    day = start
    while day < floor:
        day = next_after(day, rule)
    return day


def new_occurrence(prev: Task, day: date) -> Task:
    """A fresh, not-done copy of ``prev`` on ``day`` (same series, rule and clock times)."""
    return Task(
        user_id=prev.user_id,
        title=prev.title,
        notes=prev.notes,
        priority=prev.priority,
        date=day,
        start_time=prev.start_time,
        end_time=prev.end_time,
        due_at=None,  # filled by the caller, who knows the user's zone
        repeat=True,
        repeat_rule=prev.repeat_rule,
        series_id=prev.series_id or prev.id,
    )


async def latest_in_series(session: AsyncSession, series_id: object) -> Task | None:
    """The most recent occurrence, counting deleted ones so a deleted day isn't re-created."""
    return await session.scalar(
        select(Task).where(Task.series_id == series_id).order_by(Task.date.desc()).limit(1)
    )


def _zone(user: User, prefs: Preference | None) -> ZoneInfo:
    for name in (prefs.timezone if prefs else None, user.timezone):
        if name:
            try:
                return ZoneInfo(name)
            except Exception:  # noqa: BLE001, S112
                continue
    return ZoneInfo("UTC")


async def schedule_next(session: AsyncSession, task: Task, user: User) -> Task | None:
    """After an occurrence is finished: make sure the series has its next occurrence.

    Idempotent: if a later occurrence already exists, nothing is created. Returns the new row.
    """
    from app.services.core_service import task_due_at, user_zone

    if not (task.repeat and task.repeat_rule and task.date):
        return None
    series = task.series_id or task.id
    latest = await latest_in_series(session, series)
    if latest is not None and latest.date and latest.date > task.date:
        return None
    day = next_after(task.date, task.repeat_rule)
    nxt = new_occurrence(task, day)
    nxt.due_at = task_due_at(day, nxt.start_time, nxt.end_time, user_zone(user))
    session.add(nxt)
    await session.flush()
    return nxt


async def roll_all(session: AsyncSession, now_utc: datetime | None = None) -> int:
    """Give every live series an occurrence for today (or its next date) when it has fallen behind.

    Runs from the worker. Returns how many occurrences were created.
    """
    from app.services.core_service import task_due_at

    now = now_utc or datetime.now(UTC)
    # One row per series: the latest occurrence, only for series that are still repeating.
    latest_date = (
        select(Task.series_id.label("sid"), func.max(Task.date).label("d"))
        .where(Task.series_id.is_not(None))
        .group_by(Task.series_id)
        .subquery()
    )
    rows = list(
        await session.scalars(
            select(Task)
            .join(
                latest_date, (Task.series_id == latest_date.c.sid) & (Task.date == latest_date.c.d)
            )
            .where(Task.repeat.is_(True), Task.repeat_rule.is_not(None))
        )
    )
    created = 0
    seen: set[object] = set()
    for task in rows:
        if task.series_id in seen or task.date is None or task.repeat_rule is None:
            continue
        seen.add(task.series_id)
        user = await session.get(User, task.user_id)
        if user is None:
            continue
        prefs = await session.scalar(select(Preference).where(Preference.user_id == user.id))
        zone = _zone(user, prefs)
        today = now.astimezone(zone).date()
        if task.date >= today or (today - task.date).days > MAX_CATCH_UP_DAYS:
            continue  # already has today/future, or abandoned long ago
        day = first_on_or_after(next_after(task.date, task.repeat_rule), task.repeat_rule, today)
        nxt = new_occurrence(task, day)
        nxt.due_at = task_due_at(day, nxt.start_time, nxt.end_time, zone)
        session.add(nxt)
        created += 1
    if created:
        await session.commit()
        log.info("recurring tasks: created %d occurrence(s)", created)
    return created
