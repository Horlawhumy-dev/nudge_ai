"""Free and Pro: the limits the app advertises, usage, and switching."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

API = "/api/v1"
Headers = dict[str, str]
TODAY = datetime.now(UTC).date()


async def _habit(client: AsyncClient, h: Headers, name: str) -> object:
    return await client.post(f"{API}/habits", json={"name": name}, headers=h)


async def _task(client: AsyncClient, h: Headers, title: str, **body: object) -> object:
    return await client.post(f"{API}/tasks", json={"title": title, **body}, headers=h)


async def _pro(client: AsyncClient, h: Headers, period: str = "monthly") -> None:
    r = await client.put(f"{API}/subscription", json={"plan": "pro", "period": period}, headers=h)
    assert r.status_code == 200, r.text


async def test_new_users_are_free_with_the_advertised_limits(
    client: AsyncClient, auth_headers: Headers
) -> None:
    sub = (await client.get(f"{API}/subscription", headers=auth_headers)).json()
    assert sub["plan"] == "free" and sub["period"] is None and sub["renews_at"] is None
    assert sub["limits"] == {"habits": 3, "tasks_per_day": 5}
    assert sub["usage"] == {"habits": 0, "tasks_today": 0}


async def test_the_fourth_habit_needs_pro(client: AsyncClient, auth_headers: Headers) -> None:
    for name in ("One", "Two", "Three"):
        assert (await _habit(client, auth_headers, name)).status_code == 201  # type: ignore[attr-defined]
    blocked = await _habit(client, auth_headers, "Four")
    assert blocked.status_code == 402  # type: ignore[attr-defined]
    assert "3 habits" in blocked.json()["detail"]  # type: ignore[attr-defined]
    usage = (await client.get(f"{API}/subscription", headers=auth_headers)).json()["usage"]
    assert usage["habits"] == 3


async def test_deleting_a_habit_frees_a_slot_and_restore_respects_the_limit(
    client: AsyncClient, auth_headers: Headers
) -> None:
    ids = [(await _habit(client, auth_headers, n)).json()["id"] for n in ("A", "B", "C")]  # type: ignore[attr-defined]
    await client.delete(f"{API}/habits/{ids[0]}", headers=auth_headers)
    assert (await _habit(client, auth_headers, "D")).status_code == 201  # type: ignore[attr-defined]
    # undoing the delete would make four, so it needs Pro
    assert (
        await client.post(f"{API}/habits/{ids[0]}/restore", headers=auth_headers)
    ).status_code == 402
    await _pro(client, auth_headers)
    assert (
        await client.post(f"{API}/habits/{ids[0]}/restore", headers=auth_headers)
    ).status_code == 200


async def test_the_sixth_task_of_a_day_needs_pro_but_other_days_are_separate(
    client: AsyncClient, auth_headers: Headers
) -> None:
    for i in range(5):
        assert (await _task(client, auth_headers, f"T{i}")).status_code == 201  # type: ignore[attr-defined]
    over = await _task(client, auth_headers, "T5")
    assert over.status_code == 402 and "5 tasks per day" in over.json()["detail"]  # type: ignore[attr-defined]
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    assert (await _task(client, auth_headers, "Tomorrow", date=tomorrow)).status_code == 201  # type: ignore[attr-defined]
    # a due_at-only client is counted on the day it lands
    due = (datetime.now(UTC)).isoformat()
    assert (await _task(client, auth_headers, "Legacy", due_at=due)).status_code == 402  # type: ignore[attr-defined]


async def test_deleted_and_completed_tasks_count_correctly(
    client: AsyncClient, auth_headers: Headers
) -> None:
    ids = [(await _task(client, auth_headers, f"T{i}")).json()["id"] for i in range(5)]  # type: ignore[attr-defined]
    await client.post(f"{API}/tasks/{ids[0]}/complete", headers=auth_headers)
    # completed tasks still occupy a slot for that day
    assert (await _task(client, auth_headers, "More")).status_code == 402  # type: ignore[attr-defined]
    await client.delete(f"{API}/tasks/{ids[1]}", headers=auth_headers)
    assert (await _task(client, auth_headers, "Fits now")).status_code == 201  # type: ignore[attr-defined]
    assert (
        await client.post(f"{API}/tasks/{ids[1]}/restore", headers=auth_headers)
    ).status_code == 402


async def test_pro_is_unlimited_and_reports_its_period(
    client: AsyncClient, auth_headers: Headers
) -> None:
    await _pro(client, auth_headers, "yearly")
    sub = (await client.get(f"{API}/subscription", headers=auth_headers)).json()
    assert sub["plan"] == "pro" and sub["period"] == "yearly" and sub["renews_at"]
    assert sub["limits"] == {"habits": None, "tasks_per_day": None}
    for i in range(5):
        assert (await _habit(client, auth_headers, f"H{i}")).status_code == 201  # type: ignore[attr-defined]
    for i in range(7):
        assert (await _task(client, auth_headers, f"T{i}")).status_code == 201  # type: ignore[attr-defined]
    me = (await client.get(f"{API}/auth/me", headers=auth_headers)).json()
    assert me["plan"] == "pro"


async def test_downgrading_keeps_existing_data_but_blocks_new_items(
    client: AsyncClient, auth_headers: Headers
) -> None:
    await _pro(client, auth_headers)
    for i in range(5):
        await _habit(client, auth_headers, f"H{i}")
    back = await client.put(f"{API}/subscription", json={"plan": "free"}, headers=auth_headers)
    assert back.json()["plan"] == "free" and back.json()["renews_at"] is None
    assert len((await client.get(f"{API}/habits", headers=auth_headers)).json()) == 5  # kept
    assert (await _habit(client, auth_headers, "Six")).status_code == 402  # type: ignore[attr-defined]


async def test_switching_plan_is_validated_and_can_be_disabled(
    client: AsyncClient, auth_headers: Headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    for bad in ({"plan": "enterprise"}, {"plan": "pro", "period": "weekly"}, {}):
        assert (
            await client.put(f"{API}/subscription", json=bad, headers=auth_headers)
        ).status_code == 422
    monkeypatch.setattr(get_settings(), "billing_stub_enabled", False)
    off = await client.put(f"{API}/subscription", json={"plan": "pro"}, headers=auth_headers)
    assert off.status_code == 501
    assert (await client.get(f"{API}/subscription", headers=auth_headers)).json()["plan"] == "free"


async def test_plans_are_per_user(
    client: AsyncClient, auth_headers: Headers, other_headers: Headers
) -> None:
    await _pro(client, auth_headers)
    assert (await client.get(f"{API}/subscription", headers=other_headers)).json()["plan"] == "free"
    for i in range(3):
        await _habit(client, other_headers, f"H{i}")
    assert (await _habit(client, other_headers, "Four")).status_code == 402  # type: ignore[attr-defined]


async def test_plan_requires_auth(client: AsyncClient, session: AsyncSession) -> None:
    assert (await client.get(f"{API}/subscription")).status_code == 401
    assert (await client.put(f"{API}/subscription", json={"plan": "pro"})).status_code == 401
