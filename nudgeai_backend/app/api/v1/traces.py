"""Agent traces: how the assistant produced a reply."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import CurrentUser, SessionDep
from app.services import trace_service
from app.services.core_service import NotFound
from app.services.trace_service import TraceOut

router = APIRouter(prefix="/traces", tags=["chat"])


@router.get("", response_model=list[TraceOut])
async def list_traces(
    user: CurrentUser,
    session: SessionDep,
    conversation_id: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[TraceOut]:
    """Newest first; pass `conversation_id` to see one thread's turns."""
    rows = await trace_service.list_traces(
        session, user.id, conversation_id=conversation_id, limit=limit
    )
    return [trace_service.to_out(r) for r in rows]


@router.get("/{trace_id}", response_model=TraceOut)
async def get_trace(trace_id: UUID, user: CurrentUser, session: SessionDep) -> TraceOut:
    try:
        return trace_service.to_out(await trace_service.get(session, user.id, trace_id))
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
