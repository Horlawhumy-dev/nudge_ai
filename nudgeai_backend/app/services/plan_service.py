"""Plans: what Free and Pro allow, current usage, and switching (stubbed billing)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import Habit, Subscription, Task, User
from app.schemas.models import PlanLimits, PlanUsage, SubscriptionResponse


class PlanLimitReached(Exception):
    """The Free plan's allowance is used up (maps to 402 Payment Required)."""


def limits_for(plan: str) -> PlanLimits:
    if plan == "pro":
        return PlanLimits(habits=None, tasks_per_day=None)
    s = get_settings()
    return PlanLimits(habits=s.free_habit_limit, tasks_per_day=s.free_tasks_per_day)


async def habit_count(session: AsyncSession, user_id: UUID) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(Habit)
            .where(Habit.user_id == user_id, Habit.archived_at.is_(None))
        )
        or 0
    )


async def tasks_on(session: AsyncSession, user_id: UUID, day: date) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(Task)
            .where(Task.user_id == user_id, Task.date == day, Task.deleted_at.is_(None))
        )
        or 0
    )


async def check_can_add_habit(session: AsyncSession, user: User) -> None:
    limit = limits_for(user.plan).habits
    if limit is not None and await habit_count(session, user.id) >= limit:
        raise PlanLimitReached(
            f"the Free plan includes {limit} habits. Upgrade to Pro for unlimited habits"
        )


async def check_can_add_task(session: AsyncSession, user: User, day: date) -> None:
    limit = limits_for(user.plan).tasks_per_day
    if limit is not None and await tasks_on(session, user.id, day) >= limit:
        raise PlanLimitReached(
            f"the Free plan includes {limit} tasks per day. Upgrade to Pro for unlimited tasks"
        )


async def current(session: AsyncSession, user: User, *, today: date) -> SubscriptionResponse:
    sub = await session.scalar(select(Subscription).where(Subscription.user_id == user.id))
    return SubscriptionResponse(
        plan="pro" if user.plan == "pro" else "free",
        period=sub.period if sub and user.plan == "pro" else None,
        status=sub.status if sub else "active",
        renews_at=sub.renews_at if sub and user.plan == "pro" else None,
        limits=limits_for(user.plan),
        usage=PlanUsage(
            habits=await habit_count(session, user.id),
            tasks_today=await tasks_on(session, user.id, today),
        ),
    )


async def switch(session: AsyncSession, user: User, *, plan: str, period: str) -> None:
    """Change plan. Stub: no payment is taken; see ``billing_stub_enabled``."""
    sub = await session.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if sub is None:
        sub = Subscription(user_id=user.id)
        session.add(sub)
    now = datetime.now(UTC)
    user.plan = plan
    sub.tier = plan
    sub.status = "active"
    if plan == "pro":
        sub.period = period
        sub.renews_at = now + timedelta(days=365 if period == "yearly" else 30)
    else:
        sub.period = None
        sub.renews_at = None
    await session.commit()
