"""The words of a task reminder, in the person's chosen tone. Pure: no database, no clock."""

from __future__ import annotations

TITLE_MAX = 60


def clock_label(hhmm: str) -> str:
    """ "15:00" -> "3:00 pm"."""
    hour, minute = int(hhmm[:2]), int(hhmm[3:5])
    suffix = "pm" if hour >= 12 else "am"
    return f"{hour % 12 or 12}:{minute:02d} {suffix}"


def _short(title: str) -> str:
    title = " ".join(title.split())
    return title if len(title) <= TITLE_MAX else title[: TITLE_MAX - 1].rstrip() + "…"


def task_reminder(
    *,
    title: str,
    start_time: str,
    minutes_left: int,
    tone: str | None,
    name: str | None,
    emojis: bool,
) -> tuple[str, str]:
    """(headline, body) for a task that is about to start."""
    task = _short(title)
    at = clock_label(start_time)
    if minutes_left <= 0:
        headline = f"{task} starts now"
    elif minutes_left == 1:
        headline = f"{task} in 1 min"
    else:
        headline = f"{task} in {minutes_left} min"

    who = (name or "").strip()
    if tone == "firm":
        body = f"{who + '. ' if who else ''}{task}, {at}. Time to move."
    elif tone == "mix":
        body = f"{who + ', ' if who else ''}{task} is coming up at {at}."
    else:  # gentle, and anything unrecognised
        body = f"{'Hey ' + who + ', ' if who else ''}{task} starts at {at}. You've got this."
    if emojis:
        body += " ⏰"
    return headline, body
