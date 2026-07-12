"""add per-document CV quality model quota counter

Revision ID: b4f7c2d9e1a6
Revises: a9c4e7f2b6d1
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "b4f7c2d9e1a6"
down_revision: str | None = "a9c4e7f2b6d1"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "cv_documents",
        sa.Column("quality_model_runs", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("cv_documents", "quality_model_runs")
