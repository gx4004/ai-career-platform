"""add revision chains

Revision ID: c7f3e1a9d245
Revises: 8a9d2f4b1c55
Create Date: 2026-03-29 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7f3e1a9d245"
down_revision: Union[str, None] = "8a9d2f4b1c55"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tool_runs", sa.Column("parent_run_id", sa.String(), nullable=True))
    op.add_column("tool_runs", sa.Column("feedback_text", sa.String(), nullable=True))
    op.create_index(
        op.f("ix_tool_runs_parent_run_id"),
        "tool_runs",
        ["parent_run_id"],
        unique=False,
    )
    # Note: FK constraint skipped for SQLite compatibility.
    # The model-level relationship handles referential integrity in application code.


def downgrade() -> None:
    op.drop_index(op.f("ix_tool_runs_parent_run_id"), table_name="tool_runs")
    op.drop_column("tool_runs", "feedback_text")
    op.drop_column("tool_runs", "parent_run_id")
