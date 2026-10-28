"""Nudge wording: the only place the engine touches a model.

The Decision Engine decides *whether* to nudge; this module writes the
sentence the user reads. Everything composes on the ``fast`` tier — Muse
Spark Open on Baseten — and every call records the model id and token counts
so the nudge row can carry the full trace (rule log → model → tokens → text).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core import metrics
from app.models.client import ChatClient, cost_of
from app.models.registry import spec_for

NUDGE_SYSTEM = (
    "You write one-sentence push-notification nudges for a productivity "
    "companion. One sentence, under 140 characters, no hashtag, no emoji. "
    "Name the habit. Sound like a thoughtful coach, never a scold."
)

DIGEST_SYSTEM = (
    "You write a short morning-digest push notification that folds several "
    "habits into one message. Two sentences max, under 240 characters, no "
    "hashtag, no emoji. Name each habit once."
)

INSIGHT_SYSTEM = (
    "You phrase one short insight sentence from the user's productivity "
    "numbers. One sentence, under 180 characters. State the fact, then one "
    "concrete suggestion. Never invent numbers that are not listed."
)


@dataclass(frozen=True, slots=True)
class Composed:
    text: str
    model_id: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: float


async def _compose(
    model_client: ChatClient,
    *,
    system: str,
    user_prompt: str,
    tone: str | None,
) -> Composed:
    if tone:
        system = f"{system} The user asked for a {tone} tone."
    spec = spec_for("fast")
    reply = await model_client.complete(
        spec,
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
    )
    metrics.record_model_call(
        model=reply.model_id or spec.id,
        tier="fast",
        prompt_tokens=reply.prompt_tokens,
        completion_tokens=reply.completion_tokens,
        cost_usd=cost_of(reply),
        latency_seconds=reply.latency_ms / 1000,
    )
    return Composed(
        text=reply.content.strip(),
        model_id=reply.model_id or spec.id,
        prompt_tokens=reply.prompt_tokens,
        completion_tokens=reply.completion_tokens,
        latency_ms=reply.latency_ms,
    )


async def compose_nudge(
    model_client: ChatClient,
    *,
    user_name: str | None,
    tone: str | None,
    habit_name: str,
    streak_current: int,
    priority: bool,
) -> Composed:
    """One sentence for one habit. Priority streaks say the streak is at risk."""
    who = f" for {user_name}" if user_name else ""
    facts = f"Nudge{who} to do '{habit_name}'."
    if streak_current > 0:
        facts += f" Current streak: {streak_current} day(s)."
    if priority:
        facts += " The streak breaks if they skip today — say so plainly."
    return await _compose(model_client, system=NUDGE_SYSTEM, user_prompt=facts, tone=tone)


async def compose_digest(
    model_client: ChatClient,
    *,
    user_name: str | None,
    tone: str | None,
    habits: list[str],
) -> Composed:
    """One message folding several due habits together."""
    who = f" for {user_name}" if user_name else ""
    facts = f"Morning digest{who}. Due habits: {', '.join(habits)}."
    return await _compose(model_client, system=DIGEST_SYSTEM, user_prompt=facts, tone=tone)


async def phrase_insight(
    model_client: ChatClient, *, tone: str | None, numbers: dict[str, Any]
) -> Composed:
    """Phrase precomputed numbers. The model never computes, only words."""
    facts = "\n".join(f"- {key}: {value}" for key, value in numbers.items())
    return await _compose(
        model_client, system=INSIGHT_SYSTEM, user_prompt=f"Numbers:\n{facts}", tone=tone
    )


__all__ = ["Composed", "compose_digest", "compose_nudge", "phrase_insight"]
