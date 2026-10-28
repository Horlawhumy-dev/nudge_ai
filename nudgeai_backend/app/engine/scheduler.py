"""Nudge scheduling: when habits become due, and the Redis queues.

Two halves. The pure half computes *when* a habit should fire: its preferred
time, pulled earlier when a streak is at risk. The queue half is the worker's
durable to-do list:

- ``nudge:due`` — ZSET of ``user_id:habit_id`` scored by due epoch
- ``nudge:inflight`` — ZSET of claimed members scored by lease expiry
- ``nudge:events`` — stream of every decision, for the demo trace
- ``nudge:dlq`` — stream of failures for later inspection

The claim is one Lua script (range the due members, move them to inflight),
so two workers can never take the same nudge. A worker killed mid-flight
leaves its claims in inflight with an expired lease, and the next pass
requeues them — nothing lost, nothing double-sent, as long as the compose
step stays idempotent (one nudge row per claim completion).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from redis.asyncio import Redis

from app.engine.rules import STREAK_EARLY_MINUTES, today_at
from app.infra.redis import (
    k_nudge_dlq,
    k_nudge_due,
    k_nudge_events,
    k_nudge_inflight,
)

# A claim lives this long before the next worker pass requeues it.
INFLIGHT_LEASE_SECONDS = 600


@dataclass(frozen=True, slots=True)
class Claim:
    user_id: UUID
    habit_id: UUID

    @property
    def member(self) -> str:
        return f"{self.user_id}:{self.habit_id}"

    @classmethod
    def parse(cls, member: str) -> Claim | None:
        try:
            user_raw, habit_raw = member.split(":")
            return cls(user_id=UUID(user_raw), habit_id=UUID(habit_raw))
        except ValueError:
            return None


# ------------------------------------------------------------------ pure


def due_time_for(
    now_local: datetime, preferred_time: str | None, *, streak_at_risk: bool
) -> datetime:
    """When this habit should fire, in the user's local time.

    The preferred time stands, unless a streak is at risk — then the nudge
    moves earlier so the user still has the evening to save it. Anything at
    or before now is due immediately.
    """
    base = today_at(now_local, preferred_time) if preferred_time else now_local
    if streak_at_risk:
        base -= timedelta(minutes=STREAK_EARLY_MINUTES)
    return base if base > now_local else now_local


# ------------------------------------------------------------------ queue


_CLAIM_LUA = """
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, tonumber(ARGV[3]))
for _, member in ipairs(due) do
  redis.call('ZADD', KEYS[2], ARGV[2], member)
  redis.call('ZREM', KEYS[1], member)
end
return due
"""


async def enqueue(client: Redis, user_id: UUID, habit_id: UUID, when_utc: datetime) -> None:
    await client.zadd(k_nudge_due(), {Claim(user_id, habit_id).member: when_utc.timestamp()})


async def claim_due(client: Redis, *, now_utc: datetime, batch: int) -> list[Claim]:
    """Atomically move up to ``batch`` due members to inflight."""
    lease_until = (now_utc + timedelta(seconds=INFLIGHT_LEASE_SECONDS)).timestamp()
    members: Any = await client.eval(
        _CLAIM_LUA, 2, k_nudge_due(), k_nudge_inflight(), now_utc.timestamp(), lease_until, batch
    )
    claims: list[Claim] = []
    for member in members or []:
        claim = Claim.parse(str(member))
        if claim is not None:
            claims.append(claim)
    return claims


async def complete(client: Redis, claim: Claim) -> None:
    await client.zrem(k_nudge_inflight(), claim.member)


async def fail(client: Redis, claim: Claim, reason: str) -> None:
    """Drop the claim and leave the failure in the dead-letter stream."""
    await client.zrem(k_nudge_inflight(), claim.member)
    # dict[Any, Any]: redis stream field types are invariant, and the only
    # precise spelling is the full bytes|str|int|float union twice.
    payload: dict[Any, Any] = {
        "user_id": str(claim.user_id),
        "habit_id": str(claim.habit_id),
        "reason": reason,
        "at": datetime.now(UTC).isoformat(),
    }
    await client.xadd(k_nudge_dlq(), payload)


async def requeue_stale(client: Redis, *, now_utc: datetime) -> int:
    """Return expired inflight claims to due. Returns the count moved."""
    stale: Any = await client.zrangebyscore(k_nudge_inflight(), "-inf", now_utc.timestamp())
    moved = 0
    for member in stale or []:
        removed = await client.zrem(k_nudge_inflight(), member)
        if removed:
            await client.zadd(k_nudge_due(), {str(member): now_utc.timestamp()})
            moved += 1
    return moved


async def record_event(client: Redis, fields: dict[str, str]) -> None:
    payload: dict[Any, Any] = dict(fields)
    await client.xadd(k_nudge_events(), payload)


async def queue_depths(client: Redis) -> dict[str, int]:
    due = await client.zcard(k_nudge_due())
    inflight = await client.zcard(k_nudge_inflight())
    return {"due": int(due), "inflight": int(inflight)}


__all__ = [
    "INFLIGHT_LEASE_SECONDS",
    "Claim",
    "claim_due",
    "complete",
    "due_time_for",
    "enqueue",
    "fail",
    "queue_depths",
    "record_event",
    "requeue_stale",
]
