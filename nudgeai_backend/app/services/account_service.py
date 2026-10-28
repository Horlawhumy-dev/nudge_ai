"""Feedback intake and the "download my data" export."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ChatMessage,
    Conversation,
    Feedback,
    Habit,
    HabitCompletion,
    Nudge,
    Task,
    User,
)
from app.schemas.models import FeedbackCreate


async def add_feedback(session: AsyncSession, user: User, payload: FeedbackCreate) -> Feedback:
    row = Feedback(
        user_id=user.id,
        category=payload.category,
        message=payload.message,
        stars=payload.stars,
        app_version=payload.app_version,
        platform=payload.platform,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


def _iso(value: datetime | date | None) -> str | None:
    return value.isoformat() if value else None


async def export_data(session: AsyncSession, user: User) -> dict[str, Any]:
    """Everything the app holds about the user, as plain JSON (no secrets, no other users).

    Deliberately omits the password hash, refresh tokens and verification codes.
    """
    uid: UUID = user.id
    habits = list(await session.scalars(select(Habit).where(Habit.user_id == uid)))
    completions: dict[UUID, list[str]] = {}
    for hid, day in (
        await session.execute(
            select(HabitCompletion.habit_id, HabitCompletion.completed_on)
            .where(HabitCompletion.user_id == uid)
            .order_by(HabitCompletion.completed_on)
        )
    ).all():
        completions.setdefault(hid, []).append(day.isoformat())
    tasks = list(await session.scalars(select(Task).where(Task.user_id == uid)))
    convos = list(await session.scalars(select(Conversation).where(Conversation.user_id == uid)))
    messages: dict[UUID | None, list[ChatMessage]] = {}
    for m in await session.scalars(
        select(ChatMessage).where(ChatMessage.user_id == uid).order_by(ChatMessage.created_at)
    ):
        messages.setdefault(m.conversation_id, []).append(m)
    nudges = list(
        await session.scalars(
            select(Nudge).where(Nudge.user_id == uid, Nudge.status.in_(("sent", "snoozed")))
        )
    )
    prefs, onboarding = user.preferences, user.onboarding

    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "profile": {
            "email": user.email,
            "name": user.name,
            "timezone": user.timezone,
            "plan": user.plan,
            "created_at": _iso(user.created_at),
        },
        "onboarding": None
        if onboarding is None
        else {
            "wake_time": onboarding.wake_time,
            "sleep_time": onboarding.sleep_time,
            "goals": onboarding.goals,
            "nudge_style": onboarding.nudge_style,
            "tone": onboarding.tone,
        },
        "preferences": None
        if prefs is None
        else {
            c.key: getattr(prefs, c.key)
            for c in prefs.__table__.columns
            if c.key not in ("id", "user_id")
        },
        "habits": [
            {
                "name": h.name,
                "emoji": h.emoji,
                "category": h.category,
                "time_of_day": h.time_of_day,
                "frequency": h.frequency,
                "goal_days": h.goal_days,
                "archived": h.archived_at is not None,
                "created_at": _iso(h.created_at),
                "check_ins": completions.get(h.id, []),
            }
            for h in habits
        ],
        "tasks": [
            {
                "title": t.title,
                "notes": t.notes,
                "priority": t.priority,
                "date": _iso(t.date),
                "start_time": t.start_time,
                "end_time": t.end_time,
                "done_at": _iso(t.done_at),
                "deleted": t.deleted_at is not None,
            }
            for t in tasks
        ],
        "conversations": [
            {
                "title": c.title,
                "created_at": _iso(c.created_at),
                "messages": [
                    {
                        "role": m.role,
                        "content": m.content,
                        "via": m.via,
                        "at": _iso(m.created_at),
                    }
                    for m in messages.get(c.id, [])
                ],
            }
            for c in convos
        ],
        "notifications": [
            {"kind": n.kind, "title": n.title, "body": n.body, "sent_at": _iso(n.sent_at)}
            for n in nudges
        ],
    }
