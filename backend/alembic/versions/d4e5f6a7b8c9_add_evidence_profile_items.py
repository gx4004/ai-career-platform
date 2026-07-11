"""Add user-owned Evidence Profile items.

Revision ID: d4e5f6a7b8c9
Revises: c1a2b3d4e5f6
Create Date: 2026-07-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c1a2b3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "evidence_items",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("provenance", sa.String(), nullable=False),
        sa.Column("confirmation_state", sa.String(), server_default="unconfirmed", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind IN ('experience', 'achievement', 'skill', 'education', 'project', 'certification', 'preference', 'interview-evidence')",
            name="ck_evidence_items_kind",
        ),
        sa.CheckConstraint(
            "provenance IN ('imported', 'inferred', 'user-entered')",
            name="ck_evidence_items_provenance",
        ),
        sa.CheckConstraint(
            "confirmation_state IN ('unconfirmed', 'confirmed', 'rejected')",
            name="ck_evidence_items_confirmation_state",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evidence_items_user_id", "evidence_items", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_evidence_items_user_id", table_name="evidence_items")
    op.drop_table("evidence_items")
