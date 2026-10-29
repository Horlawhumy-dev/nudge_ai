"""Streaming replies: the model client's assembly, and the chat stream's events in order."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

import pytest
from httpx import AsyncClient

from app.models.client import ChatClient, Delta, FakeClient, MetaClient, ModelError, ModelReply
from app.models.client import set_client as set_model_client
from app.models.registry import spec_for

API = "/api/v1"
Headers = dict[str, str]
MESSAGES = [{"role": "user", "content": "hi there"}]


# ------------------------------------------------------------ the real client's assembly


def chunk(
    content: str | None = None,
    *,
    reasoning: str | None = None,
    tool: tuple[int, str | None, str | None, str | None] | None = None,
    usage: tuple[int, int] | None = None,
) -> Any:
    delta = SimpleNamespace(content=content, reasoning_content=reasoning, tool_calls=None)
    if tool is not None:
        index, call_id, name, args = tool
        delta.tool_calls = [
            SimpleNamespace(
                index=index, id=call_id, function=SimpleNamespace(name=name, arguments=args)
            )
        ]
    choices = [SimpleNamespace(delta=delta, finish_reason=None)]
    usage_obj = (
        SimpleNamespace(prompt_tokens=usage[0], completion_tokens=usage[1]) if usage else None
    )
    return SimpleNamespace(choices=choices, usage=usage_obj)


def usage_only(prompt: int, completion: int) -> Any:
    return SimpleNamespace(
        choices=[], usage=SimpleNamespace(prompt_tokens=prompt, completion_tokens=completion)
    )


class Chunks:
    """What the SDK hands back for stream=True: an async iterator of chunks, then maybe an error."""

    def __init__(self, items: list[Any], then_raise: Exception | None = None) -> None:
        self._items, self._raise = items, then_raise

    def __aiter__(self) -> AsyncIterator[Any]:
        async def gen() -> AsyncIterator[Any]:
            for item in self._items:
                yield item
            if self._raise:
                raise self._raise

        return gen()


def client_returning(*responses: Chunks | Exception) -> tuple[MetaClient, list[dict[str, Any]]]:
    client = MetaClient(
        "key", "http://x/v1", timeout=5, max_retries=1, backoff=0, reasoning_efforts={"fast": "low"}
    )
    seen: list[dict[str, Any]] = []
    queue = list(responses)

    async def create(**kwargs: Any) -> Any:
        seen.append(kwargs)
        nxt = queue.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt

    client._client = SimpleNamespace(  # type: ignore[assignment]
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    return client, seen


async def collect(client: MetaClient, **kw: Any) -> tuple[list[str], ModelReply]:
    pieces: list[str] = []
    reply: ModelReply | None = None
    async for item in client.stream(spec_for("fast"), MESSAGES, **kw):
        if isinstance(item, Delta):
            pieces.append(item.text)
        else:
            reply = item
    assert reply is not None
    return pieces, reply


async def test_text_arrives_in_pieces_and_ends_with_the_whole_reply() -> None:
    client, seen = client_returning(
        Chunks([chunk("Hi"), chunk(" there"), chunk("!"), usage_only(50, 7)])
    )
    pieces, reply = await collect(client)
    assert pieces == ["Hi", " there", "!"]
    assert reply.content == "Hi there!"
    assert (reply.prompt_tokens, reply.completion_tokens) == (50, 7)
    assert seen[0]["stream"] is True and seen[0]["stream_options"] == {"include_usage": True}
    assert seen[0]["extra_body"] == {"reasoning_effort": "low"}  # the latency dial still applies


async def test_the_models_thinking_is_never_streamed_to_the_person() -> None:
    client, _ = client_returning(
        Chunks(
            [chunk(reasoning="We need to write a greeting"), chunk("Hello Ada"), usage_only(9, 3)]
        )
    )
    pieces, reply = await collect(client)
    assert pieces == ["Hello Ada"] and "We need" not in reply.content


async def test_a_tool_call_split_across_chunks_is_put_back_together() -> None:
    client, _ = client_returning(
        Chunks(
            [
                chunk("I'll book that."),
                chunk(tool=(0, "call_a", "task_create", "")),
                chunk(tool=(0, None, None, '{"title":"Den')),
                chunk(tool=(0, None, None, 'tist","start_time":"15:00"}')),
                chunk(tool=(1, "call_b", "habit_create", '{"name":"Floss"}')),
                usage_only(100, 40),
            ]
        )
    )
    pieces, reply = await collect(client)
    assert pieces == ["I'll book that."]
    assert [(c.id, c.name, c.arguments) for c in reply.tool_calls] == [
        ("call_a", "task_create", {"title": "Dentist", "start_time": "15:00"}),
        ("call_b", "habit_create", {"name": "Floss"}),
    ]


async def test_a_server_that_reports_no_usage_gets_an_estimate() -> None:
    client, _ = client_returning(Chunks([chunk("a" * 40)]))
    _, reply = await collect(client)
    assert reply.completion_tokens == 10 and reply.prompt_tokens > 0


async def test_a_failure_before_any_text_is_retried() -> None:
    class Flaky(Exception):
        status_code = 503

    client, seen = client_returning(Flaky("overloaded"), Chunks([chunk("OK"), usage_only(1, 1)]))
    pieces, reply = await collect(client)
    assert pieces == ["OK"] and reply.content == "OK" and len(seen) == 2


async def test_a_failure_after_text_started_is_not_retried_so_nothing_is_said_twice() -> None:
    class Flaky(Exception):
        status_code = 503

    client, seen = client_returning(
        Chunks([chunk("Hello")], then_raise=Flaky("connection lost")),
        Chunks([chunk("Hello again")]),
    )
    got: list[str] = []
    with pytest.raises(ModelError):
        async for item in client.stream(spec_for("fast"), MESSAGES):
            if isinstance(item, Delta):
                got.append(item.text)
    assert got == ["Hello"] and len(seen) == 1


async def test_garbled_tool_arguments_are_a_model_error_not_a_crash() -> None:
    client, _ = client_returning(
        Chunks([chunk(tool=(0, "c", "task_create", "{not json")), usage_only(1, 1)])
    )
    with pytest.raises(ModelError, match="not JSON"):
        await collect(client)


# --------------------------------------------------------------- the chat stream's events


def events_in_order(text: str) -> list[tuple[str, dict[str, Any]]]:
    out = []
    for block in text.strip().split("\n\n"):
        lines = block.splitlines()
        name = next(line.removeprefix("event: ") for line in lines if line.startswith("event: "))
        data = next(line.removeprefix("data: ") for line in lines if line.startswith("data: "))
        out.append((name, json.loads(data)))
    return out


@pytest.fixture(autouse=True)
def _reset_model():  # type: ignore[no-untyped-def]
    yield
    set_model_client(None)


async def chat(
    client: AsyncClient, h: Headers, model: ChatClient, message: str
) -> list[tuple[str, dict[str, Any]]]:
    set_model_client(model)
    r = await client.post(f"{API}/chat", json={"message": message}, headers=h)
    assert r.status_code == 200, r.text
    return events_in_order(r.text)


async def test_a_plain_reply_streams_word_by_word_then_confirms_the_whole_text(
    client: AsyncClient, auth_headers: Headers
) -> None:
    fake = FakeClient(default={"content": "Hello Ada, lovely to see you today."})
    events = await chat(client, auth_headers, fake, "hi")
    names = [n for n, _ in events]
    assert names[0] == "conversation" and names[-2:] == ["meta", "done"]
    assert names.count("delta") == 7  # one per word
    # every word arrives before the closing `message` event, which repeats the whole reply
    assert names.index("message") > max(i for i, n in enumerate(names) if n == "delta")
    streamed = "".join(d["content"] for n, d in events if n == "delta")
    assert (
        streamed.strip()
        == dict(events)["message"]["content"]
        == "Hello Ada, lovely to see you today."
    )


async def test_words_from_an_earlier_round_are_cleared_when_a_later_round_replaces_them(
    client: AsyncClient, auth_headers: Headers
) -> None:
    fake = (
        FakeClient()
        .script(
            "plan my day",
            nth=1,
            content="Let me check.",
            tool_calls=[{"id": "t", "name": "tasks_list", "arguments": {"status": "all"}}],
        )
        .script("plan my day", nth=2, content="You are free all day.")
    )
    events = await chat(client, auth_headers, fake, "plan my day")
    names = [n for n, _ in events]
    assert "reset" in names
    first_reset = names.index("reset")
    before = "".join(d["content"] for n, d in events[:first_reset] if n == "delta")
    after = "".join(d["content"] for n, d in events[first_reset:] if n == "delta")
    assert before.strip() == "Let me check."
    assert after.strip() == "You are free all day."
    assert dict(events)["message"]["content"] == "You are free all day."  # the final text wins


async def test_a_booking_streams_its_sentence_once_and_then_the_confirmation_card(
    client: AsyncClient, auth_headers: Headers
) -> None:
    fake = FakeClient().script(
        "book my dentist",
        content="I'll book your dentist for 3 pm.",
        tool_calls=[
            {"name": "task_create", "arguments": {"title": "Dentist", "start_time": "15:00"}}
        ],
    )
    events = await chat(client, auth_headers, fake, "book my dentist")
    names = [n for n, _ in events]
    assert "reset" not in names and len(fake.calls) == 1  # still one model call, as before
    assert names.index("proposal") > max(i for i, n in enumerate(names) if n == "delta")
    assert (
        "".join(d["content"] for n, d in events if n == "delta").strip()
        == "I'll book your dentist for 3 pm."
    )


async def test_a_failure_part_way_through_a_reply_ends_with_an_honest_message(
    client: AsyncClient, auth_headers: Headers
) -> None:
    class Dies:
        async def complete(self, *a: Any, **k: Any) -> ModelReply:
            raise ModelError("connection lost")

        async def stream(self, *a: Any, **k: Any) -> AsyncIterator[Delta | ModelReply]:
            yield Delta("Sure, I can")
            raise ModelError("connection lost")

    events = await chat(client, auth_headers, Dies(), "hello")  # type: ignore[arg-type]
    final = dict(events)["message"]["content"]
    assert "model unavailable" in final  # not the half sentence that was shown
    assert events[-1][0] == "done"


async def test_a_client_without_streaming_still_works(
    client: AsyncClient, auth_headers: Headers
) -> None:
    class OldStyle:
        async def complete(self, *a: Any, **k: Any) -> ModelReply:
            return ModelReply(content="All good.", model_id="old")

    events = await chat(client, auth_headers, OldStyle(), "hello")  # type: ignore[arg-type]
    names = [n for n, _ in events]
    assert names.count("delta") == 1 and dict(events)["message"]["content"] == "All good."
