"""Static description of every model the router may choose.

Meta models only: the smart/deep tiers run on the Meta Model API and the fast
tier is Meta's open-weight model served on Baseten. Costs are data, not
policy: the router picks on capability, and cost only feeds reporting and the
budget guard. Rates and context windows are unverified placeholders until the
live Meta probe (Gate 2b) confirms them.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.core.config import get_settings

Tier = Literal["fast", "smart", "deep"]
Provider = Literal["meta", "baseten"]

# Ordered cheap -> capable. Used for escalation.
TIERS: tuple[Tier, ...] = ("fast", "smart", "deep")


@dataclass(frozen=True, slots=True)
class ModelSpec:
    id: str
    tier: Tier
    provider: Provider
    strengths: tuple[str, ...]
    context_window: int
    input_cost_per_mtok: float
    output_cost_per_mtok: float
    notes: str

    @property
    def supports_planning(self) -> bool:
        return self.tier in ("smart", "deep")

    @property
    def supports_vision(self) -> bool:
        return self.tier == "deep"

    def cost_usd(self, *, prompt_tokens: int, completion_tokens: int) -> float:
        return (
            prompt_tokens * self.input_cost_per_mtok + completion_tokens * self.output_cost_per_mtok
        ) / 1_000_000


def _build() -> dict[Tier, ModelSpec]:
    s = get_settings()
    return {
        "fast": ModelSpec(
            id=s.model_fast,
            tier="fast",
            provider="baseten",
            strengths=(
                "intent classification",
                "habit/task extraction",
                "nudge sentences",
                "daily digest",
                "quiet-hours rewrite",
            ),
            context_window=131_072,  # Gate 2b: confirm against the Meta model list
            input_cost_per_mtok=0.0,  # Gate 2b: Meta pricing unpublished
            output_cost_per_mtok=0.0,  # Gate 2b: Meta pricing unpublished
            notes=(
                "Meta's open-weight tier served on Baseten (hackathon id). Default for everything."
            ),
        ),
        "smart": ModelSpec(
            id=s.model_smart,
            tier="smart",
            provider="meta",
            strengths=("tool-call planning", "multi-step reasoning", "weekly insight"),
            context_window=1_000_000,  # Gate 2b: confirm against the Meta model list
            input_cost_per_mtok=0.0,  # Gate 2b: Meta pricing unpublished
            output_cost_per_mtok=0.0,  # Gate 2b: Meta pricing unpublished
            notes=("Muse Spark on the Meta Model API. Strong agentic and tool calling."),
        ),
        "deep": ModelSpec(
            id=s.model_deep,
            tier="deep",
            provider="meta",
            strengths=("advisor gate", "multimodal", "hard planning"),
            context_window=1_000_000,  # Gate 2b: confirm against the Meta model list
            input_cost_per_mtok=0.0,  # Gate 2b: Meta pricing unpublished
            output_cost_per_mtok=0.0,  # Gate 2b: Meta pricing unpublished
            notes=(
                "Muse Spark at higher reasoning effort. Reviews the plan and the claimed result."
            ),
        ),
    }


REGISTRY: dict[Tier, ModelSpec] = _build()


def spec_for(tier: Tier) -> ModelSpec:
    try:
        return REGISTRY[tier]
    except KeyError as exc:
        raise ValueError(f"unknown tier {tier!r}; expected one of {TIERS}") from exc


def as_tier(value: str) -> Tier:
    """Narrow a configured string to a Tier, or fail loudly."""
    if value not in REGISTRY:
        raise ValueError(f"unknown tier {value!r}; expected one of {TIERS}")
    return value


def spec_for_id(model_id: str) -> ModelSpec | None:
    for spec in REGISTRY.values():
        if spec.id == model_id:
            return spec
    return None


def escalate(tier: Tier) -> Tier | None:
    """The next tier up, or None at the top."""
    i = TIERS.index(tier)
    return TIERS[i + 1] if i + 1 < len(TIERS) else None


def all_specs() -> list[ModelSpec]:
    return [REGISTRY[t] for t in TIERS]
