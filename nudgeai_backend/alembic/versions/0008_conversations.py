"""chat conversations

Revision ID: 0008_conversations
Revises: 0007_notifications_devices
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_conversations"
down_revision: str | None = "0007_notifications_devices"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_conversations_user_id", "conversations", ["user_id"])
    op.create_index("ix_conversations_user_updated", "conversations", ["user_id", "updated_at"])

    op.add_column("chat_messages", sa.Column("conversation_id", sa.UUID(), nullable=True))
    op.add_column(
        "chat_messages", sa.Column("via", sa.String(8), server_default="text", nullable=False)
    )
    op.create_foreign_key(
        "fk_chat_messages_conversation",
        "chat_messages",
        "conversations",
        ["conversation_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_chat_messages_conversation_id", "chat_messages", ["conversation_id"])
    op.create_check_constraint("ck_chat_via", "chat_messages", "via in ('text','voice')")

    # Existing history becomes one conversation per user, titled by their first message.
    op.execute(
        """
        INSERT INTO conversations (user_id, title, created_at, updated_at)
        SELECT m.user_id,
               COALESCE(
                 (SELECT left(c.content, 70) FROM chat_messages c
                   WHERE c.user_id = m.user_id AND c.role = 'user'
                   ORDER BY c.created_at LIMIT 1),
                 'Earlier chat'),
               min(m.created_at), max(m.created_at)
          FROM chat_messages m GROUP BY m.user_id
        """
    )
    op.execute(
        """
        UPDATE chat_messages m SET conversation_id = c.id
          FROM conversations c WHERE c.user_id = m.user_id
        """
    )


def downgrade() -> None:
    op.drop_constraint("ck_chat_via", "chat_messages", type_="check")
    op.drop_index("ix_chat_messages_conversation_id", table_name="chat_messages")
    op.drop_constraint("fk_chat_messages_conversation", "chat_messages", type_="foreignkey")
    op.drop_column("chat_messages", "via")
    op.drop_column("chat_messages", "conversation_id")
    op.drop_index("ix_conversations_user_updated", table_name="conversations")
    op.drop_index("ix_conversations_user_id", table_name="conversations")
    op.drop_table("conversations")
