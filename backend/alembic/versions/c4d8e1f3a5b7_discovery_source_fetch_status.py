"""Discovery: per-source fetch status; drop hidden sources and reports (#369).

Revision ID: c4d8e1f3a5b7
Revises: e7a2c4b6d8f0
Create Date: 2026-09-28

Hide-a-company and report-a-listing had no UI caller, so their tables go. The
per-family source health view is replaced by three columns on
``discovery_sources`` that each ingestion run stamps.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4d8e1f3a5b7"
down_revision: Union[str, None] = "e7a2c4b6d8f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "discovery_sources",
        sa.Column("last_fetched_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "discovery_sources", sa.Column("last_outcome", sa.String(200), nullable=True)
    )
    op.add_column(
        "discovery_sources", sa.Column("listing_count", sa.Integer(), nullable=True)
    )
    op.drop_table("discovery_recommendation_reports")
    op.drop_table("discovery_hidden_sources")


def downgrade() -> None:
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
    op.drop_column("discovery_sources", "listing_count")
    op.drop_column("discovery_sources", "last_outcome")
    op.drop_column("discovery_sources", "last_fetched_at")
