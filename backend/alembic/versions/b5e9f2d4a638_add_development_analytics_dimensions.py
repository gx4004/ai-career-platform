"""Add R17 development-loop analytics dimensions (#202).

Revision ID: b5e9f2d4a638
Revises: a4d8e1c39f27
Create Date: 2026-07-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b5e9f2d4a638"
down_revision: Union[str, None] = "a4d8e1c39f27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "analytics_events",
        sa.Column("development_gap_kind", sa.String(), nullable=True),
    )
    op.add_column(
        "analytics_events",
        sa.Column("development_response_kind", sa.String(), nullable=True),
    )
    op.add_column(
        "analytics_events",
        sa.Column("development_state_from", sa.String(), nullable=True),
    )
    op.add_column(
        "analytics_events",
        sa.Column("development_state_to", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_analytics_events_development_gap_kind",
        "analytics_events",
        ["development_gap_kind"],
    )
    op.create_index(
        "ix_analytics_events_development_response_kind",
        "analytics_events",
        ["development_response_kind"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_analytics_events_development_response_kind",
        table_name="analytics_events",
    )
    op.drop_index(
        "ix_analytics_events_development_gap_kind",
        table_name="analytics_events",
    )
    op.drop_column("analytics_events", "development_state_to")
    op.drop_column("analytics_events", "development_state_from")
    op.drop_column("analytics_events", "development_response_kind")
    op.drop_column("analytics_events", "development_gap_kind")
