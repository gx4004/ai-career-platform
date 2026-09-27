"""Drop R10 scaling-trigger telemetry (#353).

Revision ID: d3e5f7a9b1c2
Revises: b1d4f6a8c2e9
Create Date: 2026-09-27

Deletes the r10_* operational event rows and the metric_value column that only
those events used. operational_dimension/operational_outcome stay: discovery
and packet-gate events still write them.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d3e5f7a9b1c2"
down_revision: Union[str, None] = "b1d4f6a8c2e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM analytics_events WHERE event_name LIKE 'r10%'")
    op.drop_column("analytics_events", "metric_value")


def downgrade() -> None:
    op.add_column(
        "analytics_events",
        sa.Column("metric_value", sa.Numeric(12, 6), nullable=True),
    )
