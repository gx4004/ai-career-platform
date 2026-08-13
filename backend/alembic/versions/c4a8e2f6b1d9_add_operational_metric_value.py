"""add bounded operational metric value

Revision ID: c4a8e2f6b1d9
Revises: b2e7a9c4d6f1
"""

import sqlalchemy as sa

from alembic import op

revision = "c4a8e2f6b1d9"
down_revision = "b2e7a9c4d6f1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "analytics_events",
        sa.Column("metric_value", sa.Numeric(12, 6), nullable=True),
    )


def downgrade():
    op.drop_column("analytics_events", "metric_value")
