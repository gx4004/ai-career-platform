"""add workspaces

Revision ID: 8a9d2f4b1c55
Revises: d3bae0642369
Create Date: 2026-03-13 12:15:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8a9d2f4b1c55"
down_revision: Union[str, None] = "d3bae0642369"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("is_pinned", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_workspaces_user_id"), "workspaces", ["user_id"], unique=False
    )

    op.add_column("tool_runs", sa.Column("workspace_id", sa.String(), nullable=True))
    op.create_index(
        op.f("ix_tool_runs_workspace_id"),
        "tool_runs",
        ["workspace_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_tool_runs_workspace_id_workspaces",
        "tool_runs",
        "workspaces",
        ["workspace_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_tool_runs_workspace_id_workspaces", "tool_runs", type_="foreignkey"
    )
    op.drop_index(op.f("ix_tool_runs_workspace_id"), table_name="tool_runs")
    op.drop_column("tool_runs", "workspace_id")
    op.drop_index(op.f("ix_workspaces_user_id"), table_name="workspaces")
    op.drop_table("workspaces")
