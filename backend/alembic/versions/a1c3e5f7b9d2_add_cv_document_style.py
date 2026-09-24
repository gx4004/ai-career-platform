"""Add nullable style JSON column to cv_documents (#322).

Revision ID: a1c3e5f7b9d2
Revises: c4a8e2f6b1d9
Create Date: 2026-09-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1c3e5f7b9d2"
down_revision: Union[str, None] = "c4a8e2f6b1d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("cv_documents", sa.Column("style", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("cv_documents", "style")
