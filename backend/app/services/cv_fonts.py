"""Bundled OFL font registration for CV rendering.

Fonts are static (non-variable) TTFs pulled from the official google/fonts OFL
directory so reportlab can address a true bold face per family. Registration is
idempotent and process-wide: reportlab's font table is a global, so repeated
calls (every render request) must be safe no-ops after the first.
"""

from __future__ import annotations

import functools
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONTS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"


@dataclass(frozen=True)
class FontFamily:
    id: str
    name: str
    category: str
    dir_name: str
    regular_file: str
    bold_file: str
    pdf_name: str


FONT_FAMILIES: dict[str, FontFamily] = {
    "lato": FontFamily(
        "lato", "Lato", "sans-serif", "lato", "Lato-Regular.ttf", "Lato-Bold.ttf", "Lato"
    ),
    "pt-sans": FontFamily(
        "pt-sans",
        "PT Sans",
        "sans-serif",
        "pt-sans",
        "PTSans-Regular.ttf",
        "PTSans-Bold.ttf",
        "PTSans",
    ),
    "pt-serif": FontFamily(
        "pt-serif",
        "PT Serif",
        "serif",
        "pt-serif",
        "PTSerif-Regular.ttf",
        "PTSerif-Bold.ttf",
        "PTSerif",
    ),
    "crimson-text": FontFamily(
        "crimson-text",
        "Crimson Text",
        "serif",
        "crimson-text",
        "CrimsonText-Regular.ttf",
        "CrimsonText-Bold.ttf",
        "CrimsonText",
    ),
    "ibm-plex-mono": FontFamily(
        "ibm-plex-mono",
        "IBM Plex Mono",
        "monospace",
        "ibm-plex-mono",
        "IBMPlexMono-Regular.ttf",
        "IBMPlexMono-Bold.ttf",
        "IBMPlexMono",
    ),
}

_registered = False


def register_fonts() -> None:
    global _registered
    if _registered:
        return
    for family in FONT_FAMILIES.values():
        base_dir = FONTS_DIR / family.dir_name
        pdfmetrics.registerFont(TTFont(family.pdf_name, str(base_dir / family.regular_file)))
        pdfmetrics.registerFont(
            TTFont(f"{family.pdf_name}-Bold", str(base_dir / family.bold_file))
        )
        pdfmetrics.registerFontFamily(
            family.pdf_name, normal=family.pdf_name, bold=f"{family.pdf_name}-Bold"
        )
    _registered = True


def docx_font_name(font_id: str) -> str:
    return FONT_FAMILIES[font_id].name


def pdf_font_names(font_id: str) -> tuple[str, str]:
    register_fonts()
    family = FONT_FAMILIES[font_id]
    return family.pdf_name, f"{family.pdf_name}-Bold"


_CSS_FALLBACKS = {
    "sans-serif": "'Helvetica Neue', Arial, sans-serif",
    "serif": "Georgia, 'Times New Roman', serif",
    "monospace": "'SFMono-Regular', Menlo, monospace",
}


def css_family(font_id: str) -> str:
    """CSS font stack for the live preview; the frontend's @font-face rules load
    the same bundled TTFs under ``family.name``."""
    family = FONT_FAMILIES[font_id]
    return f"'{family.name}', {_CSS_FALLBACKS[family.category]}"


def needs_glyph(character: str) -> bool:
    """Whether ``character`` is something a font has to draw (not whitespace, a
    control or format character such as a joiner, or a variation selector)."""
    if character.isspace() or "\ufe00" <= character <= "\ufe0f":
        return False
    return unicodedata.category(character) not in ("Cc", "Cf")


@functools.cache
def _covered(font_id: str) -> frozenset[int]:
    register_fonts()
    family = FONT_FAMILIES[font_id]
    regular = pdfmetrics.getFont(family.pdf_name).face.charToGlyph
    bold = pdfmetrics.getFont(f"{family.pdf_name}-Bold").face.charToGlyph
    return frozenset(regular) & frozenset(bold)


def missing_characters(font_id: str, text: str) -> list[str]:
    """The characters in ``text`` that the bundled ``font_id`` cannot draw, once each."""
    covered = _covered(font_id)
    return list(
        dict.fromkeys(c for c in text if needs_glyph(c) and ord(c) not in covered)
    )


def covering_font(font_id: str, text: str) -> tuple[str, list[str]]:
    """The bundled font to draw ``text`` with, and what even it cannot draw.

    The chosen font is kept when it covers every letter, so a stray symbol (a check
    mark, an arrow) is reported but never changes the typeface of the whole CV.
    When it lacks letters of a script, the family (same category first, then the
    rest) that draws the most of the text wins, so a Cyrillic name in a Latin-only
    serif still renders instead of leaving gaps.
    """
    chosen = FONT_FAMILIES[font_id]
    own_missing = missing_characters(font_id, text)
    if not any(unicodedata.category(c)[0] in "LM" for c in own_missing):
        return font_id, own_missing
    candidates = [font_id] + sorted(
        (other for other in FONT_FAMILIES if other != font_id),
        key=lambda other: FONT_FAMILIES[other].category != chosen.category,
    )
    best_id, best_missing = font_id, own_missing
    for candidate in candidates[1:]:
        if not best_missing:
            break
        missing = missing_characters(candidate, text)
        if len(missing) < len(best_missing):
            best_id, best_missing = candidate, missing
    return best_id, best_missing


def not_in_winansi(text: str) -> list[str]:
    """Characters outside the Windows-1252 set the PDF base-14 fonts (Helvetica)
    can encode, once each."""
    missing = []
    for character in dict.fromkeys(text):
        if not needs_glyph(character):
            continue
        try:
            character.encode("cp1252")
        except UnicodeEncodeError:
            missing.append(character)
    return missing
