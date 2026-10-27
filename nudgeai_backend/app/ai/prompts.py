"""System prompt assembly: persona, tone, and few-shots.

Kept as data so the persona is editable without touching call sites, and so the
executor can be tested against a known prompt.
"""

from __future__ import annotations

import json
from typing import Any

PERSONA = (
    "You are Nudge, a personal assistant that helps one person stay consistent "
    "with the habits and tasks they set for themselves. You are warm, brief, and "
    "concrete. You never guilt, never nag, and never pad an answer. You say the "
    "thing and stop."
)

TONE_RULES = (
    "Ask at most one question per reply. Prefer a concrete next action over "
    "general advice. If you are unsure, say so plainly instead of guessing. When "
    "you call a tool that changes something, describe it as a proposal awaiting "
    "confirmation rather than as something already done."
)

# Kept short on purpose: few-shots are paid on every single turn.
FEW_SHOTS: tuple[dict[str, str], ...] = (
    {
        "user": "remind me to stretch every morning",
        "assistant": (
            "I'll propose that as a recurring morning habit. Confirm it and it'll "
            "appear in your morning nudges."
        ),
    },
    {
        "user": "how am I doing on sleep?",
        "assistant": "Let me check what you've logged.",
    },
)

PROPOSAL_NOTICE = (
    "You cannot change anything directly. Tools that write return a proposal the "
    "user must confirm. Say what you are proposing, not what you have done."
)


def _history_to_messages(history: list[dict[str, str]]) -> list[dict[str, Any]]:
    return [{"role": h["role"], "content": h["content"]} for h in history]


def system_prompt(*, tone: str | None = None, has_tools: bool = True) -> str:
    parts = [PERSONA, TONE_RULES]
    if tone:
        parts.append(f"Current tone setting: {tone}.")
    if has_tools:
        parts.append(PROPOSAL_NOTICE)
    return "\n\n".join(parts)


def build_messages(
    *,
    history: list[dict[str, str]],
    prompt: str,
    tool_results: list[dict[str, Any]] | None = None,
    retrieved: list[dict[str, Any]] | None = None,
    tone: str | None = None,
    has_tools: bool = True,
) -> list[dict[str, Any]]:
    """Assemble the full message list, oldest first.

    Retrieved memory is folded into the system turn rather than the user turn so
    it reads as context, not as something the user just said.
    """
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt(tone=tone, has_tools=has_tools)}
    ]

    if retrieved:
        lines = "\n".join(f"- {r.get('body', '')}" for r in retrieved)
        messages[0]["content"] += f"\n\nWhat you already know about this user:\n{lines}"

    messages.extend(_history_to_messages(history))
    if prompt:
        messages.append({"role": "user", "content": prompt})

    for result in tool_results or []:
        messages.append(
            {
                "role": "user",
                "content": f"[tool_result {result['tool']}]\n{json.dumps(result['content'])}",
            }
        )
    return messages
