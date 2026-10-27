"""Deterministic tier router with escalation and a budget guard.

The plan's first rule is the one that matters: never spend a model call to
decide routing. So classification here is pure, inspectable Python over signals
the caller already has. Each decision carries the `reason` that produced it,
which is what makes the router demonstrable rather than a black box.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from app.core import metrics
from app.core.config import get_settings
from app.models import budgets
from app.models.registry import Tier, as_tier, escalate, spec_for

log = logging.getLogger(__name__)


# Signals the model itself cannot be trusted to report, so they are matched here.
# Stems carry an explicit \w* because a trailing \b cannot match mid-word:
# "diagnos\b" does not match "diagnose".
_MULTI_STEP = re.compile(
    r"\b(step[- ]by[- ]step|and then|break (?:it |this )?down|multi[- ]step"
    r"|prioritis\w*|prioritiz\w*|trade[- ]?off|root cause|diagnos\w*|figure out"
    r"|investigat\w*|compar\w*|weigh up|organis\w*|organiz\w*|optimis\w*|optimiz\w*)\b",
    re.IGNORECASE,
)
_PLANNING = re.compile(
    r"\b(plan|schedule|reschedule|move|reorder|prioritis|prioritiz|fit|arrange)\b",
    re.IGNORECASE,
)
# A turn that wants a write. Used to keep the response cache out of the way and
# to pick the smart tier when the caller has not already counted the calls.
_TOOL_INTENT = re.compile(
    r"\b(remind|schedule|book|log|record|track|add|create|delete|remove"
    r"|remember|note down|block|move)\b",
    re.IGNORECASE,
)


def estimate_tokens(messages: list[dict[str, Any]]) -> int:
    """Cheap upper-bound estimate. Only ever used against a 200k threshold."""
    chars = sum(len(str(m.get("content") or "")) for m in messages)
    return chars // 3


@dataclass(slots=True)
class RouteRequest:
    user_id: UUID
    prompt: str
    messages: list[dict[str, Any]]
    session: Any = field(repr=False, default=None)
    has_image: bool = False
    estimated_tokens: int | None = None
    requires_planning: bool | None = None
    expected_tool_calls: int = 0
    tool_error_streak: int = 0
    enable_cache: bool = True

    @property
    def tokens(self) -> int:
        if self.estimated_tokens is not None:
            return self.estimated_tokens
        return estimate_tokens(self.messages)

    @property
    def planning(self) -> bool:
        if self.requires_planning is not None:
            return self.requires_planning
        return bool(_PLANNING.search(self.prompt))


@dataclass(frozen=True, slots=True)
class RouteDecision:
    tier: Tier
    reason: str
    degraded: bool = False
    cached_reply: str | None = None
    cache_similarity: float = 0.0
    escalated_from: Tier | None = None

    @property
    def cache_hit(self) -> bool:
        return self.cached_reply is not None

    def spec(self) -> Any:
        return spec_for(self.tier)


class ModelRouter:
    """Protocol-shaped base so a different router can be swapped in."""

    async def route(self, req: RouteRequest) -> RouteDecision:
        raise NotImplementedError


def classify(req: RouteRequest) -> tuple[Tier, str]:
    """The hard rules, in order. Pure: no I/O, no model, no clock."""
    if req.has_image:
        return "deep", "multimodal input requires the vision-capable tier"
    if req.tokens > get_settings().planner_context_tokens:
        return "deep", f"context {req.tokens} tokens exceeds the planner limit"
    if req.planning and req.expected_tool_calls >= 2:
        return "deep", f"planning across {req.expected_tool_calls} tool calls"
    if req.expected_tool_calls >= 1:
        return "smart", f"{req.expected_tool_calls} tool call(s) to plan"
    if _MULTI_STEP.search(req.prompt):
        return "smart", "multi-step reasoning detected in the prompt"
    return "fast", "default: single-shot reply with no tool calls"


class TieredRouter(ModelRouter):
    """Cache in front, hard rules, budget guard, then the tier."""

    def __init__(self, *, use_cache: bool = True, use_budget: bool = True) -> None:
        self.use_cache = use_cache
        self.use_budget = use_budget

    async def route(self, req: RouteRequest) -> RouteDecision:
        s = get_settings()

        # 1. Response cache. Only for turns that cannot want a tool call,
        #    otherwise a cached "sure, done" would hide a required write.
        if (
            self.use_cache
            and req.enable_cache
            and not req.has_image
            and req.expected_tool_calls == 0
        ):
            hit = await self._cache_lookup(req)
            if hit is not None:
                reply, similarity = hit
                metrics.cache_lookups_total.labels(result="hit").inc()
                return RouteDecision(
                    tier="fast",
                    reason="semantic response cache hit",
                    cached_reply=reply,
                    cache_similarity=similarity,
                )
            metrics.cache_lookups_total.labels(result="miss").inc()

        tier, reason = classify(req)

        # 2. Budget guard. Degrade, never error.
        if self.use_budget:
            state = await budgets.snapshot(req.user_id)
            if state.exhausted:
                metrics.budget_rejections_total.inc()
                pinned = as_tier(s.budget_degraded_model)
                if tier != pinned:
                    reason = f"{reason}; budget exhausted, pinned to {pinned}"
                return RouteDecision(tier=pinned, reason=reason, degraded=True)

        metrics.route_decisions_total.labels(tier=tier, reason=reason).inc()
        return RouteDecision(tier=tier, reason=reason)

    async def _cache_lookup(self, req: RouteRequest) -> tuple[str, float] | None:
        if req.session is None:
            return None
        from app.services.memory_service import cache_lookup

        try:
            found = await cache_lookup(req.session, req.user_id, prompt=req.prompt)
        except Exception as exc:  # noqa: BLE001 — a cold cache must not fail a turn
            log.warning("response cache lookup failed, continuing: %s", exc)
            return None
        if found is None:
            return None
        reply, _model_id, similarity = found
        return reply, similarity

    async def charge(
        self, req: RouteRequest, *, prompt_tokens: int, completion_tokens: int
    ) -> None:
        """Record the spend against the user's daily ceiling."""
        if not self.use_budget:
            return
        await budgets.charge(req.user_id, tokens=prompt_tokens + completion_tokens)


def escalate_decision(
    decision: RouteDecision, *, reason: str, from_tier: Tier | None = None
) -> RouteDecision | None:
    """One tier up, or None at the top. Records the move."""
    nxt = escalate(decision.tier)
    if nxt is None:
        return None
    metrics.route_escalations_total.labels(from_tier=decision.tier, to_tier=nxt).inc()
    return RouteDecision(
        tier=nxt,
        reason=reason,
        degraded=decision.degraded,
        escalated_from=from_tier or decision.tier,
    )


def should_escalate(
    *, low_confidence: bool, tool_error_streak: int, at_top: bool
) -> tuple[bool, str | None]:
    """The plan's escalation rule, as a pure function.

    A `low_confidence` marker, or two consecutive tool errors, re-runs the turn
    one tier up. Two failures is the trigger because a single bad tool result is
    usually the tool's fault, not the model's.
    """
    if at_top:
        return False, None
    if low_confidence:
        return True, "model reported low confidence"
    if tool_error_streak >= 2:
        return True, f"{tool_error_streak} consecutive tool errors"
    return False, None
