from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.security import password_problems

TimeStr = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]

TimeOfDay = Literal["morning", "afternoon", "evening"]
Frequency = Literal["daily", "weekdays", "weekly"]

# Check-ins per rolling week implied by a cadence, unless the client sets its own goal.
GOAL_DAYS_BY_FREQUENCY: dict[str, int] = {"daily": 7, "weekdays": 5, "weekly": 1}


def _check_zone(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError("unknown time zone") from exc
    return value


def _check_password(value: str) -> str:
    problems = password_problems(value)
    if problems:
        raise ValueError("password needs " + ", ".join(problems))
    return value


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
        return _check_password(v)


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
        return _check_password(v)


class UserResponse(ORMModel):
    id: UUID
    email: EmailStr
    name: str | None
    timezone: str
    is_email_verified: bool
    plan: str
    avatar_url: str | None = None
    pending_email: EmailStr | None = None
    created_at: datetime


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _strong_enough(cls, v: str) -> str:
        return _check_password(v)


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ConfirmEmailChangeRequest(BaseModel):
    code: str = Field(min_length=4, max_length=10)


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("name")
    @classmethod
    def _tidy(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = " ".join(v.split())
        if not v:
            raise ValueError("must not be blank")
        return v

    @field_validator("timezone")
    @classmethod
    def _real_zone(cls, v: str | None) -> str | None:
        return _check_zone(v)


# =============================================================== onboarding


class OnboardingRequest(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    wake_time: TimeStr | None = None
    sleep_time: TimeStr | None = None
    goals: list[str] = Field(default_factory=list, max_length=12)
    nudge_style: str | None = Field(default="gentle", max_length=32)
    tone: str | None = Field(default="warm", max_length=32)
    completed: bool = False


class OnboardingPatch(BaseModel):
    """Partial update: only the fields sent change (Settings edits wake or sleep time alone)."""

    name: str | None = Field(default=None, max_length=120)
    wake_time: TimeStr | None = None
    sleep_time: TimeStr | None = None
    goals: list[str] | None = Field(default=None, max_length=12)
    nudge_style: str | None = Field(default=None, max_length=32)
    tone: str | None = Field(default=None, max_length=32)
    completed: bool | None = None


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
    emoji: str = Field(default="🎯", min_length=1, max_length=16)
    category: str | None = Field(default=None, max_length=40)
    time_of_day: TimeOfDay = "morning"
    frequency: Frequency = "daily"
    goal_days: int | None = Field(default=None, ge=1, le=7)
    stacked_after_id: UUID | None = None

    @field_validator("name", "category")
    @classmethod
    def _tidy(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = " ".join(v.split())
        if not v:
            raise ValueError("must not be blank")
        return v


class HabitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    cue: str | None = Field(default=None, max_length=160)
    target_per_day: int | None = Field(default=None, ge=1, le=50)
    stack_position: int | None = Field(default=None, ge=0, le=50)
    preferred_time: TimeStr | None = None
    emoji: str | None = Field(default=None, min_length=1, max_length=16)
    category: str | None = Field(default=None, max_length=40)
    time_of_day: TimeOfDay | None = None
    frequency: Frequency | None = None
    goal_days: int | None = Field(default=None, ge=1, le=7)
    stacked_after_id: UUID | None = None
    active: bool | None = None

    @field_validator("name", "category")
    @classmethod
    def _tidy(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = " ".join(v.split())
        if not v:
            raise ValueError("must not be blank")
        return v


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
    emoji: str
    category: str | None
    time_of_day: str
    frequency: str
    goal_days: int
    stacked_after_id: UUID | None
    active: bool
    streak: StreakResponse | None = None
    # Derived per request in the user's local day (not stored).
    done_today: bool = False
    done_last_7d: int = 0


class CheckinRequest(BaseModel):
    """Optional body for complete/uncomplete: the local day to record (default: today)."""

    on: date | None = None


class CompletionsResponse(BaseModel):
    """Check-in dates per habit for a date range."""

    start: date
    end: date
    days: dict[UUID, list[date]]


class OverallStreakResponse(BaseModel):
    current: int
    best: int
    active_today: bool
    last_active_on: date | None


# =================================================================== tasks


# A field called ``date`` would shadow the type inside its own class body.
Day = date

Priority = Literal["high", "medium", "low"]
TaskStatus = Literal["upcoming", "overdue", "completed"]


def _tidy_title(v: str | None) -> str | None:
    if v is None:
        return None
    v = " ".join(v.split())
    if not v:
        raise ValueError("must not be blank")
    return v


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=320)
    notes: str | None = Field(default=None, max_length=4000)
    priority: Priority = "medium"
    # Local calendar day; defaults to today where the user is.
    date: Day | None = None
    # "HH:MM" local; omit start for an all-day task. End defaults to one hour after start.
    start_time: TimeStr | None = None
    end_time: TimeStr | None = None
    repeat: bool = False
    # Accepted for the AI tools and older clients: derives date when `date` is absent.
    due_at: datetime | None = None

    _title = field_validator("title")(_tidy_title)

    @model_validator(mode="after")
    def _times(self) -> TaskCreate:
        if self.end_time and not self.start_time:
            raise ValueError("end_time needs a start_time")
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=320)
    notes: str | None = Field(default=None, max_length=4000)
    priority: Priority | None = None
    date: Day | None = None
    start_time: TimeStr | None = None
    end_time: TimeStr | None = None
    repeat: bool | None = None
    due_at: datetime | None = None
    done_at: datetime | None = None

    _title = field_validator("title")(_tidy_title)


class TaskResponse(ORMModel):
    id: UUID
    title: str
    notes: str | None
    priority: str
    date: Day | None
    start_time: str | None
    end_time: str | None
    all_day: bool = True
    repeat: bool
    due_at: datetime | None
    done_at: datetime | None
    done: bool = False
    # Derived per request from the clock in the user's zone (not stored).
    status: TaskStatus = "upcoming"
    created_at: datetime


# ============================================================= preferences


ReminderTone = Literal["gentle", "firm", "mix"]


class PreferenceUpdate(BaseModel):
    quiet_start: TimeStr | None = None
    quiet_end: TimeStr | None = None
    quiet_repeat_days: list[int] | None = None
    quiet_enabled: bool | None = None
    quiet_allow_priority: bool | None = None
    digest_time: TimeStr | None = None
    voice_enabled: bool | None = None
    push_enabled: bool | None = None
    morning_summary_enabled: bool | None = None
    weekly_report_enabled: bool | None = None
    streak_alerts_enabled: bool | None = None
    reminder_tone: ReminderTone | None = None
    use_name_in_reminders: bool | None = None
    include_streak_in_reminders: bool | None = None
    use_emojis_in_reminders: bool | None = None
    habit_stacking_enabled: bool | None = None
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

    @field_validator("timezone")
    @classmethod
    def _real_zone(cls, v: str | None) -> str | None:
        return _check_zone(v)


class PreferenceResponse(ORMModel):
    quiet_start: str | None
    quiet_end: str | None
    quiet_repeat_days: list[int] | None
    quiet_enabled: bool
    quiet_allow_priority: bool
    digest_time: str | None
    voice_enabled: bool
    push_enabled: bool
    morning_summary_enabled: bool
    weekly_report_enabled: bool
    streak_alerts_enabled: bool
    reminder_tone: str
    use_name_in_reminders: bool
    include_streak_in_reminders: bool
    use_emojis_in_reminders: bool
    habit_stacking_enabled: bool
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


# ================================================================== nudges


class NudgeResponse(ORMModel):
    id: UUID
    habit_id: UUID | None
    scheduled_for: datetime
    sent_at: datetime | None
    status: str
    channel: str
    body: str | None
    model_id: str | None
    prompt_tokens: int | None
    completion_tokens: int | None
    skip_reason: str | None
    created_at: datetime


class RuleLogEntry(BaseModel):
    rule: str
    passed: bool
    detail: str


class NudgeDecisionOut(BaseModel):
    habit_id: UUID
    habit_name: str
    action: str
    rule: str
    reason: str
    defer_until: datetime | None = None
    priority: bool = False
    log: list[RuleLogEntry]


class EvaluateResponse(BaseModel):
    evaluated: list[NudgeDecisionOut]
    digest_sent: bool = False
    nudge_ids: list[UUID] = []
    errors: list[str] = []


class FeedbackRequest(BaseModel):
    kind: str = Field(pattern=r"^(accepted|snoozed|completed|dismissed)$")


class FeedbackResponse(BaseModel):
    nudge_id: UUID
    kind: str


# ================================================================ conversations


class ConversationSummary(BaseModel):
    id: UUID
    title: str
    mode: Literal["text", "voice", "voice+text"]
    message_count: int
    preview: str
    created_at: datetime
    updated_at: datetime


class ConversationMessage(BaseModel):
    id: UUID
    role: str
    content: str
    via: Literal["text", "voice"]
    created_at: datetime


class ConversationDetail(BaseModel):
    id: UUID
    title: str
    messages: list[ConversationMessage]


# ========================================================== inbox and devices

NotificationKind = Literal["nudge", "summary", "streak", "insight", "system"]


class NotificationResponse(BaseModel):
    id: UUID
    kind: NotificationKind
    title: str
    body: str
    habit_id: UUID | None
    read: bool
    created_at: datetime


class InboxResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


class DeviceRegister(BaseModel):
    token: str = Field(min_length=10, max_length=255, pattern=r"^(Expo|Exponent)PushToken\[.+\]$")
    platform: Literal["ios", "android", "web"]


class DeviceResponse(ORMModel):
    id: UUID
    platform: str
    created_at: datetime


# ================================================================ subscription


class PlanLimits(BaseModel):
    habits: int | None  # None means unlimited
    tasks_per_day: int | None


class PlanUsage(BaseModel):
    habits: int
    tasks_today: int


class SubscriptionResponse(BaseModel):
    plan: Literal["free", "pro"]
    period: Literal["monthly", "yearly"] | None
    status: str
    renews_at: datetime | None
    limits: PlanLimits
    usage: PlanUsage


class SubscriptionUpdate(BaseModel):
    plan: Literal["free", "pro"]
    period: Literal["monthly", "yearly"] = "monthly"


# ====================================================== progress and reports


class BarOut(BaseModel):
    label: str
    value: int


class TopHabitOut(BaseModel):
    habit_id: UUID
    name: str
    emoji: str
    streak: int
    completion: int


class DayCell(BaseModel):
    date: Day
    status: Literal["completed", "some", "missed", "today", "future"]


class HabitProgress(BaseModel):
    period: Literal["weekly", "monthly"]
    bars: list[BarOut]
    streak: int
    best_streak: int
    consistency: int
    all_time_wins: int
    top_habits: list[TopHabitOut]
    consistency_map: list[DayCell]
    insight: str | None = None


class TimeGroupOut(BaseModel):
    name: Literal["Morning", "Afternoon", "Evening"]
    completion: int
    total: int


class OverdueTaskOut(BaseModel):
    task_id: UUID
    title: str
    due_at: datetime
    days_overdue: int


class TaskProgress(BaseModel):
    period: Literal["weekly", "monthly"]
    bars: list[BarOut]
    done: int
    total: int
    completion_rate: int
    on_time_rate: int
    overdue: int
    time_groups: list[TimeGroupOut]
    most_overdue: list[OverdueTaskOut]
    insight: str | None = None


class WeeklyReportResponse(BaseModel):
    start: Day
    end: Day
    habit_rate: int
    check_ins: int
    possible: int
    tasks_done: int
    tasks_total: int
    best_day: str | None
    best_day_count: int
    top_habit: str | None
    needs_love: str | None
    headline: str
    tips: list[str]


# ================================================================ analytics


class HabitSummary(BaseModel):
    habit_id: UUID
    name: str
    streak_current: int
    streak_best: int
    completions_last_7d: int


class AnalyticsOverview(BaseModel):
    habits: list[HabitSummary]
    active_streaks: int
    completions_last_7d: int
    nudges_sent_7d: int
    nudges_suppressed_7d: int
    suppressions_by_rule: dict[str, int]
    insight: str | None = None
