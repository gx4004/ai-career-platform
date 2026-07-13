"""add campaign reminder consent

Revision ID: c6e1a4b8d2f7
Revises: b5d9f1a3c7e2
"""

from alembic import op
import sqlalchemy as sa

revision = "c6e1a4b8d2f7"
down_revision = "b5d9f1a3c7e2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "workspaces",
        sa.Column("reminders_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "workspaces",
        sa.Column("reminders_last_surfaced_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_column("workspaces", "reminders_last_surfaced_at")
    op.drop_column("workspaces", "reminders_enabled")
