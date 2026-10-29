"""reminders for tasks that are about to start

Revision ID: 0013_task_reminders
Revises: 0012_voice_on_by_default

``tasks.reminded_at`` records that a task's reminder went out (so it is sent once, and a
reschedule clears it). ``nudges.task_id`` ties a ``reminder`` message to its task.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013_task_reminders"
down_revision: str | None = "0012_voice_on_by_default"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KINDS_BEFORE = "kind in ('nudge','summary','streak','insight','system')"
KINDS_AFTER = "kind in ('nudge','summary','streak','insight','system','reminder')"


def upgrade() -> None:
    op.add_column("tasks", sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_tasks_pending_reminder",
        "tasks",
        ["date"],
        postgresql_where=sa.text(
            "reminded_at IS NULL AND done_at IS NULL AND deleted_at IS NULL "
            "AND start_time IS NOT NULL"
        ),
    )
    op.add_column("nudges", sa.Column("task_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_nudges_task_id_tasks", "nudges", "tasks", ["task_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index("ix_nudges_task_id", "nudges", ["task_id"])
    op.drop_constraint("ck_nudge_kind", "nudges", type_="check")
    op.create_check_constraint("ck_nudge_kind", "nudges", KINDS_AFTER)


def downgrade() -> None:
    # Reminder rows can't satisfy the older constraint, so they go with the column.
    op.execute("DELETE FROM nudges WHERE kind = 'reminder'")
    op.drop_constraint("ck_nudge_kind", "nudges", type_="check")
    op.create_check_constraint("ck_nudge_kind", "nudges", KINDS_BEFORE)
    op.drop_index("ix_nudges_task_id", table_name="nudges")
    op.drop_constraint("fk_nudges_task_id_tasks", "nudges", type_="foreignkey")
    op.drop_column("nudges", "task_id")
    op.drop_index("ix_tasks_pending_reminder", table_name="tasks")
    op.drop_column("tasks", "reminded_at")
