"""add discovery listing id to workspaces for adoption idempotency

Revision ID: c3f7a9b2d4e1
Revises: b8c4e2f19d63

Dedup is deliberately NOT retroactive. ``discovery_listing_id`` is NULL for
every row written before this migration, and the unique constraint binds only
non-null values, so a campaign adopted before deploy will not dedup against a
later re-adoption of the same listing.

No backfill is applied, for two reasons:

  * There is nothing to backfill. Discovery (R14) has never been deployed — it
    does not exist on the promotion branches — so no deployed database holds a
    discovery-adopted campaign predating this column.
  * The only available join key is ``campaign_listings.source_url`` against
    ``discovered_listing_attributions.source_url``, which cannot distinguish a
    manually-created campaign that happens to reference the same URL. A false
    match would bind that campaign to a listing and then permanently block the
    owner from genuinely adopting it, since the unique constraint would refuse
    the second row. Guessing wrong is worse than not guessing.

If discovery is ever deployed and this column later needs populating, derive it
from recorded adoption events rather than URL equality.
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
