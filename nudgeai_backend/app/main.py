from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router, ops_router
from app.core.config import get_settings
from app.db.session import dispose_engine
from app.infra.redis import close_redis, redis_ping

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("nudgeai")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    s = get_settings()
    log.info("starting %s (%s)", s.app_name, s.environment)
    if await redis_ping():
        log.info("redis reachable at %s", s.redis_url)
    else:
        log.warning("redis unreachable — cache and queue will degrade gracefully")

    from app.ai import proposals as proposals_mod
    from app.db.session import session_scope

    # Reap confirmations the user never acted on, so a stale button cannot
    # execute a write days later.
    try:
        async with session_scope() as boot_session:
            expired = await proposals_mod.sweep_expired(boot_session)
        if expired:
            log.info("expired %d stale tool proposals", expired)
    except Exception as exc:  # noqa: BLE001
        log.warning("proposal sweep skipped: %s", exc)

    try:
        yield
    finally:
        await close_redis()
        await dispose_engine()
        log.info("shutdown complete")


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title=f"{s.app_name} API",
        version="0.1.0",
        description=(
            "NudgeAI backend — a voice-first habit and task companion. "
            "Phase 1: identity, habits, tasks, and semantic memory."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list,
        # Wildcard origins and credentials are mutually exclusive in browsers.
        allow_credentials="*" not in s.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix=s.api_prefix)
    app.include_router(ops_router)

    @app.get("/", tags=["ops"])
    async def root() -> dict[str, str]:
        return {"service": s.app_name, "docs": "/docs", "version": "0.1.0", "phase": "1"}

    return app


app = create_app()
