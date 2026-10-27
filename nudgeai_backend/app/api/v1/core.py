from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status

from app.api.deps import CurrentUser, SessionDep
from app.schemas.models import (
    HabitCreate,
    HabitResponse,
    HabitUpdate,
    OnboardingRequest,
    OnboardingResponse,
    PreferenceResponse,
    PreferenceUpdate,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    UserResponse,
)
from app.services import core_service
from app.services.core_service import Conflict, NotFound

router = APIRouter(tags=["core"])


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


@router.post("/habits", response_model=HabitResponse, status_code=status.HTTP_201_CREATED)
async def create_habit(
    payload: HabitCreate, user: CurrentUser, session: SessionDep
) -> HabitResponse:
    habit = await _http(core_service.create_habit, session, user.id, **payload.model_dump())
    return HabitResponse.model_validate(habit)


@router.get("/habits", response_model=list[HabitResponse])
async def list_habits(user: CurrentUser, session: SessionDep) -> list[HabitResponse]:
    habits = await core_service.list_habits(session, user.id)
    return [HabitResponse.model_validate(h) for h in habits]


@router.get("/habits/{habit_id}", response_model=HabitResponse)
async def get_habit(habit_id: UUID, user: CurrentUser, session: SessionDep) -> HabitResponse:
    habit = await _http(core_service.get_habit, session, user.id, habit_id)
    return HabitResponse.model_validate(habit)


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
    return HabitResponse.model_validate(habit)


@router.post("/habits/{habit_id}/complete", response_model=HabitResponse)
async def complete_habit(habit_id: UUID, user: CurrentUser, session: SessionDep) -> HabitResponse:
    habit = await _http(core_service.complete_habit, session, user.id, habit_id)
    return HabitResponse.model_validate(habit)


@router.post("/habits/{habit_id}/uncomplete", response_model=HabitResponse)
async def uncomplete_habit(habit_id: UUID, user: CurrentUser, session: SessionDep) -> HabitResponse:
    habit = await _http(core_service.uncomplete_habit, session, user.id, habit_id)
    return HabitResponse.model_validate(habit)


@router.delete("/habits/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_habit(habit_id: UUID, user: CurrentUser, session: SessionDep) -> Response:
    await _http(core_service.delete_habit, session, user.id, habit_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ==================================================================== tasks


@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, user: CurrentUser, session: SessionDep) -> TaskResponse:
    task = await _http(core_service.create_task, session, user.id, **payload.model_dump())
    return TaskResponse.model_validate(task)


@router.get("/tasks", response_model=list[TaskResponse])
async def list_tasks(
    user: CurrentUser, session: SessionDep, include_done: bool = False
) -> list[TaskResponse]:
    tasks = await core_service.list_tasks(session, user.id, include_done=include_done)
    return [TaskResponse.model_validate(t) for t in tasks]


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: UUID, user: CurrentUser, session: SessionDep) -> TaskResponse:
    task = await _http(core_service.get_task, session, user.id, task_id)
    return TaskResponse.model_validate(task)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID, payload: TaskUpdate, user: CurrentUser, session: SessionDep
) -> TaskResponse:
    task = await _http(
        core_service.update_task,
        session,
        user.id,
        task_id,
        **payload.model_dump(exclude_unset=True),
    )
    return TaskResponse.model_validate(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: UUID, user: CurrentUser, session: SessionDep) -> Response:
    await _http(core_service.delete_task, session, user.id, task_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
