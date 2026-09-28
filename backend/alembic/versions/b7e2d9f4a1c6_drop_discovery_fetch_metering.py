"""Drop the discovery rate window and the per-source query/robots policy (#370).

Revision ID: b7e2d9f4a1c6
Revises: a3f1c7e9b2d4
Create Date: 2026-09-28

Every source is a public employer-ATS board fetched with one fixed GET per
scheduled run, so the per-minute rate window, the query-parameter allowlist and
the robots policy were never binding. The declared ``rate_limit_per_minute``
stays as registry data. The downgrade restores the columns empty.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7e2d9f4a1c6"
down_revision: Union[str, None] = "a3f1c7e9b2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_discovery_sources_rate_window_count", "discovery_sources", type_="check")
    op.drop_constraint("ck_discovery_sources_robots_policy", "discovery_sources", type_="check")
    op.drop_column("discovery_sources", "rate_window_count")
    op.drop_column("discovery_sources", "rate_window_started_at")
    op.drop_column("discovery_sources", "robots_policy")
    op.drop_column("discovery_sources", "allowed_query_parameters")


def downgrade() -> None:
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
