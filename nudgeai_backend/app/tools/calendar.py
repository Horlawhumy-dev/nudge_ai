"""Read-only calendar tool.

Spec §27 says the assistant proposes rather than writes, so there is no event
creation here at all: only `freeBusy.query`. Behind `CALENDAR_ENABLED`, with a
deterministic stub so the demo never needs a live Google OAuth consent.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from app.core.config import get_settings
from app.tools.base import ToolError

log = logging.getLogger(__name__)


def _parse_date(value: str | None, *, field: str, default: date) -> date:
    if not value:
        return default
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ToolError(f"{field} must be an ISO date (YYYY-MM-DD), got {value!r}") from exc


class CalendarFreeBusyTool:
    name = "calendar_free_busy"
    description = (
        "Return the user's busy time blocks for a date range. Read-only: this "
        "tool cannot create, move, or delete events."
    )
    mutating = False

    def json_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "start_date": {"type": "string", "description": "ISO date, inclusive."},
                "end_date": {"type": "string", "description": "ISO date, inclusive."},
            },
            "required": [],
            "additionalProperties": False,
        }

    async def run(self, user_id: UUID, args: dict[str, Any], session: Any) -> dict[str, Any]:
        s = get_settings()
        if not s.calendar_enabled:
            raise ToolError("calendar access is not configured for this account", retryable=False)
        today = datetime.now(UTC).date()
        start = _parse_date(args.get("start_date"), field="start_date", default=today)
        end = _parse_date(args.get("end_date"), field="end_date", default=today + timedelta(days=1))
        if end < start:
            raise ToolError("end_date must not be before start_date")
        # Bound the range: an open-ended query is a denial-of-service on ourselves.
        if (end - start).days > 31:
            raise ToolError("date range is limited to 31 days")
        blocks = _stub_busy(user_id, start, end)
        return {
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "busy": blocks,
            "source": "stub",
            "read_only": True,
        }


def _stub_busy(user_id: UUID, start: date, end: date) -> list[dict[str, str]]:
    """Deterministic pseudo-calendar, derived from the user id.

    Same user and same window always yields the same blocks, so tests and demos
    are reproducible without a network call.
    """
    seed = int.from_bytes(user_id.bytes[:4], "big")
    out: list[dict[str, str]] = []
    day = start
    while day <= end:
        # A block on roughly two days in three, at a per-user stable hour.
        if (seed + day.toordinal()) % 3 == 0:
            hour = 9 + (seed + day.toordinal()) % 8
            block_start = datetime(day.year, day.month, day.day, hour, tzinfo=UTC)
            out.append(
                {
                    "start": block_start.isoformat(),
                    "end": (block_start + timedelta(hours=1)).isoformat(),
                }
            )
        day += timedelta(days=1)
    return out


def default_tools() -> list[type[CalendarFreeBusyTool]]:
    """Classes, not instances, so callers construct one per request."""
    return [CalendarFreeBusyTool]
