"""The notification inbox, device registration, and push delivery of new nudges."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import Device, Nudge, Preference
from app.infra import push
from app.services.core_service import NotFound

log = logging.getLogger(__name__)

# Delivered, user-visible messages. Skipped/failed/scheduled rows are engine bookkeeping.
INBOX_STATUSES = ("sent", "snoozed")


def _inbox(user_id: UUID):  # type: ignore[no-untyped-def]
    return select(Nudge).where(
        Nudge.user_id == user_id,
        Nudge.status.in_(INBOX_STATUSES),
        Nudge.dismissed_at.is_(None),
    )


async def list_inbox(
    session: AsyncSession, user_id: UUID, *, unread_only: bool = False, limit: int = 50
) -> tuple[list[Nudge], int]:
    """Newest first, plus the unread count across the whole inbox (for the bell badge)."""
    stmt = _inbox(user_id).order_by(Nudge.sent_at.desc().nulls_last(), Nudge.created_at.desc())
    if unread_only:
        stmt = stmt.where(Nudge.read_at.is_(None))
    items = list(await session.scalars(stmt.limit(limit)))
    unread = await session.scalar(
        select(func.count())
        .select_from(Nudge)
        .where(
            Nudge.user_id == user_id,
            Nudge.status.in_(INBOX_STATUSES),
            Nudge.dismissed_at.is_(None),
            Nudge.read_at.is_(None),
        )
    )
    return items, int(unread or 0)


async def _one(
    session: AsyncSession, user_id: UUID, notification_id: UUID, *, dismissed: bool
) -> Nudge:
    stmt = select(Nudge).where(
        Nudge.id == notification_id,
        Nudge.user_id == user_id,
        Nudge.status.in_(INBOX_STATUSES),
    )
    stmt = stmt.where(
        Nudge.dismissed_at.is_not(None) if dismissed else Nudge.dismissed_at.is_(None)
    )
    row = await session.scalar(stmt)
    if row is None:
        raise NotFound("notification not found")
    return row


async def mark_read(session: AsyncSession, user_id: UUID, notification_id: UUID) -> Nudge:
    row = await _one(session, user_id, notification_id, dismissed=False)
    row.read_at = row.read_at or datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    return row


async def mark_all_read(session: AsyncSession, user_id: UUID) -> int:
    result = await session.execute(
        update(Nudge)
        .where(
            Nudge.user_id == user_id,
            Nudge.status.in_(INBOX_STATUSES),
            Nudge.dismissed_at.is_(None),
            Nudge.read_at.is_(None),
        )
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()
    return int(result.rowcount or 0)  # type: ignore[attr-defined]


async def dismiss(session: AsyncSession, user_id: UUID, notification_id: UUID) -> None:
    row = await _one(session, user_id, notification_id, dismissed=False)
    row.dismissed_at = datetime.now(UTC)
    await session.commit()


async def restore(session: AsyncSession, user_id: UUID, notification_id: UUID) -> Nudge:
    """Undo a dismiss (the mobile "Undo" toast)."""
    row = await _one(session, user_id, notification_id, dismissed=True)
    row.dismissed_at = None
    await session.commit()
    await session.refresh(row)
    return row


async def create_notification(
    session: AsyncSession,
    user_id: UUID,
    *,
    kind: str,
    title: str,
    body: str,
    habit_id: UUID | None = None,
    task_id: UUID | None = None,
    at: datetime | None = None,
) -> Nudge:
    """A delivered, non-engine message such as the welcome note or a weekly insight."""
    now = at or datetime.now(UTC)
    row = Nudge(
        user_id=user_id,
        habit_id=habit_id,
        task_id=task_id,
        scheduled_for=now,
        sent_at=now,
        status="sent",
        kind=kind,
        title=title,
        body=body,
    )
    session.add(row)
    await session.flush()
    return row


# ------------------------------------------------------------------------ devices


async def register_device(
    session: AsyncSession, user_id: UUID, *, token: str, platform: str
) -> Device:
    """Attach a push token to this user. A token seen before moves to the current user, so a
    shared phone sends to whoever signed in last, and a revived token is switched back on."""
    device = await session.scalar(select(Device).where(Device.token == token))
    now = datetime.now(UTC)
    if device is None:
        device = Device(user_id=user_id, token=token, platform=platform)
        session.add(device)
    else:
        device.user_id = user_id
        device.platform = platform
        device.disabled_at = None
        device.last_seen_at = now
    await session.commit()
    await session.refresh(device)
    return device


async def unregister_device(session: AsyncSession, user_id: UUID, *, token: str) -> None:
    """Forget a token (on sign-out). Only the owner can remove it; unknown tokens are a no-op."""
    device = await session.scalar(
        select(Device).where(Device.token == token, Device.user_id == user_id)
    )
    if device is not None:
        await session.delete(device)
        await session.commit()


# --------------------------------------------------------------------------- push


def _message(token: str, row: Nudge) -> dict[str, object]:
    return {
        "to": token,
        "title": row.title or "Nudge",
        "body": row.body or "",
        "sound": "default",
        "priority": "high" if row.kind in ("streak", "reminder") else "default",
        "channelId": "habit-reminders",
        "data": {
            "nudge_id": str(row.id),
            "kind": row.kind,
            "habit_id": str(row.habit_id) if row.habit_id else None,
            "task_id": str(row.task_id) if getattr(row, "task_id", None) else None,
        },
    }


async def deliver(session: AsyncSession, user_id: UUID, nudge_ids: list[UUID]) -> int:
    """Push the given delivered nudges to every live device of the user.

    Returns the number of messages accepted. Dead tokens (``DeviceNotRegistered``) are disabled so
    they're never tried again. Never raises: push is a courtesy on top of the inbox.
    """
    if not nudge_ids or not get_settings().push_delivery_enabled:
        return 0
    try:
        prefs = await session.scalar(select(Preference).where(Preference.user_id == user_id))
        if prefs is not None and not prefs.push_enabled:
            return 0  # the user turned push off: the inbox still gets the message
        rows = list(
            await session.scalars(
                select(Nudge).where(
                    Nudge.id.in_(nudge_ids), Nudge.user_id == user_id, Nudge.status == "sent"
                )
            )
        )
        devices = list(
            await session.scalars(
                select(Device).where(Device.user_id == user_id, Device.disabled_at.is_(None))
            )
        )
        if not rows or not devices:
            return 0
        pairs = [(device, _message(device.token, row)) for row in rows for device in devices]
        tickets = await push.send_expo([m for _, m in pairs])
        accepted = 0
        for (device, _), ticket in zip(pairs, tickets, strict=False):
            if ticket.get("status") == "ok":
                accepted += 1
            elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                device.disabled_at = datetime.now(UTC)
                log.info("disabled dead push token for user %s", user_id)
        await session.commit()
        return accepted
    except Exception:  # noqa: BLE001 - never fail the caller over a push
        log.exception("push delivery failed for user %s", user_id)
        return 0
