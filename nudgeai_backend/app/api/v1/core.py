from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.api.deps import CurrentUser, SessionDep
from app.core.config import get_settings
from app.db.models import Habit, OnboardingProfile, Task
from app.schemas.models import (
    AppFeedbackResponse,
    CheckinRequest,
    CompletionsResponse,
    FeedbackCreate,
    HabitCreate,
    HabitResponse,
    HabitUpdate,
    OnboardingPatch,
    OnboardingRequest,
    OnboardingResponse,
    OverallStreakResponse,
    PreferenceResponse,
    PreferenceUpdate,
    ProfileUpdate,
    SubscriptionResponse,
    SubscriptionUpdate,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    UserResponse,
)
from app.services import account_service, core_service, media_service, plan_service
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
    except plan_service.PlanLimitReached as exc:
        # 402: the request is fine, the plan is the problem. Clients show the upgrade prompt.
        raise HTTPException(status_code=402, detail=str(exc)) from exc


# ================================================================== profile


@router.get("/profile", response_model=UserResponse)
async def get_profile(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    payload: ProfileUpdate, user: CurrentUser, session: SessionDep
) -> UserResponse:
    """Edit the display name or time zone. Email changes go through /auth/change-email."""
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    for key, value in changes.items():
        setattr(user, key, value)
    if "timezone" in changes and user.preferences is not None:
        user.preferences.timezone = changes["timezone"]  # the engine reads this one
    await session.commit()
    await session.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/profile/avatar", response_model=UserResponse)
async def upload_avatar(request: Request, user: CurrentUser, session: SessionDep) -> UserResponse:
    """Set the profile photo. Send the raw PNG/JPEG/WebP bytes as the request body."""
    try:
        url = await media_service.store_avatar(user.id, request.stream())
    except media_service.UploadError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from exc
    previous = user.avatar_url
    user.avatar_url = url
    await session.commit()
    media_service.remove_avatar_file(previous)
    await session.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/profile/avatar", response_model=UserResponse)
async def remove_avatar(user: CurrentUser, session: SessionDep) -> UserResponse:
    previous = user.avatar_url
    user.avatar_url = None
    await session.commit()
    media_service.remove_avatar_file(previous)
    await session.refresh(user)
    return UserResponse.model_validate(user)


async def _onboarding(user: CurrentUser, session: SessionDep) -> OnboardingProfile:
    profile = user.onboarding
    if profile is None:
        profile = OnboardingProfile(user_id=user.id)
        session.add(profile)
    return profile


def _onboarding_out(profile: OnboardingProfile, user: CurrentUser) -> OnboardingResponse:
    """The name is the account's, not a column on the profile."""
    return OnboardingResponse(
        name=user.name,
        wake_time=profile.wake_time,
        sleep_time=profile.sleep_time,
        goals=profile.goals,
        nudge_style=profile.nudge_style,
        tone=profile.tone,
        completed=profile.completed,
    )


def _sync_tone(user: CurrentUser, style: str | None) -> None:
    """The tone picked in setup is also the live "AI voice & tone" setting."""
    if style in ("gentle", "firm", "mix") and user.preferences is not None:
        user.preferences.reminder_tone = style


@router.put("/onboarding", response_model=OnboardingResponse)
async def put_onboarding(
    payload: OnboardingRequest, user: CurrentUser, session: SessionDep
) -> OnboardingResponse:
    """Replace the onboarding answers (fields left out reset to their defaults)."""
    profile = await _onboarding(user, session)
    for key, value in payload.model_dump(exclude={"name"}).items():
        setattr(profile, key, value)
    if payload.name:
        user.name = payload.name
    _sync_tone(user, payload.nudge_style)
    await session.commit()
    await session.refresh(profile)
    return _onboarding_out(profile, user)


