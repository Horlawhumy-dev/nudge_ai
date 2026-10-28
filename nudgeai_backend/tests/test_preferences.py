"""User settings and how the engine and AI voices obey them."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.tone import style_text
from app.db.models import User
from app.engine.policy import effective_quiet, load_candidates
from app.models.client import FakeClient, set_client

API = "/api/v1"
Headers = dict[str, str]


async def _uid(session: AsyncSession) -> UUID:
    user = await session.scalar(select(User).where(User.email == "chat1@example.com"))
    assert user is not None
    return user.id


async def _habit(client: AsyncClient, h: Headers, name: str = "Deep work", **extra: object) -> dict:  # type: ignore[type-arg]
    r = await client.post(
        f"{API}/habits", json={"name": name, "preferred_time": "00:00", **extra}, headers=h
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _prefs(client: AsyncClient, h: Headers, **body: object) -> dict:  # type: ignore[type-arg]
    r = await client.patch(f"{API}/preferences", json=body, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def _evaluate(client: AsyncClient, h: Headers) -> list[dict]:  # type: ignore[type-arg]
    set_client(FakeClient(default={"content": "Time for it."}))
    r = await client.post(f"{API}/nudges/evaluate", params={"dry_run": "true"}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()["evaluated"]


# ------------------------------------------------------------------- round trip


async def test_defaults_and_partial_updates(client: AsyncClient, auth_headers: Headers) -> None:
    prefs = (await client.get(f"{API}/preferences", headers=auth_headers)).json()
    assert prefs["push_enabled"] is True and prefs["weekly_report_enabled"] is False
    assert prefs["reminder_tone"] == "gentle" and prefs["use_emojis_in_reminders"] is False
    assert prefs["quiet_enabled"] is True and prefs["habit_stacking_enabled"] is True

    after = await _prefs(
        client, auth_headers, reminder_tone="firm", push_enabled=False, quiet_repeat_days=[4, 0, 0]
    )
    assert after["reminder_tone"] == "firm" and after["push_enabled"] is False
    assert after["quiet_repeat_days"] == [0, 4]  # sorted, de-duplicated
    assert after["morning_summary_enabled"] is True  # untouched fields survive
    # PUT keeps working for older clients
    put = await client.put(f"{API}/preferences", json={"voice_enabled": True}, headers=auth_headers)
    assert put.json()["voice_enabled"] is True and put.json()["reminder_tone"] == "firm"


@pytest.mark.parametrize(
    "body",
    [
        {"reminder_tone": "angry"},
        {"quiet_repeat_days": [7]},
        {"timezone": "Mars/Base"},
        {"max_nudges_per_day": 0},
    ],
)
async def test_preference_validation(
    client: AsyncClient, auth_headers: Headers, body: dict
) -> None:  # type: ignore[type-arg]
    r = await client.patch(f"{API}/preferences", json=body, headers=auth_headers)
    assert r.status_code == 422


# --------------------------------------------------------------- engine settings


async def test_push_off_suppresses_nudges(client: AsyncClient, auth_headers: Headers) -> None:
    await _habit(client, auth_headers)
    (on,) = await _evaluate(client, auth_headers)
    assert on["action"] == "allow"
    await _prefs(client, auth_headers, push_enabled=False)
    (off,) = await _evaluate(client, auth_headers)
    assert off["action"] == "suppress" and off["rule"] == "respects_push_setting"


async def test_quiet_hours_can_be_turned_off_or_limited_to_days(
    client: AsyncClient, auth_headers: Headers
) -> None:
    await _habit(client, auth_headers)
    now = datetime.now(UTC)
    start = (now - timedelta(hours=1)).strftime("%H:%M")
    end = (now + timedelta(hours=1)).strftime("%H:%M")
    if start > end:  # a window straddling midnight would make the weekday maths ambiguous
        pytest.skip("test window crosses midnight")
    today = now.weekday()
    other_days = [d for d in range(7) if d != today]
    await _prefs(client, auth_headers, timezone="UTC", quiet_start=start, quiet_end=end)

    (every_day,) = await _evaluate(client, auth_headers)
    assert every_day["rule"] == "respects_quiet_hours"

    await _prefs(client, auth_headers, quiet_repeat_days=other_days)  # not today
    (not_today,) = await _evaluate(client, auth_headers)
    assert not_today["action"] == "allow"

    await _prefs(client, auth_headers, quiet_repeat_days=[today])
    (today_only,) = await _evaluate(client, auth_headers)
    assert today_only["rule"] == "respects_quiet_hours"

    await _prefs(client, auth_headers, quiet_enabled=False)
    (switched_off,) = await _evaluate(client, auth_headers)
    assert switched_off["action"] == "allow"


async def test_stacked_habits_wait_for_their_trigger_unless_stacking_is_off(
    client: AsyncClient, auth_headers: Headers
) -> None:
    trigger = await _habit(client, auth_headers, "Coffee")
    await _habit(client, auth_headers, "Journal", stacked_after_id=trigger["id"])

    by_name = {d["habit_name"]: d for d in await _evaluate(client, auth_headers)}
    assert by_name["Coffee"]["action"] == "allow"
    assert by_name["Journal"]["action"] != "allow"
    assert by_name["Journal"]["rule"] == "respects_habit_stack"

    await _prefs(client, auth_headers, habit_stacking_enabled=False)
    by_name = {d["habit_name"]: d for d in await _evaluate(client, auth_headers)}
    assert by_name["Journal"]["action"] == "allow"


async def test_stack_cue_is_the_linked_habit_not_just_the_previous_one(
    client: AsyncClient, auth_headers: Headers
) -> None:
    """Journal is stacked after Coffee. Completing an unrelated habit doesn't release it."""
    coffee = await _habit(client, auth_headers, "Coffee")
    other = await _habit(client, auth_headers, "Stretch", stack_position=1)
    await _habit(client, auth_headers, "Journal", stacked_after_id=coffee["id"])
    await client.post(f"{API}/habits/{other['id']}/complete", headers=auth_headers)
    by_name = {d["habit_name"]: d for d in await _evaluate(client, auth_headers)}
    assert by_name["Journal"]["rule"] == "respects_habit_stack"

    await client.post(f"{API}/habits/{coffee['id']}/complete", headers=auth_headers)
    by_name = {d["habit_name"]: d for d in await _evaluate(client, auth_headers)}
    assert by_name["Journal"]["action"] == "allow"


