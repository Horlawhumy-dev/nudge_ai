"""Nudge reads, feedback, and the deterministic analytics behind insights."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Habit,
    HabitCompletion,
    Nudge,
    NudgeFeedback,
    Streak,
)
from app.schemas.models import AnalyticsOverview, HabitSummary
from app.services.core_service import Conflict, NotFound, complete_habit

NUDGE_STATUSES = ("scheduled", "sent", "snoozed", "skipped", "failed")


async def list_nudges(
    session: AsyncSession, user_id: UUID, *, status: str | None = None, limit: int = 50
) -> list[Nudge]:
    stmt = (
        select(Nudge).where(Nudge.user_id == user_id).order_by(Nudge.created_at.desc()).limit(limit)
    )
    if status is not None:
        if status not in NUDGE_STATUSES:
            raise Conflict(f"unknown nudge status {status!r}")
        stmt = stmt.where(Nudge.status == status)
    return list(await session.scalars(stmt))


async def get_nudge(session: AsyncSession, user_id: UUID, nudge_id: UUID) -> Nudge:
    nudge = await session.scalar(
        select(Nudge).where(Nudge.id == nudge_id, Nudge.user_id == user_id)
    )
    if nudge is None:
        raise NotFound("nudge not found")
    return nudge


async def snooze_nudge(session: AsyncSession, user_id: UUID, nudge_id: UUID) -> Nudge:
    """Snooze a sent nudge. Two snoozes in a week make the engine back off."""
    nudge = await get_nudge(session, user_id, nudge_id)
    if nudge.status != "sent":
        raise Conflict(f"only a sent nudge can be snoozed (is {nudge.status})")
    nudge.status = "snoozed"
    session.add(NudgeFeedback(nudge_id=nudge.id, user_id=user_id, kind="snoozed"))
    await session.commit()
    await session.refresh(nudge)
    return nudge


async def record_feedback(
    session: AsyncSession, user_id: UUID, nudge_id: UUID, kind: str
) -> NudgeFeedback:
    """Record how the user answered a nudge.

    ``completed`` also completes the habit, so the streak moves and the
    engine stops considering it due. ``snoozed`` marks the nudge snoozed.
    """
    nudge = await get_nudge(session, user_id, nudge_id)
    feedback = NudgeFeedback(nudge_id=nudge.id, user_id=user_id, kind=kind)
    session.add(feedback)
    if kind == "snoozed" and nudge.status == "sent":
        nudge.status = "snoozed"
    await session.flush()
    if kind == "completed" and nudge.habit_id is not None:
        habit_id = nudge.habit_id
        assert isinstance(habit_id, UUID)  # noqa: S101
        await complete_habit(session, user_id, habit_id)
        await session.refresh(nudge)
    await session.commit()
    return feedback


async def analytics_overview(
    session: AsyncSession, user_id: UUID, *, now_utc: datetime | None = None
) -> AnalyticsOverview:
    """Deterministic numbers only. Phrasing happens in the API layer."""
    now = now_utc or datetime.now(UTC)
    week_ago = now - timedelta(days=7)

    habits = list(
        await session.scalars(
            select(Habit)
            .where(
                Habit.user_id == user_id,
                Habit.active.is_(True),
                Habit.archived_at.is_(None),
            )
            .order_by(Habit.stack_position, Habit.created_at)
        )
    )
    habit_ids = [h.id for h in habits]
    streaks: dict[UUID, Streak] = {}
    completions_7d: dict[UUID, int] = {}
    if habit_ids:
        for row in await session.scalars(select(Streak).where(Streak.habit_id.in_(habit_ids))):
            streaks[row.habit_id] = row
        for habit_id, count in (
            await session.execute(
                select(HabitCompletion.habit_id, func.count())
                .where(
                    HabitCompletion.habit_id.in_(habit_ids),
                    HabitCompletion.created_at >= week_ago,
                )
                .group_by(HabitCompletion.habit_id)
            )
        ).all():
            if habit_id is not None:
                completions_7d[habit_id] = int(count)

    summaries = [
        HabitSummary(
            habit_id=h.id,
            name=h.name,
            streak_current=streaks[h.id].current if h.id in streaks else 0,
            streak_best=streaks[h.id].best if h.id in streaks else 0,
            completions_last_7d=completions_7d.get(h.id, 0),
        )
        for h in habits
    ]
    sent_7d = (
        await session.scalar(
            select(func.count())
            .select_from(Nudge)
            .where(
                Nudge.user_id == user_id,
                Nudge.status == "sent",
                Nudge.sent_at >= week_ago,
            )
        )
        or 0
    )
    by_rule: dict[str, int] = {}
    for reason, count in (
        await session.execute(
            select(Nudge.skip_reason, func.count())
            .where(
                Nudge.user_id == user_id,
                Nudge.status == "skipped",
                Nudge.created_at >= week_ago,
            )
            .group_by(Nudge.skip_reason)
        )
    ).all():
        by_rule[str(reason or "unknown")] = int(count)
    return AnalyticsOverview(
        habits=summaries,
        active_streaks=sum(1 for s in summaries if s.streak_current > 0),
        completions_last_7d=sum(completions_7d.values()),
        nudges_sent_7d=int(sent_7d),
        nudges_suppressed_7d=sum(by_rule.values()),
        suppressions_by_rule=by_rule,
    )


__all__ = [
    "analytics_overview",
    "get_nudge",
    "list_nudges",
    "record_feedback",
    "snooze_nudge",
]
