"""Phase 2: the confirmation gate, the dispatch loop, and chat end to end.

These run against the real Postgres fixture with the offline `FakeClient`, so
tool calling, escalation, and the proposal gate are all exercised without
spending a cent or touching a live Meta endpoint.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.ai import proposals as proposals_mod
from app.db.models import ChatMessage, Memory, ToolProposal
from app.models.client import FakeClient, ModelReply, ToolCall, set_client
from app.models.registry import spec_for
from app.services import memory_service
from app.tools.base import ToolRegistry


def _registry(user_id: UUID, session: Any) -> ToolRegistry:
    from app.tools import memory as memory_tools

    registry = ToolRegistry()
    for factory in memory_tools.default_tools():
        registry.register(factory(), user_id, session)
    return registry


# --------------------------------------------------------------- proposal gate


@pytest.mark.asyncio
async def test_mutating_call_writes_nothing_until_confirmed(
    client: AsyncClient, auth_headers: dict[str, str], session: Any
) -> None:
    """The core of the spec: a write is proposed, not performed."""
    user_id = await _me_id(client, auth_headers)

    fake = FakeClient().script(
        "stretch",
        content="I'll propose that habit.",
        tool_calls=[{"name": "memory_remember", "arguments": {"body": "stretch at 7am"}}],
    )
    set_client(fake)
    try:
        response = await client.post(
            "/api/v1/chat", headers=auth_headers, json={"message": "remind me to stretch"}
        )
        assert response.status_code == 200
        assert "propose" in response.text.lower()
    finally:
        set_client(None)

    # A proposal exists...
    pending = (
        (
            await session.execute(
                select(ToolProposal).where(
                    ToolProposal.user_id == user_id, ToolProposal.status == "pending"
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(pending) == 1

    # ...and no memory was written.
    count = await session.scalar(
        select(func.count()).select_from(Memory).where(Memory.user_id == user_id)
    )
    assert count == 0

    # Confirming is what performs the write.
    confirm = await client.post(f"/api/v1/proposals/{pending[0].id}/confirm", headers=auth_headers)
    assert confirm.status_code == 200
    after = await session.scalar(
        select(func.count()).select_from(Memory).where(Memory.user_id == user_id)
    )
    assert after == 1


@pytest.mark.asyncio
async def test_proposal_confirm_is_single_use(
    client: AsyncClient, auth_headers: dict[str, str], session: Any
) -> None:
    user_id = await _me_id(client, auth_headers)
    row = await proposals_mod.create(
        session,
        user_id,
        call_id="dup-1",
        tool=_registry(user_id, session).get("memory_remember"),  # type: ignore[arg-type]
        args={"body": "drink water"},
    )
    first = await client.post(f"/api/v1/proposals/{row.id}/confirm", headers=auth_headers)
    assert first.status_code == 200
    second = await client.post(f"/api/v1/proposals/{row.id}/confirm", headers=auth_headers)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_rejecting_a_proposal_writes_nothing(
    client: AsyncClient, auth_headers: dict[str, str], session: Any
) -> None:
    user_id = await _me_id(client, auth_headers)
    row = await proposals_mod.create(
        session,
        user_id,
        call_id="rej-1",
        tool=_registry(user_id, session).get("memory_remember"),  # type: ignore[arg-type]
        args={"body": "should not persist"},
    )
    rejected = await client.post(f"/api/v1/proposals/{row.id}/reject", headers=auth_headers)
    assert rejected.status_code == 200
    count = await session.scalar(
        select(func.count()).select_from(Memory).where(Memory.user_id == user_id)
    )
    assert count == 0


@pytest.mark.asyncio
async def test_proposal_is_idempotent_per_call_id(
    client: AsyncClient, auth_headers: dict[str, str], session: Any
) -> None:
    """A retried hop must not produce two pending proposals for one call."""
    user_id = await _me_id(client, auth_headers)
    tool = _registry(user_id, session).get("memory_remember")
    assert tool is not None
    a = await proposals_mod.create(
        session, user_id, call_id="same-id", tool=tool, args={"body": "x"}
    )
    b = await proposals_mod.create(
        session, user_id, call_id="same-id", tool=tool, args={"body": "x"}
    )
    assert a.id == b.id


@pytest.mark.asyncio
async def test_cannot_confirm_another_users_proposal(
    client: AsyncClient, auth_headers: dict[str, str], other_headers: dict[str, str], session: Any
) -> None:
    owner_id = await _me_id(client, auth_headers)
    tool = _registry(owner_id, session).get("memory_remember")
    assert tool is not None
    row = await proposals_mod.create(
        session, owner_id, call_id="priv-1", tool=tool, args={"body": "mine"}
    )
    # The other user must not even see it exists.
    response = await client.post(f"/api/v1/proposals/{row.id}/confirm", headers=other_headers)
    assert response.status_code == 409
    assert (
        await session.scalar(
            select(func.count()).select_from(Memory).where(Memory.user_id == owner_id)
        )
        == 0
    )


# --------------------------------------------------------------- tool dispatch


@pytest.mark.asyncio
async def test_recall_tool_runs_unattended(
    client: AsyncClient, auth_headers: dict[str, str], session: Any
) -> None:
    """A read-only tool executes without any confirmation."""
    user_id = await _me_id(client, auth_headers)
    await memory_service.add_memory(session, user_id, body="dentist on Tuesday")

    fake = (
        FakeClient()
        .script(
            "dentist",
            content="Let me look.",
            tool_calls=[{"name": "memory_recall", "arguments": {"query": "dentist"}}],
        )
        .script("look", content="You have a dentist appointment on Tuesday.")
    )
    set_client(fake)
    try:
        response = await client.post(
            "/api/v1/chat", headers=auth_headers, json={"message": "when is my dentist?"}
        )
        assert response.status_code == 200
        assert "Tuesday" in response.text
    finally:
        set_client(None)

    pending = (
        await session.execute(
            select(func.count()).select_from(ToolProposal).where(ToolProposal.user_id == user_id)
        )
    ).scalar_one()
    assert pending == 0


@pytest.mark.asyncio
async def test_unknown_tool_is_reported_not_executed(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    fast = spec_for("fast").id
    fake = FakeClient()
    # Hop 1 asks for a tool that does not exist; hop 2 reports it.
    fake.script("launch", nth=1, content="Trying.", tool_calls=[{"name": "rm_rf", "arguments": {}}])
    fake.script("launch", nth=2, content="That tool does not exist.")
    assert fast
    set_client(fake)
    try:
        response = await client.post(
            "/api/v1/chat", headers=auth_headers, json={"message": "launch the thing"}
        )
        assert response.status_code == 200
        assert "does not exist" in response.text
    finally:
        set_client(None)


@pytest.mark.asyncio
async def test_calendar_is_refused_when_disabled(
    client: AsyncClient, auth_headers: dict[str, str], session: Any
) -> None:
    """No live OAuth exists, so the calendar tool must fail closed."""
    user_id = await _me_id(client, auth_headers)
    tool = _registry(user_id, session)
    from app.tools.base import ToolError
    from app.tools.calendar import CalendarFreeBusyTool

    with pytest.raises(ToolError):
        await CalendarFreeBusyTool().run(user_id, {}, session)
    # recall, remember, forget
    assert len(tool) == 3


# ------------------------------------------------------------------ escalation


@pytest.mark.asyncio
async def test_low_confidence_escalates_to_a_better_model(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    """The fast tier says it is unsure, so the turn re-runs on the smart tier."""
    fake = FakeClient()
    fake.script(
        "unsure",
        model=spec_for("fast").id,
        content="[[low_confidence]] I am not sure.",
        low_confidence=True,
    )
    fake.script("unsure", model=spec_for("smart").id, content="Here is a solid answer.")
    set_client(fake)
    try:
        response = await client.post(
            "/api/v1/chat", headers=auth_headers, json={"message": "unsure"}
        )
        assert response.status_code == 200
        assert "solid answer" in response.text
    finally:
        set_client(None)

    # Two calls, on two different models.
    assert len(fake.calls) == 2
    assert fake.calls[0]["model"] == spec_for("fast").id
    assert fake.calls[1]["model"] == spec_for("smart").id


# ------------------------------------------------------------------ chat paths


@pytest.mark.asyncio
async def test_chat_persists_both_sides(
    client: AsyncClient, auth_headers: dict[str, str], session: Any
) -> None:
    user_id = await _me_id(client, auth_headers)
    set_client(FakeClient(default={"content": "hello there"}))
    try:
        response = await client.post("/api/v1/chat", headers=auth_headers, json={"message": "hi"})
        assert response.status_code == 200
    finally:
        set_client(None)

    roles = (
        (
            await session.execute(
                select(ChatMessage.role)
                .where(ChatMessage.user_id == user_id)
                .order_by(ChatMessage.created_at)
            )
        )
        .scalars()
        .all()
    )
    assert roles == ["user", "assistant"]

    history = await client.get("/api/v1/chat/history", headers=auth_headers)
    assert history.status_code == 200
    assert [m["role"] for m in history.json()] == ["user", "assistant"]


@pytest.mark.asyncio
async def test_chat_streams_expected_events(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    set_client(FakeClient(default={"content": "streamed"}))
    try:
        response = await client.post(
            "/api/v1/chat", headers=auth_headers, json={"message": "hello"}
        )
    finally:
        set_client(None)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "event: message" in body
    assert "event: meta" in body
    assert "event: done" in body
    # The metadata block must name the tier, so routing is observable client-side.
    meta = [line for line in body.splitlines() if line.startswith("data: {") and "tier" in line]
    assert meta


@pytest.mark.asyncio
async def test_routing_preview_spends_nothing(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    fake = FakeClient()
    set_client(fake)
    try:
        response = await client.get(
            "/api/v1/routing/preview",
            headers=auth_headers,
            params={"message": "compare my week"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["tier"] == "smart"
        assert body["model"] == spec_for("smart").id
        assert body["reason"]
        assert fake.calls == []
    finally:
        set_client(None)


@pytest.mark.asyncio
async def test_budget_exhaustion_degrades_to_fast(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    from app.core.config import get_settings
    from app.models import budgets

    user_id = await _me_id(client, auth_headers)
    limit = get_settings().budget_daily_calls
    await budgets.charge(user_id, tokens=0)
    for _ in range(limit):
        await budgets.charge(user_id, tokens=0)

    state = await budgets.snapshot(user_id)
    assert state.exhausted

    fake = FakeClient(default={"content": "degraded answer"})
    set_client(fake)
    try:
        response = await client.post(
            "/api/v1/chat", headers=auth_headers, json={"message": "compare my week"}
        )
        assert response.status_code == 200
        # Would normally be smart, but the guard pins it and says so.
        assert "degraded" in response.text
        assert fake.calls[0]["model"] == spec_for("fast").id
    finally:
        set_client(None)
        await budgets.reset(user_id)


@pytest.mark.asyncio
async def test_metrics_expose_router_and_model_series(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    set_client(FakeClient(default={"content": "metric reply"}))
    try:
        await client.post("/api/v1/chat", headers=auth_headers, json={"message": "hi"})
    finally:
        set_client(None)
    metrics = await client.get("/metrics")
    assert metrics.status_code == 200
    body = metrics.text
    for series in (
        "nudgeai_model_calls_total",
        "nudgeai_model_tokens_total",
        "nudgeai_model_cost_usd_total",
        "nudgeai_model_latency_seconds",
        "nudgeai_route_decisions_total",
        "nudgeai_tool_calls_total",
        "nudgeai_chat_messages_total",
    ):
        assert series in body, series


@pytest.mark.asyncio
async def test_repeated_identical_tool_call_is_not_run_twice(
    client: AsyncClient, auth_headers: dict[str, str], session: Any
) -> None:
    """A model that loops must not re-run the same call under a fresh id.

    Observed live against the real endpoint: the fast tier called memory_recall
    four times in a row, each with a new call id, burning 3m23s for nothing.
    """
    fake = FakeClient()
    # Same tool, same arguments, new id every hop -- exactly the live failure.
    for nth in (1, 2, 3, 4):
        fake.script(
            "loop",
            nth=nth,
            content="",
            tool_calls=[
                {"id": f"call_{nth}", "name": "memory_recall", "arguments": {"query": "habits"}}
            ],
        )
    set_client(fake)
    try:
        response = await client.post(
            "/api/v1/chat", headers=auth_headers, json={"message": "loop please"}
        )
        assert response.status_code == 200
    finally:
        set_client(None)

    # The turn must stop early rather than spend all four hops.
    assert len(fake.calls) < 4, "executor burned every hop on an identical call"
    duplicates = [
        r for r in _tool_results(response.text) if "identical call already made" in str(r)
    ]
    assert duplicates, "the repeat was not reported back to the model"


@pytest.mark.asyncio
async def test_stuck_turn_does_not_burn_every_hop(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    """Empty replies with no tool call end the turn instead of looping."""
    fake = FakeClient(default={"content": ""})
    set_client(fake)
    try:
        response = await client.post(
            "/api/v1/chat", headers=auth_headers, json={"message": "say nothing"}
        )
        assert response.status_code == 200
    finally:
        set_client(None)
    assert len(fake.calls) == 1, "an empty reply must not trigger another hop"


def _tool_results(body: str) -> list[Any]:
    """Pull the tool_results payload out of an SSE body.

    The event name lives on the `event:` line, so the payload on the following
    `data:` line does not contain the string 'tool_results' to grep for.
    """
    lines = body.splitlines()
    for i, line in enumerate(lines):
        if line.strip() == "event: tool_results":
            for follow in lines[i + 1 :]:
                if follow.startswith("data: "):
                    return json.loads(follow[6:]).get("results", [])
    return []


# ------------------------------------------------------------------ helpers


async def _me_id(client: AsyncClient, headers: dict[str, str]) -> UUID:
    response = await client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 200
    return UUID(response.json()["id"])


def test_tool_call_argument_parsing_tolerates_fences() -> None:
    fenced = '```json\n{"body": "drink water"}\n```'
    assert ToolCall.parse(fenced) == {"body": "drink water"}
    assert ToolCall.parse('prefix {"a": 1} suffix') == {"a": 1}
    assert ToolCall.parse('{"a": 1}') == {"a": 1}


def test_fake_client_is_scripted_by_substring() -> None:
    import asyncio

    fake = FakeClient().script("dentist", content="found it")
    reply = asyncio.run(
        fake.complete(spec_for("fast"), [{"role": "user", "content": "my dentist?"}])
    )
    assert isinstance(reply, ModelReply)
    assert reply.content == "found it"
    assert reply.prompt_tokens > 0
    assert json.dumps({"ok": True})


async def test_the_calendar_tool_is_only_offered_when_the_calendar_is_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A tool that always fails costs a wasted model round trip on most booking requests."""
    from uuid import uuid4

    from app.api.v1.chat import _build_registry
    from app.core.config import get_settings

    def offered() -> set[str]:
        tools = _build_registry(uuid4(), None).openai_tools()
        return {t["function"]["name"] for t in tools}

    monkeypatch.setattr(get_settings(), "calendar_enabled", False)
    off = offered()
    assert "calendar_free_busy" not in off
    assert {"task_create", "tasks_list", "habit_create"} <= off  # everything else stays

    monkeypatch.setattr(get_settings(), "calendar_enabled", True)
    assert "calendar_free_busy" in offered()
