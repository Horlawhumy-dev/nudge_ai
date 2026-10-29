"""Photo to planner: read a to-do list, whiteboard or schedule and propose tasks and habits.

The image goes to the multimodal Meta model through the same executor as chat. The only tools it
may call create tasks and habits, and those are confirm-gated, so the result is a list of proposals
the user reviews, not writes. Text inside the image is treated as data (see ``EXTRACT_SYSTEM``).
"""

from __future__ import annotations

import base64
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.ai import proposals as proposals_mod
from app.ai.prompts import EXTRACT_SYSTEM
from app.api.deps import CurrentUser, SessionDep
from app.api.limits import rate_limit
from app.api.v1.chat import ProposalOut
from app.core.config import get_settings
from app.services import core_service, media_service
from app.tools.base import ToolRegistry
from app.tools.executor import Executor
from app.tools.planner import HabitCreateTool, TaskCreateTool

log = logging.getLogger(__name__)
router = APIRouter(prefix="/vision", tags=["vision"])

_MIME = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}


class ExtractResponse(BaseModel):
    message: str
    proposals: list[ProposalOut]


@router.post(
    "/extract",
    response_model=ExtractResponse,
    dependencies=[
        Depends(
            rate_limit("vision", limit_setting="rate_limit_vision_per_minute", window_seconds=60)
        )
    ],
)
async def extract(request: Request, user: CurrentUser, session: SessionDep) -> ExtractResponse:
    """Send the raw PNG/JPEG/WebP bytes; confirm the returned proposals one by one."""
    s = get_settings()
    buf = bytearray()
    async for chunk in request.stream():
        buf.extend(chunk)
        if len(buf) > s.vision_max_bytes:
            raise HTTPException(
                status_code=413, detail=f"image is larger than {s.vision_max_bytes // 1_000_000} MB"
            )
    if not buf:
        raise HTTPException(status_code=400, detail="no image in the request body")
    ext = media_service.sniff_image(bytes(buf[:16]))
    if ext is None:  # the file's own bytes decide, not the declared content type
        log.warning(
            "vision: unsupported image, declared %s, first bytes %s",
            request.headers.get("content-type"),
            bytes(buf[:12]).hex(),
        )
        raise HTTPException(status_code=415, detail="unsupported image; use PNG, JPEG or WebP")

    today = core_service.local_today(user)
    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": EXTRACT_SYSTEM.format(today=today.isoformat(), weekday=today.strftime("%A")),
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Extract the tasks and habits from this image."},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{_MIME[ext]};base64,{base64.b64encode(bytes(buf)).decode()}"
                    },
                },
            ],
        },
    ]
    # Only creation tools: the model can't read, change or complete anything from an image.
    registry = ToolRegistry()
    for tool in (TaskCreateTool(), HabitCreateTool()):
        registry.register(tool, user.id, session)

    result = await Executor().run(
        user_id=user.id,
        prompt="extract tasks and habits from an image",
        messages=messages,
        registry=registry,
        session=session,
        has_image=True,
        expected_tool_calls=1,
    )

    kept = result.proposals[: s.vision_max_items]
    for extra in result.proposals[s.vision_max_items :]:
        try:
            await proposals_mod.reject(session, user.id, _uuid(extra["id"]))
        except proposals_mod.ProposalError:
            log.warning("could not discard surplus vision proposal %s", extra.get("id"))
    log.info(
        "vision extract: %d proposal(s) at %s",
        len(kept),
        datetime.now(UTC).isoformat(timespec="seconds"),
    )
    return ExtractResponse(
        message=result.content,
        proposals=[ProposalOut(**p) for p in kept],
    )


def _uuid(value: Any) -> Any:
    from uuid import UUID

    return UUID(str(value))
