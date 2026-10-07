"""Template gallery thumbnails: page 1 of the person's own draft in every available template.

Each thumbnail is the same Chromium print as the PDF (``render_cv_html`` then ``print_pdf``),
with the draft's accent, typeface, spacing and page size, only the template swapped. Page 1
is rasterised small with PyMuPDF to WebP. Fit to one page is not applied (it is a search of
several prints per template); the thumbnail shows the template at the chosen spacing.

Cost: the templates print one after another, so a thumbnail request holds at most one of
the shared Chromium slots and the live preview always has the other. The whole request
shares one time budget; a template that fails or runs out of time gets an error marker and
the rest are still returned. Only an unavailable renderer fails the request (HTTP 503).
Nothing is stored.
"""

from __future__ import annotations

import base64
import logging
import time
from dataclasses import dataclass

import fitz

from app.schemas.cv_documents import CvStyle
from app.services.cv_chromium import ChromiumUnavailableError, print_pdf
from app.services.cv_html import available_template_ids, render_cv_html
from app.services.cv_preview import encode_webp
from app.services.cv_rendering import build_render_model
from app.services.cv_sample import sample_cv

logger = logging.getLogger(__name__)

# About 330 px wide for A4: sharp at 2x in a gallery card of up to about 165 CSS px.
THUMBNAIL_DPI = 40
THUMBNAIL_QUALITY = 60
# Under the renderer's own 15s per-print limit, so a slow request ends with what it has.
THUMBNAIL_BUDGET_SECONDS = 12.0

FAILED_MESSAGE = "This preview could not be drawn."
TIMEOUT_MESSAGE = "This preview took too long to draw."


@dataclass
class Thumbnail:
    template_id: str
    data_url: str | None = None
    width: int = 0
    height: int = 0
    pages: int = 0
    error: str | None = None


@dataclass
class ThumbnailSet:
    thumbnails: list[Thumbnail]
    # True when the CV had no entries and the built-in sample CV was drawn instead.
    sample: bool


def has_content(document) -> bool:
    """Whether the CV has at least one entry in a visible section (what the PDF would show)."""
    return any(
        section.get("visible", True) and section.get("entries") for section in document.sections
    )


def _thumbnail_style(style: CvStyle, template_id: str) -> CvStyle:
    # Every template is shown as it would print: ATS mode would force one layout and font.
    return style.model_copy(update={"template_id": template_id, "ats_mode": False})


def _render_one(document, style: CvStyle, template_id: str, timeout: float) -> Thumbnail:
    model = build_render_model(document, template_id, _thumbnail_style(style, template_id))
    html = render_cv_html(model, page_size=str(model.tokens.get("page_size", "a4")))
    pdf = print_pdf(html, timeout=timeout)
    with fitz.open(stream=pdf, filetype="pdf") as printed:
        pixmap = printed[0].get_pixmap(dpi=THUMBNAIL_DPI, alpha=False)
        encoded = base64.b64encode(encode_webp(pixmap, THUMBNAIL_QUALITY)).decode("ascii")
        return Thumbnail(
            template_id=template_id,
            data_url=f"data:image/webp;base64,{encoded}",
            width=pixmap.width,
            height=pixmap.height,
            pages=len(printed),
        )


def render_thumbnails(
    document, style: CvStyle, *, budget: float = THUMBNAIL_BUDGET_SECONDS
) -> ThumbnailSet:
    """Page 1 of ``document`` in every available template, in catalog order.

    ``document`` has ``name``, ``header`` and ``sections`` like an export source. Raises
    ``ChromiumUnavailableError`` (HTTP 503) when the renderer cannot start at all.
    """
    sample = not has_content(document)
    source = sample_cv() if sample else document
    deadline = time.monotonic() + budget
    thumbnails = []
    for template_id in available_template_ids():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            thumbnails.append(Thumbnail(template_id=template_id, error=TIMEOUT_MESSAGE))
            continue
        try:
            thumbnails.append(_render_one(source, style, template_id, remaining))
        except ChromiumUnavailableError:
            raise
        except Exception as error:
            logger.warning("cv thumbnail failed for %s: %s", template_id, type(error).__name__)
            thumbnails.append(Thumbnail(template_id=template_id, error=FAILED_MESSAGE))
    return ThumbnailSet(thumbnails=thumbnails, sample=sample)
