"""Memory tools exposed to the model: remember, recall, forget.

`remember` and `forget` mutate state, so they are marked `mutating=True` and the
executor converts them into proposals rather than running them. Only
`recall` runs unattended.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from app.core import metrics
from app.services import memory_service
from app.tools.base import ToolError

log = logging.getLogger(__name__)

_KINDS = ("note", "habit", "task", "preference", "event")


class RecallTool:
    name = "memory_recall"
    description = (
        "Search the user's stored memories for anything relevant to the current "
        "question. Read-only. Returns the best matches with their similarity."
    )
    mutating = False

    def json_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to look for."},
                "top_k": {"type": "integer", "minimum": 1, "maximum": 10},
            },
            "required": ["query"],
            "additionalProperties": False,
        }

    async def run(self, user_id: UUID, args: dict[str, Any], session: Any) -> dict[str, Any]:
        query = str(args.get("query") or "").strip()
        if not query:
            raise ToolError("memory_recall needs a non-empty 'query'")
        try:
            hits = await memory_service.search_memories(
                session, user_id, query=query, top_k=args.get("top_k")
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("recall failed: %s", exc)
            raise ToolError("memory search is unavailable right now", retryable=True) from exc
        metrics.tool_calls_total.labels(tool=self.name, result="ok").inc()
        metrics.memory_searches_total.inc()
        if not hits:
            # Say so explicitly. A bare empty list invites the model to call this
            # again with the same arguments, which is how a turn burns every hop.
            return {
                "matches": [],
                "count": 0,
                "note": (
                    "nothing matched. Do not search again with the same query; answer "
                    "from what you already have, or say plainly that you found nothing."
                ),
            }
        return {
            "matches": [
                {
                    "id": str(hit.memory.id),
                    "body": hit.memory.body,
                    "kind": hit.memory.kind,
                    "similarity": round(hit.similarity, 4),
                }
                for hit in hits
            ],
            "count": len(hits),
        }


class RememberTool:
    name = "memory_remember"
    description = (
        "Store a durable fact about the user. Requires the user to confirm, so "
        "this returns a proposal rather than writing immediately."
    )
    mutating = True

    def json_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "body": {"type": "string", "description": "The fact to remember."},
                "kind": {"type": "string", "enum": list(_KINDS), "default": "note"},
            },
            "required": ["body"],
            "additionalProperties": False,
        }

    async def run(self, user_id: UUID, args: dict[str, Any], session: Any) -> dict[str, Any]:
        body = str(args.get("body") or "").strip()
        if not body:
            raise ToolError("memory_remember needs a non-empty 'body'")
        kind = str(args.get("kind") or "note")
        if kind not in _KINDS:
            raise ToolError(f"kind must be one of {', '.join(_KINDS)}")
        try:
            row = await memory_service.add_memory(session, user_id, body=body, kind=kind)
        except Exception as exc:  # noqa: BLE001
            log.warning("remember failed: %s", exc)
            raise ToolError("could not store that memory", retryable=True) from exc
        metrics.tool_calls_total.labels(tool=self.name, result="written").inc()
        metrics.memory_writes_total.labels(kind=kind).inc()
        return {"id": str(row.id), "body": row.body, "kind": row.kind}


class ForgetTool:
    name = "memory_forget"
    description = (
        "Delete one memory by id. Requires the user to confirm, so this returns "
        "a proposal rather than deleting immediately."
    )
    mutating = True

    def json_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "memory_id": {"type": "string", "description": "The id to delete."},
                "reason": {"type": "string", "description": "Why it should go."},
            },
            "required": ["memory_id"],
            "additionalProperties": False,
        }

    async def run(self, user_id: UUID, args: dict[str, Any], session: Any) -> dict[str, Any]:
        raw = str(args.get("memory_id") or "").strip()
        if not raw:
            raise ToolError("memory_forget needs a 'memory_id'")
        try:
            memory_id = UUID(raw)
        except ValueError as exc:
            raise ToolError(f"memory_id is not a valid id: {raw!r}") from exc
        try:
            deleted = await memory_service.delete_memory(session, user_id, memory_id)
        except Exception as exc:  # noqa: BLE001
            log.warning("forget failed: %s", exc)
            raise ToolError("could not delete that memory", retryable=True) from exc
        if not deleted:
            # Absence is not an error: the desired end state already holds.
            metrics.tool_calls_total.labels(tool=self.name, result="absent").inc()
            return {"deleted": False, "memory_id": raw, "note": "no such memory for this user"}
        metrics.tool_calls_total.labels(tool=self.name, result="written").inc()
        return {"deleted": True, "memory_id": raw}


READ_ONLY_TOOLS: tuple[type[RecallTool], ...] = (RecallTool,)
MUTATING_TOOLS: tuple[type[RememberTool], ...] | tuple[Any, ...] = (RememberTool, ForgetTool)


def default_tools() -> list[Any]:
    """Classes, not instances, so callers construct one per request."""
    return [*READ_ONLY_TOOLS, *MUTATING_TOOLS]
