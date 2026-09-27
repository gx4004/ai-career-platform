"""CV Studio: remove the unused ``section_order`` key from saved CV styles (#364).

Revision ID: d2b6f4a8c0e3
Revises: b6d1f3a8c5e9
Create Date: 2026-09-28

``CvStyle.section_order`` had no reader and is gone from the schema, which
forbids unknown keys, so every saved ``cv_documents.style`` that carried it
(always ``null`` from the UI) is rewritten without it. Downgrade is a no-op:
the older schema treats the key as optional.
"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d2b6f4a8c0e3"
down_revision: Union[str, None] = "b6d1f3a8c5e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    documents = sa.table("cv_documents", sa.column("id", sa.String), sa.column("style", sa.JSON))
    rows = connection.execute(
        sa.select(documents.c.id, documents.c.style).where(documents.c.style.is_not(None))
    ).all()
    for document_id, style in rows:
        if isinstance(style, str):
            style = json.loads(style)
        if isinstance(style, dict) and "section_order" in style:
            style.pop("section_order")
            connection.execute(
                documents.update().where(documents.c.id == document_id).values(style=style)
            )


def downgrade() -> None:
    pass
