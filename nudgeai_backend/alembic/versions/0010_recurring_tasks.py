"""recurring task rule and series

Revision ID: 0010_recurring_tasks
Revises: 0009_feedback
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_recurring_tasks"
down_revision: str | None = "0009_feedback"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("repeat_rule", sa.String(8), nullable=True))
    op.add_column("tasks", sa.Column("series_id", sa.UUID(), nullable=True))
    op.create_index("ix_tasks_series_id", "tasks", ["series_id"])
    op.create_check_constraint(
        "ck_tasks_repeat_rule",
        "tasks",
        "repeat_rule IS NULL OR repeat_rule IN ('daily','weekdays','weekly')",
    )
    # Tasks already flagged as repeating become the first row of a daily series.
    op.execute("UPDATE tasks SET repeat_rule = 'daily', series_id = id WHERE repeat")


def downgrade() -> None:
    op.drop_constraint("ck_tasks_repeat_rule", "tasks", type_="check")
    op.drop_index("ix_tasks_series_id", table_name="tasks")
    op.drop_column("tasks", "series_id")
    op.drop_column("tasks", "repeat_rule")
