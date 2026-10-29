"""The real model client, with the SDK call faked: request shape and reply parsing."""

from __future__ import annotations

import logging
from types import SimpleNamespace
from typing import Any

import pytest

from app.models.client import MetaClient
from app.models.registry import spec_for


def _client(efforts: dict[str, str] | None, reply: Any) -> tuple[MetaClient, list[dict[str, Any]]]:
    client = MetaClient(
        "key", "http://x/v1", timeout=5, max_retries=0, backoff=0, reasoning_efforts=efforts
    )
    seen: list[dict[str, Any]] = []

    async def create(**kwargs: Any) -> Any:
        seen.append(kwargs)
        return reply

    client._client = SimpleNamespace(  # type: ignore[assignment]
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    return client, seen


def _reply(
    content: str | None, *, reasoning: str = "", finish: str = "stop", tokens: int = 40
) -> Any:
    message = SimpleNamespace(content=content, reasoning_content=reasoning, tool_calls=None)
    return SimpleNamespace(
        choices=[SimpleNamespace(message=message, finish_reason=finish)],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=tokens),
    )


MESSAGES = [{"role": "user", "content": "hi"}]


async def test_reasoning_effort_is_sent_per_tier_and_only_when_configured() -> None:
    client, seen = _client({"smart": "low", "deep": "medium"}, _reply("Hello Ada"))
    await client.complete(spec_for("smart"), MESSAGES)
    await client.complete(spec_for("deep"), MESSAGES)
    await client.complete(spec_for("fast"), MESSAGES)  # no setting for this tier
    assert seen[0]["extra_body"] == {"reasoning_effort": "low"}
    assert seen[1]["extra_body"] == {"reasoning_effort": "medium"}
    assert "extra_body" not in seen[2]

    unset, seen_unset = _client(None, _reply("Hello Ada"))
    await unset.complete(spec_for("fast"), MESSAGES)
    assert "extra_body" not in seen_unset[0]

    blank, seen_blank = _client({"fast": ""}, _reply("Hello Ada"))
    await blank.complete(spec_for("fast"), MESSAGES)
    assert "extra_body" not in seen_blank[0]


async def test_the_models_thinking_never_reaches_the_user() -> None:
    client, _ = _client(
        {"fast": "low"},
        _reply("Ada, 20 pages keeps the streak!", reasoning="We need to write one sentence..."),
    )
    reply = await client.complete(spec_for("fast"), MESSAGES)
    assert reply.content == "Ada, 20 pages keeps the streak!"
    assert "We need" not in reply.content


async def test_an_empty_answer_after_running_out_of_tokens_is_logged(
    caplog: pytest.LogCaptureFixture,
) -> None:
    client, _ = _client(
        {"fast": "low"}, _reply(None, reasoning="thinking...", finish="length", tokens=150)
    )
    with caplog.at_level(logging.WARNING, logger="app.models.client"):
        reply = await client.complete(spec_for("fast"), MESSAGES)
    assert reply.content == ""
    assert "finish_reason=length" in caplog.text and "completion_tokens=150" in caplog.text


def test_each_provider_gets_the_efforts_for_its_own_tiers(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings
    from app.models import client as client_mod

    s = get_settings()
    monkeypatch.setattr(s, "fast_reasoning_effort", "low")
    monkeypatch.setattr(s, "smart_reasoning_effort", "low")
    monkeypatch.setattr(s, "deep_reasoning_effort", "medium")
    baseten = client_mod._provider_client("baseten", "k", "http://b/v1", "fast", s)
    meta = client_mod._provider_client("meta", "k", "http://m/v1", "smart/deep", s)
    assert isinstance(baseten, MetaClient) and isinstance(meta, MetaClient)
    assert baseten._efforts == {"fast": "low"}
    assert meta._efforts == {"smart": "low", "deep": "medium"}
