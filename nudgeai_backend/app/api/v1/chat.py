"""Chat: POST /chat (SSE), history, and the proposal confirmation gate."""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.ai import proposals as proposals_mod
from app.ai.prompts import build_messages
from app.ai.tone import style_for
from app.api.deps import CurrentUser, SessionDep
from app.core import metrics
from app.core.config import get_settings
from app.db.models import ChatMessage, Preference, ToolProposal
from app.models.budgets import seconds_until_reset
from app.models.router import RouteRequest
from app.services import conversation_service, memory_service, trace_service
from app.services.core_service import NotFound
from app.tools import calendar as calendar_tools
from app.tools import memory as memory_tools
from app.tools import planner as planner_tools
from app.tools.base import ToolRegistry
from app.tools.executor import Executor, TurnResult

log = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])


# ------------------------------------------------------------------ schemas


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    # The client may declare a planning turn or an attachment; the router
    # otherwise decides from the prompt.
    requires_planning: bool | None = None
    has_image: bool = False
    use_cache: bool = True
    # Continue this thread; omit to start a new one (its id comes back in the first SSE event).
    conversation_id: UUID | None = None
    # How the message was entered, so history can show "Voice" vs "Text" chats.
    via: Literal["text", "voice"] = "text"


class ProposalOut(BaseModel):
    id: str
    tool: str
    args: dict[str, Any]
    summary: str
    status: str
    created_at: str | None = None
    confirmed_at: str | None = None


class HistoryOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: str


# ------------------------------------------------------------------ helpers


def _build_registry(user_id: UUID, session: Any) -> ToolRegistry:
    registry = ToolRegistry()
    for factory in (
        *memory_tools.default_tools(),
        *calendar_tools.default_tools(),
        *planner_tools.default_tools(),
    ):
        registry.register(factory(), user_id, session)
    return registry


