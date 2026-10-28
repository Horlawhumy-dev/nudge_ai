from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Habit, HabitCompletion, Streak, Task


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


# =================================================================== habits


# Weekly check-in goal implied by a cadence when the client doesn't pick one.
_GOAL_BY_FREQUENCY = {"daily": 7, "weekdays": 5, "weekly": 1}
# Reminder time used when a habit has only a time of day (matches the mobile defaults).
_DEFAULT_TIME = {"morning": "08:00", "afternoon": "14:00", "evening": "19:00"}


class Invalid(Exception):
    """A request that is well-formed but not allowed (maps to 422)."""


async def _resolve_trigger(
    session: AsyncSession, user_id: UUID, trigger_id: UUID, *, habit_id: UUID | None
) -> Habit:
    """The habit a new/updated habit is stacked after, validated.

    It must be the caller's, still active, not the habit itself, and following the chain of
    triggers upward must never lead back to ``habit_id`` (a loop would never fire).
    """
    if habit_id is not None and trigger_id == habit_id:
        raise Invalid("a habit can't be stacked after itself")
    trigger = await session.scalar(
        select(Habit).where(
            Habit.id == trigger_id, Habit.user_id == user_id, Habit.archived_at.is_(None)
        )
    )
    if trigger is None:
        raise NotFound("trigger habit not found")
    seen: set[UUID] = set()
    cursor: Habit | None = trigger
    while cursor is not None and cursor.id not in seen:
        if habit_id is not None and cursor.id == habit_id:
            raise Invalid("that would make the stack loop back on itself")
        seen.add(cursor.id)
        cursor = (
            await session.get(Habit, cursor.stacked_after_id) if cursor.stacked_after_id else None
        )
    return trigger


async def create_habit(session: AsyncSession, user_id: UUID, **kwargs: Any) -> Habit:
    trigger_id = kwargs.pop("stacked_after_id", None)
    if kwargs.get("goal_days") is None:
        kwargs["goal_days"] = _GOAL_BY_FREQUENCY.get(kwargs.get("frequency", "daily"), 7)
    if kwargs.get("preferred_time") is None:
        kwargs["preferred_time"] = _DEFAULT_TIME.get(kwargs.get("time_of_day", "morning"))
    if trigger_id is not None:
        trigger = await _resolve_trigger(session, user_id, trigger_id, habit_id=None)
        kwargs["stacked_after_id"] = trigger.id
        # The engine orders a stack by position, so sit just after the trigger.
        kwargs["stack_position"] = trigger.stack_position + 1
    habit = Habit(user_id=user_id, **kwargs)
    session.add(habit)
    await session.flush()
    session.add(Streak(habit_id=habit.id, current=0, best=0))
    await session.commit()
    return await get_habit(session, user_id, habit.id)


async def get_habit(session: AsyncSession, user_id: UUID, habit_id: UUID) -> Habit:
    habit = await session.scalar(
        select(Habit)
        .options(selectinload(Habit.streak))
        .where(Habit.id == habit_id, Habit.user_id == user_id)
    )
    if habit is None:
        raise NotFound("habit not found")
    return habit


async def list_habits(
    session: AsyncSession, user_id: UUID, *, include_archived: bool = False
) -> list[Habit]:
    stmt = (
        select(Habit)
        .options(selectinload(Habit.streak))
        .where(Habit.user_id == user_id)
        .order_by(Habit.stack_position, Habit.created_at)
    )
    if not include_archived:
        stmt = stmt.where(Habit.archived_at.is_(None))
    return list(await session.scalars(stmt))


# Columns that can't be NULL: an explicit null in a PATCH is ignored rather than an error.
_NOT_NULLABLE = {
    "name",
    "target_per_day",
    "stack_position",
    "emoji",
    "time_of_day",
    "frequency",
    "goal_days",
    "active",
}


async def update_habit(
    session: AsyncSession, user_id: UUID, habit_id: UUID, **kwargs: Any
) -> Habit:
    habit = await get_habit(session, user_id, habit_id)
    changes = {k: v for k, v in kwargs.items() if v is not None or k not in _NOT_NULLABLE}

    if "frequency" in changes and "goal_days" not in changes:
        changes["goal_days"] = _GOAL_BY_FREQUENCY[changes["frequency"]]
    if "time_of_day" in changes and "preferred_time" not in changes:
        # Follow the new time of day unless the user had pinned an exact reminder time.
        if habit.preferred_time in (None, *_DEFAULT_TIME.values()):
            changes["preferred_time"] = _DEFAULT_TIME[changes["time_of_day"]]

    if "stacked_after_id" in changes:
        trigger_id = changes.pop("stacked_after_id")
        if trigger_id is None:
            if habit.stacked_after_id is not None:
                habit.stack_position = 0
            habit.stacked_after_id = None
        else:
            trigger = await _resolve_trigger(session, user_id, trigger_id, habit_id=habit.id)
            habit.stacked_after_id = trigger.id
            habit.stack_position = trigger.stack_position + 1

    for key, value in changes.items():
        setattr(habit, key, value)
    await session.commit()
    return await get_habit(session, user_id, habit_id)


