"""inbox fields on nudges, and push devices

Revision ID: 0007_notifications_devices
Revises: 0006_preference_settings
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_notifications_devices"
down_revision: str | None = "0006_preference_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "nudges", sa.Column("kind", sa.String(16), server_default="nudge", nullable=False)
    )
    op.add_column("nudges", sa.Column("title", sa.String(160), nullable=True))
    op.add_column("nudges", sa.Column("read_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("nudges", sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint(
        "ck_nudge_kind", "nudges", "kind in ('nudge','summary','streak','insight','system')"
    )
    # Past digests are summaries, not habit nudges.
    op.execute("UPDATE nudges SET kind = 'summary' WHERE habit_id IS NULL")

    op.create_table(
        "devices",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
        sa.CheckConstraint("platform in ('ios','android','web')", name="ck_device_platform"),
    )
    op.create_index("ix_devices_user_id", "devices", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_devices_user_id", table_name="devices")
    op.drop_table("devices")
    op.drop_constraint("ck_nudge_kind", "nudges", type_="check")
    for col in ("dismissed_at", "read_at", "title", "kind"):
        op.drop_column("nudges", col)
