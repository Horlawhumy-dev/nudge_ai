"""In-app feedback, ratings and the data export."""

from __future__ import annotations

import json
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Feedback
from app.models.client import FakeClient, set_client

API = "/api/v1"
Headers = dict[str, str]


async def test_feedback_is_stored_with_optional_app_info(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    r = await client.post(
        f"{API}/feedback",
        json={
            "category": "idea",
            "message": "  Please add widgets for the home screen.  ",
            "app_version": "1.0.0",
            "platform": "ios",
        },
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    row = await session.scalar(select(Feedback))
    assert row is not None
    assert (row.category, row.message, row.app_version, row.platform) == (
        "idea",
        "Please add widgets for the home screen.",
        "1.0.0",
        "ios",
    )
    assert row.stars is None


async def test_a_rating_needs_stars_and_no_message(
    client: AsyncClient, session: AsyncSession, auth_headers: Headers
) -> None:
    ok = await client.post(
        f"{API}/feedback", json={"category": "rating", "stars": 4}, headers=auth_headers
    )
    assert ok.status_code == 201
    row = await session.scalar(select(Feedback))
    assert row is not None and row.stars == 4 and row.message is None


@pytest.mark.parametrize(
    "body",
    [
        {"category": "bug"},  # no message
        {"category": "bug", "message": "too short"},  # 9 chars
        {"category": "idea", "message": "x" * 2001},
        {"category": "idea", "message": "long enough message", "stars": 3},
        {"category": "rating"},  # no stars
        {"category": "rating", "stars": 6},
        {"category": "rating", "stars": 0},
        {"category": "complaint", "message": "long enough message"},
        {"category": "bug", "message": "long enough message", "platform": "tv"},
    ],
)
async def test_feedback_validation(
    client: AsyncClient, auth_headers: Headers, body: dict[str, Any]
) -> None:
    assert (
        await client.post(f"{API}/feedback", json=body, headers=auth_headers)
    ).status_code == 422


async def test_feedback_requires_auth(client: AsyncClient) -> None:
    r = await client.post(f"{API}/feedback", json={"category": "rating", "stars": 5})
    assert r.status_code == 401


async def test_export_contains_the_users_data_and_nothing_secret(
    client: AsyncClient, auth_headers: Headers, other_headers: Headers
) -> None:
    set_client(FakeClient(default={"content": "Done."}))
    habit = (
        await client.post(
            f"{API}/habits", json={"name": "Stretch", "emoji": "🧘"}, headers=auth_headers
        )
    ).json()
    await client.post(f"{API}/habits/{habit['id']}/complete", headers=auth_headers)
    await client.post(
        f"{API}/tasks", json={"title": "Plan sprint", "priority": "high"}, headers=auth_headers
    )
    await client.post(f"{API}/chat", json={"message": "Remember my goal"}, headers=auth_headers)
    await client.patch(f"{API}/preferences", json={"reminder_tone": "firm"}, headers=auth_headers)
    await client.post(f"{API}/habits", json={"name": "NOT MINE"}, headers=other_headers)

    r = await client.get(f"{API}/account/export", headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/json"
    assert 'filename="nudge-data.json"' in r.headers["content-disposition"]
    data = json.loads(r.text)

    assert data["profile"]["email"] == "chat1@example.com"
    assert [h["name"] for h in data["habits"]] == ["Stretch"]
    assert len(data["habits"][0]["check_ins"]) == 1
    assert [t["title"] for t in data["tasks"]] == ["Plan sprint"]
    assert data["preferences"]["reminder_tone"] == "firm"
    (convo,) = data["conversations"]
    assert [m["content"] for m in convo["messages"]] == ["Remember my goal", "Done."]
    assert [n["title"] for n in data["notifications"]] == ["Welcome to Nudge"]

    blob = r.text.lower()
    for secret in (
        "password",
        "argon2",
        "refresh",
        "token",
        "verification",
        "chat2@example.com",
        "not mine",
    ):
        assert secret not in blob, secret


async def test_export_requires_auth(client: AsyncClient) -> None:
    assert (await client.get(f"{API}/account/export")).status_code == 401
