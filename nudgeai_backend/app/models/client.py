"""Meta chat clients: timeouts, retries, token accounting, and an offline fake.

Meta models only, through two doors: the smart/deep tiers run on the Meta
Model API and the fast tier is Meta's open-weight model served on Baseten.
Both expose an OpenAI-compatible surface, so the `openai` client is used
directly rather than hand-rolling HTTP.

The fake is not a stub for convenience: the router's escalation, the executor's
multi-hop loop, and the proposal gate are all only testable if model calls are
deterministic and free. `get_client()` returns the fake whenever there is no
API key or `FORCE_FAKE_MODELS` is set, so a missing key degrades to a
clearly-labelled fake instead of a runtime crash mid-demo.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.core.config import Settings, get_settings
from app.models.registry import ModelSpec, Provider, spec_for_id

log = logging.getLogger(__name__)


class ModelError(Exception):
    """A model call failed. `retryable` drives the client's backoff."""


@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]

    @classmethod
    def parse(cls, raw: str) -> dict[str, Any]:
        """Tolerate models that emit JSON wrapped in prose or a code fence."""
        text = raw.strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text).strip()
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            start, end = text.find("{"), text.rfind("}")
            if start == -1 or end <= start:
                raise ModelError(f"tool arguments were not JSON: {text[:120]!r}") from None
            try:
                data = json.loads(text[start : end + 1])
            except json.JSONDecodeError as exc:
                raise ModelError(f"tool arguments were not valid JSON: {text[:120]!r}") from exc
        if not isinstance(data, dict):
            raise ModelError("tool arguments must be a JSON object")
        return data


@dataclass(frozen=True, slots=True)
class ModelReply:
    content: str
    tool_calls: tuple[ToolCall, ...] = ()
    prompt_tokens: int = 0
    completion_tokens: int = 0
    model_id: str = ""
    latency_ms: float = 0.0
    cached: bool = False
    low_confidence: bool = False

    @property
    def wants_tool(self) -> bool:
        return bool(self.tool_calls)


class ChatClient(Protocol):
    async def complete(
        self,
        spec: ModelSpec,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.3,
    ) -> ModelReply: ...


# --------------------------------------------------------------------- real


