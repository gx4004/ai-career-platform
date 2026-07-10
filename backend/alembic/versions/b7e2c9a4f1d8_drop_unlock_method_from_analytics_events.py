"""Drop unlock_method from analytics_events (R9 dormant ad-path removal)

Revision ID: b7e2c9a4f1d8
Revises: f5c1a2b3d4e6
Create Date: 2026-07-10

R9 #127 removes the dormant client ad/unlock path (D-051). The `unlock_method`
dimension existed only to record the removed ad/countdown unlock telemetry
(`ad_shown`/`ad_completed`/`ad_blocked`/`countdown_completed`), which never fired
in the thesis-demo runtime and whose event names are gone from both the frontend
and backend telemetry contracts. The column is therefore always NULL and is
dropped here so the durable store mirrors the reduced allowlist. Reversible: the
downgrade re-adds the nullable column (no data to restore, since it was never
populated).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7e2c9a4f1d8"
down_revision: Union[str, None] = "f5c1a2b3d4e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("analytics_events") as batch_op:
        batch_op.drop_column("unlock_method")


def downgrade() -> None:
    with op.batch_alter_table("analytics_events") as batch_op:
        batch_op.add_column(sa.Column("unlock_method", sa.String(), nullable=True))
