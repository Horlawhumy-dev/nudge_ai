"""The weekly report as an inbox message (and push), sent Monday morning to users who opted in."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Nudge, Preference, User
from app.services import insights, notification_service
from app.services.nudge_service import load_facts

log = logging.getLogger(__name__)

REPORT_TITLE = "Your weekly report"
SEND_WEEKDAY = 0  # Monday
SEND_HOUR = 9  # local time
# A report is never sent twice in this window, so a worker restart or a late pass can't repeat it.
MIN_GAP = timedelta(days=6)


def is_due(local_now: datetime) -> bool:
    """Monday from 09:00 local time on (a late worker still sends; the gap check stops repeats)."""
    return local_now.weekday() == SEND_WEEKDAY and local_now.hour >= SEND_HOUR


def message_for(report: insights.WeeklyReport) -> str:
    """The notification body: the headline plus the numbers people care about."""
    facts: list[str] = []
    if report.possible:
        facts.append(f"{report.check_ins}/{report.possible} habit check-ins")
    if report.tasks_total:
        facts.append(f"{report.tasks_done}/{report.tasks_total} tasks done")
    return f"{report.headline}. " + ", ".join(facts) + "." if facts else f"{report.headline}."


def _zone(user: User, prefs: Preference) -> ZoneInfo:
    for name in (prefs.timezone, user.timezone):
        if name:
            try:
                return ZoneInfo(name)
            except ZoneInfoNotFoundError:
                continue
    return ZoneInfo("UTC")


async def _recently_sent(session: AsyncSession, user_id: object, now: datetime) -> bool:
    last = await session.scalar(
        select(Nudge.sent_at)
        .where(Nudge.user_id == user_id, Nudge.kind == "insight", Nudge.title == REPORT_TITLE)
        .order_by(Nudge.sent_at.desc())
        .limit(1)
    )
    return last is not None and now - last < MIN_GAP


async def send_due_weekly_reports(session: AsyncSession, now_utc: datetime | None = None) -> int:
    """Create (and push) a weekly report for every opted-in user whose Monday morning has come."""
    now = now_utc or datetime.now(UTC)
    rows = (
        await session.execute(
            select(User, Preference)
            .join(Preference, Preference.user_id == User.id)
            .where(Preference.weekly_report_enabled.is_(True), User.is_email_verified.is_(True))
        )
    ).all()
    sent = 0
    for user, prefs in rows:
        local = now.astimezone(_zone(user, prefs))
        if not is_due(local) or await _recently_sent(session, user.id, now):
            continue
        habits, tasks = await load_facts(session, user, today=local.date())
        report = insights.weekly_report(habits, tasks, local.date())
        row = await notification_service.create_notification(
            session,
            user.id,
            kind="insight",
            title=REPORT_TITLE,
            body=message_for(report),
            at=now,
        )
        await session.commit()
        await notification_service.deliver(session, user.id, [row.id])
        sent += 1
    if sent:
        log.info("weekly reports sent: %d", sent)
    return sent
