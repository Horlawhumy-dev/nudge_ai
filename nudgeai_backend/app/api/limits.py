"""Per-client rate limits for the endpoints that guess secrets or send email.

Fixed-window counters in Redis, keyed by client address and bucket. Redis is a
cache, not a gate: if it is unreachable the limit is skipped rather than locking
everyone out.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from fastapi import Depends, HTTPException, Request

from app.api.deps import client_id
from app.core.config import get_settings
from app.infra.redis import get_redis, k_rl

log = logging.getLogger(__name__)


def rate_limit(
    bucket: str, *, limit_setting: str, window_seconds: int
) -> Callable[..., Awaitable[None]]:
    """FastAPI dependency allowing ``settings.<limit_setting>`` calls per window per client.

    The limit is read per request, so it follows settings (and test overrides).
    """

    async def _check(request: Request, cid: str = Depends(client_id)) -> None:
        settings = get_settings()
        if not settings.rate_limits_enabled:
            return
        limit = int(getattr(settings, limit_setting))
        key = k_rl(cid, bucket)
        try:
            r = get_redis()
            count = await r.incr(key)
            if count == 1:
                await r.expire(key, window_seconds)
            retry_after = max(await r.ttl(key), 1) if count > limit else 0
        except Exception as exc:  # noqa: BLE001 - redis is a cache, not a gate
            log.warning("rate limit skipped for %s: %s", bucket, exc)
            return
        if count > limit:
            raise HTTPException(
                status_code=429,
                detail=f"too many attempts, try again in {retry_after}s",
                headers={"Retry-After": str(retry_after)},
            )

    return _check
