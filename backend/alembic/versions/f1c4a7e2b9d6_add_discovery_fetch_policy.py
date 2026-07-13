"""add discovery source fetch policy

Revision ID: f1c4a7e2b9d6
Revises: e8a1b4c7d2f5
"""

import sqlalchemy as sa

from alembic import op

revision = "f1c4a7e2b9d6"
down_revision = "e8a1b4c7d2f5"
branch_labels = None
depends_on = None


def upgrade():
    # Nullable for forward compatibility with any dark #171 records. The
    # authorization seam refuses an entry until all three fields are present.
    op.add_column("discovery_sources", sa.Column("endpoint_url", sa.String(2048), nullable=True))
    op.add_column(
        "discovery_sources",
        sa.Column("allowed_query_parameters", sa.JSON(), nullable=True),
    )
    op.add_column("discovery_sources", sa.Column("robots_policy", sa.String(20), nullable=True))
    op.add_column(
        "discovery_sources",
        sa.Column("rate_window_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "discovery_sources",
        sa.Column("rate_window_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_check_constraint(
        "ck_discovery_sources_robots_policy",
        "discovery_sources",
        "robots_policy IS NULL OR robots_policy IN ('required', 'not_applicable')",
    )
    op.create_check_constraint(
        "ck_discovery_sources_rate_window_count",
        "discovery_sources",
        "rate_window_count >= 0",
    )


def downgrade():
    op.drop_constraint("ck_discovery_sources_rate_window_count", "discovery_sources", type_="check")
    op.drop_constraint("ck_discovery_sources_robots_policy", "discovery_sources", type_="check")
    op.drop_column("discovery_sources", "rate_window_count")
    op.drop_column("discovery_sources", "rate_window_started_at")
    op.drop_column("discovery_sources", "robots_policy")
    op.drop_column("discovery_sources", "allowed_query_parameters")
    op.drop_column("discovery_sources", "endpoint_url")
