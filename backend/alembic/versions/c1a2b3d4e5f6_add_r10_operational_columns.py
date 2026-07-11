"""Add R10 operational dimensions to analytics_events (scaling-trigger scorecard)

Revision ID: c1a2b3d4e5f6
Revises: b7e2c9a4f1d8
Create Date: 2026-07-11

R10 #136 extends the R6 first-party operational path (D-053) with the
scaling-trigger scorecard. It reuses the existing `analytics_events` store
rather than adding a new analytics vendor, adding two nullable, closed-set,
low-cardinality columns:

- `operational_dimension` — the primary category/family for an R10 event
  (provider incident category or job-import source family). Indexed because the
  scorecard groups by it.
- `operational_outcome` — the outcome class (cache hit/miss/write/failure or
  import success/fallback/failure).

Both are null for every R6 activation event and are constrained to Literal
values by the `ActivationEventCreate` allowlist (`extra="forbid"`), so no raw
URL, provider exception, cache key, or identifier can ever land here. Additive
and reversible: the downgrade drops the index and both columns (no data to
preserve, since R6-era rows never populated them).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1a2b3d4e5f6"
down_revision: Union[str, None] = "b7e2c9a4f1d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "analytics_events",
        sa.Column("operational_dimension", sa.String(), nullable=True),
    )
    op.add_column(
        "analytics_events",
        sa.Column("operational_outcome", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_analytics_events_operational_dimension",
        "analytics_events",
        ["operational_dimension"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_analytics_events_operational_dimension",
        table_name="analytics_events",
    )
    op.drop_column("analytics_events", "operational_outcome")
    op.drop_column("analytics_events", "operational_dimension")
