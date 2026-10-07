"""Facts about a rendered CV PDF: stable bytes and the fonts it embeds."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Chromium stamps the moment of printing into the Info dictionary. The replacement has
# the same length, so no byte offset in the file moves and the rest is untouched.
_DATE_RE = re.compile(rb"/(CreationDate|ModDate) \(D:\d{14}[^)]*\)")
_FIXED_DATE = b"D:20000101000000+00'00'"


def normalize_pdf(pdf: bytes) -> bytes:
    """The same PDF with a fixed creation and modification date.

    Two prints of the same CV are then byte-identical, which keeps ETags, caches and
    the golden-image tests honest. Chromium's output has no document ID to fix.
    """
    return _DATE_RE.sub(lambda m: b"/" + m.group(1) + b" (" + _FIXED_DATE + b")", pdf)


@dataclass(frozen=True)
class EmbeddedFont:
    name: str  # as in the file, subset tag removed: "SourceSans3-Regular"
    type: str  # "TrueType", "Type1", "Type3", "CIDFontType2" ...
    embedded: bool


def embedded_fonts(pdf: bytes) -> list[EmbeddedFont]:
    """Every font the PDF's pages use (``pdffonts``-style), without the subset prefix."""
    import fitz

    fonts: dict[tuple[str, str], EmbeddedFont] = {}
    with fitz.open(stream=pdf, filetype="pdf") as document:
        for page in document:
            for xref, ext, kind, basefont, *_ in page.get_fonts(full=True):
                name = basefont.split("+", 1)[-1]
                # PyMuPDF reports the file extension ("n/a" when the font is not embedded).
                font_type = _type_of(document, xref, kind)
                fonts[(name, font_type)] = EmbeddedFont(name, font_type, ext != "n/a")
    return sorted(fonts.values(), key=lambda font: font.name)


def _type_of(document, xref: int, kind: str) -> str:
    return "Type3" if kind == "Type3" else kind


def font_problems(pdf: bytes, families: frozenset[str]) -> list[str]:
    """Why this PDF's fonts are not acceptable: Type 3, not embedded, or outside ``families``.

    ``families`` are the template's family names with spaces removed by comparison, e.g.
    ``{"Source Sans 3"}`` accepts ``SourceSans3-Semibold``. An empty list means clean.
    """
    allowed = {family.replace(" ", "") for family in families}
    problems: list[str] = []
    for font in embedded_fonts(pdf):
        if font.type == "Type3":
            problems.append(f"{font.name} is a Type 3 font")
        elif not font.embedded:
            problems.append(f"{font.name} is not embedded")
        elif font.name.split("-", 1)[0] not in allowed:
            problems.append(f"{font.name} is not one of the template's fonts")
    return problems