async def delete_habit(session: AsyncSession, user_id: UUID, habit_id: UUID) -> None:
    habit = await get_habit(session, user_id, habit_id)
    habit.archived_at = datetime.now(UTC)
    habit.active = False
    # Anything stacked after it loses its trigger and becomes a standalone habit.
    dependants = await session.scalars(
        select(Habit).where(Habit.user_id == user_id, Habit.stacked_after_id == habit.id)
    )
    for dep in dependants:
        dep.stacked_after_id = None
        dep.stack_position = 0
    await session.commit()


async def restore_habit(session: AsyncSession, user_id: UUID, habit_id: UUID) -> Habit:
    """Undo a delete. Stacking links are not restored; the user can re-stack it."""
    habit = await session.scalar(
        select(Habit)
        .options(selectinload(Habit.streak))
        .where(Habit.id == habit_id, Habit.user_id == user_id)
    )
    if habit is None:
        raise NotFound("habit not found")
    habit.archived_at = None
    habit.active = True
    await session.commit()
    return await get_habit(session, user_id, habit_id)


def recompute_streak(completion_days: list[date], *, today: date) -> tuple[int, int, date | None]:
    """Return (current_streak, longest_streak, last_completed_on).

    A streak survives a gap of one day: if the user has not completed today, the
    current streak is still measured up to yesterday rather than reported broken.

    `longest` is the longest consecutive run anywhere in history, which is not the
    same as `current` once a gap has broken the most recent run.
    """
    if not completion_days:
        return 0, 0, None
    days = sorted(set(completion_days))

    longest = 1
    run = 1
    for prev, cur in zip(days, days[1:], strict=False):
        run = run + 1 if (cur - prev).days == 1 else 1
        longest = max(longest, run)

    # Yesterday still counts: the day is not over yet.
    alive = today - timedelta(days=1) <= days[-1] <= today
    current = run if alive else 0
    return current, longest, days[-1]


async def complete_habit(
    session: AsyncSession, user_id: UUID, habit_id: UUID, *, on: date | None = None
) -> Habit:
    habit = await get_habit(session, user_id, habit_id)
    day = on or datetime.now(UTC).date()

    existing = await session.scalar(
        select(HabitCompletion).where(
            HabitCompletion.habit_id == habit.id, HabitCompletion.completed_on == day
        )
    )
    if existing is None:
        session.add(HabitCompletion(habit_id=habit.id, user_id=user_id, completed_on=day))

    await session.flush()
    days = list(
        await session.scalars(
            select(HabitCompletion.completed_on)
            .where(HabitCompletion.habit_id == habit.id)
            .order_by(HabitCompletion.completed_on)
        )
    )
    current, longest, last = recompute_streak(days, today=day)
    if habit.streak is None:
        habit.streak = Streak(habit_id=habit.id, current=0, best=0)
    habit.streak.current = current
    # best is the longest run ever, so it only ever ratchets upward.
    habit.streak.best = max(habit.streak.best, longest)
    habit.streak.last_completed_on = last
    await session.commit()
    return await get_habit(session, user_id, habit.id)


async def uncomplete_habit(
    session: AsyncSession, user_id: UUID, habit_id: UUID, *, on: date | None = None
) -> Habit:
    habit = await get_habit(session, user_id, habit_id)
    day = on or datetime.now(UTC).date()
    row = await session.scalar(
        select(HabitCompletion).where(
            HabitCompletion.habit_id == habit.id, HabitCompletion.completed_on == day
        )
    )
    if row is not None:
        await session.delete(row)
        await session.flush()
    days = list(
        await session.scalars(
            select(HabitCompletion.completed_on)
            .where(HabitCompletion.habit_id == habit.id)
            .order_by(HabitCompletion.completed_on)
        )
    )
    current, longest, last = recompute_streak(days, today=day)
    if habit.streak is not None:
        habit.streak.current = current
        habit.streak.best = max(habit.streak.best, longest)
        habit.streak.last_completed_on = last
    await session.commit()
    return await get_habit(session, user_id, habit.id)


# ==================================================================== tasks


async def create_task(session: AsyncSession, user_id: UUID, **kwargs: Any) -> Task:
    task = Task(user_id=user_id, **kwargs)
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


async def get_task(session: AsyncSession, user_id: UUID, task_id: UUID) -> Task:
    task = await session.scalar(select(Task).where(Task.id == task_id, Task.user_id == user_id))
    if task is None:
        raise NotFound("task not found")
    return task


async def list_tasks(
    session: AsyncSession, user_id: UUID, *, include_done: bool = False
) -> list[Task]:
    stmt = select(Task).where(Task.user_id == user_id).order_by(Task.created_at.desc())
    if not include_done:
        stmt = stmt.where(Task.done_at.is_(None))
    return list(await session.scalars(stmt))


async def update_task(session: AsyncSession, user_id: UUID, task_id: UUID, **kwargs: Any) -> Task:
    task = await get_task(session, user_id, task_id)
    for key, value in kwargs.items():
        setattr(task, key, value)
    await session.commit()
    await session.refresh(task)
    return task


async def delete_task(session: AsyncSession, user_id: UUID, task_id: UUID) -> None:
    task = await get_task(session, user_id, task_id)
    await session.delete(task)
    await session.commit()
