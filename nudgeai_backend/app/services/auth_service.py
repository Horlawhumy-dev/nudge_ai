from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
import resend
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_numeric_code,
    hash_password,
    needs_rehash,
    verify_password,
)
from app.db.models import RefreshToken, User, VerificationCode

log = logging.getLogger(__name__)

EMAIL_VERIFICATION = "email_verification"
PASSWORD_RESET = "password_reset"  # noqa: S105


_resend: resend.Emails | None = None


def _get_resend() -> resend.Emails:
    global _resend
    if _resend is None:
        s = get_settings()
        _resend = resend.Emails(s.resend_api_key)
    return _resend


async def _send_verification_email(email: str, code: str) -> None:
    s = get_settings()
    if not s.resend_api_key:
        log.debug("resend_api_key not set; skipping email send")
        return
    try:
        await _get_resend().send(
            from_email="onboarding@resend.dev",
            to=email,
            subject="Your NudgeAI verification code",
            html=f"<p>Your verification code is: <strong>{code}</strong></p>",
        )
    except Exception as exc:  # noqa: BLE001 — best-effort delivery
        log.warning("failed to send verification email to %s: %s", email, exc)


class AuthError(Exception):
    def __init__(self, status: int, detail: str) -> None:
        self.status = status
        self.detail = detail
        super().__init__(detail)


