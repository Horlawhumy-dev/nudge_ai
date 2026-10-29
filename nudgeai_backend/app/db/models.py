from __future__ import annotations

from datetime import UTC, date, datetime
from datetime import date as dt_date
from typing import Any
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Computed,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
    true,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.core.config import HNSW_MAX_DIM, get_settings


class Base(DeclarativeBase):
    pass


def _now() -> datetime:
    return datetime.now(UTC)


# Vector width comes from settings, never a literal, so the column, the ANN
# index, and the embedder can never disagree about the dimension.
_settings = get_settings()
_EMBED_DIM = _settings.embedding_dim
_HNSW_ON = _settings.hnsw_index_enabled


def _hnsw_index(name: str, column: str) -> tuple[Index, ...]:
    """Cosine HNSW index, omitted when disabled or over the pgvector dim cap."""
    if not _HNSW_ON or _EMBED_DIM > HNSW_MAX_DIM:
        return ()
    return (
        Index(
            name,
            column,
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={column: "vector_cosine_ops"},
        ),
    )


# ===================================================================== auth


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    plan: Mapped[str] = mapped_column(String(16), default="free", nullable=False)
    # Path under the media mount (e.g. /media/avatars/<file>); null means the default avatar.
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    # A requested new email, not yet confirmed with the code sent to it.
    pending_email: Mapped[str | None] = mapped_column(String(320))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_now
    )

    __table_args__ = (CheckConstraint("plan in ('free','pro')", name="ck_users_plan"),)

    onboarding: Mapped[OnboardingProfile | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    preferences: Mapped[Preference | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    subscription: Mapped[Subscription | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class VerificationCode(Base):
    """Email verification and password reset codes.

    Both flows share a table, discriminated by `purpose`.
    """

    __tablename__ = "verification_codes"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(10), nullable=False)
    purpose: Mapped[str] = mapped_column(String(24), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_verification_user_purpose", "user_id", "purpose"),
        CheckConstraint(
            "purpose in ('email_verification','password_reset','email_change')",
            name="ck_vc_purpose",
        ),
    )


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================== onboarding


class OnboardingProfile(Base):
    __tablename__ = "onboarding_profiles"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    wake_time: Mapped[str | None] = mapped_column(String(5))  # "07:00"
    sleep_time: Mapped[str | None] = mapped_column(String(5))
    goals: Mapped[list[str] | None] = mapped_column(JSONB)
    nudge_style: Mapped[str | None] = mapped_column(String(32))  # gentle|firm|playful
    tone: Mapped[str | None] = mapped_column(String(32))
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped[User] = relationship(back_populates="onboarding")


# =================================================================== habits


class Habit(Base):
    __tablename__ = "habits"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    cue: Mapped[str | None] = mapped_column(String(160))
    target_per_day: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    stack_position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    preferred_time: Mapped[str | None] = mapped_column(String(5))
    # Presentation and cadence the mobile app edits directly.
    emoji: Mapped[str] = mapped_column(
        String(16), default="🎯", server_default="🎯", nullable=False
    )
    category: Mapped[str | None] = mapped_column(String(40))
    time_of_day: Mapped[str] = mapped_column(
        String(12), default="morning", server_default="morning", nullable=False
    )
    frequency: Mapped[str] = mapped_column(
        String(12), default="daily", server_default="daily", nullable=False
    )
    # Check-ins wanted per rolling 7 days (the "3/7 days" on a card).
    goal_days: Mapped[int] = mapped_column(Integer, default=7, server_default="7", nullable=False)
    # The habit whose completion triggers this one (habit stacking).
    stacked_after_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("habits.id", ondelete="SET NULL")
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("target_per_day > 0", name="ck_habits_target_positive"),
        CheckConstraint(
            "time_of_day IN ('morning','afternoon','evening')", name="ck_habits_time_of_day"
        ),
        CheckConstraint("frequency IN ('daily','weekdays','weekly')", name="ck_habits_frequency"),
        CheckConstraint("goal_days BETWEEN 1 AND 7", name="ck_habits_goal_days"),
        Index("ix_habits_user_active", "user_id", "active"),
    )

    completions: Mapped[list[HabitCompletion]] = relationship(
        back_populates="habit", cascade="all, delete-orphan"
    )
    streak: Mapped[Streak | None] = relationship(
        back_populates="habit", uselist=False, cascade="all, delete-orphan"
    )


class HabitCompletion(Base):
    __tablename__ = "habit_completions"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    habit_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("habits.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    completed_on: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("habit_id", "completed_on", name="uq_completion_day"),)

    habit: Mapped[Habit] = relationship(back_populates="completions")


class Streak(Base):
    __tablename__ = "streaks"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    habit_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("habits.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    current: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    best: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_completed_on: Mapped[object | None] = mapped_column(Date)

    habit: Mapped[Habit] = relationship(back_populates="streak")


# ==================================================================== tasks


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(320), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    # The moment the task is due (its end time, else start, else the end of its day). It is
    # derived from date/start/end in the user's zone whenever those are set.
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    priority: Mapped[str] = mapped_column(
        String(8), default="medium", server_default="medium", nullable=False
    )
    # The local calendar day and optional clock range ("HH:MM"); no start means all day.
    date: Mapped[dt_date | None] = mapped_column(Date)
    start_time: Mapped[str | None] = mapped_column(String(5))
    end_time: Mapped[str | None] = mapped_column(String(5))
    # Recurring tasks: each day's occurrence is its own row so it can be ticked, moved or deleted
    # alone. `series_id` ties the rows of one series together (the first row's id).
    repeat: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    repeat_rule: Mapped[str | None] = mapped_column(String(8))
    series_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_tasks_user_done", "user_id", "done_at"),
        Index("ix_tasks_user_date", "user_id", "date"),
        CheckConstraint("priority IN ('high','medium','low')", name="ck_tasks_priority"),
        CheckConstraint(
            "repeat_rule IS NULL OR repeat_rule IN ('daily','weekdays','weekly')",
            name="ck_tasks_repeat_rule",
        ),
    )


# =================================================================== nudges


# Kinds the engine produces. "system" and "insight" messages share the table (so they appear in
# the inbox) but are not nudges: they must never count toward caps, lists or analytics.
ENGINE_KINDS = ("nudge", "streak", "summary")


class Nudge(Base):
    __tablename__ = "nudges"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    habit_id: Mapped[object | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("habits.id", ondelete="CASCADE"), index=True
    )
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(24), default="scheduled", nullable=False)
    channel: Mapped[str] = mapped_column(String(16), default="push", nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    # Phase 2/3 populate these; recorded so cost can be attributed per nudge.
    model_id: Mapped[str | None] = mapped_column(String(120))
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    skip_reason: Mapped[str | None] = mapped_column(String(64))
    # Inbox presentation: what kind of message it is, its headline, and the user's reaction.
    kind: Mapped[str] = mapped_column(
        String(16), default="nudge", server_default="nudge", nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(160))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "status in ('scheduled','sent','snoozed','skipped','failed')", name="ck_nudge_status"
        ),
        CheckConstraint(
            "kind in ('nudge','summary','streak','insight','system')", name="ck_nudge_kind"
        ),
        Index("ix_nudges_user_status", "user_id", "status"),
        Index("ix_nudges_scheduled", "scheduled_for"),
    )


