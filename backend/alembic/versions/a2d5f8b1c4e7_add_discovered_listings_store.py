"""add discovered listings store

Revision ID: a2d5f8b1c4e7
Revises: f1c4a7e2b9d6
"""

import sqlalchemy as sa

from alembic import op

revision = "a2d5f8b1c4e7"
down_revision = "f1c4a7e2b9d6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "discovered_listings",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("company", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_discovered_listings_content_sha256",
        "discovered_listings",
        ["content_sha256"],
        unique=True,
    )
    op.create_table(
        "discovered_listing_attributions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "listing_id",
            sa.String(),
            sa.ForeignKey("discovered_listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_id",
            sa.String(),
            sa.ForeignKey("discovery_sources.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("source_listing_key", sa.String(200), nullable=False),
        sa.Column("source_url", sa.String(2048), nullable=False),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "source_id",
            "source_listing_key",
            name="uq_discovered_listing_attribution_source_key",
        ),
    )
    op.create_index(
        "ix_discovered_listing_attributions_listing_id",
        "discovered_listing_attributions",
        ["listing_id"],
    )
    op.create_index(
        "ix_discovered_listing_attributions_source_id",
        "discovered_listing_attributions",
        ["source_id"],
    )


def downgrade():
    op.drop_table("discovered_listing_attributions")
    op.drop_table("discovered_listings")
