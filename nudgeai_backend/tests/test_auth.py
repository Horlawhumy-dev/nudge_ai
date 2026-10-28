"""Auth round-trip: signup -> verify -> login -> refresh -> logout, plus reset."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RefreshToken, User, VerificationCode
from app.services import auth_service

PREFIX = "/api/v1/auth"


async def _signup(
    client: AsyncClient,
    email: str = "ada@example.com",
    password: str = "Garden42!",  # noqa: S107
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
    assert user.password_hash != "Garden42!"
    assert user.password_hash.startswith("$argon2")
    assert user.is_email_verified is False


async def test_duplicate_signup_conflicts(client: AsyncClient) -> None:
    await _signup(client)
    r = await client.post(
        f"{PREFIX}/signup", json={"email": "ada@example.com", "password": "Garden42!"}
    )
    assert r.status_code == 409


async def test_signup_rejects_weak_password(client: AsyncClient) -> None:
    r = await client.post(f"{PREFIX}/signup", json={"email": "x@example.com", "password": "short"})
    assert r.status_code == 422


async def test_login_blocked_until_verified(client: AsyncClient) -> None:
    await _signup(client)
    r = await client.post(
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "Garden42!"}
    )
    assert r.status_code == 403


async def test_full_auth_round_trip(client: AsyncClient, session: AsyncSession) -> None:
    await _signup(client)
    await _verify(client, session, "ada@example.com")

    r = await client.post(
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "Garden42!"}
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
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "Garden42!"}
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
        f"{PREFIX}/login", json={"email": "nobody@example.com", "password": "Garden42!"}
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
            f"{PREFIX}/verify-email", json={"email": "ada@example.com", "code": "0000"}
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
            f"{PREFIX}/verify-email", json={"email": "ada@example.com", "code": "0000"}
        )
    r = await client.post(
        f"{PREFIX}/verify-email", json={"email": "ada@example.com", "code": "0000"}
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
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "Garden42!"}
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
        json={"email": "ada@example.com", "code": code, "new_password": "Orchard77!"},
    )
    assert r.status_code == 200, r.text

    # Old password is dead, new one works.
    old = await client.post(
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "Garden42!"}
    )
    assert old.status_code == 401
    new = await client.post(
        f"{PREFIX}/login", json={"email": "ada@example.com", "password": "Orchard77!"}
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
    assert int(second.headers["retry-after"]) > 0  # the app sizes its countdown from this


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


async def test_resend_re_emails_a_live_code_without_replacing_it(
    client: AsyncClient, session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The user asked because the email didn't arrive, so it is sent again. The code itself is
    kept, so pressing Resend repeatedly can never invalidate a code they already have."""
    from app.infra.redis import get_redis
    from app.services import auth_service

    sent: list[tuple[str, str, str]] = []

    async def fake_deliver(email: str, code: str, purpose: str, ttl_minutes: int) -> None:
        sent.append((email, code, purpose))

    monkeypatch.setattr(auth_service, "_deliver_code", fake_deliver)

    r = get_redis()
    stale = [k async for k in r.scan_iter(match="rl:*:resend")]
    if stale:
        await r.delete(*stale)

    await _signup(client)
    before = await session.scalar(
        select(VerificationCode).where(VerificationCode.purpose == "email_verification")
    )
    assert before is not None
    sent.clear()  # forget the email sent at sign-up
    assert (
        await client.post(f"{PREFIX}/resend-code", json={"email": "ada@example.com"})
    ).status_code == 200
    assert sent == [("ada@example.com", before.code, "email_verification")]
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
            f"{PREFIX}/login", json={"email": "ada@example.com", "password": "Garden42!"}
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


# ------------------------------------------------------------------ email delivery


async def test_signup_emails_the_verification_code(
    client: AsyncClient, session: AsyncSession, outbox: list[dict[str, str]]
) -> None:
    await _signup(client)
    assert len(outbox) == 1
    mail = outbox[0]
    assert mail["to"] == "ada@example.com"
    assert mail["from"].startswith("Nudge")
    code = await session.scalar(
        select(VerificationCode).join(User).where(User.email == "ada@example.com")
    )
    assert code is not None
    assert code.code in mail["text"] and code.code in mail["html"]
    assert code.code in mail["subject"]


async def test_forgot_password_emails_a_reset_code_only_for_real_accounts(
    client: AsyncClient, session: AsyncSession, outbox: list[dict[str, str]]
) -> None:
    await _signup(client)
    await _verify(client, session, "ada@example.com")
    outbox.clear()

    unknown = await client.post(f"{PREFIX}/forgot-password", json={"email": "nobody@example.com"})
    assert unknown.status_code == 200
    assert outbox == []  # no account, no mail, same response

    known = await client.post(f"{PREFIX}/forgot-password", json={"email": "ada@example.com"})
    assert known.status_code == 200
    assert [m["to"] for m in outbox] == ["ada@example.com"]