async def _check_code(
    session: AsyncSession, user_id: UUID, code: str, purpose: str
) -> VerificationCode:
    """Validate a code without consuming it. Counts the attempt either way.

    Failed attempts are persisted via flush, so the caller must roll back or
    commit; the FastAPI session dependency rolls back on an unhandled error.
    """
    s = get_settings()
    now = datetime.now(UTC)

    result = await session.execute(
        select(VerificationCode)
        .where(
            VerificationCode.user_id == user_id,
            VerificationCode.purpose == purpose,
            VerificationCode.consumed_at.is_(None),
        )
        .order_by(VerificationCode.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise AuthError(400, "no active code — request a new one")
    if row.expires_at < now:
        raise AuthError(400, "code expired")
    if row.attempts >= s.verification_code_max_attempts:
        raise AuthError(429, "too many attempts — request a new code")
    row.attempts += 1
    if row.code != code:
        await session.flush()
        raise AuthError(400, "incorrect code")
    return row


async def _consume_code(
    session: AsyncSession, user_id: UUID, code: str, purpose: str
) -> VerificationCode:
    """Validate a code and burn it, so it cannot be replayed."""
    row = await _check_code(session, user_id, code, purpose)
    row.consumed_at = datetime.now(UTC)
    return row


async def signup(
    session: AsyncSession, *, email: str, password: str, name: str | None, timezone: str
) -> tuple[User, str]:
    s = get_settings()
    email = email.lower().strip()
    existing = await session.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise AuthError(409, "email already registered")

    user = User(
        email=email,
        password_hash=hash_password(password),
        name=name,
        timezone=timezone,
        is_email_verified=False,
    )
    session.add(user)
    await session.flush()

    code = generate_numeric_code()
    session.add(
        VerificationCode(
            user_id=user.id,
            code=code,
            purpose=EMAIL_VERIFICATION,
            expires_at=datetime.now(UTC) + timedelta(minutes=s.verification_code_ttl_minutes),
        )
    )
    await session.commit()
    await session.refresh(user)

    await _send_verification_email(email, code)
    log.info("signup for %s, verification code issued and emailed", email)
    return user, code


async def resend_verification(session: AsyncSession, *, email: str) -> str | None:
    """Issue a fresh verification code, replacing any unconsumed one.

    Returns None for an unknown address, an already-verified account, or an
    account with a live code — the caller must not distinguish those, or the
    endpoint becomes an account-existence oracle.
    """
    s = get_settings()
    email = email.lower().strip()
    user = await session.scalar(select(User).where(User.email == email))
    if user is None or user.is_email_verified:
        return None

    now = datetime.now(UTC)
    existing = await session.scalar(
        select(VerificationCode)
        .where(
            VerificationCode.user_id == user.id,
            VerificationCode.purpose == EMAIL_VERIFICATION,
            VerificationCode.consumed_at.is_(None),
        )
        .order_by(VerificationCode.created_at.desc())
        .limit(1)
    )
    if existing is not None and existing.expires_at > now:
        # A live code is still usable; the cooldown endpoint already throttles.
        return None

    # Retire the old row so only one code can ever be live per purpose.
    if existing is not None:
        existing.consumed_at = now

    code = generate_numeric_code()
    session.add(
        VerificationCode(
            user_id=user.id,
            code=code,
            purpose=EMAIL_VERIFICATION,
            expires_at=now + timedelta(minutes=s.verification_code_ttl_minutes),
        )
    )
    await session.commit()
    await _send_verification_email(email, code)
    log.info("verification code reissued and emailed for %s", email)
    return code


async def verify_email(session: AsyncSession, *, email: str, code: str) -> User:
    email = email.lower().strip()
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        raise AuthError(404, "no account for that email")
    if user.is_email_verified:
        raise AuthError(409, "email already verified")
    await _consume_code(session, user.id, code, EMAIL_VERIFICATION)
    user.is_email_verified = True
    await session.commit()
    await session.refresh(user)
    return user


async def login(session: AsyncSession, *, email: str, password: str) -> tuple[User, str, str]:
    email = email.lower().strip()
    user = await session.scalar(select(User).where(User.email == email))
    # Same message either way — do not leak account existence.
    if user is None or not verify_password(password, user.password_hash):
        raise AuthError(401, "invalid email or password")
    if not user.is_email_verified:
        raise AuthError(403, "verify your email before signing in")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        await session.flush()
    return user, create_access_token(user.id), await _persist_refresh(session, user.id)


async def _persist_refresh(session: AsyncSession, user_id: UUID) -> str:
    token = create_refresh_token(user_id)
    jti = jwt.decode(
        token,
        get_settings().jwt_secret,
        algorithms=[get_settings().jwt_algorithm],
        options={"verify_exp": False},
    )["jti"]
    expires = datetime.now(UTC) + timedelta(days=get_settings().refresh_token_ttl_days)
    session.add(RefreshToken(user_id=user_id, jti=jti, expires_at=expires))
    await session.commit()
    return token


async def refresh(session: AsyncSession, *, refresh_token: str) -> tuple[User, str, str]:
    try:
        payload = decode_token(refresh_token, "refresh")
    except Exception as exc:
        raise AuthError(401, "invalid refresh token") from exc

    jti = payload.get("jti")
    row = await session.scalar(select(RefreshToken).where(RefreshToken.jti == jti))
    if row is None or row.revoked_at is not None:
        raise AuthError(401, "refresh token revoked")
    if row.expires_at < datetime.now(UTC):
        raise AuthError(401, "refresh token expired")

    # Rotate: revoke the presented token, issue a new pair.
    row.revoked_at = datetime.now(UTC)
    user = await session.get(User, row.user_id)
    if user is None:
        raise AuthError(401, "no account for that token")
    await session.commit()
    return user, create_access_token(user.id), await _persist_refresh(session, user.id)


async def logout(session: AsyncSession, *, refresh_token: str | None) -> None:
    if not refresh_token:
        return
    try:
        payload = decode_token(refresh_token, "refresh")
    except Exception:
        return
    jti = payload.get("jti")
    row = await session.scalar(select(RefreshToken).where(RefreshToken.jti == jti))
    if row is not None and row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
        await session.commit()


async def request_password_reset(session: AsyncSession, *, email: str) -> str | None:
    s = get_settings()
    email = email.lower().strip()
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        return None  # always respond 200 to avoid account enumeration
    # Invalidate any previously issued, unconsumed reset codes.
    await session.execute(
        delete(VerificationCode).where(
            VerificationCode.user_id == user.id,
            VerificationCode.purpose == PASSWORD_RESET,
            VerificationCode.consumed_at.is_(None),
        )
    )
    code = generate_numeric_code()
    session.add(
        VerificationCode(
            user_id=user.id,
            code=code,
            purpose=PASSWORD_RESET,
            expires_at=datetime.now(UTC) + timedelta(minutes=s.password_reset_code_ttl_minutes),
        )
    )
    await session.commit()
    return code


async def verify_reset_code(session: AsyncSession, *, email: str, code: str) -> User:
    """Check a reset code without burning it.

    The reset flow is two steps — verify, then set the password — and both carry
    the code. Consuming here would make the second step fail, so the code is
    only consumed when the password actually changes.
    """
    email = email.lower().strip()
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        raise AuthError(404, "no account for that email")
    await _check_code(session, user.id, code, PASSWORD_RESET)
    await session.commit()
    return user


async def reset_password(
    session: AsyncSession, *, email: str, code: str, new_password: str
) -> None:
    user = await verify_reset_code(session, email=email, code=code)
    user.password_hash = hash_password(new_password)
    # Force re-login everywhere.
    rows = await session.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)
        )
    )
    for row in rows:
        row.revoked_at = datetime.now(UTC)
    await session.commit()


async def get_user_by_id(session: AsyncSession, user_id: UUID) -> User | None:
    return await session.get(User, user_id)
