"""Drop the CV quality model quota counter (#363).

Revision ID: e7a2c4b6d8f0
Revises: d3e5f7a9b1c2
Create Date: 2026-09-28

CV quality is now fully deterministic (no LLM second opinion), so the
per-document model-run counter has no reader or writer.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7a2c4b6d8f0"
down_revision: Union[str, None] = "d3e5f7a9b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("cv_documents", "quality_model_runs")


def downgrade() -> None:
    op.add_column(
        "cv_documents",
        sa.Column("quality_model_runs", sa.Integer(), server_default="0", nullable=False),
    )
