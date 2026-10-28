"""Agent traces: record how a chat turn was produced and read it back."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ChatTrace
from app.services.core_service import NotFound
from app.tools.executor import TurnResult

PREVIEW_MAX = 160


class HopOut(BaseModel):
    tier: str
    reason: str
    tool_names: list[str]
    escalated: bool


class ToolStepOut(BaseModel):
    tool: str
    ok: bool
    proposed: bool = False
    error: str | None = None


class TraceOut(BaseModel):
    id: UUID
    conversation_id: UUID | None
    prompt_preview: str
    tier: str
    model: str
    reason: str
    hops: list[HopOut]
    tools: list[ToolStepOut]
    proposal_ids: list[str]
    escalations: int
    degraded: bool
    cached: bool
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    latency_ms: int
    created_at: datetime


def to_out(row: ChatTrace) -> TraceOut:
    return TraceOut(
        id=row.id,
        conversation_id=row.conversation_id,
        prompt_preview=row.prompt_preview,
        tier=row.tier,
        model=row.model_id,
        reason=row.reason,
        hops=[HopOut(**h) for h in row.hops],
        tools=[
            ToolStepOut(
                tool=t.get("tool", "?"),
                ok=bool(t.get("ok", False)),
                proposed=bool(t.get("proposed", False)),
                error=t.get("error"),
            )
            for t in row.tool_results
        ],
        proposal_ids=list(row.proposal_ids),
        escalations=row.escalations,
        degraded=row.degraded,
        cached=row.cached,
        prompt_tokens=row.prompt_tokens,
        completion_tokens=row.completion_tokens,
        cost_usd=row.cost_usd,
        latency_ms=row.latency_ms,
        created_at=row.created_at,
    )


async def record(
    session: AsyncSession,
    user_id: UUID,
    *,
    conversation_id: UUID | None,
    prompt: str,
    result: TurnResult,
    latency_ms: int,
) -> ChatTrace:
    """Store one turn. Tool outputs are dropped: only what ran, whether it worked, and why not."""
    steps = [
        {
            "tool": t.get("tool", "?"),
            "ok": bool(t.get("ok", False)),
            "proposed": bool(t.get("proposed", False)),
            **({"error": str(t["error"])[:300]} if t.get("error") else {}),
        }
        for t in result.tool_results
    ]
    text = " ".join(prompt.split())
    row = ChatTrace(
        user_id=user_id,
        conversation_id=conversation_id,
        prompt_preview=text[:PREVIEW_MAX],
        tier=result.tier,
        model_id=result.model_id,
        reason=result.reason[:300],
        hops=[{**asdict(h), "tool_names": list(h.tool_names)} for h in result.hops],
        tool_results=steps,
        proposal_ids=[p["id"] for p in result.proposals],
        escalations=result.escalations,
        degraded=result.degraded,
        cached=result.cached,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        cost_usd=result.cost_usd,
        latency_ms=latency_ms,
    )
    session.add(row)
    await session.commit()
    return row


async def list_traces(
    session: AsyncSession,
    user_id: UUID,
    *,
    conversation_id: UUID | None = None,
    limit: int = 50,
) -> list[ChatTrace]:
    stmt = select(ChatTrace).where(ChatTrace.user_id == user_id)
    if conversation_id is not None:
        stmt = stmt.where(ChatTrace.conversation_id == conversation_id)
    stmt = stmt.order_by(ChatTrace.created_at.desc()).limit(limit)
    return list(await session.scalars(stmt))


async def get(session: AsyncSession, user_id: UUID, trace_id: UUID) -> ChatTrace:
    row = await session.scalar(
        select(ChatTrace).where(ChatTrace.id == trace_id, ChatTrace.user_id == user_id)
    )
    if row is None:
        raise NotFound("trace not found")
    return row