def test_effective_quiet_handles_overnight_windows_by_start_day() -> None:
    from types import SimpleNamespace

    prefs = SimpleNamespace(
        quiet_enabled=True,
        quiet_start="22:00",
        quiet_end="07:00",
        quiet_repeat_days=[0],  # Mondays
    )
    monday_night = datetime(2026, 10, 26, 23, 0, tzinfo=UTC)  # Monday 23:00
    tuesday_early = datetime(2026, 10, 27, 2, 0, tzinfo=UTC)  # the same window, after midnight
    tuesday_night = datetime(2026, 10, 27, 23, 0, tzinfo=UTC)
    assert effective_quiet(prefs, monday_night) == ("22:00", "07:00")  # type: ignore[arg-type]
    assert effective_quiet(prefs, tuesday_early) == ("22:00", "07:00")  # type: ignore[arg-type]
    assert effective_quiet(prefs, tuesday_night) == (None, None)  # type: ignore[arg-type]
    assert effective_quiet(None, monday_night) == (None, None)


# ------------------------------------------------------------------- tone and voice


def test_style_text_reflects_every_toggle() -> None:
    warm = style_text(tone="gentle", use_name=True, include_streak=True, use_emojis=False)
    assert "warm" in warm and "first name" in warm and "no emojis" in warm
    firm = style_text(tone="firm", use_name=False, include_streak=False, use_emojis=True)
    assert "direct" in firm and "do not use the user's name" in firm
    assert "do not mention streaks" in firm and "emojis are welcome" in firm
    assert "varied" in style_text(tone="mix")
    assert style_text(tone="unknown") == style_text(tone="gentle")


