from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.ai.tone import style_for
from app.api.deps import CurrentUser, SessionDep
from app.db.models import OnboardingProfile
from app.engine import composer
from app.models.client import ModelError, get_client
from app.schemas.models import (
    AnalyticsOverview,
    BarOut,
    DayCell,
    HabitProgress,
    OverdueTaskOut,
    TaskProgress,
    TimeGroupOut,
    TopHabitOut,
    WeeklyReportResponse,
)
from app.services import insights, nudge_service
from app.services.core_service import local_today

log = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview", response_model=AnalyticsOverview)
async def overview(
    user: CurrentUser, session: SessionDep, phrase: bool = Query(default=False)
) -> AnalyticsOverview:
    """Deterministic productivity numbers, with optional model phrasing.

    The numbers are computed, never generated. ``phrase`` asks the fast tier
    to word one insight sentence from them; if the model fails, the numbers
    still return and ``insight`` stays null.
    """
    report = await nudge_service.analytics_overview(session, user.id)
    if not phrase:
        return report
    try:
        profile = await session.scalar(
            select(OnboardingProfile).where(OnboardingProfile.user_id == user.id)
        )
        style = profile.tone or profile.nudge_style if profile is not None else None
        composed = await composer.phrase_insight(
            get_client(),
            tone=style,
            numbers={
                "active_streaks": report.active_streaks,
                "completions_last_7d": report.completions_last_7d,
                "nudges_sent_7d": report.nudges_sent_7d,
                "nudges_suppressed_7d": report.nudges_suppressed_7d,
                "suppressions_by_rule": report.suppressions_by_rule,
            },
        )
        report.insight = composed.text
    except ModelError as exc:
        log.warning("insight phrasing failed, returning numbers only: %s", exc)
    return report


# ----------------------------------------------------- the Progress screens and report

Period = Literal["weekly", "monthly"]


async def _phrase(user: Any, numbers: dict[str, Any]) -> str | None:
    """One sentence wording the numbers, from Meta's fast tier. None if the model is unavailable."""
    try:
        composed = await composer.phrase_insight(
            get_client(), tone=style_for(user.preferences), numbers=numbers
        )
    except ModelError as exc:
        log.warning("insight phrasing failed, returning numbers only: %s", exc)
        return None
    return composed.text


@router.get("/habits", response_model=HabitProgress)
async def habit_progress(
    user: CurrentUser,
    session: SessionDep,
    period: Period = Query(default="weekly"),
    phrase: bool = Query(default=False),
) -> HabitProgress:
    """Everything on the Progress > Habits tab, for the weekly or monthly view."""
    today = local_today(user)
    habits, _ = await nudge_service.load_facts(session, user, today=today)
    current, best = insights.overall_streak(habits, today)
    wins = await nudge_service.all_time_checkins(session, user.id)
    out = HabitProgress(
        period=period,
        bars=[
            BarOut(label=b.label, value=b.value) for b in insights.habit_bars(habits, today, period)
        ],
        streak=current,
        best_streak=best,
        consistency=insights.consistency(habits, today),
        all_time_wins=wins,
        top_habits=[
            TopHabitOut(
                habit_id=UUID(t.id),
                name=t.name,
                emoji=t.emoji,
                streak=t.streak,
                completion=t.completion,
            )
            for t in insights.top_habits(habits, today)
        ],
        consistency_map=[
            DayCell(date=d, status=st) for d, st in insights.consistency_map(habits, today)
        ],
    )
    if phrase and habits:
        out.insight = await _phrase(
            user,
            {
                "streak": current,
                "consistency_pct": out.consistency,
                "bars": [b.value for b in out.bars],
            },
        )
    return out


@router.get("/tasks", response_model=TaskProgress)
async def task_progress(
    user: CurrentUser,
    session: SessionDep,
    period: Period = Query(default="weekly"),
    phrase: bool = Query(default=False),
) -> TaskProgress:
    """Everything on the Progress > Tasks tab."""
    today = local_today(user)
    now = datetime.now(UTC)
    _, tasks = await nudge_service.load_facts(session, user, today=today)
    ov = insights.task_overview(tasks, today, now)
    out = TaskProgress(
        period=period,
        bars=[
            BarOut(label=b.label, value=b.value) for b in insights.task_bars(tasks, today, period)
        ],
        done=ov.done,
        total=ov.total,
        completion_rate=ov.completion_rate,
        on_time_rate=ov.on_time_rate,
        overdue=ov.overdue,
        time_groups=[
            TimeGroupOut(name=g.name, completion=g.completion, total=g.total)
            for g in insights.task_time_groups(tasks, today)
        ],
        most_overdue=[
            OverdueTaskOut(
                task_id=UUID(t.id), title=t.title, due_at=t.due_at, days_overdue=t.days_overdue
            )
            for t in insights.most_overdue(tasks, today, now)
        ],
    )
    if phrase and ov.total:
        out.insight = await _phrase(
            user,
            {
                "completion_rate_pct": ov.completion_rate,
                "on_time_rate_pct": ov.on_time_rate,
                "overdue": ov.overdue,
                "best_time_of_day": max(out.time_groups, key=lambda g: g.completion).name,
            },
        )
    return out


@router.get("/report/weekly", response_model=WeeklyReportResponse)
async def weekly_report(user: CurrentUser, session: SessionDep) -> WeeklyReportResponse:
    """The last seven days in one summary (the "Weekly report" screen)."""
    today = local_today(user)
    habits, tasks = await nudge_service.load_facts(session, user, today=today)
    r = insights.weekly_report(habits, tasks, today)
    return WeeklyReportResponse(
        start=today - timedelta(days=insights.WEEK - 1),
        end=today,
        habit_rate=r.habit_rate,
        check_ins=r.check_ins,
        possible=r.possible,
        tasks_done=r.tasks_done,
        tasks_total=r.tasks_total,
        best_day=r.best_day,
        best_day_count=r.best_day_count,
        top_habit=r.top_habit,
        needs_love=r.needs_love,
        headline=r.headline,
        tips=r.tips,
    )
