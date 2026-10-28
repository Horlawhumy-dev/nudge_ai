"""Inbox, device registration and push delivery."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Device, Nudge, User
from app.engine.worker import evaluate_user
from app.models.client import FakeClient
from app.services import notification_service

API = "/api/v1"
Headers = dict[str, str]
TOKEN = "ExponentPushToken[abc123def456]"


async def _uid(session: AsyncSession, email: str = "chat1@example.com") -> UUID:
    user = await session.scalar(select(User).where(User.email == email))
    assert user is not None
    return user.id


async def _seed(session: AsyncSession, uid: UUID, **kw: Any) -> Nudge:
    row = await notification_service.create_notification(
        session,
        uid,
        kind=kw.pop("kind", "nudge"),
        title=kw.pop("title", "Deep work"),
        body=kw.pop("body", "Time to focus."),
    )
    await session.commit()
    return row


@pytest.fixture
def pushed(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Capture Expo messages; every message gets an ok ticket unless a test overrides it."""
    sent: list[dict[str, Any]] = []

    async def fake_send(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        sent.extend(messages)
        return [{"status": "ok", "id": f"t{i}"} for i, _ in enumerate(messages)]

    monkeypatch.setattr("app.infra.push.send_expo", fake_send)
    return sent


# ------------------------------------------------------------------------- inbox


async def test_welcome_message_appears_when_the_email_is_verified(
    client: AsyncClient, auth_headers: Headers
) -> None:
    inbox = (await client.get(f"{API}/notifications", headers=auth_headers)).json()
    assert inbox["unread_count"] == 1
    (welcome,) = inbox["items"]
    assert welcome["kind"] == "system" and welcome["title"] == "Welcome to Nudge"
    assert welcome["read"] is False
    # ...but it is not a nudge: the engine's own views never see it
    assert (await client.get(f"{API}/nudges", headers=auth_headers)).json() == []
    overview = (await client.get(f"{API}/analytics/overview", headers=auth_headers)).json()
    assert overview["nudges_sent_7d"] == 0


async def test_read_one_read_all_and_unread_filter(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    uid = await _uid(session)
    a = await _seed(session, uid, title="A", kind="streak")
    await _seed(session, uid, title="B", kind="summary")
    before = (await client.get(f"{API}/notifications", headers=auth_headers)).json()
    assert before["unread_count"] == 3  # welcome + two
    assert before["items"][0]["title"] == "B"  # newest first

    read = await client.post(f"{API}/notifications/{a.id}/read", headers=auth_headers)
    assert read.status_code == 200 and read.json()["read"] is True
    again = await client.post(f"{API}/notifications/{a.id}/read", headers=auth_headers)
    assert again.status_code == 200  # idempotent
    unread = (
        await client.get(f"{API}/notifications", params={"unread": "true"}, headers=auth_headers)
    ).json()
    assert unread["unread_count"] == 2 and "A" not in [i["title"] for i in unread["items"]]

    done = await client.post(f"{API}/notifications/read-all", headers=auth_headers)
    assert done.json()["message"] == "marked 2 as read"
    assert (await client.get(f"{API}/notifications", headers=auth_headers)).json()[
        "unread_count"
    ] == 0


async def test_dismiss_and_restore(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    row = await _seed(session, await _uid(session), title="Bye")
    assert (
        await client.delete(f"{API}/notifications/{row.id}", headers=auth_headers)
    ).status_code == 204
    titles = [
        i["title"]
        for i in (await client.get(f"{API}/notifications", headers=auth_headers)).json()["items"]
    ]
    assert "Bye" not in titles
    # dismissed things can't be read or dismissed again, but can be restored
    assert (
        await client.post(f"{API}/notifications/{row.id}/read", headers=auth_headers)
    ).status_code == 404
    assert (
        await client.delete(f"{API}/notifications/{row.id}", headers=auth_headers)
    ).status_code == 404
    back = await client.post(f"{API}/notifications/{row.id}/restore", headers=auth_headers)
    assert back.status_code == 200 and back.json()["title"] == "Bye"
    assert (
        await client.post(f"{API}/notifications/{row.id}/restore", headers=auth_headers)
    ).status_code == 404


async def test_inbox_is_private_and_hides_engine_bookkeeping(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers, other_headers: Headers
) -> None:
    mine = await _seed(session, await _uid(session), title="Mine")
    # engine bookkeeping rows never show up in the inbox
    session.add(
        Nudge(
            user_id=await _uid(session),
            scheduled_for=mine.scheduled_for,
            status="skipped",
            skip_reason="respects_quiet_hours",
            title="Hidden",
        )
    )
    await session.commit()
    titles = [
        i["title"]
        for i in (await client.get(f"{API}/notifications", headers=auth_headers)).json()["items"]
    ]
    assert "Mine" in titles and "Hidden" not in titles
    theirs = await client.post(f"{API}/notifications/{mine.id}/read", headers=other_headers)
    assert theirs.status_code == 404
    other_inbox = (await client.get(f"{API}/notifications", headers=other_headers)).json()
    assert "Mine" not in [i["title"] for i in other_inbox["items"]]


# ----------------------------------------------------------------------- devices


async def test_register_is_idempotent_and_validates_the_token(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    body = {"token": TOKEN, "platform": "android"}
    first = await client.post(f"{API}/devices", json=body, headers=auth_headers)
    assert first.status_code == 201, first.text
    second = await client.post(f"{API}/devices", json=body, headers=auth_headers)
    assert second.json()["id"] == first.json()["id"]
    assert len((await session.scalars(select(Device))).all()) == 1

    for bad in (
        {"token": "not-a-token", "platform": "android"},
        {"token": TOKEN, "platform": "tv"},
    ):
        assert (
            await client.post(f"{API}/devices", json=bad, headers=auth_headers)
        ).status_code == 422


async def test_token_moves_to_the_latest_user_and_only_owner_can_remove(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers, other_headers: Headers
) -> None:
    await client.post(
        f"{API}/devices", json={"token": TOKEN, "platform": "ios"}, headers=auth_headers
    )
    # someone else removing it is a no-op: it isn't theirs
    await client.delete(f"{API}/devices", params={"token": TOKEN}, headers=other_headers)
    assert await session.scalar(select(Device)) is not None
    # a shared phone: the next person to sign in takes the token over
    await client.post(
        f"{API}/devices", json={"token": TOKEN, "platform": "ios"}, headers=other_headers
    )
    device = await session.scalar(select(Device))
    assert device is not None
    await session.refresh(device)
    assert device.user_id == await _uid(session, "chat2@example.com")
    gone = await client.delete(f"{API}/devices", params={"token": TOKEN}, headers=other_headers)
    assert gone.status_code == 204
    assert await session.scalar(select(Device)) is None


# -------------------------------------------------------------------------- push


async def test_engine_nudges_are_pushed_to_every_device(
    client: AsyncClient,
    session: AsyncSession,
    auth_headers: Headers,
    pushed: list[dict[str, Any]],
) -> None:
    from datetime import UTC, datetime

    await client.post(
        f"{API}/devices", json={"token": TOKEN, "platform": "ios"}, headers=auth_headers
    )
    await client.post(
        f"{API}/devices",
        json={"token": "ExponentPushToken[second-phone-1]", "platform": "android"},
        headers=auth_headers,
    )
    await client.post(
        f"{API}/habits", json={"name": "Deep work", "preferred_time": "00:00"}, headers=auth_headers
    )

    report = await evaluate_user(
        session,
        await _uid(session),
        model_client=FakeClient(default={"content": "Time to focus."}),
        redis=None,
        now_utc=datetime.now(UTC),
    )
    assert report.nudge_ids
    assert sorted(m["to"] for m in pushed) == sorted([TOKEN, "ExponentPushToken[second-phone-1]"])
    msg = pushed[0]
    assert msg["title"] == "Deep work" and msg["body"] == "Time to focus."
    assert msg["data"]["kind"] == "nudge" and msg["data"]["nudge_id"]
    assert msg["channelId"] == "habit-reminders"
    # and the same message is waiting in the inbox
    inbox = (await client.get(f"{API}/notifications", headers=auth_headers)).json()
    assert "Deep work" in [i["title"] for i in inbox["items"]]


async def test_dead_tokens_are_disabled_and_not_retried(
    client: AsyncClient,
    session: AsyncSession,
    auth_headers: Headers,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await client.post(
        f"{API}/devices", json={"token": TOKEN, "platform": "ios"}, headers=auth_headers
    )
    uid = await _uid(session)
    row = await _seed(session, uid)
    calls = 0

    async def dead(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        nonlocal calls
        calls += 1
        return [
            {"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}}
            for _ in messages
        ]

    monkeypatch.setattr("app.infra.push.send_expo", dead)
    assert await notification_service.deliver(session, uid, [row.id]) == 0
    device = await session.scalar(select(Device))
    assert device is not None and device.disabled_at is not None
    assert await notification_service.deliver(session, uid, [row.id]) == 0
    assert calls == 1  # the disabled device is skipped the second time


async def test_push_failure_never_breaks_the_caller(
    client: AsyncClient,
    session: AsyncSession,
    auth_headers: Headers,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await client.post(
        f"{API}/devices", json={"token": TOKEN, "platform": "ios"}, headers=auth_headers
    )
    uid = await _uid(session)
    row = await _seed(session, uid)

    async def boom(_: list[dict[str, Any]]) -> list[dict[str, Any]]:
        raise RuntimeError("expo is down")

    monkeypatch.setattr("app.infra.push.send_expo", boom)
    assert await notification_service.deliver(session, uid, [row.id]) == 0  # no exception
    assert await notification_service.deliver(session, uid, []) == 0


async def test_skipped_and_unsent_nudges_are_not_pushed(
    client: AsyncClient,
    session: AsyncSession,
    auth_headers: Headers,
    pushed: list[dict[str, Any]],
) -> None:
    await client.post(
        f"{API}/devices", json={"token": TOKEN, "platform": "ios"}, headers=auth_headers
    )
    uid = await _uid(session)
    sent = await _seed(session, uid, title="Real")
    skipped = Nudge(user_id=uid, scheduled_for=sent.scheduled_for, status="skipped", title="Skip")
    session.add(skipped)
    await session.commit()
    await notification_service.deliver(session, uid, [sent.id, skipped.id])
    assert [m["title"] for m in pushed] == ["Real"]


async def test_expo_transport_batches_and_turns_failures_into_tickets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import httpx

    from app.infra import push

    requests: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        batch = json.loads(request.content)
        requests.append(len(batch))
        if len(requests) == 2:
            return httpx.Response(500)
        return httpx.Response(200, json={"data": [{"status": "ok", "id": "x"} for _ in batch]})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        push.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    tickets = await push.send_expo([{"to": f"t{i}"} for i in range(150)])
    assert requests == [100, 50]  # split at Expo's limit
    assert len(tickets) == 150
    assert tickets[0]["status"] == "ok" and tickets[120]["status"] == "error"
