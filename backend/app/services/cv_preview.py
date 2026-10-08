"""Live preview of an unsaved CV draft: page images and section rectangles.

The draft is printed by the same Chromium path as the exported PDF (``render_cv_html`` then
``print_pdf``), so preview page 1 is the PDF's page 1. PyMuPDF rasterises each page to WebP.

Section rectangles come from the print layout itself, so they stay right across page
breaks: just before printing, ``MEASURE_SCRIPT`` appends two invisible, absolutely
positioned links to every ``[data-section-id]`` element (a full-size one and a 1px one on
its bottom edge). Chromium writes each link into the PDF as a link annotation with the
rectangle of every page fragment it covers. The full-size link gives the section's
rectangle on each page it touches; on the last page Chromium extends it to the page
bottom, so the 1px bottom link supplies the true end. Neither draws a pixel.
"""

from __future__ import annotations

import base64
import io
from collections.abc import Callable
from dataclasses import dataclass, field
from urllib.parse import unquote

import fitz
from PIL import Image

from app.schemas.cv_documents import CvRenderModel
from app.services.cv_chromium import print_pdf
from app.services.cv_fit import PREVIEW_MAX_RENDERS, FitResult, fit_cached, wants_fit
from app.services.cv_html import html_template_id, load_manifest, render_cv_html
from app.services.cv_length import LengthAdvice, last_page_fill, length_advice, years_of_experience

PREVIEW_DPI = 110
# A client may ask for page images of a given pixel width (its display width times its pixel ratio), so a phone is
# not sent desktop-sized pages; within these bounds.
MIN_PREVIEW_WIDTH = 240
MAX_PREVIEW_WIDTH = 1600
MAX_PREVIEW_PAGES = 8
WEBP_QUALITY = 80
# Pages drawn for a high-density screen (over 1000 px wide) have pixels to spare: a lower quality
# looks the same at 2x and roughly halves the bytes.
HIGH_DENSITY_WIDTH = 1000
HIGH_DENSITY_QUALITY = 60

_PROBE_HOST = "https://cv-section.invalid/"

MEASURE_SCRIPT = (
    "() => { for (const el of document.querySelectorAll('[data-section-id]')) {"
    " if (getComputedStyle(el).position === 'static') el.style.position = 'relative';"
    " const id = encodeURIComponent(el.dataset.sectionId);"
    " const probe = (kind, css) => { const a = document.createElement('a');"
    f" a.href = '{_PROBE_HOST}' + kind + '/' + id; a.setAttribute('aria-hidden', 'true');"
    " a.style.cssText = 'position:absolute;display:block;left:0;width:100%;' + css;"
    " el.appendChild(a); };"
    " probe('s', 'top:0;height:100%;'); probe('e', 'bottom:0;height:1px;'); }"
    " return true; }"
)


@dataclass
class PreviewPage:
    data_url: str
    width: int
    height: int


@dataclass
class PreviewSection:
    id: str
    kind: str
    page: int
    x: float
    y: float
    w: float
    h: float


@dataclass
class PreviewResult:
    pages: list[PreviewPage]
    page_count: int
    sections: list[PreviewSection]
    truncated: bool
    unsupported_characters: list[str] = field(default_factory=list)
    # Set only when the style asks to fit to one page.
    fit: FitResult | None = None
    last_page_fill: float = 0.0
    advice: LengthAdvice | None = None


def encode_webp(pixmap: fitz.Pixmap, quality: int) -> bytes:
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    out = io.BytesIO()
    image.save(out, format="WEBP", quality=quality, method=2)
    return out.getvalue()


def _fraction(value: float) -> float:
    return round(min(max(value, 0.0), 1.0), 4)


