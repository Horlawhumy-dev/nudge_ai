"""Agent traces: every chat turn leaves a readable record of how it was produced."""

from __future__ import annotations

import json
from typing import Any

import pytest
from httpx import AsyncClient

from app.models.client import FakeClient, set_client

API = "/api/v1"
Headers = dict[str, str]


@pytest.fixture(autouse=True)
def _reset_model():  # type: ignore[no-untyped-def]
    yield
    set_client(None)


def _meta(text: str) -> dict[str, Any]:
    blocks = [b for b in text.strip().split("\n\n") if b.startswith("event: meta")]
    return json.loads(blocks[0].split("data: ", 1)[1])


async def _chat(
    client: AsyncClient, h: Headers, fake: FakeClient, message: str, **body: Any
) -> Any:
    set_client(fake)
    r = await client.post(f"{API}/chat", json={"message": message, **body}, headers=h)
    assert r.status_code == 200, r.text
    return r


async def test_a_plain_turn_leaves_a_trace_linked_from_the_stream(
    client: AsyncClient, auth_headers: Headers
) -> None:
    r = await _chat(client, auth_headers, FakeClient(default={"content": "Hi there."}), "hello")
    trace_id = _meta(r.text)["trace_id"]
    trace = (await client.get(f"{API}/traces/{trace_id}", headers=auth_headers)).json()
    assert trace["prompt_preview"] == "hello"
    assert trace["tier"] and trace["model"] and trace["reason"]
    assert trace["hops"] and trace["hops"][0]["tier"] == trace["tier"]
    assert trace["tools"] == [] and trace["proposal_ids"] == []
    assert trace["prompt_tokens"] > 0 and trace["latency_ms"] >= 0


async def test_tool_steps_and_proposals_are_recorded_without_tool_output(
    client: AsyncClient, auth_headers: Headers
) -> None:
    await client.post(f"{API}/tasks", json={"title": "Secret plan"}, headers=auth_headers)
    fake = FakeClient().script(
        "do things",
        content="On it.",
        tool_calls=[
            {"id": "1", "name": "tasks_list", "arguments": {"status": "all"}},
            {"id": "2", "name": "task_create", "arguments": {"title": "Water plants"}},
        ],
    )
    r = await _chat(client, auth_headers, fake, "do things")
    trace = (
        await client.get(f"{API}/traces/{_meta(r.text)['trace_id']}", headers=auth_headers)
    ).json()
    tools = {t["tool"]: t for t in trace["tools"] if t["ok"]}
    assert tools["tasks_list"]["proposed"] is False
    assert tools["task_create"]["proposed"] is True
    assert len(trace["proposal_ids"]) == 1
    assert "Secret plan" not in json.dumps(trace)  # shape of the turn, not the user's data


async def test_list_filters_by_conversation_and_is_private(
    client: AsyncClient, auth_headers: Headers, other_headers: Headers
) -> None:
    ok = FakeClient(default={"content": "ok"})
    first = await _chat(client, auth_headers, ok, "one")
    convo = first.text.split("data: ", 1)[1].split("\n", 1)[0]
    convo_id = json.loads(convo)["id"]
    await _chat(client, auth_headers, ok, "two")  # a different conversation
    await _chat(client, auth_headers, ok, "three", conversation_id=convo_id)

    mine = (await client.get(f"{API}/traces", headers=auth_headers)).json()
    assert [t["prompt_preview"] for t in mine] == ["three", "two", "one"]  # newest first
    one_thread = (
        await client.get(
            f"{API}/traces", params={"conversation_id": convo_id}, headers=auth_headers
        )
    ).json()
    assert [t["prompt_preview"] for t in one_thread] == ["three", "one"]

    assert (await client.get(f"{API}/traces", headers=other_headers)).json() == []
    assert (
        await client.get(f"{API}/traces/{mine[0]['id']}", headers=other_headers)
    ).status_code == 404
    assert (await client.get(f"{API}/traces")).status_code == 401


async def test_long_prompts_are_clipped_in_the_trace(
    client: AsyncClient, auth_headers: Headers
) -> None:
    r = await _chat(client, auth_headers, FakeClient(default={"content": "ok"}), "x" * 400)
    trace = (
        await client.get(f"{API}/traces/{_meta(r.text)['trace_id']}", headers=auth_headers)
    ).json()
    assert len(trace["prompt_preview"]) == 160  # long prompts are clipped
