"""One place that turns the user's tone settings into a style instruction for the models.

The same text steers chat replies, nudges, digests and insights, so changing "AI voice & tone"
in the app changes every voice the product has.
"""

from __future__ import annotations

from app.db.models import Preference

_TONES = {
    "gentle": "gentle and warm, like a friendly check-in",
    "firm": "direct and energetic, short punchy sentences that push the user to act now",
    "mix": "varied: warm on some days and firm on others, whichever suits the moment",
}


def style_text(
    *,
    tone: str = "gentle",
    use_name: bool = True,
    include_streak: bool = True,
    use_emojis: bool = False,
) -> str:
    """e.g. "gentle and warm, like a friendly check-in; use the user's name; ... no emojis"."""
    parts = [_TONES.get(tone, _TONES["gentle"])]
    parts.append("use the user's first name" if use_name else "do not use the user's name")
    parts.append(
        "mention their streak when it helps" if include_streak else "do not mention streaks"
    )
    parts.append("a few emojis are welcome" if use_emojis else "no emojis")
    return "; ".join(parts)


def style_for(prefs: Preference | None) -> str:
    """The style for a user's saved preferences (defaults when they have none yet)."""
    if prefs is None:
        return style_text()
    return style_text(
        tone=prefs.reminder_tone,
        use_name=prefs.use_name_in_reminders,
        include_streak=prefs.include_streak_in_reminders,
        use_emojis=prefs.use_emojis_in_reminders,
    )