class Device(Base):
    """A phone that can receive push notifications (an Expo push token)."""

    __tablename__ = "devices"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Set when the push service reports the token dead (app uninstalled); never sent to again.
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("platform in ('ios','android','web')", name="ck_device_platform"),
    )


class NudgeFeedback(Base):
    __tablename__ = "nudge_feedback"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    nudge_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("nudges.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "kind in ('accepted','snoozed','completed','dismissed')", name="ck_fb_kind"
        ),
    )


# ============================================================ preferences


class Preference(Base):
    __tablename__ = "preferences"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    quiet_start: Mapped[str | None] = mapped_column(String(5))
    quiet_end: Mapped[str | None] = mapped_column(String(5))
    quiet_repeat_days: Mapped[list[int] | None] = mapped_column(JSONB)
    digest_time: Mapped[str | None] = mapped_column(String(5))
    # Spoken replies ("Voice" in Settings -> Notification). On by default; the app mirrors it.
    voice_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    # Notification switches (Settings -> Notification).
    push_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    morning_summary_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    weekly_report_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    streak_alerts_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    # Quiet hours extras: the window itself is quiet_start/quiet_end/quiet_repeat_days.
    quiet_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    # Reserved for task nudges (the engine only nudges habits today).
    quiet_allow_priority: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    # AI voice & tone.
    reminder_tone: Mapped[str] = mapped_column(
        String(8), default="gentle", server_default="gentle", nullable=False
    )
    use_name_in_reminders: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    include_streak_in_reminders: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    use_emojis_in_reminders: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    habit_stacking_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    max_nudges_per_day: Mapped[int] = mapped_column(Integer, default=6, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)

    __table_args__ = (
        CheckConstraint("reminder_tone IN ('gentle','firm','mix')", name="ck_pref_tone"),
    )

    user: Mapped[User] = relationship(back_populates="preferences")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    tier: Mapped[str] = mapped_column(String(16), default="free", nullable=False)
    period: Mapped[str | None] = mapped_column(String(16))  # monthly|yearly
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)
    renews_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("tier in ('free','pro')", name="ck_sub_tier"),
        CheckConstraint("status in ('active','cancelled','past_due')", name="ck_sub_status"),
    )

    user: Mapped[User] = relationship(back_populates="subscription")


