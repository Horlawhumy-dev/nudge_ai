"""Candidate loading: the database side of the Decision Engine.

The rules in :mod:`app.engine.rules` are pure; this module does the I/O that
feeds them. :func:`load_candidates` gathers one user's habits, streaks,
today's completions, recent snoozes, and preference knobs into
:class:`NudgeCandidate` rows, all stamped with the user's local time.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.tone import style_for
from app.db.models import (
    Habit,
    HabitCompletion,
    Nudge,
    NudgeFeedback,
    OnboardingProfile,
    Preference,
    Streak,
    User,
)
from app.engine.rules import SNOOZE_LOOKBACK_DAYS, NudgeCandidate


@dataclass(frozen=True, slots=True)
class UserContext:
    user_id: UUID
    name: str | None
    tone: str | None
    timezone: str
    plan: str
    max_per_day: int
    digest_time: str | None
    local_now: datetime


@dataclass(frozen=True, slots=True)
class CandidateBundle:
    user: UserContext
    candidates: tuple[NudgeCandidate, ...]


def effective_quiet(prefs: Preference | None, local_now: datetime) -> tuple[str | None, str | None]:
    """The quiet window that applies right now, or (None, None) when there isn't one.

    Off when the user turned quiet hours off, or when today isn't one of the chosen days
    (``quiet_repeat_days``, Monday=0; empty or unset means every day). A window that wraps
    past midnight belongs to the day it *started*, so at 02:00 Tuesday the Monday-night
    window is the one that counts.
    """
    if prefs is None or not prefs.quiet_enabled:
        return None, None
    start, end = prefs.quiet_start, prefs.quiet_end
    days = prefs.quiet_repeat_days
    if start and end and days:
        wraps = start > end
        in_early_part = wraps and local_now.strftime("%H:%M") < end
        weekday = (
            (local_now - timedelta(days=1)).weekday() if in_early_part else local_now.weekday()
        )
        if weekday not in days:
            return None, None
    return start, end


def to_local(now_utc: datetime, tzname: str) -> datetime:
    """User-local time, falling back to UTC on an unknown zone name."""
    try:
        return now_utc.astimezone(ZoneInfo(tzname))
    except ZoneInfoNotFoundError:
        return now_utc.astimezone(UTC)


async def load_candidates(
    session: AsyncSession,
    user_id: UUID,
    *,
    now_utc: datetime | None = None,
    habit_ids: set[UUID] | None = None,
) -> CandidateBundle:
    """Build the rule inputs for one user.

    Habits with a nudge already ``scheduled`` are excluded: the engine must
    not stack a second pending nudge behind the first. ``habit_ids`` narrows
    the load to what the scheduler claimed (the Redis path); None loads every
    active habit (the DB-fallback path and the dry-run endpoint).
    """
    now = now_utc or datetime.now(UTC)
    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise LookupError(f"user {user_id} not found")
    prefs = await session.scalar(select(Preference).where(Preference.user_id == user_id))
    profile = await session.scalar(
        select(OnboardingProfile).where(OnboardingProfile.user_id == user_id)
    )
    # Prefer the live "AI voice & tone" settings; fall back to what onboarding captured.
    tone = (
        style_for(prefs)
        if prefs is not None
        else ((profile.tone or profile.nudge_style) if profile is not None else None)
    )

    tzname = prefs.timezone if prefs and prefs.timezone else (user.timezone or "UTC")
    local_now = to_local(now, tzname)
    today = local_now.date()
    day_start_utc = local_now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)

    max_per_day = prefs.max_nudges_per_day if prefs else 6
    # The morning summary is the digest: switching it off switches the digest off.
    digest_time = prefs.digest_time if prefs and prefs.morning_summary_enabled else None
    quiet_start, quiet_end = effective_quiet(prefs, local_now)
    push_enabled = prefs.push_enabled if prefs else True
    streak_alerts = prefs.streak_alerts_enabled if prefs else True
    stacking_on = prefs.habit_stacking_enabled if prefs else True
    use_name = prefs.use_name_in_reminders if prefs else True

    stmt = (
        select(Habit)
        .where(Habit.user_id == user_id, Habit.active.is_(True), Habit.archived_at.is_(None))
        .order_by(Habit.stack_position, Habit.created_at)
    )
    if habit_ids is not None:
        stmt = stmt.where(Habit.id.in_(habit_ids))
    habits = list(await session.scalars(stmt))
    if not habits:
        return CandidateBundle(
            user=_context(user, tone, tzname, local_now, max_per_day, digest_time, use_name),
            candidates=(),
        )

    habit_keys = [h.id for h in habits]
    completions = await _counts_by_habit(
        session,
        select(HabitCompletion.habit_id, func.count())
        .where(
            HabitCompletion.habit_id.in_(habit_keys),
            HabitCompletion.completed_on == today,
        )
        .group_by(HabitCompletion.habit_id),
    )
    streaks = {
        row.habit_id: row.current
        for row in await session.scalars(select(Streak).where(Streak.habit_id.in_(habit_keys)))
    }
    snoozes = await _counts_by_habit(
        session,
        select(Nudge.habit_id, func.count())
        .join(NudgeFeedback, NudgeFeedback.nudge_id == Nudge.id)
        .where(
            Nudge.habit_id.in_(habit_keys),
            NudgeFeedback.kind == "snoozed",
            NudgeFeedback.created_at >= now - timedelta(days=SNOOZE_LOOKBACK_DAYS),
        )
        .group_by(Nudge.habit_id),
    )
    # Only a *future* scheduled row blocks re-evaluation. A scheduled row
    # whose time has come is firing now, so it stays in the candidate set.
    pending = set(
        await session.scalars(
            select(Nudge.habit_id).where(
                Nudge.user_id == user_id,
                Nudge.habit_id.in_(habit_keys),
                Nudge.status == "scheduled",
                Nudge.scheduled_for > now,
            )
        )
    )
    sent_today = (
        await session.scalar(
            select(func.count())
            .select_from(Nudge)
            .where(Nudge.user_id == user_id, Nudge.sent_at >= day_start_utc)
        )
        or 0
    )

    # The cue of a stacked habit is its predecessor in stack order: the habit
    # with the greatest stack_position below its own. Position 0, or a stack
    # of one, has no cue and is always cue-complete.
    ordered = sorted(habits, key=lambda h: h.stack_position)
    cue_done: dict[UUID, bool] = {}
    for i, habit in enumerate(ordered):
        if not stacking_on:
            cue_done[habit.id] = True
        elif habit.stacked_after_id is not None:
            # An explicit link wins: wait for exactly the habit it was stacked after.
            cue_done[habit.id] = completions.get(habit.stacked_after_id, 0) > 0
        elif i == 0 or habit.stack_position <= 0:
            cue_done[habit.id] = True
        else:
            cue_done[habit.id] = completions.get(ordered[i - 1].id, 0) > 0

    incomplete = sum(1 for h in ordered if h.id not in pending and completions.get(h.id, 0) == 0)
    candidates: list[NudgeCandidate] = []
    for habit in ordered:
        if habit.id in pending:
            continue
        own_incomplete = 1 if completions.get(habit.id, 0) == 0 else 0
        candidates.append(
            NudgeCandidate(
                habit_id=habit.id,
                habit_name=habit.name,
                now=local_now,
                plan=user.plan,
                preferred_time=habit.preferred_time,
                stack_position=habit.stack_position,
                target_per_day=habit.target_per_day,
                completions_today=completions.get(habit.id, 0),
                cue_completed=cue_done[habit.id],
                snoozes_recent=snoozes.get(habit.id, 0),
                sent_today=sent_today,
                max_per_day=max_per_day,
                quiet_start=quiet_start,
                quiet_end=quiet_end,
                digest_time=digest_time,
                due_siblings=max(0, incomplete - own_incomplete),
                streak_current=streaks.get(habit.id, 0),
                push_enabled=push_enabled,
                streak_alerts=streak_alerts,
            )
        )
    return CandidateBundle(
        user=_context(user, tone, tzname, local_now, max_per_day, digest_time, use_name),
        candidates=tuple(candidates),
    )


def _context(
    user: User,
    tone: str | None,
    tzname: str,
    local_now: datetime,
    max_per_day: int,
    digest_time: str | None,
    use_name: bool = True,
) -> UserContext:
    first = user.name.split()[0] if user.name and user.name.split() else None
    return UserContext(
        user_id=user.id,
        name=first if use_name else None,
        tone=tone,
        timezone=tzname,
        plan=user.plan,
        max_per_day=max_per_day,
        digest_time=digest_time,
        local_now=local_now,
    )


async def _counts_by_habit(session: AsyncSession, stmt: Any) -> dict[UUID, int]:
    """Count rows grouped by habit. `stmt` is a (habit_id, count) select."""
    out: dict[UUID, int] = {}
    for habit_id, count in (await session.execute(stmt)).all():
        if habit_id is not None:
            out[habit_id] = int(count)
    return out


__all__ = ["CandidateBundle", "UserContext", "load_candidates", "to_local"]
