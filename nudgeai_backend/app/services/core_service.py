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


async def create_habit(session: AsyncSession, user_id: UUID, **kwargs: Any) -> Habit:
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


async def update_habit(
    session: AsyncSession, user_id: UUID, habit_id: UUID, **kwargs: Any
) -> Habit:
    habit = await get_habit(session, user_id, habit_id)
    for key, value in kwargs.items():
        if value is not None:
            setattr(habit, key, value)
    await session.commit()
    return await get_habit(session, user_id, habit_id)


async def delete_habit(session: AsyncSession, user_id: UUID, habit_id: UUID) -> None:
    habit = await get_habit(session, user_id, habit_id)
    habit.archived_at = datetime.now(UTC)
    habit.active = False
    await session.commit()


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
