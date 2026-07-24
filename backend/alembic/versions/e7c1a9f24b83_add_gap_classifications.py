"""Add R17 gap classifications (#198).

Revision ID: e7c1a9f24b83
Revises: c3f7a9b2d4e1
Create Date: 2026-07-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7c1a9f24b83"
down_revision: Union[str, None] = "c3f7a9b2d4e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gap_classifications",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("finding_id", sa.String(), nullable=False),
        sa.Column("source_category", sa.String(), nullable=False),
        sa.Column("gap_kind", sa.String(), nullable=False),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("locations", sa.JSON(), nullable=False),
        sa.Column("cited_trace", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "gap_kind IN ('presentation_weakness', 'uncaptured_evidence', "
            "'evidence_not_yet_produced', 'missing_skill')",
            name="ck_gap_classifications_gap_kind",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id", "finding_id", name="uq_gap_classifications_workspace_finding"
        ),
    )
    op.create_index(
        "ix_gap_classifications_user_id", "gap_classifications", ["user_id"]
    )
    op.create_index(
        "ix_gap_classifications_workspace_id", "gap_classifications", ["workspace_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_gap_classifications_workspace_id", table_name="gap_classifications")
    op.drop_index("ix_gap_classifications_user_id", table_name="gap_classifications")
    op.drop_table("gap_classifications")
