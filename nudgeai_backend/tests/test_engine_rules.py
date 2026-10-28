"""Phase 3 engine rules: pure-function tests, no DB, no Redis, no model."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.engine.rules import (
    DIGEST_BURST,
    FREE_DAILY_CAP,
    STREAK_EARLY_MINUTES,
    STREAK_GUARD_HOUR,
    NudgeCandidate,
    digest_collapse,
    evaluate,
    in_quiet_hours,
    next_quiet_end,
    protects_streak,
)

HABIT = UUID("00000000-0000-4000-8000-000000000001")


def cand(**kwargs: object) -> NudgeCandidate:
    base: dict[str, object] = {
        "habit_id": HABIT,
        "habit_name": "Deep work",
        "now": datetime(2026, 10, 28, 10, 0, tzinfo=UTC),
    }
    base.update(kwargs)
    return NudgeCandidate(**base)  # type: ignore[arg-type]


def at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 10, 28, hour, minute, tzinfo=UTC)


# ------------------------------------------------------------ happy path


def test_plain_due_habit_is_allowed() -> None:
    d = evaluate(cand())
    assert d.allowed
    assert d.verdict.rule == "all_rules_passed"
    assert len(d.log) == 9  # 8 passes + the terminal allow


def test_log_records_every_rule_that_ran() -> None:
    d = evaluate(cand())
    names = [e.rule for e in d.log]
    assert names == [
        "respects_push_setting",
        "respects_plan_tier",
        "avoids_nag",
        "respects_quiet_hours",
        "respects_digest_window",
        "habit_is_due",
        "respects_habit_stack",
        "protects_streak",
        "all_rules_passed",
    ]
    assert all(e.passed for e in d.log)


# ------------------------------------------------------- 1. plan tier


def test_free_plan_cap_suppresses() -> None:
    d = evaluate(cand(plan="free", sent_today=FREE_DAILY_CAP))
    assert d.verdict.action == "suppress"
    assert d.verdict.rule == "respects_plan_tier"
    assert not d.log[-1].passed and "free plan" in d.log[-1].detail


def test_pro_plan_ignores_free_cap() -> None:
    d = evaluate(cand(plan="pro", sent_today=FREE_DAILY_CAP))
    assert d.allowed


# ---------------------------------------------------------- 2. nag cap


def test_daily_cap_suppresses() -> None:
    d = evaluate(cand(plan="pro", sent_today=6, max_per_day=6))
    assert d.verdict.action == "suppress"
    assert d.verdict.rule == "avoids_nag"
    assert "daily cap" in d.verdict.reason


def test_two_snoozes_back_off() -> None:
    d = evaluate(cand(plan="pro", snoozes_recent=2))
    assert d.verdict.action == "suppress"
    assert d.verdict.rule == "avoids_nag"
    assert "backing off" in d.verdict.reason


def test_one_snooze_still_nudges() -> None:
    assert evaluate(cand(plan="pro", snoozes_recent=1)).allowed


# ----------------------------------------------------- 3. quiet hours


def test_quiet_hours_defers_to_quiet_end() -> None:
    d = evaluate(cand(now=at(23, 30), quiet_start="22:00", quiet_end="07:00"))
    assert d.verdict.action == "defer"
    assert d.verdict.rule == "respects_quiet_hours"
    assert d.verdict.defer_until == datetime(2026, 10, 29, 7, 0, tzinfo=UTC)


def test_quiet_hours_overnight_early_morning() -> None:
    assert in_quiet_hours(at(6, 59), "22:00", "07:00")
    assert not in_quiet_hours(at(7, 0), "22:00", "07:00")
    assert in_quiet_hours(at(22, 0), "22:00", "07:00")
    assert not in_quiet_hours(at(21, 59), "22:00", "07:00")


def test_quiet_hours_same_day_window() -> None:
    assert in_quiet_hours(at(13, 0), "12:00", "14:00")
    assert not in_quiet_hours(at(14, 0), "12:00", "14:00")
    assert next_quiet_end(at(13, 0), "12:00", "14:00") == at(14, 0)


def test_quiet_hours_unset_or_empty_passes() -> None:
    assert evaluate(cand()).allowed
    assert evaluate(cand(quiet_start="22:00", quiet_end="22:00")).allowed
    assert evaluate(cand(quiet_start="nope", quiet_end="07:00")).allowed


# -------------------------------------------------- 4. digest window


def test_burst_before_digest_defers() -> None:
    d = evaluate(cand(digest_time="09:00", due_siblings=DIGEST_BURST - 1, now=at(8, 0)))
    assert d.verdict.action == "defer"
    assert d.verdict.rule == "respects_digest_window"
    assert d.verdict.defer_until == at(9, 0)


def test_small_group_ignores_digest() -> None:
    d = evaluate(cand(digest_time="09:00", due_siblings=0, now=at(8, 0)))
    assert d.allowed


def test_digest_time_fires_now() -> None:
    d = evaluate(cand(digest_time="09:00", due_siblings=5, now=at(9, 30)))
    assert d.allowed


def test_digest_collapse_only_at_digest_time() -> None:
    decisions = [evaluate(cand(digest_time="09:00")) for _ in range(DIGEST_BURST)]
    assert all(d.allowed for d in decisions)
    assert digest_collapse(decisions, now=at(9, 0), digest_time="09:00")
    assert not digest_collapse(decisions, now=at(8, 0), digest_time="09:00")
    assert not digest_collapse(decisions[:2], now=at(9, 0), digest_time="09:00")
    assert not digest_collapse(decisions, now=at(9, 0), digest_time=None)


# ------------------------------------------------------- 5. habit due


def test_completed_habit_suppresses() -> None:
    d = evaluate(cand(completions_today=1, target_per_day=1))
    assert d.verdict.action == "suppress"
    assert d.verdict.rule == "habit_is_due"


def test_partial_target_still_due() -> None:
    assert evaluate(cand(completions_today=1, target_per_day=2)).allowed


def test_future_preferred_time_defers() -> None:
    d = evaluate(cand(preferred_time="11:00", now=at(10, 0)))
    assert d.verdict.action == "defer"
    assert d.verdict.rule == "habit_is_due"
    assert d.verdict.defer_until == at(11, 0)


def test_past_preferred_time_fires() -> None:
    assert evaluate(cand(preferred_time="09:00", now=at(10, 0))).allowed


# ------------------------------------------------------------ 6. stack


def test_stacked_habit_waits_for_cue() -> None:
    d = evaluate(cand(stack_position=1, cue_completed=False))
    assert d.verdict.action == "suppress"
    assert d.verdict.rule == "respects_habit_stack"


def test_stacked_habit_fires_after_cue() -> None:
    assert evaluate(cand(stack_position=1, cue_completed=True)).allowed


def test_first_in_stack_ignores_cue() -> None:
    assert evaluate(cand(stack_position=0, cue_completed=False)).allowed


# ----------------------------------------------------------- 7. streak


def test_at_risk_streak_fires_early_with_priority() -> None:
    c = cand(streak_current=5, completions_today=0, now=at(STREAK_GUARD_HOUR + 1))
    v = protects_streak(c)
    assert v is not None and v.priority
    d = evaluate(c)
    assert d.allowed and d.verdict.rule == "protects_streak"


def test_short_or_done_streak_is_not_urgent() -> None:
    assert protects_streak(cand(streak_current=1, now=at(20, 0))) is None
    assert protects_streak(cand(streak_current=9, completions_today=1, now=at(20, 0))) is None
    assert protects_streak(cand(streak_current=9, now=at(9, 0))) is None


def test_streak_early_offset_is_two_hours() -> None:
    assert STREAK_EARLY_MINUTES == 120


# ------------------------------------------------------------- ordering


def test_first_rule_wins_over_later_ones() -> None:
    # Quiet hours AND completed: the earlier rule (quiet) must be the log entry.
    d = evaluate(
        cand(
            now=at(23, 30),
            quiet_start="22:00",
            quiet_end="07:00",
            completions_today=1,
        )
    )
    assert d.verdict.rule == "respects_quiet_hours"
    assert [e.rule for e in d.log] == [
        "respects_push_setting",
        "respects_plan_tier",
        "avoids_nag",
        "respects_quiet_hours",
    ]


def test_each_candidate_is_independent() -> None:
    other = cand(habit_id=uuid4(), habit_name="Other", completions_today=1)
    assert evaluate(cand()).allowed
    assert not evaluate(other).allowed


# ------------------------------------------------------- user settings


def test_push_off_suppresses_everything() -> None:
    d = evaluate(cand(push_enabled=False))
    assert not d.allowed
    assert d.verdict.action == "suppress" and d.verdict.rule == "respects_push_setting"
    assert [e.rule for e in d.log] == ["respects_push_setting"]


def test_streak_alerts_off_disables_the_early_streak_nudge() -> None:
    risky = cand(streak_current=5, completions_today=0, now=at(STREAK_GUARD_HOUR + 1))
    assert protects_streak(risky) is not None
    assert (
        protects_streak(cand(streak_alerts=False, streak_current=5, now=at(STREAK_GUARD_HOUR + 1)))
        is None
    )
    # the habit still nudges normally; only the "streak at risk" priority path is off
    assert (
        evaluate(
            cand(streak_alerts=False, streak_current=5, now=at(STREAK_GUARD_HOUR + 1))
        ).verdict.rule
        == "all_rules_passed"
    )
