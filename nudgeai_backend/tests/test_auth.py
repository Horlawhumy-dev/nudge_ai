"""Auth round-trip: signup -> verify -> login -> refresh -> logout, plus reset."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RefreshToken, User, VerificationCode

PREFIX = "/api/v1/auth"


async def _signup(
    client: AsyncClient,
    email: str = "ada@example.com",
    password: str = "garden42",  # noqa: S107
) -> str:
    r = await client.post(
        f"{PREFIX}/signup", json={"email": email, "password": password, "name": "Ada"}
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _verify(client: AsyncClient, session: AsyncSession, email: str) -> None:
    user = await session.scalar(select(User).where(User.email == email))
    assert user is not None
    code = await session.scalar(
        select(VerificationCode).where(
            VerificationCode.user_id == user.id,
            VerificationCode.purpose == "email_verification",
        )
    )
    assert code is not None
    r = await client.post(f"{PREFIX}/verify-email", json={"email": email, "code": code.code})
    assert r.status_code == 200, r.text


async def test_signup_stores_argon2_hash_never_plaintext(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _signup(client)
    user = await session.scalar(select(User).where(User.email == "ada@example.com"))
    assert user is not None
    assert user.password_hash != "garden42"
    assert user.password_hash.startswith("$argon2")
    assert user.is_email_verified is False


async def test_duplicate_signup_conflicts(client: AsyncClient) -> None:
    await _signup(client)
    r = await client.post(
        f"{PREFIX}/signup", json={"email": "ada@example.com", "password": "garden42"}
    )
    assert r.status_code == 409


async def test_signup_rejects_weak_password(client: AsyncClient) -> None:
    r = await client.post(f"{PREFIX}/signup", json={"email": "x@example.com", "password": "short"})
    assert r.status_code == 422


async def test_login_blocked_until_verified(client: AsyncClient) -> None:
    await _signup(client)
    r = await client.post(
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "garden42"}
    )
    assert r.status_code == 403


async def test_full_auth_round_trip(client: AsyncClient, session: AsyncSession) -> None:
    await _signup(client)
    await _verify(client, session, "ada@example.com")

    r = await client.post(
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "garden42"}
    )
    assert r.status_code == 200, r.text
    tokens = r.json()
    assert tokens["token_type"] == "bearer"
    assert tokens["expires_in"] > 0

    me = await client.get(
        f"{PREFIX}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"

    # Refresh rotates: the old refresh token must stop working.
    r2 = await client.post(f"{PREFIX}/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r2.status_code == 200, r2.text
    rotated = r2.json()
    assert rotated["refresh_token"] != tokens["refresh_token"]

    again = await client.post(f"{PREFIX}/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert again.status_code == 401

    out = await client.post(f"{PREFIX}/logout", json={"refresh_token": rotated["refresh_token"]})
    assert out.status_code == 200
    after = await client.post(f"{PREFIX}/refresh", json={"refresh_token": rotated["refresh_token"]})
    assert after.status_code == 401


async def test_refresh_token_revocation_is_persisted(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _signup(client)
    await _verify(client, session, "ada@example.com")
    r = await client.post(
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "garden42"}
    )
    await client.post(f"{PREFIX}/logout", json={"refresh_token": r.json()["refresh_token"]})
    revoked = await session.scalars(
        select(RefreshToken).where(RefreshToken.revoked_at.is_not(None))
    )
    assert len(revoked.all()) == 1


async def test_wrong_password_is_401_and_generic(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _signup(client)
    await _verify(client, session, "ada@example.com")
    r = await client.post(
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "wrongpass1"}
    )
    assert r.status_code == 401
    assert "invalid email or password" in r.json()["detail"]


async def test_unknown_account_gives_same_message(
    client: AsyncClient, session: AsyncSession
) -> None:
    """No account enumeration: unknown email and wrong password must match."""
    await _signup(client)
    await _verify(client, session, "ada@example.com")
    unknown = await client.post(
        f"{PREFIX}/login", json={"email": "nobody@example.com", "password": "garden42"}
    )
    wrong = await client.post(
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "wrongpass1"}
    )
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["detail"] == wrong.json()["detail"]


async def test_incorrect_code_counts_attempt(client: AsyncClient, session: AsyncSession) -> None:
    await _signup(client)
    for _ in range(3):
        r = await client.post(
            f"{PREFIX}/verify-email", json={"email": "ada@example.com", "code": "000000"}
        )
        assert r.status_code == 400
    row = await session.scalar(
        select(VerificationCode).where(VerificationCode.purpose == "email_verification")
    )
    assert row is not None
    assert row.attempts == 3


async def test_code_lockout_after_max_attempts(client: AsyncClient, session: AsyncSession) -> None:
    s_max = 5
    await _signup(client)
    for _ in range(s_max):
        await client.post(
            f"{PREFIX}/verify-email", json={"email": "ada@example.com", "code": "000000"}
        )
    r = await client.post(
        f"{PREFIX}/verify-email", json={"email": "ada@example.com", "code": "000000"}
    )
    assert r.status_code == 429


async def test_code_is_single_use(client: AsyncClient, session: AsyncSession) -> None:
    await _signup(client)
    await _verify(client, session, "ada@example.com")
    user = await session.scalar(select(User).where(User.email == "ada@example.com"))
    assert user is not None
    code = await session.scalar(
        select(VerificationCode).where(
            VerificationCode.user_id == user.id, VerificationCode.purpose == "email_verification"
        )
    )
    assert code is not None
    r = await client.post(
        f"{PREFIX}/verify-email", json={"email": "ada@example.com", "code": code.code}
    )
    assert r.status_code == 409  # already verified


async def test_password_reset_flow_revokes_sessions(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _signup(client)
    await _verify(client, session, "ada@example.com")
    login = await client.post(
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "garden42"}
    )
    old_refresh = login.json()["refresh_token"]

    # Issue a reset code straight from the service; Phase 1 has no mail transport.
    from app.services import auth_service

    code = await auth_service.request_password_reset(session, email="ada@example.com")
    assert code is not None

    v = await client.post(f"{PREFIX}/verify-reset", json={"email": "ada@example.com", "code": code})
    assert v.status_code == 200, v.text

    r = await client.post(
        f"{PREFIX}/reset-password",
        json={"email": "ada@example.com", "code": code, "new_password": "orchard77"},
    )
    assert r.status_code == 200, r.text

    # Old password is dead, new one works.
    old = await client.post(
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "garden42"}
    )
    assert old.status_code == 401
    new = await client.post(
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "orchard77"}
    )
    assert new.status_code == 200

    # Reset revoked every outstanding refresh token.
    stale = await client.post(f"{PREFIX}/refresh", json={"refresh_token": old_refresh})
    assert stale.status_code == 401


async def test_forgot_password_does_not_enumerate(client: AsyncClient) -> None:
    r = await client.post(f"{PREFIX}/forgot-password", json={"email": "nobody@example.com"})
    assert r.status_code == 200
    assert "if that account exists" in r.json()["message"]


async def test_resend_code_is_rate_limited(client: AsyncClient) -> None:
    from app.infra.redis import get_redis

    # The cooldown key lives in Redis and outlives the test database, so clear
    # every resend bucket or this test depends on run order.
    r = get_redis()
    stale = [k async for k in r.scan_iter(match="rl:*:resend")]
    if stale:
        await r.delete(*stale)
    await _signup(client)
    first = await client.post(f"{PREFIX}/resend-code", json={"email": "ada@example.com"})
    second = await client.post(f"{PREFIX}/resend-code", json={"email": "ada@example.com"})
    assert first.status_code == 200
    assert second.status_code == 429


async def test_resend_code_actually_issues_a_replacement(
    client: AsyncClient, session: AsyncSession
) -> None:
    """The endpoint must do something, not just pass the cooldown check."""
    from app.infra.redis import get_redis

    r = get_redis()
    stale = [k async for k in r.scan_iter(match="rl:*:resend")]
    if stale:
        await r.delete(*stale)

    await _signup(client)
    original = await session.scalar(
        select(VerificationCode).where(VerificationCode.purpose == "email_verification")
    )
    assert original is not None
    # Expire the live code, so a replacement is genuinely needed.
    original.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await session.commit()

    resend = await client.post(f"{PREFIX}/resend-code", json={"email": "ada@example.com"})
    assert resend.status_code == 200
    await session.refresh(original)
    assert original.consumed_at is not None, "the old code must be retired"

    live = await session.scalar(
        select(VerificationCode)
        .where(
            VerificationCode.purpose == "email_verification",
            VerificationCode.consumed_at.is_(None),
        )
        .order_by(VerificationCode.created_at.desc())
    )
    assert live is not None and live.code != original.code
    # And the new code actually works.
    verified = await client.post(
        f"{PREFIX}/verify-email", json={"email": "ada@example.com", "code": live.code}
    )
    assert verified.status_code == 200


async def test_resend_does_not_reissue_while_a_code_is_live(
    client: AsyncClient, session: AsyncSession
) -> None:
    """A still-valid code is left alone, so a spammer cannot invalidate it."""
    from app.infra.redis import get_redis

    r = get_redis()
    stale = [k async for k in r.scan_iter(match="rl:*:resend")]
    if stale:
        await r.delete(*stale)

    await _signup(client)
    before = await session.scalar(
        select(VerificationCode).where(VerificationCode.purpose == "email_verification")
    )
    assert before is not None
    assert (
        await client.post(f"{PREFIX}/resend-code", json={"email": "ada@example.com"})
    ).status_code == 200
    live = (
        (
            await session.execute(
                select(VerificationCode).where(
                    VerificationCode.purpose == "email_verification",
                    VerificationCode.consumed_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(live) == 1
    assert live[0].code == before.code


async def test_resend_is_anti_enumeration(client: AsyncClient) -> None:
    """An unknown address gets the identical response to a known one."""
    from app.infra.redis import get_redis

    async def clear_cooldown() -> None:
        r = get_redis()
        stale = [k async for k in r.scan_iter(match="rl:*:resend")]
        if stale:
            await r.delete(*stale)

    await _signup(client)
    # The cooldown is keyed by client host, which is identical for both calls, so
    # clear it between them: this test is about the response body, not the limit.
    await clear_cooldown()
    known = await client.post(f"{PREFIX}/resend-code", json={"email": "ada@example.com"})
    await clear_cooldown()
    unknown = await client.post(f"{PREFIX}/resend-code", json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


async def test_protected_route_requires_bearer(client: AsyncClient) -> None:
    assert (await client.get(f"{PREFIX}/me")).status_code == 401
    bad = await client.get(f"{PREFIX}/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert bad.status_code == 401


async def test_refresh_token_cannot_be_used_as_access_token(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _signup(client)
    await _verify(client, session, "ada@example.com")
    tokens = (
        await client.post(
            f"{PREFIX}/login", json={"email": "ada@example.com", "password": "garden42"}
        )
    ).json()
    r = await client.get(
        f"{PREFIX}/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}
    )
    assert r.status_code == 401


async def test_expired_code_rejected(client: AsyncClient, session: AsyncSession) -> None:
    from datetime import UTC, datetime, timedelta

    await _signup(client)
    row = await session.scalar(
        select(VerificationCode).where(VerificationCode.purpose == "email_verification")
    )
    assert row is not None
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await session.commit()
    r = await client.post(
        f"{PREFIX}/verify-email", json={"email": "ada@example.com", "code": row.code}
    )
    assert r.status_code == 400
    assert "expired" in r.json()["detail"]


@pytest.mark.parametrize("field", ["access", "refresh"])
async def test_tampered_token_rejected(
    client: AsyncClient, session: AsyncSession, field: str
) -> None:
    from app.core.security import create_access_token, create_refresh_token
    from app.db.models import User as U

    user = U(email="t@example.com", password_hash="x", timezone="UTC")
    session.add(user)
    await session.commit()
    token = create_access_token(user.id) if field == "access" else create_refresh_token(user.id)
    tampered = token[:-3] + ("aaa" if not token.endswith("aaa") else "bbb")
    r = await client.get(f"{PREFIX}/me", headers={"Authorization": f"Bearer {tampered}"})
    assert r.status_code == 401
