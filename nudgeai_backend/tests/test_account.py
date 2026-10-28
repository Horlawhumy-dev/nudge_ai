"""Signed-in account management: profile, avatar, password, email, deletion."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Habit, RefreshToken, User, VerificationCode

API = "/api/v1"
PASSWORD = "Sup3rSecret!"  # the password conftest's helper signs users up with

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 64


async def _login(client: AsyncClient, email: str, password: str = PASSWORD) -> dict[str, str]:
    r = await client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
async def me(client: AsyncClient, auth_headers: dict[str, str]) -> dict[str, str]:
    return auth_headers


# ------------------------------------------------------------------------ profile


async def test_update_name_and_timezone(client: AsyncClient, me: dict[str, str]) -> None:
    r = await client.patch(
        f"{API}/profile", json={"name": "  Rophy   Alade ", "timezone": "Africa/Lagos"}, headers=me
    )
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Rophy Alade" and r.json()["timezone"] == "Africa/Lagos"
    prefs = await client.get(f"{API}/preferences", headers=me)
    assert prefs.json()["timezone"] == "Africa/Lagos"  # the engine reads this copy


@pytest.mark.parametrize("body", [{"name": "   "}, {"timezone": "Mars/Base"}, {"name": "x" * 121}])
async def test_profile_validation(client: AsyncClient, me: dict[str, str], body: dict) -> None:  # type: ignore[type-arg]
    assert (await client.patch(f"{API}/profile", json=body, headers=me)).status_code == 422


async def test_profile_requires_auth(client: AsyncClient) -> None:
    assert (await client.patch(f"{API}/profile", json={"name": "x"})).status_code == 401


# ------------------------------------------------------------------------- avatar


async def test_avatar_upload_replace_and_remove(
    client: AsyncClient, me: dict[str, str], _tmp_media: Path
) -> None:
    headers = {**me, "Content-Type": "application/octet-stream"}
    first = await client.post(f"{API}/profile/avatar", content=PNG, headers=headers)
    assert first.status_code == 200, first.text
    url = first.json()["avatar_url"]
    assert url.startswith("/media/avatars/") and url.endswith(".png")
    assert (_tmp_media / "avatars" / url.rsplit("/", 1)[1]).read_bytes() == PNG

    second = await client.post(f"{API}/profile/avatar", content=JPEG, headers=headers)
    new_url = second.json()["avatar_url"]
    assert new_url != url and new_url.endswith(".jpg")
    assert not (_tmp_media / "avatars" / url.rsplit("/", 1)[1]).exists()  # old file removed
    webp = await client.post(f"{API}/profile/avatar", content=WEBP, headers=headers)
    assert webp.json()["avatar_url"].endswith(".webp")

    gone = await client.delete(f"{API}/profile/avatar", headers=me)
    assert gone.json()["avatar_url"] is None
    assert list((_tmp_media / "avatars").iterdir()) == []


async def test_avatar_rejects_non_images_oversize_and_empty(
    client: AsyncClient, me: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    headers = {**me, "Content-Type": "image/png"}
    # The declared type is ignored: bytes decide.
    fake = await client.post(
        f"{API}/profile/avatar", content=b"<svg/>" + b"x" * 40, headers=headers
    )
    assert fake.status_code == 415
    assert (
        await client.post(f"{API}/profile/avatar", content=b"", headers=headers)
    ).status_code == 400
    monkeypatch.setattr(get_settings(), "avatar_max_bytes", 100)
    big = await client.post(f"{API}/profile/avatar", content=PNG + b"x" * 200, headers=headers)
    assert big.status_code == 413
    assert (await client.get(f"{API}/profile", headers=me)).json()["avatar_url"] is None


async def test_media_is_mounted() -> None:
    from app.main import app

    assert any(getattr(r, "name", "") == "media" for r in app.routes)


# --------------------------------------------------------------------- password


async def test_change_password_rotates_sessions(
    client: AsyncClient, session: AsyncSession, me: dict[str, str]
) -> None:
    old = await _login(client, "chat1@example.com")
    r = await client.post(
        f"{API}/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "N3w-Passw0rd!"},
        headers=me,
    )
    assert r.status_code == 200, r.text
    fresh = r.json()
    # the old refresh token is dead, the new one works, and so does the new password
    dead = await client.post(f"{API}/auth/refresh", json={"refresh_token": old["refresh_token"]})
    assert dead.status_code == 401
    alive = await client.post(f"{API}/auth/refresh", json={"refresh_token": fresh["refresh_token"]})
    assert alive.status_code == 200
    assert (
        await client.post(
            f"{API}/auth/login", json={"email": "chat1@example.com", "password": PASSWORD}
        )
    ).status_code == 401
    await _login(client, "chat1@example.com", "N3w-Passw0rd!")


async def test_change_password_checks_current_policy_and_reuse(
    client: AsyncClient, me: dict[str, str]
) -> None:
    async def attempt(current: str, new: str) -> int:
        r = await client.post(
            f"{API}/auth/change-password",
            json={"current_password": current, "new_password": new},
            headers=me,
        )
        return r.status_code

    assert await attempt("wrong-current", "N3w-Passw0rd!") == 403
    assert await attempt(PASSWORD, "weakpass1") == 422
    assert await attempt(PASSWORD, PASSWORD) == 400


# ------------------------------------------------------------------------ email


async def _code(session: AsyncSession, email: str, purpose: str) -> str:
    row = await session.scalar(
        select(VerificationCode)
        .join(User)
        .where(User.email == email, VerificationCode.purpose == purpose)
        .order_by(VerificationCode.created_at.desc())
    )
    assert row is not None
    return row.code


async def test_email_change_needs_a_code_sent_to_the_new_address(
    client: AsyncClient,
    session: AsyncSession,
    me: dict[str, str],
    outbox: list[dict[str, str]],
) -> None:
    outbox.clear()
    r = await client.post(
        f"{API}/auth/change-email",
        json={"new_email": "New.Address@Example.com", "password": PASSWORD},
        headers=me,
    )
    assert r.status_code == 200, r.text
    assert [m["to"] for m in outbox] == ["new.address@example.com"]
    profile = (await client.get(f"{API}/profile", headers=me)).json()
    assert profile["email"] == "chat1@example.com"  # unchanged until confirmed
    assert profile["pending_email"] == "new.address@example.com"

    wrong = await client.post(f"{API}/auth/confirm-email-change", json={"code": "0000"}, headers=me)
    assert wrong.status_code == 400
    code = await _code(session, "chat1@example.com", "email_change")
    ok = await client.post(f"{API}/auth/confirm-email-change", json={"code": code}, headers=me)
    assert ok.status_code == 200 and ok.json()["email"] == "new.address@example.com"
    assert ok.json()["pending_email"] is None
    await _login(client, "new.address@example.com")


async def test_email_change_guards(client: AsyncClient, me: dict[str, str]) -> None:
    async def attempt(email: str, password: str = PASSWORD) -> int:
        r = await client.post(
            f"{API}/auth/change-email", json={"new_email": email, "password": password}, headers=me
        )
        return r.status_code

    assert await attempt("someone@example.com", "wrong") == 403
    assert await attempt("chat1@example.com") == 400  # already yours
    # taken by another account
    await client.post(
        f"{API}/auth/signup", json={"email": "taken@example.com", "password": PASSWORD}
    )
    assert await attempt("taken@example.com") == 409
    # no pending change -> nothing to confirm
    nothing = await client.post(
        f"{API}/auth/confirm-email-change", json={"code": "1234"}, headers=me
    )
    assert nothing.status_code == 400


# --------------------------------------------------------------------- deletion


async def test_delete_account_removes_everything(
    client: AsyncClient, session: AsyncSession, me: dict[str, str]
) -> None:
    habit = await client.post(f"{API}/habits", json={"name": "Stretch"}, headers=me)
    await client.post(f"{API}/habits/{habit.json()['id']}/complete", headers=me)
    await client.post(f"{API}/tasks", json={"title": "Plan"}, headers=me)

    wrong = await client.post(f"{API}/auth/delete-account", json={"password": "nope"}, headers=me)
    assert wrong.status_code == 403
    assert await session.scalar(select(User).where(User.email == "chat1@example.com")) is not None

    gone = await client.post(f"{API}/auth/delete-account", json={"password": PASSWORD}, headers=me)
    assert gone.status_code == 200
    session.expire_all()
    assert await session.scalar(select(User).where(User.email == "chat1@example.com")) is None
    assert await session.scalar(select(Habit)) is None
    assert await session.scalar(select(RefreshToken)) is None
    # the old token no longer maps to anyone
    assert (await client.get(f"{API}/profile", headers=me)).status_code == 401
