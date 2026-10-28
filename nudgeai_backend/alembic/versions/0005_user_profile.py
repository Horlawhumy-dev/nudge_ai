"""user avatar and pending email change

Revision ID: 0005_user_profile
Revises: 0004_task_fields
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_user_profile"
down_revision: str | None = "0004_task_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(500), nullable=True))
    op.add_column("users", sa.Column("pending_email", sa.String(320), nullable=True))
    op.drop_constraint("ck_vc_purpose", "verification_codes", type_="check")
    op.create_check_constraint(
        "ck_vc_purpose",
        "verification_codes",
        "purpose in ('email_verification','password_reset','email_change')",
    )


def downgrade() -> None:
    op.execute("DELETE FROM verification_codes WHERE purpose = 'email_change'")
    op.drop_constraint("ck_vc_purpose", "verification_codes", type_="check")
    op.create_check_constraint(
        "ck_vc_purpose", "verification_codes", "purpose in ('email_verification','password_reset')"
    )
    op.drop_column("users", "pending_email")
    op.drop_column("users", "avatar_url")
