"""extend workspaces into campaigns

Revision ID: c2d4e6f8a1b3
Revises: a9c7e5d3b1f0
"""

from alembic import op
import sqlalchemy as sa

revision = "c2d4e6f8a1b3"
down_revision = "a9c7e5d3b1f0"
branch_labels = None
depends_on = None

CAMPAIGN_STATUS_CHECK = (
    "status IS NULL OR status IN ('planning', 'preparing', 'applied', "
    "'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn')"
)


def upgrade():
    op.add_column("workspaces", sa.Column("company", sa.String(length=200), nullable=True))
    op.add_column("workspaces", sa.Column("role", sa.String(length=200), nullable=True))
    op.add_column("workspaces", sa.Column("status", sa.String(length=32), nullable=True))
    op.add_column("workspaces", sa.Column("deadline", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint(
        "ck_workspaces_campaign_status", "workspaces", CAMPAIGN_STATUS_CHECK
    )
    op.create_table(
        "campaign_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_campaign_events_workspace_id"),
        "campaign_events",
        ["workspace_id"],
        unique=False,
    )


def downgrade():
    op.drop_index(op.f("ix_campaign_events_workspace_id"), table_name="campaign_events")
    op.drop_table("campaign_events")
    op.drop_constraint("ck_workspaces_campaign_status", "workspaces", type_="check")
    op.drop_column("workspaces", "deadline")
    op.drop_column("workspaces", "status")
    op.drop_column("workspaces", "role")
    op.drop_column("workspaces", "company")
