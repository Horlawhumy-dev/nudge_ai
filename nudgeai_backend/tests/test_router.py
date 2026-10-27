"""Phase 2 router: hard rules, escalation, and the registry.

The 20 labelled prompts are the literal Gate 2 requirement. These are
pure-function tests, so they need no database, no Redis, and no model call.
"""

from __future__ import annotations

from uuid import UUID

import pytest

from app.core.config import get_settings
from app.models.registry import REGISTRY, Tier, all_specs, escalate, spec_for
from app.models.router import (
    RouteDecision,
    RouteRequest,
    classify,
    escalate_decision,
    should_escalate,
)

USER = UUID("00000000-0000-4000-8000-000000000001")


def req(prompt: str, **kwargs: object) -> RouteRequest:
    return RouteRequest(
        user_id=USER,
        prompt=prompt,
        messages=[{"role": "user", "content": prompt}],
        **kwargs,  # type: ignore[arg-type]
    )


# (prompt, expected tier, has_image). Twenty cases: the Gate 2 gate.
# Vision prompts are flagged because a real client tells the router about the
# attachment; the text alone is indistinguishable from ordinary chat.
LABELS_20: list[tuple[str, Tier, bool]] = [
    # fast: single-shot, no tools, no planning
    ("what did I do today", "fast", False),
    ("thanks, that helps", "fast", False),
    ("summarise my streak", "fast", False),
    ("how many habits do I have", "fast", False),
    ("good morning", "fast", False),
    ("what is my name", "fast", False),
    ("rewrite this more warmly: task due", "fast", False),
    ("how am I doing this week", "fast", False),
    # smart: multi-step reasoning
    ("compare my running and swimming totals", "smart", False),
    ("step by step, how do I get back on track", "smart", False),
    ("prioritise my tasks for the week", "smart", False),
    ("diagnose why my mornings keep slipping", "smart", False),
    ("investigate the root cause of my slump", "smart", False),
    ("break down how to fit three habits into a morning", "smart", False),
    # deep: multimodal
    ("what does this screenshot say", "deep", True),
    ("read the text in this photo of my whiteboard", "deep", True),
    ("transcribe this", "deep", True),
    ("explain this diagram", "deep", True),
    ("what is written on this page", "deep", True),
    ("describe this photo", "deep", True),
]


@pytest.mark.parametrize(("prompt", "expected", "has_image"), LABELS_20)
def test_twenty_labelled_prompts(prompt: str, expected: Tier, has_image: bool) -> None:
    actual, _ = classify(req(prompt, has_image=has_image))
    assert actual == expected


def test_gate_two_counts_twenty() -> None:
    assert len(LABELS_20) == 20
    assert len({p for p, _, _ in LABELS_20}) == 20


# ------------------------------------------------------------------ hard rules


def test_single_tool_call_routes_smart() -> None:
    """One declared tool call is real orchestration, so fast is skipped."""
    assert classify(req("check my memories", expected_tool_calls=1))[0] == "smart"


def test_huge_context_routes_deep() -> None:
    limit = get_settings().planner_context_tokens
    assert classify(req("summarise", estimated_tokens=limit + 1))[0] == "deep"
    assert classify(req("summarise", estimated_tokens=limit))[0] == "fast"


def test_planning_with_two_tool_calls_routes_deep() -> None:
    tier, _ = classify(req("plan my week", requires_planning=True, expected_tool_calls=2))
    assert tier == "deep"


def test_hard_rules_precede_cheaper_signals() -> None:
    """Multimodal wins even when the prompt also looks like plain chat."""
    tier, reason = classify(req("thanks", has_image=True))
    assert tier == "deep"
    assert "vision" in reason


def test_reasons_are_specific() -> None:
    """A 'default' reason everywhere would make the router undemoable."""
    for prompt, _, _ in LABELS_20[:8]:
        _, reason = classify(req(prompt))
        assert reason
    _, multi = classify(req("compare a and b"))
    assert "multi-step" in multi


# ----------------------------------------------------------------- escalation


def test_low_confidence_escalates() -> None:
    trigger, why = should_escalate(low_confidence=True, tool_error_streak=0, at_top=False)
    assert trigger and why and "confidence" in why


def test_two_tool_errors_escalate() -> None:
    trigger, why = should_escalate(low_confidence=False, tool_error_streak=2, at_top=False)
    assert trigger and why and "tool errors" in why


def test_one_tool_error_does_not_escalate() -> None:
    """One bad tool result is usually the tool's fault, not the model's."""
    trigger, _ = should_escalate(low_confidence=False, tool_error_streak=1, at_top=False)
    assert not trigger


def test_nothing_escalates_at_the_top_tier() -> None:
    trigger, _ = should_escalate(low_confidence=True, tool_error_streak=5, at_top=True)
    assert not trigger


def test_escalate_decision_moves_one_tier_up() -> None:
    nxt = escalate_decision(RouteDecision(tier="fast", reason="x"), reason="because")
    assert nxt is not None and nxt.tier == "smart"
    assert nxt.escalated_from == "fast"


def test_escalate_decision_stops_at_deep() -> None:
    assert escalate_decision(RouteDecision(tier="deep", reason="x"), reason="y") is None


# ------------------------------------------------------------------- registry


def test_registry_has_three_distinct_models() -> None:
    assert len({s.id for s in all_specs()}) == 3
    assert set(REGISTRY) == {"fast", "smart", "deep"}


def test_deep_supports_vision_and_smart_supports_planning() -> None:
    assert spec_for("deep").supports_vision
    assert spec_for("smart").supports_planning
    assert not spec_for("fast").supports_vision


def test_escalate_helper() -> None:
    assert escalate("fast") == "smart"
    assert escalate("smart") == "deep"
    assert escalate("deep") is None


def test_cost_matches_published_rates() -> None:
    """cost_usd() must apply each tier's own registry rates.

    Absolute Meta rates are unpublished until Gate 2b (currently 0.0
    placeholders), so this pins the arithmetic, not the numbers. Gate 2b
    restores absolute assertions once Meta pricing is confirmed.
    """
    for spec in all_specs():
        assert spec.cost_usd(prompt_tokens=1_000_000, completion_tokens=0) == pytest.approx(
            spec.input_cost_per_mtok
        )
        assert spec.cost_usd(prompt_tokens=0, completion_tokens=1_000_000) == pytest.approx(
            spec.output_cost_per_mtok
        )
