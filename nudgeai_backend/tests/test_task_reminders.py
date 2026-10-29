"""Task reminders: the words, and the job that sends one shortly before a task starts."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.prompts import system_prompt
from app.db.models import ENGINE_KINDS, Nudge, Task
from app.services import notification_service, task_reminders
from app.services.reminder_copy import clock_label, task_reminder

API = "/api/v1"
Headers = dict[str, str]
DAY = "2026-11-02"
# 15:00 on DAY in a UTC account.
START = datetime(2026, 11, 2, 15, 0, tzinfo=UTC)


def at(minutes_from_start: float) -> datetime:
    return START + timedelta(minutes=minutes_from_start)


# ---------------------------------------------------------------------------- the words


def test_clock_labels_are_twelve_hour() -> None:
    assert clock_label("15:00") == "3:00 pm"
    assert clock_label("09:05") == "9:05 am"
    assert clock_label("00:30") == "12:30 am"
    assert clock_label("12:00") == "12:00 pm"


def test_the_headline_counts_down_and_says_now() -> None:
    def headline(minutes: int) -> str:
        return task_reminder(
            title="Dentist",
            start_time="15:00",
            minutes_left=minutes,
            tone="gentle",
            name=None,
            emojis=False,
        )[0]

    assert headline(10) == "Dentist in 10 min"
    assert headline(1) == "Dentist in 1 min"
    assert headline(0) == "Dentist starts now"


@pytest.mark.parametrize(
    ("tone", "name", "expected"),
    [
        ("gentle", "Ada", "Hey Ada, Dentist starts at 3:00 pm. You've got this."),
        ("gentle", None, "Dentist starts at 3:00 pm. You've got this."),
        ("firm", "Ada", "Ada. Dentist, 3:00 pm. Time to move."),
        ("firm", None, "Dentist, 3:00 pm. Time to move."),
        ("mix", "Ada", "Ada, Dentist is coming up at 3:00 pm."),
        (None, "Ada", "Hey Ada, Dentist starts at 3:00 pm. You've got this."),
        ("surprise", None, "Dentist starts at 3:00 pm. You've got this."),
    ],
)
def test_the_body_follows_the_tone_and_name_setting(
    tone: str | None, name: str | None, expected: str
) -> None:
    _, body = task_reminder(
        title="Dentist", start_time="15:00", minutes_left=10, tone=tone, name=name, emojis=False
    )
    assert body == expected


def test_emoji_and_long_titles_are_handled() -> None:
    _, body = task_reminder(
        title="Dentist", start_time="15:00", minutes_left=5, tone="mix", name=None, emojis=True
    )
    assert body.endswith(" ⏰")
    headline, _ = task_reminder(
        title="x" * 200, start_time="15:00", minutes_left=5, tone="mix", name=None, emojis=False
    )
    assert len(headline) < 80 and "…" in headline


def test_reminders_are_not_counted_as_habit_nudges() -> None:
    assert "reminder" not in ENGINE_KINDS


# ------------------------------------------------------------------------ the job


async def _task(
    client: AsyncClient,
    h: Headers,
    title: str = "Dentist",
    start: str | None = "15:00",
    **extra: object,
) -> str:
    body: dict[str, object] = {"title": title, "date": DAY, **extra}
    if start:
        body["start_time"] = start
    r = await client.post(f"{API}/tasks", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _reminders(session: AsyncSession) -> list[Nudge]:
    session.expire_all()
    rows = await session.scalars(
        select(Nudge).where(Nudge.kind == "reminder").order_by(Nudge.created_at)
    )
    return list(rows)


async def _prefs(client: AsyncClient, h: Headers, **prefs: object) -> None:
    r = await client.patch(f"{API}/preferences", json=prefs, headers=h)
    assert r.status_code == 200, r.text


async def test_a_reminder_is_sent_shortly_before_the_task_starts(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    task_id = await _task(client, auth_headers)
    assert await task_reminders.send_due_task_reminders(session, at(-8)) == 1

    (note,) = await _reminders(session)
    assert (note.status, note.kind, str(note.task_id)) == ("sent", "reminder", task_id)
    assert note.title == "Dentist in 8 min"
    assert "3:00 pm" in (note.body or "")


async def test_the_window_opens_ten_minutes_before_and_closes_thirty_after(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    await _task(client, auth_headers)
    assert await task_reminders.send_due_task_reminders(session, at(-11)) == 0  # too early
    assert await task_reminders.send_due_task_reminders(session, at(-9.9)) == 1  # inside the lead

    # a second task, too late for a reminder to be worth sending
    await _task(client, auth_headers, "Old", "09:00")
    assert (
        await task_reminders.send_due_task_reminders(
            session, datetime(2026, 11, 2, 9, 31, tzinfo=UTC)
        )
        == 0
    )


async def test_a_late_pass_still_delivers_but_says_it_is_starting_now(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    await _task(client, auth_headers)
    assert await task_reminders.send_due_task_reminders(session, at(+20)) == 1  # worker was down
    (note,) = await _reminders(session)
    assert note.title == "Dentist starts now"


async def test_each_task_is_reminded_once(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    task_id = await _task(client, auth_headers)
    for minutes in (-8, -7, -3, 0):  # the worker passes every minute
        await task_reminders.send_due_task_reminders(session, at(minutes))
    assert len(await _reminders(session)) == 1
    session.expire_all()
    task = await session.get(Task, task_id)
    assert task is not None and task.reminded_at is not None


async def test_moving_a_task_gives_the_new_time_its_own_reminder(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    task_id = await _task(client, auth_headers)
    await task_reminders.send_due_task_reminders(session, at(-8))
    moved = await client.patch(
        f"{API}/tasks/{task_id}", json={"start_time": "16:00"}, headers=auth_headers
    )
    assert moved.status_code == 200, moved.text

    assert await task_reminders.send_due_task_reminders(session, at(+52)) == 1  # 15:52 → 16:00 soon
    titles = [n.title for n in await _reminders(session)]
    assert titles == ["Dentist in 8 min", "Dentist in 8 min"]


async def test_finished_deleted_and_all_day_tasks_get_nothing(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    done = await _task(client, auth_headers, "Done", "15:00")
    gone = await _task(client, auth_headers, "Gone", "15:00")
    await _task(client, auth_headers, "All day", None)
    await client.post(f"{API}/tasks/{done}/complete", headers=auth_headers)
    await client.delete(f"{API}/tasks/{gone}", headers=auth_headers)
    assert await task_reminders.send_due_task_reminders(session, at(-5)) == 0


async def test_the_time_is_the_persons_local_time_not_utc(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    await client.patch(f"{API}/profile", json={"timezone": "Africa/Lagos"}, headers=auth_headers)
    await _task(client, auth_headers)  # 15:00 in Lagos (UTC+1) is 14:00 UTC
    assert (
        await task_reminders.send_due_task_reminders(session, at(-8)) == 0
    )  # 14:52 Lagos? no: 15:52
    assert (
        await task_reminders.send_due_task_reminders(session, at(-68)) == 1
    )  # 13:52 UTC = 14:52 Lagos


async def test_quiet_hours_hold_a_reminder_back_until_they_end(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    await _prefs(
        client,
        auth_headers,
        quiet_enabled=True,
        quiet_start="14:30",
        quiet_end="15:05",
        quiet_repeat_days=[],
    )
    await _task(client, auth_headers)
    assert await task_reminders.send_due_task_reminders(session, at(-5)) == 0  # 14:55, quiet
    assert (
        await task_reminders.send_due_task_reminders(session, at(+6)) == 1
    )  # 15:06, over: late but sent


async def test_a_high_priority_task_can_break_quiet_hours_if_the_person_allowed_it(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    await _prefs(
        client,
        auth_headers,
        quiet_enabled=True,
        quiet_start="14:30",
        quiet_end="15:05",
        quiet_repeat_days=[],
        quiet_allow_priority=True,
    )
    await _task(client, auth_headers, "Urgent", priority="high")
    await _task(client, auth_headers, "Routine", priority="medium")
    assert await task_reminders.send_due_task_reminders(session, at(-5)) == 1
    assert [n.title for n in await _reminders(session)] == ["Urgent in 5 min"]

    await _prefs(client, auth_headers, quiet_allow_priority=False)
    await _task(client, auth_headers, "Urgent two", priority="high")
    assert await task_reminders.send_due_task_reminders(session, at(-4)) == 0  # not allowed now


async def test_with_push_switched_off_the_inbox_still_gets_it(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    await _prefs(client, auth_headers, push_enabled=False)
    await _task(client, auth_headers)
    assert await task_reminders.send_due_task_reminders(session, at(-5)) == 1
    assert len(await _reminders(session)) == 1


async def test_the_tone_and_name_settings_are_followed(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    await _prefs(client, auth_headers, reminder_tone="firm", use_name_in_reminders=False)
    await _task(client, auth_headers)
    await task_reminders.send_due_task_reminders(session, at(-5))
    (note,) = await _reminders(session)
    assert note.body == "Dentist, 3:00 pm. Time to move."


async def test_everyone_gets_their_own_and_only_their_own(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers, other_headers: Headers
) -> None:
    await _task(client, auth_headers, "Mine")
    await _task(client, other_headers, "Theirs")
    assert await task_reminders.send_due_task_reminders(session, at(-5)) == 2

    mine = (await client.get(f"{API}/notifications", headers=auth_headers)).json()["items"]
    theirs = (await client.get(f"{API}/notifications", headers=other_headers)).json()["items"]
    assert [n["title"] for n in mine if n["kind"] == "reminder"] == ["Mine in 5 min"]
    assert [n["title"] for n in theirs if n["kind"] == "reminder"] == ["Theirs in 5 min"]


async def test_the_inbox_shows_the_reminder_with_its_task_so_it_can_open_it(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    task_id = await _task(client, auth_headers)
    await task_reminders.send_due_task_reminders(session, at(-5))
    items = (await client.get(f"{API}/notifications", headers=auth_headers)).json()["items"]
    (reminder,) = [n for n in items if n["kind"] == "reminder"]
    assert reminder["task_id"] == task_id and reminder["read"] is False
    read = await client.post(f"{API}/notifications/{reminder['id']}/read", headers=auth_headers)
    assert read.status_code == 200 and read.json()["read"] is True


async def test_deleting_the_task_removes_its_reminder_from_the_inbox_table(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    task_id = await _task(client, auth_headers)
    await task_reminders.send_due_task_reminders(session, at(-5))
    session.expire_all()
    task = await session.get(Task, task_id)
    assert task is not None
    await session.delete(task)  # a permanent delete (account deletion), not the soft one
    await session.commit()
    assert await _reminders(session) == []


# --------------------------------------------------------------- the push, the card, the prompt


def test_the_push_opens_the_task_and_is_high_priority() -> None:
    from uuid import uuid4

    row = Nudge(id=uuid4(), user_id=uuid4(), task_id=uuid4(), kind="reminder", title="T", body="B")
    message = notification_service._message("ExponentPushToken[x]", row)
    assert message["priority"] == "high"
    assert message["data"]["task_id"] == str(row.task_id)  # type: ignore[index]


async def test_the_confirm_card_promises_a_reminder_only_when_there_will_be_one() -> None:
    from uuid import uuid4

    from app.tools.planner import TaskCreateTool

    tool = TaskCreateTool()
    timed = await tool.describe(uuid4(), {"title": "Dentist", "start_time": "15:00"}, None)
    all_day = await tool.describe(uuid4(), {"title": "Dentist"}, None)
    assert timed == "Add task: Dentist at 15:00 (reminder 10 min before)"
    assert all_day == "Add task: Dentist"


def test_the_assistant_is_told_exactly_which_reminders_exist() -> None:
    prompt = system_prompt(tone="gentle", has_tools=True)
    assert "one reminder about 10 minutes before" in prompt
    assert "never promise more" in prompt
    assert "reminder" not in system_prompt(tone="gentle", has_tools=False)


# ------------------------------------------------------- asking when, never guessing


def test_the_assistant_must_ask_for_a_missing_day_or_time_and_knows_today() -> None:
    now = datetime(2026, 11, 4, 9, 30, tzinfo=UTC)
    prompt = system_prompt(tone="gentle", has_tools=True, now=now)
    assert "Never guess a date or time" in prompt
    assert "Wednesday 2026-11-04 09:30" in prompt
    assert "Never guess" not in system_prompt(tone="gentle", has_tools=False)
