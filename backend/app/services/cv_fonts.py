"""Bundled font registry for CV rendering.

Two registries live here. ``TYPEFACES`` (below) is the one the HTML/Chromium templates use:
static TTFs (OFL, plus Apache 2.0 Roboto Slab and Ubuntu's UFL) with Cyrillic and Latin
Extended, one entry per family listing a real file for every weight and style that is
shipped. ``FONT_FAMILIES`` is the older ReportLab set (cover letters, DOCX default name).

The ReportLab fonts are static (non-variable) TTFs pulled from the official google/fonts OFL
directory so reportlab can address a true bold face per family. Registration is
idempotent and process-wide: reportlab's font table is a global, so repeated
calls (every render request) must be safe no-ops after the first.
"""

from __future__ import annotations

import functools
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

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

# -- the CV template typefaces ----------------------------------------------------------

Category = Literal["sans-serif", "serif", "monospace"]


@dataclass(frozen=True)
class Face:
    weight: int
    style: Literal["normal", "italic"]
    file: str  # relative to FONTS_DIR

    @property
    def path(self) -> Path:
        return FONTS_DIR / self.file


@dataclass(frozen=True)
class Typeface:
    id: str
    name: str  # the CSS family name, and the PDF font name once spaces are removed
    category: Category
    faces: tuple[Face, ...]
    cyrillic: bool = True
    license: str = "OFL"

    def face(self, weight: int, style: str = "normal") -> Face:
        """The shipped face nearest to ``weight`` in ``style`` (a real file, never synthesised).

        A style the family does not ship (italic of Manrope) falls back to its upright face.
        """
        pool = [f for f in self.faces if f.style == style] or [
            f for f in self.faces if f.style == "normal"
        ]
        return min(pool, key=lambda f: (abs(f.weight - weight), -f.weight))

    @property
    def pdf_prefix(self) -> str:
        return self.name.replace(" ", "")


def _faces(directory: str, prefix: str, spec: dict[tuple[int, str], str]) -> tuple[Face, ...]:
    return tuple(
        Face(weight, style, f"{directory}/{prefix}-{suffix}.ttf")
        for (weight, style), suffix in spec.items()
    )


_UPRIGHT = {(400, "normal"): "Regular", (500, "normal"): "Medium", (600, "normal"): "SemiBold", (700, "normal"): "Bold"}
_ITALIC_MINOR = {(400, "italic"): "Italic"}
_ITALIC = {**_ITALIC_MINOR, (700, "italic"): "BoldItalic"}


def _typeface(id, name, category, directory, prefix, spec, **extra) -> Typeface:
    return Typeface(id, name, category, _faces(directory, prefix, spec), **extra)


TYPEFACES: dict[str, Typeface] = {
    face.id: face
    for face in (
        _typeface("inter", "Inter", "sans-serif", "inter", "Inter", {**_UPRIGHT, **_ITALIC}),
        _typeface(
            "source-sans-3", "Source Sans 3", "sans-serif", "source-sans-3", "SourceSans3",
            {(300, "normal"): "Light", (400, "normal"): "Regular", (500, "normal"): "Medium",
             (600, "normal"): "Semibold", (700, "normal"): "Bold", (400, "italic"): "It",
             (700, "italic"): "BoldIt"},
        ),
        _typeface("ibm-plex-sans", "IBM Plex Sans", "sans-serif", "ibm-plex-sans", "IBMPlexSans", {**_UPRIGHT, **_ITALIC}),
        _typeface(
            "source-serif-4", "Source Serif 4", "serif", "source-serif-4", "SourceSerif4",
            {(400, "normal"): "Regular", (500, "normal"): "Medium", (600, "normal"): "Semibold",
             (700, "normal"): "Bold", (400, "italic"): "It", (700, "italic"): "BoldIt"},
        ),
        _typeface("lora", "Lora", "serif", "lora", "Lora", {**_UPRIGHT, **_ITALIC}),
        _typeface("eb-garamond", "EB Garamond", "serif", "eb-garamond", "EBGaramond", {**_UPRIGHT, **_ITALIC}),
        _typeface("ibm-plex-serif", "IBM Plex Serif", "serif", "ibm-plex-serif", "IBMPlexSerif", {**_UPRIGHT, **_ITALIC}),
        _typeface("ibm-plex-mono", "IBM Plex Mono", "monospace", "ibm-plex-mono", "IBMPlexMono", {**_UPRIGHT, **_ITALIC}),
        _typeface("cormorant-garamond", "Cormorant Garamond", "serif", "cormorant-garamond", "CormorantGaramond", {**_UPRIGHT, **_ITALIC_MINOR}),
        _typeface("nunito", "Nunito", "sans-serif", "nunito", "Nunito", {**_UPRIGHT, **_ITALIC_MINOR}),
        _typeface(
            "ubuntu", "Ubuntu", "sans-serif", "ubuntu", "Ubuntu",
            {(400, "normal"): "Regular", (500, "normal"): "Medium", (700, "normal"): "Bold",
             (400, "italic"): "Italic", (700, "italic"): "BoldItalic"},
            license="UFL",
        ),
        _typeface(
            "roboto-slab", "Roboto Slab", "serif", "roboto-slab", "RobotoSlab", _UPRIGHT,
            license="Apache-2.0",
        ),
        _typeface("raleway", "Raleway", "sans-serif", "raleway", "Raleway", {**_UPRIGHT, **_ITALIC_MINOR}),
        _typeface("fira-sans", "Fira Sans", "sans-serif", "fira-sans", "FiraSans", {**_UPRIGHT, **_ITALIC}),
        _typeface("manrope", "Manrope", "sans-serif", "manrope", "Manrope", _UPRIGHT),
    )
}
TYPEFACES_BY_NAME: dict[str, Typeface] = {face.name: face for face in TYPEFACES.values()}

