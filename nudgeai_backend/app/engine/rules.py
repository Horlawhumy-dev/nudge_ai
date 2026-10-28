"""The Nudge Decision Engine: pure, ordered, individually testable rules.

The engine runs *before* any model call and decides whether a habit deserves
an interruption right now. The model only ever writes the sentence a human
reads, which is what makes "why didn't it nudge me?" answerable: every
suppression names the rule that fired, and the full log is a demo artifact.

Rules run in plan order and short-circuit on the first terminal verdict:

1. ``respects_plan_tier`` — the stubbed Pro flag caps free users per day
2. ``avoids_nag`` — daily cap and snooze backoff
3. ``respects_quiet_hours`` — hard gate; defers to the end of quiet hours
4. ``respects_digest_window`` — a burst collapses into one digest send
5. ``habit_is_due`` — already done today, or its preferred time hasn't come
6. ``respects_habit_stack`` — a stacked habit waits for its cue
7. ``protects_streak`` — an at-risk streak fires early, with priority

``evaluate`` returns the winning verdict plus the log of every rule that ran,
passes included, so callers can show the whole chain, not just the veto.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Literal
from uuid import UUID

Action = Literal["allow", "suppress", "defer"]

# Free users get a small daily allowance; Pro raises it to max_nudges_per_day.
# Billing is a stubbed flag (User.plan), so this constant is the whole policy.
FREE_DAILY_CAP = 3
# Two snoozes in a week means the nudge is mistimed; back off instead of nagging.
SNOOZE_BACKOFF_COUNT = 2
SNOOZE_LOOKBACK_DAYS = 7
# This many habits due at once collapse into a single digest send.
DIGEST_BURST = 3
# A streak worth protecting: long enough to hurt if it breaks.
STREAK_AT_RISK_MIN = 2
# After this local hour an uncompleted at-risk streak fires early.
STREAK_GUARD_HOUR = 17
# How far ahead of preferred time an at-risk streak moves.
STREAK_EARLY_MINUTES = 120
# The digest send absorbs nudges deferred to it within this window.
DIGEST_WINDOW_MINUTES = 15


@dataclass(frozen=True, slots=True)
class NudgeCandidate:
    """Everything the rules need, with I/O already done by the caller.

    ``now`` is the user's *local* time, timezone-aware. ``preferred_time``,
    ``quiet_start``/``quiet_end`` and ``digest_time`` are ``"HH:MM"`` strings or
    None when unset. ``due_siblings`` counts other habits that also want a
    nudge right now, which is what the digest rule collapses.
    """

    habit_id: UUID
    habit_name: str
    now: datetime
    plan: str = "free"
    preferred_time: str | None = None
    stack_position: int = 0
    target_per_day: int = 1
    completions_today: int = 0
    cue_completed: bool = True
    snoozes_recent: int = 0
    sent_today: int = 0
    max_per_day: int = 6
    quiet_start: str | None = None
    quiet_end: str | None = None
    digest_time: str | None = None
    due_siblings: int = 0
    streak_current: int = 0


@dataclass(frozen=True, slots=True)
class RuleVerdict:
    """A rule's terminal answer. ``priority`` only refines an allow."""

    action: Action
    rule: str
    reason: str
    defer_until: datetime | None = None
    priority: bool = False


@dataclass(frozen=True, slots=True)
class RuleEntry:
    """One line of the evaluation log: the rule, whether it passed, and why."""

    rule: str
    passed: bool
    detail: str


@dataclass(frozen=True, slots=True)
class EngineDecision:
    verdict: RuleVerdict
    log: tuple[RuleEntry, ...] = ()

    @property
    def allowed(self) -> bool:
        return self.verdict.action == "allow"


# ------------------------------------------------------------------ time
# Quiet hours are a daily window that may wrap past midnight ("22:00"→"07:00").


