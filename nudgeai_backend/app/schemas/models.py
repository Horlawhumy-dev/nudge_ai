from __future__ import annotations

from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

TimeStr = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ==================================================================== auth


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=120)
    timezone: str = Field(default="UTC", max_length=64)

    @field_validator("password")
    @classmethod
    def _strong_enough(cls, v: str) -> str:
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("password must contain a letter and a digit")
        return v


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=10)


class ResendCodeRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyResetRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=10)


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=10)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _strong_enough(cls, v: str) -> str:
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("password must contain a letter and a digit")
        return v


class UserResponse(ORMModel):
    id: UUID
    email: EmailStr
    name: str | None
    timezone: str
    is_email_verified: bool
    plan: str
    created_at: datetime


# =============================================================== onboarding


class OnboardingRequest(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    wake_time: TimeStr | None = None
    sleep_time: TimeStr | None = None
    goals: list[str] = Field(default_factory=list, max_length=12)
    nudge_style: str | None = Field(default="gentle", max_length=32)
    tone: str | None = Field(default="warm", max_length=32)
    completed: bool = False


class OnboardingResponse(ORMModel):
    name: str | None
    wake_time: str | None
    sleep_time: str | None
    goals: list[str] | None
    nudge_style: str | None
    tone: str | None
    completed: bool


# ================================================================== habits


class HabitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    cue: str | None = Field(default=None, max_length=160)
    target_per_day: int = Field(default=1, ge=1, le=50)
    stack_position: int = Field(default=0, ge=0, le=50)
    preferred_time: TimeStr | None = None


class HabitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    cue: str | None = Field(default=None, max_length=160)
    target_per_day: int | None = Field(default=None, ge=1, le=50)
    stack_position: int | None = Field(default=None, ge=0, le=50)
    preferred_time: TimeStr | None = None
    active: bool | None = None


class StreakResponse(ORMModel):
    current: int
    best: int
    last_completed_on: date | None


class HabitResponse(ORMModel):
    id: UUID
    name: str
    cue: str | None
    target_per_day: int
    stack_position: int
    preferred_time: str | None
    active: bool
    streak: StreakResponse | None = None


# =================================================================== tasks


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=320)
    notes: str | None = None
    due_at: datetime | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=320)
    notes: str | None = None
    due_at: datetime | None = None
    done_at: datetime | None = None


class TaskResponse(ORMModel):
    id: UUID
    title: str
    notes: str | None
    due_at: datetime | None
    done_at: datetime | None
    created_at: datetime


# ============================================================= preferences


class PreferenceUpdate(BaseModel):
    quiet_start: TimeStr | None = None
    quiet_end: TimeStr | None = None
    quiet_repeat_days: list[int] | None = None
    digest_time: TimeStr | None = None
    voice_enabled: bool | None = None
    max_nudges_per_day: int | None = Field(default=None, ge=1, le=50)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("quiet_repeat_days")
    @classmethod
    def _valid_days(cls, v: list[int] | None) -> list[int] | None:
        if v is None:
            return v
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("quiet_repeat_days must be 0..6 (Monday=0)")
        return sorted(set(v))


class PreferenceResponse(ORMModel):
    quiet_start: str | None
    quiet_end: str | None
    quiet_repeat_days: list[int] | None
    digest_time: str | None
    voice_enabled: bool
    max_nudges_per_day: int
    timezone: str


# ================================================================== memory


class MemoryCreate(BaseModel):
    body: str = Field(min_length=1, max_length=8000)
    kind: str = Field(default="note", max_length=32)


class MemoryResponse(ORMModel):
    id: UUID
    body: str
    kind: str
    created_at: datetime
    similarity: float | None = None


class MemorySearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=25)
    kind: str | None = None
    include_lexical: bool = True


class MemorySearchResponse(BaseModel):
    results: list[MemoryResponse]