async def _load_history(
    session: Any, user_id: UUID, conversation_id: UUID, limit: int
) -> list[dict[str, str]]:
    """Most recent `limit` messages of this conversation, oldest first, excluding the new turn."""
    rows = (
        (
            await session.execute(
                select(ChatMessage)
                .where(
                    ChatMessage.user_id == user_id,
                    ChatMessage.conversation_id == conversation_id,
                )
                .order_by(ChatMessage.created_at.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [{"role": r.role, "content": r.content} for r in reversed(rows)]


async def _tone(session: Any, user_id: UUID) -> str | None:
    pref = await session.scalar(select(Preference).where(Preference.user_id == user_id))
    return style_for(pref)


async def _persist(
    session: Any,
    user_id: UUID,
    role: str,
    content: str,
    tool_calls: list[dict[str, Any]] | None = None,
    *,
    conversation_id: UUID | None = None,
    via: str = "text",
) -> None:
    session.add(
        ChatMessage(
            user_id=user_id,
            role=role,
            content=content,
            tool_calls=tool_calls,
            conversation_id=conversation_id,
            via=via,
        )
    )
    if conversation_id is not None:
        await conversation_service.touch(session, conversation_id)
    metrics.chat_messages_total.labels(role=role).inc()
    await session.commit()


# ------------------------------------------------------------------ endpoints


@router.post("/chat", summary="Send a message and stream the reply as SSE")
async def chat(
    body: ChatRequest,
    user: CurrentUser,
    session: SessionDep,
) -> StreamingResponse:
    s = get_settings()
    user_id = user.id

    # Continue an existing thread, or start one named after this first message.
    if body.conversation_id is not None:
        try:
            convo = await conversation_service.get(session, user_id, body.conversation_id)
        except NotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    else:
        convo = await conversation_service.create(session, user_id, first_message=body.message)
        await session.commit()
    conversation_id, conversation_title = convo.id, convo.title

    history = await _load_history(session, user_id, conversation_id, s.chat_history_messages)
    tone = await _tone(session, user_id)

    # Retrieved memory is context, capped hard: a 1M window is not a licence.
    retrieved: list[dict[str, Any]] = []
    try:
        hits = await memory_service.search_memories(session, user_id, query=body.message, top_k=3)
        retrieved = [{"body": hit.memory.body, "kind": hit.memory.kind} for hit in hits]
    except Exception as exc:  # noqa: BLE001
        log.warning("retrieval skipped for chat turn: %s", exc)

    messages = build_messages(
        history=history,
        prompt=body.message,
        retrieved=retrieved,
        tone=tone,
        has_tools=True,
    )
    registry = _build_registry(user_id, session)
    await _persist(
        session, user_id, "user", body.message, conversation_id=conversation_id, via=body.via
    )

    async def event_stream() -> Any:
        yield _sse("conversation", {"id": str(conversation_id), "title": conversation_title})
        executor = Executor()
        result: TurnResult | None = None
        started = time.monotonic()
        try:
            result = await executor.run(
                user_id=user_id,
                prompt=body.message,
                messages=messages,
                registry=registry,
                session=session,
                has_image=body.has_image,
                requires_planning=body.requires_planning,
            )
        except Exception as exc:  # noqa: BLE001
            log.exception("chat turn failed")
            yield _sse("error", {"message": str(exc)})
            return

        trace_id: str | None = None
        try:
            trace = await trace_service.record(
                session,
                user_id,
                conversation_id=conversation_id,
                prompt=body.message,
                result=result,
                latency_ms=int((time.monotonic() - started) * 1000),
            )
            trace_id = str(trace.id)
        except Exception as exc:  # noqa: BLE001
            log.warning("trace not recorded: %s", exc)

        # The reply, in one delta, then the machine-readable tail.
        yield _sse("message", {"content": result.content})
        if result.tool_results:
            yield _sse("tool_results", {"results": result.tool_results})
        for proposal in result.proposals:
            yield _sse("proposal", proposal)
        if result.degraded:
            yield _sse(
                "budget",
                {
                    "degraded": True,
                    "message": "daily model budget reached; using the fastest tier",
                    "resets_in_seconds": seconds_until_reset(),
                },
            )
        yield _sse("meta", {**result.metadata, "trace_id": trace_id})
        yield _sse("done", {})

        await _persist(
            session,
            user_id,
            "assistant",
            result.content,
            tool_calls=[{"tool": t["tool"], "ok": t.get("ok", False)} for t in result.tool_results]
            or None,
            conversation_id=conversation_id,
            via=body.via,
        )
        # A cached turn is already paid for, so it is not worth storing again.
        if not result.cached and result.content:
            try:
                await memory_service.cache_store(
                    session, user_id, prompt=body.message, response=result.content
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("response not cached: %s", exc)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/chat/history", response_model=list[HistoryOut])
async def chat_history(
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(50, ge=1, le=200),
    conversation_id: UUID | None = Query(default=None, description="Only this conversation."),
) -> list[HistoryOut]:
    stmt = select(ChatMessage).where(ChatMessage.user_id == user.id)
    if conversation_id is not None:
        stmt = stmt.where(ChatMessage.conversation_id == conversation_id)
    rows = (
        (await session.execute(stmt.order_by(ChatMessage.created_at.desc()).limit(limit)))
        .scalars()
        .all()
    )
    return [
        HistoryOut(
            id=str(r.id),
            role=r.role,
            content=r.content,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in reversed(rows)
    ]


@router.post("/proposals/{proposal_id}/confirm")
async def confirm_proposal(
    proposal_id: UUID, user: CurrentUser, session: SessionDep
) -> dict[str, Any]:
    try:
        return await proposals_mod.confirm(session, user.id, proposal_id)
    except proposals_mod.ProposalError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc


@router.post("/proposals/{proposal_id}/reject")
async def reject_proposal(
    proposal_id: UUID, user: CurrentUser, session: SessionDep
) -> dict[str, Any]:
    try:
        return await proposals_mod.reject(session, user.id, proposal_id)
    except proposals_mod.ProposalError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc


@router.get("/proposals", response_model=list[ProposalOut])
async def list_proposals(
    user: CurrentUser,
    session: SessionDep,
    only_pending: bool = True,
) -> list[ProposalOut]:
    stmt = select(ToolProposal).where(ToolProposal.user_id == user.id)
    if only_pending:
        stmt = stmt.where(ToolProposal.status == "pending")
    rows = (await session.execute(stmt.order_by(ToolProposal.created_at.desc()))).scalars().all()
    return [ProposalOut(**proposals_mod.to_schema(r)) for r in rows]


@router.get("/routing/preview", summary="Explain the tier this prompt would pick")
async def routing_preview(
    user: CurrentUser,
    message: str = Query(..., min_length=1, max_length=8000),
    has_image: bool = False,
) -> dict[str, Any]:
    """Deterministic routing, no model call and no spend.

    Exposed because the router is the thing the demo has to prove works.
    """
    from app.models.router import classify

    req = RouteRequest(
        user_id=user.id,
        prompt=message,
        messages=[{"role": "user", "content": message}],
        has_image=has_image,
    )
    tier, reason = classify(req)
    return {"tier": tier, "model": _model_id(tier), "reason": reason}


def _model_id(tier: str) -> str:
    from app.models.registry import spec_for

    return spec_for(tier).id  # type: ignore[arg-type]


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"
