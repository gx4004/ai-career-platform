"""Add ATS-sourced listing fields to discovered_listings (#323).

Revision ID: b1d4f6a8c2e9
Revises: fa823ea0167b
Create Date: 2026-09-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b1d4f6a8c2e9"
down_revision: Union[str, None] = "fa823ea0167b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("discovered_listings", sa.Column("location", sa.String(200), nullable=True))
    op.add_column("discovered_listings", sa.Column("remote", sa.Boolean(), nullable=True))
    op.add_column(
        "discovered_listings",
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("discovered_listings", sa.Column("apply_url", sa.String(2048), nullable=True))
    op.add_column("discovered_listings", sa.Column("department", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("discovered_listings", "department")
    op.drop_column("discovered_listings", "apply_url")
    op.drop_column("discovered_listings", "posted_at")
    op.drop_column("discovered_listings", "remote")
    op.drop_column("discovered_listings", "location")