# ================================================================= feedback


class Feedback(Base):
    """Messages and ratings sent from Settings. Kept for the team; never shown to other users."""

    __tablename__ = "feedback"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(16), nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    stars: Mapped[int | None] = mapped_column(Integer)
    app_version: Mapped[str | None] = mapped_column(String(32))
    platform: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "category in ('bug','idea','praise','other','rating')", name="ck_feedback_category"
        ),
        CheckConstraint("stars is null or stars between 1 and 5", name="ck_feedback_stars"),
    )


# =================================================================== chat


class Conversation(Base):
    """A chat thread. The model only ever sees the messages of the thread being continued."""

    __tablename__ = "conversations"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=_now
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_conversations_user_updated", "user_id", "updated_at"),)


class ChatTrace(Base):
    """How one assistant turn was produced: the route, each hop, the tools and what it cost.

    The mobile "how did the AI decide this" view reads these. Rows hold the shape of the
    turn (tier, tool names, outcomes), not the conversation text, which lives in chat_messages.
    """

    __tablename__ = "chat_traces"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conversation_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    prompt_preview: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    tier: Mapped[str] = mapped_column(String(16), nullable=False)
    model_id: Mapped[str] = mapped_column(String(120), nullable=False)
    reason: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    hops: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    tool_results: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    proposal_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    escalations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    degraded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cached: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (Index("ix_chat_traces_user_created", "user_id", "created_at"),)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tool_calls: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB)
    conversation_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    # How the user said it: typed or spoken (assistant replies mirror the user's turn).
    via: Mapped[str] = mapped_column(
        String(8), default="text", server_default="text", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("role in ('user','assistant','system','tool')", name="ck_chat_role"),
        CheckConstraint("via in ('text','voice')", name="ck_chat_via"),
        Index("ix_chat_user_created", "user_id", "created_at"),
    )


# ================================================================= memory


class Memory(Base):
    __tablename__ = "memories"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(_EMBED_DIM), nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), default="note", nullable=False)
    # Generated by PostgreSQL so lexical search can never drift from body.
    # 'simple' avoids stemming surprises on short natural-language notes.
    tsv: Mapped[str | None] = mapped_column(
        TSVECTOR, Computed("to_tsvector('simple', body)", persisted=True)
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        *_hnsw_index("ix_memories_embedding_hnsw", "embedding"),
        Index("ix_memories_user_created", "user_id", "created_at"),
        Index("ix_memories_tsv_gin", "tsv", postgresql_using="gin"),
    )


class CacheResponse(Base):
    """Semantic cache — the hand-rolled replacement for RedisVL SemanticCache.

    A hit is a cosine similarity below `semantic_cache_threshold` between the
    incoming prompt and a stored prompt_embedding.
    """

    __tablename__ = "cache_responses"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    prompt_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_embedding: Mapped[list[float]] = mapped_column(Vector(_EMBED_DIM), nullable=False)
    response: Mapped[str] = mapped_column(Text, nullable=False)
    model_id: Mapped[str | None] = mapped_column(String(120))
    hit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_cache_user_created", "user_id", "created_at"),
        *_hnsw_index("ix_cache_prompt_embedding_hnsw", "prompt_embedding"),
    )


class EmbeddingCost(Base):
    """Per-call token accounting so /metrics can attribute spend per model."""

    __tablename__ = "embedding_cost"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    model_id: Mapped[str] = mapped_column(String(120), nullable=False)
    texts: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================== phase 2
class ToolProposal(Base):
    """A mutating tool call awaiting the user's confirmation.

    The executor writes rows here and nothing else; `status` moves
    pending -> confirmed|rejected|failed|expired exactly once.
    """

    __tablename__ = "tool_proposals"

    id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tool_name: Mapped[str] = mapped_column(String(80), nullable=False)
    arguments: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    call_id: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", index=True)
    summary: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        # The executor may retry a hop, so (user, call_id) must be unique. This
        # is also what makes proposal creation idempotent under `on conflict do
        # nothing`.
        UniqueConstraint("user_id", "call_id", name="uq_tool_proposals_user_call"),
        Index("ix_tool_proposals_user_status", "user_id", "status"),
    )
