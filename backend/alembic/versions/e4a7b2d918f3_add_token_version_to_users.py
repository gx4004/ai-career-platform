"""Add token_version to users

Revision ID: e4a7b2d918f3
Revises: cdbf7ad794b6
Create Date: 2026-04-17

Refresh tokens now embed the user's token_version in a `tv` claim; the
refresh endpoint rejects tokens whose tv doesn't match the row. Bumping
token_version on password reset (and any future logout-everywhere flow)
invalidates every outstanding refresh token for that user in one write.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4a7b2d918f3"
down_revision: Union[str, None] = "cdbf7ad794b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
