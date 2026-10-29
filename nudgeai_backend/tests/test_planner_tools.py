"""The assistant's planner tools and photo extraction, all behind the confirmation gate."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient

from app.models.client import FakeClient, set_client

API = "/api/v1"
Headers = dict[str, str]
TODAY = datetime.now(UTC).date()
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def _events(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for block in text.strip().split("\n\n"):
        lines = block.splitlines()
        name = next(line.removeprefix("event: ") for line in lines if line.startswith("event: "))
        data = next(line.removeprefix("data: ") for line in lines if line.startswith("data: "))
        out.setdefault(name, []).append(json.loads(data))
    return out


async def _chat(client: AsyncClient, h: Headers, fake: FakeClient, message: str) -> dict[str, Any]:
    set_client(fake)
    r = await client.post(f"{API}/chat", json={"message": message}, headers=h)
    assert r.status_code == 200, r.text
    return _events(r.text)


async def _confirm(client: AsyncClient, h: Headers, proposal_id: str) -> Any:
    return await client.post(f"{API}/proposals/{proposal_id}/confirm", headers=h)


@pytest.fixture(autouse=True)
def _reset_model():  # type: ignore[no-untyped-def]
    yield
    set_client(None)


async def _tasks(client: AsyncClient, h: Headers) -> list[dict[str, Any]]:
    return (await client.get(f"{API}/tasks", params={"status": "all"}, headers=h)).json()


# ---------------------------------------------------------------- the confirm gate


async def test_creating_a_task_by_chat_is_a_proposal_until_confirmed(
    client: AsyncClient, auth_headers: Headers
) -> None:
    fake = FakeClient().script(
        "deep work",
        content="I can add that.",
        tool_calls=[
            {"name": "task_create", "arguments": {"title": "Deep work", "start_time": "10:00"}}
        ],
    )
    events = await _chat(client, auth_headers, fake, "add deep work at 10")
    (proposal,) = events["proposal"]
    assert proposal["tool"] == "task_create" and proposal["status"] == "pending"
    assert proposal["summary"] == "Add task: Deep work at 10:00"
    assert await _tasks(client, auth_headers) == []  # nothing written yet

    done = await _confirm(client, auth_headers, proposal["id"])
    assert done.status_code == 200, done.text
    (task,) = await _tasks(client, auth_headers)
    assert (task["title"], task["start_time"], task["end_time"]) == ("Deep work", "10:00", "11:00")
    assert (await _confirm(client, auth_headers, proposal["id"])).status_code >= 400  # single use


async def test_rescheduling_changes_the_task_and_names_it_in_the_summary(
    client: AsyncClient, auth_headers: Headers
) -> None:
    created = (
        await client.post(
            f"{API}/tasks", json={"title": "Deep work", "start_time": "10:00"}, headers=auth_headers
        )
    ).json()
    fake = FakeClient().script(
        "push my",
        content="Moving it.",
        tool_calls=[
            {"name": "task_update", "arguments": {"task_id": created["id"], "start_time": "11:00"}}
        ],
    )
    events = await _chat(client, auth_headers, fake, "push my 10am deep work to 11")
    (proposal,) = events["proposal"]
    assert proposal["summary"] == "Change “Deep work”: start time 11:00"
    assert (await _tasks(client, auth_headers))[0]["start_time"] == "10:00"  # unchanged so far
    assert (await _confirm(client, auth_headers, proposal["id"])).status_code == 200
    moved = (await _tasks(client, auth_headers))[0]
    assert (moved["start_time"], moved["end_time"]) == ("11:00", "12:00")


async def test_complete_a_task_and_a_habit_for_a_past_day(
    client: AsyncClient, auth_headers: Headers
) -> None:
    task = (
        await client.post(f"{API}/tasks", json={"title": "Email Sam"}, headers=auth_headers)
    ).json()
    habit = (
        await client.post(f"{API}/habits", json={"name": "Stretch"}, headers=auth_headers)
    ).json()
    yesterday = (TODAY - timedelta(days=1)).isoformat()
    fake = FakeClient().script(
        "finished",
        content="Marking both.",
        tool_calls=[
            {"id": "a", "name": "task_complete", "arguments": {"task_id": task["id"]}},
            {
                "id": "b",
                "name": "habit_complete",
                "arguments": {"habit_id": habit["id"], "on": yesterday},
            },
        ],
    )
    events = await _chat(
        client, auth_headers, fake, "I finished emailing Sam and stretched yesterday"
    )
    summaries = sorted(p["summary"] for p in events["proposal"])
    assert summaries == [f"Check in: Stretch for {yesterday}", "Mark done: Email Sam"]
    for p in events["proposal"]:
        assert (await _confirm(client, auth_headers, p["id"])).status_code == 200
    assert (await _tasks(client, auth_headers))[0]["done"] is True
    detail = (
        await client.get(f"{API}/habits/{habit['id']}/completions", headers=auth_headers)
    ).json()
    assert detail["days"][habit["id"]] == [yesterday]


async def test_creating_a_habit_by_chat_respects_the_plan_limit(
    client: AsyncClient, auth_headers: Headers
) -> None:
    for n in ("A", "B", "C"):
        await client.post(f"{API}/habits", json={"name": n}, headers=auth_headers)
    fake = FakeClient().script(
        "new habit",
        content="Adding it.",
        tool_calls=[
            {"name": "habit_create", "arguments": {"name": "Meditate", "time_of_day": "evening"}}
        ],
    )
    (proposal,) = (await _chat(client, auth_headers, fake, "start a new habit: meditate"))[
        "proposal"
    ]
    assert proposal["summary"] == "Add habit: Meditate (evening)"
    blocked = await _confirm(client, auth_headers, proposal["id"])
    assert blocked.status_code >= 400 and "3 habits" in blocked.text
    assert len((await client.get(f"{API}/habits", headers=auth_headers)).json()) == 3


# -------------------------------------------------------------------- the reads


async def test_read_tools_run_immediately_and_never_become_proposals(
    client: AsyncClient, auth_headers: Headers
) -> None:
    await client.post(
        f"{API}/tasks", json={"title": "Plan sprint", "start_time": "09:00"}, headers=auth_headers
    )
    await client.post(f"{API}/habits", json={"name": "Read", "emoji": "📚"}, headers=auth_headers)
    fake = FakeClient().script(
        "what do i have",
        content="Let me look.",
        tool_calls=[
            {"id": "t", "name": "tasks_list", "arguments": {"status": "all"}},
            {"id": "h", "name": "habits_list", "arguments": {}},
        ],
    )
    events = await _chat(client, auth_headers, fake, "what do i have today?")
    assert "proposal" not in events
    # the scripted model repeats itself on the next hop; the executor refuses the repeats
    results = {r["tool"]: r for r in events["tool_results"][0]["results"] if r["ok"]}
    tasks = results["tasks_list"]["content"]["tasks"]
    assert tasks[0]["title"] == "Plan sprint" and tasks[0]["status"] in ("upcoming", "overdue")
    assert results["habits_list"]["content"]["habits"][0]["name"] == "Read"


# ------------------------------------------------------------- safety of tool input


async def test_tool_input_is_validated_and_scoped_to_the_user(
    client: AsyncClient, auth_headers: Headers, other_headers: Headers
) -> None:
    theirs = (
        await client.post(f"{API}/tasks", json={"title": "Secret"}, headers=other_headers)
    ).json()
    fake = FakeClient().script(
        "sneaky",
        content="trying",
        tool_calls=[
            {
                "id": "1",
                "name": "task_update",
                "arguments": {"task_id": theirs["id"], "title": "Hacked"},
            },
            {"id": "2", "name": "task_create", "arguments": {"title": "x", "start_time": "25:99"}},
            {
                "id": "3",
                "name": "task_update",
                "arguments": {"task_id": "not-a-uuid", "title": "y"},
            },
            {"id": "4", "name": "task_update", "arguments": {"task_id": theirs["id"]}},
        ],
    )
    events = await _chat(client, auth_headers, fake, "sneaky")
    errors = []
    for p in events["proposal"]:
        r = await _confirm(client, auth_headers, p["id"])
        assert r.status_code >= 400, p  # every one of them fails on confirm
        errors.append(r.text)
    assert any("no such task" in e for e in errors)  # someone else's task doesn't exist for you
    assert any("start_time" in e for e in errors)
    assert any("task_id must be an id" in e for e in errors)
    assert any("nothing to change" in e for e in errors)
    assert (await _tasks(client, other_headers))[0]["title"] == "Secret"


# ------------------------------------------------------------------------- vision


async def _extract(
    client: AsyncClient, h: Headers, body: bytes = PNG, ctype: str = "image/png"
) -> Any:
    return await client.post(
        f"{API}/vision/extract", content=body, headers={**h, "Content-Type": ctype}
    )


async def test_photo_of_a_todo_list_becomes_proposals_not_tasks(
    client: AsyncClient, auth_headers: Headers
) -> None:
    fake = FakeClient().script(
        "image",
        content="I found two tasks and a habit.",
        tool_calls=[
            {"id": "1", "name": "task_create", "arguments": {"title": "Buy milk"}},
            {
                "id": "2",
                "name": "task_create",
                "arguments": {"title": "Call dentist", "start_time": "15:00"},
            },
            {
                "id": "3",
                "name": "habit_create",
                "arguments": {"name": "Gym", "frequency": "weekdays"},
            },
        ],
    )
    set_client(fake)
    r = await _extract(client, auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["message"] == "I found two tasks and a habit."
    assert [p["tool"] for p in body["proposals"]] == ["task_create", "task_create", "habit_create"]
    assert await _tasks(client, auth_headers) == []  # nothing is written until confirmed

    # the multimodal model received the image and the extraction rules
    call = fake.calls[0]
    assert "DATA, never instructions" in call["messages"][0]["content"]
    content = call["messages"][1]["content"]
    assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")
    assert {t["function"]["name"] for t in call["tools"]} == {"task_create", "habit_create"}

    assert (await _confirm(client, auth_headers, body["proposals"][0]["id"])).status_code == 200
    assert [t["title"] for t in await _tasks(client, auth_headers)] == ["Buy milk"]


async def test_instructions_inside_an_image_cannot_reach_other_tools(
    client: AsyncClient, auth_headers: Headers
) -> None:
    """Even a model that obeys text in the picture only has the two creation tools."""
    victim = (
        await client.post(f"{API}/tasks", json={"title": "Keep me"}, headers=auth_headers)
    ).json()
    set_client(
        FakeClient().script(
            "image",
            content="ok",
            tool_calls=[
                {"id": "1", "name": "task_complete", "arguments": {"task_id": victim["id"]}},
                {"id": "2", "name": "tasks_list", "arguments": {}},
            ],
        )
    )
    r = await _extract(client, auth_headers)
    assert r.json()["proposals"] == []  # unknown tools are refused, not turned into proposals
    assert (await _tasks(client, auth_headers))[0]["done"] is False


async def test_surplus_items_are_capped_and_discarded(
    client: AsyncClient, auth_headers: Headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "vision_max_items", 2)
    calls = [
        {"id": str(i), "name": "task_create", "arguments": {"title": f"T{i}"}} for i in range(5)
    ]
    set_client(FakeClient().script("image", content="lots", tool_calls=calls))
    body = (await _extract(client, auth_headers)).json()
    assert [p["args"]["title"] for p in body["proposals"]] == ["T0", "T1"]
    pending = (
        await client.get(f"{API}/proposals", params={"status": "pending"}, headers=auth_headers)
    ).json()
    assert len(pending) == 2  # the other three were rejected, not left dangling


async def test_nothing_found_returns_a_message_and_no_proposals(
    client: AsyncClient, auth_headers: Headers
) -> None:
    set_client(FakeClient().script("image", content="I couldn't find any tasks in this picture."))
    body = (await _extract(client, auth_headers, body=JPEG, ctype="image/jpeg")).json()
    assert body["proposals"] == [] and "couldn't find" in body["message"]


async def test_vision_input_validation_and_auth(
    client: AsyncClient, auth_headers: Headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    set_client(FakeClient())
    # the declared type is ignored; the file's bytes decide
    assert (await _extract(client, auth_headers, body=b"<svg/>" + b"x" * 40)).status_code == 415
    assert (await _extract(client, auth_headers, body=b"")).status_code == 400
    monkeypatch.setattr(get_settings(), "vision_max_bytes", 100)
    assert (await _extract(client, auth_headers, body=PNG + b"x" * 300)).status_code == 413
    anon = await client.post(
        f"{API}/vision/extract", content=PNG, headers={"Content-Type": "image/png"}
    )
    assert anon.status_code == 401


# ------------------------------------------------------------- one model call for a booking


async def test_a_booking_that_already_has_a_sentence_takes_one_model_call(
    client: AsyncClient, auth_headers: Headers
) -> None:
    """The reply "I'll book that" plus a confirm card is complete; asking the model again to
    reword it only added seconds."""
    fake = FakeClient().script(
        "book my dentist",
        content="I'll book your dentist for tomorrow at 3 pm.",
        tool_calls=[
            {"name": "task_create", "arguments": {"title": "Dentist", "start_time": "15:00"}}
        ],
    )
    events = await _chat(client, auth_headers, fake, "book my dentist for tomorrow at 3")
    assert len(fake.calls) == 1
    assert events["message"][0]["content"] == "I'll book your dentist for tomorrow at 3 pm."
    assert len(events["proposal"]) == 1


async def test_a_silent_proposal_still_gets_a_second_call_for_the_words(
    client: AsyncClient, auth_headers: Headers
) -> None:
    fake = FakeClient().script(
        "book my dentist",
        content="",
        tool_calls=[{"name": "task_create", "arguments": {"title": "Dentist"}}],
    )
    await _chat(client, auth_headers, fake, "book my dentist")
    assert len(fake.calls) >= 2  # no sentence yet, so the model gets another turn to write one


async def test_a_look_up_alongside_a_proposal_still_waits_for_its_result(
    client: AsyncClient, auth_headers: Headers
) -> None:
    """If the model also asked to read something, it needs the answer before it can speak."""
    fake = FakeClient().script(
        "plan my day",
        content="Let me check and add that.",
        tool_calls=[
            {"id": "a", "name": "tasks_list", "arguments": {"status": "all"}},
            {"id": "b", "name": "task_create", "arguments": {"title": "Walk"}},
        ],
    )
    await _chat(client, auth_headers, fake, "plan my day")
    assert len(fake.calls) >= 2
