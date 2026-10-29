"""Tell people a task is about to start.

Habits get nudges from the engine; tasks had nothing, so "book it and remind me" only ever created
a row. This job runs on every worker pass: for each task with a start time that is coming up, send
one reminder, shortly before it begins, as an inbox message plus a push.

Rules, kept deliberately small:
- one reminder per task (``reminded_at``); moving the task clears it so the new time gets its own;
- from ``task_reminder_lead_minutes`` before the start until ``task_reminder_grace_minutes`` after
  it, so a late worker or the end of quiet hours still delivers, but a stale one never does;
- quiet hours hold it back, except for a high-priority task when the person allowed those;
- all-day, finished and deleted tasks get nothing.

It is not a nudge in the engine's sense (no daily cap, no model call, no snooze), so it has its own
message kind, ``reminder``, and does not count toward the habit nudge limits.
"""

from __future__ import annotations

import logging
import math
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import Preference, Task, User
from app.engine.policy import effective_quiet
from app.engine.rules import in_quiet_hours
from app.services import notification_service
from app.services.reminder_copy import task_reminder

log = logging.getLogger(__name__)


def _zone(user: User, prefs: Preference) -> ZoneInfo:
    for name in (prefs.timezone, user.timezone):
        if name:
            try:
                return ZoneInfo(name)
            except ZoneInfoNotFoundError:
                continue
    return ZoneInfo("UTC")


def start_of(task: Task, zone: ZoneInfo) -> datetime | None:
    """When the task starts, as a moment in time; None for an all-day or malformed task."""
    if task.date is None or not task.start_time:
        return None
    try:
        clock = time(int(task.start_time[:2]), int(task.start_time[3:5]))
    except ValueError:
        return None
    return datetime.combine(task.date, clock, tzinfo=zone)


async def send_due_task_reminders(session: AsyncSession, now_utc: datetime | None = None) -> int:
    """Send every reminder that is due; returns how many went out."""
    now = now_utc or datetime.now(UTC)
    s = get_settings()
    lead = timedelta(minutes=s.task_reminder_lead_minutes)
    grace = timedelta(minutes=s.task_reminder_grace_minutes)

    # Local dates differ from UTC dates by at most a day either way, so look two days each side.
    rows = (
        await session.execute(
            select(Task, User, Preference)
            .join(User, User.id == Task.user_id)
            .outerjoin(Preference, Preference.user_id == User.id)
            .where(
                Task.reminded_at.is_(None),
                Task.done_at.is_(None),
                Task.deleted_at.is_(None),
                Task.start_time.is_not(None),
                Task.date.between(
                    (now - timedelta(days=2)).date(), (now + timedelta(days=2)).date()
                ),
                User.is_email_verified.is_(True),
            )
        )
    ).all()

    sent = 0
    for task, user, found in rows:
        prefs: Preference | None = found
        if prefs is None:  # settings are created on first visit; defaults apply until then
            prefs = Preference(user_id=user.id, timezone=user.timezone)
            session.add(prefs)
            await session.flush()
        zone = _zone(user, prefs)
        start = start_of(task, zone)
        if start is None or not (start - lead <= now < start + grace):
            continue

        local_now = now.astimezone(zone)
        quiet_start, quiet_end = effective_quiet(prefs, local_now)
        if in_quiet_hours(local_now, quiet_start, quiet_end) and not (
            task.priority == "high" and prefs.quiet_allow_priority
        ):
            continue  # held back; it still goes out if quiet hours end before the grace runs out

        minutes_left = max(0, math.ceil((start - now).total_seconds() / 60))
        first = (user.name or "").split()[0] if user.name and user.name.split() else None
        headline, body = task_reminder(
            title=task.title,
            start_time=task.start_time or "",
            minutes_left=minutes_left,
            tone=prefs.reminder_tone,
            name=first if prefs.use_name_in_reminders else None,
            emojis=prefs.use_emojis_in_reminders,
        )
        user_id = user.id
        message = await notification_service.create_notification(
            session, user_id, kind="reminder", title=headline, body=body, task_id=task.id, at=now
        )
        task.reminded_at = now
        message_id = message.id
        await session.commit()
        await notification_service.deliver(session, user_id, [message_id])
        sent += 1
    if sent:
        log.info("task reminders sent: %d", sent)
    return sent
