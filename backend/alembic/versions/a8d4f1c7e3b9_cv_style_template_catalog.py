"""Stored CV styles move to the 16-template catalog

The five pre-catalog template ids in ``cv_documents.style`` are rewritten to their
catalog successors (ats-essential to classic, professional-editorial and minimal-serif
to executive, technical-portfolio to slate, modern-two-column to lagoon). The schema
also maps them when it parses, so this only keeps stored JSON canonical. ``cv_variants``
store sections only, so there is no other style to rewrite.

Downgrade reverses the mapping and drops the style keys older code rejects
(``page_size``, ``fit_one_page``, a null ``font_id``).

Revision ID: a8d4f1c7e3b9
Revises: f3b8d1c6a9e2
Create Date: 2026-10-07 12:00:00.000000

"""
import json
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a8d4f1c7e3b9'
down_revision: str | None = 'f3b8d1c6a9e2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LEGACY_TO_CATALOG = {
    "ats-essential": "classic",
    "professional-editorial": "executive",
    "minimal-serif": "executive",
    "technical-portfolio": "slate",
    "modern-two-column": "lagoon",
}
# Reverse: the old template closest to each catalog id (anything else was single-column or
# sidebar-less, so the plain ATS template).
CATALOG_TO_LEGACY = {
    "classic": "ats-essential",
    "executive": "professional-editorial",
    "slate": "technical-portfolio",
    "lagoon": "modern-two-column",
}
NEW_STYLE_KEYS = ("page_size", "fit_one_page")


def _upgraded(style: dict) -> dict | None:
    template = style.get("template_id")
    if template not in LEGACY_TO_CATALOG:
        return None
    return {**style, "template_id": LEGACY_TO_CATALOG[template]}


def _downgraded(style: dict) -> dict | None:
    changed = {key: value for key, value in style.items() if key not in NEW_STYLE_KEYS}
    if "template_id" in changed:
        changed["template_id"] = CATALOG_TO_LEGACY.get(changed["template_id"], "ats-essential")
    if changed.get("font_id", "") is None:
        del changed["font_id"]
    return None if changed == style else changed


def _rewrite(rewrite) -> None:
    bind = op.get_bind()
    table = sa.table("cv_documents", sa.column("id", sa.String), sa.column("style", sa.JSON))
    for row_id, style in bind.execute(sa.select(table.c.id, table.c.style)).all():
        if isinstance(style, str):  # a JSON column read back as text
            style = json.loads(style)
        if not isinstance(style, dict):
            continue
        changed = rewrite(style)
        if changed is not None:
            bind.execute(sa.update(table).where(table.c.id == row_id).values(style=changed))


def upgrade() -> None:
    _rewrite(_upgraded)


def downgrade() -> None:
    _rewrite(_downgraded)
