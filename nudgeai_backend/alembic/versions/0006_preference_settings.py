"""notification, quiet-hours and tone preferences

Revision ID: 0006_preference_settings
Revises: 0005_user_profile
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_preference_settings"
down_revision: str | None = "0005_user_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_BOOLS: tuple[tuple[str, bool], ...] = (
    ("push_enabled", True),
    ("morning_summary_enabled", True),
    ("weekly_report_enabled", False),
    ("streak_alerts_enabled", True),
    ("quiet_enabled", True),
    ("quiet_allow_priority", True),
    ("use_name_in_reminders", True),
    ("include_streak_in_reminders", True),
    ("use_emojis_in_reminders", False),
    ("habit_stacking_enabled", True),
)


def upgrade() -> None:
    for name, default in _BOOLS:
        op.add_column(
            "preferences",
            sa.Column(
                name,
                sa.Boolean(),
                server_default=sa.true() if default else sa.false(),
                nullable=False,
            ),
        )
    op.add_column(
        "preferences",
        sa.Column("reminder_tone", sa.String(8), server_default="gentle", nullable=False),
    )
    op.create_check_constraint(
        "ck_pref_tone", "preferences", "reminder_tone IN ('gentle','firm','mix')"
    )


def downgrade() -> None:
    op.drop_constraint("ck_pref_tone", "preferences", type_="check")
    op.drop_column("preferences", "reminder_tone")
    for name, _ in reversed(_BOOLS):
        op.drop_column("preferences", name)