class MetaClient:
    """OpenAI-compatible client for one Meta endpoint.

    Construct one per provider (Meta Model API, Baseten); `RoutedClient`
    dispatches each turn to the client that owns the tier.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str,
        *,
        timeout: float,
        max_retries: int,
        backoff: float,
        reasoning_efforts: dict[str, str] | None = None,
    ) -> None:
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=timeout)
        self._max_retries = max_retries
        self._backoff = backoff
        # How hard each tier thinks, sent as an extra body field. A reasoning model waits on (and
        # bills) its hidden thinking, so this is the main latency dial. Missing = provider default.
        self._efforts = {
            tier: effort for tier, effort in (reasoning_efforts or {}).items() if effort
        }

    async def complete(
        self,
        spec: ModelSpec,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.3,
    ) -> ModelReply:
        import time

        kwargs: dict[str, Any] = {
            "model": spec.id,
            "messages": messages,
            "temperature": temperature,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        effort = self._efforts.get(spec.tier)
        if effort:
            kwargs["extra_body"] = {"reasoning_effort": effort}

        last: Exception | None = None
        for attempt in range(self._max_retries + 1):
            started = time.perf_counter()
            try:
                resp = await self._client.chat.completions.create(**kwargs)
            except Exception as exc:  # noqa: BLE001 — SDK raises a wide family
                last = exc
                if attempt == self._max_retries or not _is_retryable(exc):
                    break
                # Exponential backoff with jitter, so retries do not synchronise.
                delay = self._backoff * (2**attempt) * (0.5 + random.random() / 2)  # noqa: S311
                log.warning(
                    "model call to %s failed (attempt %d/%d): %s; retrying in %.2fs",
                    spec.id,
                    attempt + 1,
                    self._max_retries + 1,
                    exc,
                    delay,
                )
                await asyncio.sleep(delay)
                continue

            latency = (time.perf_counter() - started) * 1000
            usage = getattr(resp, "usage", None)
            prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
            completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
            choice = resp.choices[0].message
            calls: list[ToolCall] = []
            for tc in getattr(choice, "tool_calls", None) or []:
                calls.append(
                    ToolCall(
                        id=tc.id,
                        name=tc.function.name,
                        arguments=ToolCall.parse(tc.function.arguments),
                    )
                )
            content = (choice.content or "").strip()
            if not content and not calls:
                # A reasoning model that hits a token limit spends it all on thinking and answers
                # nothing. Say so, rather than leaving an unexplained empty reply.
                log.warning(
                    "%s returned no answer (finish_reason=%s, completion_tokens=%d)",
                    spec.id,
                    getattr(resp.choices[0], "finish_reason", None),
                    completion_tokens,
                )
            return ModelReply(
                content=content,
                tool_calls=tuple(calls),
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                model_id=spec.id,
                latency_ms=latency,
                low_confidence=LOW_CONFIDENCE.search(content) is not None,
            )

        raise ModelError(
            f"{spec.id} failed after {self._max_retries + 1} attempts: {last}"
        ) from last


def _is_retryable(exc: Exception) -> bool:
    """Rate limits and 5xx are worth retrying; a 400 will never succeed."""
    status = getattr(exc, "status_code", None) or getattr(
        getattr(exc, "response", None), "status_code", None
    )
    if status is None:
        return isinstance(exc, (TimeoutError, ConnectionError))
    return status == 429 or 500 <= int(status) < 600


# The escalation signal the plan calls for: the cheap model marks its own
# uncertainty, and the router re-runs the turn one tier up.
LOW_CONFIDENCE = re.compile(r"\[\[low_confidence\]\]", re.IGNORECASE)


class RoutedClient:
    """Dispatches each turn to the per-provider client that owns the tier.

    Adding a provider later is one map entry here plus one `Provider` member;
    tiers, callers, and the executor never change.
    """

    def __init__(self, clients: dict[Provider, ChatClient]) -> None:
        self._clients = clients

    async def complete(
        self,
        spec: ModelSpec,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.3,
    ) -> ModelReply:
        try:
            client = self._clients[spec.provider]
        except KeyError as exc:
            raise ModelError(f"no client configured for provider {spec.provider!r}") from exc
        return await client.complete(spec, messages, tools=tools, temperature=temperature)


# --------------------------------------------------------------------- fake


@dataclass(slots=True)
class FakeClient:
    """Deterministic, offline stand-in for the Meta endpoints.

    Rules match on a substring of the last user message, and may additionally be
    scoped to a `model` or to the `nth` call of that model. Those two filters are
    what make multi-hop and escalation behaviour testable: the second call of a
    turn reuses the same prompt, so a rule keyed only on text cannot tell hop one
    from hop two.
    """

    rules: list[dict[str, Any]] = field(default_factory=list)
    default: dict[str, Any] = field(default_factory=lambda: {"content": "ack"})
    calls: list[dict[str, Any]] = field(default_factory=list)
    #: Model id -> number of times it has been called, for escalation assertions.
    call_counts: dict[str, int] = field(default_factory=dict)

    def script(
        self, needle: str, *, model: str | None = None, nth: int | None = None, **reply: Any
    ) -> FakeClient:
        self.rules.append({"needle": needle, "model": model, "nth": nth, **reply})
        return self

    @staticmethod
    def _prompt_of(messages: list[dict[str, Any]]) -> str:
        """The turn's real prompt, ignoring injected tool-result turns.

        After a tool hop the last user message is the JSON tool payload, not
        anything the user typed, so matching on "last user message" alone would
        stop finding the script on hop two.
        """
        for message in reversed(messages):
            if message.get("role") != "user":
                continue
            content = str(message.get("content", ""))
            if content.lstrip().startswith('{"tool_results"'):
                continue
            return content
        return ""

    def _match(
        self, messages: list[dict[str, Any]], spec_id: str, call_index: int
    ) -> dict[str, Any]:
        prompt = self._prompt_of(messages).lower()
        for rule in self.rules:
            if rule["model"] is not None and rule["model"] != spec_id:
                continue
            if rule["nth"] is not None and rule["nth"] != call_index:
                continue
            if rule["needle"].lower() in prompt:
                return rule
        return self.default

    async def complete(
        self,
        spec: ModelSpec,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.3,
    ) -> ModelReply:
        self.calls.append({"model": spec.id, "messages": messages, "tools": tools})
        self.call_counts[spec.id] = self.call_counts.get(spec.id, 0) + 1
        reply = self._match(messages, spec.id, self.call_counts[spec.id])
        calls: list[ToolCall] = []
        for i, raw in enumerate(reply.get("tool_calls", [])):
            calls.append(
                ToolCall(
                    id=raw.get("id", f"call_{i}"),
                    name=raw["name"],
                    arguments=raw.get("arguments", {}),
                )
            )
        content = str(reply.get("content", ""))
        # Deterministic pseudo-token counts: enough to drive budget accounting
        # without pretending to be a real tokenizer.
        prompt_tokens = sum(len(str(m.get("content", ""))) for m in messages) // 4
        completion_tokens = len(content) // 4
        return ModelReply(
            content=content,
            tool_calls=tuple(calls),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            model_id=spec.id,
            latency_ms=1.0,
            low_confidence=bool(reply.get("low_confidence", False)),
        )


# ------------------------------------------------------------------ factory


def _provider_client(
    provider: Provider,
    key: str,
    base_url: str,
    tiers: str,
    s: Settings,
) -> ChatClient:
    """The real client for one provider, or a loudly-logged fake.

    A key without its base URL is treated as unconfigured: constructing the
    SDK client against a wrong default URL would fail confusingly mid-demo,
    while the fake says exactly what is missing.
    """
    if key and base_url:
        log.info("model client: %s endpoint via %s", provider, base_url)
        return MetaClient(
            key,
            base_url,
            timeout=s.model_timeout_seconds,
            max_retries=s.model_max_retries,
            backoff=s.model_retry_backoff_seconds,
            reasoning_efforts=(
                {"fast": s.fast_reasoning_effort}
                if provider == "baseten"
                else {"smart": s.smart_reasoning_effort, "deep": s.deep_reasoning_effort}
            ),
        )
    if key:
        log.warning(
            "model client: %s tiers (%s) FAKE — key is set but the base URL is empty",
            provider,
            tiers,
        )
    else:
        log.warning("model client: %s tiers (%s) FAKE — no API key", provider, tiers)
    return FakeClient()


_client: ChatClient | None = None


def get_client() -> ChatClient:
    """Real clients when keys are present, otherwise the clearly-logged fake."""
    global _client
    if _client is not None:
        return _client
    s = get_settings()
    if s.force_fake_models or (not s.meta_api_key and not s.baseten_api_key):
        log.warning(
            "model client: FAKE (no META_API_KEY/BASETEN_API_KEY or "
            "FORCE_FAKE_MODELS=true). Responses are scripted, not generated."
        )
        _client = FakeClient()
        return _client
    _client = RoutedClient(
        {
            "meta": _provider_client("meta", s.meta_api_key, s.meta_api_base_url, "smart/deep", s),
            "baseten": _provider_client(
                "baseten", s.baseten_api_key, s.baseten_base_url, "fast", s
            ),
        }
    )
    return _client


def set_client(client: ChatClient | None) -> None:
    """Override the client. Tests use this to install a scripted fake."""
    global _client
    _client = client


def cost_of(reply: ModelReply) -> float:
    spec = spec_for_id(reply.model_id)
    if spec is None:
        return 0.0
    return spec.cost_usd(
        prompt_tokens=reply.prompt_tokens, completion_tokens=reply.completion_tokens
    )
