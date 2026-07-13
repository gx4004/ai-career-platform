"""add application packets

Revision ID: d2b7f4a9c1e6
Revises: c9f3a1e5b7d2
"""

import sqlalchemy as sa

from alembic import op

revision = "d2b7f4a9c1e6"
down_revision = "c9f3a1e5b7d2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "application_packets",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "campaign_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "listing_id",
            sa.String(),
            sa.ForeignKey("discovered_listings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "cv_variant_id",
            sa.String(),
            sa.ForeignKey("cv_variants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "drafts_run_id",
            sa.String(),
            sa.ForeignKey("tool_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("match_rationale", sa.JSON(), nullable=False),
        sa.Column("unresolved_questions", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("estimated_cost_usd", sa.Numeric(10, 4), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "listing_id", name="uq_packet_owner_listing"),
        sa.CheckConstraint(
            "status IN ('prepared', 'blocked')",
            name="ck_application_packet_status",
        ),
    )
    op.create_index("ix_application_packets_user_id", "application_packets", ["user_id"])
    op.create_index("ix_application_packets_campaign_id", "application_packets", ["campaign_id"])
    op.create_index("ix_application_packets_listing_id", "application_packets", ["listing_id"])


def downgrade():
    op.drop_table("application_packets")
