"""Index discovered listings by newest first

Revision ID: a7c3e9b1d4f2
Revises: f5b8c3d1a7e2
Create Date: 2026-10-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c3e9b1d4f2'
down_revision: Union[str, None] = 'f5b8c3d1a7e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The "newest first" order every Discovery search and the recency filter use
    # (posted_at DESC NULLS LAST, created_at DESC); without it each page sorts the
    # whole table. SQLite cannot index NULLS LAST, so it gets the plain form.
    if op.get_bind().dialect.name == 'postgresql':
        columns = [sa.text('posted_at DESC NULLS LAST'), sa.text('created_at DESC')]
    else:
        columns = [sa.text('posted_at DESC'), sa.text('created_at DESC')]
    op.create_index('ix_discovered_listings_newest', 'discovered_listings', columns, unique=False)


def downgrade() -> None:
    op.drop_index('ix_discovered_listings_newest', table_name='discovered_listings')