@router.patch("/onboarding", response_model=OnboardingResponse)
async def patch_onboarding(
    payload: OnboardingPatch, user: CurrentUser, session: SessionDep
) -> OnboardingResponse:
    """Change only the onboarding answers that were sent."""
    profile = await _onboarding(user, session)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if key == "name" or (value is None and key in ("goals", "completed")):
            continue  # the name lives on the user; these columns can't be NULL
        setattr(profile, key, value)
    if changes.get("name"):
        user.name = changes["name"]
    _sync_tone(user, changes.get("nudge_style"))
    await session.commit()
    await session.refresh(profile)
    return _onboarding_out(profile, user)


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


@router.patch("/preferences", response_model=PreferenceResponse)
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
    await _http(plan_service.check_can_add_habit, session, user)
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
    await _http(plan_service.check_can_add_habit, session, user)
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
    zone = core_service.user_zone(user)
    day = payload.date or (
        payload.due_at.astimezone(zone).date() if payload.due_at else core_service.local_today(user)
    )
    await _http(plan_service.check_can_add_task, session, user, day)
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
    task = await _http(core_service.set_task_done, session, user, task_id, done=True)
    return _task_out(task, datetime.now(UTC))


@router.post("/tasks/{task_id}/uncomplete", response_model=TaskResponse)
async def uncomplete_task(task_id: UUID, user: CurrentUser, session: SessionDep) -> TaskResponse:
    task = await _http(core_service.set_task_done, session, user, task_id, done=False)
    return _task_out(task, datetime.now(UTC))


@router.post("/tasks/{task_id}/restore", response_model=TaskResponse)
async def restore_task(task_id: UUID, user: CurrentUser, session: SessionDep) -> TaskResponse:
    """Undo a delete (the mobile "Undo" toast)."""
    existing = await session.get(Task, task_id)
    if existing is not None and existing.user_id == user.id and existing.date is not None:
        await _http(plan_service.check_can_add_task, session, user, existing.date)
    task = await _http(core_service.restore_task, session, user.id, task_id)
    return _task_out(task, datetime.now(UTC))


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    user: CurrentUser,
    session: SessionDep,
    series: bool = Query(
        default=False, description="Also delete later occurrences and stop the repeat."
    ),
) -> Response:
    await _http(core_service.delete_task, session, user.id, task_id, whole_series=series)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ============================================================== subscription


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(user: CurrentUser, session: SessionDep) -> SubscriptionResponse:
    """The current plan, what it allows, and how much of that is used."""
    return await plan_service.current(session, user, today=core_service.local_today(user))


@router.put("/subscription", response_model=SubscriptionResponse)
async def put_subscription(
    payload: SubscriptionUpdate, user: CurrentUser, session: SessionDep
) -> SubscriptionResponse:
    """Switch plan. There's no billing provider yet, so this is a stub gated by
    BILLING_STUB_ENABLED; with it off the endpoint is not implemented."""
    if not get_settings().billing_stub_enabled:
        raise HTTPException(status_code=501, detail="plan changes need the billing provider")
    await plan_service.switch(session, user, plan=payload.plan, period=payload.period)
    return await plan_service.current(session, user, today=core_service.local_today(user))


# ========================================================= feedback and export


@router.post("/feedback", response_model=AppFeedbackResponse, status_code=status.HTTP_201_CREATED)
async def send_feedback(
    payload: FeedbackCreate, user: CurrentUser, session: SessionDep
) -> AppFeedbackResponse:
    """Settings -> Send feedback, and the star rating from Rate Nudge."""
    row = await account_service.add_feedback(session, user, payload)
    return AppFeedbackResponse(id=row.id, message="thanks, your feedback helps shape Nudge")


@router.get("/account/export")
async def export_account(user: CurrentUser, session: SessionDep) -> Response:
    """Download everything the app holds about you ("Download my data")."""
    import json

    data = await account_service.export_data(session, user)
    return Response(
        content=json.dumps(data, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="nudge-data.json"'},
    )
