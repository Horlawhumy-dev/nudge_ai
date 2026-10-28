"""Housekeeping the worker runs on each pass, separate from nudge evaluation.

Each job is independent and failure-isolated: one raising must not stop the others or the pass.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from app.db.session import session_scope
from app.services import recurrence

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class MaintenanceReport:
    recurring_created: int = 0


async def run_maintenance(now_utc: datetime | None = None) -> MaintenanceReport:
    now = now_utc or datetime.now(UTC)
    recurring = 0
    try:
        async with session_scope() as session:
            recurring = await recurrence.roll_all(session, now)
    except Exception:  # noqa: BLE001 - housekeeping never sinks the worker
        log.exception("maintenance: recurring tasks failed")
    return MaintenanceReport(recurring_created=recurring)
