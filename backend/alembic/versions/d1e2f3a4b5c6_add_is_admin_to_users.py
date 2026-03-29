"""Add is_admin to users

Revision ID: d1e2f3a4b5c6
Revises: c7f3e1a9d245
Create Date: 2026-03-29
"""
from alembic import op
import sqlalchemy as sa

revision = "d1e2f3a4b5c6"
down_revision = "c7f3e1a9d245"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=True, server_default=sa.text("0")))


def downgrade() -> None:
    op.drop_column("users", "is_admin")
