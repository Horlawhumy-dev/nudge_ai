"""The nudge worker: claim → evaluate → compose → write.

The daemon loop lives here, plus :func:`evaluate_user`, which the API reuses
so the dry-run endpoint and the worker can never disagree about what the
engine would do.

Two paths, one decision function:

- **Redis path** (production): habits are seeded into ``nudge:due`` with
  :func:`seed_once`, claimed atomically, and deferred candidates are
  re-enqueued at their new time. Terminal outcomes become nudge rows.
- **DB path** (Redis down, tests, dry runs): every active habit is evaluated,
  and deferred candidates become ``scheduled`` rows that fire when their time
  comes. The request never fails because Redis did.

Run it with ``python -m app.engine.worker`` (``--once`` for a single pass).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import metrics
from app.db.models import Habit, Nudge, Preference
from app.db.session import session_scope
from app.engine import composer
from app.engine.policy import CandidateBundle, load_candidates, to_local
from app.engine.rules import (
    STREAK_GUARD_HOUR,
    EngineDecision,
    NudgeCandidate,
    digest_collapse,
    evaluate,
)
from app.engine.scheduler import (
    Claim,
    claim_due,
    complete,
    due_time_for,
    enqueue,
    record_event,
    requeue_stale,
)
from app.infra.redis import get_redis, redis_ping
from app.models.client import ChatClient, ModelError, get_client

log = logging.getLogger(__name__)

WORKER_INTERVAL_SECONDS = 60
WORKER_CLAIM_BATCH = 50


@dataclass(frozen=True, slots=True)
class EvaluatedCandidate:
    candidate: NudgeCandidate
    decision: EngineDecision


@dataclass(frozen=True, slots=True)
class UserReport:
    user_id: UUID
    evaluated: tuple[EvaluatedCandidate, ...] = ()
    digest_sent: bool = False
    nudge_ids: tuple[UUID, ...] = ()
    errors: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class WorkerReport:
    users: tuple[UserReport, ...] = ()
    requeued: int = 0
    redis: bool = False


async def evaluate_user(
    session: AsyncSession,
    user_id: UUID,
    *,
    model_client: ChatClient,
    redis: Redis | None,
    now_utc: datetime,
    habit_ids: set[UUID] | None = None,
    dry_run: bool = False,
) -> UserReport:
    """Evaluate one user and persist the outcomes (unless ``dry_run``)."""
    try:
        bundle = await load_candidates(session, user_id, now_utc=now_utc, habit_ids=habit_ids)
    except LookupError as exc:
        return UserReport(user_id=user_id, errors=(str(exc),))

    evaluated = tuple(
        EvaluatedCandidate(candidate=c, decision=evaluate(c)) for c in bundle.candidates
    )
    if not dry_run:
        for ec in evaluated:
            v = ec.decision.verdict
            metrics.nudge_decisions_total.labels(action=v.action, rule=v.rule).inc()
    await _emit_events(redis, bundle, evaluated)

    if dry_run or not evaluated:
        return UserReport(user_id=user_id, evaluated=evaluated)

    collapse = digest_collapse(
        [ec.decision for ec in evaluated],
        now=bundle.user.local_now,
        digest_time=bundle.user.digest_time,
    )
    allowed = [ec for ec in evaluated if ec.decision.allowed]
    # Priority first: an at-risk streak composes before anything else can fail.
    allowed.sort(key=lambda ec: (not ec.decision.verdict.priority, ec.candidate.habit_name))

    nudge_ids: list[UUID] = []
    errors: list[str] = []
    digest_sent = False
    via_redis = redis is not None and habit_ids is not None

    if collapse and allowed:
        digest_sent = await _send_digest(
            session, bundle, allowed, model_client, now_utc, nudge_ids, errors
        )

    for ec in evaluated:
        c, verdict = ec.candidate, ec.decision.verdict
        try:
            if verdict.action == "allow":
                if collapse:
                    nudge_ids.append(
                        await _write_skipped(
                            session, user_id, c.habit_id, now_utc, "collapsed into digest"
                        )
                    )
                else:
                    nudge_ids.append(await _send_single(session, bundle, ec, model_client, now_utc))
            elif verdict.action == "suppress":
                nudge_ids.append(
                    await _write_skipped(session, user_id, c.habit_id, now_utc, verdict.rule)
                )
            else:  # defer
                assert verdict.defer_until is not None  # noqa: S101
                when_utc = verdict.defer_until.astimezone(UTC)
                if via_redis:
                    assert redis is not None  # noqa: S101
                    await enqueue(redis, user_id, c.habit_id, when_utc)
                else:
                    await _write_scheduled(session, user_id, c.habit_id, now_utc, when_utc)
        except ModelError as exc:
            errors.append(f"{c.habit_name}: model failed ({exc})")
            nudge_ids.append(await _write_failed(session, user_id, c.habit_id, now_utc))
        except Exception as exc:  # noqa: BLE001 — one habit must not sink the pass
            log.exception("nudge write failed for habit %s", c.habit_id)
            errors.append(f"{c.habit_name}: {exc}")

    await session.commit()
    return UserReport(
        user_id=user_id,
        evaluated=evaluated,
        digest_sent=digest_sent,
        nudge_ids=tuple(nudge_ids),
        errors=tuple(errors),
    )


async def _send_single(
    session: AsyncSession,
    bundle: CandidateBundle,
    ec: EvaluatedCandidate,
    model_client: ChatClient,
    now_utc: datetime,
) -> UUID:
    composed = await composer.compose_nudge(
        model_client,
        user_name=bundle.user.name,
        tone=bundle.user.tone,
        habit_name=ec.candidate.habit_name,
        streak_current=ec.candidate.streak_current,
        priority=ec.decision.verdict.priority,
    )
    row = Nudge(
        user_id=bundle.user.user_id,
        habit_id=ec.candidate.habit_id,
        scheduled_for=now_utc,
        sent_at=now_utc,
        status="sent",
        body=composed.text,
        model_id=composed.model_id,
        prompt_tokens=composed.prompt_tokens,
        completion_tokens=composed.completion_tokens,
    )
    session.add(row)
    await session.flush()
    return row.id


async def _send_digest(
    session: AsyncSession,
    bundle: CandidateBundle,
    allowed: list[EvaluatedCandidate],
    model_client: ChatClient,
    now_utc: datetime,
    nudge_ids: list[UUID],
    errors: list[str],
) -> bool:
    try:
        composed = await composer.compose_digest(
            model_client,
            user_name=bundle.user.name,
            tone=bundle.user.tone,
            habits=[ec.candidate.habit_name for ec in allowed],
        )
    except ModelError as exc:
        errors.append(f"digest: model failed ({exc})")
        return False
    row = Nudge(
        user_id=bundle.user.user_id,
        habit_id=None,
        scheduled_for=now_utc,
        sent_at=now_utc,
        status="sent",
        body=composed.text,
        model_id=composed.model_id,
        prompt_tokens=composed.prompt_tokens,
        completion_tokens=composed.completion_tokens,
    )
    session.add(row)
    await session.flush()
    nudge_ids.append(row.id)
    return True


async def _write_skipped(
    session: AsyncSession, user_id: UUID, habit_id: UUID, now_utc: datetime, reason: str
) -> UUID:
    row = Nudge(
        user_id=user_id,
        habit_id=habit_id,
        scheduled_for=now_utc,
        status="skipped",
        skip_reason=reason,
    )
    session.add(row)
    await session.flush()
    return row.id


async def _write_failed(
    session: AsyncSession, user_id: UUID, habit_id: UUID, now_utc: datetime
) -> UUID:
    row = Nudge(
        user_id=user_id,
        habit_id=habit_id,
        scheduled_for=now_utc,
        status="failed",
        skip_reason="model_error",
    )
    session.add(row)
    await session.flush()
    return row.id


async def _write_scheduled(
    session: AsyncSession,
    user_id: UUID,
    habit_id: UUID,
    now_utc: datetime,
    when_utc: datetime,
) -> None:
    """Defer via the database: reschedule the pending row, or insert one."""
    row = await session.scalar(
        select(Nudge).where(
            Nudge.habit_id == habit_id,
            Nudge.status == "scheduled",
            Nudge.scheduled_for > now_utc,
        )
    )
    if row is None:
        session.add(
            Nudge(
                user_id=user_id,
                habit_id=habit_id,
                scheduled_for=when_utc,
                status="scheduled",
            )
        )
    else:
        row.scheduled_for = when_utc
    await session.flush()


async def _emit_events(
    redis: Redis | None, bundle: CandidateBundle, evaluated: tuple[EvaluatedCandidate, ...]
) -> None:
    if redis is None:
        return
    for ec in evaluated:
        v = ec.decision.verdict
        try:
            await record_event(
                redis,
                {
                    "user_id": str(bundle.user.user_id),
                    "habit_id": str(ec.candidate.habit_id),
                    "action": v.action,
                    "rule": v.rule,
                    "reason": v.reason,
                },
            )
        except Exception as exc:  # noqa: BLE001 — telemetry never fails a pass
            log.warning("nudge event dropped: %s", exc)


# ------------------------------------------------------------------ passes


async def run_once(
    *, now_utc: datetime | None = None, batch: int = WORKER_CLAIM_BATCH
) -> WorkerReport:
    """One worker pass: requeue stale claims, evaluate claims, or scan the DB."""
    now = now_utc or datetime.now(UTC)
    redis: Redis | None = get_redis() if await redis_ping() else None
    if redis is None:
        log.warning("worker: redis unreachable — evaluating from the database")

    model_client = get_client()
    reports: list[UserReport] = []
    requeued = 0
    try:
        async with session_scope() as session:
            if redis is not None:
                try:
                    requeued = await requeue_stale(redis, now_utc=now)
                    claims = await claim_due(redis, now_utc=now, batch=batch)
                except Exception as exc:  # noqa: BLE001 — degrade to the DB scan
                    log.warning("worker: redis claim failed (%s) — scanning the DB", exc)
                    redis = None
                    claims = []
                if redis is not None:
                    await _run_claims(session, redis, claims, model_client, now, reports)
                    metrics.nudge_worker_runs_total.labels(result="ok").inc()
                    return WorkerReport(users=tuple(reports), requeued=requeued, redis=True)

            user_ids = list(
                await session.scalars(
                    select(Habit.user_id)
                    .where(Habit.active.is_(True), Habit.archived_at.is_(None))
                    .distinct()
                )
            )
            for user_id in user_ids:
                reports.append(
                    await evaluate_user(
                        session, user_id, model_client=model_client, redis=None, now_utc=now
                    )
                )
    except Exception:  # noqa: BLE001
        metrics.nudge_worker_runs_total.labels(result="failed").inc()
        raise
    metrics.nudge_worker_runs_total.labels(result="ok" if redis else "degraded").inc()
    return WorkerReport(users=tuple(reports), requeued=requeued, redis=redis is not None)


async def _run_claims(
    session: AsyncSession,
    redis: Redis,
    claims: list[Claim],
    model_client: ChatClient,
    now: datetime,
    reports: list[UserReport],
) -> None:
    by_user: dict[UUID, set[UUID]] = {}
    for claim in claims:
        by_user.setdefault(claim.user_id, set()).add(claim.habit_id)
    for user_id, habit_ids in by_user.items():
        report = await evaluate_user(
            session,
            user_id,
            model_client=model_client,
            redis=redis,
            now_utc=now,
            habit_ids=habit_ids,
        )
        reports.append(report)
        # Release every claim for this user: terminal outcomes are rows now,
        # deferred ones are re-enqueued, and vanished habits (archived since
        # seeding) must not ride the lease forever. A user that raised keeps
        # its claims inflight until the lease lapses and requeues them.
        for claim in claims:
            if claim.user_id == user_id:
                await complete(redis, claim)


async def seed_once(*, now_utc: datetime | None = None) -> int:
    """Enqueue habits that have no nudge yet today. Idempotent per UTC day."""
    now = now_utc or datetime.now(UTC)
    if not await redis_ping():
        log.warning("seed: redis unreachable — nothing enqueued")
        return 0
    redis = get_redis()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    seeded = 0
    async with session_scope() as session:
        nudged_today = set(
            await session.scalars(
                select(Nudge.habit_id).where(
                    Nudge.habit_id.is_not(None), Nudge.created_at >= day_start
                )
            )
        )
        habits = list(
            await session.scalars(
                select(Habit).where(Habit.active.is_(True), Habit.archived_at.is_(None))
            )
        )
        if not habits:
            return 0
        timezones = {
            p.user_id: p.timezone
            for p in await session.scalars(
                select(Preference).where(Preference.user_id.in_({h.user_id for h in habits}))
            )
        }
        for habit in habits:
            if habit.id in nudged_today:
                continue
            local_now = to_local(now, timezones.get(habit.user_id) or "UTC")
            # Seed-time streak check is approximate by design: the rules
            # re-verify at claim time, so a wrong guess only shifts the
            # enqueue time, never the decision.
            due_local = due_time_for(
                local_now,
                habit.preferred_time,
                streak_at_risk=local_now.hour >= STREAK_GUARD_HOUR,
            )
            await enqueue(redis, habit.user_id, habit.id, due_local.astimezone(UTC))
            seeded += 1
    return seeded


async def run_forever(*, interval: int = WORKER_INTERVAL_SECONDS) -> None:
    log.info("nudge worker starting (interval=%ss)", interval)
    while True:
        try:
            seeded = await seed_once()
            report = await run_once()
            log.info(
                "worker pass: seeded=%d users=%d requeued=%d redis=%s",
                seeded,
                len(report.users),
                report.requeued,
                report.redis,
            )
        except Exception:  # noqa: BLE001 — the loop outlives any single pass
            log.exception("worker pass failed")
        await asyncio.sleep(interval)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="NudgeAI nudge worker")
    parser.add_argument("--once", action="store_true", help="run a single pass and exit")
    parser.add_argument("--interval", type=int, default=WORKER_INTERVAL_SECONDS)
    parser.add_argument("--batch", type=int, default=WORKER_CLAIM_BATCH)
    args = parser.parse_args(argv)
    if args.once:
        report = asyncio.run(run_once(batch=args.batch))
        print(f"users={len(report.users)} requeued={report.requeued} redis={report.redis}")
    else:
        asyncio.run(run_forever(interval=args.interval))


if __name__ == "__main__":
    main()