def section_rectangles(
    document: fitz.Document, kinds: dict[str, str], page_limit: int
) -> list[PreviewSection]:
    """Page-relative rectangles (fractions 0..1) of every section fragment on the first pages."""
    starts: list[tuple[int, str, fitz.Rect]] = []
    ends: dict[tuple[int, str], fitz.Rect] = {}
    for index in range(min(len(document), page_limit)):
        for link in document[index].get_links():
            uri = link.get("uri") or ""
            if not uri.startswith(_PROBE_HOST):
                continue
            kind, _, encoded = uri[len(_PROBE_HOST) :].partition("/")
            section_id = unquote(encoded)
            if kind == "s":
                starts.append((index, section_id, fitz.Rect(link["from"])))
            elif kind == "e":
                ends[(index, section_id)] = fitz.Rect(link["from"])
    result = []
    for index, section_id, rect in starts:
        page_rect = document[index].rect
        end = ends.get((index, section_id))
        bottom = end.y1 if end is not None else rect.y1
        rect = fitz.Rect(rect.x0, rect.y0, rect.x1, max(rect.y0, min(bottom, rect.y1)))
        result.append(
            PreviewSection(
                id=section_id,
                kind=kinds.get(section_id, "section"),
                page=index,
                x=_fraction((rect.x0 - page_rect.x0) / page_rect.width),
                y=_fraction((rect.y0 - page_rect.y0) / page_rect.height),
                w=_fraction(rect.width / page_rect.width),
                h=_fraction(rect.height / page_rect.height),
            )
        )
    return result


def rasterise(
    pdf: bytes,
    kinds: dict[str, str],
    *,
    dpi: int = PREVIEW_DPI,
    quality: int = WEBP_QUALITY,
    page_limit: int = MAX_PREVIEW_PAGES,
    width: int | None = None,
) -> PreviewResult:
    """Page images at ``dpi``, or ``width`` pixels wide when it is given."""
    with fitz.open(stream=pdf, filetype="pdf") as document:
        pages = []
        for index in range(min(len(document), page_limit)):
            page = document[index]
            if width:
                zoom = min(max(width, MIN_PREVIEW_WIDTH), MAX_PREVIEW_WIDTH) / page.rect.width
                pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            else:
                pixmap = page.get_pixmap(dpi=dpi, alpha=False)
            dense = width is not None and pixmap.width > HIGH_DENSITY_WIDTH
            encoded = base64.b64encode(
                encode_webp(pixmap, HIGH_DENSITY_QUALITY if dense else quality)
            ).decode("ascii")
            pages.append(
                PreviewPage(f"data:image/webp;base64,{encoded}", pixmap.width, pixmap.height)
            )
        return PreviewResult(
            pages=pages,
            page_count=len(document),
            sections=section_rectangles(document, kinds, page_limit),
            truncated=len(document) > page_limit,
        )


def render_preview(
    model: CvRenderModel,
    *,
    dpi: int = PREVIEW_DPI,
    quality: int = WEBP_QUALITY,
    width: int | None = None,
    check_cancelled: Callable[[], None] | None = None,
) -> PreviewResult:
    """Print the draft with Chromium and return its page images and section rectangles.

    ``width`` sizes the page images to the client's display (pixels); without it they are ``dpi``.
    ``check_cancelled`` runs before every render (and before rasterising) and may raise to stop.

    Raises ``CvRenderUnavailableError`` (HTTP 503 in the API) when Chromium cannot run.
    """
    check = check_cancelled or (lambda: None)
    fit = None
    if wants_fit(model):
        fit, pdf = fit_cached(
            model, prepare_script=MEASURE_SCRIPT, max_renders=PREVIEW_MAX_RENDERS,
            check_cancelled=check,
        )
    else:
        html = render_cv_html(model, page_size=str(model.tokens.get("page_size", "a4")))
        check()
        pdf = print_pdf(html, MEASURE_SCRIPT)
    check()
    kinds = {"header": "header"} | {section.id: section.kind for section in model.sections}
    result = rasterise(pdf, kinds, dpi=dpi, quality=quality, width=width)
    result.unsupported_characters = list(model.unsupported_characters)
    result.fit = fit
    manifest = load_manifest(html_template_id(model.template_id))
    result.last_page_fill = last_page_fill(pdf, manifest.margin_top_mm, manifest.margin_bottom_mm)
    result.advice = length_advice(
        result.page_count,
        result.last_page_fill,
        years_of_experience(model.sections),
        fit_one_page=wants_fit(model),
    )
    return result
