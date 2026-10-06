"""Users record who last changed their admin role, and when

The admin users list shows an audit line for role changes. The acting admin is a
reference (SET NULL when that account is deleted), not a copied address.

Revision ID: f3b8d1c6a9e2
Revises: e9c4b7a2d5f8
Create Date: 2026-10-06 18:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f3b8d1c6a9e2'
down_revision: str | None = 'e9c4b7a2d5f8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('users') as batch:
        batch.add_column(sa.Column('role_changed_at', sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column('role_changed_by_id', sa.String(), nullable=True))
        batch.create_foreign_key(
            'fk_users_role_changed_by_id',
            'users',
            ['role_changed_by_id'],
            ['id'],
            ondelete='SET NULL',
        )


def downgrade() -> None:
    with op.batch_alter_table('users') as batch:
        batch.drop_constraint('fk_users_role_changed_by_id', type_='foreignkey')
        batch.drop_column('role_changed_by_id')
        batch.drop_column('role_changed_at')
