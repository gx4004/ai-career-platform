"""Add analytics_events table (R6 activation instrumentation)

Revision ID: f5c1a2b3d4e6
Revises: e4a7b2d918f3
Create Date: 2026-07-10

Introduces the durable store for R6 activation events (D-037). The single
shared write seam (`record_activation_event`) is the only path that writes
here, and enforces the same `extra="forbid"` allowlist the frontend-telemetry
ingestion endpoint already uses — so only low-cardinality allowlisted
dimensions ever land: event name, tool id, access mode, timestamps, duration,
cost estimate, and the existing frontend telemetry dimensions. Never resume/JD/
generated content, email, or free text. Additive migration; no existing table
is touched. `created_at` is indexed to drive the rolling 180-day retention prune
(wired in a sibling R6 slice).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f5c1a2b3d4e6"
down_revision: Union[str, None] = "e4a7b2d918f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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
        sa.Column("unlock_method", sa.String(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("cost_estimate", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_analytics_events_event_name", "analytics_events", ["event_name"]
    )
    op.create_index("ix_analytics_events_tool_id", "analytics_events", ["tool_id"])
    op.create_index(
        "ix_analytics_events_access_mode", "analytics_events", ["access_mode"]
    )
    op.create_index(
        "ix_analytics_events_created_at", "analytics_events", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_analytics_events_created_at", table_name="analytics_events")
    op.drop_index("ix_analytics_events_access_mode", table_name="analytics_events")
    op.drop_index("ix_analytics_events_tool_id", table_name="analytics_events")
    op.drop_index("ix_analytics_events_event_name", table_name="analytics_events")
    op.drop_table("analytics_events")
