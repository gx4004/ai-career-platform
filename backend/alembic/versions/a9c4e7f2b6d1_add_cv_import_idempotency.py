"""add owner-scoped CV import idempotency key

Revision ID: a9c4e7f2b6d1
Revises: f8b5d3a2c1e0
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9c4e7f2b6d1"
down_revision: Union[str, None] = "f8b5d3a2c1e0"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column(
        "cv_documents", sa.Column("source_import_id", sa.String(length=36), nullable=True)
    )
    op.create_unique_constraint(
        "uq_cv_documents_user_import", "cv_documents", ["user_id", "source_import_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_cv_documents_user_import", "cv_documents", type_="unique")
    op.drop_column("cv_documents", "source_import_id")
