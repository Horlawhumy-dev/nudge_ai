"""per-turn agent traces

Revision ID: 0011_chat_traces
Revises: 0010_recurring_tasks
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0011_chat_traces"
down_revision: str | None = "0010_recurring_tasks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chat_traces",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=True),
        sa.Column("prompt_preview", sa.String(160), nullable=False),
        sa.Column("tier", sa.String(16), nullable=False),
        sa.Column("model_id", sa.String(120), nullable=False),
        sa.Column("reason", sa.String(300), nullable=False),
        sa.Column("hops", postgresql.JSONB(), nullable=False),
        sa.Column("tool_results", postgresql.JSONB(), nullable=False),
        sa.Column("proposal_ids", postgresql.JSONB(), nullable=False),
        sa.Column("escalations", sa.Integer(), nullable=False),
        sa.Column("degraded", sa.Boolean(), nullable=False),
        sa.Column("cached", sa.Boolean(), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False),
        sa.Column("completion_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_traces_user_id", "chat_traces", ["user_id"])
    op.create_index("ix_chat_traces_conversation_id", "chat_traces", ["conversation_id"])
    op.create_index("ix_chat_traces_user_created", "chat_traces", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_chat_traces_user_created", table_name="chat_traces")
    op.drop_index("ix_chat_traces_conversation_id", table_name="chat_traces")
    op.drop_index("ix_chat_traces_user_id", table_name="chat_traces")
    op.drop_table("chat_traces")
