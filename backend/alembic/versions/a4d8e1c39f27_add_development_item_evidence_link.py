"""Link R17 development items to their resulting evidence proposal (#201).

Revision ID: a4d8e1c39f27
Revises: f3a8c2d19e64
Create Date: 2026-07-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a4d8e1c39f27"
down_revision: Union[str, None] = "f3a8c2d19e64"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NULL until the item is marked completed, at which point it points to the
    # unconfirmed Evidence Profile proposal the completion produced (D-113).
    # Declining hard-deletes that proposal and clears this column back to NULL,
    # so no rejected trace is ever left in the profile.
    op.add_column(
        "development_items",
        sa.Column("evidence_item_id", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_development_items_evidence_item_id", "development_items", ["evidence_item_id"]
    )
    op.create_foreign_key(
        "fk_development_items_evidence_item_id",
        "development_items",
        "evidence_items",
        ["evidence_item_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_development_items_evidence_item_id", "development_items", type_="foreignkey"
    )
    op.drop_index("ix_development_items_evidence_item_id", table_name="development_items")
    op.drop_column("development_items", "evidence_item_id")
