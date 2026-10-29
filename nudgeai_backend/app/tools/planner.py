"""Habit and task tools for the assistant.

Reads (`tasks_list`, `habits_list`) run immediately. Everything that changes data
(`task_create`, `task_update`, `task_complete`, `habit_create`, `habit_complete`) is ``mutating``:
the executor turns it into a proposal and nothing is written until the user confirms. On confirm
these tools call the same services the REST endpoints use, so plan limits, validation and
time-zone handling are identical whether the user taps or talks.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.db.models import Habit, Task, User
from app.schemas.models import HabitCreate, TaskCreate
from app.services import core_service, plan_service
from app.tools.base import ToolError

log = logging.getLogger(__name__)

_PRIORITIES = ["high", "medium", "low"]
_TIME = {"type": "string", "description": "24-hour HH:MM, e.g. 14:30"}
_DAY = {"type": "string", "description": "Local date, YYYY-MM-DD"}
_MAX_LIST = 30


async def _user(session: Any, user_id: UUID) -> User:
    user: User | None = await session.scalar(
        select(User)
        .options(selectinload(User.preferences), selectinload(User.onboarding))
        .where(User.id == user_id)
    )
    if user is None:
        raise ToolError("account not found")
    return user


def _uuid(value: Any, field: str) -> UUID:
    try:
        return UUID(str(value))
    except ValueError as exc:
        raise ToolError(f"{field} must be an id taken from tasks_list/habits_list") from exc


def _day(value: Any, field: str) -> date:
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise ToolError(f"{field} must be an ISO date (YYYY-MM-DD)") from exc


def _validation(exc: ValidationError) -> ToolError:
    first = exc.errors()[0]
    where = ".".join(str(p) for p in first["loc"])
    return ToolError(f"{where}: {first['msg']}")


def _task_view(task: Task, now: Any) -> dict[str, Any]:
    return {
        "id": str(task.id),
        "title": task.title,
        "date": task.date.isoformat() if task.date else None,
        "start_time": task.start_time,
        "end_time": task.end_time,
        "priority": task.priority,
        "status": core_service.task_status(task, now),
    }


# ------------------------------------------------------------------------- reads


class TasksListTool:
    name = "tasks_list"
    description = (
        "List the user's tasks with their ids, dates and status. Read-only. Call this before "
        "changing or completing a task so you use a real task id."
    )
    mutating = False

    def json_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["all", "upcoming", "overdue", "completed"]},
                "date_from": _DAY,
                "date_to": _DAY,
            },
            "required": [],
            "additionalProperties": False,
        }

    async def run(self, user_id: UUID, args: dict[str, Any], session: Any) -> dict[str, Any]:
        from datetime import UTC, datetime

        now = datetime.now(UTC)
        try:
            tasks = await core_service.list_tasks(
                session,
                user_id,
                status=args.get("status") or "upcoming",
                date_from=_day(args["date_from"], "date_from") if args.get("date_from") else None,
                date_to=_day(args["date_to"], "date_to") if args.get("date_to") else None,
                now=now,
            )
        except core_service.Invalid as exc:
            raise ToolError(str(exc)) from exc
        shown = tasks[:_MAX_LIST]
        return {
            "tasks": [_task_view(t, now) for t in shown],
            "count": len(tasks),
            "truncated": len(tasks) > len(shown),
        }


class HabitsListTool:
    name = "habits_list"
    description = (
        "List the user's habits with ids, cadence, today's status and streak. Read-only. Call this "
        "before completing a habit so you use a real habit id."
    )
    mutating = False

    def json_schema(self) -> dict[str, Any]:
        return {"type": "object", "properties": {}, "required": [], "additionalProperties": False}

    async def run(self, user_id: UUID, args: dict[str, Any], session: Any) -> dict[str, Any]:
        user = await _user(session, user_id)
        habits = await core_service.list_habits(session, user_id)
        progress = await core_service.habit_progress(
            session, habits, today=core_service.local_today(user)
        )
        return {
            "habits": [
                {
                    "id": str(h.id),
                    "name": h.name,
                    "emoji": h.emoji,
                    "time_of_day": h.time_of_day,
                    "frequency": h.frequency,
                    "done_today": progress.get(h.id, (False, 0))[0],
                    "streak": h.streak.current if h.streak else 0,
                }
                for h in habits
            ],
            "count": len(habits),
        }


# ----------------------------------------------------------------------- changes


class TaskCreateTool:
    name = "task_create"
    description = (
        "Add a task for the user. Only call this once the user has said the day and the time (or "
        "that it is all day); omit start_time only for an all-day task. The user confirms before "
        "it is created."
    )
    mutating = True

    def json_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "title": {"type": "string", "maxLength": 320},
                "date": _DAY,
                "start_time": _TIME,
                "end_time": _TIME,
                "priority": {"type": "string", "enum": _PRIORITIES},
                "notes": {"type": "string"},
                "repeat_rule": {"type": "string", "enum": ["daily", "weekdays", "weekly"]},
            },
            "required": ["title"],
            "additionalProperties": False,
        }

    async def describe(self, user_id: UUID, args: dict[str, Any], session: Any) -> str:
        when = f" at {args['start_time']}" if args.get("start_time") else ""
        on = f" on {args['date']}" if args.get("date") else ""
        lead = get_settings().task_reminder_lead_minutes
        # Only a task with a start time gets a reminder, so only then does the card promise one.
        reminder = f" (reminder {lead} min before)" if args.get("start_time") else ""
        return f"Add task: {str(args.get('title', '')).strip()[:100]}{on}{when}{reminder}"

    async def run(self, user_id: UUID, args: dict[str, Any], session: Any) -> dict[str, Any]:
        try:
            payload = TaskCreate(**args)
        except (ValidationError, TypeError) as exc:
            raise (
                _validation(exc) if isinstance(exc, ValidationError) else ToolError(str(exc))
            ) from exc
        user = await _user(session, user_id)
        day = payload.date or core_service.local_today(user)
        try:
            await plan_service.check_can_add_task(session, user, day)
            task = await core_service.create_task(session, user, **payload.model_dump())
        except plan_service.PlanLimitReached as exc:
            raise ToolError(str(exc)) from exc
        except core_service.Invalid as exc:
            raise ToolError(str(exc)) from exc
        return {"task_id": str(task.id), "title": task.title, "date": day.isoformat()}


class TaskUpdateTool:
    name = "task_update"
    description = (
        "Change an existing task: rename it, move it to another day or time, or change its "
        "priority or notes. Use this to reschedule. Needs the task_id from tasks_list. The user "
        "confirms before anything changes."
    )
    mutating = True

    def json_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "title": {"type": "string", "maxLength": 320},
                "date": _DAY,
                "start_time": _TIME,
                "end_time": _TIME,
                "priority": {"type": "string", "enum": _PRIORITIES},
                "notes": {"type": "string"},
            },
            "required": ["task_id"],
            "additionalProperties": False,
        }

    async def describe(self, user_id: UUID, args: dict[str, Any], session: Any) -> str:
        title = await _task_title(session, user_id, args.get("task_id"))
        moves = [
            f"{k.replace('_', ' ')} {args[k]}"
            for k in ("date", "start_time", "end_time")
            if args.get(k)
        ]
        change = ", ".join(moves) if moves else "update details"
        return f"Change “{title}”: {change}"

    async def run(self, user_id: UUID, args: dict[str, Any], session: Any) -> dict[str, Any]:
        args = dict(args)
        task_id = _uuid(args.pop("task_id", None), "task_id")
        if not args:
            raise ToolError("nothing to change: give at least one field to update")
        if "date" in args:
            args["date"] = _day(args["date"], "date")
        user = await _user(session, user_id)
        try:
            task = await core_service.update_task(session, user, task_id, **args)
        except core_service.NotFound as exc:
            raise ToolError("no such task; call tasks_list for valid ids") from exc
        except core_service.Invalid as exc:
            raise ToolError(str(exc)) from exc
        return {"task_id": str(task.id), "title": task.title, "date": str(task.date)}


class TaskCompleteTool:
    name = "task_complete"
    description = (
        "Mark a task done (or not done with done=false). Needs the task_id from tasks_list. The "
        "user confirms first."
    )
    mutating = True

    def json_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {"task_id": {"type": "string"}, "done": {"type": "boolean"}},
            "required": ["task_id"],
            "additionalProperties": False,
        }

    async def describe(self, user_id: UUID, args: dict[str, Any], session: Any) -> str:
        title = await _task_title(session, user_id, args.get("task_id"))
        verb = "Mark done" if args.get("done", True) else "Mark not done"
        return f"{verb}: {title}"

    async def run(self, user_id: UUID, args: dict[str, Any], session: Any) -> dict[str, Any]:
        task_id = _uuid(args.get("task_id"), "task_id")
        user = await _user(session, user_id)
        try:
            task = await core_service.set_task_done(
                session, user, task_id, done=bool(args.get("done", True))
            )
        except core_service.NotFound as exc:
            raise ToolError("no such task; call tasks_list for valid ids") from exc
        return {"task_id": str(task.id), "done": task.done_at is not None}


class HabitCreateTool:
    name = "habit_create"
    description = (
        "Create a habit once the user has said when and how often. time_of_day is morning, "
        "afternoon or evening; frequency is daily, weekdays or weekly. The user confirms before "
        "it is created."
    )
    mutating = True

    def json_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "name": {"type": "string", "maxLength": 160},
                "emoji": {"type": "string", "maxLength": 16},
                "category": {"type": "string", "maxLength": 40},
                "time_of_day": {"type": "string", "enum": ["morning", "afternoon", "evening"]},
                "frequency": {"type": "string", "enum": ["daily", "weekdays", "weekly"]},
            },
            "required": ["name"],
            "additionalProperties": False,
        }

    async def describe(self, user_id: UUID, args: dict[str, Any], session: Any) -> str:
        when = f" ({args['time_of_day']})" if args.get("time_of_day") else ""
        return f"Add habit: {str(args.get('name', '')).strip()[:100]}{when}"

    async def run(self, user_id: UUID, args: dict[str, Any], session: Any) -> dict[str, Any]:
        try:
            payload = HabitCreate(**args)
        except (ValidationError, TypeError) as exc:
            raise (
                _validation(exc) if isinstance(exc, ValidationError) else ToolError(str(exc))
            ) from exc
        user = await _user(session, user_id)
        try:
            await plan_service.check_can_add_habit(session, user)
            habit = await core_service.create_habit(session, user_id, **payload.model_dump())
        except plan_service.PlanLimitReached as exc:
            raise ToolError(str(exc)) from exc
        except (core_service.Invalid, core_service.NotFound) as exc:
            raise ToolError(str(exc)) from exc
        return {"habit_id": str(habit.id), "name": habit.name}


class HabitCompleteTool:
    name = "habit_complete"
    description = (
        "Check a habit in for today, or for a past day with `on` (YYYY-MM-DD). Needs the habit_id "
        "from habits_list. The user confirms first."
    )
    mutating = True

    def json_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {"habit_id": {"type": "string"}, "on": _DAY},
            "required": ["habit_id"],
            "additionalProperties": False,
        }

    async def describe(self, user_id: UUID, args: dict[str, Any], session: Any) -> str:
        habit = await _habit_name(session, user_id, args.get("habit_id"))
        when = f" for {args['on']}" if args.get("on") else " for today"
        return f"Check in: {habit}{when}"

    async def run(self, user_id: UUID, args: dict[str, Any], session: Any) -> dict[str, Any]:
        habit_id = _uuid(args.get("habit_id"), "habit_id")
        user = await _user(session, user_id)
        today = core_service.local_today(user)
        try:
            day = core_service.check_checkin_day(
                _day(args["on"], "on") if args.get("on") else today, today=today
            )
            habit = await core_service.complete_habit(
                session, user_id, habit_id, on=day, today=today
            )
        except core_service.NotFound as exc:
            raise ToolError("no such habit; call habits_list for valid ids") from exc
        except core_service.Invalid as exc:
            raise ToolError(str(exc)) from exc
        return {
            "habit_id": str(habit.id),
            "day": day.isoformat(),
            "streak": habit.streak.current if habit.streak else 0,
        }


# ------------------------------------------------------------------------ helpers


async def _task_title(session: Any, user_id: UUID, task_id: Any) -> str:
    try:
        task = await session.scalar(
            select(Task).where(Task.id == UUID(str(task_id)), Task.user_id == user_id)
        )
    except ValueError:
        return "a task"
    return task.title if task else "a task"


async def _habit_name(session: Any, user_id: UUID, habit_id: Any) -> str:
    try:
        habit = await session.scalar(
            select(Habit).where(Habit.id == UUID(str(habit_id)), Habit.user_id == user_id)
        )
    except ValueError:
        return "a habit"
    return habit.name if habit else "a habit"


def default_tools() -> list[type[Any]]:
    return [
        TasksListTool,
        HabitsListTool,
        TaskCreateTool,
        TaskUpdateTool,
        TaskCompleteTool,
        HabitCreateTool,
        HabitCompleteTool,
    ]
