"""The confirmation gate.

Spec §20 rule one is "it proposes". A mutating tool call is turned into a
`ToolProposal` and persisted; nothing is written until the client confirms. The
executor therefore never calls `run()` on a mutating tool.

Confirmation is single-use and owner-checked: a proposal id from another user, or
a second confirm of the same id, fails.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import metrics
from app.db.models import ToolProposal as ToolProposalRow
from app.tools.base import RegisteredTool, ToolError

log = logging.getLogger(__name__)

# Pending proposals are reaped well before a user would still act on one.
PENDING_TTL = timedelta(hours=24)


class ProposalError(Exception):
    """Unknown, expired, already-resolved, or someone else's proposal."""


def _summary(tool_name: str, args: dict[str, Any]) -> str:
    """One human-readable line for the confirm button."""
    match tool_name:
        case "memory_remember":
            body = str(args.get("body", "")).strip()
            return f"Remember: {body[:140]}" if body else "Remember a new fact"
        case "memory_forget":
            return f"Forget memory {args.get('memory_id', '?')}"
        case "calendar_free_busy":
            return "Check the calendar"
        case _:
            return f"Run {tool_name}"


async def create(
    session: AsyncSession,
    user_id: UUID,
    *,
    call_id: str,
    tool: RegisteredTool,
    args: dict[str, Any],
) -> ToolProposalRow:
    """Record a mutating call for later confirmation. Writes no user state."""
    summary = _summary(tool.spec.name, args)
    # Tools that know their targets can word the confirm button ("Change “Deep work”: ...").
    describe = getattr(tool.tool, "describe", None)
    if callable(describe):
        try:
            summary = str(await describe(user_id, args, session))[:300] or summary
        except Exception as exc:  # noqa: BLE001 - a wording failure must not lose the proposal
            log.warning("proposal summary fell back for %s: %s", tool.spec.name, exc)
    await session.execute(
        pg_insert(ToolProposalRow)
        .values(
            user_id=user_id,
            tool_name=tool.spec.name,
            arguments=args,
            call_id=call_id,
            status="pending",
            summary=summary,
        )
        .on_conflict_do_nothing(index_elements=["user_id", "call_id"])
    )
    await session.commit()
    row = await session.scalar(
        select(ToolProposalRow).where(
            ToolProposalRow.user_id == user_id, ToolProposalRow.call_id == call_id
        )
    )
    if row is None:
        raise ProposalError("proposal could not be recorded")
    metrics.proposals_total.labels(tool=tool.spec.name, outcome="created").inc()
    metrics.tool_calls_total.labels(tool=tool.spec.name, result="proposed").inc()
    return row


async def confirm(session: AsyncSession, user_id: UUID, proposal_id: UUID) -> dict[str, Any]:
    """Execute a pending proposal. This is the only path that mutates state."""
    row = await session.scalar(
        select(ToolProposalRow).where(
            ToolProposalRow.id == proposal_id, ToolProposalRow.user_id == user_id
        )
    )
    if row is None:
        raise ProposalError("no such proposal")
    if row.status != "pending":
        raise ProposalError(f"proposal is already {row.status}")

    tool = _resolve(session, user_id, row)
    try:
        result = await tool.run(user_id, dict(row.arguments or {}), session)
    except ToolError as exc:
        row.status = "failed"
        row.error = exc.message
        await session.commit()
        metrics.proposals_total.labels(tool=row.tool_name, outcome="failed").inc()
        raise ProposalError(exc.message) from exc

    row.status = "confirmed"
    row.confirmed_at = datetime.now(UTC)
    row.result = result
    await session.commit()
    metrics.proposals_total.labels(tool=row.tool_name, outcome="confirmed").inc()
    return {"proposal_id": str(row.id), "tool": row.tool_name, "result": result}


async def reject(session: AsyncSession, user_id: UUID, proposal_id: UUID) -> dict[str, Any]:
    """Decline a proposal. Nothing is executed."""
    row = await session.scalar(
        select(ToolProposalRow).where(
            ToolProposalRow.id == proposal_id, ToolProposalRow.user_id == user_id
        )
    )
    if row is None:
        raise ProposalError("no such proposal")
    if row.status != "pending":
        raise ProposalError(f"proposal is already {row.status}")
    row.status = "rejected"
    await session.commit()
    metrics.proposals_total.labels(tool=row.tool_name, outcome="rejected").inc()
    return {"proposal_id": str(row.id), "status": "rejected"}


def _resolve(session: AsyncSession, user_id: UUID, row: ToolProposalRow) -> Any:
    """Rebuild the registered tool for this row.

    Proposals outlive the request that created them, so the registry cannot be
    reused here; the tool is looked up fresh. An unknown tool name is a bug in
    how the row was written, not user input, so it is treated as fatal.
    """
    from app.tools import calendar as calendar_tools
    from app.tools import memory as memory_tools
    from app.tools import planner as planner_tools

    known = {
        t.name: t
        for t in (
            *memory_tools.default_tools(),
            *calendar_tools.default_tools(),
            *planner_tools.default_tools(),
        )
    }
    factory = known.get(row.tool_name)
    if factory is None:
        log.error("proposal %s names an unknown tool %r", row.id, row.tool_name)
        raise ProposalError(f"unknown tool {row.tool_name!r}")
    return factory()


def to_schema(row: ToolProposalRow) -> dict[str, Any]:
    """Wire shape returned to the client."""
    return {
        "id": str(row.id),
        "tool": row.tool_name,
        "args": dict(row.arguments or {}),
        "summary": row.summary,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "confirmed_at": row.confirmed_at.isoformat() if row.confirmed_at else None,
    }


async def sweep_expired(session: AsyncSession) -> int:
    """Expire stale pending proposals. Called from the app lifespan."""
    from sqlalchemy import update

    cutoff = datetime.now(UTC) - PENDING_TTL
    result = await session.execute(
        update(ToolProposalRow)
        .where(ToolProposalRow.status == "pending", ToolProposalRow.created_at < cutoff)
        .values(status="expired")
    )
    await session.commit()
    return int(cast(CursorResult[Any], result).rowcount or 0)