async def test_engine_context_follows_tone_and_name_settings(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    await client.patch(f"{API}/profile", json={"name": "Rophy Alade"}, headers=auth_headers)
    await _habit(client, auth_headers)
    uid = await _uid(session)

    await _prefs(client, auth_headers, reminder_tone="firm", use_name_in_reminders=True)
    bundle = await load_candidates(session, uid)
    assert bundle.user.name == "Rophy"  # first name only
    assert "direct and energetic" in (bundle.user.tone or "")

    await _prefs(client, auth_headers, use_name_in_reminders=False, use_emojis_in_reminders=True)
    session.expire_all()
    bundle = await load_candidates(session, uid)
    assert bundle.user.name is None and "emojis are welcome" in (bundle.user.tone or "")


async def test_morning_summary_switch_controls_the_digest(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    await _habit(client, auth_headers)
    uid = await _uid(session)
    await _prefs(client, auth_headers, digest_time="08:00")
    assert (await load_candidates(session, uid)).user.digest_time == "08:00"
    await _prefs(client, auth_headers, morning_summary_enabled=False)
    session.expire_all()
    assert (await load_candidates(session, uid)).user.digest_time is None


async def test_chat_uses_the_users_tone_settings(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    from app.api.v1.chat import _tone

    await _prefs(client, auth_headers, reminder_tone="firm", use_emojis_in_reminders=True)
    session.expire_all()
    tone = await _tone(session, await _uid(session))
    assert tone is not None and "direct and energetic" in tone and "emojis are welcome" in tone


# -------------------------------------------------------------------- onboarding


async def test_onboarding_patch_changes_only_what_was_sent(
    client: AsyncClient, auth_headers: Headers
) -> None:
    full = {
        "name": "Rophy",
        "wake_time": "07:00",
        "sleep_time": "23:00",
        "goals": ["fitness", "reading"],
        "nudge_style": "gentle",
        "completed": True,
    }
    assert (
        await client.put(f"{API}/onboarding", json=full, headers=auth_headers)
    ).status_code == 200

    patched = await client.patch(
        f"{API}/onboarding", json={"wake_time": "06:30"}, headers=auth_headers
    )
    body = patched.json()
    assert body["wake_time"] == "06:30" and body["sleep_time"] == "23:00"
    assert body["goals"] == ["fitness", "reading"] and body["completed"] is True

    # nulls on non-nullable columns are ignored rather than 500-ing
    ok = await client.patch(
        f"{API}/onboarding", json={"goals": None, "completed": None}, headers=auth_headers
    )
    assert ok.status_code == 200 and ok.json()["goals"] == ["fitness", "reading"]
    bad = await client.patch(f"{API}/onboarding", json={"wake_time": "7am"}, headers=auth_headers)
    assert bad.status_code == 422


async def test_onboarding_tone_becomes_the_live_tone_setting(
    client: AsyncClient, auth_headers: Headers
) -> None:
    await client.get(f"{API}/preferences", headers=auth_headers)  # creates the row
    await client.patch(f"{API}/onboarding", json={"nudge_style": "mix"}, headers=auth_headers)
    assert (await client.get(f"{API}/preferences", headers=auth_headers)).json()[
        "reminder_tone"
    ] == "mix"
    # an unknown legacy style leaves the setting alone
    await client.patch(f"{API}/onboarding", json={"nudge_style": "playful"}, headers=auth_headers)
    assert (await client.get(f"{API}/preferences", headers=auth_headers)).json()[
        "reminder_tone"
    ] == "mix"
