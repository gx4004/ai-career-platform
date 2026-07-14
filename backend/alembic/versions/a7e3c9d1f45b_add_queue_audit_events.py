"""add queue audit events

Revision ID: a7e3c9d1f45b
Revises: f2d9a1c4e7b8
"""

import sqlalchemy as sa

from alembic import op

revision = "a7e3c9d1f45b"
down_revision = "f2d9a1c4e7b8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "queue_audit_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("packet_id", sa.String(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_queue_audit_events_user_id", "queue_audit_events", ["user_id"])


def downgrade():
    op.drop_index("ix_queue_audit_events_user_id", table_name="queue_audit_events")
    op.drop_table("queue_audit_events")
