"""The notification inbox (the bell) and push device registration."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.api.deps import CurrentUser, SessionDep
from app.db.models import Nudge
from app.schemas.models import (
    DeviceRegister,
    DeviceResponse,
    InboxResponse,
    MessageResponse,
    NotificationResponse,
)
from app.services import notification_service
from app.services.core_service import NotFound

router = APIRouter(tags=["notifications"])


async def _http[T](fn: Callable[..., Awaitable[T]], *args: Any, **kwargs: Any) -> T:
    try:
        return await fn(*args, **kwargs)
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _out(row: Nudge) -> NotificationResponse:
    return NotificationResponse(
        id=row.id,
        kind=row.kind,
        title=row.title or "Nudge",
        body=row.body or "",
        habit_id=row.habit_id,
        read=row.read_at is not None,
        created_at=row.sent_at or row.created_at,
    )


@router.get("/notifications", response_model=InboxResponse)
async def inbox(
    user: CurrentUser,
    session: SessionDep,
    unread: bool = Query(default=False, description="Only unread messages."),
    limit: int = Query(default=50, ge=1, le=200),
) -> InboxResponse:
    """Delivered nudges, summaries and alerts, newest first, with the unread count."""
    rows, unread_count = await notification_service.list_inbox(
        session, user.id, unread_only=unread, limit=limit
    )
    return InboxResponse(items=[_out(r) for r in rows], unread_count=unread_count)


@router.post("/notifications/read-all", response_model=MessageResponse)
async def read_all(user: CurrentUser, session: SessionDep) -> MessageResponse:
    count = await notification_service.mark_all_read(session, user.id)
    return MessageResponse(message=f"marked {count} as read")


@router.post("/notifications/{notification_id}/read", response_model=NotificationResponse)
async def read_one(
    notification_id: UUID, user: CurrentUser, session: SessionDep
) -> NotificationResponse:
    row = await _http(notification_service.mark_read, session, user.id, notification_id)
    return _out(row)


@router.post("/notifications/{notification_id}/restore", response_model=NotificationResponse)
async def restore_one(
    notification_id: UUID, user: CurrentUser, session: SessionDep
) -> NotificationResponse:
    row = await _http(notification_service.restore, session, user.id, notification_id)
    return _out(row)


@router.delete("/notifications/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_one(notification_id: UUID, user: CurrentUser, session: SessionDep) -> Response:
    await _http(notification_service.dismiss, session, user.id, notification_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------- devices


@router.post("/devices", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
async def register_device(
    payload: DeviceRegister, user: CurrentUser, session: SessionDep
) -> DeviceResponse:
    """Register this phone's Expo push token. Safe to call on every launch."""
    device = await notification_service.register_device(
        session, user.id, token=payload.token, platform=payload.platform
    )
    return DeviceResponse.model_validate(device)


@router.delete("/devices", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_device(
    user: CurrentUser, session: SessionDep, token: str = Query(min_length=10, max_length=255)
) -> Response:
    """Stop pushing to this phone (call on sign-out)."""
    await notification_service.unregister_device(session, user.id, token=token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
