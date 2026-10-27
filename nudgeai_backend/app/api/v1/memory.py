from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, SessionDep
from app.infra.embeddings import EmbeddingError
from app.schemas.models import (
    MemoryCreate,
    MemoryResponse,
    MemorySearchRequest,
    MemorySearchResponse,
)
from app.services import memory_service

router = APIRouter(prefix="/memories", tags=["memory"])


@router.post("", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
async def create_memory(
    payload: MemoryCreate, user: CurrentUser, session: SessionDep
) -> MemoryResponse:
    try:
        mem = await memory_service.add_memory(
            session, user.id, body=payload.body, kind=payload.kind
        )
    except EmbeddingError as exc:
        raise HTTPException(
            status_code=503, detail=f"embedding service unavailable: {exc}"
        ) from exc
    except memory_service.MemoryError_ as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return MemoryResponse.model_validate(mem)


@router.get("", response_model=list[MemoryResponse])
async def list_memories(
    user: CurrentUser, session: SessionDep, limit: int = 50
) -> list[MemoryResponse]:
    from sqlalchemy import select

    from app.db.models import Memory

    rows = await session.scalars(
        select(Memory)
        .where(Memory.user_id == user.id)
        .order_by(Memory.created_at.desc())
        .limit(limit)
    )
    return [MemoryResponse.model_validate(m) for m in rows]


@router.post("/search", response_model=MemorySearchResponse)
async def search_memories(
    payload: MemorySearchRequest, user: CurrentUser, session: SessionDep
) -> MemorySearchResponse:
    try:
        hits = await memory_service.search_memories(
            session,
            user.id,
            query=payload.query,
            top_k=payload.top_k,
            kind=payload.kind,
            include_lexical=payload.include_lexical,
        )
    except EmbeddingError as exc:
        raise HTTPException(
            status_code=503, detail=f"embedding service unavailable: {exc}"
        ) from exc
    return MemorySearchResponse(
        results=[
            MemoryResponse(
                id=hit.memory.id,
                body=hit.memory.body,
                kind=hit.memory.kind,
                created_at=hit.memory.created_at,
                similarity=round(hit.similarity, 4),
            )
            for hit in hits
        ]
    )


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(memory_id: UUID, user: CurrentUser, session: SessionDep) -> None:
    ok = await memory_service.delete_memory(session, user.id, memory_id)
    if not ok:
        raise HTTPException(status_code=404, detail="memory not found")