def _parse_hhmm(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


def today_at(now: datetime, hhmm: str) -> datetime:
    """Today's date at the given wall-clock time, in ``now``'s tzinfo."""
    return now.replace(
        hour=_parse_hhmm(hhmm).hour,
        minute=_parse_hhmm(hhmm).minute,
        second=0,
        microsecond=0,
    )


def quiet_window(start: str | None, end: str | None) -> tuple[time, time] | None:
    """The quiet window, or None when unset, equal, or malformed."""
    if not start or not end:
        return None
    try:
        nervous, calm = _parse_hhmm(start), _parse_hhmm(end)
    except (ValueError, IndexError):
        return None
    if nervous == calm:
        return None
    return nervous, calm


def in_quiet_hours(now: datetime, start: str | None, end: str | None) -> bool:
    window = quiet_window(start, end)
    if window is None:
        return False
    nervous, calm = window
    t = now.time()
    if nervous < calm:
        return nervous <= t < calm
    return t >= nervous or t < calm


def next_quiet_end(now: datetime, start: str, end: str) -> datetime:
    """When the current quiet window ends. Call only when inside it."""
    nervous, calm = _parse_hhmm(start), _parse_hhmm(end)
    ends = today_at(now, end)
    if nervous > calm and now.time() >= nervous:
        ends += timedelta(days=1)
    return ends


def streak_at_risk(c: NudgeCandidate) -> bool:
    """A streak worth saving, uncompleted, late in the day."""
    return (
        c.streak_current >= STREAK_AT_RISK_MIN
        and c.completions_today == 0
        and c.now.hour >= STREAK_GUARD_HOUR
    )


# ------------------------------------------------------------------ rules
# Each rule returns None to pass, or a terminal verdict to stop the chain.


def respects_plan_tier(c: NudgeCandidate) -> RuleVerdict | None:
    if c.plan != "free":
        return None
    if c.sent_today >= FREE_DAILY_CAP:
        return RuleVerdict(
            action="suppress",
            rule="respects_plan_tier",
            reason=f"free plan allows {FREE_DAILY_CAP} nudges/day ({c.sent_today} already sent)",
        )
    return None


def avoids_nag(c: NudgeCandidate) -> RuleVerdict | None:
    if c.sent_today >= c.max_per_day:
        return RuleVerdict(
            action="suppress",
            rule="avoids_nag",
            reason=f"daily cap reached ({c.sent_today}/{c.max_per_day} sent)",
        )
    if c.snoozes_recent >= SNOOZE_BACKOFF_COUNT:
        return RuleVerdict(
            action="suppress",
            rule="avoids_nag",
            reason=f"snoozed {c.snoozes_recent}x in the last "
            f"{SNOOZE_LOOKBACK_DAYS} days — backing off",
        )
    return None


def respects_quiet_hours(c: NudgeCandidate) -> RuleVerdict | None:
    if not in_quiet_hours(c.now, c.quiet_start, c.quiet_end):
        return None
    assert c.quiet_start is not None and c.quiet_end is not None  # noqa: S101
    until = next_quiet_end(c.now, c.quiet_start, c.quiet_end)
    return RuleVerdict(
        action="defer",
        rule="respects_quiet_hours",
        reason=f"quiet hours ({c.quiet_start}–{c.quiet_end}); "
        f"resuming at {until.strftime('%H:%M')}",
        defer_until=until,
    )


def respects_digest_window(c: NudgeCandidate) -> RuleVerdict | None:
    if c.digest_time is None or c.due_siblings + 1 < DIGEST_BURST:
        return None
    digest_at = today_at(c.now, c.digest_time)
    if c.now >= digest_at:
        return None  # digest time: the burst fires (collapsed) now
    return RuleVerdict(
        action="defer",
        rule="respects_digest_window",
        reason=f"{c.due_siblings + 1} nudges due — collapsing into the {c.digest_time} digest",
        defer_until=digest_at,
    )


def habit_is_due(c: NudgeCandidate) -> RuleVerdict | None:
    if c.completions_today >= c.target_per_day:
        return RuleVerdict(
            action="suppress",
            rule="habit_is_due",
            reason=f"already completed {c.completions_today}/{c.target_per_day} today",
        )
    if c.preferred_time is not None:
        due_at = today_at(c.now, c.preferred_time)
        if c.now < due_at:
            return RuleVerdict(
                action="defer",
                rule="habit_is_due",
                reason=f"not due until the preferred time {c.preferred_time}",
                defer_until=due_at,
            )
    return None


def respects_habit_stack(c: NudgeCandidate) -> RuleVerdict | None:
    if c.stack_position > 0 and not c.cue_completed:
        return RuleVerdict(
            action="suppress",
            rule="respects_habit_stack",
            reason=f"stack position {c.stack_position} waits for its cue habit",
        )
    return None


def protects_streak(c: NudgeCandidate) -> RuleVerdict | None:
    if not streak_at_risk(c):
        return None
    return RuleVerdict(
        action="allow",
        rule="protects_streak",
        reason=f"streak of {c.streak_current} at risk — firing early",
        priority=True,
    )


_RULES: tuple[Callable[[NudgeCandidate], RuleVerdict | None], ...] = (
    respects_plan_tier,
    avoids_nag,
    respects_quiet_hours,
    respects_digest_window,
    habit_is_due,
    respects_habit_stack,
    protects_streak,
)


def evaluate(c: NudgeCandidate) -> EngineDecision:
    """Run the rules in plan order; the first terminal verdict wins."""
    log: list[RuleEntry] = []
    for rule in _RULES:
        verdict = rule(c)
        if verdict is None:
            log.append(RuleEntry(rule=rule.__name__, passed=True, detail="pass"))
            continue
        log.append(RuleEntry(rule=rule.__name__, passed=False, detail=verdict.reason))
        return EngineDecision(verdict=verdict, log=tuple(log))
    verdict = RuleVerdict(action="allow", rule="all_rules_passed", reason="due now")
    log.append(RuleEntry(rule="all_rules_passed", passed=True, detail="due now"))
    return EngineDecision(verdict=verdict, log=tuple(log))


def digest_collapse(
    decisions: list[EngineDecision], *, now: datetime, digest_time: str | None
) -> bool:
    """True when this run's allowed nudges should merge into one digest send.

    The collapse only happens at digest time: a burst deferred by
    ``respects_digest_window`` arrives together, and the worker composes one
    nudge instead of three. Ordinary runs keep one nudge per habit.
    """
    if digest_time is None:
        return False
    allowed = [d for d in decisions if d.allowed]
    if len(allowed) < DIGEST_BURST:
        return False
    digest_at = today_at(now, digest_time)
    return digest_at - timedelta(minutes=DIGEST_WINDOW_MINUTES) <= now


__all__ = [
    "DIGEST_BURST",
    "DIGEST_WINDOW_MINUTES",
    "FREE_DAILY_CAP",
    "SNOOZE_BACKOFF_COUNT",
    "SNOOZE_LOOKBACK_DAYS",
    "STREAK_AT_RISK_MIN",
    "STREAK_EARLY_MINUTES",
    "STREAK_GUARD_HOUR",
    "Action",
    "EngineDecision",
    "NudgeCandidate",
    "RuleEntry",
    "RuleVerdict",
    "digest_collapse",
    "evaluate",
    "habit_is_due",
    "in_quiet_hours",
    "next_quiet_end",
    "protects_streak",
    "respects_digest_window",
    "respects_habit_stack",
    "respects_plan_tier",
    "respects_quiet_hours",
    "avoids_nag",
    "streak_at_risk",
    "today_at",
]
