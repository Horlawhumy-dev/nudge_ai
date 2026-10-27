"""phase 1 foundation

Revision ID: 0001_phase1
Revises:
Create Date: 2026-09-27

Creates the full Phase 1 schema: identity, onboarding, habits, tasks, nudges,
preferences, chat, pgvector memory, and the semantic cache.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from alembic import op
from app.core.config import HNSW_MAX_DIM, get_settings

revision: str = "0001_phase1"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# gen_random_uuid() is built in from PostgreSQL 13, so the database can mint
# primary keys even for inserts that do not go through the ORM.
_UUID_DEFAULT = sa.text("gen_random_uuid()")

EMBED_DIM = get_settings().embedding_dim
HNSW_ON = get_settings().hnsw_index_enabled and EMBED_DIM <= HNSW_MAX_DIM


def upgrade() -> None:
    # pgvector must exist before the Vector columns are created.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ------------------------------------------------------------- users
    op.create_table(
        "users",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(120)),
        sa.Column("timezone", sa.String(64), server_default="UTC", nullable=False),
        sa.Column("is_email_verified", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("plan", sa.String(16), server_default="free", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("plan in ('free','pro')", name="ck_users_plan"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ------------------------------------------------- verification_codes
    op.create_table(
        "verification_codes",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(10), nullable=False),
        sa.Column("purpose", sa.String(24), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "purpose in ('email_verification','password_reset')", name="ck_vc_purpose"
        ),
    )
    op.create_index("ix_verification_codes_user_id", "verification_codes", ["user_id"])
    op.create_index("ix_verification_user_purpose", "verification_codes", ["user_id", "purpose"])

    # ------------------------------------------------------ refresh_tokens
    op.create_table(
        "refresh_tokens",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("jti", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_refresh_tokens_jti", "refresh_tokens", ["jti"], unique=True)
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    # -------------------------------------------------- onboarding_profiles
    op.create_table(
        "onboarding_profiles",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column("wake_time", sa.String(5)),
        sa.Column("sleep_time", sa.String(5)),
        sa.Column("goals", postgresql.JSONB()),
        sa.Column("nudge_style", sa.String(32)),
        sa.Column("tone", sa.String(32)),
        sa.Column("completed", sa.Boolean(), server_default=sa.false(), nullable=False),
    )

    # ------------------------------------------------------------- habits
    op.create_table(
        "habits",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("cue", sa.String(160)),
        sa.Column("target_per_day", sa.Integer(), server_default="1", nullable=False),
        sa.Column("stack_position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("preferred_time", sa.String(5)),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("target_per_day > 0", name="ck_habits_target_positive"),
    )
    op.create_index("ix_habits_user_active", "habits", ["user_id", "active"])
    op.create_index("ix_habits_user_id", "habits", ["user_id"])

    # -------------------------------------------------- habit_completions
    op.create_table(
        "habit_completions",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "habit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("habits.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("completed_on", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("habit_id", "completed_on", name="uq_completion_day"),
    )
    op.create_index("ix_habit_completions_habit_id", "habit_completions", ["habit_id"])
    op.create_index("ix_habit_completions_user_id", "habit_completions", ["user_id"])

    # ------------------------------------------------------------ streaks
    op.create_table(
        "streaks",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "habit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("habits.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column("current", sa.Integer(), server_default="0", nullable=False),
        sa.Column("best", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_completed_on", sa.Date()),
    )

    # -------------------------------------------------------------- tasks
    op.create_table(
        "tasks",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(320), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("done_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_tasks_user_done", "tasks", ["user_id", "done_at"])
    op.create_index("ix_tasks_user_id", "tasks", ["user_id"])

    # ------------------------------------------------------------- nudges
    op.create_table(
        "nudges",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "habit_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("habits.id", ondelete="CASCADE"),
        ),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(24), server_default="scheduled", nullable=False),
        sa.Column("channel", sa.String(16), server_default="push", nullable=False),
        sa.Column("body", sa.Text()),
        sa.Column("model_id", sa.String(120)),
        sa.Column("prompt_tokens", sa.Integer()),
        sa.Column("completion_tokens", sa.Integer()),
        sa.Column("skip_reason", sa.String(64)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status in ('scheduled','sent','snoozed','skipped','failed')", name="ck_nudge_status"
        ),
    )
    op.create_index("ix_nudges_habit_id", "nudges", ["habit_id"])
    op.create_index("ix_nudges_scheduled", "nudges", ["scheduled_for"])
    op.create_index("ix_nudges_user_status", "nudges", ["user_id", "status"])
    op.create_index("ix_nudges_user_id", "nudges", ["user_id"])

    # ----------------------------------------------------- nudge_feedback
    op.create_table(
        "nudge_feedback",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "nudge_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("nudges.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind in ('accepted','snoozed','completed','dismissed')", name="ck_fb_kind"
        ),
    )
    op.create_index("ix_nudge_feedback_nudge_id", "nudge_feedback", ["nudge_id"])
    op.create_index("ix_nudge_feedback_user_id", "nudge_feedback", ["user_id"])

    # -------------------------------------------------------- preferences
    op.create_table(
        "preferences",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column("quiet_start", sa.String(5)),
        sa.Column("quiet_end", sa.String(5)),
        sa.Column("quiet_repeat_days", postgresql.JSONB()),
        sa.Column("digest_time", sa.String(5)),
        sa.Column("voice_enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("max_nudges_per_day", sa.Integer(), server_default="6", nullable=False),
        sa.Column("timezone", sa.String(64), server_default="UTC", nullable=False),
    )

    # ------------------------------------------------------ subscriptions
    op.create_table(
        "subscriptions",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column("tier", sa.String(16), server_default="free", nullable=False),
        sa.Column("period", sa.String(16)),
        sa.Column("status", sa.String(16), server_default="active", nullable=False),
        sa.Column("renews_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("tier in ('free','pro')", name="ck_sub_tier"),
        sa.CheckConstraint("status in ('active','cancelled','past_due')", name="ck_sub_status"),
    )

    # ------------------------------------------------------ chat_messages
    op.create_table(
        "chat_messages",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tool_calls", postgresql.JSONB()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("role in ('user','assistant','system','tool')", name="ck_chat_role"),
    )
    op.create_index("ix_chat_user_created", "chat_messages", ["user_id", "created_at"])
    op.create_index("ix_chat_messages_user_id", "chat_messages", ["user_id"])

    # ------------------------------------------------------------ memory
    op.create_table(
        "memories",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(EMBED_DIM), nullable=False),
        sa.Column("embedding_model", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(32), server_default="note", nullable=False),
        # Generated by PostgreSQL: lexical search can never drift from body.
        sa.Column(
            "tsv",
            postgresql.TSVECTOR,
            sa.Computed("to_tsvector('simple', body)", persisted=True),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_memories_user_created", "memories", ["user_id", "created_at"])
    op.create_index("ix_memories_user_id", "memories", ["user_id"])
    op.create_index("ix_memories_tsv_gin", "memories", ["tsv"], postgresql_using="gin")
    if HNSW_ON:
        op.create_index(
            "ix_memories_embedding_hnsw",
            "memories",
            ["embedding"],
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        )

    # --------------------------------------------------- semantic cache
    op.create_table(
        "cache_responses",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("prompt_hash", sa.String(64), nullable=False),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("prompt_embedding", Vector(EMBED_DIM), nullable=False),
        sa.Column("response", sa.Text(), nullable=False),
        sa.Column("model_id", sa.String(120)),
        sa.Column("hit_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_cache_user_created", "cache_responses", ["user_id", "created_at"])
    op.create_index("ix_cache_responses_user_id", "cache_responses", ["user_id"])
    if HNSW_ON:
        op.create_index(
            "ix_cache_prompt_embedding_hnsw",
            "cache_responses",
            ["prompt_embedding"],
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"prompt_embedding": "vector_cosine_ops"},
        )

    # ---------------------------------------------------- embedding_cost
    op.create_table(
        "embedding_cost",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=_UUID_DEFAULT
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("model_id", sa.String(120), nullable=False),
        sa.Column("texts", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_embedding_cost_user_id", "embedding_cost", ["user_id"])


def downgrade() -> None:
    op.drop_table("embedding_cost")
    op.drop_table("cache_responses")
    op.drop_table("memories")
    op.drop_table("chat_messages")
    op.drop_table("subscriptions")
    op.drop_table("preferences")
    op.drop_table("nudge_feedback")
    op.drop_table("nudges")
    op.drop_table("tasks")
    op.drop_table("streaks")
    op.drop_table("habit_completions")
    op.drop_table("habits")
    op.drop_table("onboarding_profiles")
    op.drop_table("refresh_tokens")
    op.drop_table("verification_codes")
    op.drop_table("users")
