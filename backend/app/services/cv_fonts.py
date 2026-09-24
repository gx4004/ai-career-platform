"""Bundled OFL font registration for CV rendering.

Fonts are static (non-variable) TTFs pulled from the official google/fonts OFL
directory so reportlab can address a true bold face per family. Registration is
idempotent and process-wide: reportlab's font table is a global, so repeated
calls (every render request) must be safe no-ops after the first.
"""

from __future__ import annotations

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
