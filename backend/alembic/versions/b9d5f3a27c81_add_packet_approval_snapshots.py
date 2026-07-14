"""add packet approval snapshots

Revision ID: b9d5f3a27c81
Revises: b8c4e2f19d63
"""

import sqlalchemy as sa

from alembic import op

revision = "b9d5f3a27c81"
down_revision = "b8c4e2f19d63"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "packet_approval_snapshots",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "packet_id",
            sa.String(),
            sa.ForeignKey("application_packets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "campaign_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("listing_id", sa.String(), nullable=True),
        sa.Column("role_key", sa.String(512), nullable=False),
        sa.Column("destination_url", sa.String(2048), nullable=True),
        sa.Column("content_json", sa.Text(), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("packet_id", name="uq_packet_approval_snapshot_packet"),
    )
    op.create_index(
        "ix_packet_approval_snapshots_user_id", "packet_approval_snapshots", ["user_id"]
    )
    op.create_index(
        "ix_packet_approval_snapshots_packet_id", "packet_approval_snapshots", ["packet_id"]
    )
    op.create_index(
        "ix_packet_approval_snapshots_campaign_id", "packet_approval_snapshots", ["campaign_id"]
    )
    op.create_index(
        "ix_packet_approval_snapshots_role_key", "packet_approval_snapshots", ["role_key"]
    )


def downgrade():
    op.drop_table("packet_approval_snapshots")
