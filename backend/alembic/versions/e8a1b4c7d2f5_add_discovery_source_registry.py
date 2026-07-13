"""add discovery source registry

Revision ID: e8a1b4c7d2f5
Revises: d7f2b5c9e3a1
"""

import sqlalchemy as sa

from alembic import op

revision = "e8a1b4c7d2f5"
down_revision = "d7f2b5c9e3a1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "discovery_sources",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("source_key", sa.String(100), nullable=False),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("source_family", sa.String(40), nullable=False),
        sa.Column("owner", sa.String(160), nullable=False),
        sa.Column("terms_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("terms_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("terms_reviewed_by", sa.String(160), nullable=True),
        sa.Column("allowed_behavior", sa.String(40), nullable=False),
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=False),
        sa.Column("attribution_rule", sa.Text(), nullable=False),
        sa.Column("retention_days", sa.Integer(), nullable=False),
        sa.Column("kill_switch", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "source_family IN ('licensed', 'employer_ats', 'public_career_page', 'user_provided')",
            name="ck_discovery_sources_family",
        ),
        sa.CheckConstraint(
            "terms_status IN ('pending', 'accepted', 'failed')",
            name="ck_discovery_sources_terms_status",
        ),
        sa.CheckConstraint(
            "allowed_behavior IN ('api', 'feed', 'ats_integration', 'public_page', 'user_url', 'paste')",
            name="ck_discovery_sources_allowed_behavior",
        ),
        sa.CheckConstraint(
            "rate_limit_per_minute > 0 AND rate_limit_per_minute <= 10000",
            name="ck_discovery_sources_rate_limit",
        ),
        sa.CheckConstraint(
            "retention_days > 0 AND retention_days <= 3650",
            name="ck_discovery_sources_retention_days",
        ),
        sa.CheckConstraint(
            "(terms_status = 'pending' AND terms_reviewed_at IS NULL AND terms_reviewed_by IS NULL) "
            "OR (terms_status IN ('accepted', 'failed') AND terms_reviewed_at IS NOT NULL "
            "AND terms_reviewed_by IS NOT NULL)",
            name="ck_discovery_sources_terms_review_record",
        ),
    )
    op.create_index(
        "ix_discovery_sources_source_key", "discovery_sources", ["source_key"], unique=True
    )


def downgrade():
    op.drop_table("discovery_sources")
