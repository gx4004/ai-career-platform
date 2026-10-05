"""CV document header: the candidate's name, headline and contact details

Revision ID: b5d2e8a1c6f3
Revises: a7c3e9b1d4f2
Create Date: 2026-10-05 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5d2e8a1c6f3'
down_revision: Union[str, None] = 'a7c3e9b1d4f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('cv_documents', sa.Column('header', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('cv_documents', 'header')
