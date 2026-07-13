"""add campaign submission snapshots

Revision ID: d7f2b5c9e3a1
Revises: c6e1a4b8d2f7
"""

from alembic import op
import sqlalchemy as sa

revision = "d7f2b5c9e3a1"
down_revision = "c6e1a4b8d2f7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "campaign_submission_snapshots",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content_json", sa.Text(), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", name="uq_campaign_submission_snapshot_workspace"),
    )
    op.create_index(
        "ix_campaign_submission_snapshots_workspace_id",
        "campaign_submission_snapshots",
        ["workspace_id"],
    )


def downgrade():
    op.drop_table("campaign_submission_snapshots")
