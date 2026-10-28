"""Chat conversations: the history list, opening a thread, deleting and restoring."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.api.deps import CurrentUser, SessionDep
from app.schemas.models import (
    ConversationDetail,
    ConversationMessage,
    ConversationSummary,
    MessageResponse,
)
from app.services import conversation_service
from app.services.core_service import NotFound

router = APIRouter(prefix="/conversations", tags=["chat"])


def _summary(item: conversation_service.Summary) -> ConversationSummary:
    c = item.conversation
    return ConversationSummary(
        id=c.id,
        title=c.title,
        mode=item.mode,
        message_count=item.message_count,
        preview=item.preview,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("", response_model=list[ConversationSummary])
async def list_conversations(
    user: CurrentUser, session: SessionDep, limit: int = Query(default=100, ge=1, le=200)
) -> list[ConversationSummary]:
    """Most recently active first. The mobile history screen groups these by day."""
    return [
        _summary(s)
        for s in await conversation_service.list_summaries(session, user.id, limit=limit)
    ]


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def open_conversation(
    conversation_id: UUID, user: CurrentUser, session: SessionDep
) -> ConversationDetail:
    try:
        convo = await conversation_service.get(session, user.id, conversation_id)
        rows = await conversation_service.messages(session, user.id, conversation_id)
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ConversationDetail(
        id=convo.id,
        title=convo.title,
        messages=[
            ConversationMessage(
                id=m.id,
                role=m.role,
                content=m.content,
                via=m.via,
                created_at=m.created_at,
            )
            for m in rows
            if m.role in ("user", "assistant")
        ],
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: UUID, user: CurrentUser, session: SessionDep
) -> Response:
    try:
        await conversation_service.soft_delete(session, user.id, conversation_id)
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{conversation_id}/restore", response_model=ConversationSummary)
async def restore_conversation(
    conversation_id: UUID, user: CurrentUser, session: SessionDep
) -> ConversationSummary:
    """Undo a delete (the mobile "Undo" toast)."""
    try:
        await conversation_service.restore(session, user.id, conversation_id)
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    items = await conversation_service.list_summaries(session, user.id)
    return _summary(next(i for i in items if i.conversation.id == conversation_id))


@router.delete("", response_model=MessageResponse)
async def clear_history(user: CurrentUser, session: SessionDep) -> MessageResponse:
    """Permanently delete every conversation (Privacy -> Clear chat history)."""
    count = await conversation_service.delete_all(session, user.id)
    return MessageResponse(message=f"deleted {count} conversations")
