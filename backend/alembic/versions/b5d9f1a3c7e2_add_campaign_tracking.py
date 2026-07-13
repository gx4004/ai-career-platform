"""add campaign tracking

Revision ID: b5d9f1a3c7e2
Revises: a4c8e2f6b1d3
"""

from alembic import op
import sqlalchemy as sa

revision = "b5d9f1a3c7e2"
down_revision = "a4c8e2f6b1d3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "campaign_tasks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True)),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_campaign_tasks_workspace_id", "campaign_tasks", ["workspace_id"])
    op.create_table(
        "campaign_notes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_campaign_notes_workspace_id", "campaign_notes", ["workspace_id"])
    op.create_table(
        "campaign_contacts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("role", sa.String(200)),
        sa.Column("channel", sa.String(200)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_campaign_contacts_workspace_id", "campaign_contacts", ["workspace_id"])


def downgrade():
    op.drop_table("campaign_contacts")
    op.drop_table("campaign_notes")
    op.drop_table("campaign_tasks")
