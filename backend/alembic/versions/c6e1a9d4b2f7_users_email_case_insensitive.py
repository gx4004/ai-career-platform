"""Emails are case-insensitive: lower-case stored addresses, one account per address

Revision ID: c6e1a9d4b2f7
Revises: b5d2e8a1c6f3
Create Date: 2026-10-05 18:00:00.000000

"""
from collections.abc import Sequence

import logging

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c6e1a9d4b2f7'
down_revision: str | None = 'b5d2e8a1c6f3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX = 'uq_users_email_lower'


def upgrade() -> None:
    bind = op.get_bind()
    duplicated = (
        "SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*) > 1"
    )
    # Addresses that collide once lower-cased are two real accounts; merging
    # them is a human decision, so they are left untouched.
    bind.execute(sa.text(
        "UPDATE users SET email = lower(email) "
        f"WHERE email <> lower(email) AND lower(email) NOT IN ({duplicated})"
    ))
    collisions = bind.execute(sa.text(
        f"SELECT count(*) FROM ({duplicated}) AS d"
    )).scalar()
    if collisions:
        logging.getLogger("alembic.runtime.migration").warning(
            "%s email address(es) collide when lower-cased; skipped unique index %s. "
            "Merge those accounts by hand, then create the index.",
            collisions, INDEX,
        )
    else:
        op.create_index(INDEX, 'users', [sa.text('lower(email)')], unique=True)


def downgrade() -> None:
    # The lower-casing itself is not reversible (the original capitals are gone).
    op.execute(sa.text(f'DROP INDEX IF EXISTS {INDEX}'))
