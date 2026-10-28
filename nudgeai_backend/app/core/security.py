from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher()

TokenType = Literal["access", "refresh"]


class TokenError(Exception):
    pass


# ---------------------------------------------------------------- passwords


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        _hasher.verify(hashed, plain)
    except (VerifyMismatchError, InvalidHashError):
        return False
    return True


PASSWORD_MIN_LENGTH = 8


def password_problems(plain: str) -> list[str]:
    """Every rule the password breaks, as short user-facing messages (empty when fine).

    Mirrors the mobile client's rules so a password it accepts is never rejected here.
    """
    problems: list[str] = []
    if len(plain) < PASSWORD_MIN_LENGTH:
        problems.append(f"at least {PASSWORD_MIN_LENGTH} characters")
    if not any(c.isupper() for c in plain):
        problems.append("a capital letter")
    if not any(c.isdigit() for c in plain):
        problems.append("a number")
    if not any(not c.isalnum() for c in plain):
        problems.append("a special character")
    return problems


def needs_rehash(hashed: str) -> bool:
    return _hasher.check_needs_rehash(hashed)


# ---------------------------------------------------------------- jwt


def _now() -> datetime:
    return datetime.now(UTC)


def create_token(
    subject: str | uuid.UUID,
    token_type: TokenType,
    *,
    expires_delta: timedelta,
    extra: dict[str, Any] | None = None,
) -> str:
    s = get_settings()
    now = _now()
    payload: dict[str, Any] = {
        "sub": str(subject),
        "typ": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("token expired") from exc
    except jwt.PyJWTError as exc:
        raise TokenError("token invalid") from exc
    if payload.get("typ") != expected_type:
        raise TokenError(f"expected {expected_type} token")
    return payload


def create_access_token(subject: str | uuid.UUID) -> str:
    s = get_settings()
    return create_token(
        subject,
        "access",
        expires_delta=timedelta(minutes=s.access_token_ttl_minutes),
    )


def create_refresh_token(subject: str | uuid.UUID) -> str:
    s = get_settings()
    return create_token(
        subject,
        "refresh",
        expires_delta=timedelta(days=s.refresh_token_ttl_days),
    )


# ---------------------------------------------------------------- codes


def generate_numeric_code(length: int = 4) -> str:
    import secrets

    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def token_expiry(token_type: TokenType) -> datetime:
    s = get_settings()
    if token_type == "access":  # noqa: S105
        return _now() + timedelta(minutes=s.access_token_ttl_minutes)
    return _now() + timedelta(days=s.refresh_token_ttl_days)
