from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import analytics, auth, chat, core, memory, notifications, nudges, ops, speech

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(core.router)
api_router.include_router(memory.router)
api_router.include_router(chat.router)
api_router.include_router(nudges.router)
api_router.include_router(notifications.router)
api_router.include_router(speech.router)
api_router.include_router(analytics.router)

# ops sits outside the versioned prefix: /health and /metrics are infra endpoints.
ops_router = ops.router

__all__ = ["api_router", "ops_router"]
