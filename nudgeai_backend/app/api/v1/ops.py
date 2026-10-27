from __future__ import annotations

from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import func, select, text

from app.api.deps import SessionDep
from app.core.metrics import (
    budget_rejections_total,
    cache_lookups_total,
    chat_messages_total,
    memory_searches_total,
    memory_writes_total,
    model_calls_total,
    model_cost_usd_total,
    model_latency_seconds,
    model_tokens_total,
    proposals_total,
    route_decisions_total,
    route_escalations_total,
    signups_total,
    tool_calls_total,
    users_total,
)
from app.db.models import User
from app.infra.redis import redis_ping

router = APIRouter(tags=["ops"])

# Re-exported so existing imports of `app.api.v1.ops.<collector>` keep working.
# The definitions now live in app/core/metrics.py so services can record without
# importing the API layer.
__all__ = [
    "router",
    "budget_rejections_total",
    "cache_lookups_total",
    "chat_messages_total",
    "memory_searches_total",
    "memory_writes_total",
    "model_calls_total",
    "model_cost_usd_total",
    "model_latency_seconds",
    "model_tokens_total",
    "proposals_total",
    "route_decisions_total",
    "route_escalations_total",
    "signups_total",
    "tool_calls_total",
    "users_total",
]


@router.get("/health")
async def health(session: SessionDep) -> dict[str, object]:
    db_ok = True
    try:
        await session.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 — report degraded rather than 500
        db_ok = False
    redis_ok = await redis_ping()
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "up" if db_ok else "down",
        # Redis is a cache and a queue, not a hard dependency.
        "redis": "up" if redis_ok else "down",
    }


@router.get("/metrics", include_in_schema=False)
async def metrics(session: SessionDep) -> Response:
    try:
        count = await session.scalar(select(func.count()).select_from(User))
    except Exception:  # noqa: BLE001 — never fail a scrape
        count = None
    if count is not None:
        users_total.set(count)
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
