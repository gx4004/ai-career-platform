"""Application outcomes (#415): no_reply status and status_changed_at

Revision ID: f5b8c3d1a7e2
Revises: c2a0f1e5d7b3
Create Date: 2026-09-30 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5b8c3d1a7e2'
down_revision: Union[str, None] = 'c2a0f1e5d7b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_STATUSES = "'saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'"
NEW_STATUSES = "'saved', 'applied', 'no_reply', 'interviewing', 'offer', 'rejected', 'withdrawn'"


def upgrade() -> None:
    op.add_column('workspaces', sa.Column('status_changed_at', sa.DateTime(timezone=True), nullable=True))
    # Best available history: the day it was applied, else its last update.
    op.execute("UPDATE workspaces SET status_changed_at = COALESCE(applied_at, updated_at, created_at)")
    op.alter_column('workspaces', 'status_changed_at', nullable=False)
    op.drop_constraint('ck_workspaces_application_status', 'workspaces', type_='check')
    op.create_check_constraint(
        'ck_workspaces_application_status', 'workspaces',
        f"status IS NULL OR status IN ({NEW_STATUSES})",
    )


def downgrade() -> None:
    op.execute("UPDATE workspaces SET status = 'applied' WHERE status = 'no_reply'")
    op.drop_constraint('ck_workspaces_application_status', 'workspaces', type_='check')
    op.create_check_constraint(
        'ck_workspaces_application_status', 'workspaces',
        f"status IS NULL OR status IN ({OLD_STATUSES})",
    )
    op.drop_column('workspaces', 'status_changed_at')
