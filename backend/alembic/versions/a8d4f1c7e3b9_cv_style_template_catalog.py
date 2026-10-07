"""Stored CV styles move to the 16-template catalog

The five pre-catalog template ids in ``cv_documents.style`` are rewritten to their
catalog successors (ats-essential to classic, professional-editorial and minimal-serif
to executive, technical-portfolio to slate, modern-two-column to lagoon). The schema
also maps them when it parses, so this only keeps stored JSON canonical. The old default
typeface ``lato`` was persisted on every row whether or not the person chose it, so it
becomes null (the template's own pairing). ``cv_variants`` store sections only, so there
is no other style to rewrite.

Downgrade writes only values the pre-catalog ``CvStyle`` accepts: each catalog id maps to
the nearest of the five old templates, a null or new typeface becomes ``lato``, a null or
new accent becomes Ink (``#111827``), and ``page_size`` and ``fit_one_page`` are dropped.

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
# Reverse: the old template closest to each catalog id. Serif single-column designs go to
# minimal-serif, other single-column designs with a styled header to professional-editorial,
# banded or chip designs to technical-portfolio, sidebar and two-column designs to
# modern-two-column. Anything unknown becomes the plain ATS template.
CATALOG_TO_LEGACY = {
    "classic": "ats-essential",
    "scholar": "minimal-serif",
    "academic": "minimal-serif",
    "manuscript": "minimal-serif",
    "executive": "professional-editorial",
    "frame": "professional-editorial",
    "violet": "professional-editorial",
    "slate": "technical-portfolio",
    "grotesk": "technical-portfolio",
    "lagoon": "modern-two-column",
    "lilac": "modern-two-column",
    "meadow": "modern-two-column",
    "rail": "modern-two-column",
    "almanac": "modern-two-column",
    "panel": "modern-two-column",
    "ledger": "modern-two-column",
}
LEGACY_TEMPLATE_IDS = frozenset(LEGACY_TO_CATALOG)
LEGACY_FONT_IDS = frozenset({"lato", "pt-sans", "pt-serif", "crimson-text", "ibm-plex-mono"})
LEGACY_DEFAULT_FONT = "lato"
LEGACY_PALETTE = frozenset({"#111827", "#7C2D12", "#075985", "#166534", "#6D28D9", "#B91C1C", "#0F766E"})
LEGACY_DEFAULT_ACCENT = "#111827"
LEGACY_STYLE_KEYS = frozenset({"template_id", "font_id", "accent_color", "density", "ats_mode"})


def _upgraded(style: dict) -> dict | None:
    changed = dict(style)
    template = changed.get("template_id")
    if template in LEGACY_TO_CATALOG:
        changed["template_id"] = LEGACY_TO_CATALOG[template]
    if changed.get("font_id") == LEGACY_DEFAULT_FONT:
        changed["font_id"] = None
    return None if changed == style else changed


def _downgraded(style: dict) -> dict | None:
    # The old schema forbids extra keys (page_size, fit_one_page, anything newer).
    changed = {key: value for key, value in style.items() if key in LEGACY_STYLE_KEYS}
    if "template_id" in changed and changed["template_id"] not in LEGACY_TEMPLATE_IDS:
        changed["template_id"] = CATALOG_TO_LEGACY.get(changed["template_id"], "ats-essential")
    if "font_id" in changed and changed["font_id"] not in LEGACY_FONT_IDS:
        changed["font_id"] = LEGACY_DEFAULT_FONT
    if "accent_color" in changed:
        accent = changed["accent_color"]
        if not isinstance(accent, str) or accent.upper() not in LEGACY_PALETTE:
            changed["accent_color"] = LEGACY_DEFAULT_ACCENT
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
