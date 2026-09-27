"""Drop the durable activation-analytics store (#354).

Revision ID: e2f4a6c8d0b3
Revises: d3e5f7a9b1c2
Create Date: 2026-09-28

Production analytics are deferred; the product is local-only. Tool runs and
frontend telemetry go to structured stdout logs instead. Dropping the table
also drops the profile-adoption and development-loop dimension columns that
lived on it. The downgrade recreates an empty table in its last shape.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e2f4a6c8d0b3"
down_revision: Union[str, None] = "d3e5f7a9b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEXED = (
    "event_name",
    "tool_id",
    "access_mode",
    "operational_dimension",
    "evidence_kind",
    "confirmation_transition",
    "development_gap_kind",
    "development_response_kind",
    "created_at",
)


def upgrade() -> None:
    op.drop_table("analytics_events")


def downgrade() -> None:
    op.create_table(
        "analytics_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("event_name", sa.String(), nullable=False),
        sa.Column("level", sa.String(), nullable=False, server_default="info"),
        sa.Column("tool_id", sa.String(), nullable=True),
        sa.Column("access_mode", sa.String(), nullable=True),
        sa.Column("saved", sa.Boolean(), nullable=True),
        sa.Column("failure_category", sa.String(), nullable=True),
        sa.Column("export_format", sa.String(), nullable=True),
        sa.Column("has_feedback", sa.Boolean(), nullable=True),
        sa.Column("session_status", sa.String(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("cost_estimate", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("operational_dimension", sa.String(), nullable=True),
        sa.Column("operational_outcome", sa.String(), nullable=True),
        sa.Column("evidence_kind", sa.String(), nullable=True),
        sa.Column("evidence_provenance", sa.String(), nullable=True),
        sa.Column("confirmation_transition", sa.String(), nullable=True),
        sa.Column("development_gap_kind", sa.String(), nullable=True),
        sa.Column("development_response_kind", sa.String(), nullable=True),
        sa.Column("development_state_from", sa.String(), nullable=True),
        sa.Column("development_state_to", sa.String(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in _INDEXED:
        op.create_index(f"ix_analytics_events_{column}", "analytics_events", [column])
