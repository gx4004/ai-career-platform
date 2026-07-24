"""Add R17 development items (#199).

Revision ID: f3a8c2d19e64
Revises: e7c1a9f24b83
Create Date: 2026-07-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3a8c2d19e64"
down_revision: Union[str, None] = "e7c1a9f24b83"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "development_items",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("gap_classification_id", sa.String(), nullable=True),
        sa.Column("gap_kind", sa.String(), nullable=False),
        sa.Column("response_kind", sa.String(), nullable=False),
        sa.Column("state", sa.String(), server_default="planned", nullable=False),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("source_finding_id", sa.String(), nullable=True),
        sa.Column("timeline", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "gap_kind IN ('presentation_weakness', 'uncaptured_evidence', "
            "'evidence_not_yet_produced', 'missing_skill')",
            name="ck_development_items_gap_kind",
        ),
        sa.CheckConstraint(
            "response_kind IN ('reword', 'capture_evidence', 'produce_evidence', 'learn_skill')",
            name="ck_development_items_response_kind",
        ),
        sa.CheckConstraint(
            "state IN ('planned', 'in_progress', 'completed')",
            name="ck_development_items_state",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["gap_classification_id"], ["gap_classifications.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_development_items_user_id", "development_items", ["user_id"])
    op.create_index(
        "ix_development_items_gap_classification_id",
        "development_items",
        ["gap_classification_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_development_items_gap_classification_id", table_name="development_items")
    op.drop_index("ix_development_items_user_id", table_name="development_items")
    op.drop_table("development_items")
