from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, SessionDep
from app.engine.worker import UserReport, evaluate_user
from app.infra.redis import get_redis, redis_ping
from app.models.client import get_client
from app.schemas.models import (
    EvaluateResponse,
    FeedbackRequest,
    FeedbackResponse,
    NudgeDecisionOut,
    NudgeResponse,
    RuleLogEntry,
)
from app.services import nudge_service
from app.services.core_service import Conflict, NotFound

router = APIRouter(prefix="/nudges", tags=["nudges"])


async def _http[T](fn: Callable[..., Awaitable[T]], *args: Any, **kwargs: Any) -> T:
    """Adapt service-level NotFound/Conflict to HTTP status codes (as in core)."""
    try:
        return await fn(*args, **kwargs)
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Conflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


def _report_out(report: UserReport) -> EvaluateResponse:
    evaluated: list[NudgeDecisionOut] = []
    for ec in report.evaluated:
        verdict = ec.decision.verdict
        evaluated.append(
            NudgeDecisionOut(
                habit_id=ec.candidate.habit_id,
                habit_name=ec.candidate.habit_name,
                action=verdict.action,
                rule=verdict.rule,
                reason=verdict.reason,
                defer_until=verdict.defer_until,
                priority=verdict.priority,
                log=[
                    RuleLogEntry(rule=e.rule, passed=e.passed, detail=e.detail)
                    for e in ec.decision.log
                ],
            )
        )
    return EvaluateResponse(
        evaluated=evaluated,
        digest_sent=report.digest_sent,
        nudge_ids=list(report.nudge_ids),
        errors=list(report.errors),
    )


@router.get("", response_model=list[NudgeResponse])
async def list_nudges(
    user: CurrentUser,
    session: SessionDep,
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[NudgeResponse]:
    nudges = await _http(nudge_service.list_nudges, session, user.id, status=status, limit=limit)
    return [NudgeResponse.model_validate(n) for n in nudges]


@router.get("/{nudge_id}", response_model=NudgeResponse)
async def get_nudge(nudge_id: UUID, user: CurrentUser, session: SessionDep) -> NudgeResponse:
    nudge = await _http(nudge_service.get_nudge, session, user.id, nudge_id)
    return NudgeResponse.model_validate(nudge)


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_now(
    user: CurrentUser, session: SessionDep, dry_run: bool = Query(default=False)
) -> EvaluateResponse:
    """Run the Decision Engine for the caller, now.

    The default run persists outcomes (sent / skipped / scheduled rows) and
    is what the mobile client calls to refresh. ``dry_run`` returns the same
    decisions and rule logs without writing anything — the demo artifact for
    "why didn't it nudge me?".
    """
    redis = get_redis() if await redis_ping() else None
    report = await evaluate_user(
        session,
        user.id,
        model_client=get_client(),
        redis=redis,
        now_utc=datetime.now(UTC),
        dry_run=dry_run,
    )
    if report.errors and not report.evaluated:
        raise HTTPException(status_code=404, detail="; ".join(report.errors))
    return _report_out(report)


@router.post("/{nudge_id}/snooze", response_model=NudgeResponse, status_code=status.HTTP_200_OK)
async def snooze(nudge_id: UUID, user: CurrentUser, session: SessionDep) -> NudgeResponse:
    nudge = await _http(nudge_service.snooze_nudge, session, user.id, nudge_id)
    return NudgeResponse.model_validate(nudge)


@router.post("/{nudge_id}/feedback", response_model=FeedbackResponse)
async def feedback(
    nudge_id: UUID, payload: FeedbackRequest, user: CurrentUser, session: SessionDep
) -> FeedbackResponse:
    row = await _http(nudge_service.record_feedback, session, user.id, nudge_id, payload.kind)
    return FeedbackResponse(nudge_id=row.nudge_id, kind=row.kind)