# x-height as a share of the em, from each family's regular face (OS/2 sxHeight / unitsPerEm;
# tests/test_cv_fonts.py re-reads the files). At one point size EB Garamond's lower case is
# a fifth smaller than Source Sans 3's, so an override is scaled to match (below).
X_HEIGHTS: dict[str, float] = {
    "inter": 0.546, "source-sans-3": 0.486, "ibm-plex-sans": 0.516, "source-serif-4": 0.475,
    "lora": 0.500, "eb-garamond": 0.400, "ibm-plex-serif": 0.516, "ibm-plex-mono": 0.516,
    "cormorant-garamond": 0.386, "nunito": 0.484, "ubuntu": 0.520, "roboto-slab": 0.528,
    "raleway": 0.519, "fira-sans": 0.527, "manrope": 0.540,
}
MAX_SIZE_ADJUST = 1.2


def override_size_adjust(template_body: Typeface, override: Typeface) -> float:
    """The CSS ``size-adjust`` for an override's faces, so its x-height matches the template's
    own body face at the same point size (an EB Garamond override no longer looks small).

    Never below 1: the 9pt body floor (density clamp, fit to one page) is a real point size an
    ATS checker reads from the PDF, so a large-x-height override (Inter) keeps its own size.
    At most ``MAX_SIZE_ADJUST``, so capitals and line spacing stay in proportion.
    """
    if override.id == template_body.id:
        return 1.0
    ratio = X_HEIGHTS[template_body.id] / X_HEIGHTS[override.id]
    return round(min(MAX_SIZE_ADJUST, max(1.0, ratio)), 3)

# The curated typeface overrides offered in the Design panel (docs/cv-templates-spec.md 3.4).
OVERRIDE_FONT_IDS: tuple[str, ...] = (
    "inter", "source-sans-3", "ibm-plex-sans", "source-serif-4", "lora", "eb-garamond",
)
# Ids stored before the 16-template catalog map to the nearest curated family.
LEGACY_FONT_IDS: dict[str, str] = {
    "lato": "inter",
    "pt-sans": "source-sans-3",
    "pt-serif": "source-serif-4",
    "crimson-text": "lora",
    "ibm-plex-mono": "ibm-plex-sans",
}


def typeface_for_name(name: str) -> Typeface:
    return TYPEFACES_BY_NAME[name]


def heading_family(template_heading: str, override: Typeface | None) -> Typeface:
    """The heading family for a template whose own heading font is ``template_heading``.

    Rule: an override replaces the body family always, and the heading family only when
    the override and the template's heading font are the same category (serif or sans), so
    a serif-headed template keeps its serif headings under a sans override and vice versa.
    """
    own = typeface_for_name(template_heading)
    return override if override is not None and override.category == own.category else own


@functools.cache
def typeface_codepoints(face_file: str) -> frozenset[int]:
    import fitz

    return frozenset(fitz.Font(fontfile=str(FONTS_DIR / face_file)).valid_codepoints())


def typeface_covered(typeface: Typeface) -> frozenset[int]:
    """Codepoints every shipped face of the family draws (a gap in one weight is a gap)."""
    covered: frozenset[int] | None = None
    for face in typeface.faces:
        points = typeface_codepoints(face.file)
        covered = points if covered is None else covered & points
    return covered or frozenset()


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
    if font_id in TYPEFACES:
        return TYPEFACES[font_id].name
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
    the same bundled TTFs under the family name."""
    family = TYPEFACES.get(font_id) or FONT_FAMILIES[font_id]
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
