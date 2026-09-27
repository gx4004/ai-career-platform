"""Profile has one review surface: drop `rejected` and write-only dev fields (#372).

Revision ID: b6d1f3a8c5e9
Revises: e7a2c4b6d8f0
Create Date: 2026-09-28

Rejecting a suggestion now deletes it, so the `rejected` confirmation state goes
(existing rejected rows are deleted, clearing any development link first). The
development item's `timeline` and `source_finding_id` had no reader besides the
export and are dropped.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b6d1f3a8c5e9"
down_revision: Union[str, None] = "e7a2c4b6d8f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE development_items SET evidence_item_id = NULL WHERE evidence_item_id IN "
        "(SELECT id FROM evidence_items WHERE confirmation_state = 'rejected')"
    )
    op.execute("DELETE FROM evidence_items WHERE confirmation_state = 'rejected'")
    op.drop_constraint("ck_evidence_items_confirmation_state", "evidence_items", type_="check")
    op.create_check_constraint(
        "ck_evidence_items_confirmation_state",
        "evidence_items",
        "confirmation_state IN ('unconfirmed', 'confirmed')",
    )
    op.drop_column("development_items", "timeline")
    op.drop_column("development_items", "source_finding_id")


def downgrade() -> None:
    op.add_column("development_items", sa.Column("source_finding_id", sa.String(), nullable=True))
    op.add_column(
        "development_items",
        sa.Column("timeline", sa.JSON(), server_default="[]", nullable=False),
    )
    op.alter_column("development_items", "timeline", server_default=None)
    op.drop_constraint("ck_evidence_items_confirmation_state", "evidence_items", type_="check")
    op.create_check_constraint(
        "ck_evidence_items_confirmation_state",
        "evidence_items",
        "confirmation_state IN ('unconfirmed', 'confirmed', 'rejected')",
    )
