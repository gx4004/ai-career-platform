"""add campaign canonical listings

Revision ID: e3a7c9d1f5b2
Revises: c2d4e6f8a1b3
"""

from alembic import op
import sqlalchemy as sa

revision = "e3a7c9d1f5b2"
down_revision = "c2d4e6f8a1b3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "campaign_listings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("company", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_campaign_listings_workspace_id"),
        "campaign_listings",
        ["workspace_id"],
        unique=False,
    )
    op.add_column("workspaces", sa.Column("current_listing_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_workspaces_current_listing_id_campaign_listings",
        "workspaces",
        "campaign_listings",
        ["current_listing_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint(
        "fk_workspaces_current_listing_id_campaign_listings",
        "workspaces",
        type_="foreignkey",
    )
    op.drop_column("workspaces", "current_listing_id")
    op.drop_index(op.f("ix_campaign_listings_workspace_id"), table_name="campaign_listings")
    op.drop_table("campaign_listings")
