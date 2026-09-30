"""Add discovery deep match links (#414)

Revision ID: f4b8c1d2a7e9
Revises: c2a0f1e5d7b3
Create Date: 2026-09-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4b8c1d2a7e9'
down_revision: Union[str, None] = 'c2a0f1e5d7b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('discovery_deep_match_links',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('listing_id', sa.String(), nullable=False),
    sa.Column('tool_run_id', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['listing_id'], ['discovered_listings.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tool_run_id'], ['tool_runs.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'listing_id', name='uq_discovery_deep_match_owner_listing')
    )
    op.create_index(op.f('ix_discovery_deep_match_links_listing_id'), 'discovery_deep_match_links', ['listing_id'], unique=False)
    op.create_index(op.f('ix_discovery_deep_match_links_tool_run_id'), 'discovery_deep_match_links', ['tool_run_id'], unique=False)
    op.create_index(op.f('ix_discovery_deep_match_links_user_id'), 'discovery_deep_match_links', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_discovery_deep_match_links_user_id'), table_name='discovery_deep_match_links')
    op.drop_index(op.f('ix_discovery_deep_match_links_tool_run_id'), table_name='discovery_deep_match_links')
    op.drop_index(op.f('ix_discovery_deep_match_links_listing_id'), table_name='discovery_deep_match_links')
    op.drop_table('discovery_deep_match_links')
