"""spoken replies are on by default

Revision ID: 0012_voice_on_by_default
Revises: 0011_chat_traces

``voice_enabled`` was created off. The app mirrors it as the "Voice" switch, so every account that
logged in found spoken replies switched off and heard nothing. Until now the switch controlled
nothing audible, so no one chose "off" on purpose: existing accounts are switched on too.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012_voice_on_by_default"
down_revision: str | None = "0011_chat_traces"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("preferences", "voice_enabled", server_default=sa.true())
    op.execute("UPDATE preferences SET voice_enabled = true WHERE voice_enabled = false")


def downgrade() -> None:
    # Only the default goes back; we can't know which rows were switched on by the upgrade.
    op.alter_column("preferences", "voice_enabled", server_default=sa.false())
