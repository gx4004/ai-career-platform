"""add ON DELETE cascade/set-null to FKs

Revision ID: cdbf7ad794b6
Revises: a1b2c3d4e5f6
Create Date: 2026-04-17

Without ON DELETE rules, deleting a user fails with a FK violation (defense
for any future GDPR/account-delete endpoint), and deleting a workspace that
still has runs fails even though runs can live without a workspace.

- tool_runs.user_id       -> ON DELETE CASCADE   (delete user => delete runs)
- tool_runs.workspace_id  -> ON DELETE SET NULL  (delete workspace => orphan runs)
- workspaces.user_id      -> ON DELETE CASCADE   (delete user => delete workspaces)

Uses batch_alter_table so SQLite (dev/test) regenerates the table; Postgres
(prod) drops/recreates the FK constraint in place.

Note: tool_runs.parent_run_id has no DB-level FK (see c7f3e1a9d245), so no
cascade to add there. Application-level logic handles that relationship.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "cdbf7ad794b6"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Postgres auto-named the unnamed constraints as "<table>_<col>_fkey".
FK_TOOL_RUNS_USER = "tool_runs_user_id_fkey"
FK_TOOL_RUNS_WORKSPACE = "fk_tool_runs_workspace_id_workspaces"
FK_WORKSPACES_USER = "workspaces_user_id_fkey"


def upgrade() -> None:
    with op.batch_alter_table("tool_runs") as batch:
        batch.drop_constraint(FK_TOOL_RUNS_USER, type_="foreignkey")
        batch.create_foreign_key(
            FK_TOOL_RUNS_USER,
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.drop_constraint(FK_TOOL_RUNS_WORKSPACE, type_="foreignkey")
        batch.create_foreign_key(
            FK_TOOL_RUNS_WORKSPACE,
            "workspaces",
            ["workspace_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("workspaces") as batch:
        batch.drop_constraint(FK_WORKSPACES_USER, type_="foreignkey")
        batch.create_foreign_key(
            FK_WORKSPACES_USER,
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    with op.batch_alter_table("workspaces") as batch:
        batch.drop_constraint(FK_WORKSPACES_USER, type_="foreignkey")
        batch.create_foreign_key(
            FK_WORKSPACES_USER,
            "users",
            ["user_id"],
            ["id"],
        )

    with op.batch_alter_table("tool_runs") as batch:
        batch.drop_constraint(FK_TOOL_RUNS_WORKSPACE, type_="foreignkey")
        batch.create_foreign_key(
            FK_TOOL_RUNS_WORKSPACE,
            "workspaces",
            ["workspace_id"],
            ["id"],
        )
        batch.drop_constraint(FK_TOOL_RUNS_USER, type_="foreignkey")
        batch.create_foreign_key(
            FK_TOOL_RUNS_USER,
            "users",
            ["user_id"],
            ["id"],
        )
