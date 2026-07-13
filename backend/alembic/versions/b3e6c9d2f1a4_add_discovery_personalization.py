"""add discovery personalization

Revision ID: b3e6c9d2f1a4
Revises: a2d5f8b1c4e7
"""

import sqlalchemy as sa

from alembic import op

revision = "b3e6c9d2f1a4"
down_revision = "a2d5f8b1c4e7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "discovery_hidden_sources",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_id",
            sa.String(),
            sa.ForeignKey("discovery_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "source_id", name="uq_discovery_hidden_source_owner"),
    )
    op.create_index(
        "ix_discovery_hidden_sources_user_id", "discovery_hidden_sources", ["user_id"]
    )
    op.create_index(
        "ix_discovery_hidden_sources_source_id", "discovery_hidden_sources", ["source_id"]
    )

    op.create_table(
        "discovery_dismissed_listings",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "listing_id",
            sa.String(),
            sa.ForeignKey("discovered_listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "user_id", "listing_id", name="uq_discovery_dismissed_listing_owner"
        ),
    )
    op.create_index(
        "ix_discovery_dismissed_listings_user_id", "discovery_dismissed_listings", ["user_id"]
    )
    op.create_index(
        "ix_discovery_dismissed_listings_listing_id",
        "discovery_dismissed_listings",
        ["listing_id"],
    )

    op.create_table(
        "discovery_recommendation_reports",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("listing_id", sa.String(), nullable=False),
        sa.Column("listing_title", sa.String(200), nullable=False),
        sa.Column("listing_company", sa.String(200), nullable=False),
        sa.Column("source_family", sa.String(40), nullable=False),
        sa.Column("reason_category", sa.String(40), nullable=False),
        sa.Column("reason_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "reason_category IN "
            "('not_relevant', 'expired', 'duplicate', 'wrong_location', 'low_quality', 'other')",
            name="ck_discovery_report_reason_category",
        ),
        sa.CheckConstraint(
            "source_family IN "
            "('licensed', 'employer_ats', 'public_career_page', 'user_provided')",
            name="ck_discovery_report_source_family",
        ),
    )
    op.create_index(
        "ix_discovery_recommendation_reports_user_id",
        "discovery_recommendation_reports",
        ["user_id"],
    )
    op.create_index(
        "ix_discovery_recommendation_reports_listing_id",
        "discovery_recommendation_reports",
        ["listing_id"],
    )


def downgrade():
    op.drop_table("discovery_recommendation_reports")
    op.drop_table("discovery_dismissed_listings")
    op.drop_table("discovery_hidden_sources")
