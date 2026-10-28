"""habit presentation, cadence and stacking fields

Revision ID: 0003_habit_fields
Revises: 0002_phase2
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_habit_fields"
down_revision: str | None = "0002_phase2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("habits", sa.Column("emoji", sa.String(16), server_default="🎯", nullable=False))
    op.add_column("habits", sa.Column("category", sa.String(40), nullable=True))
    op.add_column(
        "habits", sa.Column("time_of_day", sa.String(12), server_default="morning", nullable=False)
    )
    op.add_column(
        "habits", sa.Column("frequency", sa.String(12), server_default="daily", nullable=False)
    )
    op.add_column(
        "habits", sa.Column("goal_days", sa.Integer(), server_default="7", nullable=False)
    )
    op.add_column("habits", sa.Column("stacked_after_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_habits_stacked_after",
        "habits",
        "habits",
        ["stacked_after_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_habits_time_of_day", "habits", "time_of_day IN ('morning','afternoon','evening')"
    )
    op.create_check_constraint(
        "ck_habits_frequency", "habits", "frequency IN ('daily','weekdays','weekly')"
    )
    op.create_check_constraint("ck_habits_goal_days", "habits", "goal_days BETWEEN 1 AND 7")


def downgrade() -> None:
    op.drop_constraint("ck_habits_goal_days", "habits", type_="check")
    op.drop_constraint("ck_habits_frequency", "habits", type_="check")
    op.drop_constraint("ck_habits_time_of_day", "habits", type_="check")
    op.drop_constraint("fk_habits_stacked_after", "habits", type_="foreignkey")
    for col in ("stacked_after_id", "goal_days", "frequency", "time_of_day", "category", "emoji"):
        op.drop_column("habits", col)
