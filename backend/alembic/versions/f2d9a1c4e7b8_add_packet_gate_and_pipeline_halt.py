"""add packet gate columns and pipeline halt

Revision ID: f2d9a1c4e7b8
Revises: e4c1f2a8b9d3
"""

import sqlalchemy as sa

from alembic import op

revision = "f2d9a1c4e7b8"
down_revision = "e4c1f2a8b9d3"
branch_labels = None
depends_on = None


def upgrade():
    # Trust-chain gate columns on the packet (R15 #184, D-097).
    op.add_column(
        "application_packets",
        sa.Column(
            "gate_state",
            sa.String(16),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "application_packets",
        sa.Column(
            "review_run_id",
            sa.String(),
            sa.ForeignKey("tool_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        "ck_application_packet_gate_state",
        "application_packets",
        "gate_state IN ('pending', 'passed', 'blocked')",
    )

    # Pipeline-wide preparation halt (operational state, not owner-scoped).
    op.create_table(
        "pipeline_halts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("scope", sa.String(64), nullable=False),
        sa.Column("reason", sa.String(64), nullable=False),
        sa.Column("halted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("scope", name="uq_pipeline_halt_scope"),
    )
    op.create_index("ix_pipeline_halts_scope", "pipeline_halts", ["scope"])


def downgrade():
    op.drop_index("ix_pipeline_halts_scope", table_name="pipeline_halts")
    op.drop_table("pipeline_halts")
    op.drop_constraint(
        "ck_application_packet_gate_state", "application_packets", type_="check"
    )
    op.drop_column("application_packets", "review_run_id")
    op.drop_column("application_packets", "gate_state")
