"""Chat conversations: create, list, read, delete and restore."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ChatMessage, Conversation
from app.services.core_service import NotFound

TITLE_MAX = 70


def title_from(message: str) -> str:
    """A conversation is named after what the user first said, trimmed to fit a list row."""
    text = " ".join(message.split())
    if not text:
        return "New chat"
    return text if len(text) <= TITLE_MAX else text[: TITLE_MAX - 1].rstrip() + "…"


def mode_of(vias: set[str]) -> str:
    """text | voice | voice+text, from how the user's own messages were sent."""
    if "voice" in vias and "text" in vias:
        return "voice+text"
    return "voice" if "voice" in vias else "text"


async def create(session: AsyncSession, user_id: UUID, *, first_message: str) -> Conversation:
    convo = Conversation(user_id=user_id, title=title_from(first_message))
    session.add(convo)
    await session.flush()
    return convo


async def get(
    session: AsyncSession, user_id: UUID, conversation_id: UUID, *, include_deleted: bool = False
) -> Conversation:
    stmt = select(Conversation).where(
        Conversation.id == conversation_id, Conversation.user_id == user_id
    )
    if not include_deleted:
        stmt = stmt.where(Conversation.deleted_at.is_(None))
    convo = await session.scalar(stmt)
    if convo is None:
        raise NotFound("conversation not found")
    return convo


async def touch(session: AsyncSession, conversation_id: UUID) -> None:
    convo = await session.get(Conversation, conversation_id)
    if convo is not None:
        convo.updated_at = datetime.now(UTC)


@dataclass(frozen=True, slots=True)
class Summary:
    conversation: Conversation
    message_count: int
    mode: str
    preview: str


async def list_summaries(
    session: AsyncSession, user_id: UUID, *, limit: int = 100
) -> list[Summary]:
    """The user's live conversations, most recently active first."""
    convos = list(
        await session.scalars(
            select(Conversation)
            .where(Conversation.user_id == user_id, Conversation.deleted_at.is_(None))
            .order_by(Conversation.updated_at.desc())
            .limit(limit)
        )
    )
    if not convos:
        return []
    ids = [c.id for c in convos]
    counts = dict(
        (
            await session.execute(
                select(ChatMessage.conversation_id, func.count())
                .where(ChatMessage.conversation_id.in_(ids))
                .group_by(ChatMessage.conversation_id)
            )
        ).all()
    )
    vias: dict[UUID, set[str]] = {}
    for cid, via in (
        await session.execute(
            select(ChatMessage.conversation_id, ChatMessage.via)
            .where(ChatMessage.conversation_id.in_(ids), ChatMessage.role == "user")
            .distinct()
        )
    ).all():
        if cid is not None:
            vias.setdefault(cid, set()).add(via)
    previews: dict[UUID, str] = {}
    for cid, content in (
        await session.execute(
            select(ChatMessage.conversation_id, ChatMessage.content)
            .where(ChatMessage.conversation_id.in_(ids), ChatMessage.role == "assistant")
            .order_by(ChatMessage.conversation_id, ChatMessage.created_at)
        )
    ).all():
        if cid is not None:
            previews[cid] = " ".join(content.split())[:140]  # last assistant message wins
    return [
        Summary(c, int(counts.get(c.id, 0)), mode_of(vias.get(c.id, set())), previews.get(c.id, ""))
        for c in convos
    ]


async def messages(
    session: AsyncSession, user_id: UUID, conversation_id: UUID, *, limit: int = 200
) -> list[ChatMessage]:
    await get(session, user_id, conversation_id)
    rows = list(
        await session.scalars(
            select(ChatMessage)
            .where(ChatMessage.user_id == user_id, ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(limit)
        )
    )
    return list(reversed(rows))


async def soft_delete(session: AsyncSession, user_id: UUID, conversation_id: UUID) -> None:
    convo = await get(session, user_id, conversation_id)
    convo.deleted_at = datetime.now(UTC)
    await session.commit()


async def restore(session: AsyncSession, user_id: UUID, conversation_id: UUID) -> Conversation:
    convo = await get(session, user_id, conversation_id, include_deleted=True)
    convo.deleted_at = None
    await session.commit()
    await session.refresh(convo)
    return convo


async def delete_all(session: AsyncSession, user_id: UUID) -> int:
    """Permanently remove every conversation (and, by cascade, its messages)."""
    result = await session.execute(delete(Conversation).where(Conversation.user_id == user_id))
    await session.commit()
    return int(result.rowcount or 0)  # type: ignore[attr-defined]
