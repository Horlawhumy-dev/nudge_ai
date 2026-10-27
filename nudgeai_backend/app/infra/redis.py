from __future__ import annotations

import logging
from typing import Any

from redis.asyncio import Redis, from_url

from app.core.config import get_settings

log = logging.getLogger(__name__)

_client: Redis | None = None


def get_redis() -> Redis:
    global _client
    if _client is None:
        s = get_settings()
        _client = from_url(s.redis_url, encoding="utf-8", decode_responses=True)
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def redis_ping() -> bool:
    try:
        return bool(await get_redis().ping())
    except Exception as exc:  # noqa: BLE001
        log.warning("redis unavailable: %s", exc)
        return False


# ------------------------------------------------------------------ keys
# Every key is namespaced by user where it holds user data.


def k_sess(user_id: Any) -> str:
    return f"sess:{user_id}"


def k_rl(user_id: Any, bucket: str) -> str:
    return f"rl:{user_id}:{bucket}"


def k_resend(user_id: Any) -> str:
    return f"resend:{user_id}"


def k_budget(user_id: Any, day: str) -> str:
    return f"budget:{user_id}:{day}"


def k_nudge_due() -> str:
    return "nudge:due"


def k_nudge_inflight() -> str:
    return "nudge:inflight"


def k_nudge_events() -> str:
    return "nudge:events"


def k_nudge_dlq() -> str:
    return "nudge:dlq"