async def test_send_failure_does_not_break_signup(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _boom(params: object, api_key: str) -> None:
        raise RuntimeError("resend is down")

    monkeypatch.setattr("app.infra.mailer._send_sync", _boom)
    r = await client.post(
        f"{PREFIX}/signup", json={"email": "grace@example.com", "password": "Garden42!"}
    )
    assert r.status_code == 201  # the user can request a new code


def test_code_email_mentions_purpose_and_expiry() -> None:
    from app.infra.mailer import code_email

    subject, html, text = code_email(code="1234", purpose="password_reset", ttl_minutes=15)
    assert "1234" in subject and "1234" in html
    assert "reset your password" in text and "15 minutes" in text
    _, _, verify_text = code_email(code="1234", purpose="email_verification", ttl_minutes=15)
    assert "verify your email" in verify_text


async def test_mailer_reports_not_sent_without_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings
    from app.infra import mailer

    monkeypatch.setattr(get_settings(), "resend_api_key", "")
    assert not mailer.mail_configured()
    assert await mailer.send_email(to="a@b.co", subject="x", html="y") is False


# ------------------------------------------------------------- tokens, codes, passwords


async def test_verify_email_signs_the_user_in(client: AsyncClient, session: AsyncSession) -> None:
    await _signup(client)
    user = await session.scalar(select(User).where(User.email == "ada@example.com"))
    assert user is not None
    code = await session.scalar(select(VerificationCode).where(VerificationCode.user_id == user.id))
    assert code is not None
    r = await client.post(
        f"{PREFIX}/verify-email", json={"email": "ada@example.com", "code": code.code}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert {"access_token", "refresh_token", "expires_in"} <= body.keys()
    me = await client.get(
        f"{PREFIX}/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["is_email_verified"] is True
    # and the refresh token it issued is a real, rotatable session
    again = await client.post(f"{PREFIX}/refresh", json={"refresh_token": body["refresh_token"]})
    assert again.status_code == 200


async def test_codes_are_four_digits(client: AsyncClient, session: AsyncSession) -> None:
    await _signup(client)
    code = await session.scalar(select(VerificationCode))
    assert code is not None
    assert len(code.code) == 4 and code.code.isdigit()


@pytest.mark.parametrize(
    ("password", "missing"),
    [
        ("Sh0rt!", "at least 8 characters"),
        ("garden42!", "a capital letter"),
        ("Gardenxx!", "a number"),
        ("Garden421", "a special character"),
    ],
)
async def test_signup_names_the_broken_password_rule(
    client: AsyncClient, password: str, missing: str
) -> None:
    r = await client.post(f"{PREFIX}/signup", json={"email": "p@example.com", "password": password})
    assert r.status_code == 422
    assert missing in r.text


async def test_reset_requires_the_same_password_policy(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _signup(client)
    await _verify(client, session, "ada@example.com")
    code = await auth_service.request_password_reset(session, email="ada@example.com")
    r = await client.post(
        f"{PREFIX}/reset-password",
        json={"email": "ada@example.com", "code": code, "new_password": "weakpass1"},
    )
    assert r.status_code == 422


# ----------------------------------------------------------------- rate limits and CORS


@pytest.fixture
async def limited(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    """Turn limits on with tiny ceilings and a clean slate in Redis."""
    from app.core.config import get_settings
    from app.infra.redis import get_redis

    s = get_settings()
    monkeypatch.setattr(s, "rate_limits_enabled", True)
    monkeypatch.setattr(s, "rate_limit_login_per_5min", 3)
    monkeypatch.setattr(s, "rate_limit_code_attempts_per_5min", 3)
    r = get_redis()

    async def _clear() -> None:
        keys = [k async for k in r.scan_iter(match="rl:*:login")]
        keys += [k async for k in r.scan_iter(match="rl:*:codes")]
        if keys:
            await r.delete(*keys)

    await _clear()
    yield
    await _clear()


async def test_login_is_rate_limited(client: AsyncClient, limited: None) -> None:
    body = {"email": "ada@example.com", "password": "Wrong-pass1"}
    codes = [(await client.post(f"{PREFIX}/login", json=body)).status_code for _ in range(5)]
    assert codes[:3] == [401, 401, 401]
    assert codes[3:] == [429, 429]
    blocked = await client.post(f"{PREFIX}/login", json=body)
    assert int(blocked.headers["Retry-After"]) >= 1


async def test_code_guessing_is_rate_limited(client: AsyncClient, limited: None) -> None:
    body = {"email": "ada@example.com", "code": "0000"}
    codes = [(await client.post(f"{PREFIX}/verify-email", json=body)).status_code for _ in range(4)]
    assert codes[-1] == 429


def test_cors_origins_parse_and_disable_credentials_for_wildcard() -> None:
    from app.core.config import Settings

    secret = "x" * 40  # Settings refuses short JWT secrets outside dev
    s = Settings(cors_origins="https://app.nudge.ai, http://localhost:8081", jwt_secret=secret)
    assert s.cors_origin_list == ["https://app.nudge.ai", "http://localhost:8081"]
    assert Settings(cors_origins="*", jwt_secret=secret).cors_origin_list == ["*"]
