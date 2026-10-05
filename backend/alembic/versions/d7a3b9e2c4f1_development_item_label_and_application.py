"""Development items snapshot what to build and the application it came from

Revision ID: d7a3b9e2c4f1
Revises: c6e1a9d4b2f7
Create Date: 2026-10-05 21:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd7a3b9e2c4f1'
down_revision: str | None = 'c6e1a9d4b2f7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('development_items') as batch:
        batch.add_column(sa.Column('label', sa.String(), nullable=True))
        batch.add_column(sa.Column('workspace_id', sa.String(), nullable=True))
        batch.create_foreign_key(
            'fk_development_items_workspace_id',
            'workspaces',
            ['workspace_id'],
            ['id'],
            ondelete='SET NULL',
        )
        batch.create_index('ix_development_items_workspace_id', ['workspace_id'])
    # Existing rows whose gap still exists learn their application now; the label
    # is filled in by the service the next time the plan is read.
    op.execute(
        "UPDATE development_items SET workspace_id = ("
        "SELECT gap_classifications.workspace_id FROM gap_classifications "
        "WHERE gap_classifications.id = development_items.gap_classification_id) "
        "WHERE gap_classification_id IS NOT NULL"
    )


def downgrade() -> None:
    with op.batch_alter_table('development_items') as batch:
        batch.drop_index('ix_development_items_workspace_id')
        batch.drop_constraint('fk_development_items_workspace_id', type_='foreignkey')
        batch.drop_column('workspace_id')
        batch.drop_column('label')
