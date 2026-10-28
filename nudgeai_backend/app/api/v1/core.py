from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.api.deps import CurrentUser, SessionDep
from app.db.models import Habit, Task
from app.schemas.models import (
    CheckinRequest,
    CompletionsResponse,
    HabitCreate,
    HabitResponse,
    HabitUpdate,
    OnboardingRequest,
    OnboardingResponse,
    OverallStreakResponse,
    PreferenceResponse,
    PreferenceUpdate,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    UserResponse,
)
from app.services import core_service
from app.services.core_service import Conflict, Invalid, NotFound

router = APIRouter(tags=["core"])


async def _http_sync[T](fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Like _http for plain functions that raise service errors."""
    try:
        return fn(*args, **kwargs)
    except Invalid as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


async def _http[T](fn: Callable[..., Awaitable[T]], *args: Any, **kwargs: Any) -> T:
    """Adapt service-level NotFound/Conflict to HTTP status codes.

    The await must sit inside the try: these service functions are coroutines,
    so they raise when awaited, not when called.
    """
    try:
        return await fn(*args, **kwargs)
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Conflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Invalid as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ================================================================== profile


@router.get("/profile", response_model=UserResponse)
async def get_profile(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)


@router.put("/onboarding", response_model=OnboardingResponse)
async def put_onboarding(
    payload: OnboardingRequest, user: CurrentUser, session: SessionDep
) -> OnboardingResponse:
    profile = user.onboarding
    if profile is None:
        from app.db.models import OnboardingProfile

        profile = OnboardingProfile(user_id=user.id)
        session.add(profile)
    for key, value in payload.model_dump().items():
        setattr(profile, key, value)
    if payload.name:
        user.name = payload.name
    await session.commit()
    await session.refresh(profile)
    return OnboardingResponse.model_validate(profile)


@router.get("/preferences", response_model=PreferenceResponse)
async def get_preferences(user: CurrentUser, session: SessionDep) -> PreferenceResponse:
    from app.db.models import Preference

    prefs = user.preferences
    if prefs is None:
        prefs = Preference(user_id=user.id, timezone=user.timezone)
        session.add(prefs)
        await session.commit()
        await session.refresh(prefs)
    return PreferenceResponse.model_validate(prefs)


@router.put("/preferences", response_model=PreferenceResponse)
async def put_preferences(
    payload: PreferenceUpdate, user: CurrentUser, session: SessionDep
) -> PreferenceResponse:
    from app.db.models import Preference

    prefs = user.preferences
    if prefs is None:
        prefs = Preference(user_id=user.id, timezone=user.timezone)
        session.add(prefs)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(prefs, key, value)
    await session.commit()
    await session.refresh(prefs)
    return PreferenceResponse.model_validate(prefs)


# =================================================================== habits

MAX_RANGE_DAYS = 366


async def _habit_out(
    session: SessionDep, user: CurrentUser, habits: list[Habit]
) -> list[HabitResponse]:
    """Responses with the per-day fields filled in for the user's local today."""
    progress = await core_service.habit_progress(
        session, habits, today=core_service.local_today(user)
    )
    out: list[HabitResponse] = []
    for habit in habits:
        resp = HabitResponse.model_validate(habit)
        resp.done_today, resp.done_last_7d = progress.get(habit.id, (False, 0))
        out.append(resp)
    return out


async def _one(session: SessionDep, user: CurrentUser, habit: Habit) -> HabitResponse:
    return (await _habit_out(session, user, [habit]))[0]


def _range(start: date | None, end: date | None, *, today: date) -> tuple[date, date]:
    end = end or today
    start = start or end - timedelta(days=89)
    if start > end:
        raise HTTPException(status_code=422, detail="'from' must not be after 'to'")
    if (end - start).days >= MAX_RANGE_DAYS:
        raise HTTPException(status_code=422, detail=f"range is limited to {MAX_RANGE_DAYS} days")
    return start, end


@router.post("/habits", response_model=HabitResponse, status_code=status.HTTP_201_CREATED)
async def create_habit(
    payload: HabitCreate, user: CurrentUser, session: SessionDep
) -> HabitResponse:
    habit = await _http(core_service.create_habit, session, user.id, **payload.model_dump())
    return await _one(session, user, habit)


@router.get("/habits", response_model=list[HabitResponse])
async def list_habits(user: CurrentUser, session: SessionDep) -> list[HabitResponse]:
    return await _habit_out(session, user, await core_service.list_habits(session, user.id))


@router.get("/habits/completions", response_model=CompletionsResponse)
async def all_completions(
    user: CurrentUser,
    session: SessionDep,
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
) -> CompletionsResponse:
    """Check-in dates for every active habit in a range (default: the last 90 days)."""
    first, last = _range(start, end, today=core_service.local_today(user))
    days = await core_service.completion_days(session, user.id, start=first, end=last)
    return CompletionsResponse(start=first, end=last, days=days)


@router.get("/habits/{habit_id}", response_model=HabitResponse)
async def get_habit(habit_id: UUID, user: CurrentUser, session: SessionDep) -> HabitResponse:
    habit = await _http(core_service.get_habit, session, user.id, habit_id)
    return await _one(session, user, habit)


@router.get("/habits/{habit_id}/completions", response_model=CompletionsResponse)
async def habit_completions(
    habit_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
) -> CompletionsResponse:
    await _http(core_service.get_habit, session, user.id, habit_id)
    first, last = _range(start, end, today=core_service.local_today(user))
    days = await core_service.completion_days(
        session, user.id, start=first, end=last, habit_id=habit_id
    )
    return CompletionsResponse(start=first, end=last, days={habit_id: days.get(habit_id, [])})


@router.patch("/habits/{habit_id}", response_model=HabitResponse)
async def update_habit(
    habit_id: UUID, payload: HabitUpdate, user: CurrentUser, session: SessionDep
) -> HabitResponse:
    habit = await _http(
        core_service.update_habit,
        session,
        user.id,
        habit_id,
        **payload.model_dump(exclude_unset=True),
    )
    return await _one(session, user, habit)


@router.post("/habits/{habit_id}/complete", response_model=HabitResponse)
async def complete_habit(
    habit_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    payload: CheckinRequest | None = None,
) -> HabitResponse:
    """Check a habit in for ``on`` (default: today where the user is). Idempotent."""
    today = core_service.local_today(user)
    day = await _http_sync(
        core_service.check_checkin_day, (payload and payload.on) or today, today=today
    )
    habit = await _http(
        core_service.complete_habit, session, user.id, habit_id, on=day, today=today
    )
    return await _one(session, user, habit)


@router.post("/habits/{habit_id}/uncomplete", response_model=HabitResponse)
async def uncomplete_habit(
    habit_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    payload: CheckinRequest | None = None,
) -> HabitResponse:
    today = core_service.local_today(user)
    day = await _http_sync(
        core_service.check_checkin_day, (payload and payload.on) or today, today=today
    )
    habit = await _http(
        core_service.uncomplete_habit, session, user.id, habit_id, on=day, today=today
    )
    return await _one(session, user, habit)


@router.post("/habits/{habit_id}/restore", response_model=HabitResponse)
async def restore_habit(habit_id: UUID, user: CurrentUser, session: SessionDep) -> HabitResponse:
    """Undo a delete (the mobile "Undo" toast)."""
    habit = await _http(core_service.restore_habit, session, user.id, habit_id)
    return await _one(session, user, habit)


@router.delete("/habits/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_habit(habit_id: UUID, user: CurrentUser, session: SessionDep) -> Response:
    await _http(core_service.delete_habit, session, user.id, habit_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/streak", response_model=OverallStreakResponse)
async def overall_streak(user: CurrentUser, session: SessionDep) -> OverallStreakResponse:
    """Consecutive days with at least one check-in (the flame on Home)."""
    current, best, active_today, last = await core_service.overall_streak(
        session, user.id, today=core_service.local_today(user)
    )
    return OverallStreakResponse(
        current=current, best=best, active_today=active_today, last_active_on=last
    )


# ==================================================================== tasks


def _task_out(task: Task, now: datetime) -> TaskResponse:
    resp = TaskResponse.model_validate(task)
    resp.all_day = task.start_time is None
    resp.done = task.done_at is not None
    resp.status = core_service.task_status(task, now)  # type: ignore[assignment]
    return resp


@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, user: CurrentUser, session: SessionDep) -> TaskResponse:
    task = await _http(core_service.create_task, session, user, **payload.model_dump())
    return _task_out(task, datetime.now(UTC))


@router.get("/tasks", response_model=list[TaskResponse])
async def list_tasks(
    user: CurrentUser,
    session: SessionDep,
    include_done: bool = False,
    status: str | None = Query(
        default=None,
        description="all | upcoming | overdue | completed. Omit to hide completed tasks.",
    ),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
) -> list[TaskResponse]:
    now = datetime.now(UTC)
    tasks = await _http(
        core_service.list_tasks,
        session,
        user.id,
        include_done=include_done,
        status=status,
        date_from=date_from,
        date_to=date_to,
        now=now,
    )
    return [_task_out(t, now) for t in tasks]


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: UUID, user: CurrentUser, session: SessionDep) -> TaskResponse:
    task = await _http(core_service.get_task, session, user.id, task_id)
    return _task_out(task, datetime.now(UTC))


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID, payload: TaskUpdate, user: CurrentUser, session: SessionDep
) -> TaskResponse:
    task = await _http(
        core_service.update_task,
        session,
        user,
        task_id,
        **payload.model_dump(exclude_unset=True),
    )
    return _task_out(task, datetime.now(UTC))


@router.post("/tasks/{task_id}/complete", response_model=TaskResponse)
async def complete_task(task_id: UUID, user: CurrentUser, session: SessionDep) -> TaskResponse:
    task = await _http(core_service.set_task_done, session, user.id, task_id, done=True)
    return _task_out(task, datetime.now(UTC))


@router.post("/tasks/{task_id}/uncomplete", response_model=TaskResponse)
async def uncomplete_task(task_id: UUID, user: CurrentUser, session: SessionDep) -> TaskResponse:
    task = await _http(core_service.set_task_done, session, user.id, task_id, done=False)
    return _task_out(task, datetime.now(UTC))


@router.post("/tasks/{task_id}/restore", response_model=TaskResponse)
async def restore_task(task_id: UUID, user: CurrentUser, session: SessionDep) -> TaskResponse:
    """Undo a delete (the mobile "Undo" toast)."""
    task = await _http(core_service.restore_task, session, user.id, task_id)
    return _task_out(task, datetime.now(UTC))


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: UUID, user: CurrentUser, session: SessionDep) -> Response:
    await _http(core_service.delete_task, session, user.id, task_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
