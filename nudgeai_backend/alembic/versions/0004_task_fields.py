"""task priority, date/time range, repeat flag and soft delete

Revision ID: 0004_task_fields
Revises: 0003_habit_fields
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_task_fields"
down_revision: str | None = "0003_habit_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tasks", sa.Column("priority", sa.String(8), server_default="medium", nullable=False)
    )
    op.add_column("tasks", sa.Column("date", sa.Date(), nullable=True))
    op.add_column("tasks", sa.Column("start_time", sa.String(5), nullable=True))
    op.add_column("tasks", sa.Column("end_time", sa.String(5), nullable=True))
    op.add_column(
        "tasks", sa.Column("repeat", sa.Boolean(), server_default=sa.false(), nullable=False)
    )
    op.add_column("tasks", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_tasks_user_date", "tasks", ["user_id", "date"])
    op.create_check_constraint("ck_tasks_priority", "tasks", "priority IN ('high','medium','low')")
    # Existing tasks only had a due moment; give them the matching UTC calendar day.
    op.execute("UPDATE tasks SET date = (due_at AT TIME ZONE 'UTC')::date WHERE due_at IS NOT NULL")


def downgrade() -> None:
    op.drop_constraint("ck_tasks_priority", "tasks", type_="check")
    op.drop_index("ix_tasks_user_date", table_name="tasks")
    for col in ("deleted_at", "repeat", "end_time", "start_time", "date", "priority"):
        op.drop_column("tasks", col)
