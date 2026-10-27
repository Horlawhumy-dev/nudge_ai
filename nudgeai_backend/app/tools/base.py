"""Tool protocol and registry.

A tool declares a JSON schema and a `run`. Mutating tools are marked
`mutating=True`; the executor turns those into proposals rather than executing
them, which is the mechanism behind the spec's "it proposes" rule.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable
from uuid import UUID

log = logging.getLogger(__name__)


class ToolError(Exception):
    """Raised by a tool for a condition the model can be told about.

    Surfaced into the conversation as a tool result rather than a 500, so the
    model can retry or explain. Never leaks secrets or tracebacks.
    """

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        self.message = message
        self.retryable = retryable
        super().__init__(message)


@runtime_checkable
class Tool(Protocol):
    name: str
    description: str
    mutating: bool

    def json_schema(self) -> dict[str, Any]: ...

    async def run(self, user_id: UUID, args: dict[str, Any], session: Any) -> dict[str, Any]: ...


@dataclass(frozen=True, slots=True)
class ToolSpec:
    """What the model is told about a tool."""

    name: str
    description: str
    mutating: bool
    parameters: dict[str, Any]

    def to_openai(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


@dataclass(slots=True)
class RegisteredTool:
    tool: Tool
    spec: ToolSpec
    user_id: UUID
    session: Any = field(repr=False)


class ToolRegistry:
    """Per-request registry. Tools are bound to a user and session on creation."""

    def __init__(self) -> None:
        self._tools: dict[str, RegisteredTool] = {}

    def register(self, tool: Tool, user_id: UUID, session: Any) -> None:
        spec = ToolSpec(
            name=tool.name,
            description=tool.description,
            mutating=tool.mutating,
            parameters=tool.json_schema(),
        )
        self._tools[tool.name] = RegisteredTool(
            tool=tool, spec=spec, user_id=user_id, session=session
        )

    def get(self, name: str) -> RegisteredTool | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return sorted(self._tools)

    def specs(self) -> list[ToolSpec]:
        return [self._tools[n].spec for n in self.names()]

    def openai_tools(self) -> list[dict[str, Any]]:
        return [s.to_openai() for s in self.specs()]

    def mutating_names(self) -> list[str]:
        return [n for n in self.names() if self._tools[n].spec.mutating]

    def __len__(self) -> int:
        return len(self._tools)
