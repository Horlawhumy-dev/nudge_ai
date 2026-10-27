"""Per-user, per-UTC-day call and token ceilings.

Redis INCR with an expiry set on the first hit of the day, so the counter resets
itself at the day boundary without a cron job. Redis being down must not take
the product down: the guard fails open and reports itself as not-enforced.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.core.config import get_settings
from app.infra.redis import get_redis, k_budget

log = logging.getLogger(__name__)

# 32h > 1 day, so a counter written just before midnight still expires.
_TTL = 32 * 3600


@dataclass(frozen=True, slots=True)
class BudgetState:
    calls: int
    tokens: int
    call_limit: int
    token_limit: int
    enforced: bool = True

    @property
    def calls_exhausted(self) -> bool:
        return self.enforced and self.calls >= self.call_limit

    @property
    def tokens_exhausted(self) -> bool:
        return self.enforced and self.tokens >= self.token_limit

    @property
    def exhausted(self) -> bool:
        return self.calls_exhausted or self.tokens_exhausted


def _day() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


async def _bump(redis: Any, key: str, amount: int) -> int:
    """INCRBY, setting the expiry only when the key is first created."""
    pipe = redis.pipeline(transaction=True)
    pipe.incrby(key, amount)
    pipe.expire(key, _TTL, nx=True)
    result = await pipe.execute()
    return int(result[0])


async def snapshot(user_id: UUID) -> BudgetState:
    """Current usage without spending anything."""
    s = get_settings()
    key = k_budget(user_id, _day())
    try:
        r = get_redis()
        calls, tokens = await r.mget(key, f"{key}:tok")
    except Exception as exc:  # noqa: BLE001
        log.warning("budget snapshot unavailable, failing open: %s", exc)
        return BudgetState(0, 0, s.budget_daily_calls, s.budget_daily_tokens, enforced=False)
    return BudgetState(
        calls=int(calls or 0),
        tokens=int(tokens or 0),
        call_limit=s.budget_daily_calls,
        token_limit=s.budget_daily_tokens,
    )


async def charge(user_id: UUID, *, tokens: int = 0) -> BudgetState:
    """Record one model call and its token usage, then report the new state."""
    s = get_settings()
    key = k_budget(user_id, _day())
    try:
        r = get_redis()
        calls = await _bump(r, key, 1)
        total_tokens = await _bump(r, f"{key}:tok", tokens) if tokens else 0
    except Exception as exc:  # noqa: BLE001
        log.warning("budget charge failed, failing open: %s", exc)
        return BudgetState(0, 0, s.budget_daily_calls, s.budget_daily_tokens, enforced=False)
    return BudgetState(
        calls=calls,
        tokens=total_tokens,
        call_limit=s.budget_daily_calls,
        token_limit=s.budget_daily_tokens,
    )


def seconds_until_reset() -> int:
    now = datetime.now(UTC)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return int((tomorrow - now).total_seconds())


async def reset(user_id: UUID) -> None:
    """Clear today's counters. Used by tests and by an explicit user action."""
    key = k_budget(user_id, _day())
    try:
        await get_redis().delete(key, f"{key}:tok")
    except Exception as exc:  # noqa: BLE001
        log.warning("budget reset failed: %s", exc)
