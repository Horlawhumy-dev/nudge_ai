from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentUser, SessionDep, client_id
from app.api.limits import rate_limit
from app.core.config import get_settings
from app.infra.redis import get_redis, k_rl
from app.schemas.models import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    ResendCodeRequest,
    ResetPasswordRequest,
    SignUpRequest,
    TokenResponse,
    UserResponse,
    VerifyCodeRequest,
    VerifyResetRequest,
)
from app.services import auth_service

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _raise(exc: auth_service.AuthError) -> None:
    raise HTTPException(status_code=exc.status, detail=exc.detail)


@router.post(
    "/signup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(
            rate_limit("signup", limit_setting="rate_limit_signup_per_hour", window_seconds=3600)
        )
    ],
)
async def signup(payload: SignUpRequest, session: SessionDep) -> UserResponse:
    try:
        user, _ = await auth_service.signup(
            session,
            email=payload.email,
            password=payload.password,
            name=payload.name,
            timezone=payload.timezone,
        )
    except auth_service.AuthError as exc:
        _raise(exc)
    return UserResponse.model_validate(user)


@router.post(
    "/verify-email",
    dependencies=[
        Depends(
            rate_limit(
                "codes", limit_setting="rate_limit_code_attempts_per_5min", window_seconds=300
            )
        )
    ],
    response_model=TokenResponse,
)
async def verify_email(payload: VerifyCodeRequest, session: SessionDep) -> TokenResponse:
    """Confirm the emailed code and sign the user straight in.

    Returning tokens means the client doesn't have to keep the password around
    between signup and verification just to call /login.
    """
    try:
        user = await auth_service.verify_email(session, email=payload.email, code=payload.code)
        access, refresh = await auth_service.issue_session(session, user)
    except auth_service.AuthError as exc:
        _raise(exc)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=get_settings().access_token_ttl_minutes * 60,
    )


@router.post("/resend-code", response_model=MessageResponse)
async def resend_code(
    payload: ResendCodeRequest,
    session: SessionDep,
    cid: str = Depends(client_id),
) -> MessageResponse:
    s = get_settings()
    r = get_redis()
    # k_rl already namespaces by cid, so the bucket is just the action name.
    try:
        allowed = await r.set(k_rl(cid, "resend"), "1", ex=s.resend_cooldown_seconds, nx=True)
    except Exception:  # noqa: BLE001 — redis is a cache, not a gate
        allowed = True
    if not allowed:
        raise HTTPException(
            status_code=429, detail=f"wait {s.resend_cooldown_seconds}s before resending"
        )
    # Issues a replacement code when one is genuinely needed. The response is the
    # same either way, so this cannot be used to enumerate accounts.
    try:
        await auth_service.resend_verification(session, email=payload.email)
    except auth_service.AuthError as exc:
        _raise(exc)
    return MessageResponse(message="if that account needs verification, a new code is on its way")


@router.post(
    "/login",
    dependencies=[
        Depends(rate_limit("login", limit_setting="rate_limit_login_per_5min", window_seconds=300))
    ],
    response_model=TokenResponse,
)
async def login(payload: LoginRequest, session: SessionDep) -> TokenResponse:
    try:
        user, access, refresh = await auth_service.login(
            session, email=payload.email, password=payload.password
        )
    except auth_service.AuthError as exc:
        _raise(exc)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=get_settings().access_token_ttl_minutes * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(payload: RefreshRequest, session: SessionDep) -> TokenResponse:
    try:
        _, access, refresh = await auth_service.refresh(
            session, refresh_token=payload.refresh_token
        )
    except auth_service.AuthError as exc:
        _raise(exc)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=get_settings().access_token_ttl_minutes * 60,
    )


@router.post("/logout", response_model=MessageResponse, status_code=status.HTTP_200_OK)
async def logout(payload: RefreshRequest, session: SessionDep) -> MessageResponse:
    await auth_service.logout(session, refresh_token=payload.refresh_token)
    return MessageResponse(message="signed out")


@router.post(
    "/forgot-password",
    dependencies=[
        Depends(
            rate_limit("forgot", limit_setting="rate_limit_forgot_per_hour", window_seconds=3600)
        )
    ],
    response_model=MessageResponse,
)
async def forgot_password(payload: ForgotPasswordRequest, session: SessionDep) -> MessageResponse:
    await auth_service.request_password_reset(session, email=payload.email)
    # Always the same response, so this cannot be used to enumerate accounts.
    return MessageResponse(message="if that account exists, a reset code is on its way")


@router.post(
    "/verify-reset",
    dependencies=[
        Depends(
            rate_limit(
                "codes", limit_setting="rate_limit_code_attempts_per_5min", window_seconds=300
            )
        )
    ],
    response_model=MessageResponse,
)
async def verify_reset(payload: VerifyResetRequest, session: SessionDep) -> MessageResponse:
    try:
        await auth_service.verify_reset_code(session, email=payload.email, code=payload.code)
    except auth_service.AuthError as exc:
        _raise(exc)
    return MessageResponse(message="code accepted — set a new password")


@router.post(
    "/reset-password",
    dependencies=[
        Depends(
            rate_limit(
                "codes", limit_setting="rate_limit_code_attempts_per_5min", window_seconds=300
            )
        )
    ],
    response_model=MessageResponse,
)
async def reset_password(payload: ResetPasswordRequest, session: SessionDep) -> MessageResponse:
    try:
        await auth_service.reset_password(
            session, email=payload.email, code=payload.code, new_password=payload.new_password
        )
    except auth_service.AuthError as exc:
        _raise(exc)
    return MessageResponse(message="password updated — sign in again")


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)
