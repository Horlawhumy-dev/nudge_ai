"""The tool-call dispatch loop.

One user turn becomes at most `executor_max_hops` model calls. The loop:

1. routes the turn,
2. calls the model,
3. runs read-only tools, converts mutating ones into proposals,
4. feeds results back and goes round again,
5. stops on a plain reply, on the hop cap, or on two consecutive tool errors.

`run()` on a mutating tool is never reached from here. That is the whole point:
the only route from a proposal to a write is `ai/proposals.confirm`.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from app.ai import proposals as proposals_mod
from app.core import metrics
from app.core.config import get_settings
from app.models.client import ChatClient, ModelError, cost_of, get_client
from app.models.registry import Tier
from app.models.router import (
    RouteDecision,
    RouteRequest,
    TieredRouter,
    escalate_decision,
    should_escalate,
)
from app.tools.base import ToolError, ToolRegistry

log = logging.getLogger(__name__)


@dataclass(slots=True)
class Hop:
    tier: Tier
    reason: str
    tool_names: tuple[str, ...]
    escalated: bool = False


@dataclass(slots=True)
class TurnResult:
    """Everything one turn produced. The chat endpoint streams from this."""

    content: str
    tier: Tier
    model_id: str
    reason: str
    hops: list[Hop] = field(default_factory=list)
    tool_results: list[dict[str, Any]] = field(default_factory=list)
    proposals: list[dict[str, Any]] = field(default_factory=list)
    degraded: bool = False
    cached: bool = False
    escalations: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "tier": self.tier,
            "model": self.model_id,
            "reason": self.reason,
            "hops": len(self.hops),
            "escalations": self.escalations,
            "degraded": self.degraded,
            "cached": self.cached,
            "proposed": len(self.proposals),
            "cost_usd": round(self.cost_usd, 8),
        }


def _fingerprint(name: str, args: dict[str, Any]) -> str:
    """Identity of a tool call, independent of the id the model invented.

    Key order is normalised so `{a:1,b:2}` and `{b:2,a:1}` are the same call.
    """
    canonical = json.dumps(args, sort_keys=True, default=str)
    return f"{name}:{canonical}"


def _truncate(value: Any, limit: int) -> Any:
    """Keep a tool result small enough to be worth paying to send back."""
    text = json.dumps(value, default=str)
    if len(text) <= limit:
        return value
    clipped = text[:limit] + f"...[truncated {len(text) - limit} chars]"
    return {"truncated": True, "preview": clipped}


class Executor:
    def __init__(
        self,
        *,
        router: TieredRouter | None = None,
        client: ChatClient | None = None,
    ) -> None:
        self.router = router or TieredRouter()
        self.client = client or get_client()

    async def run(
        self,
        *,
        user_id: UUID,
        prompt: str,
        messages: list[dict[str, Any]],
        registry: ToolRegistry,
        session: Any,
        has_image: bool = False,
        requires_planning: bool | None = None,
        expected_tool_calls: int = 0,
    ) -> TurnResult:
        s = get_settings()
        max_hops = s.executor_max_hops
        tool_error_streak = 0
        seen_calls: set[str] = set()
        tool_results: list[dict[str, Any]] = []
        result_proposals: list[dict[str, Any]] = []
        hops: list[Hop] = []
        escalations = 0

        req = RouteRequest(
            user_id=user_id,
            prompt=prompt,
            messages=messages,
            session=session,
            has_image=has_image,
            requires_planning=requires_planning,
            expected_tool_calls=expected_tool_calls,
        )
        decision = await self.router.route(req)

        # Cache hit: no model call, no hop, no spend.
        if decision.cache_hit:
            metrics.route_decisions_total.labels(tier="fast", reason="cache hit").inc()
            return TurnResult(
                content=decision.cached_reply or "",
                tier="fast",
                model_id="cache",
                reason=decision.reason,
                cached=True,
            )

        content = ""
        prompt_tokens = 0
        completion_tokens = 0
        cost_usd = 0.0
        for _hop in range(max_hops):
            reply, call_cost = await self._call(user_id, decision, messages, registry)
            prompt_tokens += reply.prompt_tokens
            completion_tokens += reply.completion_tokens
            cost_usd += call_cost
            content = reply.content or content

            # A reply with neither words nor a tool call is a dead end. Spending
            # the remaining hops on it just pays for the same empty answer.
            if not reply.wants_tool and not reply.content.strip():
                log.info("model returned an empty reply; ending the turn")
                break

            # Escalate before acting on a reply the model flagged as unsure.
            trigger, why = should_escalate(
                low_confidence=reply.low_confidence,
                tool_error_streak=tool_error_streak,
                at_top=decision.tier == "deep",
            )
            if trigger and why:
                nxt = escalate_decision(decision, reason=f"escalated: {why}")
                if nxt is not None:
                    log.info("escalating turn to %s: %s", nxt.tier, why)
                    decision = nxt
                    escalations += 1
                    continue

            if not reply.wants_tool:
                hops.append(Hop(decision.tier, decision.reason, ()))
                break

            names = tuple(c.name for c in reply.tool_calls)
            hops.append(Hop(decision.tier, decision.reason, names))
            messages = messages + [
                {"role": "assistant", "content": reply.content or "(calling tools)"}
            ]

            duplicates = 0
            proposed = 0
            for call in reply.tool_calls:
                # Dedupe on the *call*, not its id. A model that loops mints a
                # fresh id every hop, so an id-keyed guard never fires: observed
                # live as four identical memory_recall calls costing 3m23s.
                fingerprint = _fingerprint(call.name, call.arguments)
                if fingerprint in seen_calls:
                    duplicates += 1
                    log.warning(
                        "skipping repeated tool call %s(%s): already run this turn",
                        call.name,
                        call.arguments,
                    )
                    tool_results.append(
                        {
                            "tool": call.name,
                            "ok": False,
                            "error": (
                                "identical call already made this turn; its result is "
                                "above. Answer now using what you already have."
                            ),
                        }
                    )
                    continue
                seen_calls.add(fingerprint)

                registered = registry.get(call.name)
                if registered is None:
                    tool_results.append({"tool": call.name, "error": "no such tool", "ok": False})
                    tool_error_streak += 1
                    continue

                if registered.spec.mutating:
                    row = await proposals_mod.create(
                        session, user_id, call_id=call.id, tool=registered, args=call.arguments
                    )
                    result_proposals.append(proposals_mod.to_schema(row))
                    proposed += 1
                    tool_results.append(
                        {"tool": call.name, "ok": True, "proposed": True, "id": str(row.id)}
                    )
                    continue

                try:
                    output = await registered.tool.run(user_id, call.arguments, registered.session)
                    tool_results.append(
                        {
                            "tool": call.name,
                            "ok": True,
                            "content": _truncate(output, s.max_tool_result_chars),
                        }
                    )
                except ToolError as exc:
                    log.info("tool %s failed: %s", call.name, exc.message)
                    metrics.tool_calls_total.labels(tool=call.name, result="error").inc()
                    tool_results.append({"tool": call.name, "ok": False, "error": exc.message})
                    tool_error_streak += 1

            # Every call only became a confirmation card, and the model already said something
            # with it ("I'll book that dentist visit..."). There is nothing new to read back, so
            # another round trip would only reword the same sentence (2.5 to 3 s on each turn).
            if reply.content.strip() and proposed == len(reply.tool_calls):
                log.info("proposals created with a reply in hand; ending the turn early")
                break

            messages = messages + [
                {
                    "role": "user",
                    "content": json.dumps(
                        {"tool_results": tool_results[-len(reply.tool_calls) :]}, default=str
                    ),
                }
            ]

            # Every call this hop was a repeat: the model is stuck. End the turn
            # on the best content we have rather than paying for another lap.
            if duplicates == len(reply.tool_calls):
                log.info("all %d tool calls were repeats; ending the turn", duplicates)
                break

            # Two consecutive failures mean the model is flailing: escalate once
            # rather than burning the remaining hops on the same mistake.
            if tool_error_streak >= 2 and decision.tier != "deep":
                nxt = escalate_decision(
                    decision, reason=f"escalated: {tool_error_streak} consecutive tool errors"
                )
                if nxt is not None:
                    decision = nxt
                    escalations += 1
                    tool_error_streak = 0
                    continue

        return TurnResult(
            content=content or "I could not produce a reply for that.",
            tier=decision.tier,
            model_id=decision.spec().id if not decision.degraded else decision.spec().id,
            reason=decision.reason,
            hops=hops,
            tool_results=tool_results,
            proposals=result_proposals,
            degraded=decision.degraded,
            escalations=escalations,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=cost_usd,
        )

    async def _call(
        self,
        user_id: UUID,
        decision: RouteDecision,
        messages: list[dict[str, Any]],
        registry: ToolRegistry,
    ) -> tuple[Any, float]:
        """Returns the reply and its cost, having charged the budget already."""
        spec = decision.spec()
        tools = registry.openai_tools() or None
        try:
            reply = await self.client.complete(spec, messages, tools=tools)
        except ModelError as exc:
            # Surface the failure as a reply rather than a 500, and say so plainly.
            log.error("model call failed: %s", exc)
            metrics.model_calls_total.labels(model=spec.id, tier=spec.tier, result="error").inc()
            return _ErrorReply(f"model unavailable: {exc}"), 0.0
        cost = cost_of(reply)
        metrics.record_model_call(
            model=spec.id,
            tier=spec.tier,
            prompt_tokens=reply.prompt_tokens,
            completion_tokens=reply.completion_tokens,
            cost_usd=cost,
            latency_seconds=reply.latency_ms / 1000,
        )
        await self.router.charge(
            RouteRequest(user_id=user_id, prompt="", messages=[]),
            prompt_tokens=reply.prompt_tokens,
            completion_tokens=reply.completion_tokens,
        )
        return reply, cost


@dataclass(frozen=True, slots=True)
class _ErrorReply:
    """Stand-in reply for a failed call, shaped like ModelReply."""

    content: str
    tool_calls: tuple[Any, ...] = ()
    prompt_tokens: int = 0
    completion_tokens: int = 0
    model_id: str = "error"
    latency_ms: float = 0.0
    cached: bool = False
    low_confidence: bool = False

    @property
    def wants_tool(self) -> bool:
        return False
