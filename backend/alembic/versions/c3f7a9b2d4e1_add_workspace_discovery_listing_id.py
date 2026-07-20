"""add discovery listing id to workspaces for adoption idempotency

Revision ID: c3f7a9b2d4e1
Revises: b8c4e2f19d63
"""

import sqlalchemy as sa

from alembic import op

revision = "c3f7a9b2d4e1"
down_revision = "b8c4e2f19d63"
branch_labels = None
depends_on = None


def upgrade():
    # Records which discovery listing a campaign was adopted from, so
    # adopt_recommendation can detect and reuse an existing campaign instead of
    # creating a duplicate (R14 #176 dedup gap). NULL for manually-created
    # campaigns (never adopted from discovery) or ones that predate this column;
    # a unique constraint enforces at most one campaign per (owner, listing) among
    # non-null values — standard NULL semantics let manually-created campaigns
    # coexist freely.
    op.add_column(
        "workspaces",
        sa.Column("discovery_listing_id", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_workspaces_discovery_listing_id", "workspaces", ["discovery_listing_id"]
    )
    op.create_unique_constraint(
        "uq_workspace_owner_discovery_listing",
        "workspaces",
        ["user_id", "discovery_listing_id"],
    )


def downgrade():
    op.drop_constraint(
        "uq_workspace_owner_discovery_listing", "workspaces", type_="unique"
    )
    op.drop_index("ix_workspaces_discovery_listing_id", table_name="workspaces")
    op.drop_column("workspaces", "discovery_listing_id")
