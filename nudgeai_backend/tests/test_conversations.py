"""Chat conversations: threads, isolation, listing, deleting and restoring."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ChatMessage
from app.models.client import FakeClient, set_client

API = "/api/v1"
Headers = dict[str, str]


def _events(text: str) -> list[tuple[str, dict[str, Any]]]:
    out: list[tuple[str, dict[str, Any]]] = []
    for block in text.strip().split("\n\n"):
        lines = block.splitlines()
        event = next(line.removeprefix("event: ") for line in lines if line.startswith("event: "))
        data = next(line.removeprefix("data: ") for line in lines if line.startswith("data: "))
        out.append((event, json.loads(data)))
    return out


async def _say(
    client: AsyncClient, h: Headers, message: str, **extra: Any
) -> tuple[UUID, dict[str, Any]]:
    """Send a chat turn; return (conversation id, the 'message' event)."""
    r = await client.post(f"{API}/chat", json={"message": message, **extra}, headers=h)
    assert r.status_code == 200, r.text
    events = _events(r.text)
    names = [e for e, _ in events]
    assert names[0] == "conversation", names  # the id arrives before the reply
    convo = dict(events)["conversation"]
    return UUID(convo["id"]), dict(events)["message"]


def _fake(reply: str = "Sure thing.") -> FakeClient:
    return FakeClient(default={"content": reply})


async def test_first_message_creates_a_conversation_named_after_it(
    client: AsyncClient, auth_headers: Headers
) -> None:
    set_client(_fake())
    cid, reply = await _say(client, auth_headers, "  Push my 10am deep work\nto 11am please ")
    assert reply["content"] == "Sure thing."
    listing = (await client.get(f"{API}/conversations", headers=auth_headers)).json()
    (item,) = listing
    assert item["id"] == str(cid) and item["title"] == "Push my 10am deep work to 11am please"
    assert item["message_count"] == 2 and item["mode"] == "text"
    assert item["preview"] == "Sure thing."


async def test_long_titles_are_trimmed() -> None:
    from app.services.conversation_service import TITLE_MAX, title_from

    assert len(title_from("x" * 200)) == TITLE_MAX and title_from("x" * 200).endswith("…")
    assert title_from("   ") == "New chat"
    assert title_from("short") == "short"


async def test_continuing_a_thread_adds_to_it_and_new_threads_are_separate(
    client: AsyncClient, auth_headers: Headers
) -> None:
    set_client(_fake())
    first, _ = await _say(client, auth_headers, "Plan my week")
    again, _ = await _say(client, auth_headers, "Make Friday lighter", conversation_id=str(first))
    assert again == first
    other, _ = await _say(client, auth_headers, "Suggest habits")
    assert other != first

    detail = (await client.get(f"{API}/conversations/{first}", headers=auth_headers)).json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant", "user", "assistant"]
    assert [m["content"] for m in detail["messages"] if m["role"] == "user"] == [
        "Plan my week",
        "Make Friday lighter",
    ]
    listing = (await client.get(f"{API}/conversations", headers=auth_headers)).json()
    assert [c["title"] for c in listing] == ["Suggest habits", "Plan my week"]  # newest first


async def test_the_model_only_sees_the_current_thread(
    client: AsyncClient, auth_headers: Headers
) -> None:
    seen: list[list[dict[str, Any]]] = []

    class Spy(FakeClient):
        async def complete(self, spec, messages, **kw):  # type: ignore[no-untyped-def]
            seen.append(messages)
            return await super().complete(spec, messages, **kw)

    set_client(Spy(default={"content": "ok"}))
    await _say(client, auth_headers, "SECRET-ALPHA in thread one")
    second, _ = await _say(client, auth_headers, "A question in thread two")
    text = json.dumps(seen[-1])
    assert "A question in thread two" in text
    assert "SECRET-ALPHA" not in text
    # continuing thread two includes its own earlier turn
    await _say(client, auth_headers, "and a follow-up", conversation_id=str(second))
    assert "A question in thread two" in json.dumps(seen[-1])


async def test_voice_turns_make_a_voice_conversation(
    client: AsyncClient, auth_headers: Headers
) -> None:
    set_client(_fake())
    voice, _ = await _say(client, auth_headers, "Hi Nudge", via="voice")
    mixed, _ = await _say(client, auth_headers, "Typed one", via="text")
    await _say(client, auth_headers, "then spoken", via="voice", conversation_id=str(mixed))
    modes = {
        c["id"]: c["mode"]
        for c in (await client.get(f"{API}/conversations", headers=auth_headers)).json()
    }
    assert modes[str(voice)] == "voice" and modes[str(mixed)] == "voice+text"
    detail = (await client.get(f"{API}/conversations/{voice}", headers=auth_headers)).json()
    assert {m["via"] for m in detail["messages"]} == {"voice"}


async def test_chat_validation_and_isolation(
    client: AsyncClient, auth_headers: Headers, other_headers: Headers
) -> None:
    set_client(_fake())
    bad = await client.post(
        f"{API}/chat", json={"message": "x", "via": "carrier-pigeon"}, headers=auth_headers
    )
    assert bad.status_code == 422
    missing = await client.post(
        f"{API}/chat",
        json={"message": "x", "conversation_id": "00000000-0000-4000-8000-000000000000"},
        headers=auth_headers,
    )
    assert missing.status_code == 404

    mine, _ = await _say(client, auth_headers, "private")
    # another user can neither continue, read, delete nor restore it
    cont = await client.post(
        f"{API}/chat", json={"message": "hi", "conversation_id": str(mine)}, headers=other_headers
    )
    assert cont.status_code == 404
    assert (
        await client.get(f"{API}/conversations/{mine}", headers=other_headers)
    ).status_code == 404
    assert (
        await client.delete(f"{API}/conversations/{mine}", headers=other_headers)
    ).status_code == 404
    assert (
        await client.post(f"{API}/conversations/{mine}/restore", headers=other_headers)
    ).status_code == 404
    assert (await client.get(f"{API}/conversations", headers=other_headers)).json() == []


async def test_delete_restore_and_clear(client: AsyncClient, auth_headers: Headers) -> None:
    set_client(_fake())
    a, _ = await _say(client, auth_headers, "Keep me")
    b, _ = await _say(client, auth_headers, "Delete me")

    assert (
        await client.delete(f"{API}/conversations/{b}", headers=auth_headers)
    ).status_code == 204
    titles = [
        c["title"] for c in (await client.get(f"{API}/conversations", headers=auth_headers)).json()
    ]
    assert titles == ["Keep me"]
    assert (await client.get(f"{API}/conversations/{b}", headers=auth_headers)).status_code == 404
    gone = await client.post(
        f"{API}/chat", json={"message": "hi", "conversation_id": str(b)}, headers=auth_headers
    )
    assert gone.status_code == 404  # a deleted thread can't be continued
    assert (
        await client.delete(f"{API}/conversations/{b}", headers=auth_headers)
    ).status_code == 404

    back = await client.post(f"{API}/conversations/{b}/restore", headers=auth_headers)
    assert back.status_code == 200 and back.json()["title"] == "Delete me"
    assert back.json()["message_count"] == 2  # nothing was lost

    cleared = await client.delete(f"{API}/conversations", headers=auth_headers)
    assert cleared.json()["message"] == "deleted 2 conversations"
    assert (await client.get(f"{API}/conversations", headers=auth_headers)).json() == []
    assert (await client.get(f"{API}/conversations/{a}", headers=auth_headers)).status_code == 404


async def test_clearing_history_removes_the_messages_too(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    set_client(_fake())
    await _say(client, auth_headers, "to be erased")
    assert (await session.scalars(select(ChatMessage))).all()
    await client.delete(f"{API}/conversations", headers=auth_headers)
    session.expire_all()
    assert (await session.scalars(select(ChatMessage))).all() == []


async def test_flat_history_can_be_filtered_to_one_conversation(
    client: AsyncClient, auth_headers: Headers
) -> None:
    set_client(_fake())
    one, _ = await _say(client, auth_headers, "first thread")
    await _say(client, auth_headers, "second thread")
    everything = (await client.get(f"{API}/chat/history", headers=auth_headers)).json()
    scoped = (
        await client.get(
            f"{API}/chat/history", params={"conversation_id": str(one)}, headers=auth_headers
        )
    ).json()
    assert len(everything) == 4 and len(scoped) == 2
